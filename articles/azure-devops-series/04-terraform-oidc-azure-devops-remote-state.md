# Terraform on Azure DevOps with OIDC auth and remote state in a storage account

Here is how I wired up a Terraform pipeline on Azure DevOps that uses Workload Identity Federation (no service principal secret rotating in the vault), keeps state in an Azure Storage blob container with native lease-based locking, and gates `apply` behind an environment approval. The shape of the build follows what Microsoft Learn currently recommends in the `connect-to-azure` and `store-state-in-azure-storage` articles, so the keys and task versions in this post match what you will see in the official docs.

### STEPS

- Step 1: Provision the backend storage account
- Step 2: Create the Azure Resource Manager service connection with Workload identity federation
- Step 3: Configure the `azurerm` backend in HCL
- Step 4: Wire the multi-stage YAML (init, validate, plan-as-artifact, apply behind approval)
- Step 5: Add workspaces for multi-environment routing
- Step 6: Handle state drift and recover from broken leases

## Why this matters

The default Terraform behaviour writes state to disk next to your code. On a single laptop that is fine. Inside a pipeline it is a disaster: every agent gets a fresh workspace, no state is persisted between runs, and the first time two pull requests race each other you corrupt the file. The fix is two things working together. State goes to a shared, lockable backend (Azure Storage with a blob lease). Auth to Azure goes through a federated identity tied to your Azure DevOps service connection, so the pipeline never sees a long-lived secret.

Microsoft's guidance landed firmly on Workload identity federation. The `connect-to-azure` page now reads, verbatim, "If you're setting up a service connection for the first time, use workload identity federation." That is the auth path this article uses.

## Prerequisites

- An Azure subscription where you have `Owner` rights on at least one resource group (the automatic app registration path needs `Owner` on the subscription, per Microsoft Learn).
- An Azure DevOps project with permission to create service connections under `Project settings > Service connections`.
- Azure CLI `az` 2.55 or later installed locally for the bootstrap step.
- Terraform `1.6` or later on your workstation and on the pipeline agent. The `hashicorp/azurerm` provider `~> 3.0` is the version Microsoft uses in their sample.
- A Git repository inside the same Azure DevOps project containing your Terraform code.

NOTE: WORKLOAD IDENTITY FEDERATION IS NOT AVAILABLE FOR AZURE STACK OR AZURE US GOVERNMENT CLOUDS. THE MICROSOFT LEARN PAGE LISTS BOTH AS EXCLUSIONS FOR THE AUTOMATIC FLOW.

## Tools Used

- **Azure DevOps Pipelines:** multi-stage YAML CI/CD plane. We use it as the build, plan, and gated-apply surface.
- **Azure Resource Manager service connection:** the named credential in `Project settings > Service connections` that the `AzureCLI@2` task consumes. We configure it with `App registration (automatic)` and credential `Workload identity federation`.
- **Terraform `azurerm` provider:** the Microsoft-published Azure provider. We pin to `~> 3.0` to match the Microsoft Learn sample.
- **`azurerm` backend block:** the remote-state backend baked into Terraform itself. It writes state to a blob and acquires a lease on that blob for locking.
- **Azure Storage account + blob container:** the actual home of the `terraform.tfstate` file. We enable encryption at rest (on by default) and disable public blob access.
- **`AzureCLI@2`:** the pipeline task that swaps the federated token for an Azure CLI session. Terraform inherits the session because the `azurerm` provider honours the same env vars the task sets.

## Step 1: Provision the backend storage account

We need a resource group, a storage account, and one container before Terraform can write state anywhere. The Microsoft Learn `store-state-in-azure-storage` page uses these exact commands, so we keep them verbatim.

```bash
RESOURCE_GROUP_NAME=tfstate
STORAGE_ACCOUNT_NAME=tfstate$RANDOM
CONTAINER_NAME=tfstate

az group create --name $RESOURCE_GROUP_NAME --location eastus

az storage account create \
  --resource-group $RESOURCE_GROUP_NAME \
  --name $STORAGE_ACCOUNT_NAME \
  --sku Standard_LRS \
  --encryption-services blob

az storage container create \
  --name $CONTAINER_NAME \
  --account-name $STORAGE_ACCOUNT_NAME
```

The Microsoft sample uses `Standard_LRS`. For production state I bump that to `Standard_ZRS` so a single-zone outage cannot lock the team out of their own infrastructure. Either way, write down the account name. You will paste it into the backend block in Step 3.

