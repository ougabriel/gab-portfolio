# AZURE PROJECT: Enterprise data platform with Databricks Asset Bundles, ADF as code, Unity Catalog, all wired through Azure DevOps

Every Fortune 500 data team I have worked with ends up at roughly the same shape. A Databricks workspace governed by Unity Catalog, notebooks and jobs packaged with Databricks Asset Bundles (now called Declarative Automation Bundles in the latest Microsoft Learn docs but everyone still says DAB), an Azure Data Factory instance treated as code with the JSON checked into git, and Azure DevOps multi-stage pipelines doing the validate, deploy, integration test, promote dance. This walkthrough builds that pattern end-to-end on a dev workspace then promotes to prod with approvals. No portal clicks for anything that matters.

## Tools used

- Azure Databricks workspace, Premium tier (Unity Catalog needs Premium)
- Unity Catalog with the three-level namespace `catalog.schema.table`
- Databricks CLI v0.218.0 or above (DAB is a CLI feature)
- Databricks Asset Bundles (DAB) for notebook + job CI/CD
- Azure Data Factory v2 (`Microsoft.DataFactory/factories`) deployed as code
- `az datafactory` CLI for ADF resource management
- Azure DevOps multi-stage YAML pipelines
- Azure Resource Manager (ARM) templates for ADF publish
- Service principal for non-interactive auth, never PATs in CI
- Bicep for the underlying resources (storage, key vault, workspace, factory)

## Prerequisites

- Active Azure subscription with Contributor on the resource group
- Azure DevOps organization and a project, with a service connection to the subscription using workload identity federation
- An Entra ID app registration (service principal) with `Storage Blob Data Contributor` on the landing-zone storage account
- Databricks CLI installed locally for the initial `bundle init`. Check with `databricks --version`
- Azure CLI 2.60.0 or above, with the `datafactory` extension. Install with `az extension add -n datafactory`
- A git repo with two top-level folders: `/databricks` and `/adf`. The DAB config lives at `/databricks/databricks.yml`
- Resource provider registrations: `Microsoft.Databricks`, `Microsoft.DataFactory`, `Microsoft.Storage`, `Microsoft.KeyVault`

## Project Architecture

Two environments, dev and prod, each with their own Databricks workspace, ADF instance, and ADLS Gen2 storage account. Unity Catalog metastore is shared at the region level and bound to both workspaces, with separate catalogs `dev_platform` and `prod_platform` so data is isolated even though governance is unified. Notebooks live in `/databricks/src`, job definitions live in `/databricks/resources/*.yml`, ADF pipelines and linked services live in `/adf` as raw JSON. Azure DevOps runs one pipeline file `.azure-pipelines/data-platform.yml` with five stages: Validate, DeployDev, IntegrationTest, DeployProd (approval gated), Smoke.

## Step 1. Provision the base infrastructure with Bicep

Run the command to create a resource group, then use a Bicep module to lay down storage, a key vault, the Databricks workspace, and the data factory. Put this in `/infra/main.bicep`.

```bicep
targetScope = 'resourceGroup'

@allowed(['dev', 'prod'])
param env string
param location string = resourceGroup().location
param namePrefix string = 'gabdata'

var suffix = '${namePrefix}${env}'

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'sa${suffix}'
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    isHnsEnabled: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
  }
}

resource kv 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'kv-${suffix}'
  location: location
  properties: {
    sku: { family: 'A', name: 'standard' }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
  }
}

resource dbx 'Microsoft.Databricks/workspaces@2024-05-01' = {
  name: 'dbx-${suffix}'
  location: location
  sku: { name: 'premium' }
  properties: {
    managedResourceGroupId: '${subscription().id}/resourceGroups/mrg-dbx-${suffix}'
  }
}

resource adf 'Microsoft.DataFactory/factories@2018-06-01' = {
  name: 'adf-${suffix}'
  location: location
  identity: { type: 'SystemAssigned' }
  properties: {}
}

output workspaceUrl string = 'https://${dbx.properties.workspaceUrl}'
output adfName string = adf.name
output storageName string = storage.name
```

