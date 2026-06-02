# Container CI/CD from Azure DevOps to ACR and AKS

Most teams hit the same wall when they wire a container pipeline for the first time: the build runs fine, the image lands in Azure Container Registry, then the AKS rollout silently fails with `ImagePullBackOff` and nobody knows whether the cluster is missing a pull secret, the manifest is wrong, or the tag never made it through variable substitution. The pipeline below is the one I keep reaching for. It builds with `Docker@2`, scans with Trivy before the push, signs off the image, then hands the artifact set to `KubernetesManifest@1` for an audited rollout against AKS. Helm sits next to it as an alternative path, and rollback is just `kubectl rollout undo` wired into the same environment.

### STEPS

1. Stand up the ACR + AKS pair and the service connections
2. Build the image with `Docker@2`
3. Scan with Trivy before the push
4. Push to ACR through the Docker registry service connection
5. Deploy to AKS with `KubernetesManifest@1`
6. Swap `imagePullSecret` for AKS managed identity pull
7. Helm chart deploy as the alternative path
8. Rollback strategy

## Why this matters

A green pipeline is not the goal. The goal is a pipeline where every artifact that lands on a cluster is traceable to a commit, scanned for known CVEs, signed with provenance, and reversible in under a minute when something breaks at 02:00. The default *Deploy to Azure Kubernetes Service* template that Azure Pipelines generates gets you the first 70 percent. The remaining 30 percent (scan gate, pull-secret-free identity, rollback) is what separates a demo from production.

## Prerequisites

- An Azure subscription with rights to create `Microsoft.ContainerRegistry/registries` and `Microsoft.ContainerService/managedClusters` in the target resource group.
- An Azure DevOps project with the Azure Pipelines service enabled.
- An Azure Resource Manager service connection (workload identity federation preferred over secret-based) scoped to the subscription, created via `Azure DevOps > Project settings > Service connections > New > Azure Resource Manager`.
- A `Dockerfile` at the repo root, plus `manifests/deployment.yml` and `manifests/service.yml`.
- `az` CLI 2.60 or newer on your workstation if you want to provision out-of-band, plus `kubectl` for sanity checks.

## Tools Used

- **Azure Pipelines:** the multi-stage YAML engine. Stages get treated as deployment boundaries, jobs as parallel work, steps as ordered tasks.
- **Azure Container Registry (ACR):** the OCI registry. We push to it via a *Docker registry service connection* and pull from it via either an `imagePullSecret` of type `dockerRegistry` or an AKS kubelet identity that holds `AcrPull` on the registry.
- **AKS (Azure Kubernetes Service):** the runtime. We bind it to the pipeline through an *Azure Resource Manager* connection plus an *Environment* with a Kubernetes resource scoped to one namespace.
- **`Docker@2`:** the build-and-push task. Use `command: buildAndPush` so build and push happen in one authenticated step against the registry connection.
- **`KubernetesManifest@1`:** the apply task. Supports `action: createSecret`, `action: deploy`, `action: bake` (Helm/Kustomize render), and `action: promote` for canary flows.
- **Trivy:** the CVE scanner from Aqua Security. Runs as a CLI step before push, with `--exit-code 1` so the pipeline fails on findings above a chosen severity.
- **Helm 3:** the alternative deploy path. `helm upgrade --install --atomic` gives you rollback-on-failure without writing your own logic.

## Step 1: Stand up ACR, AKS, and the service connections

Provision the registry and the cluster first, with the registry attached to the cluster via the kubelet managed identity. The attach is what lets us drop the `imagePullSecret` later.

```bash
RG=myapp-rg
LOC=uksouth
ACR=acrmyappprod01
AKS=aks-myapp-prod

az group create --name $RG --location $LOC

az acr create \
  --resource-group $RG \
  --name $ACR \
  --sku Standard

az aks create \
  --resource-group $RG \
  --name $AKS \
  --node-count 2 \
  --enable-managed-identity \
  --attach-acr $ACR \
  --generate-ssh-keys
```

NOTE: `--attach-acr` is the line that matters. It grants the AKS kubelet identity the `AcrPull` role on the registry resource. Without it, pods need an explicit `imagePullSecret`.

Then in Azure DevOps create three service connections:

1. *Azure Resource Manager* (workload identity federation) to the subscription.
2. *Docker Registry* of type *Azure Container Registry*, pointed at `$ACR`. This is the connection `Docker@2` will use.
3. *Kubernetes* of type *Azure Subscription*, pointed at the `$AKS` cluster and the namespace you want to deploy into.

The Kubernetes connection is what backs the *Environment* resource that gates the deploy stage.

## Step 2: Build the image with `Docker@2`

The build stage is the easy half. One job, one task, one published manifest artifact for the deploy stage to consume.

