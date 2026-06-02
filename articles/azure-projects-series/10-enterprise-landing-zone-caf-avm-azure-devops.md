# AZURE PROJECT: Enterprise landing zone with the Cloud Adoption Framework, Azure Verified Modules, and management groups, deployed via Azure DevOps

Every Fortune 500 that onboards to Azure builds the same thing first: the landing zone. The Cloud Adoption Framework (CAF) reference architecture from Microsoft spells out the management group hierarchy, the platform subscriptions, the policy assignments, and the subscription vending process. We are going to wire all that up using Azure Verified Modules (AVM) in Bicep, run the deployments through Azure DevOps multi-stage pipelines, and put a subscription vending form on the Azure DevOps wiki so a developer can request a new subscription and get it provisioned with policy baked in.

Same pattern I used on a 20,000-employee retail bank rollout & a smaller pharma tenant. Shape is identical at both scales.

## Tools used

- Azure (tenant, management groups, subscriptions)
- Azure Verified Modules (AVM) for Bicep, the Microsoft published modules at `br/public:avm/...`
- Bicep CLI v0.30 or later, with the `az bicep` extension
- Azure DevOps (Repos, Pipelines, Wiki, Boards)
- AzureCLI@2 task on Microsoft hosted ubuntu-latest agents
- Azure Policy & policy initiatives (policySets)
- Log Analytics, Microsoft Sentinel, Azure Firewall, Azure Bastion, Key Vault, Microsoft Purview
- Microsoft Entra ID for the service principal that runs the deployments

## Prerequisites

- Owner role at the tenant root group, or at minimum User Access Administrator + Contributor at the tenant root scope. Without this, the pipeline cannot create management groups or assign policies at root.
- An EA, MCA, or MPA billing account with at least 5 subscriptions you can move around. For a fresh tenant you can use the trial subscription as the bootstrap scope.
- Azure DevOps organisation with parallel jobs enabled for Microsoft hosted agents.
- A service principal (or workload identity federation, which is what I use now) granted Owner on the tenant root group. Save the service connection name; we will reference it in YAML.
- Azure CLI 2.60 or later locally if you want to bootstrap by hand before the pipeline runs.

## Project Architecture

We will end up with this tree:

```
Tenant Root Group
  - Platform
      - Identity        (subscription: sub-platform-identity)
      - Management      (subscription: sub-platform-mgmt)
      - Connectivity    (subscription: sub-platform-connectivity)
  - Landing Zones
      - Corp            (private workloads)
      - Online          (internet facing workloads)
  - Sandbox             (subscription: sub-sandbox-01)
  - Decommissioned      (parking lot for subs being torn down)
```

Platform hosts the three shared-services subscriptions. Connectivity holds the hub VNet, Azure Firewall, Bastion, ExpressRoute/VPN. Management holds the Log Analytics workspace, Sentinel, Automation Account, central Recovery Services Vault. Identity holds domain controllers or Entra Domain Services. Landing Zones is where app subscriptions sit, nested under Corp or Online so they inherit the right policies. Sandbox is loose, Decommissioned is locked.

Every resource gets four mandatory tags: `cost-center`, `environment`, `owner`, `data-classification`. Policy denies any deployment missing them.

## Step 1. Lay out the repo

Create an Azure DevOps project called `platform-alz` with a repo of this shape.

```
platform-alz/
├── README.md
├── pipelines/
│   ├── 01-mgmt-groups.yml
│   ├── 02-platform-subs.yml
│   ├── 03-policies.yml
│   ├── 04-connectivity.yml
│   ├── 05-management.yml
│   └── 06-identity.yml
├── bicep/
│   ├── mgmt-groups/
│   │   └── main.bicep
│   ├── policies/
│   │   ├── initiative-tagging.bicep
│   │   ├── initiative-network.bicep
│   │   └── assignments.bicep
│   ├── connectivity/
│   │   ├── hub.bicep
│   │   └── firewall.bicep
│   ├── management/
│   │   ├── law-sentinel.bicep
│   │   └── automation.bicep
│   └── identity/
│       └── identity.bicep
├── vending/
│   ├── azure-pipelines-vending.yml
│   ├── vending-form.md
│   └── bicep/
│       └── subscription.bicep
└── azure-pipelines.yml
```

Push this skeleton to `main`. We will fill the files step by step. Use branch policies on `main` so every change goes through a PR with one reviewer plus a passing build validation.

