# GitOps on AKS with Argo CD and Flux: when to pick which, and how to wire either to Azure DevOps

Most platform teams get to GitOps the same way. Someone, usually on the SRE side, gets tired of `kubectl apply` from a laptop, or of CI jobs holding cluster credentials, and decides the cluster should pull instead of being pushed. That is the whole pitch. Git becomes the source of truth, a controller in the cluster watches a repo, and what is in `main` is what is running. The interesting question is no longer "should we?" but "Argo CD or Flux, and where does Azure Pipelines fit?"

I have shipped both on AKS. They are not interchangeable. Picking the wrong one for the team costs you weeks. This walks through the model, the install paths for each, the Azure Pipelines hand-off, and the call I make when a new project lands.

### STEPS
1. Repo split: code repo and manifest repo
2. Install Flux on AKS via the `microsoft.flux` cluster extension
3. Install Argo CD on AKS via raw manifests
4. Wire Azure Pipelines so it updates the manifest repo, not the cluster
5. Argo CD app-of-apps and `ApplicationSet`
6. Pick the controller per team, not per cluster

## Why this matters

The classic Azure Pipelines pattern is push-based. The pipeline holds an Azure Resource Manager service connection, runs `kubectl apply`, and writes directly to the cluster. That works. It also means every cluster credential lives in a CI runner, drift is invisible (the cluster can be edited out-of-band and nobody knows), and rollback is "re-run an old pipeline and hope".

GitOps inverts that. The pipeline never talks to the cluster. It builds the image, pushes to Azure Container Registry, then opens a commit (or PR) against a separate manifest repo that bumps the image tag. A controller running inside AKS watches that manifest repo, sees the new commit, and reconciles. Drift gets corrected on the next sync interval. Rollback is `git revert`. The cluster credential never leaves the cluster.

That is the loop. The Argo vs Flux call is about which controller runs that loop and what it gives you on top.

## Prerequisites

- An AKS cluster running Kubernetes 1.28 or later, MSI-based (not SPN). The `microsoft.flux` extension does not work with SPN-based clusters. Convert with `az aks update -g $RESOURCE_GROUP -n $CLUSTER_NAME --enable-managed-identity` if needed.
- Azure CLI `2.15` or later, plus `kubectl` (install via `az aks install-cli`).
- An Azure DevOps organization with a project, a Git repo for application code, and a second Git repo for manifests.
- An Azure Container Registry, attached to AKS (`az aks update --attach-acr`) so the kubelet can pull without a pull secret.
- Owner or Contributor on the AKS resource group, with read/write on `Microsoft.KubernetesConfiguration/extensions` and `Microsoft.KubernetesConfiguration/fluxConfigurations`.
- The Azure CLI extensions `k8s-configuration` and `k8s-extension` installed.
- For the Argo CD path: a way to expose the Argo server (internal Load Balancer, Application Gateway, or just port-forward for first use).

## Tools Used

**Azure Kubernetes Service (AKS):** the managed control plane that hosts the controller and the workload pods. Both Argo and Flux run as ordinary pods.

**Flux v2 (`microsoft.flux` extension):** the Azure-curated Flux distribution. Installed as a `Microsoft.KubernetesConfiguration/extensions` resource, which means lifecycle, upgrades, and identity are managed by ARM, not by you.

**Argo CD:** a CNCF-graduated GitOps controller with a first-class web UI, an `argocd` CLI, RBAC tied to its own users or SSO, and the `ApplicationSet` controller for fan-out across clusters and environments.

**Azure Pipelines:** the build plane. Multi-stage YAML, one stage builds and pushes the image, the next stage opens a commit on the manifest repo. Cluster credentials never get mounted.

**Azure Container Registry (ACR):** the image registry. Geo-replicated if you run multi-region. Attached to AKS so image pulls use the kubelet identity.

**Kustomize and Helm:** the templating layers. Flux speaks both natively via its `kustomize-controller` and `helm-controller`. Argo CD renders both as well, plus plain manifests and Jsonnet.

## Step 1: Split the repos