```yaml
trigger:
  branches:
    include: [ main ]

variables:
  dockerRegistryServiceConnection: 'acr-myapp-prod'
  imageRepository: 'myapp/api'
  containerRegistry: 'acrmyappprod01.azurecr.io'
  dockerfilePath: '$(Build.SourcesDirectory)/Dockerfile'
  tag: '$(Build.BuildId)'
  vmImageName: 'ubuntu-latest'

stages:
- stage: Build
  displayName: Build stage
  jobs:
  - job: Build
    displayName: Build job
    pool:
      vmImage: $(vmImageName)
    steps:
    - task: Docker@2
      displayName: Build image (no push yet)
      inputs:
        command: build
        repository: $(imageRepository)
        dockerfile: $(dockerfilePath)
        containerRegistry: $(dockerRegistryServiceConnection)
        tags: |
          $(tag)
          latest
```

Notice the `command: build`. We split build and push deliberately so Trivy can sit between them. If you do not need a scan gate, collapse the two into `command: buildAndPush` and you are done.

## Step 3: Scan with Trivy before the push

Trivy reads the local Docker daemon, so the just-built image is already addressable as `$(imageRepository):$(tag)`. The scan runs in the same job to avoid re-pulling the image.

```yaml
    - script: |
        curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh \
          | sh -s -- -b /usr/local/bin v0.55.0
        trivy image \
          --severity HIGH,CRITICAL \
          --ignore-unfixed \
          --exit-code 1 \
          --format table \
          --output $(Build.ArtifactStagingDirectory)/trivy-report.txt \
          $(imageRepository):$(tag)
      displayName: Trivy scan (fail on HIGH/CRITICAL)

    - task: PublishPipelineArtifact@1
      condition: always()
      inputs:
        targetPath: '$(Build.ArtifactStagingDirectory)/trivy-report.txt'
        artifact: 'trivy-report'
```

`--ignore-unfixed` is a judgement call. Skip it if your security team wants the full picture, keep it if you do not want red builds for CVEs that have no patch yet. `condition: always()` on the artifact publish means you still get the report even when the gate fails, which is what you want during triage.

NOTE: pin the Trivy version. The `latest` install script will silently bump versions between runs and you will lose reproducibility.

## Step 4: Push to ACR

Only after Trivy passes do we push.

```yaml
    - task: Docker@2
      displayName: Push image to ACR
      inputs:
        command: push
        repository: $(imageRepository)
        containerRegistry: $(dockerRegistryServiceConnection)
        tags: |
          $(tag)
          latest

    - task: PublishPipelineArtifact@1
      inputs:
        artifactName: 'manifests'
        path: 'manifests'
```

The second `PublishPipelineArtifact@1` hands the raw Kubernetes manifests to the deploy stage. Keep them in the repo at `manifests/` so they are versioned alongside the code.

## Step 5: Deploy to AKS with `KubernetesManifest@1`

The deploy stage targets an *Environment*, which is what gives you approvals, history, and a per-resource audit trail in `Azure DevOps > Pipelines > Environments`.

```yaml
- stage: Deploy
  displayName: Deploy stage
  dependsOn: Build
  condition: succeeded()
  jobs:
  - deployment: Deploy
    displayName: Deploy job
    pool:
      vmImage: $(vmImageName)
    environment: 'myapp-prod.default'
    strategy:
      runOnce:
        deploy:
          steps:
          - task: DownloadPipelineArtifact@2
            inputs:
              artifactName: 'manifests'
              downloadPath: '$(Pipeline.Workspace)/manifests'

          - task: KubernetesManifest@1
            displayName: Deploy to AKS
            inputs:
              action: 'deploy'
              connectionType: 'kubernetesServiceConnection'
              kubernetesServiceConnection: 'aks-myapp-prod-default'
              namespace: 'default'
              manifests: |
                $(Pipeline.Workspace)/manifests/deployment.yml
                $(Pipeline.Workspace)/manifests/service.yml
              containers: '$(containerRegistry)/$(imageRepository):$(tag)'
```

Two things to flag. First, the `containers` input is the magic that rewrites the image reference inside `deployment.yml` at apply time, so the manifest can stay tag-agnostic in the repo. Second, the `environment` value uses the `<environment>.<namespace>` form, which scopes the apply to one Kubernetes namespace and keeps the auto-generated `ServiceAccount` and `RoleBinding` boxed in.

## Step 6: `imagePullSecret` versus managed identity pull

There are two ways AKS can pull from ACR. Pick one.

### Option A: `imagePullSecret` (works on any cluster)

```yaml
          - task: KubernetesManifest@1
            displayName: Create imagePullSecret
            inputs:
              action: 'createSecret'
              connectionType: 'kubernetesServiceConnection'
              kubernetesServiceConnection: 'aks-myapp-prod-default'
              namespace: 'default'
              secretType: 'dockerRegistry'
              secretName: 'acr-pull'
              dockerRegistryEndpoint: '$(dockerRegistryServiceConnection)'
```

Then in the deploy task, set `imagePullSecrets: 'acr-pull'`. This is what the Microsoft template ships with. It works, but it puts a registry credential into a Kubernetes secret, which means anyone with `get secrets` in that namespace can decode it.

### Option B: managed identity pull (preferred)