## Step 2: Bootstrap the service connection

Run the following az CLI to create the service principal that the pipeline will use. You need Owner at root for this to work.

```bash
az login --tenant <your-tenant-id>

SP_NAME="sp-alz-bootstrap"
TENANT_ID=$(az account show --query tenantId -o tsv)
ROOT_MG_ID="/providers/Microsoft.Management/managementGroups/${TENANT_ID}"

az ad sp create-for-rbac \
  --name "$SP_NAME" \
  --role Owner \
  --scopes "$ROOT_MG_ID"
```

Capture the `appId`, `password`, `tenant` from the output. In Azure DevOps go to Project Settings, Service connections, New service connection, ARM, Service principal (manual). Paste the values, set scope level to `Management Group`, point at the Tenant Root Group, name it `sc-alz-root`. If you have workload identity federation enabled, use that instead; it kills the secret rotation problem.

## Step 3. Deploy the management group hierarchy

Create `bicep/mgmt-groups/main.bicep` and paste the following. This is plain ARM `Microsoft.Management/managementGroups`, not an AVM module, because AVM does not ship a mgmt-group module yet & this resource is simple enough.

```bicep
targetScope = 'tenant'

param tenantRootGroupId string = tenant().tenantId

resource platform 'Microsoft.Management/managementGroups@2023-04-01' = {
  name: 'mg-platform'
  properties: {
    displayName: 'Platform'
    details: {
      parent: {
        id: '/providers/Microsoft.Management/managementGroups/${tenantRootGroupId}'
      }
    }
  }
}

resource landingZones 'Microsoft.Management/managementGroups@2023-04-01' = {
  name: 'mg-landingzones'
  properties: {
    displayName: 'Landing Zones'
    details: {
      parent: {
        id: '/providers/Microsoft.Management/managementGroups/${tenantRootGroupId}'
      }
    }
  }
}

resource corp 'Microsoft.Management/managementGroups@2023-04-01' = {
  name: 'mg-corp'
  properties: {
    displayName: 'Corp'
    details: {
      parent: {
        id: landingZones.id
      }
    }
  }
}

resource online 'Microsoft.Management/managementGroups@2023-04-01' = {
  name: 'mg-online'
  properties: {
    displayName: 'Online'
    details: {
      parent: {
        id: landingZones.id
      }
    }
  }
}

resource sandbox 'Microsoft.Management/managementGroups@2023-04-01' = {
  name: 'mg-sandbox'
  properties: {
    displayName: 'Sandbox'
    details: {
      parent: {
        id: '/providers/Microsoft.Management/managementGroups/${tenantRootGroupId}'
      }
    }
  }
}

resource decom 'Microsoft.Management/managementGroups@2023-04-01' = {
  name: 'mg-decommissioned'
  properties: {
    displayName: 'Decommissioned'
    details: {
      parent: {
        id: '/providers/Microsoft.Management/managementGroups/${tenantRootGroupId}'
      }
    }
  }
}
```

Now create `pipelines/01-mgmt-groups.yml`.

```yaml
trigger:
  branches:
    include:
      - main
  paths:
    include:
      - bicep/mgmt-groups/**

pool:
  vmImage: ubuntu-latest

stages:
  - stage: Validate
    jobs:
      - job: Lint
        steps:
          - task: AzureCLI@2
            displayName: Bicep build
            inputs:
              azureSubscription: sc-alz-root
              scriptType: bash
              scriptLocation: inlineScript
              inlineScript: |
                az bicep build --file bicep/mgmt-groups/main.bicep
  - stage: Deploy
    dependsOn: Validate
    jobs:
      - deployment: DeployMG
        environment: prod-tenant
        strategy:
          runOnce:
            deploy:
              steps:
                - checkout: self
                - task: AzureCLI@2
                  inputs:
                    azureSubscription: sc-alz-root
                    scriptType: bash
                    scriptLocation: inlineScript
                    inlineScript: |
                      az deployment tenant create \
                        --name "mg-$(Build.BuildId)" \
                        --location uksouth \
                        --template-file bicep/mgmt-groups/main.bicep
```

Notice `targetScope = 'tenant'` and `az deployment tenant create`. Mgmt-group resources live at tenant scope, not in a sub; forget that and you get a 400.

## Step 4: Move the subscriptions