Deploy it twice, once per environment:

```bash
az group create -n rg-gabdata-dev -l uksouth
az deployment group create \
  -g rg-gabdata-dev \
  -f infra/main.bicep \
  -p env=dev

az group create -n rg-gabdata-prod -l uksouth
az deployment group create \
  -g rg-gabdata-prod \
  -f infra/main.bicep \
  -p env=prod
```

Premium SKU is non-negotiable. Unity Catalog requires it, the Standard SKU will not enable the metastore binding.

## Step 2: Enable Unity Catalog and create the catalog hierarchy

Unity Catalog is automatically enabled for any Azure Databricks workspace created after November 9, 2023, so if your workspace is fresh you only need to verify the metastore is attached and create your top-level catalogs. Open the workspace, go to the SQL editor, and run the following against a SQL warehouse.

```sql
-- Run as a Unity Catalog admin (account-level admin or metastore admin)
CREATE CATALOG IF NOT EXISTS dev_platform
COMMENT 'Dev catalog for the gabdata enterprise platform';

CREATE SCHEMA IF NOT EXISTS dev_platform.bronze
COMMENT 'Raw landing zone, append only';

CREATE SCHEMA IF NOT EXISTS dev_platform.silver
COMMENT 'Cleaned, conformed, deduped';

CREATE SCHEMA IF NOT EXISTS dev_platform.gold
COMMENT 'Business-ready facts and dims';

GRANT USE CATALOG ON CATALOG dev_platform TO `data-engineers`;
GRANT USE SCHEMA, CREATE TABLE, MODIFY ON SCHEMA dev_platform.bronze TO `data-engineers`;
GRANT SELECT ON SCHEMA dev_platform.gold TO `analytics-consumers`;
```

The three-level namespace is the whole point. Every table is addressed as `catalog.schema.table`, so a query against `dev_platform.silver.orders` is unambiguous and lineage is tracked automatically. Repeat the catalog block for `prod_platform` from a separate session, with stricter group grants.

## Step 3. Create the service principal for CI auth

Personal access tokens are fine for laptop work but they belong to a human, expire on a schedule nobody remembers, and break promotions at 3am. Use an Entra ID service principal for everything CI touches.

```bash
az ad sp create-for-rbac \
  --name "sp-gabdata-cicd" \
  --role contributor \
  --scopes /subscriptions/<sub-id>/resourceGroups/rg-gabdata-dev \
           /subscriptions/<sub-id>/resourceGroups/rg-gabdata-prod
```

Capture `appId`, `password`, and `tenant`. Add the same SP as an admin in the Databricks account console, then add it to the workspace with `workspace.admin` privileges. Inside Unity Catalog, grant the SP `USE CATALOG` and any schema-level permissions the jobs will need. Store the secret in Azure DevOps as a variable group called `gabdata-cicd` linked to the key vault `kv-gabdataprod`.

## Step 4: Author the Databricks Asset Bundle

Run `databricks bundle init` locally to generate the skeleton, then edit `/databricks/databricks.yml`. The `bundle`, `variables`, `targets`, and `resources` top-level keys are the four you actually care about.

```yaml
bundle:
  name: gabdata-platform

variables:
  workspace_host:
    description: "Databricks workspace URL"
  catalog:
    description: "Unity Catalog name for this target"
  notification_email:
    default: "ougabriel@gmail.com"

include:
  - resources/*.yml

targets:
  dev:
    mode: development
    default: true
    workspace:
      host: ${var.workspace_host}
    variables:
      workspace_host: https://adb-1234567890.azuredatabricks.net
      catalog: dev_platform
    run_as:
      service_principal_name: ${SP_APPLICATION_ID}

  prod:
    mode: production
    workspace:
      host: ${var.workspace_host}
      root_path: /Shared/.bundle/prod/${bundle.name}
    variables:
      workspace_host: https://adb-9876543210.azuredatabricks.net
      catalog: prod_platform
    run_as:
      service_principal_name: ${SP_APPLICATION_ID}
    permissions:
      - level: CAN_MANAGE
        service_principal_name: ${SP_APPLICATION_ID}
```

