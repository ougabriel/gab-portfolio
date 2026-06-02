# AZURE PROJECT: Azure API Management as code with versions, revisions, named values, products, and policy testing in a multi-stage pipeline

Every bank, insurer & government agency that exposes APIs ends up at the same place: a Premium APIM instance inside a VNet, fronting a pile of backend services, with policies that nobody wants to edit in the portal because a wrong click takes down a payment endpoint. The fix is to treat APIM the way you treat any other production system: git, pipelines, code review, multi-stage deploy. This walkthrough builds the whole thing: OpenAPI specs in a git repo, named values pulled from Key Vault, policy XML reviewed via pull request, and an Azure Pipelines multi-stage YAML that goes dev to staging to prod with a gated approval.

## Tools used

- **Azure API Management (Premium tier)** for the gateway, supports multi-region deploy, internal VNet integration, and availability zones per Microsoft Learn
- **Azure DevOps** with Azure Repos & Azure Pipelines for source control and the multi-stage YAML pipeline
- **Azure APIOps Toolkit** (github.com/Azure/APIOps) for the extractor + publisher round-trip of APIM config
- **Bicep** for the platform layer (APIM instance, Key Vault, VNet)
- **OpenAPI 3.0** specs for the API definitions
- **Spectral** for OAS linting in the validate stage
- **Newman** (Postman CLI) for smoke tests after each deploy
- **Azure Key Vault** for backing the APIM named values that hold secrets

## Prerequisites

- An Azure subscription where you can spin up a Premium APIM (be aware: roughly $2,800/month for a single unit in one region)
- An Azure DevOps organisation & project with the ability to create service connections
- Owner or Contributor on the resource group you will deploy into
- Azure CLI 2.60+ installed locally for the bootstrap
- Bicep CLI 0.27+ (ships with az cli)
- Node 20 LTS for spectral & newman
- A working OpenAPI 3 spec for at least one real API; this article uses a sample `orders-api` spec

## Project Architecture

Three APIM instances across three environments: `apim-dev`, `apim-stg`, `apim-prod`. Dev is Developer tier so the bill stays sane. Staging is Standard v2. Prod is Premium with two regions (UK South primary, North Europe secondary) and Internal VNet mode so the gateway only listens on a private IP. A Key Vault per environment holds the secrets that back the APIM named values (JWT keys, backend API keys, App Insights instrumentation key). The pipeline takes OpenAPI specs and policy XML from the git repo and applies them through the APIOps publisher: validate, dev deploy, smoke test, staging deploy, smoke test, prod deploy (gated).

## Step 1. Bootstrap the resource groups & Key Vault

Run the following commands to create the three resource groups & the service principal the pipeline will use:

```bash
az group create -n rg-apim-dev   -l uksouth
az group create -n rg-apim-stg   -l uksouth
az group create -n rg-apim-prod  -l uksouth

az ad sp create-for-rbac \
  --name sp-apim-pipeline \
  --role Contributor \
  --scopes /subscriptions/<sub-id>/resourceGroups/rg-apim-dev \
           /subscriptions/<sub-id>/resourceGroups/rg-apim-stg \
           /subscriptions/<sub-id>/resourceGroups/rg-apim-prod \
  --sdk-auth
```

Capture the JSON output, you will paste it into Azure DevOps as a service connection in Step 3.

Create a Key Vault per environment & seed it with two secrets that the named values will pull from:

```bash
az keyvault create -n kv-apim-dev -g rg-apim-dev -l uksouth --enable-rbac-authorization true
az keyvault secret set --vault-name kv-apim-dev --name jwt-signing-key   --value "$(openssl rand -base64 48)"
az keyvault secret set --vault-name kv-apim-dev --name orders-backend-key --value "$(openssl rand -hex 24)"
```

Do the same for stg & prod, three Key Vaults total. Different secret values per environment is the whole point.

## Step 2: Lay down the APIM platform with Bicep