Once the tree exists, move existing subscriptions into the right mgmt groups. CLI, portal, or Bicep via `Microsoft.Management/managementGroups/subscriptions` all work. For a one-off bootstrap I use the CLI:

```bash
az account management-group subscription add \
  --name mg-platform \
  --subscription <sub-platform-identity-id>

az account management-group subscription add \
  --name mg-platform \
  --subscription <sub-platform-mgmt-id>

az account management-group subscription add \
  --name mg-platform \
  --subscription <sub-platform-connectivity-id>

az account management-group subscription add \
  --name mg-corp \
  --subscription <sub-app-corp-prod-id>
```

If your org uses EA with the subscription creation API you can also create subs from Bicep using `Microsoft.Subscription/aliases`. We use that pattern in Step 9.

## Step 5: Apply policies at mgmt-group scope

This is the part that matters most. Policies at the right scope save you from a thousand support tickets later.

Create `bicep/policies/initiative-tagging.bicep`.

```bicep
targetScope = 'managementGroup'

resource requireTags 'Microsoft.Authorization/policySetDefinitions@2023-04-01' = {
  name: 'init-require-tags'
  properties: {
    displayName: 'Require mandatory tags on all resources'
    description: 'cost-center, environment, owner, data-classification are mandatory.'
    policyType: 'Custom'
    policyDefinitions: [
      {
        policyDefinitionId: '/providers/Microsoft.Authorization/policyDefinitions/871b6d14-10aa-478d-b590-94f262ecfa99'
        parameters: {
          tagName: { value: 'cost-center' }
        }
      }
      {
        policyDefinitionId: '/providers/Microsoft.Authorization/policyDefinitions/871b6d14-10aa-478d-b590-94f262ecfa99'
        parameters: {
          tagName: { value: 'environment' }
        }
      }
      {
        policyDefinitionId: '/providers/Microsoft.Authorization/policyDefinitions/871b6d14-10aa-478d-b590-94f262ecfa99'
        parameters: {
          tagName: { value: 'owner' }
        }
      }
      {
        policyDefinitionId: '/providers/Microsoft.Authorization/policyDefinitions/871b6d14-10aa-478d-b590-94f262ecfa99'
        parameters: {
          tagName: { value: 'data-classification' }
        }
      }
    ]
  }
}
```

The GUID `871b6d14-10aa-478d-b590-94f262ecfa99` is Microsoft's built-in `Require a tag on resources` definition. Built-ins live under `/providers/Microsoft.Authorization/policyDefinitions/` at tenant scope.

Now create `bicep/policies/initiative-network.bicep` to deny public IPs everywhere except the connectivity subscription, and audit unencrypted storage.

```bicep
targetScope = 'managementGroup'

resource denyPublicIp 'Microsoft.Authorization/policyDefinitions@2023-04-01' = {
  name: 'deny-public-ip'
  properties: {
    displayName: 'Deny Public IP outside connectivity sub'
    policyType: 'Custom'
    mode: 'All'
    policyRule: {
      if: {
        field: 'type'
        equals: 'Microsoft.Network/publicIPAddresses'
      }
      then: {
        effect: 'deny'
      }
    }
  }
}

resource auditUnencryptedStorage 'Microsoft.Authorization/policyDefinitions@2023-04-01' = {
  name: 'audit-storage-encryption'
  properties: {
    displayName: 'Audit storage accounts without infrastructure encryption'
    policyType: 'Custom'
    mode: 'All'
    policyRule: {
      if: {
        allOf: [
          {
            field: 'type'
            equals: 'Microsoft.Storage/storageAccounts'
          }
          {
            field: 'Microsoft.Storage/storageAccounts/encryption.requireInfrastructureEncryption'
            notEquals: true
          }
        ]
      }
      then: {
        effect: 'audit'
      }
    }
  }
}
```

Then assign both initiatives at the Landing Zones mgmt group with `notScopes` set to the connectivity subscription so the firewall public IP is allowed.

