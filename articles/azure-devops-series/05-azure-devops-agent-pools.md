# Azure DevOps agent pools: Microsoft-hosted vs self-hosted, scaling, isolation, and Linux vs Windows

Most teams start with `vmImage: ubuntu-latest`, ship a few pipelines, and then hit a wall. The wall is usually a job that needs a private subnet, a build that needs more disk, a toolchain Microsoft does not pre-install, or the monthly free minute ceiling. At that point the conversation shifts from "which image do we pick" to "do we run our own agents, and how do we structure the pool". Here is the long version, with the YAML, the `config.sh` flags, and the Azure CLI calls written out the way Microsoft documents them.

### STEPS
- Step 1: Pick Microsoft-hosted or self-hosted for a given workload
- Step 2: Author a YAML pipeline against the `Azure Pipelines` pool
- Step 3: Stand up a self-hosted Linux agent on an Azure VM
- Step 4: Register the agent with PAT or service principal auth
- Step 5: Layer a VMSS-backed elastic pool on top
- Step 6: Set demands, capabilities, and pipeline permissions

## Why this matters

Agents are the thing that actually runs your steps. Pools group agents so a pipeline can ask for "a Linux agent with Docker" instead of "this exact box". Get the pool model wrong and you get noisy neighbours, secrets leaking across jobs, slow queues at 09:00 when every team kicks off CI, and a parallel-jobs bill nobody can explain.

There is also a security shape. The agent process downloads and executes code from your repos. Microsoft's agent guidance is explicit: treat the agent host as a target for Remote Code Execution and constrain who can write the pipeline YAML, who can register agents into the pool, and who has shell access to the box.

## Prerequisites

- Azure DevOps organization with `Project Collection Administrators` or `Agent pool Administrator` rights on at least one pool.
- Azure subscription with rights to create a VM, a VMSS, and a managed identity (only if you want self-hosted agents).
- `az` CLI 2.55 or later with the `azure-devops` extension installed (`az extension add --name azure-devops`).
- A Personal Access Token (PAT) scoped to `Agent Pools (read, manage)` for unattended agent registration, or a service principal with the same effect.
- Linux box on a supported distribution: Ubuntu 24.04 / 22.04 / 20.04, Debian 12, RHEL 8/9, Oracle Linux 8/9, or Azure Linux 2.0. The current 4.x agent ships on .NET 8.

## Tools Used

**Azure Pipelines agent (4.x):** the worker process that polls Azure DevOps, leases jobs, and runs the steps. v4 is the current supported line for Azure DevOps Services and Azure DevOps Server; v3 (on .NET 6) is the line for Azure DevOps Server 2022.

**Microsoft-hosted agents:** the `Azure Pipelines` pool, a fleet of fresh VMs Microsoft destroys after each job. Windows, Linux, and macOS images, billed in minutes against your parallel-job allocation.

**Self-hosted agents:** boxes you provision and register yourself. You own patching, capacity, and isolation. You pay only for the Azure VM, not for pipeline minutes (one free self-hosted parallel job is included per org).

**Agent pool:** the org-wide bucket agents register into. Pipelines target a pool by name with `pool: MyPool` or by image with `pool: { vmImage: ubuntu-latest }`.

**Agent queue:** the project-scoped view of a pool. Permissions are layered here so one project cannot register or remove agents from a pool owned by another team.

**VMSS agent pool:** a self-hosted pool backed by an Azure Virtual Machine Scale Set. Azure DevOps scales the VMSS up and down based on job demand, and recycles VMs between jobs for clean state.

**Demands and capabilities:** the matching system. Capabilities are advertised by the agent (installed software, env vars). Demands are required by the pipeline. A job runs only on an agent whose capabilities satisfy every demand.

## Step 1: Pick Microsoft-hosted or self-hosted

The decision comes down to what the job needs to touch.

Microsoft-hosted fits when the job is stateless, public-internet-facing, and the toolchain matches a published image (`ubuntu-latest`, `windows-latest`, `macOS-latest`, plus pinned variants like `ubuntu-22.04` and `windows-2022`). Each run starts on a clean VM. Microsoft patches the image. You burn pipeline minutes.

Self-hosted earns its keep when:

