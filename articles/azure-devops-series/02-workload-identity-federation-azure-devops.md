# Secretless deployments from Azure DevOps with Workload Identity Federation

Most teams hit the same wall about six months after their first Azure DevOps pipeline ships. Someone files a ticket: the service principal secret on the prod ARM service connection rotates next Tuesday, who is renewing it. A Slack thread starts. Three people argue about who owns the rotation runbook. The secret expires at 02:14 UTC and the overnight deploy fails. Nobody is to blame, but the model is broken. A pipeline that holds a long-lived password for a privileged identity is a pipeline that is one calendar slip away from an outage, and one phishing email away from a real incident. Workload Identity Federation (WIF) takes the password out of the picture. The pipeline trades a short-lived OIDC token from Azure DevOps for a short-lived access token from Microsoft Entra ID, and the access token is gone before anyone could have stolen it.

Here is how I wired up WIF on an Azure Resource Manager service connection, how the trust actually works under the hood, and the pipeline YAML I ship to production.

### STEPS

- Step 1: Audit existing secret-based service connections
- Step 2: Confirm RBAC on the target subscription and tenant
- Step 3: Create an `Azure Resource Manager` service connection with `App registration (automatic)` and `Workload identity federation`
- Step 4: Author the pipeline YAML with `AzureCLI@2`
- Step 5: Convert any legacy secret-based connection to WIF

## Why this matters

The classic Azure RM service connection ships with a client secret on the app registration that Azure DevOps creates for you. That secret defaults to a three-month lifetime. The pipeline reads it on every run, presents it to Microsoft Entra ID, and gets an access token back. The secret sits inside the service-connection record in the Azure DevOps backend, replicated, backed up, and accessible to anyone with the `Administrator` role on the connection.

WIF replaces the shared secret with a federated identity credential on the same app registration. The credential names a trust: tokens from `https://vstoken.dev.azure.com/<organization-id>` are accepted, but only when the `sub` claim matches a specific service-connection identity, and only when the `aud` claim is `api://AzureADTokenExchange`. At pipeline runtime, Azure DevOps mints a fresh OIDC token, hands it to the Microsoft identity platform via the client-credentials flow with a federated assertion, and gets an access token in return. No secret is stored anywhere. No secret can leak. No secret can expire.

The Microsoft Learn page on workload identity federation is explicit about one detail that bites people: the Federated Identity Credential `issuer`, `subject`, and `audience` values must case-sensitively match the corresponding claims in the incoming token. Azure DevOps sets these for you when you use the automatic flow, which is why I always recommend the automatic flow over the manual one for the first cut.

## Prerequisites

- An Azure DevOps project where you have at least the `Creator` role on the `Endpoint Creators` group, found under `Project settings > Service connections > More Actions > Security`. Project Contributors are added by default.
- `Owner` on the target Azure subscription. This is the requirement for the automatic flow. Microsoft Learn states it plainly: the automatic option requires the Owner role for your Azure subscription.
- Permission to create app registrations in the Microsoft Entra tenant. If your tenant disables `Users can register applications`, you will fall back to the manual flow.
- A target subscription that is not `Azure Stack` or `Azure US Government`. The automatic flow does not support those clouds.
- `Azure CLI` 2.55 or newer on your workstation if you plan to script the setup, plus `PowerShell 7.3` or newer for the bulk conversion script.
- A pipeline agent pool. Microsoft-hosted agents work for WIF on app-registration scope. Microsoft-hosted agents do not support managed-identity authentication, so if you go the managed-identity route you need a self-hosted agent.

NOTE: WIF on Azure DevOps is a Services-only feature on the recommended automatic path. Azure DevOps Server 2022 still surfaces `Service principal (manual)` as a first-class option. The YAML in this article is portable, but the service-connection setup screens differ.

## Tools Used

**Azure DevOps Services:** the SaaS build and release plane. We use multi-stage YAML pipelines and the project-scoped `Service connections` library.

**Microsoft Entra ID:** the identity provider that owns the app registration and the federated credential. The trust relationship lives here.