This is the part most teams skip and regret. You want two repos, not one.

- `app-foo` (code repo): Dockerfile, source code, `azure-pipelines.yml`. The pipeline builds the image, tags it with the commit SHA, pushes to ACR. That is its only job.
- `app-foo-deploy` (manifest repo): `kustomization.yaml`, `deployment.yaml`, `service.yaml`, `values.yaml` for any Helm charts, environment overlays under `overlays/dev/`, `overlays/staging/`, `overlays/prod/`. This is what the controller watches.

A typical manifest repo layout:

```
app-foo-deploy/
  base/
    deployment.yaml
    service.yaml
    kustomization.yaml
  overlays/
    dev/
      kustomization.yaml
      image-tag-patch.yaml
    prod/
      kustomization.yaml
      image-tag-patch.yaml
```

The image tag patch is what the pipeline rewrites. Keep it small and isolated so the bot commit diff is one or two lines.

NOTE: Resist the urge to put manifests next to code. The moment a single rebuild of `main` triggers a deploy through a webhook on the code repo, you have rebuilt the push model with extra steps. The manifest repo exists so the deploy decision is a separate, reviewable commit.

## Step 2: Install Flux on AKS via the `microsoft.flux` extension

This is the Azure-preferred path. The extension installs the Flux controllers (`source-controller`, `kustomize-controller`, `helm-controller`, `notification-controller`), plus two Azure-side agents (`fluxconfig-agent`, `fluxconfig-controller`) into the `flux-system` namespace. Lifecycle is managed by the `Microsoft.KubernetesConfiguration` resource provider, so upgrades come through ARM.

First, register the resource providers and add the CLI extensions:

```bash
az provider register --namespace Microsoft.Kubernetes
az provider register --namespace Microsoft.ContainerService
az provider register --namespace Microsoft.KubernetesConfiguration

az extension add -n k8s-configuration
az extension add -n k8s-extension
```

Now create a `fluxConfigurations` resource. The extension installs itself on first use, so you do not have to call `az k8s-extension create` separately unless you want to pin a version or enable the image automation controllers.

```bash
az k8s-configuration flux create \
  -g aks-platform-rg \
  -c aks-platform-prod \
  -n cluster-config \
  --namespace cluster-config \
  -t managedClusters \
  --scope cluster \
  -u https://dev.azure.com/contoso/platform/_git/app-foo-deploy \
  --branch main \
  --kustomization name=infra path=./infrastructure prune=true \
  --kustomization name=apps  path=./apps/prod      prune=true dependsOn=\["infra"\]
```

Two things worth flagging. The `-t` value is `managedClusters` for AKS and `connectedClusters` for Arc-enabled Kubernetes (the same command pattern, different cluster type). And `prune=true` is what makes the controller delete resources removed from Git. Without it, `git rm` leaves orphans in the cluster.

Verify the controllers are up:

```bash
kubectl get pods -n flux-system
```

You should see `fluxconfig-agent`, `fluxconfig-controller`, `helm-controller`, `kustomize-controller`, `notification-controller`, and `source-controller`, each `Running`.

Check reconciliation status from Azure:

```bash
az k8s-configuration flux show \
  -g aks-platform-rg \
  -c aks-platform-prod \
  -n cluster-config \
  -t managedClusters
```

The compliance state starts as `Pending`, then flips to `Compliant` once the first reconcile lands.

NOTE: If you need the `image-automation-controller` and `image-reflector-controller` (the components that let Flux itself bump image tags in Git), they are off by default. Turn them on with `az k8s-extension update --config image-automation-controller.enabled=true image-reflector-controller.enabled=true -c $CLUSTER -g $RG -t managedClusters -n flux`.

## Step 3: Install Argo CD on AKS via raw manifests

Argo is not packaged as an Azure extension. You install it from the upstream manifests, the same way you would on any Kubernetes cluster.

