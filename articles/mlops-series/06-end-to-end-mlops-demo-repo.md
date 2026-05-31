# An End-to-End MLOps Demo Repo: Terraform AKS, GitHub Actions, MLflow, KServe, and Drift Monitoring in One `make up`

This is the final piece of the series. I want to assemble everything from the previous five posts into a single repo you can clone and bring up with one command. Terraform provisions AKS, ACR, Postgres, and Blob. A bootstrap script installs MLflow, KServe, kube-prometheus-stack, and ArgoCD. A GitHub Actions pipeline trains a model, scans it, and ships it. KServe serves it with a canary. A drift sidecar reports to Prometheus. AlertManager pages on drift.

NOTE: The repo this guide describes is `mlops-demo` and is linked at the bottom. The point of this post is not to teach each tool in isolation. That is what the previous five posts did. The point is to show how they fit together so you can lift the pattern into a real platform.

---

### STEPS

Step 1: Repo layout (folders, what lives where, why)  
Step 2: `make up`: Terraform + bootstrap in one  
Step 3: The Terraform module: AKS, ACR, Postgres, Blob  
Step 4: The bootstrap script: Helm installs for MLflow, KServe, monitoring, ArgoCD  
Step 5: The sample model and its GitHub Actions pipeline  
Step 6: The ArgoCD `Application` and the GitOps repo split  
Step 7: `make smoke`: end-to-end test through the live cluster  
Step 8: `make down`: clean teardown

---

## Why is this important?

![Figure 1: End-to-end platform topology after make up](images/06-mlops-platform-architecture.png)
*Figure 1: End-to-end platform topology after make up*

Pieces of an MLOps platform are easy to find. End-to-end examples that fit together cleanly are not. Most demo repos either skip the boring parts (the IaC, the GitOps split, the alerting rule) or skip the interesting ones (KServe canary, drift detection). What this guide gives you is the boring parts AND the interesting ones in a layout that mirrors how a real team would lay it out.

The other thing it gives you is a reproducible teardown. A demo you cannot `make down` cleanly is the demo that bills you £200 over the weekend.

## Prerequisites

- **Azure subscription** with Contributor and at least `Standard_NC6s_v3` GPU quota (if you want the LLM piece; CPU-only sklearn works without it).
- **Tools:** `terraform` v1.9+, `az` v2.60+, `kubectl` v1.29+, `helm` v3.13+, `docker`, `make`, `python` 3.11+, `git`.
- **Two GitHub repos:** `mlops-demo` (code) and `mlops-demo-gitops` (manifests). The guide assumes both names.
- **GitHub Actions secrets** set on `mlops-demo`: `AZURE_CREDENTIALS`, `MLFLOW_TRACKING_URI` (filled in after Step 2), `GITOPS_PAT`.

## Tools Used

- **Terraform:** Provisions the cloud resources.
- **Helm:** Installs the in-cluster software.
- **MLflow:** Tracking + registry.
- **KServe:** Model serving with canary.
- **kube-prometheus-stack:** Prometheus + Grafana + AlertManager.
- **ArgoCD:** GitOps controller.
- **GitHub Actions:** CI/CD.
- **Evidently AI:** Drift detection.
- **make:** Glue.

---

## Step 1: Repo layout

```
mlops-demo/
├── Makefile
├── README.md
├── infra/
│   ├── main.tf
│   ├── variables.tf
│   ├── outputs.tf
│   └── modules/
│       ├── aks/
│       ├── acr/
│       ├── postgres/
│       └── storage/
├── bootstrap/
│   ├── 00-namespaces.yaml
│   ├── 10-istio-knative-cert-manager.sh
│   ├── 20-kserve.sh
│   ├── 30-mlflow.sh
│   ├── 40-monitoring.sh
│   ├── 50-argocd.sh
│   └── 60-argocd-application.yaml
├── model/
│   ├── src/
│   │   ├── train.py
│   │   └── serve.py
│   ├── tests/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── dvc.yaml
├── drift-sidecar/
│   ├── drift_sidecar.py
│   ├── Dockerfile
│   ├── make_reference.py
│   └── reference.parquet
├── .github/workflows/cicd.yml
└── scripts/
    ├── smoke.sh
    └── promote.py
```