**Azure Resource Manager:** the control plane where the deployment actually lands. RBAC role assignments on the subscription (or resource group) determine what the pipeline can touch.

**AzureCLI@2:** the pipeline task that runs `az` commands against the `azureSubscription` named by the service connection. Version 2 understands the WIF authentication scheme and exchanges the OIDC token for you.

**`az` CLI:** the command-line tool the task wraps. Inside the task, `az` is already logged in via the federated credential, so commands like `az group list` and `az deployment sub create` just work.

**federated identity credential:** the object on the app registration that names the trusted external issuer, subject, and audience. This is the thing that replaces the client secret.

## Step 1: Audit existing secret-based service connections

Before creating anything new, list what is already there. From your project root, run:

```bash
az login --allow-no-subscriptions --scope 499b84ac-1321-427f-aa17-267ca6975798/.default

ORG="https://dev.azure.com/contoso"
PROJECT="payments-platform"
API="7.1"

az rest \
  --resource 499b84ac-1321-427f-aa17-267ca6975798 \
  -u "$ORG/$PROJECT/_apis/serviceendpoint/endpoints?authSchemes=ServicePrincipal&type=azurerm&api-version=$API" \
  -m GET \
  --query "value[?authorization.scheme=='ServicePrincipal'].{name:name,id:id,scheme:authorization.scheme}" \
  -o table
```

The application ID `499b84ac-1321-427f-aa17-267ca6975798` is the well-known Azure DevOps resource ID. Every connection that comes back with `ServicePrincipal` as the scheme is a candidate for conversion. Anything already on `WorkloadIdentityFederation` is done.

Capture the output. You want a list to work through. In my last audit I found 14 ARM connections across a project, of which 11 were still on a secret and 3 had been converted by a previous engineer.

## Step 2: Confirm RBAC on the target subscription and tenant

Two role checks. On the subscription:

```bash
SUB_ID="00000000-0000-0000-0000-000000000000"
ME=$(az ad signed-in-user show --query id -o tsv)

az role assignment list \
  --assignee "$ME" \
  --scope "/subscriptions/$SUB_ID" \
  --query "[].{role:roleDefinitionName,scope:scope}" \
  -o table
```

You want `Owner` on the subscription scope. `Contributor` is not enough because the automatic flow has to create the role assignment for the new app registration, and only `Owner` or `User Access Administrator` can hand out role assignments.

On the tenant, confirm that the `Users can register applications` switch in `Microsoft Entra ID > Users > User settings` is `Yes`, or that you have the `Application Developer` Entra role.

NOTE: If you are a Guest user in the directory, the automatic flow will fail with a permissions error. Microsoft Learn calls this out explicitly under "The user has only guest permission in the directory". Flip yourself to a Member, or ask a tenant admin to run the setup once.

## Step 3: Create the service connection in the UI

This is the path most teams will use. It takes about 90 seconds once the prerequisites are in place.

3.1 In Azure DevOps, go to `Project settings > Service connections`. Select `New service connection`, then `Azure Resource Manager`, then `Next`.

3.2 On the authentication picker, select `App registration (automatic)` with the credential `Workload identity federation`. This is the recommended option in the current Azure DevOps docs.

3.3 Select a `Scope level`. The dropdown offers `Subscription`, `Management Group`, or `Machine Learning Workspace`. For most app deployments you want `Subscription`.

3.4 Choose the `Subscription`. Optionally pin a `Resource group` so the resulting role assignment is scoped tighter than the whole subscription. Pinning to a resource group is the move I recommend for any pipeline that does not need to read subscription-level resources, because it caps the blast radius of a compromised pipeline at one resource group.

3.5 Enter a `Service connection name`. Pick something that names the environment, not the technology. `payments-platform-prod-uksouth` ages better than `azure-wif-1`.

3.6 Leave `Grant access permission to all pipelines` unchecked. Microsoft's docs explicitly recommend against it. Authorize each pipeline individually under the connection's `Security` panel.