If you ran `az aks update --attach-acr` (or `az aks create --attach-acr`), the AKS kubelet identity already holds `AcrPull` on the registry. Drop the `createSecret` step entirely and drop `imagePullSecrets` from the deploy step. The kubelet authenticates with its own identity, no secret in the cluster, no rotation chore. This is the configuration I run in production.

NOTE: managed-identity pull only works on AKS clusters with managed identity enabled (`--enable-managed-identity`). Service-principal clusters still need the secret path.

To verify the attach worked:

```bash
az aks check-acr --resource-group $RG --name $AKS --acr $ACR.azurecr.io
```

## Step 7: Helm chart deploy as the alternative

When the manifest set grows past two files, swap raw manifests for Helm. `KubernetesManifest@1` has an `action: bake` mode that renders Helm into plain YAML, which is what then gets applied. That keeps the apply step uniform.

```yaml
          - task: KubernetesManifest@1
            name: bake
            displayName: Bake Helm chart
            inputs:
              action: 'bake'
              renderType: 'helm2'
              helmChart: '$(Pipeline.Workspace)/chart'
              releaseName: 'myapp'
              overrides: |
                image.repository:$(containerRegistry)/$(imageRepository)
                image.tag:$(tag)

          - task: KubernetesManifest@1
            displayName: Deploy baked manifests
            inputs:
              action: 'deploy'
              kubernetesServiceConnection: 'aks-myapp-prod-default'
              namespace: 'default'
              manifests: $(bake.manifestsBundle)
```

If you would rather drive Helm directly (and get its native rollback semantics), use the `HelmDeploy@0` task with `command: upgrade` and `arguments: '--install --atomic --timeout 5m'`. `--atomic` is the key flag. On failure, Helm rolls the release back to the previous revision automatically.

## Step 8: Rollback strategy

Three layers, pick the one that fits the blast radius.

**Layer 1, kubectl rollout undo.** Free and instant for `Deployment` resources.

```bash
kubectl -n default rollout undo deployment/myapp
kubectl -n default rollout status deployment/myapp --timeout=2m
```

Wire it into a manual approval job in the same Azure DevOps environment so on-call can trigger it from the UI without opening a shell.

**Layer 2, Helm rollback.** If you deployed via Helm, every release is numbered.

```bash
helm history myapp
helm rollback myapp 14
```

**Layer 3, re-deploy the last known good image tag.** Because each pipeline run tags the image with `$(Build.BuildId)`, the previous good build is still in ACR. Run the pipeline against an older commit, or trigger a parameterised deploy-only pipeline that takes a `targetTag` input and skips the build stage. This is the most auditable path because the rollback shows up as a pipeline run with its own approval trail.

NOTE: do not delete old tags from ACR aggressively. Retention policies are useful but set the window to at least 30 days so layer-3 rollbacks remain possible. `az acr config retention update --registry $ACR --status enabled --days 30 --type UntaggedManifests`.

## Troubleshooting

- **`ImagePullBackOff` on first deploy after switching to managed identity pull.** The kubelet identity does not have `AcrPull` yet. Run `az aks check-acr` first, then `az aks update --resource-group $RG --name $AKS --attach-acr $ACR`. Role assignments can take 60 seconds to propagate.
- **`Docker@2` fails with `unauthorized: authentication required` on push.** The Docker registry service connection is pointing at the wrong registry, or its credential expired. Re-create it as type *Azure Container Registry* (not *Others*) so it auths via the ARM connection rather than a static admin user.
- **Trivy installer 404s mid-pipeline.** GitHub raw content rate-limits Microsoft-hosted agent IP ranges sometimes. Mirror the install script into your own repo or pin to a specific version artifact, then `curl` that.
- **`KubernetesManifest@1` deploy succeeds but pods never become ready.** Almost always a `readinessProbe` mismatch (wrong port, wrong path) or a missing `ConfigMap`/`Secret`. Run `kubectl -n default describe pod <pod>` and read the events. The task only waits for the apply to return, not for the pods to go Ready, unless you add a `kubectl rollout status` step after it.
- **Environment shows no resource after first run.** You probably created the environment by hand without the *Kubernetes resource* sub-resource. Delete it and let the pipeline auto-create it on first run, or add a Kubernetes resource via `Pipelines > Environments > <env> > Add resource > Kubernetes` and point it at the AKS cluster + namespace.

## Clean up

When the demo is done, one command takes the registry, the cluster, the kubelet identity, and the analytics workspace with it.

```bash
az group delete --name myapp-rg --yes --no-wait
```

The Azure DevOps service connections will linger as broken references. Remove them from `Project settings > Service connections` after the resource group is gone, otherwise the next pipeline run wastes 30 seconds timing out against a dead subscription scope.

That is the build. Two stages, one scan gate, one identity-based pull, three rollback layers. The pipeline is short on purpose. Every block you add past this is either a policy decision (cosign signing, SBOM publish, canary weights) or a team-specific workflow, and those belong in a follow-up rather than in the baseline that ships your first image.