Paste the following into `infra/apim.bicep`. This is the platform layer, the APIs themselves go in via the pipeline later.

```bicep
@description('APIM instance name')
param apimName string

@description('SKU name: Developer, StandardV2, Premium')
@allowed([
  'Developer'
  'StandardV2'
  'Premium'
])
param skuName string = 'Developer'

@description('Capacity units')
param skuCapacity int = 1

param location string = resourceGroup().location
param publisherEmail string
param publisherName string
param keyVaultName string

param enableVnet bool = false
param subnetResourceId string = ''

resource apim 'Microsoft.ApiManagement/service@2024-05-01' = {
  name: apimName
  location: location
  sku: {
    name: skuName
    capacity: skuCapacity
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    publisherEmail: publisherEmail
    publisherName: publisherName
    virtualNetworkType: enableVnet ? 'Internal' : 'None'
    virtualNetworkConfiguration: enableVnet ? {
      subnetResourceId: subnetResourceId
    } : null
    publicNetworkAccess: enableVnet ? 'Disabled' : 'Enabled'
  }
}

resource kv 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource kvRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: kv
  name: guid(kv.id, apim.id, 'kv-secrets-user')
  properties: {
    // Key Vault Secrets User
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
    principalId: apim.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

output apimName string = apim.name
output apimPrincipalId string = apim.identity.principalId
```

Then a parameter file per environment, here is `infra/apim.prod.bicepparam`:

```bicep
using './apim.bicep'

param apimName        = 'apim-orders-prod'
param skuName         = 'Premium'
param skuCapacity     = 1
param publisherEmail  = 'platform@example.co.uk'
param publisherName   = 'Platform Team'
param keyVaultName    = 'kv-apim-prod'
param enableVnet      = true
param subnetResourceId = '/subscriptions/<sub-id>/resourceGroups/rg-network-prod/providers/Microsoft.Network/virtualNetworks/vnet-prod/subnets/snet-apim'
```

For Premium multi-region, you add an `additionalLocations` block on the APIM properties; we will set that via the pipeline once the primary is up.

Deploy the dev instance manually once to make sure the Bicep is clean:

```bash
az deployment group create \
  -g rg-apim-dev \
  -f infra/apim.bicep \
  -p infra/apim.dev.bicepparam
```

The Developer tier provisions in roughly 25 minutes. Go make coffee.

## Step 3: Wire the Azure DevOps service connection & variable groups

In Azure DevOps go to Project Settings > Service connections > New > Azure Resource Manager > Service principal (manual). Paste the JSON from Step 1. Name it `azure-apim-rm`.

Then Library > + Variable group, create three groups:

- `apim-dev` with `apimName=apim-orders-dev`, `resourceGroup=rg-apim-dev`, `keyVaultName=kv-apim-dev`
- `apim-stg` with the staging values
- `apim-prod` with the prod values

For `apim-prod`, flip the "Link secrets from an Azure key vault" toggle and bind `jwt-signing-key` and `orders-backend-key` from `kv-apim-prod`. The pipeline reads those at the named-value sync step.

## Step 4: Lay out the repo

Source layout matters because the APIOps extractor & publisher walk the folder structure. Use this:

```
.
|-- infra/
|   |-- apim.bicep
|   |-- apim.dev.bicepparam
|   |-- apim.stg.bicepparam
|   `-- apim.prod.bicepparam
|-- apis/
|   `-- orders-api/
|       |-- specification.yaml         # OpenAPI 3
|       |-- policy.xml                 # API-scope policy
|       `-- operations/
|           `-- get-orders/policy.xml  # operation-scope policy
|-- products/
|   `-- partners/
|       `-- policy.xml                 # product-scope policy
|-- named-values/
|   `-- values.yaml
|-- policies/
|   `-- global.xml                     # global-scope policy
|-- tests/
|   `-- orders.postman_collection.json
|-- .spectral.yaml
`-- azure-pipelines.yml
```