```bicep
targetScope = 'managementGroup'

param connectivitySubId string

resource assignTags 'Microsoft.Authorization/policyAssignments@2023-04-01' = {
  name: 'assign-require-tags'
  properties: {
    displayName: 'Require mandatory tags'
    policyDefinitionId: extensionResourceId(managementGroup().id, 'Microsoft.Authorization/policySetDefinitions', 'init-require-tags')
    enforcementMode: 'Default'
  }
}

resource assignDenyPip 'Microsoft.Authorization/policyAssignments@2023-04-01' = {
  name: 'assign-deny-public-ip'
  properties: {
    displayName: 'Deny public IP except connectivity'
    policyDefinitionId: extensionResourceId(managementGroup().id, 'Microsoft.Authorization/policyDefinitions', 'deny-public-ip')
    notScopes: [
      '/subscriptions/${connectivitySubId}'
    ]
    enforcementMode: 'Default'
  }
}
```

Per the Azure Policy docs, an assignment binds a definition (or `policySet`, a.k.a. initiative) to a scope. Children inherit, `notScopes` excludes, effects `deny`, `audit`, `deployIfNotExists`, `modify`, `auditIfNotExists` control behaviour. Start new policies on `audit` for a week before flipping to `deny`; this is straight from Microsoft's recommendations & I learned it the hard way after blocking a production hotfix in week 1.

## Step 6: Connectivity subscription, hub VNet with AVM

Use the AVM Bicep module for the virtual network. Public reference is `br/public:avm/res/network/virtual-network` at version 0.5.0 at time of writing.

```bicep
targetScope = 'subscription'

param location string = 'uksouth'
param hubVnetName string = 'vnet-hub-uksouth'

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'rg-connectivity-hub'
  location: location
  tags: {
    'cost-center': 'CC-PLATFORM-001'
    environment: 'prod'
    owner: 'platform-team@contoso.com'
    'data-classification': 'internal'
  }
}

module hubVnet 'br/public:avm/res/network/virtual-network:0.5.0' = {
  scope: rg
  name: 'hub-vnet'
  params: {
    name: hubVnetName
    location: location
    addressPrefixes: [
      '10.0.0.0/16'
    ]
    subnets: [
      {
        name: 'AzureFirewallSubnet'
        addressPrefix: '10.0.1.0/26'
      }
      {
        name: 'AzureBastionSubnet'
        addressPrefix: '10.0.2.0/26'
      }
      {
        name: 'GatewaySubnet'
        addressPrefix: '10.0.3.0/27'
      }
      {
        name: 'snet-shared'
        addressPrefix: '10.0.10.0/24'
      }
    ]
    tags: {
      'cost-center': 'CC-PLATFORM-001'
      environment: 'prod'
      owner: 'platform-team@contoso.com'
      'data-classification': 'internal'
    }
  }
}

module firewall 'br/public:avm/res/network/azure-firewall:0.5.0' = {
  scope: rg
  name: 'hub-fw'
  params: {
    name: 'afw-hub-uksouth'
    location: location
    azureSkuTier: 'Premium'
    virtualNetworkResourceId: hubVnet.outputs.resourceId
    publicIPAddressObject: {
      name: 'pip-afw-hub'
    }
  }
}

module bastion 'br/public:avm/res/network/bastion-host:0.4.0' = {
  scope: rg
  name: 'hub-bastion'
  params: {
    name: 'bas-hub-uksouth'
    location: location
    virtualNetworkResourceId: hubVnet.outputs.resourceId
    skuName: 'Standard'
  }
}
```

AVM modules are versioned, signed, pinned via `br/public:` to Microsoft's public registry. Pin the version explicitly so a module bump does not silently change behaviour on the next run.

## Step 7: Management subscription, Log Analytics + Sentinel

```bicep
targetScope = 'subscription'

param location string = 'uksouth'

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'rg-management'
  location: location
}

module law 'br/public:avm/res/operational-insights/workspace:0.7.0' = {
  scope: rg
  name: 'law-platform'
  params: {
    name: 'log-platform-uksouth'
    location: location
    dataRetention: 90
    skuName: 'PerGB2018'
  }
}

resource sentinel 'Microsoft.OperationsManagement/solutions@2015-11-01-preview' = {
  scope: rg
  name: 'SecurityInsights(log-platform-uksouth)'
  location: location
  properties: {
    workspaceResourceId: law.outputs.resourceId
  }
  plan: {
    name: 'SecurityInsights(log-platform-uksouth)'
    publisher: 'Microsoft'
    product: 'OMSGallery/SecurityInsights'
    promotionCode: ''
  }
}
```

The Log Analytics workspace ID is what every other sub points at for diagnostic settings. Output the resource ID and reference it from a `deployIfNotExists` policy that auto-attaches diagnostic settings to every new resource.

