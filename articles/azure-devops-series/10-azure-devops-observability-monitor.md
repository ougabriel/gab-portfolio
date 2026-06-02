# Pipeline observability: log analytics for Azure DevOps + Azure Monitor for the apps you ship

A pipeline that goes red at 02:00 is only useful if you can answer two questions inside five minutes: which stage broke, and did the broken stage actually reach production. Most teams stop at the first question, because the Azure DevOps run page shows the failed step. The second is harder. It needs build telemetry from Azure DevOps, runtime telemetry from `Azure Monitor`, and code-level traces from `Application Insights` sitting in one `Log Analytics workspace` so a single Kusto query can correlate them.

Here is how I wired both layers for an AKS workload deployed by a multi-stage YAML pipeline, with alert rules that fire when the deploy stage fails or the resulting pod throws 5xx in production.

### STEPS

1. Provision the shared `Log Analytics workspace` and `Application Insights` resource
2. Enable Container Insights on the AKS cluster and bind it to the workspace
3. Stream Azure DevOps pipeline run telemetry into Log Analytics
4. Instrument the app with `Application Insights` and OpenTelemetry
5. Build correlation queries in KQL across pipeline runs and pod logs
6. Wire Azure Monitor alert rules for failed deployments and runtime 5xx spikes

## Why this matters

The Azure DevOps run history retains pipeline logs for 30 days by default, fine for a sprint retro and useless for a quarterly incident review. `Log Analytics` keeps the same data for as long as you pay for retention (up to 12 years on the Analytics tier), and Kusto joins it against AKS pod logs, Azure Resource Manager activity logs, and `Application Insights` traces in one query. One query plane across build and runtime is the point.

There is a second payoff. When a release fails, the Azure DevOps UI tells you the task that broke. It does not tell you whether the previous successful release of the same artifact is currently degraded in production. Wiring both layers into one workspace makes that join trivial.

## Prerequisites

- An Azure subscription with `Owner` or `User Access Administrator` rights on the target resource group, because Container Insights onboarding creates role assignments
- An Azure DevOps organisation where you sit in the `Project Administrators` group (the doc page lists this group explicitly as the prerequisite for managing service connection security)
- An existing AKS cluster running Kubernetes 1.27 or later, with `kubectl` access from your workstation
- `az` CLI version 2.61.0 or later, with the `aks-preview` and `application-insights` extensions installed
- A workload identity federated credential, or at minimum an Azure Resource Manager service connection on the project, so the pipeline can authenticate to Azure without storing a secret

NOTE: IF YOU ARE STILL USING THE CLASSIC RELEASE PIPELINES UI, THE DIAGNOSTIC EVENT SCHEMA IS DIFFERENT. THIS ARTICLE ASSUMES MULTI-STAGE YAML PIPELINES THROUGHOUT.

## Tools Used

**Azure Monitor:** Microsoft's unified observability service. It collects metrics, logs, traces and events from Azure and hybrid sources, and it is the umbrella product that contains Log Analytics, Application Insights, Container Insights and alert rules.

**Log Analytics workspace:** the storage and query plane for log and trace data. Data lives in tables (`ContainerLogV2`, `AppTraces`, `AzureActivity`), queried with Kusto Query Language (KQL).

**Azure Monitor workspace:** a separate resource type from `Log Analytics workspace`, optimised for Prometheus and OpenTelemetry metrics, queried with PromQL. Confusing name overlap, distinct resource.

**Container Insights:** the Azure Monitor feature that collects stdout/stderr container logs, Kubernetes events, and inventory data from AKS via a containerised `Azure Monitor agent` deployed as a DaemonSet (`ama-logs`).

**Application Insights:** the APM feature of Azure Monitor. Auto-instruments .NET, Node, Java, Python via OpenTelemetry distros, surfaces distributed traces and dependency maps.

**Azure DevOps audit streaming:** a built-in feature that pushes Azure DevOps audit events into a destination, including a Log Analytics workspace, so pipeline run completions become queryable rows.

**Azure Monitor alert rules:** the rule engine that evaluates metric or log queries on a schedule and fires through `Action groups`. We use log search alerts here because pipeline failures arrive as discrete log rows, not metric points.

## Step 1: Provision the shared workspace and Application Insights

We put both resources in the same resource group as the AKS cluster so the billing rolls up neatly and the `Microsoft.Insights/components` resource can target the workspace by ARM ID.

```bash
RG=rg-platform-obs-uksouth
LOC=uksouth
WS_NAME=law-platform-obs
AI_NAME=appi-orders-prod

az group create --name $RG --location $LOC

az monitor log-analytics workspace create \
  --resource-group $RG \
  --workspace-name $WS_NAME \
  --location $LOC \
  --sku PerGB2018 \
  --retention-time 90

WS_ID=$(az monitor log-analytics workspace show \
  --resource-group $RG \
  --workspace-name $WS_NAME \
  --query id -o tsv)

az monitor app-insights component create \
  --app $AI_NAME \
  --location $LOC \
  --resource-group $RG \
  --workspace $WS_ID \
  --kind web
```

