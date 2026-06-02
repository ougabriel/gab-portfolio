# AZURE PROJECT: HIPAA-bound healthcare data platform on Synapse, Purview, and Defender for Cloud, deployed via Azure DevOps

This project is the kind of build a health insurer, hospital network, or pharma data team actually ships. We put up an Azure Synapse Analytics workspace with a dedicated SQL pool and an Apache Spark pool, wire Microsoft Purview on top so it auto-classifies PHI inside the lake, lock every account behind private endpoints, encrypt with customer-managed keys from Key Vault HSM, and point Microsoft Defender for Cloud at it so the regulatory compliance dashboard tracks HIPAA HITRUST and HDS. The stack is deployed by Azure DevOps using Bicep, one subscription per environment (dev, test, prod). We also ingest a real claims file, mask SSN inside a Spark notebook, and emit cleaned parquet to a downstream container.

## Tools used

- **Azure Synapse Analytics** workspace with a dedicated SQL pool (DW100c) & an Apache Spark pool (Spark 3.4). Synapse Studio is the unified surface for SQL, Spark, & pipelines.
- **Microsoft Purview** Data Map and Unified Catalog. Scans the Synapse workspace and ADLS Gen2 and auto-classifies columns that look like SSN, MRN, DOB.
- **Microsoft Defender for Cloud** with Defender CSPM, Defender for Storage, Defender for Databases, & Defender for Key Vault on. Regulatory compliance dashboard tracks HIPAA HITRUST and HDS.
- **Azure Key Vault Premium (HSM)** holding the customer-managed key that wraps storage, the SQL pool TDE protector, and the Synapse workspace key.
- **Azure Policy** with the built-in HIPAA HITRUST initiative assigned to each environment subscription, plus custom tag and encryption policies set to `deny`.
- **Azure Private Link & Private DNS Zones** so nothing routes over the public internet.
- **Azure DevOps Pipelines** running Bicep deploys and the Synapse workspace deployment task (`AzureSynapseWorkspace@1`).
- **Azure CLI** 2.60+ and **Bicep** 0.27.x.

## Prerequisites

- Three Azure subscriptions, one each for `dev`, `test`, `prod`, all under the same Microsoft Entra tenant. HIPAA-bound workloads usually demand the subscription boundary.
- An Azure DevOps org and project. Service connections of type **Azure Resource Manager** with **Workload identity federation** to each subscription: `sc-healthdata-dev`, `sc-healthdata-test`, `sc-healthdata-prod`.
- Owner on each subscription for the first run, because we create role assignments and Key Vault access policies.
- Two Microsoft Entra groups: `grp-health-data-eng` and `grp-health-compliance`.
- Sample claims CSV with columns `claim_id, member_id, ssn, dob, mrn, diagnosis_code, billed_amount, paid_amount`.

## Project Architecture

ADLS Gen2 is the lake, with `raw`, `curated`, and `consumer` containers. Claims land in `raw` from an SFTP source (out of scope here). A Synapse pipeline triggers, runs a Spark notebook that masks SSN with SHA-256 + salt and drops DOB to year, then writes parquet to `curated`. A second pipeline loads `curated` into the dedicated SQL pool with PolyBase. Row-level security and dynamic data masking are on the SQL pool. Purview scans the lake nightly and tags the columns. Defender for Cloud reads the whole subscription with the HIPAA HITRUST initiative assigned at subscription scope. Everything talks over private endpoints inside one hub VNet per environment.

## Step 1. Bootstrap the resource groups, Key Vault HSM, and the customer-managed key

Run the following Azure CLI commands against the dev subscription first; we will repeat them for test and prod with different names later.

```bash
az account set --subscription "<dev-subscription-id>"
LOC=uksouth
RG=rg-health-dev-uks
KV=kv-health-dev-uks
KEY=cmk-synapse-dev

az group create -n $RG -l $LOC --tags env=dev compliance=hipaa data-class=phi

az keyvault create -n $KV -g $RG -l $LOC \
  --sku Premium \
  --enable-purge-protection true \
  --enable-rbac-authorization true \
  --public-network-access Disabled

az keyvault key create --vault-name $KV -n $KEY \
  --kty RSA-HSM --size 3072 --ops wrapKey unwrapKey
```

