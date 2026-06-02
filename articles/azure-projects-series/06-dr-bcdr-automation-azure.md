# AZURE PROJECT: Disaster recovery automation with Azure Site Recovery, Recovery Services Vault, paired regions, and Azure DevOps runbook orchestration

Every regulated bank, insurer and healthcare provider I have worked with keeps a BCDR runbook on a SharePoint that nobody has opened in two years. Auditor shows up, somebody panics. This project fixes that. We build a working DR pattern on Azure you can actually drill on a schedule. Primary region UK South, paired region UK West. We replicate IaaS VMs with Azure Site Recovery, back everything else into a Recovery Services Vault with cross-region restore on, point AKS at Velero into an immutable storage account in the paired region, run SQL on a failover group with geo-redundant backup, set Cosmos DB to periodic backup, and wire a PowerShell 7.4 runbook in an Automation Account to do the actual failover. Azure DevOps kicks the runbook on a schedule so the DR drill runs itself monthly.

## Tools used

- Azure Site Recovery (ASR) for region-to-region replication of IaaS VMs
- Recovery Services Vault (`Microsoft.RecoveryServices/vaults`) with GRS and cross-region restore
- Azure Backup for VM, SQL-in-VM and Files workloads
- Velero v1.14 for AKS namespace backups to an immutable blob container
- Azure SQL Database with auto-failover groups and geo-redundant backup
- Azure Cosmos DB with periodic backup tier (24 hour retention)
- Azure Automation Account (`Microsoft.Automation/automationAccounts`) hosting PowerShell 7.4 runbooks
- Azure DevOps YAML pipeline to schedule the DR drill
- Bicep for everything we deploy
- Azure CLI 2.64+, PowerShell 7.4, kubectl 1.30, velero CLI 1.14

## Prerequisites

- An Azure subscription with Owner on a sandbox subscription (you will be creating vaults, role assignments and replicated VMs)
- Azure CLI 2.64 or higher, logged in via `az login`
- Bicep CLI 0.29+, comes bundled with the Azure CLI
- An Azure DevOps project with a service connection scoped to the sandbox subscription, federated identity preferred
- A resource group in UK South called `rg-bcdr-prod` and a paired one in UK West called `rg-bcdr-dr`
- At least one IaaS VM already running in `rg-bcdr-prod` that you can afford to fail over
- An AKS cluster (1.30+) in UK South with a workload namespace called `payments`
- An Azure SQL logical server with a database called `ledger` in UK South
- Read of the Microsoft Learn pages on ASR, Azure Backup, and Automation runbook types

## Project Architecture

Two paired regions. Site Recovery sits in a Recovery Services Vault in UK West (the vault must live in the target region, this trips people up the first time). Vault is GRS with cross-region restore on. AKS uses Velero, not ASR, because ASR does not protect API server state and CRDs cleanly; Velero ships backups to an immutable container in UK West. SQL uses a failover group between two logical servers with geo-redundant backup so PITR survives a region loss. Cosmos DB is on periodic backup, or continuous 7-day mode where the workload tolerates it.

The Automation Account runs a PowerShell 7.4 runbook `Invoke-DRDrill` plus a health-probe runbook `Test-DRHealth`. Azure DevOps pipeline `bcdr-drill.yml` calls `Start-AzAutomationRunbook` first Saturday of the month at 02:00 UTC.

## Step 1. Create the paired-region resource groups and the Recovery Services Vault

Run the following az CLI commands to lay down the base resource groups and a vault in the recovery region. The vault has to be in UK West, not UK South; this is the part everyone gets wrong the first time.

```bash
az group create --name rg-bcdr-prod --location uksouth
az group create --name rg-bcdr-dr   --location ukwest

az backup vault create \
  --resource-group rg-bcdr-dr \
  --name rsv-bcdr-ukwest \
  --location ukwest

az backup vault backup-properties set \
  --resource-group rg-bcdr-dr \
  --name rsv-bcdr-ukwest \
  --backup-storage-redundancy GeoRedundant \
  --cross-region-restore-flag true \
  --soft-delete-feature-state Enable
```