Two details worth pinning down. First, `--sku PerGB2018` is the only commitment-tier-eligible SKU for new workspaces; the older `Free` and `Standalone` SKUs cannot be created. Second, passing `--workspace $WS_ID` to `az monitor app-insights component create` puts Application Insights into workspace-based mode. Classic Application Insights is on a retirement path. Do not create new classic resources.

NOTE: RETENTION OVER 90 DAYS COSTS EXTRA PER GB PER MONTH. CHECK THE PRICING CALCULATOR BEFORE SETTING `--retention-time 730` JUST BECAUSE YOU CAN.

## Step 2: Enable Container Insights on AKS

Container Insights gives us the `ContainerLogV2` and `KubeEvents` tables. The Microsoft Learn page describes it as the service that uses a containerised `Azure Monitor agent` to collect stdout/stderr logs and Kubernetes events from each node, which is exactly what we join against pipeline runs.

```bash
AKS_NAME=aks-orders-prod

az aks enable-addons \
  --resource-group $RG \
  --name $AKS_NAME \
  --addons monitoring \
  --workspace-resource-id $WS_ID
```

The `monitoring` addon is the official name Microsoft uses for the Container Insights addon. After it lands, the cluster runs the `ama-logs` DaemonSet in the `kube-system` namespace. Verify:

```bash
kubectl get ds -n kube-system ama-logs
kubectl get configmap -n kube-system container-azm-ms-agentconfig -o yaml
```

If the `container-azm-ms-agentconfig` ConfigMap is not present, the agent runs with defaults. To filter noisy namespaces, apply the ConfigMap from the Microsoft Learn samples and restart the DaemonSet pods.

### 2.1 Collect control plane logs

The addon only collects pod-level data. AKS control plane logs (`kube-apiserver`, `kube-controller-manager`, `kube-scheduler`, `cluster-autoscaler`) ship through a diagnostic setting on the AKS resource itself.

```bash
AKS_ID=$(az aks show -g $RG -n $AKS_NAME --query id -o tsv)

az monitor diagnostic-settings create \
  --name aks-controlplane-to-law \
  --resource $AKS_ID \
  --workspace $WS_ID \
  --logs '[
    {"category":"kube-apiserver","enabled":true},
    {"category":"kube-controller-manager","enabled":true},
    {"category":"kube-scheduler","enabled":true},
    {"category":"kube-audit-admin","enabled":true},
    {"category":"cluster-autoscaler","enabled":true}
  ]' \
  --metrics '[{"category":"AllMetrics","enabled":true}]'
```

Skip `kube-audit` (full audit) unless you actually need every read. It is the single most expensive AKS log category and `kube-audit-admin` covers the write events that matter for incident review.

## Step 3: Stream Azure DevOps pipeline telemetry into Log Analytics

There are two routes here, and they answer different questions.

Route A is **Azure DevOps audit streaming**. Set up at `Azure DevOps > Organization settings > Auditing > Streams > New stream > Azure Monitor Logs`. Point it at the same workspace. Audit events land in the `AzureDevOpsAuditing` table, including pipeline run completions, service connection authorisations, and permission changes.

Route B is **a final pipeline job that posts the run summary to Log Analytics via the HTTP Data Collector API**. This is the route I use, because the audit stream is delayed by up to 15 minutes and does not include task-level failure details.

Here is the YAML stage. It runs after every other stage, with `condition: always()` so it captures failures too.