Premium vault because CMK for Synapse and Storage wants an HSM-protected key when you are claiming HIPAA HITRUST control 06.d. Purge protection on, public access off, RBAC data plane. Private endpoint goes on in Step 3.

## Step 2: Lay down the Bicep for the data platform

Below is the Bicep for the Synapse workspace, dedicated SQL pool, Spark pool, ADLS Gen2 storage, and the Purview account. Paste the following into `infra/main.bicep`:

```bicep
targetScope = 'resourceGroup'

@description('Environment name: dev, test, prod')
param env string

@description('Location for all resources')
param location string = resourceGroup().location

param keyVaultName string
param cmkName string
param adminLogin string
@secure()
param adminPassword string
param tenantId string = subscription().tenantId

var prefix = 'health-${env}'
var storageName = toLower('sthealth${env}${uniqueString(resourceGroup().id)}')
var synapseName = 'syn-${prefix}'
var purviewName = 'pv-${prefix}'
var sqlPoolName = 'claimsdw'
var sparkPoolName = 'sparkpool1'

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  kind: 'StorageV2'
  sku: { name: 'Standard_RAGRS' }
  properties: {
    isHnsEnabled: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    publicNetworkAccess: 'Disabled'
    supportsHttpsTrafficOnly: true
    encryption: {
      keySource: 'Microsoft.Keyvault'
      keyvaultproperties: {
        keyvaulturi: 'https://${keyVaultName}${environment().suffixes.keyvaultDns}'
        keyname: cmkName
      }
      services: {
        blob: { enabled: true }
        file: { enabled: true }
      }
    }
  }
  identity: { type: 'SystemAssigned' }
  tags: { env: env, compliance: 'hipaa', 'data-class': 'phi' }
}

resource containers 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = [for c in ['raw','curated','consumer']: {
  name: '${storage.name}/default/${c}'
}]

resource synapse 'Microsoft.Synapse/workspaces@2021-06-01' = {
  name: synapseName
  location: location
  identity: { type: 'SystemAssigned' }
  properties: {
    defaultDataLakeStorage: {
      accountUrl: storage.properties.primaryEndpoints.dfs
      filesystem: 'curated'
    }
    sqlAdministratorLogin: adminLogin
    sqlAdministratorLoginPassword: adminPassword
    managedVirtualNetwork: 'default'
    publicNetworkAccess: 'Disabled'
    managedResourceGroupName: 'rg-${synapseName}-managed'
    encryption: {
      cmk: {
        kekIdentity: { useSystemAssignedIdentity: true }
        key: {
          name: cmkName
          keyVaultUrl: 'https://${keyVaultName}${environment().suffixes.keyvaultDns}/keys/${cmkName}'
        }
      }
    }
  }
  tags: { env: env, compliance: 'hipaa' }
}

resource sqlPool 'Microsoft.Synapse/workspaces/sqlPools@2021-06-01' = {
  parent: synapse
  name: sqlPoolName
  location: location
  sku: { name: 'DW100c' }
  properties: {
    createMode: 'Default'
    collation: 'SQL_Latin1_General_CP1_CI_AS'
  }
}

resource sparkPool 'Microsoft.Synapse/workspaces/bigDataPools@2021-06-01' = {
  parent: synapse
  name: sparkPoolName
  location: location
  properties: {
    sparkVersion: '3.4'
    nodeSize: 'Small'
    nodeSizeFamily: 'MemoryOptimized'
    autoScale: { enabled: true, minNodeCount: 3, maxNodeCount: 10 }
    autoPause: { enabled: true, delayInMinutes: 15 }
    isComputeIsolationEnabled: false
    sessionLevelPackagesEnabled: true
  }
}

resource purview 'Microsoft.Purview/accounts@2021-12-01' = {
  name: purviewName
  location: location
  sku: { name: 'Standard', capacity: 1 }
  identity: { type: 'SystemAssigned' }
  properties: {
    publicNetworkAccess: 'Disabled'
    managedResourceGroupName: 'rg-${purviewName}-managed'
  }
  tags: { env: env, compliance: 'hipaa' }
}

output storageId string = storage.id
output synapseId string = synapse.id
output purviewId string = purview.id
```

