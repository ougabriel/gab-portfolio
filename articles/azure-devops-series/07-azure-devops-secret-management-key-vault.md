# Secret management for Azure DevOps pipelines with Key Vault and variable groups

The pipeline that leaked a production database password in plain text logs last quarter was a stock Azure DevOps YAML file with a `script:` step that printed `$env:DB_PASS` into build output. The author thought a secret variable in the pipeline UI meant "encrypted everywhere". It does not. Secret pipeline variables are only masked at output time, and only if Azure Pipelines recognises the value. The moment a script transforms the value (base64, JSON, substring), the mask falls off.

This is the build I shipped to fix that class of problem. Three storage options exist for secrets in Azure DevOps. Ranked worst to best: pipeline secret variables (last resort), variable groups linked to Azure Key Vault (good for stable secrets), and the `AzureKeyVault@2` task reading at run time (best for high-churn secrets). The rest walks through wiring each up, setting the access model on Key Vault, masking, audit, and rotation.

### STEPS

1. Create the Key Vault and add a secret
2. Set up authentication via a managed identity or service principal
3. Configure Key Vault access (RBAC or access policy)
4. Create the Azure Resource Manager service connection
5. Link a variable group to the Key Vault
6. Pull secrets at run time with the `AzureKeyVault@2` task
7. Wire up masking, audit, and rotation

## Why this matters

Pipeline secrets sit at the intersection of three risks. Build agents are ephemeral and shared, so any secret on the agent disk is a smear of trust. Pipeline YAML lives in source control, so any secret embedded in YAML is a leak. Pipeline logs are visible to anyone with read access on the pipeline, so any echoed secret is a leak too.

Key Vault solves the storage problem. The data plane sits behind Microsoft Entra ID with auditable role assignments, soft delete keeps deleted secrets recoverable for 7 to 90 days, and purge protection blocks authenticated deletes during the retention window. Pulling secrets at run time, scoped to a single job, with an audit row in Key Vault diagnostic logs for every `Get`, gives you a clean answer to "who read this secret, when, and from which pipeline run".

## Prerequisites