The four policy scope names (global, workspace, product, API, operation) come straight from the API Management policies doc. We skip workspace scope for this project, you only need it if you are doing federated team workspaces.

## Step 5: Write a real APIM policy XML

Below is the API-scope policy for `apis/orders-api/policy.xml`. It does rate limiting, JWT validation against Entra ID, CORS, backend selection via a named value, and a custom error response. Note the four sections (`inbound`, `backend`, `outbound`, `on-error`) & the `<base />` element at the top of each section to inherit any global policy:

```xml
<policies>
  <inbound>
    <base />
    <cors allow-credentials="true">
      <allowed-origins>
        <origin>https://portal.example.co.uk</origin>
      </allowed-origins>
      <allowed-methods preflight-result-max-age="300">
        <method>GET</method>
        <method>POST</method>
        <method>PUT</method>
        <method>DELETE</method>
      </allowed-methods>
      <allowed-headers>
        <header>Authorization</header>
        <header>Content-Type</header>
        <header>x-correlation-id</header>
      </allowed-headers>
    </cors>

    <rate-limit-by-key calls="100"
                      renewal-period="60"
                      counter-key="@(context.Subscription?.Id ?? context.Request.IpAddress)" />

    <validate-jwt header-name="Authorization"
                  failed-validation-httpcode="401"
                  failed-validation-error-message="Unauthorized. Bearer token missing or invalid."
                  require-expiration-time="true"
                  require-scheme="Bearer"
                  require-signed-tokens="true">
      <openid-config url="https://login.microsoftonline.com/{{tenant-id}}/v2.0/.well-known/openid-configuration" />
      <required-claims>
        <claim name="aud">
          <value>api://orders-api</value>
        </claim>
      </required-claims>
    </validate-jwt>

    <set-header name="x-correlation-id" exists-action="skip">
      <value>@(Guid.NewGuid().ToString())</value>
    </set-header>

    <set-backend-service backend-id="orders-backend-pool" />
  </inbound>

  <backend>
    <base />
  </backend>

  <outbound>
    <base />
    <set-header name="x-powered-by" exists-action="delete" />
    <set-header name="server" exists-action="delete" />
  </outbound>

  <on-error>
    <base />
    <set-status code="500" reason="Internal Server Error" />
    <set-body>@{
      var err = context.LastError;
      return new JObject(
        new JProperty("correlationId", context.Request.Headers.GetValueOrDefault("x-correlation-id", "")),
        new JProperty("code", err.Source ?? "gateway"),
        new JProperty("message", err.Message ?? "Unexpected gateway error")
      ).ToString();
    }</set-body>
  </on-error>
</policies>
```

A few things to call out:

i> `{{tenant-id}}` is a named-value substitution. The pipeline injects the real tenant ID at deploy time so the same XML works across all three environments.

ii> `rate-limit-by-key` keys on subscription ID, falling back to IP when the caller is unauthenticated. That is the pattern banks use to keep rate limits sane for partner-key calls and public docs traffic at the same time.

iii> The `on-error` block builds a JSON body using a policy expression (the `@{ ... }` block). You get full C# in there.

## Step 6: Define the named values & backend pool

The named values are the contract between the policy XML and the per-environment Key Vault. Paste the following into `named-values/values.yaml`:

```yaml
namedValues:
  - name: tenant-id
    value: 11111111-2222-3333-4444-555555555555
    secret: false
  - name: orders-backend-key
    keyVault:
      secretIdentifier: https://kv-apim-{env}.vault.azure.net/secrets/orders-backend-key
    secret: true
  - name: jwt-signing-key
    keyVault:
      secretIdentifier: https://kv-apim-{env}.vault.azure.net/secrets/jwt-signing-key
    secret: true

backends:
  - name: orders-backend-pool
    type: pool
    services:
      - url: https://orders-uksouth.internal.example.co.uk
        weight: 80
      - url: https://orders-northeu.internal.example.co.uk
        weight: 20
    circuitBreaker:
      rules:
        - failureCondition:
            count: 5
            interval: PT1M
            statusCodeRanges:
              - min: 500
                max: 599
          name: ordersBackendBreaker
          tripDuration: PT30S
```