- The job needs a private endpoint: `AKS` on a private VNet, Azure SQL with no public access, an on-prem TFS, an internal feed.
- The hardware is not on offer: GPU for ML builds, more disk for monorepo clones, ARM64 silicon for cross-compiles.
- The toolchain is custom: a proprietary SDK, a licensed simulator, a 6 GB Docker base image you do not want to pull every run.
- You have hit the free minute limit and the maths on parallel jobs vs running your own fleet tips toward the fleet.

NOTE: SELF-HOSTED IS NOT "FREE". YOU PAY FOR THE AZURE VM, THE DISK, AND THE EGRESS. THE FREE PART IS THE PIPELINE-MINUTE METER.

## Step 2: Author a YAML pipeline against the `Azure Pipelines` pool

This is the baseline. Every org gets the `Azure Pipelines` hosted pool and one free Microsoft-hosted parallel job (1,800 minutes / month on public projects, fewer on private). The YAML:

```yaml
trigger:
  branches:
    include:
      - main

pool:
  vmImage: ubuntu-latest

steps:
  - checkout: self
    fetchDepth: 1

  - task: UseDotNet@2
    inputs:
      packageType: 'sdk'
      version: '8.0.x'

  - script: |
      dotnet restore
      dotnet build --configuration Release --no-restore
      dotnet test --configuration Release --no-build --logger trx
    displayName: 'Build and test'

  - task: PublishTestResults@2
    condition: succeededOrFailed()
    inputs:
      testResultsFormat: 'VSTest'
      testResultsFiles: '**/*.trx'
```

Three things to flag:

- `vmImage: ubuntu-latest` is `ubuntu-22.04` today and rolls to `ubuntu-24.04` on Microsoft's schedule. Pin the version if you cannot tolerate the rollover.
- `UseDotNet@2` and `PublishTestResults@2` are the current task major versions on Microsoft Learn. Drop the `@N` and the pipeline takes whatever default the org has.
- The image ships .NET 8 SDK, Node 20, Python 3.12, Docker, the Azure CLI, kubectl, Terraform, and Java 17 already.

## Step 3: Stand up a self-hosted Linux agent on an Azure VM

By hand for one agent. For a fleet, drive it from cloud-init or Bicep. The walkthrough targets Ubuntu 22.04 on a `Standard_D4s_v5`.

### 3.1 Provision the VM

```bash
RG=rg-ado-agents
LOC=uksouth
VM=ado-linux-01

az group create --name $RG --location $LOC

az vm create \
  --resource-group $RG \
  --name $VM \
  --image Canonical:0001-com-ubuntu-server-jammy:22_04-lts-gen2:latest \
  --size Standard_D4s_v5 \
  --admin-username azureuser \
  --generate-ssh-keys \
  --assign-identity \
  --public-ip-sku Standard \
  --nsg-rule SSH
```

NOTE: `--assign-identity` GIVES THE VM A SYSTEM-ASSIGNED MANAGED IDENTITY. WE USE IT LATER FOR SERVICE PRINCIPAL AUTH AGAINST AZURE DEVOPS AND FOR ANY `AzureCLI@2` STEPS THAT NEED TO REACH `KEY VAULT` OR `STORAGE`.

### 3.2 Install agent dependencies

SSH in, then:

```bash
sudo apt-get update
sudo apt-get install -y git curl jq libicu-dev
git --version  # must be 2.9.0 or higher
```

### 3.3 Pull the agent tarball

The download URL is on the `Get the agent` dialog in the UI. The 4.x line is current.

```bash
mkdir ~/myagent && cd ~/myagent
curl -O https://download.agent.dev.azure.com/agent/4.248.0/vsts-agent-linux-x64-4.248.0.tar.gz
tar zxvf vsts-agent-linux-x64-4.248.0.tar.gz
./bin/installdependencies.sh
```

`installdependencies.sh` reaches third-party mirrors (`packages.efficios.com` is one Microsoft names). On a locked-down VNet, mirror the deps internally or bake them into a golden image.

## Step 4: Register the agent with PAT or service principal auth

Two options, both documented as supported. Pick one and stop using the other.

### 4.1 PAT-based registration (the classic path)

Generate a PAT in Azure DevOps with `Agent Pools (read, manage)`. Then on the box:

```bash
./config.sh \
  --unattended \
  --url https://dev.azure.com/your-org \
  --auth pat \
  --token "$ADO_PAT" \
  --pool Linux-Self-Hosted \
  --agent "ado-linux-01" \
  --acceptTeeEula \
  --replace
```

The flags map to Microsoft's unattended-config table. `--replace` overwrites a stale registration with the same name (otherwise both agents fight over the identity and one drops).

Install as a `systemd` service so the agent survives reboots:

```bash
sudo ./svc.sh install azureuser
sudo ./svc.sh start
sudo ./svc.sh status
```

`svc.sh install` drops a unit file at `/etc/systemd/system/vsts.agent.{org}.{agent}.service`. To roll an env var change into the service after installing new tooling, edit `.env` and `.path` under the agent root, then `sudo ./svc.sh stop && sudo ./svc.sh start`.

NOTE: DO NOT RUN THE AGENT AS `ROOT`. THE `SVC.SH` SCRIPT REFUSES IT, AND FOR GOOD REASON: A COMPROMISED PIPELINE BECOMES A ROOT-OWNED RCE OTHERWISE.

### 4.2 Service principal registration (the path you actually want)

PATs expire, leak, and tie the agent to a human. `--auth sp` lets the agent authenticate as a Microsoft Entra service principal. The VM already has a managed identity from Step 3.1. Grant it the `User` role on the pool, then:

```bash
./config.sh \
  --unattended \
  --url https://dev.azure.com/your-org \
  --auth sp \
  --pool Linux-Self-Hosted \
  --agent "ado-linux-01" \
  --acceptTeeEula \
  --replace
```

For non-Azure boxes, fall back to PAT or device-code flow (`--auth pat`, `--auth devicecode`). Microsoft documents the full set as Personal access token, Device code flow, and Service principal.

## Step 5: Layer a VMSS-backed elastic pool on top

One pet VM is fine. Twenty pet VMs are a Friday-afternoon problem. The answer is a VMSS agent pool: point the org at a Virtual Machine Scale Set, Azure DevOps owns the autoscaling, and each VM is torn down and rebuilt between jobs.

### 5.1 Create the VMSS

```bash
az vmss create \
  --resource-group rg-ado-agents \
  --name vmss-ado-linux \
  --image Canonical:0001-com-ubuntu-server-jammy:22_04-lts-gen2:latest \
  --vm-sku Standard_D4s_v5 \
  --instance-count 0 \
  --orchestration-mode Uniform \
  --upgrade-policy-mode manual \
  --disable-overprovision \
  --assign-identity \
  --admin-username azureuser \
  --generate-ssh-keys
```

The `--instance-count 0` is intentional. Azure DevOps scales the VMSS up from zero based on queued jobs.

### 5.2 Register the VMSS as an agent pool

`Organization settings` > `Agent pools` > `Add pool` > `Azure virtual machine scale set`. Pick the subscription, the VMSS, and set:

- Maximum number of virtual machines in the scale set: 10
- Number of agents to keep on standby: 1
- Delay in minutes before deleting excess idle agents: 30
- Configure VMs to run interactive tests: off

NOTE: STANDBY OF 1 KEEPS A WARM VM SO YOUR 09:00 RUSH DOES NOT WAIT 4 MINUTES FOR A FRESH BOOT. SET IT TO 0 IF COST MATTERS MORE THAN LATENCY.

Azure DevOps installs the agent on each new VM, registers it, runs one job, then deletes the VM. Clean state for free.

## Step 6: Set demands, capabilities, and pipeline permissions

A pool with twelve agents is useful only if jobs land on the right one. Capabilities and demands steer that.

Capabilities are advertised automatically: every env var on the agent, plus user-defined values added through the UI under the pool's `Capabilities` tab. Demands are set in YAML:

```yaml
pool:
  name: Linux-Self-Hosted
  demands:
    - Agent.OS -equals Linux
    - docker
    - terraform
```

That job runs only on a Linux agent advertising both `docker` and `terraform`. The matcher is exact. `terraform -equals 1.7.5` is a stricter demand.

Set the `VSO_AGENT_IGNORE` env var to a comma-separated list to keep specific env vars out of the capability set. Useful for keeping secrets and per-host noise off the pool dashboard.

Two security controls matter:

- `Agent pool` roles: `Reader`, `Service Account`, `User`, `Administrator`. The owning team gets `Administrator`. Other teams get `User` so they can target the pool from YAML but cannot register or remove agents.
- `Pipeline permissions`: by default any YAML in the org can reference any pool. Lock down sensitive pools (prod-deploy, key-vault-reader) to an allowlist. New references raise an approval request a pool `Administrator` must approve.

NOTE: PIPELINE PERMISSIONS APPLY ONLY TO YAML PIPELINES. CLASSIC RELEASES IGNORE THIS CONTROL.

## Parallel jobs and the bill

Every org gets one free Microsoft-hosted parallel job (1,800 minutes / month on private projects, unlimited on public projects) and one free self-hosted parallel job (unlimited minutes). Past that, you buy parallel jobs at a fixed per-month price. Microsoft's concurrent-jobs page is the source of truth; re-read it quarterly because quotas shift.

The mental model: a parallel job is a concurrent execution slot, not a queue length. Two parallel jobs = two pipelines run at once. Ten self-hosted agents on one parallel job means nine sit idle while the tenth runs. Buy parallel jobs to unblock concurrency, not to add agents.

## Linux vs Windows: where each lands

Linux is the default for anything that compiles to a binary or builds a container. Lower VM licence cost (no Windows surcharge on Azure), faster boot, smaller images, and the agent has been on .NET 8 since the 4.x line.

Windows agents earn their place for: .NET Framework 4.x builds needing `MSBuild` from Visual Studio, binary signing with `signtool.exe`, UWP packaging, SSRS artefacts, PowerShell DSC. The `windows-2022` image ships Visual Studio 2022 Enterprise build tools, the .NET 4.8 SDK, and the Windows 10 SDK. Self-hosted Windows agents use `config.cmd` and `svc.cmd` in place of `config.sh` and `svc.sh`.

NOTE: NEVER MIX `.NET FRAMEWORK` AND `.NET 8` WORKLOADS IN ONE POOL WITHOUT GATING ON DEMANDS. A FRAMEWORK BUILD LANDING ON A LINUX AGENT FAILS SLOW AND CONFUSINGLY.

## Troubleshooting

**Agent offline immediately after `svc.sh start`.** Check `sudo journalctl -u vsts.agent.your-org.ado-linux-01.service -n 100`. Usually one of: PAT expired, firewall blocking `*.dev.azure.com` (Microsoft retired the Edgio CDN in May 2025, allowlist `https://*.dev.azure.com` or `https://download.agent.dev.azure.com`), or the service user cannot read `_work`.

**Two agents fight for the same name.** You re-ran `./config.sh` without `--replace`. Stop one, `./config.sh remove` it, leave the other.

**Capability installed but the job still says "no agents match demand".** Capabilities cache at agent start. Restart the service: `sudo ./svc.sh stop && sudo ./svc.sh start`.

**`installdependencies.sh` fails on a hardened VM.** It pulls from `packages.efficios.com` and your distro mirrors. On an offline VNet, pre-bake deps into the image (Packer, `azure-image-builder`) and skip the script.

**VMSS pool sits at zero when jobs are queued.** Check the pool's `Diagnostics` tab. Usual causes: the VMSS managed identity lacks `Virtual Machine Contributor`, standby is 0 and scale-up is rate-limited, or the VMSS image is missing `git`.

## Clean up

For a one-off VM agent:

```bash
sudo ./svc.sh stop
sudo ./svc.sh uninstall
./config.sh remove --auth pat --token "$ADO_PAT"
az vm delete --resource-group rg-ado-agents --name ado-linux-01 --yes
```

For a VMSS pool, delete the pool from `Organization settings` > `Agent pools` first (Azure DevOps drains and de-registers in-flight agents), then `az vmss delete`. Removing the VMSS without draining leaves ghost agents in the UI.

If you got this far, you have a working baseline: Microsoft-hosted for cheap stateless work, a self-hosted Linux pool for private-network and custom-toolchain jobs, a VMSS pool for the elastic part, and the security knobs set so the wrong pipeline cannot land on the wrong agent. The rest is operational discipline: pin agent versions, watch capabilities drift, and re-read the parallel-jobs page every quarter when the bill arrives.