Two things to call out. `managedVirtualNetwork: 'default'` on Synapse gives you the managed VNet that hosts Spark; without it Spark runs in the regional shared pool and you cannot front it with private endpoints. And because the workspace MI does not exist until the workspace is first created, the CMK encryption block has to be applied on a second deploy after you grant the workspace MI `Key Vault Crypto Service Encryption User` on the vault.

## Step 3: Private endpoints and Private DNS zones

Paste the following into `infra/private.bicep`:

```bicep
param location string = resourceGroup().location
param subnetId string
param storageName string
param synapseName string

var zones = [
  'privatelink.blob.${environment().suffixes.storage}'
  'privatelink.dfs.${environment().suffixes.storage}'
  'privatelink.vaultcore.azure.net'
  'privatelink.sql.azuresynapse.net'
  'privatelink.dev.azuresynapse.net'
  'privatelink.purview.azure.com'
]

resource dns 'Microsoft.Network/privateDnsZones@2020-06-01' = [for z in zones: {
  name: z
  location: 'global'
}]

resource peStorageBlob 'Microsoft.Network/privateEndpoints@2023-09-01' = {
  name: 'pe-${storageName}-blob'
  location: location
  properties: {
    subnet: { id: subnetId }
    privateLinkServiceConnections: [{
      name: 'plsc-blob'
      properties: {
        privateLinkServiceId: resourceId('Microsoft.Storage/storageAccounts', storageName)
        groupIds: [ 'blob' ]
      }
    }]
  }
}

resource peSynapseSql 'Microsoft.Network/privateEndpoints@2023-09-01' = {
  name: 'pe-${synapseName}-sql'
  location: location
  properties: {
    subnet: { id: subnetId }
    privateLinkServiceConnections: [{
      name: 'plsc-syn-sql'
      properties: {
        privateLinkServiceId: resourceId('Microsoft.Synapse/workspaces', synapseName)
        groupIds: [ 'sql' ]
      }
    }]
  }
}
```

You also want endpoints for `Sql` (serverless), `dev` (Synapse Studio), the Key Vault `vault` groupId, and the Purview `account` and `portal` groupIds. They follow the same shape. The Synapse managed VNet handles Spark egress on its own.

## Step 4. Azure DevOps pipeline that deploys infra across dev, test, prod

Below is the YAML for `azure-pipelines.yml`. It has one stage per environment, each gated by environment approvals you set in Azure DevOps:

```yaml
trigger:
  branches:
    include: [ main ]
  paths:
    include: [ infra/*, synapse/*, .pipelines/* ]

parameters:
  - name: locations
    type: object
    default: { dev: uksouth, test: uksouth, prod: uksouth }

variables:
  - name: BICEP_VERSION
    value: 0.27.1

stages:
  - stage: Dev
    displayName: Deploy dev
    jobs:
      - deployment: deploy_dev
        environment: health-dev
        pool: { vmImage: ubuntu-latest }
        strategy:
          runOnce:
            deploy:
              steps:
                - checkout: self
                - task: AzureCLI@2
                  displayName: Bicep what-if
                  inputs:
                    azureSubscription: sc-healthdata-dev
                    scriptType: bash
                    scriptLocation: inlineScript
                    inlineScript: |
                      az deployment group what-if \
                        -g rg-health-dev-uks \
                        -f infra/main.bicep \
                        -p env=dev keyVaultName=kv-health-dev-uks cmkName=cmk-synapse-dev \
                        -p adminLogin=$(SQL_ADMIN) adminPassword=$(SQL_PASSWORD)
                - task: AzureCLI@2
                  displayName: Bicep deploy
                  inputs:
                    azureSubscription: sc-healthdata-dev
                    scriptType: bash
                    scriptLocation: inlineScript
                    inlineScript: |
                      az deployment group create \
                        -g rg-health-dev-uks \
                        -f infra/main.bicep \
                        -p env=dev keyVaultName=kv-health-dev-uks cmkName=cmk-synapse-dev \
                        -p adminLogin=$(SQL_ADMIN) adminPassword=$(SQL_PASSWORD)
                - task: AzureSynapseWorkspace@1
                  displayName: Deploy Synapse artefacts
                  inputs:
                    azureSubscription: sc-healthdata-dev
                    ResourceGroupName: rg-health-dev-uks
                    TargetWorkspaceName: syn-health-dev
                    TemplateFile: synapse/TemplateForWorkspace.json
                    ParametersFile: synapse/TemplateParametersForWorkspace.json
                    OverrideArmParameters: >-
                      -workspaceName syn-health-dev
                      -defaultStorageAccount sthealthdev$(STORAGE_SUFFIX)

  - stage: Test
    dependsOn: Dev
    condition: succeeded()
    jobs:
      - deployment: deploy_test
        environment: health-test
        pool: { vmImage: ubuntu-latest }
        strategy:
          runOnce:
            deploy:
              steps:
                - checkout: self
                - task: AzureCLI@2
                  inputs:
                    azureSubscription: sc-healthdata-test
                    scriptType: bash
                    scriptLocation: inlineScript
                    inlineScript: |
                      az deployment group create -g rg-health-test-uks -f infra/main.bicep \
                        -p env=test keyVaultName=kv-health-test-uks cmkName=cmk-synapse-test \
                        -p adminLogin=$(SQL_ADMIN) adminPassword=$(SQL_PASSWORD)

  - stage: Prod
    dependsOn: Test
    condition: succeeded()
    jobs:
      - deployment: deploy_prod
        environment: health-prod
        pool: { vmImage: ubuntu-latest }
        strategy:
          runOnce:
            deploy:
              steps:
                - checkout: self
                - task: AzureCLI@2
                  inputs:
                    azureSubscription: sc-healthdata-prod
                    scriptType: bash
                    scriptLocation: inlineScript
                    inlineScript: |
                      az deployment group create -g rg-health-prod-uks -f infra/main.bicep \
                        -p env=prod keyVaultName=kv-health-prod-uks cmkName=cmk-synapse-prod \
                        -p adminLogin=$(SQL_ADMIN) adminPassword=$(SQL_PASSWORD)
```

The `AzureSynapseWorkspace@1` task takes the workspace export (`TemplateForWorkspace.json` + parameters) and stamps it into the target workspace. You export it from Synapse Studio after you build the pipelines in dev, commit the JSON to git, then let the task push it to test and prod.

## Step 5: Azure Policy for HIPAA HITRUST + tag and encryption enforcement

Run the following to assign the built-in HIPAA HITRUST initiative at the subscription scope:

```bash
SUB=$(az account show --query id -o tsv)
INIT=/providers/Microsoft.Authorization/policySetDefinitions/a169a624-5599-4385-a696-c8d643089fab

az policy assignment create \
  --name hipaa-hitrust-${SUB:0:8} \
  --display-name "HIPAA HITRUST 9.2 baseline" \
  --scope /subscriptions/$SUB \
  --policy-set-definition $INIT \
  --location uksouth \
  --mi-system-assigned
```

Then two custom deny policies: one denies resources without `compliance=hipaa` and `data-class` tags, the other denies storage accounts without CMK. Paste the following into `policy/require-tags.json`:

```json
{
  "properties": {
    "displayName": "Require compliance and data-class tags",
    "mode": "Indexed",
    "policyRule": {
      "if": {
        "anyOf": [
          { "field": "tags['compliance']", "exists": "false" },
          { "field": "tags['data-class']", "exists": "false" }
        ]
      },
      "then": { "effect": "deny" }
    }
  }
}
```

Push it with `az policy definition create -n require-hipaa-tags --rules policy/require-tags.json` and assign at subscription scope. Same shape for the CMK rule; check `Microsoft.Storage/storageAccounts/encryption.keySource` equals `Microsoft.Keyvault`.

## Step 6. Enable Defender for Cloud plans and pin the regulatory dashboard

Run the following on each subscription:

```bash
for plan in CloudPosture StorageAccounts SqlServers KeyVaults Arm; do
  az security pricing create -n $plan --tier Standard
done
```

In the portal, open Defender for Cloud, Regulatory compliance, Manage compliance policies, pick your subscription, and add `HIPAA HITRUST 9.2` and `HDS` to the dashboard. The dashboard then scores you against those controls and the recommendations tile lists the gaps (`Storage accounts should use customer-managed key for encryption`, `Auditing on SQL server should be enabled`). Each recommendation maps to one or more controls; that mapping is what the compliance reviewer wants on screen during the audit.

## Step 7: The SSN-masking Spark notebook in Synapse

This is the bit that makes the platform actually do work. Create a notebook in Synapse Studio attached to `sparkpool1`. Paste the following into the first cell:

```python
from pyspark.sql import functions as F
import os

raw_path = "abfss://raw@sthealthdev<suffix>.dfs.core.windows.net/claims/2026/06/02/claims.csv"
curated_path = "abfss://curated@sthealthdev<suffix>.dfs.core.windows.net/claims/year=2026/month=06/day=02/"
consumer_path = "abfss://consumer@sthealthdev<suffix>.dfs.core.windows.net/claims_clean/"

salt = mssparkutils.credentials.getSecret("kv-health-dev-uks", "ssn-salt")

df = (spark.read
    .option("header", True)
    .option("inferSchema", True)
    .csv(raw_path))

masked = (df
    .withColumn("ssn_hash", F.sha2(F.concat_ws("|", F.col("ssn"), F.lit(salt)), 256))
    .withColumn("dob_year", F.year(F.col("dob")))
    .drop("ssn", "dob"))

(masked.write
    .mode("overwrite")
    .format("parquet")
    .save(curated_path))

(masked.select("claim_id","member_id","ssn_hash","dob_year",
               "diagnosis_code","billed_amount","paid_amount")
       .write.mode("overwrite").format("parquet").save(consumer_path))
```

`mssparkutils.credentials.getSecret` pulls the salt from Key Vault via the Spark pool MI, so the salt never sits in the notebook. Raw SSN is dropped from the DataFrame before write; only the SHA-256 of `ssn|salt` survives.

## Step 8. Row-level security and dynamic data masking on the dedicated SQL pool

Connect to the dedicated SQL pool from Synapse Studio and run the following:

```sql
CREATE TABLE dbo.claims (
  claim_id        BIGINT NOT NULL,
  member_id       VARCHAR(32) NOT NULL,
  ssn_hash        CHAR(64) NOT NULL,
  dob_year        INT NULL,
  diagnosis_code  VARCHAR(10) NULL,
  billed_amount   DECIMAL(12,2) NULL,
  paid_amount     DECIMAL(12,2) NULL,
  region_code     VARCHAR(8) NOT NULL
)
WITH ( DISTRIBUTION = HASH(member_id), CLUSTERED COLUMNSTORE INDEX );

ALTER TABLE dbo.claims
  ALTER COLUMN ssn_hash ADD MASKED WITH (FUNCTION = 'partial(0, "XXXX-XXXX", 8)');

ALTER TABLE dbo.claims
  ALTER COLUMN billed_amount ADD MASKED WITH (FUNCTION = 'default()');

CREATE SCHEMA rls;
GO
CREATE FUNCTION rls.fn_region_filter(@region AS VARCHAR(8))
  RETURNS TABLE WITH SCHEMABINDING
AS RETURN
  SELECT 1 AS allowed
  WHERE @region = SESSION_CONTEXT(N'region_code')
     OR IS_ROLEMEMBER('grp_health_compliance') = 1;
GO

CREATE SECURITY POLICY rls.claims_region_policy
  ADD FILTER PREDICATE rls.fn_region_filter(region_code) ON dbo.claims
  WITH (STATE = ON);
```

DDM shows `XXXX-XXXX` to anyone without `UNMASK`; the RLS policy restricts each analyst to claims for their region unless they sit in the compliance group. Both are HIPAA minimum-necessary controls (164.502(b)) and Defender for Cloud marks them green on the regulatory dashboard once it has scanned the database.