The `{env}` token is replaced at deploy time by the pipeline using the variable group name. This is how the same source code produces three different APIM configurations.

## Step 7: Multi-stage Azure Pipeline

Below is the YAML for `azure-pipelines.yml`. It implements validate, then deploy-dev with a smoke test, then deploy-stg with a smoke test, then a gated deploy-prod:

```yaml
trigger:
  branches:
    include:
      - main
  paths:
    include:
      - apis/**
      - products/**
      - policies/**
      - named-values/**
      - infra/**

variables:
  - name: vmImage
    value: ubuntu-latest

stages:
  - stage: Validate
    displayName: Validate OpenAPI & policy XML
    jobs:
      - job: lint
        pool:
          vmImage: $(vmImage)
        steps:
          - task: NodeTool@0
            inputs:
              versionSpec: '20.x'
          - script: |
              npm install -g @stoplight/spectral-cli@6.11.1
              spectral lint "apis/**/specification.yaml" --ruleset .spectral.yaml --fail-severity=error
            displayName: Spectral OAS lint
          - script: |
              for f in $(find apis products policies -name "*.xml"); do
                xmllint --noout "$f" || exit 1
              done
            displayName: XML well-formedness

  - stage: DeployDev
    displayName: Deploy to apim-dev
    dependsOn: Validate
    variables:
      - group: apim-dev
    jobs:
      - deployment: deploy_dev
        environment: apim-dev
        pool:
          vmImage: $(vmImage)
        strategy:
          runOnce:
            deploy:
              steps:
                - checkout: self
                - task: AzureCLI@2
                  displayName: Bicep deploy platform
                  inputs:
                    azureSubscription: azure-apim-rm
                    scriptType: bash
                    scriptLocation: inlineScript
                    inlineScript: |
                      az deployment group create \
                        -g $(resourceGroup) \
                        -f infra/apim.bicep \
                        -p infra/apim.dev.bicepparam
                - task: AzureCLI@2
                  displayName: APIOps publish
                  inputs:
                    azureSubscription: azure-apim-rm
                    scriptType: bash
                    scriptLocation: inlineScript
                    inlineScript: |
                      curl -L -o publisher https://github.com/Azure/apiops/releases/download/v6.0.1.4/publisher-linux-x64
                      chmod +x publisher
                      export AZURE_SUBSCRIPTION_ID=$(az account show --query id -o tsv)
                      export AZURE_RESOURCE_GROUP_NAME=$(resourceGroup)
                      export API_MANAGEMENT_SERVICE_NAME=$(apimName)
                      export API_MANAGEMENT_SERVICE_OUTPUT_FOLDER_PATH=$(Build.SourcesDirectory)
                      ./publisher
                - script: |
                    npm install -g newman@6.2.1
                    newman run tests/orders.postman_collection.json \
                      --env-var "gateway=https://$(apimName).azure-api.net" \
                      --env-var "subscriptionKey=$(devSubscriptionKey)" \
                      --bail
                  displayName: Newman smoke test

  - stage: DeployStg
    displayName: Deploy to apim-stg
    dependsOn: DeployDev
    variables:
      - group: apim-stg
    jobs:
      - deployment: deploy_stg
        environment: apim-stg
        pool:
          vmImage: $(vmImage)
        strategy:
          runOnce:
            deploy:
              steps:
                - checkout: self
                - task: AzureCLI@2
                  displayName: Bicep deploy platform
                  inputs:
                    azureSubscription: azure-apim-rm
                    scriptType: bash
                    scriptLocation: inlineScript
                    inlineScript: |
                      az deployment group create \
                        -g $(resourceGroup) \
                        -f infra/apim.bicep \
                        -p infra/apim.stg.bicepparam
                - task: AzureCLI@2
                  displayName: APIOps publish
                  inputs:
                    azureSubscription: azure-apim-rm
                    scriptType: bash
                    scriptLocation: inlineScript
                    inlineScript: |
                      curl -L -o publisher https://github.com/Azure/apiops/releases/download/v6.0.1.4/publisher-linux-x64
                      chmod +x publisher
                      export AZURE_SUBSCRIPTION_ID=$(az account show --query id -o tsv)
                      export AZURE_RESOURCE_GROUP_NAME=$(resourceGroup)
                      export API_MANAGEMENT_SERVICE_NAME=$(apimName)
                      export API_MANAGEMENT_SERVICE_OUTPUT_FOLDER_PATH=$(Build.SourcesDirectory)
                      ./publisher
                - script: |
                    npm install -g newman@6.2.1
                    newman run tests/orders.postman_collection.json \
                      --env-var "gateway=https://$(apimName).azure-api.net" \
                      --env-var "subscriptionKey=$(stgSubscriptionKey)" \
                      --bail
                  displayName: Newman smoke test

  - stage: DeployProd
    displayName: Deploy to apim-prod (gated)
    dependsOn: DeployStg
    variables:
      - group: apim-prod
    jobs:
      - deployment: deploy_prod
        environment: apim-prod   # add an approval check on this environment
        pool:
          vmImage: $(vmImage)
        strategy:
          runOnce:
            deploy:
              steps:
                - checkout: self
                - task: AzureCLI@2
                  displayName: Bicep deploy platform
                  inputs:
                    azureSubscription: azure-apim-rm
                    scriptType: bash
                    scriptLocation: inlineScript
                    inlineScript: |
                      az deployment group create \
                        -g $(resourceGroup) \
                        -f infra/apim.bicep \
                        -p infra/apim.prod.bicepparam
                - task: AzureCLI@2
                  displayName: APIOps publish
                  inputs:
                    azureSubscription: azure-apim-rm
                    scriptType: bash
                    scriptLocation: inlineScript
                    inlineScript: |
                      curl -L -o publisher https://github.com/Azure/apiops/releases/download/v6.0.1.4/publisher-linux-x64
                      chmod +x publisher
                      export AZURE_SUBSCRIPTION_ID=$(az account show --query id -o tsv)
                      export AZURE_RESOURCE_GROUP_NAME=$(resourceGroup)
                      export API_MANAGEMENT_SERVICE_NAME=$(apimName)
                      export API_MANAGEMENT_SERVICE_OUTPUT_FOLDER_PATH=$(Build.SourcesDirectory)
                      ./publisher
```