### 1.1: Lock the account down

The bootstrap script above leaves blob public access on. That is the only thing the Microsoft Learn page flags as a production risk, and rightly so. Turn it off:

```bash
az storage account update \
  --name $STORAGE_ACCOUNT_NAME \
  --resource-group $RESOURCE_GROUP_NAME \
  --allow-blob-public-access false
```

NOTE: IF YOU PLAN TO USE A STORAGE FIREWALL, ADD THE PIPELINE AGENT EGRESS IP RANGES OR USE A PRIVATE ENDPOINT. MICROSOFT-HOSTED AGENTS ROTATE IPS DAILY, SO THE PRIVATE ENDPOINT ROUTE IS THE CLEAN ONE FOR LONG-LIVED PIPELINES.

## Step 2: Create the Azure Resource Manager service connection with Workload identity federation

Open the project, then navigate to `Azure DevOps > Project settings > Service connections > New service connection > Azure Resource Manager`. Click `Next`.

On the auth method picker, choose `App registration (automatic)` with the credential set to `Workload identity federation`. This is the option Microsoft Learn marks as the recommended path.

Fill in the dialog as follows:

- **Scope level:** `Subscription`
- **Subscription:** pick the one where your workload lives
- **Resource group:** leave empty for subscription-wide access, or pin it to your `tfstate` RG plus the deployment RG if you want least privilege
- **Service connection name:** `azure-prod` (we reference this verbatim in YAML)
- Untick `Grant access permission to all pipelines`. Authorise pipelines one at a time.

Click `Save`. Azure DevOps creates the underlying app registration, configures a federated credential against your subscription, and stores nothing secret on its side.

### 2.1: Confirm the federated credential exists

In the Azure portal: `Microsoft Entra ID > App registrations > <your new app> > Certificates & secrets > Federated credentials`. You should see one entry pointing at `https://vstoken.dev.azure.com/<orgGuid>`. If that is empty, the auto-creation silently failed. Delete the service connection and re-create it.

## Step 3: Configure the `azurerm` backend in HCL

The backend block lives in `backend.tf` alongside your root module. The Learn sample I am matching is the canonical four-key block.

```hcl
terraform {
  required_version = ">= 1.6.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }

  backend "azurerm" {
    resource_group_name  = "tfstate"
    storage_account_name = "tfstateXXXXX"
    container_name       = "tfstate"
    key                  = "prod.terraform.tfstate"
    use_oidc             = true
    use_azuread_auth     = true
  }
}

provider "azurerm" {
  features {}
  use_oidc = true
}
```

Three things to call out:

1. `use_oidc = true` on both the backend and the provider tells Terraform to read the federated token Azure DevOps injects, instead of looking for an `ARM_CLIENT_SECRET`.
2. `use_azuread_auth = true` makes the backend authenticate to the storage account using the same Entra identity instead of a shared access key. This removes the need to set `ARM_ACCESS_KEY` at all.
3. The `key` is the blob name. I use one key per environment, not per workspace, when state files diverge in lifecycle.

NOTE: THE FEDERATED APP REGISTRATION NEEDS `STORAGE BLOB DATA CONTRIBUTOR` ON THE STATE CONTAINER FOR `USE_AZUREAD_AUTH = TRUE` TO WORK. WITHOUT IT, `TERRAFORM INIT` FAILS WITH A 403 ON THE FIRST BLOB READ.

Grant the role with one command after the service connection is saved:

```bash
APP_ID=$(az ad sp list --display-name "<service connection app name>" --query "[0].appId" -o tsv)

az role assignment create \
  --role "Storage Blob Data Contributor" \
  --assignee $APP_ID \
  --scope "/subscriptions/<subId>/resourceGroups/tfstate/providers/Microsoft.Storage/storageAccounts/tfstateXXXXX"
```

## Step 4: Wire the multi-stage YAML

Three stages: `Validate`, `Plan`, `Apply`. The plan stage publishes the binary plan as a pipeline artifact. The apply stage downloads it and runs `terraform apply <planfile>` so we apply exactly what was reviewed.