GeoRedundant plus cross-region restore makes backup data restorable into UK South after a UK West-anchored vault holds the recovery points. Immutability comes in Step 4.

## Step 2: Deploy the ASR replication scaffolding in Bicep

Paste the following into `infra/asr.bicep`. It creates a replication policy, a replication fabric pair and a protection container mapping. We attach actual VMs in Step 3.

```bicep
@description('Recovery Services Vault in the DR region')
param vaultName string = 'rsv-bcdr-ukwest'

@description('Primary region')
param primaryLocation string = 'uksouth'

@description('Recovery region')
param recoveryLocation string = 'ukwest'

resource vault 'Microsoft.RecoveryServices/vaults@2024-04-01' existing = {
  name: vaultName
}

resource policy 'Microsoft.RecoveryServices/vaults/replicationPolicies@2024-04-01' = {
  parent: vault
  name: 'policy-azure-to-azure-24h'
  properties: {
    providerSpecificInput: {
      instanceType: 'A2A'
      recoveryPointHistory: 1440
      crashConsistentFrequencyInMinutes: 5
      appConsistentFrequencyInMinutes: 60
      multiVmSyncStatus: 'Enable'
    }
  }
}

resource primaryFabric 'Microsoft.RecoveryServices/vaults/replicationFabrics@2024-04-01' = {
  parent: vault
  name: 'fabric-${primaryLocation}'
  properties: {
    customDetails: {
      instanceType: 'Azure'
      location: primaryLocation
    }
  }
}

resource recoveryFabric 'Microsoft.RecoveryServices/vaults/replicationFabrics@2024-04-01' = {
  parent: vault
  name: 'fabric-${recoveryLocation}'
  properties: {
    customDetails: {
      instanceType: 'Azure'
      location: recoveryLocation
    }
  }
}
```

Run the command to deploy it:

```bash
az deployment group create \
  --resource-group rg-bcdr-dr \
  --template-file infra/asr.bicep
```

Two fabrics, one policy. Microsoft calls the replication contract A2A (Azure-to-Azure) in the API; the portal hides this but the ARM resource type is what you will see in pipelines and audits.

## Step 3. Enable replication on the IaaS VMs

Easier from the CLI than from Bicep for the per-VM bit. Replace `vm-app01` with whatever you have running in UK South.

```bash
VM_ID=$(az vm show -g rg-bcdr-prod -n vm-app01 --query id -o tsv)

az site-recovery protected-item create \
  --resource-group rg-bcdr-dr \
  --vault-name rsv-bcdr-ukwest \
  --fabric-name fabric-uksouth \
  --protection-container-name primary \
  --replicated-protected-item-name vm-app01 \
  --policy-id "/subscriptions/$(az account show --query id -o tsv)/resourceGroups/rg-bcdr-dr/providers/Microsoft.RecoveryServices/vaults/rsv-bcdr-ukwest/replicationPolicies/policy-azure-to-azure-24h" \
  --provider-specific-details '{"instanceType":"A2A","fabricObjectId":"'$VM_ID'","recoveryContainerId":"<recovery-container-id>","recoveryResourceGroupId":"/subscriptions/<sub>/resourceGroups/rg-bcdr-dr"}'
```

Initial replication takes 30 minutes to several hours depending on disk size and churn. Head into the portal once and confirm the replicated item status is `Protected`. RPO for A2A at 5-minute crash-consistent and 60-minute app-consistent snapshots sits around 5 minutes; actual numbers are in the vault dashboard after first sync.

## Step 4: Lock the vault down with immutability and MUA

Run the following to flip the vault to immutable and turn on Multi-User Authorization (MUA). This is what auditors care about. Once immutability is `Locked` you cannot weaken retention, only extend it; that is the whole point.