The `mode: development` flag tells Databricks to prefix object names with the deployer username and pause schedules; `mode: production` enforces unique paths per target and requires explicit permissions. That is the entire promotion safety net.

Now define the actual job in `/databricks/resources/ingest_job.yml`.

```yaml
resources:
  jobs:
    bronze_ingest:
      name: "[${bundle.target}] bronze_ingest"
      email_notifications:
        on_failure:
          - ${var.notification_email}
      tasks:
        - task_key: ingest_orders
          notebook_task:
            notebook_path: ../src/ingest/orders.py
            base_parameters:
              catalog: ${var.catalog}
              schema: bronze
              source_path: "abfss://landing@sa${bundle.target == 'prod' ? 'gabdataprod' : 'gabdatadev'}.dfs.core.windows.net/orders/"
          job_cluster_key: ingest_cluster
      job_clusters:
        - job_cluster_key: ingest_cluster
          new_cluster:
            spark_version: 15.4.x-scala2.12
            node_type_id: Standard_DS3_v2
            num_workers: 2
            data_security_mode: SINGLE_USER
            single_user_name: ${SP_APPLICATION_ID}
```

`data_security_mode: SINGLE_USER` is required for a cluster to access Unity Catalog tables under a service principal. Shared mode also works but blocks RDD APIs, so for an ingest job that uses Spark SQL only either is fine.

## Step 5: Write the actual notebook

Put the following into `/databricks/src/ingest/orders.py`. It reads JSON from ADLS, writes Delta into the bronze schema, and uses widgets so the bundle can pass parameters in.

```python
# Databricks notebook source
dbutils.widgets.text("catalog", "dev_platform")
dbutils.widgets.text("schema", "bronze")
dbutils.widgets.text("source_path", "")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
source_path = dbutils.widgets.get("source_path")

spark.sql(f"USE CATALOG {catalog}")
spark.sql(f"USE SCHEMA {schema}")

df = (
    spark.read.format("json")
    .option("multiLine", "true")
    .load(source_path)
)

(
    df.write.format("delta")
    .mode("append")
    .option("mergeSchema", "true")
    .saveAsTable(f"{catalog}.{schema}.orders_raw")
)

print(f"wrote {df.count()} rows to {catalog}.{schema}.orders_raw")
```

## Step 6: Validate and deploy the bundle locally first

Before wiring CI, prove the bundle works from your laptop. Run the following commands in `/databricks`:

```bash
databricks bundle validate --target dev
databricks bundle deploy --target dev
databricks bundle run bronze_ingest --target dev
```

i> `validate` checks the YAML against the bundle schema and resolves variables
ii> `deploy` uploads notebooks, registers the job in the workspace, and writes a state file under `/Workspace/Users/<you>/.bundle/`
iii> `run` triggers the job and streams logs

If the deploy fails with `PERMISSION_DENIED` on the catalog, you forgot to grant the SP `USE CATALOG`. Go back to Step 2.

## Step 7. Treat ADF as code with raw JSON

ADF stores everything as JSON under the covers, so the cleanest source-of-truth pattern is to commit the JSON directly rather than fight the visual designer's git integration. Put one file per object in `/adf`:

- `/adf/linkedServices/ls_adls_landing.json`
- `/adf/datasets/ds_orders_json.json`
- `/adf/pipelines/pl_trigger_bronze.json`

Below is the YAML for the linked service that points at the landing storage account, using managed identity for auth so there are no secrets in the JSON.

```json
{
  "name": "ls_adls_landing",
  "properties": {
    "type": "AzureBlobFS",
    "typeProperties": {
      "url": "https://sagabdatadev.dfs.core.windows.net"
    },
    "annotations": []
  }
}
```