Two repos. This one (`mlops-demo`) and a paired GitOps repo (`mlops-demo-gitops`) with the manifests ArgoCD reconciles against. The CI pipeline pushes manifest updates into the second repo; ArgoCD picks them up.

## Step 2: `make up`: Terraform + bootstrap in one

Paste the following into `Makefile`:

```makefile
.PHONY: up infra bootstrap smoke down

RG ?= rg-mlops-demo
LOC ?= uksouth
CLUSTER ?= aks-mlops-demo

up: infra bootstrap
	@echo "Cluster is up. Grafana on port-forward 3000, MLflow on ingress IP."

infra:
	cd infra && terraform init && terraform apply -auto-approve \
	  -var "resource_group=$(RG)" -var "location=$(LOC)" -var "cluster_name=$(CLUSTER)"
	az aks get-credentials -g $(RG) -n $(CLUSTER) --overwrite-existing

bootstrap:
	bash bootstrap/10-istio-knative-cert-manager.sh
	bash bootstrap/20-kserve.sh
	bash bootstrap/30-mlflow.sh
	bash bootstrap/40-monitoring.sh
	bash bootstrap/50-argocd.sh
	kubectl apply -f bootstrap/60-argocd-application.yaml

smoke:
	bash scripts/smoke.sh

down:
	cd infra && terraform destroy -auto-approve \
	  -var "resource_group=$(RG)" -var "location=$(LOC)" -var "cluster_name=$(CLUSTER)"
```

The shape: `make up` runs the Terraform, then the bootstrap scripts in order. Each script is self-contained. If a script fails halfway through, fix it and re-run `make bootstrap`. Every step is idempotent.

## Step 3: The Terraform module: AKS, ACR, Postgres, Blob

`infra/main.tf` (abbreviated):

```hcl
terraform {
  required_version = ">= 1.9"
  required_providers {
    azurerm = { source = "hashicorp/azurerm", version = "~> 4.0" }
  }
}

provider "azurerm" {
  features {}
}

resource "azurerm_resource_group" "rg" {
  name     = var.resource_group
  location = var.location
}

module "aks" {
  source              = "./modules/aks"
  resource_group      = azurerm_resource_group.rg.name
  location            = var.location
  cluster_name        = var.cluster_name
  system_node_size    = "Standard_B2ms"
  gpu_node_size       = "Standard_NC6s_v3"
  gpu_node_count      = 0   # scale up only when you need the LLM
}

module "acr" {
  source         = "./modules/acr"
  resource_group = azurerm_resource_group.rg.name
  location       = var.location
  acr_name       = "acr${replace(var.cluster_name, "-", "")}${random_string.suffix.result}"
  aks_principal  = module.aks.kubelet_principal_id
}

module "postgres" {
  source         = "./modules/postgres"
  resource_group = azurerm_resource_group.rg.name
  location       = var.location
  server_name    = "pg-${var.cluster_name}"
  admin_user     = "mlflowadmin"
  admin_password = var.postgres_password
  database_name  = "mlflowdb"
}

module "storage" {
  source         = "./modules/storage"
  resource_group = azurerm_resource_group.rg.name
  location       = var.location
  account_name   = "st${replace(var.cluster_name, "-", "")}${random_string.suffix.result}"
}

resource "random_string" "suffix" {
  length  = 5
  upper   = false
  special = false
}
```

`outputs.tf`:

```hcl
output "acr_login_server"   { value = module.acr.login_server }
output "mlflow_pg_host"     { value = module.postgres.host }
output "mlflow_pg_password" { value = var.postgres_password, sensitive = true }
output "mlflow_sa_name"     { value = module.storage.account_name }
output "mlflow_sa_key"      { value = module.storage.primary_key, sensitive = true }
```

Each module under `infra/modules/` is roughly the standard Azure provider resource for its service, nothing exotic. The key choice: GPU node count defaults to `0` and you scale it up from a CronJob or a `make gpu-on` target only when you actually need it.

## Step 4: The bootstrap script: Helm installs for everything in-cluster

Each script under `bootstrap/` does one thing.