```bash
az backup vault update \
  --resource-group rg-bcdr-dr \
  --name rsv-bcdr-ukwest \
  --immutability-state Unlocked

# verify policies are correct first, then:
az backup vault update \
  --resource-group rg-bcdr-dr \
  --name rsv-bcdr-ukwest \
  --immutability-state Locked
```

Do `Unlocked` first, run a test restore (Step 9), then promote to `Locked`. If you lock first and your policy is wrong, you have to wait out the retention to fix it; learned that one the hard way.

## Step 5. Configure Velero for AKS into the paired-region storage account

ASR does not handle AKS state cleanly because etcd, CRDs and Helm releases live above the VM layer. Use Velero. Run the command to create the immutable storage account in UK West:

```bash
az storage account create \
  --name stveleroukwest$RANDOM \
  --resource-group rg-bcdr-dr \
  --location ukwest \
  --sku Standard_GRS \
  --kind StorageV2 \
  --allow-blob-public-access false

az storage container create \
  --account-name stveleroukwestXXXX \
  --name velero \
  --auth-mode login

az storage container immutability-policy create \
  --account-name stveleroukwestXXXX \
  --container-name velero \
  --period 30 \
  --allow-protected-append-writes true
```

Install Velero on the AKS cluster pointing at that container; the service principal needs `Storage Blob Data Contributor` on the storage account.

```bash
velero install \
  --provider azure \
  --plugins velero/velero-plugin-for-microsoft-azure:v1.10.0 \
  --bucket velero \
  --secret-file ./credentials-velero \
  --backup-location-config resourceGroup=rg-bcdr-dr,storageAccount=stveleroukwestXXXX,subscriptionId=$(az account show --query id -o tsv)

velero schedule create payments-nightly \
  --schedule="0 2 * * *" \
  --include-namespaces payments \
  --ttl 720h
```

Twelve nightly backups retained for 30 days, dropped into an immutable container in the paired region. That covers the AKS data-plane state; the cluster itself we rebuild from Bicep in the DR region during the actual failover.

## Step 6: SQL failover group and Cosmos DB periodic backup

Run the following to put the existing UK South Azure SQL server into a failover group with a partner in UK West:

```bash
az sql server create \
  --name sql-bcdr-ukwest \
  --resource-group rg-bcdr-dr \
  --location ukwest \
  --admin-user sqladmin \
  --admin-password '<strong-password>'

az sql failover-group create \
  --name fg-bcdr-ledger \
  --partner-server sql-bcdr-ukwest \
  --resource-group rg-bcdr-prod \
  --server sql-bcdr-uksouth \
  --add-db ledger \
  --failover-policy Automatic \
  --grace-period 1
```

Grace period 1 hour, automatic policy. RPO on a SQL failover group is typically under 5 seconds for the synchronous tier. Switch the database to geo-redundant backup so PITR survives a region loss:

```bash
az sql db update \
  --resource-group rg-bcdr-prod \
  --server sql-bcdr-uksouth \
  --name ledger \
  --backup-storage-redundancy Geo
```

Cosmos DB, set the account to periodic backup at the maximum tier:

```bash
az cosmosdb update \
  --resource-group rg-bcdr-prod \
  --name cosmos-bcdr-uksouth \
  --backup-policy-type Periodic \
  --backup-interval 240 \
  --backup-retention 720 \
  --backup-redundancy Geo
```

Four-hour backup interval, 30-day retention, geo-redundant. If you have a workload that can pay for it, switch this to `Continuous` mode for true PITR; periodic is the cheap-and-cheerful default for non-critical Cosmos containers.

## Step 7. Build the Automation Account and the failover runbook

Paste the following into `infra/automation.bicep`. We use a system-assigned managed identity so we do not have to manage secrets.