```bash
kubectl create namespace argocd
kubectl apply -n argocd --server-side --force-conflicts \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

For production, pin to a release tag (`v3.2.0` for example) rather than `stable`. The Argo project recommends this explicitly.

Get the initial admin password and port-forward to log in:

```bash
argocd admin initial-password -n argocd
kubectl port-forward svc/argocd-server -n argocd 8080:443
argocd login localhost:8080
```

Then point Argo at the same manifest repo. An `Application` resource is just YAML:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: app-foo-prod
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://dev.azure.com/contoso/platform/_git/app-foo-deploy
    targetRevision: main
    path: overlays/prod
  destination:
    server: https://kubernetes.default.svc
    namespace: app-foo
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

`automated.prune: true` is the Argo equivalent of Flux's `prune=true`. `selfHeal: true` is what corrects manual `kubectl` edits in the cluster.

For Azure DevOps Git, Argo needs credentials. Add the repo with a PAT scoped to Code (Read):

```bash
argocd repo add https://dev.azure.com/contoso/platform/_git/app-foo-deploy \
  --username anything \
  --password $AZDO_PAT
```

NOTE: Azure DevOps requires HTTPS basic auth with the PAT as the password. The username can be any non-empty string. SSH also works if you upload a deploy key under `Project settings > SSH public keys`.

## Step 4: Wire Azure Pipelines to commit, not deploy

The pipeline's last stage opens a commit against `app-foo-deploy`. No `kubectl`, no `helm upgrade`, no cluster credentials.

```yaml
trigger:
  branches:
    include: [ main ]

variables:
  imageRepo: 'app-foo'
  acrName:   'acrplatform001'
  manifestRepo: 'https://contoso@dev.azure.com/contoso/platform/_git/app-foo-deploy'

stages:
  - stage: Build
    jobs:
      - job: BuildPush
        pool:
          vmImage: ubuntu-latest
        steps:
          - task: Docker@2
            inputs:
              containerRegistry: 'acr-svc-conn'
              repository: $(imageRepo)
              command: buildAndPush
              Dockerfile: '**/Dockerfile'
              tags: |
                $(Build.SourceVersion)

  - stage: BumpManifest
    dependsOn: Build
    jobs:
      - job: CommitTagBump
        pool:
          vmImage: ubuntu-latest
        steps:
          - checkout: none
          - script: |
              set -euo pipefail
              git config --global user.email "build@contoso.com"
              git config --global user.name  "azdo-bot"
              git clone $(manifestRepo) deploy
              cd deploy/overlays/prod
              sed -i "s|newTag: .*|newTag: $(Build.SourceVersion)|" kustomization.yaml
              git add kustomization.yaml
              git commit -m "app-foo prod: $(Build.SourceVersion)"
              git push origin HEAD:main
            env:
              SYSTEM_ACCESSTOKEN: $(System.AccessToken)
            displayName: Bump prod image tag