`10-istio-knative-cert-manager.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
istioctl install --set profile=default -y
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.15.3/cert-manager.yaml
kubectl -n cert-manager wait --for=condition=Available deploy --all --timeout=300s
kubectl apply -f https://github.com/knative/serving/releases/download/knative-v1.15.2/serving-crds.yaml
kubectl apply -f https://github.com/knative/serving/releases/download/knative-v1.15.2/serving-core.yaml
kubectl apply -f https://github.com/knative/net-istio/releases/download/knative-v1.15.1/net-istio.yaml
```

`20-kserve.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
kubectl apply -f https://github.com/kserve/kserve/releases/download/v0.13.1/kserve.yaml
kubectl apply -f https://github.com/kserve/kserve/releases/download/v0.13.1/kserve-cluster-resources.yaml
kubectl -n kserve wait --for=condition=Available deploy --all --timeout=300s
```

`30-mlflow.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
PG_HOST=$(terraform -chdir=infra output -raw mlflow_pg_host)
PG_PASS=$(terraform -chdir=infra output -raw mlflow_pg_password)
SA_NAME=$(terraform -chdir=infra output -raw mlflow_sa_name)
SA_KEY=$(terraform -chdir=infra output -raw mlflow_sa_key)

kubectl create namespace mlflow --dry-run=client -o yaml | kubectl apply -f -
kubectl -n mlflow create secret generic mlflow-secrets \
  --from-literal=BACKEND_STORE_URI="postgresql+psycopg2://mlflowadmin:${PG_PASS}@${PG_HOST}:5432/mlflowdb?sslmode=require" \
  --from-literal=ARTIFACT_ROOT="wasbs://mlflow-artifacts@${SA_NAME}.blob.core.windows.net/" \
  --from-literal=AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=https;AccountName=${SA_NAME};AccountKey=${SA_KEY};EndpointSuffix=core.windows.net" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl apply -n mlflow -f bootstrap/manifests/mlflow-deployment.yaml
kubectl apply -n mlflow -f bootstrap/manifests/mlflow-service.yaml
kubectl apply -n mlflow -f bootstrap/manifests/mlflow-ingress.yaml
```

`40-monitoring.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -
helm upgrade --install kps prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --set grafana.adminPassword='change-me' \
  --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false
```

`50-argocd.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
kubectl create namespace argocd --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/v2.13.0/manifests/install.yaml
kubectl -n argocd wait --for=condition=Available deploy --all --timeout=300s
```

`60-argocd-application.yaml` (the ArgoCD `Application` from the CI/CD guide, pointing at the GitOps repo):

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: mlops-demo
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/REPLACE_OWNER/mlops-demo-gitops
    targetRevision: HEAD
    path: apps/mlops-demo
  destination:
    server: https://kubernetes.default.svc
    namespace: ml-services
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

## Step 5: The sample model and its GitHub Actions pipeline

![Figure 2: GitHub Actions pipeline through to ArgoCD reconcile](images/06-cicd-pipeline-flow.png)
*Figure 2: GitHub Actions pipeline through to ArgoCD reconcile*

The `model/` directory and `.github/workflows/cicd.yml` are essentially the ones from the GitHub Actions guide. The pipeline shape: `test > train > build > scan > bump-gitops`. Trivy and Bandit are still the security gates. The only difference at this scale is that `train` writes to the MLflow instance we just bootstrapped, and the GitOps bump targets `mlops-demo-gitops`.

The drift sidecar from the drift-detection guide is a second image and a second container in the same `Deployment`. So the pipeline builds and pushes two images (`model:sha` and `drift-sidecar:sha`) and bumps both in the GitOps repo.

## Step 6: The ArgoCD Application and the GitOps repo split

The GitOps repo (`mlops-demo-gitops`) layout:

```
mlops-demo-gitops/
└── apps/
    └── mlops-demo/
        ├── kustomization.yaml
        ├── inference-service.yaml     # KServe InferenceService
        ├── deployment.yaml             # if not using KServe
        ├── service.yaml
        ├── servicemonitor.yaml
        ├── prometheusrule.yaml
        └── canary-overlay.yaml         # optional canary slice
```

The `InferenceService` from the KServe guide goes here. The `canaryTrafficPercent` field is what the CI pipeline (or a separate "promote" pipeline) modifies when promoting a new model version.