```bicep
param location string = 'ukwest'
param accountName string = 'aa-bcdr-orchestrator'

resource aa 'Microsoft.Automation/automationAccounts@2023-11-01' = {
  name: accountName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    sku: {
      name: 'Basic'
    }
    publicNetworkAccess: true
  }
}

resource rb 'Microsoft.Automation/automationAccounts/runbooks@2023-11-01' = {
  parent: aa
  name: 'Invoke-DRDrill'
  location: location
  properties: {
    runbookType: 'PowerShell'
    logVerbose: true
    logProgress: true
    runtimeConfiguration: {
      language: 'PowerShell'
      version: '7.4'
    }
  }
}
```

`runbookType: PowerShell` with runtime version 7.4 is what Microsoft Learn currently recommends; 7.2 went out of support. Deploy it:

```bash
az deployment group create \
  --resource-group rg-bcdr-dr \
  --template-file infra/automation.bicep
```

Now paste the actual runbook body into a file `runbooks/Invoke-DRDrill.ps1`:

```powershell
param(
    [Parameter(Mandatory = $true)] [string] $VaultName,
    [Parameter(Mandatory = $true)] [string] $VaultResourceGroup,
    [Parameter(Mandatory = $true)] [string] $RecoveryPlanName,
    [Parameter(Mandatory = $false)] [switch] $TestFailover
)

# Login with the system-assigned managed identity, no secret on disk
Connect-AzAccount -Identity | Out-Null

$vault = Get-AzRecoveryServicesVault `
    -ResourceGroupName $VaultResourceGroup `
    -Name $VaultName
Set-AzRecoveryServicesAsrVaultContext -Vault $vault | Out-Null

$plan = Get-AzRecoveryServicesAsrRecoveryPlan -Name $RecoveryPlanName

if ($TestFailover) {
    Write-Output "Starting TEST failover for recovery plan $RecoveryPlanName"
    $job = Start-AzRecoveryServicesAsrTestFailoverJob `
        -RecoveryPlan $plan `
        -Direction PrimaryToRecovery `
        -AzureVMNetworkId (Get-AzVirtualNetwork -ResourceGroupName rg-bcdr-dr -Name vnet-dr).Id
} else {
    Write-Output "Starting UNPLANNED failover for recovery plan $RecoveryPlanName"
    $job = Start-AzRecoveryServicesAsrUnplannedFailoverJob `
        -RecoveryPlan $plan `
        -Direction PrimaryToRecovery
}

# Poll until the job lands
do {
    Start-Sleep -Seconds 30
    $job = Get-AzRecoveryServicesAsrJob -Job $job
    Write-Output "Job state: $($job.State)"
} while ($job.State -in @('InProgress', 'NotStarted'))

if ($job.State -ne 'Succeeded') {
    throw "DR drill failed in state $($job.State): $($job.StateDescription)"
}

Write-Output "Drill complete. RTO measured: $((New-TimeSpan -Start $job.StartTime -End $job.EndTime).TotalMinutes) minutes."
```

Import it into the Automation Account:

```bash
az automation runbook replace-content \
  --resource-group rg-bcdr-dr \
  --automation-account-name aa-bcdr-orchestrator \
  --name Invoke-DRDrill \
  --content @runbooks/Invoke-DRDrill.ps1

az automation runbook publish \
  --resource-group rg-bcdr-dr \
  --automation-account-name aa-bcdr-orchestrator \
  --name Invoke-DRDrill
```

The managed identity needs `Site Recovery Contributor` and `Virtual Machine Contributor` on both resource groups. Grant it once and forget it.

## Step 8: Build the health-probe runbook

Below is the PowerShell for `runbooks/Test-DRHealth.ps1`. It checks failed-over VMs respond on their app ports, SQL responds, Cosmos returns a read.

```powershell
param(
    [string[]] $ProbeHosts,
    [string]   $SqlServer,
    [string]   $SqlDatabase,
    [string]   $CosmosEndpoint
)

Connect-AzAccount -Identity | Out-Null
$results = @()