```yaml
trigger:
  branches:
    include: [ main ]

variables:
  TF_VERSION: 1.7.5
  TF_WORKING_DIR: $(System.DefaultWorkingDirectory)/infra
  ARM_USE_OIDC: true
  ARM_USE_AZUREAD: true

stages:
  - stage: Validate
    displayName: terraform validate
    jobs:
      - job: validate
        pool:
          vmImage: ubuntu-latest
        steps:
          - task: TerraformInstaller@1
            inputs:
              terraformVersion: $(TF_VERSION)

          - task: AzureCLI@2
            displayName: terraform init + validate
            inputs:
              azureSubscription: azure-prod
              addSpnToEnvironment: true
              scriptType: bash
              scriptLocation: inlineScript
              workingDirectory: $(TF_WORKING_DIR)
              inlineScript: |
                export ARM_CLIENT_ID=$servicePrincipalId
                export ARM_OIDC_TOKEN=$idToken
                export ARM_TENANT_ID=$tenantId
                export ARM_SUBSCRIPTION_ID=$(az account show --query id -o tsv)
                terraform init -input=false
                terraform validate

  - stage: Plan
    dependsOn: Validate
    jobs:
      - job: plan
        pool:
          vmImage: ubuntu-latest
        steps:
          - task: TerraformInstaller@1
            inputs:
              terraformVersion: $(TF_VERSION)

          - task: AzureCLI@2
            displayName: terraform plan
            inputs:
              azureSubscription: azure-prod
              addSpnToEnvironment: true
              scriptType: bash
              scriptLocation: inlineScript
              workingDirectory: $(TF_WORKING_DIR)
              inlineScript: |
                export ARM_CLIENT_ID=$servicePrincipalId
                export ARM_OIDC_TOKEN=$idToken
                export ARM_TENANT_ID=$tenantId
                export ARM_SUBSCRIPTION_ID=$(az account show --query id -o tsv)
                terraform init -input=false
                terraform plan -input=false -out=tfplan.binary
                terraform show -no-color tfplan.binary > tfplan.txt

          - publish: $(TF_WORKING_DIR)/tfplan.binary
            artifact: tfplan
            displayName: publish binary plan

          - publish: $(TF_WORKING_DIR)/tfplan.txt
            artifact: tfplan-readable
            displayName: publish human-readable plan

  - stage: Apply
    dependsOn: Plan
    jobs:
      - deployment: apply
        environment: prod
        pool:
          vmImage: ubuntu-latest
        strategy:
          runOnce:
            deploy:
              steps:
                - checkout: self

                - task: TerraformInstaller@1
                  inputs:
                    terraformVersion: $(TF_VERSION)

                - download: current
                  artifact: tfplan

                - task: AzureCLI@2
                  displayName: terraform apply tfplan
                  inputs:
                    azureSubscription: azure-prod
                    addSpnToEnvironment: true
                    scriptType: bash
                    scriptLocation: inlineScript
                    workingDirectory: $(TF_WORKING_DIR)
                    inlineScript: |
                      export ARM_CLIENT_ID=$servicePrincipalId
                      export ARM_OIDC_TOKEN=$idToken
                      export ARM_TENANT_ID=$tenantId
                      export ARM_SUBSCRIPTION_ID=$(az account show --query id -o tsv)
                      cp $(Pipeline.Workspace)/tfplan/tfplan.binary .
                      terraform init -input=false
                      terraform apply -input=false -auto-approve tfplan.binary
```

The mechanics worth understanding:

- `azureSubscription: azure-prod` references the service connection name from Step 2.
- `addSpnToEnvironment: true` exposes `$servicePrincipalId`, `$idToken`, and `$tenantId` inside the script, which is the documented bridge between the `AzureCLI@2` task and the `azurerm` provider when OIDC is on.
- `terraform plan -out=tfplan.binary` writes a sealed plan. The Apply stage replays that exact plan, so what gets approved is what gets applied.
- `environment: prod` is the gate. Go to `Pipelines > Environments > prod > Approvals and checks > Approvals` and add the on-call rota as required approvers. Apply will not start until they click `Approve`.

### 4.1: Pin the task versions

`TerraformInstaller@1` and `AzureCLI@2` are the versions Microsoft documents today. `AzureCLI@1` does not honour Workload identity federation. If you copy this YAML from somewhere older, that one digit will silently break OIDC auth.

## Step 5: Workspaces for multi-environment layouts