For the cleanest split, the model image bump (the `:sha` change) is automatic via CI. The canary promotion (the `canaryTrafficPercent` change) is manual or via a separate Azure DevOps / GitHub Environment with an approver. Exactly the pattern from the MLflow registry guide.

## Step 7: `make smoke`: end-to-end test through the live cluster

![Figure 3: make smoke request and drift-signal sequence](images/06-smoke-test-sequence.png)
*Figure 3: make smoke request and drift-signal sequence*

`scripts/smoke.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

INGRESS=$(kubectl -n istio-system get svc istio-ingressgateway -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
HOST=$(kubectl get inferenceservice mlops-demo -o jsonpath='{.status.url}' | sed 's|http://||')

echo "==> healthcheck"
curl -sf -H "Host: $HOST" http://$INGRESS/v1/models/mlops-demo

echo "==> normal prediction (should not be flagged)"
curl -s -H "Host: $HOST" http://$INGRESS/v1/models/mlops-demo:predict \
  -d '{"instances": [[5.1, 3.5, 1.4, 0.2]]}'

echo "==> 50 drifted requests"
for i in {1..50}; do
  curl -s -H "Host: $HOST" http://$INGRESS/v1/models/mlops-demo:predict \
    -d '{"instances": [[18.0, 9.5, 8.0, 6.5]]}' >/dev/null
done

echo "==> wait 90s for the drift sidecar to compute"
sleep 90

echo "==> querying Prometheus for drift signal"
kubectl -n monitoring port-forward svc/kps-prometheus 9090:9090 &
PF_PID=$!
sleep 3
curl -s 'http://localhost:9090/api/v1/query?query=model_drift_share_drifted_columns'
kill $PF_PID

echo "==> done"
```

`make smoke` after `make up` exercises the full path. KServe answers a healthcheck, returns a normal prediction, eats drifted traffic, and the drift metric becomes queryable in Prometheus inside 90 seconds. If all four lines of output look right, the platform is real.

## Step 8: `make down`: clean teardown

```bash
make down
```

`terraform destroy` removes the resource group, which takes everything in it: AKS, ACR, Postgres, Blob, the lot. If a Postgres deletion fails because of a soft-delete policy, set `azurerm_postgresql_flexible_server.soft_delete_enabled = false` in the module and re-apply before destroying.

For belt-and-braces, after `make down`:

```bash
az group exists -n rg-mlops-demo
```

If that returns `true`, the destroy hit an error mid-way through. Delete the resource group directly from the portal or with `az group delete -n rg-mlops-demo --yes --no-wait`.

## Troubleshooting

- **`make up` fails inside `infra`:** Usually a quota issue on the AKS node pool. `az vm list-skus -l uksouth --query "[?name=='Standard_NC6s_v3'].restrictions"` will tell you.
- **`make up` fails inside `bootstrap/30-mlflow.sh`:** The terraform output values are not in scope yet. Re-run with `terraform -chdir=infra output` first to confirm they exist, then re-run `bash bootstrap/30-mlflow.sh` directly.
- **ArgoCD shows `OutOfSync` forever:** The GitOps repo URL in `60-argocd-application.yaml` was not replaced. Edit it, re-apply, then click `Sync` in the UI.
- **`make smoke` returns connection-refused:** The Istio ingress IP has not been allocated yet. Wait 2 minutes after `make up` finishes and re-run.

## Clean up

```bash
make down
```

Two checks afterward:

```bash
az group exists -n rg-mlops-demo
az role assignment list --assignee $(az ad signed-in-user show --query id -o tsv) --query "[?contains(scope, 'mlops-demo')]"
```

The first should be `false`, the second should be empty.

## Conclusion

If you got this far, you have taken five separate MLOps pieces (cloud infrastructure, model CI/CD, registry, canary serving, and drift monitoring) and brought them up as a single working platform in one command, exercised the end-to-end path, and torn it back down without leaving any billable bits behind.

GitHub source repos for this guide:

- Code: [link to `mlops-demo` to be added after publish]
- GitOps: [link to `mlops-demo-gitops` to be added after publish]

That closes out the series. The five articles before this one go deep into each piece in isolation; this one shows them as a system. Lift whichever pieces fit your stack. The patterns transfer cleanly to EKS, GKE, or on-prem with mostly cosmetic changes.