```

A few details. The `Docker@2` task is the current major version for Azure Pipelines. `$(Build.SourceVersion)` is the commit SHA, which makes the image tag traceable back to the source commit. The bump job uses `System.AccessToken`, which is the build identity's bearer token. Grant the build identity Contribute on the manifest repo under `Project settings > Repositories > app-foo-deploy > Security`.

For environments that want a PR rather than a direct push (production, usually), swap the `git push origin HEAD:main` for a push to a feature branch and an `az repos pr create` call. The controller will not deploy until the PR is merged, which is exactly the gate you want.

## Step 5: Argo CD's app-of-apps and `ApplicationSet`

Once you have more than five apps, managing `Application` YAML per app becomes its own toil. Argo gives you two patterns.

**App-of-apps:** one root `Application` whose source is a Git directory full of other `Application` manifests. Argo syncs the root, the root creates the children, the children sync their workloads. The root is the only thing you `argocd app create` manually.

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: platform-root
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://dev.azure.com/contoso/platform/_git/argocd-apps
    targetRevision: main
    path: apps
  destination:
    server: https://kubernetes.default.svc
    namespace: argocd
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

**`ApplicationSet`:** a template that fans out `Application` resources from a generator. The `git` generator walks a directory tree and emits one `Application` per matched path. The `cluster` generator emits one per registered cluster. Combine them and you get "every app in `apps/` deployed to every prod cluster" in twenty lines of YAML.

Flux has an equivalent through multiple `Kustomization` resources plus `dependsOn`, but it does not have a single declarative fan-out object the way `ApplicationSet` does.

## Step 6: Pick the controller per team

Here is the short version of how I pick.

Pick **Flux via the `microsoft.flux` extension** when:

- The cluster is AKS or Arc-enabled and you want Microsoft to own the upgrade path. The extension lifecycle is ARM-managed.
- You are already using Azure Policy to enforce baseline configurations at subscription scope. There is a built-in policy that deploys `fluxConfigurations` at scale.
- The team is small and does not need a UI to walk non-engineers through deploy state. `kubectl get fluxconfigs -A` and the Azure portal blade are enough.
- You want minimal moving parts. Four controllers, two agents, one CRD set.

Pick **Argo CD** when:

- You have multiple teams sharing a cluster and you want them to log in to a UI, see only their apps, and trigger a sync without a PR.
- You need `ApplicationSet` to fan an app across many clusters or environments declaratively.
- You want SSO into the controller itself (Entra ID via OIDC, GitHub, etc.) with per-project RBAC.
- The org is already running Argo CD elsewhere and standardising on it.

I have run both side by side. There is no rule against it. Flux managing platform infrastructure (ingress controllers, cert-manager, external-dns), Argo managing application teams' workloads, both pointing at the same AKS cluster. The platform team owns the `flux-system` namespace. The app teams log in to Argo.

## Troubleshooting

**`microsoft.flux` install fails with `ExtensionOperationFailed`.** Check the cluster is MSI-based, not SPN. `az aks show -g $RG -n $CLUSTER --query identity.type` should return `SystemAssigned` or `UserAssigned`. If it returns nothing, run `az aks update --enable-managed-identity` first.

**Flux configuration stuck in `Pending` compliance state.** Run `kubectl logs -n flux-system deploy/source-controller`. Most commonly the controller cannot reach the Azure DevOps Git repo. Either the PAT in the secret has expired, or the cluster egress is blocked. The agents need outbound 443 to `management.azure.com`, `<region>.dp.kubernetesconfiguration.azure.com`, `login.microsoftonline.com`, and `mcr.microsoft.com`.

**Argo CD shows `OutOfSync` but `Synced` after a manual click.** Auto-sync is not turned on. Set `spec.syncPolicy.automated.selfHeal: true`. Without it, Argo detects drift but waits for a human.

**Pipeline pushes the manifest commit but nothing deploys.** Two checks. First, the controller sync interval. Flux defaults to one minute on `GitRepository`, Argo defaults to three minutes for the repo poll. Force a sync with `flux reconcile source git cluster-config -n flux-system` or `argocd app sync app-foo-prod`. Second, the manifest commit landed but the image tag patch is in the wrong overlay. `kubectl describe kustomization` or `argocd app diff` will tell you.

**ACR pull fails with `ImagePullBackOff` after the manifest update.** The AKS cluster is not attached to the ACR. Run `az aks update -g $RG -n $CLUSTER --attach-acr $ACR_NAME`. This grants the kubelet identity `AcrPull` on the registry. No `imagePullSecrets` required.

## Clean up

For a Flux configuration:

```bash
az k8s-configuration flux delete \
  -g aks-platform-rg \
  -c aks-platform-prod \
  -n cluster-config \
  -t managedClusters --yes

az k8s-extension delete \
  -g aks-platform-rg \
  -c aks-platform-prod \
  -t managedClusters --name flux --yes
```

For Argo CD:

```bash
kubectl delete -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl delete namespace argocd
```

Tear down the manifest repo last, after you have confirmed nothing else points at it.

That is the build. Code repo on one side, manifest repo on the other, pipeline writing a one-line image tag bump in between, and whichever controller fits the team running the reconcile loop inside AKS. If you got the repo split right, swapping Flux for Argo (or running both) later is a weekend, not a quarter.