And the pipeline that calls the Databricks job, taken straight from the activity-JSON shape Microsoft documents at `concepts-pipelines-activities`:

```json
{
  "name": "pl_trigger_bronze",
  "properties": {
    "description": "Kick off the bronze_ingest DAB job after landing files arrive",
    "activities": [
      {
        "name": "RunDatabricksJob",
        "type": "DatabricksNotebook",
        "linkedServiceName": {
          "referenceName": "ls_databricks_workspace",
          "type": "LinkedServiceReference"
        },
        "typeProperties": {
          "notebookPath": "/Workspace/Shared/.bundle/dev/gabdata-platform/files/src/ingest/orders.py",
          "baseParameters": {
            "catalog": "dev_platform",
            "schema": "bronze",
            "source_path": "abfss://landing@sagabdatadev.dfs.core.windows.net/orders/"
          }
        },
        "policy": {
          "timeout": "01:00:00",
          "retry": 1,
          "retryIntervalInSeconds": 60,
          "secureOutput": false
        }
      }
    ],
    "concurrency": 1,
    "annotations": ["bronze", "ingest"]
  }
}
```

Activity policy `timeout`, `retry`, `retryIntervalInSeconds`, and `secureOutput` are the four properties you almost always want to set explicitly. Default timeout is 12 hours and that is rarely what you actually want.

## Step 8: Wire everything into one Azure DevOps pipeline

Create `.azure-pipelines/data-platform.yml` at the repo root. Five stages, two environments, one approval gate before prod.