```yaml
- stage: Telemetry
  displayName: Ship run telemetry to Log Analytics
  dependsOn:
    - Build
    - Deploy
  condition: always()
  jobs:
    - job: PostRunSummary
      pool:
        vmImage: ubuntu-latest
      steps:
        - task: AzureCLI@2
          displayName: Post run row to Log Analytics
          inputs:
            azureSubscription: sc-platform-obs
            scriptType: bash
            scriptLocation: inlineScript
            inlineScript: |
              set -euo pipefail
              WS_KEY=$(az monitor log-analytics workspace get-shared-keys \
                --resource-group $(rgName) \
                --workspace-name $(wsName) \
                --query primarySharedKey -o tsv)

              WS_GUID=$(az monitor log-analytics workspace show \
                --resource-group $(rgName) \
                --workspace-name $(wsName) \
                --query customerId -o tsv)

              BODY=$(jq -nc \
                --arg buildId "$(Build.BuildId)" \
                --arg pipeline "$(Build.DefinitionName)" \
                --arg result  "$(Agent.JobStatus)" \
                --arg branch  "$(Build.SourceBranchName)" \
                --arg commit  "$(Build.SourceVersion)" \
                --arg repo    "$(Build.Repository.Name)" \
                '{BuildId:$buildId,Pipeline:$pipeline,Result:$result,Branch:$branch,Commit:$commit,Repo:$repo}')

              DATE=$(date -u +"%a, %d %b %Y %H:%M:%S GMT")
              CONTENT_LEN=$(printf '%s' "$BODY" | wc -c)
              STRING_TO_SIGN="POST\n${CONTENT_LEN}\napplication/json\nx-ms-date:${DATE}\n/api/logs"
              DECODED_KEY=$(printf '%s' "$WS_KEY" | base64 -d | xxd -p -c 256)
              SIG=$(printf '%s' "$STRING_TO_SIGN" \
                | openssl dgst -sha256 -mac HMAC -macopt hexkey:"$DECODED_KEY" -binary \
                | base64)

              curl -sS -X POST \
                "https://${WS_GUID}.ods.opinsights.azure.com/api/logs?api-version=2016-04-01" \
                -H "Content-Type: application/json" \
                -H "Log-Type: PipelineRuns" \
                -H "x-ms-date: ${DATE}" \
                -H "Authorization: SharedKey ${WS_GUID}:${SIG}" \
                --data "$BODY"
```

That writes one row per run into the custom `PipelineRuns_CL` table. `$(Agent.JobStatus)` evaluates to `Succeeded`, `SucceededWithIssues`, `Failed`, or `Canceled`, which is the field every later query pivots on.

NOTE: THE HTTP DATA COLLECTOR API IS ON A DEPRECATION PATH AND WILL BE REPLACED BY THE LOGS INGESTION API WITH DATA COLLECTION RULES. THE BODY SHAPE IS THE SAME, BUT THE AUTH MOVES TO ENTRA ID. PLAN A MIGRATION INSIDE THE NEXT 12 MONTHS.

## Step 4: Instrument the app with Application Insights

The app side uses the Azure Monitor OpenTelemetry distro. For a Python FastAPI service:

```python
from azure.monitor.opentelemetry import configure_azure_monitor
from opentelemetry.trace import get_tracer
from fastapi import FastAPI

configure_azure_monitor(
    connection_string=os.environ["APPLICATIONINSIGHTS_CONNECTION_STRING"],
    enable_live_metrics=True,
)

tracer = get_tracer(__name__)
app = FastAPI()

@app.get("/orders/{order_id}")
def get_order(order_id: str):
    with tracer.start_as_current_span("get_order") as span:
        span.set_attribute("order.id", order_id)
        return repo.fetch(order_id)
```

Pass the connection string into the pod via Kubernetes secret, sourced from the Application Insights resource:

```bash
AI_CONN=$(az monitor app-insights component show \
  --app $AI_NAME \
  --resource-group $RG \
  --query connectionString -o tsv)

kubectl create secret generic appi-conn \
  --from-literal=APPLICATIONINSIGHTS_CONNECTION_STRING="$AI_CONN" \
  -n orders
```

Because the workspace is shared, distributed traces in `AppTraces`, `AppDependencies`, and `AppRequests` sit in the same store as the Container Insights `ContainerLogV2` rows. That is what lets the next step work.

## Step 5: Build correlation queries in KQL

This is the join I open at 02:00 when a deploy fails. It pulls the last deploy result for a pipeline, then the pod restart and 5xx counts for the next 30 minutes.

```kusto
let pipelineName = "orders-api-prod";
let recent =
    PipelineRuns_CL
    | where TimeGenerated > ago(2h)
    | where Pipeline_s == pipelineName
    | summarize arg_max(TimeGenerated, *) by BuildId_s
    | project DeployTime=TimeGenerated, BuildId_s, Result_s, Commit_s;
recent
| join kind=leftouter (
    KubePodInventory
    | where Namespace == "orders"
    | summarize Restarts=sum(PodRestartCount) by bin(TimeGenerated, 5m)
    ) on $left.DeployTime == $right.TimeGenerated
| join kind=leftouter (
    AppRequests
    | where Success == false and ResultCode startswith "5"
    | summarize Failures=count() by bin(TimeGenerated, 5m)
    ) on $left.DeployTime == $right.TimeGenerated
| project DeployTime, BuildId_s, Commit_s, Result_s, Restarts, Failures
| order by DeployTime desc
```

Save it as a function (`workspace > Functions > Save as function`) with alias `LastDeployHealth`. Now any analyst can call `LastDeployHealth` from a workbook tile or an alert query.

## Step 6: Wire Azure Monitor alert rules

Two rules cover the failure modes that actually wake a human.

### 6.1 Failed deployment alert

A log search alert against the `PipelineRuns_CL` table, scoped to the workspace.