The approval gate is configured on the `apim-prod` environment, go to Pipelines > Environments > apim-prod > Approvals and checks, and add at least two named approvers from your platform team. That is the gate that stops a bad merge from rolling straight to prod.

## Step 8: Versions and revisions with traffic split

Versions are how you publish breaking changes (`/v1`, `/v2`) side by side. Revisions are non-breaking iterations of the same version where you can route a percentage of traffic to the new revision before flipping fully.

To make the orders API versioned, add this to `apis/orders-api/apiInformation.yaml`:

```yaml
properties:
  apiVersionSet:
    id: orders-version-set
    name: Orders
    versioningScheme: Segment
  apiVersion: v1
```

To add a v2 later, you commit a new folder `apis/orders-api-v2/` with its own spec & policy, and bind it to the same `orders-version-set`. Both versions become callable, `/orders/v1/...` and `/orders/v2/...`, at the same time.

For revisions, the publisher creates a new revision when the spec or policy changes. To split traffic 90/10 between revision 1 (current) and revision 2 (new), run:

```bash
az apim api release create \
  --resource-group rg-apim-prod \
  --service-name apim-orders-prod \
  --api-id orders-api;rev=2 \
  --release-id canary-2025 \
  --notes "Canary 10%"
```

Then set the routing weight in the gateway portal under the revisions tab. Once the new revision burns in clean for 48 hours, you set it to current and the canary is over.