```yaml
trigger:
  branches:
    include: [main]

variables:
  - group: gabdata-cicd
  - name: DATABRICKS_CLI_VERSION
    value: '0.235.0'

stages:
- stage: Validate
  jobs:
  - job: validate_bundle
    pool: { vmImage: 'ubuntu-latest' }
    steps:
    - bash: |
        curl -fsSL https://raw.githubusercontent.com/databricks/setup-cli/main/install.sh | sh
        databricks --version
      displayName: 'Install Databricks CLI'
    - bash: |
        cd databricks
        databricks bundle validate --target dev
      env:
        DATABRICKS_HOST: $(DATABRICKS_HOST_DEV)
        DATABRICKS_CLIENT_ID: $(SP_APPLICATION_ID)
        DATABRICKS_CLIENT_SECRET: $(SP_CLIENT_SECRET)
        DATABRICKS_AZURE_TENANT_ID: $(AZ_TENANT_ID)
      displayName: 'databricks bundle validate'

- stage: DeployDev
  dependsOn: Validate
  jobs:
  - deployment: deploy_dev
    environment: 'gabdata-dev'
    pool: { vmImage: 'ubuntu-latest' }
    strategy:
      runOnce:
        deploy:
          steps:
          - bash: |
              curl -fsSL https://raw.githubusercontent.com/databricks/setup-cli/main/install.sh | sh
              cd databricks
              databricks bundle deploy --target dev
            env:
              DATABRICKS_HOST: $(DATABRICKS_HOST_DEV)
              DATABRICKS_CLIENT_ID: $(SP_APPLICATION_ID)
              DATABRICKS_CLIENT_SECRET: $(SP_CLIENT_SECRET)
              DATABRICKS_AZURE_TENANT_ID: $(AZ_TENANT_ID)
            displayName: 'databricks bundle deploy dev'

          - task: AzureCLI@2
            displayName: 'Deploy ADF objects via az datafactory'
            inputs:
              azureSubscription: 'sc-gabdata'
              scriptType: bash
              scriptLocation: inlineScript
              inlineScript: |
                az extension add -n datafactory --yes
                FACTORY=adf-gabdatadev
                RG=rg-gabdata-dev

                for f in adf/linkedServices/*.json; do
                  NAME=$(basename "$f" .json)
                  az datafactory linked-service create \
                    --factory-name "$FACTORY" -g "$RG" \
                    --linked-service-name "$NAME" \
                    --properties @"$f"
                done

                for f in adf/datasets/*.json; do
                  NAME=$(basename "$f" .json)
                  az datafactory dataset create \
                    --factory-name "$FACTORY" -g "$RG" \
                    --dataset-name "$NAME" \
                    --properties @"$f"
                done

                for f in adf/pipelines/*.json; do
                  NAME=$(basename "$f" .json)
                  az datafactory pipeline create \
                    --factory-name "$FACTORY" -g "$RG" \
                    --name "$NAME" \
                    --pipeline @"$f"
                done

- stage: IntegrationTest
  dependsOn: DeployDev
  jobs:
  - job: smoke
    pool: { vmImage: 'ubuntu-latest' }
    steps:
    - bash: |
        curl -fsSL https://raw.githubusercontent.com/databricks/setup-cli/main/install.sh | sh
        cd databricks
        databricks bundle run bronze_ingest --target dev
      env:
        DATABRICKS_HOST: $(DATABRICKS_HOST_DEV)
        DATABRICKS_CLIENT_ID: $(SP_APPLICATION_ID)
        DATABRICKS_CLIENT_SECRET: $(SP_CLIENT_SECRET)
        DATABRICKS_AZURE_TENANT_ID: $(AZ_TENANT_ID)
      displayName: 'Run bronze_ingest end-to-end'

    - task: AzureCLI@2
      displayName: 'Trigger ADF pipeline and wait'
      inputs:
        azureSubscription: 'sc-gabdata'
        scriptType: bash
        scriptLocation: inlineScript
        inlineScript: |
          RUN_ID=$(az datafactory pipeline create-run \
            --factory-name adf-gabdatadev -g rg-gabdata-dev \
            --name pl_trigger_bronze --query runId -o tsv)
          echo "Started run $RUN_ID"
          for i in {1..30}; do
            STATUS=$(az datafactory pipeline-run show \
              --factory-name adf-gabdatadev -g rg-gabdata-dev \
              --run-id "$RUN_ID" --query status -o tsv)
            echo "status=$STATUS"
            if [ "$STATUS" = "Succeeded" ]; then exit 0; fi
            if [ "$STATUS" = "Failed" ] || [ "$STATUS" = "Cancelled" ]; then exit 1; fi
            sleep 30
          done
          exit 1

- stage: DeployProd
  dependsOn: IntegrationTest
  jobs:
  - deployment: deploy_prod
    environment: 'gabdata-prod'
    pool: { vmImage: 'ubuntu-latest' }
    strategy:
      runOnce:
        deploy:
          steps:
          - bash: |
              curl -fsSL https://raw.githubusercontent.com/databricks/setup-cli/main/install.sh | sh
              cd databricks
              databricks bundle deploy --target prod
            env:
              DATABRICKS_HOST: $(DATABRICKS_HOST_PROD)
              DATABRICKS_CLIENT_ID: $(SP_APPLICATION_ID)
              DATABRICKS_CLIENT_SECRET: $(SP_CLIENT_SECRET)
              DATABRICKS_AZURE_TENANT_ID: $(AZ_TENANT_ID)

          - task: AzureCLI@2
            inputs:
              azureSubscription: 'sc-gabdata-prod'
              scriptType: bash
              scriptLocation: inlineScript
              inlineScript: |
                az extension add -n datafactory --yes
                for f in adf/pipelines/*.json; do
                  NAME=$(basename "$f" .json)
                  az datafactory pipeline create \
                    --factory-name adf-gabdataprod -g rg-gabdata-prod \
                    --name "$NAME" --pipeline @"$f"
                done
```

The `environment: 'gabdata-prod'` line is where you wire the approval. In Azure DevOps, go to Pipelines > Environments > gabdata-prod > Approvals and Checks, add yourself or a release manager as a required approver. The pipeline pauses there until someone clicks approve.