foreach ($h in $ProbeHosts) {
    try {
        $r = Invoke-WebRequest -Uri "https://$h/health" -TimeoutSec 10
        $results += [pscustomobject]@{ Host = $h; Status = $r.StatusCode }
    } catch {
        $results += [pscustomobject]@{ Host = $h; Status = 'FAIL' }
    }
}

$tok = (Get-AzAccessToken -ResourceUrl 'https://database.windows.net/').Token
$conn = "Server=$SqlServer;Database=$SqlDatabase;Encrypt=True;"
$sqlConn = New-Object System.Data.SqlClient.SqlConnection($conn)
$sqlConn.AccessToken = $tok
try { $sqlConn.Open(); $results += [pscustomobject]@{ Host = $SqlServer; Status = 'OK' } }
catch { $results += [pscustomobject]@{ Host = $SqlServer; Status = "FAIL: $($_.Exception.Message)" } }

$results | ConvertTo-Json -Depth 3
```

Publish it the same way as the previous runbook. The probe writes JSON to the job output stream, which the Azure DevOps pipeline picks up in the next step.

## Step 9. Wire up the Azure DevOps pipeline

Below is the YAML for `bcdr-drill.yml`. It runs on the first Saturday of every month at 02:00 UTC, fires the test failover runbook, waits for completion, runs the health probe, and fails the pipeline if anything is not green.

```yaml
schedules:
  - cron: "0 2 1-7 * 6"
    displayName: Monthly DR drill (first Saturday)
    branches:
      include: [main]
    always: true

trigger: none

variables:
  vaultRg: rg-bcdr-dr
  vaultName: rsv-bcdr-ukwest
  automationAccount: aa-bcdr-orchestrator
  recoveryPlan: rp-payments-stack

stages:
  - stage: TestFailover
    displayName: Run test failover
    jobs:
      - job: drill
        pool:
          vmImage: ubuntu-22.04
        steps:
          - task: AzurePowerShell@5
            displayName: Kick Invoke-DRDrill
            inputs:
              azureSubscription: sc-bcdr-sandbox
              azurePowerShellVersion: LatestVersion
              pwsh: true
              ScriptType: InlineScript
              Inline: |
                $params = @{
                  VaultName          = "$(vaultName)"
                  VaultResourceGroup = "$(vaultRg)"
                  RecoveryPlanName   = "$(recoveryPlan)"
                  TestFailover       = $true
                }
                $job = Start-AzAutomationRunbook `
                  -AutomationAccountName "$(automationAccount)" `
                  -ResourceGroupName "$(vaultRg)" `
                  -Name "Invoke-DRDrill" `
                  -Parameters $params `
                  -Wait
                Write-Host "##vso[task.setvariable variable=drillJobId]$($job.JobId)"

          - task: AzurePowerShell@5
            displayName: Run Test-DRHealth
            inputs:
              azureSubscription: sc-bcdr-sandbox
              azurePowerShellVersion: LatestVersion
              pwsh: true
              ScriptType: InlineScript
              Inline: |
                $probeJob = Start-AzAutomationRunbook `
                  -AutomationAccountName "$(automationAccount)" `
                  -ResourceGroupName "$(vaultRg)" `
                  -Name "Test-DRHealth" `
                  -Parameters @{
                    ProbeHosts     = @('app01-dr.example.com','app02-dr.example.com')
                    SqlServer      = 'sql-bcdr-ukwest.database.windows.net'
                    SqlDatabase    = 'ledger'
                    CosmosEndpoint = 'https://cosmos-bcdr-ukwest.documents.azure.com'
                  } `
                  -Wait
                if ($probeJob.Output -match 'FAIL') {
                  Write-Error "DR health check failed"
                  exit 1
                }

  - stage: Cleanup
    displayName: Reset after test failover
    dependsOn: TestFailover
    condition: always()
    jobs:
      - job: cleanup
        pool:
          vmImage: ubuntu-22.04
        steps:
          - task: AzurePowerShell@5
            inputs:
              azureSubscription: sc-bcdr-sandbox
              azurePowerShellVersion: LatestVersion
              pwsh: true
              ScriptType: InlineScript
              Inline: |
                Connect-AzAccount -Identity
                $vault = Get-AzRecoveryServicesVault -Name "$(vaultName)" -ResourceGroupName "$(vaultRg)"
                Set-AzRecoveryServicesAsrVaultContext -Vault $vault
                $plan = Get-AzRecoveryServicesAsrRecoveryPlan -Name "$(recoveryPlan)"
                Start-AzRecoveryServicesAsrTestFailoverCleanupJob -RecoveryPlan $plan -Comment "Automated drill cleanup"