## Step 9: Custom error responses

The `on-error` block in Step 5 already produces a JSON body for any gateway error, but you also want bespoke shapes for the common HTTP failure codes. Paste the following into `policies/global.xml`:

```xml
<policies>
  <inbound>
    <base />
  </inbound>
  <backend>
    <base />
  </backend>
  <outbound>
    <base />
    <choose>
      <when condition="@(context.Response.StatusCode == 404)">
        <set-body>{ "error": "not_found", "message": "Resource does not exist", "correlationId": "@(context.Request.Headers.GetValueOrDefault("x-correlation-id",""))" }</set-body>
      </when>
      <when condition="@(context.Response.StatusCode == 429)">
        <set-body>{ "error": "rate_limited", "message": "Too many requests. Retry later.", "correlationId": "@(context.Request.Headers.GetValueOrDefault("x-correlation-id",""))" }</set-body>
      </when>
    </choose>
  </outbound>
  <on-error>
    <base />
  </on-error>
</policies>
```

Because this is global scope and each API policy starts with `<base />`, every API inherits this error shaping for free. Banks and government agencies love this because their ops dashboards key off those JSON fields.

## Step 10: When is Standard enough, when do you need Premium

Premium classic starts at roughly $2,800 per unit per month, you usually run two units for resilience, so call it $5.6k a month per region. Multi-region doubles or triples that. Plenty of teams burn that money for features they never use.

You need Premium when:

- You require Internal VNet mode and cannot tolerate the v2 caveats
- You need multi-region active-active with regional failover
- You need availability zones in the same region
- You need more than the Standard tier capacity limits

Standard or Standard v2 is enough when you only need one region, you can tolerate the gateway on a public hostname with IP allow-listing, and your throughput fits Standard limits. Standard v2 also supports VNet integration to network-isolated backends. Read the Microsoft tier comparison page before you commit; the v2 tiers (Basic v2, Standard v2, Premium v2) provision faster and the cost curve is gentler.

## Troubleshooting

i> **Publisher reports `404 NotFound` on named values.** The APIM identity does not have Key Vault Secrets User on the vault. Re-run the Bicep, the role assignment in the template handles this, or grant it manually with `az role assignment create`.

ii> **`validate-jwt` returns 401 on a token that decodes fine at jwt.io.** Almost always the `aud` claim does not match the value in the policy, or the `openid-config` URL points at the wrong tenant. Check the named value `tenant-id` for the environment.

iii> **The publisher creates a new revision every run even when nothing changed.** This is a known APIOps behaviour when policy XML has trailing whitespace differences between extractor output and your committed file. Run the extractor once on the dev instance, commit the normalised output, and the publisher will go quiet.

iv> **CORS preflight returns 200 but the browser still complains.** The `allowed-origins` list is case sensitive on the scheme and host, `https://Portal.example.co.uk` is not the same as `https://portal.example.co.uk`. Lowercase it everywhere.

## Clean up

```bash
az group delete -n rg-apim-dev   --yes --no-wait
az group delete -n rg-apim-stg   --yes --no-wait
az group delete -n rg-apim-prod  --yes --no-wait
```

The Premium delete takes about 45 minutes to release the public IPs, plan around that if you want to redeploy into the same names.

if you have followed carefully you must have noticed we built one APIM with one orders API. The real-world version of this in a bank has 60 to 200 APIs, each with their own folder, spec, policy XML & newman collection. Same pipeline, same publisher, folder structure just gets longer. Try it: add a second API folder next to `orders-api/`, commit, push, watch the pipeline pick it up without a single YAML change. That is the whole point of APIM as code instead of clicking around the portal.

#azure #azureapimanagement #apim #azuredevops #devops #apiops #bicep #cicd #seniordevopsengineer #fortune500