## Step 8: The master pipeline

Glue everything into `azure-pipelines.yml`. Stages run in dependency order; mgmt groups before policies before connectivity, because assignments need the scopes to exist & connectivity needs the platform sub in the right group.

```yaml
trigger:
  branches:
    include:
      - main

variables:
  serviceConnection: sc-alz-root
  connectivitySubId: 11111111-2222-3333-4444-555555555555
  managementSubId: 22222222-3333-4444-5555-666666666666

pool:
  vmImage: ubuntu-latest

stages:
  - stage: MgmtGroups
    jobs:
      - template: pipelines/01-mgmt-groups.yml

  - stage: Policies
    dependsOn: MgmtGroups
    jobs:
      - job: DeployPolicies
        steps:
          - task: AzureCLI@2
            inputs:
              azureSubscription: $(serviceConnection)
              scriptType: bash
              scriptLocation: inlineScript
              inlineScript: |
                az deployment mg create \
                  --management-group-id mg-landingzones \
                  --location uksouth \
                  --template-file bicep/policies/initiative-tagging.bicep
                az deployment mg create \
                  --management-group-id mg-landingzones \
                  --location uksouth \
                  --template-file bicep/policies/initiative-network.bicep
                az deployment mg create \
                  --management-group-id mg-landingzones \
                  --location uksouth \
                  --template-file bicep/policies/assignments.bicep \
                  --parameters connectivitySubId=$(connectivitySubId)

  - stage: Connectivity
    dependsOn: Policies
    jobs:
      - job: DeployHub
        steps:
          - task: AzureCLI@2
            inputs:
              azureSubscription: $(serviceConnection)
              scriptType: bash
              scriptLocation: inlineScript
              inlineScript: |
                az account set --subscription $(connectivitySubId)
                az deployment sub create \
                  --location uksouth \
                  --template-file bicep/connectivity/hub.bicep

  - stage: Management
    dependsOn: Policies
    jobs:
      - job: DeployLaw
        steps:
          - task: AzureCLI@2
            inputs:
              azureSubscription: $(serviceConnection)
              scriptType: bash
              scriptLocation: inlineScript
              inlineScript: |
                az account set --subscription $(managementSubId)
                az deployment sub create \
                  --location uksouth \
                  --template-file bicep/management/law-sentinel.bicep
```

Connectivity and Management run in parallel once Policies finishes.

## Step 9: Subscription vending from the wiki

The part that makes developers happy. Create a wiki page called `Request a subscription` with a form that asks for: requested name, business unit, environment, cost-center, data-classification, target mgmt group (`mg-corp` or `mg-online`), approving manager. Dev fills it in, raises a work item from the page, work item triggers a pipeline.

Create `vending/bicep/subscription.bicep`.

```bicep
targetScope = 'managementGroup'

param subAlias string
param subDisplayName string
param billingScope string
param targetMgmtGroup string
param costCenter string
param environment string
param dataClassification string

resource sub 'Microsoft.Subscription/aliases@2021-10-01' = {
  scope: tenant()
  name: subAlias
  properties: {
    displayName: subDisplayName
    workload: 'Production'
    billingScope: billingScope
    additionalProperties: {
      managementGroupId: '/providers/Microsoft.Management/managementGroups/${targetMgmtGroup}'
      tags: {
        'cost-center': costCenter
        environment: environment
        'data-classification': dataClassification
        owner: 'pending'
      }
    }
  }
}

output subscriptionId string = sub.properties.subscriptionId
```

`Microsoft.Subscription/aliases` is how you create a sub from Bicep against an EA or MCA billing scope. `billingScope` is the billing account ID, looks like `/providers/Microsoft.Billing/billingAccounts/<id>/enrollmentAccounts/<id>` for EA, or `/providers/Microsoft.Billing/billingAccounts/<id>/billingProfiles/<id>/invoiceSections/<id>` for MCA.

Then `vending/azure-pipelines-vending.yml`.