```

The cron expression `0 2 1-7 * 6` is "02:00 UTC on any Saturday that falls between the 1st and the 7th of the month", which is the first-Saturday-of-the-month pattern. The cleanup stage runs even when the test stage fails, so the test failover VMs never leak.

## Step 10: Run an induced failover end to end

Trigger the pipeline manually once before you trust the schedule. Click Run pipeline, leave defaults, hit Run. Watch the agent log. You will see Site Recovery boot a new copy of `vm-app01` in `rg-bcdr-dr` against an isolated VNet (`vnet-dr`), the probe will hit the health endpoint, the SQL probe will open a connection, the cleanup stage tears the test instances down.

Typical numbers on this setup: RTO 12 to 18 minutes for the VM tier, RPO under 5 minutes on A2A, SQL failover under 30 seconds. Write those down somewhere; auditors love measured numbers, not promised ones.

## Troubleshooting

Common gotchas, all of them I have hit on real engagements.

i> Identity-tier failover. ASR fails the VM over but the VM cannot log in because it is domain-joined to an AD that lives in UK South. Fix: put a read-only domain controller in UK West, or use Microsoft Entra Domain Services in the paired region. The drill will pass the network probe but fail any app that does Kerberos.

ii> DNS. The failover VM has a new private IP. If you wired apps to IPs not names, the drill works in the test bubble and dies in production. Use Private DNS zones and let ASR update the records on real failover.

iii> Certificates. TLS certs pinned to the primary hostname will throw on the DR endpoint. Use a SAN cert that covers both `app01.example.com` and `app01-dr.example.com`, or use Front Door / Traffic Manager so the public hostname does not change.

iv> Network mapping. The test failover VNet must be different from the recovery VNet. If you use the same one, the test VMs will collide with real failover targets. Two VNets in `rg-bcdr-dr`: `vnet-dr` for real failover, `vnet-dr-test` for drills.

## Clean up

Run the following to remove everything when the lab is done. Vault deletion will refuse if there are protected items, so disable replication first.

```bash
az site-recovery protected-item delete \
  --resource-group rg-bcdr-dr \
  --vault-name rsv-bcdr-ukwest \
  --fabric-name fabric-uksouth \
  --protection-container-name primary \
  --name vm-app01 \
  --yes

az backup vault update \
  --resource-group rg-bcdr-dr \
  --name rsv-bcdr-ukwest \
  --immutability-state Disabled

az group delete --name rg-bcdr-dr --yes --no-wait
az group delete --name rg-bcdr-prod --yes --no-wait
```

If you have followed carefully you must have noticed we did not wire the Cosmos and Velero probes into the same pipeline; they live in separate jobs because Cosmos restore is slow and you do not want a 90-minute restore blocking a 15-minute VM drill. Do the same split for any workload where recovery time is very different from the VM tier. Also, do not lock the vault on day one. Run two full test failovers, restore one Velero backup, do a SQL failover-group manual flip, then promote to `Locked`. Auditors will be happy and you will not have painted yourself into a retention corner.

#azure #azuredevops #devops #bcdr #disasterrecovery #azuresiterecovery #recoveryservicesvault #automation #fortune500 #seniordevopsengineer