## Step 9: Verify lineage and audit in Unity Catalog

Once a job has run, open Catalog Explorer in the workspace, drill into `dev_platform.bronze.orders_raw`, and switch to the Lineage tab. You should see the notebook path, the job run id, and the ADLS source location automatically populated. No instrumentation, no OpenLineage agent. Unity Catalog tracks it because the table was written from a UC-enabled cluster.

For audit, query the system table:

```sql
SELECT event_time, user_identity.email, action_name, request_params
FROM system.access.audit
WHERE event_time > current_timestamp() - INTERVAL 1 DAY
  AND service_name = 'unityCatalog'
ORDER BY event_time DESC
LIMIT 100;
```

This is the single most useful query for working out who ran what against which table when something goes sideways at quarter end.

## Step 10. Cost notes on cluster types

Three cluster shapes show up in this design:

- Job clusters (`new_cluster` in the DAB job definition) spin up per run and tear down at the end. Cheapest per workload, slowest cold start, perfect for scheduled ingest
- All-purpose clusters are interactive and persist. Used by analysts in notebooks. Roughly 3x the DBU rate of a job cluster, so never point a scheduled job at one
- SQL warehouses (Serverless or Pro) for the SQL editor and BI tools. Serverless has a sub-second start but a higher per-DBU rate. Worth it for ad-hoc analysts, not worth it for nightly jobs

`Standard_DS3_v2` is the smallest node that still fits a respectable JVM heap. For ingest jobs that move a few GB per run it is the right default. For silver-to-gold transforms touching billions of rows, move up to `Standard_E8s_v5` (memory optimized) and let the autoscaler handle the rest.

## Troubleshooting

- `INVALID_PARAMETER_VALUE: Catalog 'dev_platform' does not exist`. The SP can authenticate but cannot see Unity Catalog. Grant `USE CATALOG` to the SP at the metastore admin level. Workspace admin is not enough
- `databricks bundle deploy` hangs at `Uploading bundle files`. Usually the workspace files feature is off. Databricks Runtime 11.3 LTS and above ships it enabled by default; older workspaces need an admin to flip it on
- ADF `az datafactory pipeline create` returns `LinkedServiceReferenceNotFound`. You uploaded pipelines before linked services. The order in the bash loop in Step 8 (linkedServices, then datasets, then pipelines) is deliberate, keep it
- DAB deploy succeeds but the prod job runs as your username instead of the SP. The `run_as` block was not set, or it points at a SP that has not been added to the workspace yet. Add the SP under Settings > Identity and access > Service principals
- Audit query returns nothing. The `system.access.audit` table is opt-in per metastore. An account admin enables it with `ALTER METASTORE SET PROPERTIES ('system_schemas.access' = 'enabled')`

## Clean up

If this is a learning subscription rather than a production one, tear it all down with:

```bash
az group delete -n rg-gabdata-dev --yes --no-wait
az group delete -n rg-gabdata-prod --yes --no-wait
az ad sp delete --id <appId-from-step-3>
```

The managed resource groups `mrg-dbx-*` go with the workspace, but key vault soft-delete will hold the vault name for 90 days. Purge it explicitly if you want to reuse the name.

If you have followed carefully you must have noticed we only wired the bronze layer; the silver and gold jobs are exactly the same shape, just different notebook paths and different schemas in the DAB resources file. Add one `resources/silver_job.yml` and `resources/gold_job.yml`, point them at the next layer of notebooks, and the same pipeline picks them up automatically because of the `include: resources/*.yml` line in `databricks.yml`. The ADF pipeline gets one extra activity per layer, chained with `dependsOn: [{activity: RunDatabricksJob, dependencyConditions: ['Succeeded']}]`. That is the whole pattern, and once it is in place a new dataset is two files and a PR away from running in prod.

#azure #azuredevops #databricks #adf #unitycatalog #dataengineering #devops #cicdproject #fortune500 #seniordataengineer