```yaml
trigger: none

parameters:
  - name: subAlias
    type: string
  - name: subDisplayName
    type: string
  - name: targetMgmtGroup
    type: string
    values:
      - mg-corp
      - mg-online
      - mg-sandbox
  - name: costCenter
    type: string
  - name: environment
    type: string
    values:
      - dev
      - test
      - prod
  - name: dataClassification
    type: string
    values:
      - public
      - internal
      - confidential
      - restricted

pool:
  vmImage: ubuntu-latest

stages:
  - stage: Approve
    jobs:
      - job: WaitForApproval
        pool: server
        timeoutInMinutes: 4320
        steps:
          - task: ManualValidation@0
            inputs:
              notifyUsers: platform-team@contoso.com
              instructions: Approve subscription vending request

  - stage: Provision
    dependsOn: Approve
    jobs:
      - job: VendSub
        steps:
          - task: AzureCLI@2
            inputs:
              azureSubscription: sc-alz-root
              scriptType: bash
              scriptLocation: inlineScript
              inlineScript: |
                az deployment mg create \
                  --management-group-id ${{ parameters.targetMgmtGroup }} \
                  --location uksouth \
                  --template-file vending/bicep/subscription.bicep \
                  --parameters \
                    subAlias=${{ parameters.subAlias }} \
                    subDisplayName="${{ parameters.subDisplayName }}" \
                    billingScope="$(billingScope)" \
                    targetMgmtGroup=${{ parameters.targetMgmtGroup }} \
                    costCenter=${{ parameters.costCenter }} \
                    environment=${{ parameters.environment }} \
                    dataClassification=${{ parameters.dataClassification }}
```

Pipeline waits for platform-team approval, creates the sub, drops it in the right mgmt group, tags it, policy inheritance does the rest. Form to working sub in about 4 minutes once approved.

## Troubleshooting

i> `AuthorizationFailed` at tenant scope when creating mgmt groups: the service principal does not have Owner at the root mgmt group. Run `az role assignment create --assignee <sp-app-id> --role Owner --scope "/providers/Microsoft.Management/managementGroups/<tenantId>"` from an account that has User Access Administrator at root. Microsoft requires you to toggle Global Admin to root scope once via the portal, Properties, Access management for Azure resources switch.

ii> Policy assignment fails with `The policy definition ID is invalid`: usually means you referenced a built-in by GUID but typed it wrong, or you targeted a custom definition that has not been deployed yet. Built-ins live at `/providers/Microsoft.Authorization/policyDefinitions/<guid>`, custom ones at `/providers/Microsoft.Management/managementGroups/<mgId>/providers/Microsoft.Authorization/policyDefinitions/<name>`. Two different paths, easy to mix up.

iii> AVM module version not found: the registry path is `br/public:avm/res/<category>/<module>:<version>`. If you typo the version (e.g. `0.5` instead of `0.5.0`) Bicep returns a confusing 404. Check the AVM module index on GitHub for the exact published versions before pinning.

iv> Sub created but did not land in the right mgmt group: known race. `Microsoft.Subscription/aliases` returns success before the mgmt group move is propagated. Add an `az account management-group subscription add` step as a safety net after the deployment.

## Clean up

If this is a sandbox tenant and you want to tear the whole thing down, run:

```bash
az account management-group subscription remove --name mg-platform --subscription <sub-id>
az policy assignment delete --name assign-require-tags --scope "/providers/Microsoft.Management/managementGroups/mg-landingzones"
az policy assignment delete --name assign-deny-public-ip --scope "/providers/Microsoft.Management/managementGroups/mg-landingzones"
az policy set-definition delete --name init-require-tags --management-group mg-landingzones
az account management-group delete --name mg-corp
az account management-group delete --name mg-online
az account management-group delete --name mg-landingzones
az account management-group delete --name mg-platform
az account management-group delete --name mg-sandbox
az account management-group delete --name mg-decommissioned
```

Mgmt groups must be empty before deletion. Skip the sub move-out step and the delete throws `ChildResourceFound`.

If you have followed carefully you must have noticed we did not wire diagnostic-settings auto-attach via `deployIfNotExists`, and we did not deploy Microsoft Purview into the management sub. Add a Purview AVM module to `bicep/management/` and a `deployIfNotExists` policy that targets every storage account, key vault, SQL server in the tenant, pointing diagnostics at the central Log Analytics workspace. Once those two are in, you have the same baseline Microsoft ships in their CAF accelerator, built by you in your own repo, which is what every regulated Fortune 500 ends up doing because the accelerator is a starting point not a destination.

#azure #azuredevops #devops #caf #landingzone #bicep #avm #azurepolicy #fortune500 #seniordevopsengineer