3.7 Select `Save`. Azure DevOps creates the Entra ID app registration, adds the federated identity credential, assigns `Contributor` on the chosen scope, and writes the service-connection record. If you tail the Entra ID audit log you will see all four operations in the same five-second window.

NOTE: The default role assigned by the automatic flow is `Contributor`. If your pipeline needs to assign roles to other identities (for example, to grant a managed identity access to Key Vault during deployment), `Contributor` is not enough. Strip it down to a custom role or layer on `User Access Administrator` constrained with a condition, but only after you have shipped one successful deploy on the default config.

## Step 4: Wire up the pipeline YAML

The point of doing all this is the pipeline. Here is a working `azure-pipelines.yml` that deploys a Bicep file using the WIF connection.

```yaml
trigger:
  branches:
    include:
      - main

pool:
  vmImage: ubuntu-latest

variables:
  azureServiceConnection: payments-platform-prod-uksouth
  resourceGroupName: rg-payments-prod-uksouth
  location: uksouth
  templateFile: infra/main.bicep

stages:
  - stage: Validate
    jobs:
      - job: WhatIf
        steps:
          - checkout: self

          - task: AzureCLI@2
            displayName: az deployment group what-if
            inputs:
              azureSubscription: $(azureServiceConnection)
              scriptType: bash
              scriptLocation: inlineScript
              inlineScript: |
                az deployment group what-if \
                  --resource-group "$(resourceGroupName)" \
                  --template-file "$(templateFile)" \
                  --parameters environment=prod

  - stage: Deploy
    dependsOn: Validate
    condition: succeeded()
    jobs:
      - deployment: ProdDeploy
        environment: payments-prod
        strategy:
          runOnce:
            deploy:
              steps:
                - checkout: self

                - task: AzureCLI@2
                  displayName: az deployment group create
                  inputs:
                    azureSubscription: $(azureServiceConnection)
                    scriptType: bash
                    scriptLocation: inlineScript
                    inlineScript: |
                      az deployment group create \
                        --resource-group "$(resourceGroupName)" \
                        --template-file "$(templateFile)" \
                        --parameters environment=prod \
                        --name "deploy-$(Build.BuildNumber)"
```

The important keys: `azureSubscription` names the service connection (the field is named `azureSubscription` for historical reasons, it is not the Azure subscription ID). `AzureCLI@2` is the task version that handles the federated token exchange. There is no `addSpnToEnvironment: true` on this snippet because the inline script does not need to read the client ID or tenant ID directly. If you do need them, set `addSpnToEnvironment: true` and read `$servicePrincipalId`, `$tenantId`, and `$idToken` from the task's process environment.

NOTE: Do not log `$idToken`. It is a short-lived bearer token. The task masks it from the log by default, but a careless `echo $idToken` in your inline script will defeat the masking.

For Terraform users, the same connection drives the `AzureCLI@2` task, and `terraform` picks up the federated credential via the `ARM_USE_OIDC=true` environment variable. The Terraform `azurerm` provider has supported this since version 3.60.

## Step 5: Convert legacy service connections in bulk

If your audit in Step 1 turned up a long list of secret-based connections, do not click through each one. Microsoft ships a PowerShell script that walks the project's connections and converts each one via the REST API. The script lives at `https://aka.ms/azdo-rm-workload-identity-conversion` and looks like this in skeleton form:

```powershell
#Requires -Version 7.3

param (
    [parameter(Mandatory=$true)]
    [string] $Project,

    [parameter(Mandatory=$true)]
    [uri] $OrganizationUrl
)

$apiVersion = "7.1"
$azdoResource = "499b84ac-1321-427f-aa17-267ca6975798"

az login --allow-no-subscriptions --scope "$azdoResource/.default"

$OrganizationUrl = $OrganizationUrl.ToString().Trim('/')
$getApiUrl = "$OrganizationUrl/$Project/_apis/serviceendpoint/endpoints?authSchemes=ServicePrincipal&type=azurerm&api-version=$apiVersion"

$endpoints = az rest --resource $azdoResource -u "$getApiUrl" -m GET --query "value[?authorization.scheme=='ServicePrincipal' && data.creationMode=='Automatic']" -o json | ConvertFrom-Json

foreach ($ep in $endpoints) {
    $ep.authorization.scheme = "WorkloadIdentityFederation"
    $ep.data.PSObject.Properties.Remove('revertSchemeDeadline')
    $body = $ep | ConvertTo-Json -Depth 4 -Compress
    $putUrl = "$OrganizationUrl/$Project/_apis/serviceendpoint/endpoints/$($ep.id)?operation=ConvertAuthenticationScheme&api-version=$apiVersion"
    az rest -u "$putUrl" -m PUT -b $body --headers content-type=application/json --resource $azdoResource | Out-Null
    Write-Host "Converted $($ep.name)"
}
```

Two constraints on the conversion tool. First, the connection must have been created automatically by Azure DevOps in the first place. Manually created connections cannot be converted by the tool because Azure DevOps does not own the app registration. Second, only single-project connections convert. Cross-project shared connections need to be unshared first.

If the conversion goes wrong, you have seven days to revert. After day seven, the original secret is permanently invalidated and you have to create a fresh connection.

## Troubleshooting

**`AADSTS70021: No matching federated identity record found for presented assertion subject`.** The subject in the OIDC token from Azure DevOps does not match the `subject` on the federated credential. This happens when you rename the service connection after creation, or when you manually pin the subject to a stale value. Fix by deleting and re-creating the federated credential on the app registration with the current subject from the connection's metadata. The subject format Azure DevOps emits is `sc://<organization>/<project>/<connection-name>`.

**`AuthorizationFailed: The client '<id>' does not have authorization to perform action '<action>' over scope '/subscriptions/...'`.** The service principal exists and authenticated successfully, but RBAC on the target resource is missing or wrong. Open the resource in the portal, go to `Access control (IAM) > Role assignments`, and confirm the service principal has a role that includes the failed action. The default `Contributor` role does not include role-assignment writes, which catches teams trying to grant Key Vault access from inside a deploy.

**Subscription not listed in the dropdown when creating the connection.** Two common causes. You are over the 50-subscription cap on the dropdown, in which case the workaround is to create a dedicated Entra user for service-connection creation. Or your cached user token in Azure DevOps is stale, in which case signing out, clearing cookies, and signing back in fixes it. Microsoft Learn documents both.

**Pipeline fails with `Resource not authorized. You need to authorize the resource before it can be used.`** The connection exists, but the specific pipeline has not been granted access. Go to `Project settings > Service connections`, pick the connection, then `More actions (...) > Security > Pipeline permissions`, and add the pipeline.

**Tenant blocks the automatic flow because `Users can register applications` is set to `No`.** Ask the tenant admin to flip it, or fall back to `App registration (manual)` with workload identity federation. The manual flow has you create the app registration yourself, configure the federated credential pointing at `https://vstoken.dev.azure.com/<organization-id>`, and then paste the client ID and tenant ID into Azure DevOps.

## Clean up

If this was a proof of concept and you want everything gone:

```bash
SC_ID="<service-connection-id>"
ORG="https://dev.azure.com/contoso"
PROJECT="payments-platform"

az rest \
  --resource 499b84ac-1321-427f-aa17-267ca6975798 \
  -u "$ORG/$PROJECT/_apis/serviceendpoint/endpoints/$SC_ID?deep=true&api-version=7.1" \
  -m DELETE
```

`deep=true` tells Azure DevOps to also delete the app registration it created. If you set `deep=false`, the connection record disappears but the app registration stays in Entra ID, which is occasionally what you want when other systems reference the same app registration.

Verify the app registration is gone in `Microsoft Entra ID > App registrations`, and confirm the role assignment is gone from the subscription's `Access control (IAM)` panel.

That is the build. The pipeline holds nothing sensitive. The Entra audit log shows every token exchange. Rotation is no longer in anyone's calendar because there is nothing to rotate. The next time someone asks who owns the secret on the prod ARM connection, the answer is no one, because there is no secret.