- An Azure DevOps organisation and project where you can create pipelines and service connections. If you need one, follow [Create a project](https://learn.microsoft.com/en-us/azure/devops/organizations/projects/create-project).
- An Azure subscription with rights to create a resource group, a Key Vault, and a managed identity.
- Azure CLI version `2.30.0` or higher with the `azure-devops` extension installed. The variable group commands require it.
- A user account that already has `Owner` or `User Access Administrator` on the target subscription. You need this to create role assignments or access policies on the Key Vault.
- A Microsoft-hosted agent pool (`ubuntu-latest` is fine) or a self-hosted agent that can reach `*.vault.azure.net`.

## Tools Used

**Azure DevOps:** the build and release plane. We use multi-stage YAML pipelines stored alongside the application code.

**Azure Key Vault:** the secret store. Vaults hold software-protected and HSM-backed keys, secrets, and certificates.

**`AzureKeyVault@2`:** the pipeline task that pulls secrets from a vault into the running job as secret pipeline variables. Version 2 supports workload identity federation.

**Variable groups (Library):** named bags of variables you reference from YAML with `- group: <name>`. A group can be Key Vault-backed, in which case variable names mirror secret names and values pull at queue time.

**Azure Resource Manager service connection:** the Microsoft Entra ID-backed credential the pipeline uses to talk to Azure.

**Managed identity:** the Microsoft Entra ID identity attached to an Azure resource. We use a user-assigned one so it survives pipeline rewrites.

## Step 1: Create the Key Vault and add a secret

Open the Azure portal, then `Azure portal > Cloud Shell` from the top right. The Cloud Shell already has `az` authenticated. If you have multiple subscriptions, pin the right one first.

```azurecli
az account set --subscription <SUBSCRIPTION_ID>
az config set defaults.location=uksouth

az group create --name rg-pipeline-secrets-prod

az keyvault create \
  --name kv-pipelines-prod-uks \
  --resource-group rg-pipeline-secrets-prod \
  --enable-rbac-authorization true \
  --enable-purge-protection true \
  --retention-days 90
```

Flags worth calling out. `--enable-rbac-authorization true` flips the vault to the Azure RBAC permission model instead of legacy access policies. Microsoft now recommends RBAC for new vaults. `--enable-purge-protection true` is irreversible: once on, nobody (not even a subscription owner) can permanently delete a secret during the retention window. `--retention-days 90` is the soft delete retention, settable between 7 and 90 days at creation time only.

Add a test secret:

```azurecli
az keyvault secret set \
  --vault-name kv-pipelines-prod-uks \
  --name DbConnectionString \
  --value "Server=tcp:prod-sql.database.windows.net;Database=app;..."
```

The secret name uses PascalCase with no dashes. Pipeline variables are case-insensitive on Windows agents and case-sensitive on Linux agents, so pick a convention.

NOTE: KEY VAULT SECRET NAMES MAY ONLY CONTAIN ALPHANUMERICS AND THE DASH CHARACTER. WHEN THE `AzureKeyVault@2` TASK MAPS A SECRET WITH A DASH INTO A PIPELINE VARIABLE, IT REPLACES THE DASH WITH A DOT. SO `db-pass` BECOMES `$(db.pass)`, NOT `$(db-pass)`. THIS IS THE SINGLE MOST COMMON CAUSE OF "VARIABLE NOT FOUND" ERRORS WITH THIS TASK.

## Step 2: Create a user-assigned managed identity

Service principals with client secrets are the old shape: they expire, they leak, they end up in `.env` files. Workload identity federation against a user-assigned managed identity is the recommended pattern.

```azurecli
az identity create \
  --name id-pipeline-secrets \
  --resource-group rg-pipeline-secrets-prod
```

Capture the three values you need for the service connection:

```azurecli
az identity show \
  --name id-pipeline-secrets \
  --resource-group rg-pipeline-secrets-prod \
  --query "{clientId:clientId, principalId:principalId, tenantId:tenantId}"
```

`clientId` and `tenantId` go into the service connection. `principalId` is the identity's object ID inside Microsoft Entra ID, and it is what you assign the Key Vault role to.

## Step 3: Grant the identity Key Vault access

With RBAC on the vault, you grant the `Key Vault Secrets User` role at the vault scope. This role gives `Get` and `List` on secrets, which is exactly what the pipeline needs and nothing more.

```azurecli
KV_ID=$(az keyvault show \
  --name kv-pipelines-prod-uks \
  --resource-group rg-pipeline-secrets-prod \
  --query id -o tsv)

MI_PRINCIPAL=$(az identity show \
  --name id-pipeline-secrets \
  --resource-group rg-pipeline-secrets-prod \
  --query principalId -o tsv)

az role assignment create \
  --assignee-object-id $MI_PRINCIPAL \
  --assignee-principal-type ServicePrincipal \
  --role "Key Vault Secrets User" \
  --scope $KV_ID
```

If your organisation still mandates legacy access policies, the equivalent is:

```azurecli
az keyvault set-policy \
  --name kv-pipelines-prod-uks \
  --object-id $MI_PRINCIPAL \
  --secret-permissions get list
```

`get` and `list` are the two permissions the `AzureKeyVault@2` task needs. Do not add `set`, `delete`, or `purge` to the pipeline identity. Rotation gets its own identity (covered below).

## Step 4: Create the Azure Resource Manager service connection

Navigate to `Azure DevOps > Project settings > Service connections > New service connection > Azure Resource Manager > Next`. Pick **Managed identity** as the **Identity Type**.

Fill in **Step 1: Managed identity details** with the subscription, resource group, and managed identity you just created. For **Step 2: Azure Scope**, choose **Subscription** level and select the same subscription. For **Step 3: Service connection details**, name the connection `sc-azure-prod` and clear the **Grant access permission to all pipelines** checkbox. You authorise pipelines individually. Click **Save**.

NOTE: THE "GRANT ACCESS PERMISSION TO ALL PIPELINES" CHECKBOX IS ON BY DEFAULT. LEAVE IT OFF. THE WHOLE POINT OF A SERVICE CONNECTION IS A SCOPED CREDENTIAL, AND OPEN ACCESS UNDOES THAT. AUTHORISE EACH PIPELINE EXPLICITLY ON FIRST RUN BY CLICKING **AUTHORIZE RESOURCES** WHEN THE PIPELINE FAILS WITH A RESOURCE AUTHORISATION ERROR.

## Step 5: Link a variable group to the Key Vault

Variable groups are the middle tier. Good for slow-moving secrets shared across pipelines (Application Insights keys, third-party API tokens, Slack webhook URLs). Values pull from the vault at queue time, so a vault outage fails the run early rather than mid-deploy.

Go to `Azure DevOps > Pipelines > Library > + Variable group`. Name it `vg-prod-secrets`. Toggle **Link secrets from an Azure key vault as variables** to on. Pick the service connection `sc-azure-prod`, then pick the vault `kv-pipelines-prod-uks`. Click **Authorize** if prompted.

Under **Variables**, click **+ Add**, and select `DbConnectionString` from the list of available secrets. Click **OK**, then **Save**.

You now reference it from a pipeline like this:

```yaml
trigger:
- main

pool:
  vmImage: ubuntu-latest

variables:
- group: vg-prod-secrets

stages:
- stage: Deploy
  jobs:
  - job: Migrate
    steps:
    - task: AzureCLI@2
      displayName: Run EF Core migration
      inputs:
        azureSubscription: sc-azure-prod
        scriptType: bash
        scriptLocation: inlineScript
        inlineScript: |
          dotnet ef database update \
            --connection "$(DbConnectionString)" \
            --project src/App.Data
```

NOTE: SECRET VARIABLES FROM A KEY VAULT-BACKED VARIABLE GROUP CANNOT BE READ DIRECTLY INSIDE A SCRIPT BY MACRO EXPANSION ON LINUX AGENTS. PASS THEM AS ENV VARS OR TASK ARGUMENTS. IF YOU MUST USE THEM IN A `script:` STEP, MAP THEM EXPLICITLY: `env: { DB_CONN: $(DbConnectionString) }`. THE SAME RULE APPLIES TO PIPELINE SECRET VARIABLES.

Before the first run, authorise the pipeline against the variable group: `Pipelines > Library > vg-prod-secrets > Pipeline permissions > + > pick the pipeline`. Doing it through the UI once is faster than chasing the resource authorisation error.

## Step 6: Read secrets at run time with `AzureKeyVault@2`

The variable group approach is good. Pulling at run time with the task is better. The secret is fetched inside the job, so the audit row shows the pipeline run as caller rather than a generic queue-time fetch. You can filter the set of secrets per stage, so a build stage does not see production values. Secrets rotated between queue time and run time are picked up immediately.

Here is the same migration step, but with the task pulling at run time and scoped to a single secret:

```yaml
trigger:
- main

pool:
  vmImage: ubuntu-latest

stages:
- stage: Build
  jobs:
  - job: BuildJob
    steps:
    - script: dotnet build src/App.sln -c Release
      displayName: Build

- stage: DeployProd
  dependsOn: Build
  jobs:
  - deployment: MigrateProd
    environment: production
    strategy:
      runOnce:
        deploy:
          steps:
          - task: AzureKeyVault@2
            displayName: Pull DB connection string
            inputs:
              azureSubscription: sc-azure-prod
              KeyVaultName: kv-pipelines-prod-uks
              SecretsFilter: DbConnectionString
              RunAsPreJob: false

          - task: AzureCLI@2
            displayName: Run EF Core migration
            inputs:
              azureSubscription: sc-azure-prod
              scriptType: bash
              scriptLocation: inlineScript
              inlineScript: |
                dotnet ef database update \
                  --connection "$(DbConnectionString)" \
                  --project src/App.Data
```

`SecretsFilter: DbConnectionString` pulls one secret. Using `*` pulls every secret in the vault, which sounds convenient and is exactly what you do not want. Filter by name. `RunAsPreJob: false` runs the task in line; setting it to `true` runs the task before any other step in the job, useful when a later task needs the secret as an input the engine resolves before the script runs.

The deployment job with `environment: production` gives you a second audit layer: a manual approval gate. Configure approvers under `Pipelines > Environments > production > Approvals and checks > + > Approvals`.

## Step 7: Masking, audit, and rotation

Masking is automatic for any value Azure Pipelines knows is a secret: variables marked secret in a variable group, secrets pulled by `AzureKeyVault@2`, and pipeline secret variables. The mask is a substring replacement on log output. It survives `echo $(DbConnectionString)` but breaks the moment you transform the value. `echo $(DbConnectionString) | base64` prints the base64 of the secret in plain text, because the mask sees a different string.

Two defences. Never transform secrets in script steps; pass them as env vars to a task that consumes them directly. And enable the **Issue secret detection** policy under `Project settings > Repos > Policies` so high-entropy commits are flagged at push.

For audit, turn on Key Vault diagnostic settings:

```azurecli
LAW_ID=$(az monitor log-analytics workspace show \
  --resource-group rg-observability \
  --workspace-name law-platform \
  --query id -o tsv)

az monitor diagnostic-settings create \
  --name kv-audit \
  --resource $KV_ID \
  --workspace $LAW_ID \
  --logs '[{"category":"AuditEvent","enabled":true}]'
```

`AuditEvent` records every data-plane operation: who, what secret, from which IP, at what time. A useful Kusto query for the platform team:

```kusto
AzureDiagnostics
| where ResourceProvider == "MICROSOFT.KEYVAULT"
| where OperationName == "SecretGet"
| where TimeGenerated > ago(24h)
| project TimeGenerated, identity_claim_appid_g, requestUri_s, CallerIPAddress
| order by TimeGenerated desc
```

That gives a 24-hour view of every secret read, the calling application ID (managed identity client ID), and the source IP.

Rotation has two shapes. For secrets the vault owns end to end (storage account keys, SQL admin passwords with managed rotation), use the autorotation features documented under [Configure key autorotation](https://learn.microsoft.com/en-us/azure/key-vault/keys/how-to-configure-key-rotation). For application secrets (third-party API keys, OAuth client secrets), use a separate rotation pipeline on a schedule, with its own managed identity holding `Key Vault Secrets Officer` (not just `Secrets User`). The rotation pipeline sets a new version, then triggers a redeploy. The consuming pipeline keeps its `Secrets User` role, so a compromised build agent stays read-only.

A schedule trigger for monthly rotation looks like this:

```yaml
schedules:
- cron: "0 3 1 * *"
  displayName: Monthly rotation
  branches:
    include:
    - main
  always: true
```

`always: true` fires the schedule even when there are no code changes, which is what rotation needs.

## Troubleshooting

**"The user or group does not have secrets list permission".** The managed identity lacks `Key Vault Secrets User` (RBAC) or `Get`/`List` on secrets (access policy). Run `az role assignment list --assignee <principalId> --scope <vaultId>` to confirm. If the role is assigned but the error persists, wait two minutes; assignments are eventually consistent.

**Variable resolves to empty string in a script step.** The secret name contains a dash and the task replaced it with a dot. `api-key` becomes `$(api.key)`. Rename the secret or update the reference.

**Pipeline succeeds but the secret value is literally `***` in the consuming app.** You passed `$(SecretName)` into a YAML field the engine resolved, logged, then masked. Pass secrets through `env:` blocks, not string concatenation in YAML inputs.

**`AzureKeyVault@2` fails with "vault not found" on a self-hosted agent.** The agent cannot reach `*.vault.azure.net`. If the vault has private endpoints, the agent must sit inside (or peer to) the virtual network with private DNS zone resolution. Check with `nslookup kv-pipelines-prod-uks.vault.azure.net`.

**Variable group authorise prompt loops forever.** You lack project admin rights. Get a project admin to do the one-time `+ > Open access` or pipeline-specific authorisation.

## Clean up

If this was a sandbox, knock the resource group out in one shot:

```azurecli
az group delete --name rg-pipeline-secrets-prod --yes --no-wait
```

The Key Vault enters soft-deleted state for 90 days. The name stays reserved. Purge protection blocks early reclaim, by design.

In Azure DevOps, delete the variable group from `Pipelines > Library`, then delete the service connection from `Project settings > Service connections`. Pipelines that reference either fail loudly on the next run, which is correct.

If you wired this up cleanly, the result is a build plane where secrets never appear in YAML, source control, or unmasked logs, and never live on the agent past the job. Every read is audited at the vault, every rotation is a single secret-set, and the blast radius of a compromised pipeline is the secrets that one pipeline could `Get`, not the whole vault. That is the build.