There are two camps. One keeps `dev`, `staging`, `prod` as Terraform workspaces inside the same state container. The other keeps them as fully separate root modules with separate backend keys. I run the second pattern on anything that ships to customers, because workspace-scoped state still shares a single blob lease and a single set of provider versions. A bad upgrade in `dev` can rip through `prod`.

If you do want workspaces, the moves are:

```bash
terraform workspace new dev
terraform workspace new staging
terraform workspace new prod
terraform workspace select staging
```

The backend block stays identical across workspaces. Terraform appends the workspace name to the blob key automatically, so `prod.terraform.tfstate` becomes `prod.terraform.tfstateenv:dev` for the `dev` workspace.

For the separate-module pattern, I use one folder per environment, each with its own `backend.tf` whose `key` differs:

```
infra/
  dev/backend.tf      # key = "dev.tfstate"
  staging/backend.tf  # key = "staging.tfstate"
  prod/backend.tf     # key = "prod.tfstate"
  modules/network/
  modules/aks/
```

Then each environment gets its own pipeline file, or one pipeline parameterised on `TF_WORKING_DIR`.

## Step 6: State drift and broken leases

Two failure modes hit teams within the first month.

### 6.1: State drift

Drift is the gap between what Terraform last wrote to state and what the cloud actually looks like. Someone clicked something in the portal. A policy auto-tagged a resource. To detect it:

```bash
terraform plan -refresh-only -detailed-exitcode
```

Exit code `2` means drift was found. I run that on a nightly schedule and post the diff to a Teams channel. If the drift is benign, `terraform apply -refresh-only` reconciles state without changing infrastructure. If the drift is hostile (someone manually scaled a node pool down), the next normal `plan` will surface it as a re-creation, and the human in the approval queue gets to decide.

### 6.2: Broken blob lease

If a pipeline run is cancelled mid-`apply`, the blob lease can stay held for up to one minute past the kill. Anything that runs in that window gets:

```
Error: state blob is already locked
```

Wait sixty seconds and rerun. If the lease is genuinely stuck (rare, usually after an agent crash), break it manually:

```bash
az storage blob lease break \
  --blob-name prod.terraform.tfstate \
  --container-name tfstate \
  --account-name tfstateXXXXX \
  --auth-mode login
```

NOTE: ONLY BREAK A LEASE WHEN YOU ARE SURE NO TERRAFORM PROCESS IS STILL ALIVE. BREAKING A LEASE UNDERNEATH A RUNNING `APPLY` IS HOW YOU CORRUPT STATE.

## Troubleshooting

- **`Error: building AzureRM Client: obtain subscription() from Azure CLI: Error parsing json result from the Azure CLI`.** The `AzureCLI@2` step did not log in. Check that `addSpnToEnvironment: true` is set and that the service connection name on `azureSubscription` matches exactly. Capitalisation counts.
- **`AADSTS70021: No matching federated identity record found for presented assertion`.** The federated credential in Entra ID is missing or points at a different Azure DevOps organisation. Re-create the service connection; the manual conversion path on Learn warns about this directly.
- **`Error acquiring the state lock: 409 LeaseAlreadyPresent`.** A previous run holds the lease. Either wait it out, or break the lease as shown in 6.2. Do not pass `-lock=false`. That is the path to corrupted state.
- **`Error: Failed to get existing workspaces: containers.Client#ListBlobs: ... StatusCode=403`.** The federated identity does not have `Storage Blob Data Contributor` on the container. Re-run the `az role assignment create` from Step 3.
- **Plan succeeds, apply produces a different diff.** You forgot to pass the saved plan file. The apply step must end in `terraform apply tfplan.binary`, not `terraform apply`. The second form re-plans against current state.

## Clean up

If you are tearing the lab down rather than promoting it:

```bash
az group delete --name tfstate --yes --no-wait
```

Then in Azure DevOps: `Project settings > Service connections > azure-prod > More actions > Delete`. The federated app registration in Entra ID stays orphaned unless you remove it explicitly via `az ad app delete --id <appId>`.

## Closing

That is the build. State sits in a locked blob, the pipeline never holds a secret, the plan you approve is the plan that runs, and drift gets a nightly check rather than a quarterly surprise. The bits that took me longest to get right (the `use_azuread_auth` flag, the `Storage Blob Data Contributor` role on the container, the `AzureCLI@2` vs `@1` distinction) are the bits I would happily save you a Tuesday afternoon on.