```bash
ACTION_GROUP_ID=$(az monitor action-group create \
  --name ag-platform-oncall \
  --resource-group $RG \
  --short-name plat-oc \
  --action email primary ougabriel@gmail.com \
  --query id -o tsv)

az monitor scheduled-query create \
  --name alert-pipeline-deploy-failed \
  --resource-group $RG \
  --scopes $WS_ID \
  --condition "count 'PipelineRuns_CL | where Result_s == \"Failed\" and Pipeline_s endswith \"-prod\"' > 0" \
  --condition-query "PipelineRuns_CL | where Result_s == \"Failed\" and Pipeline_s endswith \"-prod\"" \
  --evaluation-frequency 5m \
  --window-size 5m \
  --severity 2 \
  --action $ACTION_GROUP_ID \
  --description "Production pipeline deploy stage failed"
```

### 6.2 Runtime 5xx spike alert

A second rule on the same workspace, this time against `AppRequests`, fires when the production app starts returning 5xx at over 1% of traffic for 10 minutes.

```bash
az monitor scheduled-query create \
  --name alert-orders-api-5xx-spike \
  --resource-group $RG \
  --scopes $WS_ID \
  --condition-query "AppRequests | where AppRoleName == 'orders-api' | summarize total=count(), failed=countif(Success == false and ResultCode startswith '5') by bin(TimeGenerated, 5m) | extend rate = todouble(failed)/todouble(total) | where rate > 0.01" \
  --condition "count 'AppRequests | where AppRoleName == \"orders-api\" | summarize total=count(), failed=countif(Success == false and ResultCode startswith \"5\") by bin(TimeGenerated, 5m) | extend rate = todouble(failed)/todouble(total) | where rate > 0.01' > 0" \
  --evaluation-frequency 5m \
  --window-size 10m \
  --severity 1 \
  --action $ACTION_GROUP_ID \
  --description "orders-api 5xx rate above 1% for 10 minutes"
```

Severity 1 because a 1% sustained 5xx rate on a checkout service is a real incident, not a warning. Severity scales 0 (critical) to 4 (verbose), and the `Action group` payload format is identical across both rules so the on-call runbook can stay one document.

## Troubleshooting

**`ama-logs` pods are in `CrashLoopBackOff` after enabling the addon.** Almost always a workspace permissions issue. The addon creates a Managed Identity assignment on the workspace; if the cluster identity lost that assignment (common after a workspace rebuild), re-run `az aks enable-addons --addons monitoring --workspace-resource-id $WS_ID`. The command is idempotent and re-grants the role.

**`PipelineRuns_CL` table never appears in Log Analytics.** Custom tables created via the HTTP Data Collector API take up to 24 hours to show in the schema browser, even if rows are landing. Query the table directly by name (`PipelineRuns_CL | take 10`) to confirm rows are arriving. If the query returns empty, check the `AzureDiagnostics` table for `Resource=LOGANALYTICSAPI` error rows.

**The alert query runs in Log Analytics but never fires.** Scheduled query alerts run as the alert rule's identity, not your user. If you used a custom table, grant the alert rule's system-assigned identity the `Log Analytics Reader` role on the workspace. Without it, the query returns zero rows silently.

**Application Insights shows requests but no dependency traces.** The Python distro auto-instruments `requests`, `httpx`, and `urllib3`, but not every database driver. If you use `pymongo` or `redis-py`, the OpenTelemetry instrumentation packages (`opentelemetry-instrumentation-pymongo`, `opentelemetry-instrumentation-redis`) ship separately. Install them in the same image and the dependency map populates inside one minute.

**Audit stream to Log Analytics shows pipeline runs but no commit SHA.** The `AzureDevOpsAuditing` table records the run as an `Pipelines.PipelineRunCompleted` action, but the commit goes into the `Data` JSON column rather than a top-level field. Use `parse_json(Data).sourceVersion` in KQL to extract it.

## Clean up

If you tore this down for a lab, the order matters because Application Insights holds a soft reference to the workspace.

```bash
az monitor scheduled-query delete -g $RG -n alert-pipeline-deploy-failed -y
az monitor scheduled-query delete -g $RG -n alert-orders-api-5xx-spike -y
az monitor action-group delete -g $RG -n ag-platform-oncall
az monitor app-insights component delete -g $RG -a $AI_NAME
az aks disable-addons -g $RG -n $AKS_NAME --addons monitoring
az monitor log-analytics workspace delete -g $RG -n $WS_NAME --force true --yes
```

The `--force true` flag bypasses the soft-delete window, which is two weeks by default. If you plan to recreate with the same name inside that window, omit the flag and use `az monitor log-analytics workspace recover` instead.

That is the build. Two layers, one workspace, one KQL plane, two alert rules. The next pipeline failure will still wake somebody up, but the question of whether prod is degraded gets answered before the laptop finishes booting.