## Step 9: Register the data sources in Purview and run a scan

In the Microsoft Purview portal, register the ADLS Gen2 account and the Synapse workspace as data sources inside a collection `health-${env}`. Add a scan with the system default scan rule set; built-in classifiers detect `Person's Social Security Number`, `Date of Birth`, `Medical Record Number`, and others. Run the scan once manually; once columns light up in the Unified Catalog with sensitivity labels, schedule it nightly. Compliance reviewers then have a single screen showing where PHI lives.

## Troubleshooting

- **Bicep first run fails on Synapse CMK.** Expected. The workspace MI does not exist until the workspace is created; deploy once without `encryption.cmk`, grant the MI `Key Vault Crypto Service Encryption User` on the vault, then redeploy with CMK on. Same dance for storage if you want CMK from day zero.
- **Synapse SQL pool deploy errors with `Could not load file or assembly`.** Usually the SQL admin password failed the complexity rule (8 chars, mixed case, digit, symbol). Pipeline variable `SQL_PASSWORD` should be marked secret and at least 16 chars.
- **Spark notebook gets `OperationFailed: PrincipalNotFound`** when reading from ADLS. The Synapse workspace MI needs `Storage Blob Data Contributor` on the storage account scope. RBAC, not ACL, because Synapse defaults to RBAC.
- **Purview scan stays in `Queued` forever.** Almost always private DNS. The Purview managed VNet integration runtime needs the storage private endpoint resolvable; check that `privatelink.dfs.core.windows.net` is linked to the Purview managed VNet and that the storage PE registered an A record in it.

## Clean up

When you are tearing down dev because you are about to re-stamp the environment, do it in this order to avoid orphaned soft-deleted vaults blocking the next run:

```bash
az synapse workspace delete -n syn-health-dev -g rg-health-dev-uks -y
az purview account delete -n pv-health-dev -g rg-health-dev-uks -y
az keyvault delete -n kv-health-dev-uks
az keyvault purge -n kv-health-dev-uks --location uksouth
az group delete -n rg-health-dev-uks -y --no-wait
```

## Compliance review checklist (map to HIPAA controls)

Run this before you hand the platform to the compliance team:

- i> All storage, SQL pool, Synapse workspace, Key Vault, Purview accounts have `compliance=hipaa` and `data-class=phi` tags. Maps to 164.308(a)(1) administrative safeguards.
- ii> Every account is `publicNetworkAccess: Disabled` and reachable only through private endpoints. Maps to 164.312(e)(1) transmission security.
- iii> CMK on storage and Synapse, key in Premium HSM vault, purge protection on. Maps to 164.312(a)(2)(iv) encryption at rest.
- iv> Defender for Cloud regulatory compliance dashboard shows HIPAA HITRUST and HDS, with score recorded weekly. Maps to 164.308(a)(8) evaluation.
- v> Dynamic data masking and row-level security on the dedicated SQL pool, validated by a non-privileged test login. Maps to 164.502(b) minimum necessary.
- vi> Spark notebook drops raw SSN and writes only the salted hash to curated and consumer; raw container has a 30-day immutability lock. Maps to 164.312(c)(1) integrity.
- vii> Purview scan finds zero PHI columns in the `consumer` container. If it finds one, the masking notebook has a bug, not the catalog.
- viii> Azure Policy assignment `hipaa-hitrust-*` shows zero non-compliant resources at the subscription scope. Re-run after every infra change.

If you have followed carefully you must have noticed we did not wire up an Azure DevOps release approval for the prod stage; do that on the `health-prod` environment in the portal before anyone merges to main, otherwise the pipeline will sail straight into prod the next push. Add `grp-health-compliance` as the only approver on prod because in a real audit your compliance officer signs off on every deploy, not the data engineering lead. Also schedule a Defender for Cloud export to a Log Analytics workspace so the secure score and recommendation history is kept for at least six years; that is the HIPAA retention floor and you do not want to learn that during the audit.

#azure #azuredevops #synapse #purview #defenderforcloud #hipaa #healthcare #bicep #dataengineering #seniordevopsengineer #fortune500
