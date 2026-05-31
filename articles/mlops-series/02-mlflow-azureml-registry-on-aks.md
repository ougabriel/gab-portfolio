# MLflow + Azure ML Model Registry on AKS, With Promotion Gates in Azure DevOps

I want to walk through standing up a self-hosted MLflow tracking + model registry on AKS, pointing it at Azure Postgres for the metadata and Blob Storage for the artifacts, and then wiring an Azure DevOps pipeline that takes a freshly trained model from `Staging` to `Production` only after a human reviewer approves the run.

NOTE: Azure ML Workspace ships a managed MLflow server. We are going self-hosted here because a single tracking server that lives in your own AKS cluster is easier to reason about for an internal team, easier to back up, and keeps you off Azure ML pricing when all you actually need is a registry.

---

### STEPS

Step 1: Provision the backing services (Postgres Flexible Server and Blob Storage)  
Step 2: Deploy MLflow on AKS, behind an Ingress  
Step 3: Wire MLflow to Postgres + Blob using a `Secret`  
Step 4: Train a model and log it to the registry  
Step 5: Build the Azure DevOps promotion pipeline  
Step 6: Add the approval gate and run a promotion end-to-end

---

## Why is this important?

A model registry is the difference between "the data scientist trained something good and emailed me the `.pkl`" and "version `v3.2` is in `Production`, it scored `0.91` ROC-AUC, here is the git SHA of the training code, and the approver was `gabriel@`".

Without the registry, every model deploy is a re-relitigation of which artifact is current. With it, your CI/CD has a clean handle to grab: "give me the current `Production` version of `fraud-classifier`". The rest of this guide is about giving that handle to your Azure DevOps pipeline so that promotions go through a gate, not an email thread.

## Prerequisites

- **AKS cluster:** A small one is fine. If you do not have one yet, the `Step 1` block from the previous guide spins one up.
- **Azure CLI:** `az login` done, default subscription set.
- **Helm:** v3.13 or later.
- **Azure DevOps organisation:** With a project and a service connection to your Azure subscription (`Project settings > Service connections > New > Azure Resource Manager`).
- **Python 3.10+** locally for the training step.

## Tools Used

- **MLflow:** Tracking server + model registry. We will use version `2.18.0`.
- **Postgres Flexible Server:** Metadata store. SQLite is the MLflow default but it does not survive pod restarts in any sensible way.
- **Azure Blob Storage:** Artifact store. Models, plots, logs.
- **Azure DevOps Pipelines:** The promotion pipeline runs here and gives us the manual approval gate for free.
- **Azure Key Vault (optional):** For storing the Postgres connection string and the storage account key. We will reference it but a `Secret` from a literal value is fine for the demo.

---

## Step 1: Provision the backing services

Open a terminal and create the resource group, Postgres server, and storage account.

```bash
RG=rg-mlflow-demo
LOC=uksouth
PG=pg-mlflow-$RANDOM
SA=samlflow$RANDOM
DBNAME=mlflowdb
DBUSER=mlflowadmin
DBPASS='P@ssword-Strong-1!'  # use a real secret in production

az group create -n $RG -l $LOC

az postgres flexible-server create \
  -g $RG -n $PG \
  --tier Burstable --sku-name Standard_B1ms \
  --admin-user $DBUSER --admin-password "$DBPASS" \
  --public-access 0.0.0.0 \
  --version 16

az postgres flexible-server db create \
  -g $RG --server-name $PG --database-name $DBNAME

az storage account create \
  -g $RG -n $SA --sku Standard_LRS

az storage container create \
  --account-name $SA --name mlflow-artifacts \
  --auth-mode login
```

NOTE: `--public-access 0.0.0.0` opens the Postgres firewall to all IPs for the duration of the demo. For real environments, restrict it to the AKS egress IP and front it with a private endpoint instead.

Grab the artifact storage key so we can pass it into MLflow:

```bash
SA_KEY=$(az storage account keys list -g $RG -n $SA --query "[0].value" -o tsv)
echo $SA_KEY
```

## Step 2: Deploy MLflow on AKS

![Figure 1. Self-hosted MLflow on AKS with Postgres metadata store and Blob artifact store](images/02-mlflow-aks-architecture.png)
*Figure 1. Self-hosted MLflow on AKS with Postgres metadata store and Blob artifact store*

We will use a small custom `Deployment` rather than the community Helm chart so the Postgres + Blob wiring is fully visible.

Create a folder and start with the `Secret`:

```bash
mkdir -p mlflow-k8s && cd mlflow-k8s
touch secret.yaml deployment.yaml service.yaml ingress.yaml
```

Paste the following into `secret.yaml`. Replace the values with yours from Step 1.

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: mlflow-secrets
type: Opaque
stringData:
  BACKEND_STORE_URI: "postgresql+psycopg2://REPLACE_DBUSER:REPLACE_DBPASS@REPLACE_PG.postgres.database.azure.com:5432/mlflowdb?sslmode=require"
  ARTIFACT_ROOT: "wasbs://mlflow-artifacts@REPLACE_SA.blob.core.windows.net/"
  AZURE_STORAGE_CONNECTION_STRING: "DefaultEndpointsProtocol=https;AccountName=REPLACE_SA;AccountKey=REPLACE_KEY;EndpointSuffix=core.windows.net"
```

Apply it:

```bash
kubectl create namespace mlflow
kubectl apply -n mlflow -f secret.yaml
```

## Step 3: Wire the Deployment, Service, and Ingress

Paste the following into `deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mlflow
spec:
  replicas: 1
  selector:
    matchLabels:
      app: mlflow
  template:
    metadata:
      labels:
        app: mlflow
    spec:
      containers:
        - name: mlflow
          image: ghcr.io/mlflow/mlflow:v2.18.0
          command:
            - sh
            - -c
            - |
              pip install psycopg2-binary azure-storage-blob azure-identity && \
              mlflow server \
                --host 0.0.0.0 \
                --port 5000 \
                --backend-store-uri "$BACKEND_STORE_URI" \
                --default-artifact-root "$ARTIFACT_ROOT" \
                --serve-artifacts
          envFrom:
            - secretRef:
                name: mlflow-secrets
          ports:
            - containerPort: 5000
          readinessProbe:
            httpGet:
              path: /health
              port: 5000
            initialDelaySeconds: 30
            periodSeconds: 10
          resources:
            requests:
              cpu: "200m"
              memory: "512Mi"
            limits:
              cpu: "1"
              memory: "2Gi"
```

Paste the following into `service.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: mlflow
spec:
  type: ClusterIP
  selector:
    app: mlflow
  ports:
    - port: 80
      targetPort: 5000
```

Paste the following into `ingress.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: mlflow
  annotations:
    nginx.ingress.kubernetes.io/proxy-body-size: "256m"
spec:
  ingressClassName: nginx
  rules:
    - http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: mlflow
                port:
                  number: 80
```

The `proxy-body-size` bump matters because model artifact uploads can be larger than the NGINX default of 1 MB and you will get a confusing 413 otherwise.

Apply everything:

```bash
kubectl apply -n mlflow -f deployment.yaml -f service.yaml -f ingress.yaml
kubectl get pods -n mlflow -w
```

Wait until the pod is `Running` and `READY 1/1`. Get the Ingress IP and open it in a browser:

```bash
kubectl get ingress -n mlflow
```

You should see the MLflow UI on `http://<INGRESS_IP>/`. Click `Models` in the top nav. Empty for now. We will fix that in Step 4.

## Step 4: Train a model and log it to the registry

Switch to a local folder for the training code.

```bash
mkdir -p ../trainer && cd ../trainer
python -m venv .venv && source .venv/Scripts/activate  # use source .venv/bin/activate on Linux
pip install mlflow==2.18.0 scikit-learn pandas
touch train.py
```

Paste the following into `train.py`:

```python
import os
import mlflow
import mlflow.sklearn
from sklearn.datasets import load_breast_cancer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score

MLFLOW_URI = os.environ["MLFLOW_TRACKING_URI"]
MODEL_NAME = "breast-cancer-classifier"

mlflow.set_tracking_uri(MLFLOW_URI)
mlflow.set_experiment("breast-cancer")

X, y = load_breast_cancer(return_X_y=True, as_frame=True)
X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42)

with mlflow.start_run() as run:
    C = float(os.environ.get("C", "1.0"))
    mlflow.log_param("C", C)
    mlflow.log_param("solver", "lbfgs")

    clf = LogisticRegression(C=C, solver="lbfgs", max_iter=2000)
    clf.fit(X_tr, y_tr)
    score = roc_auc_score(y_te, clf.predict_proba(X_te)[:, 1])
    mlflow.log_metric("roc_auc", score)

    info = mlflow.sklearn.log_model(
        sk_model=clf,
        artifact_path="model",
        registered_model_name=MODEL_NAME,
    )
    print(f"run_id={run.info.run_id} version={info.registered_model_version} roc_auc={score:.4f}")
```

Set the tracking URI and run a couple of training runs with different hyperparameters:

```bash
export MLFLOW_TRACKING_URI=http://<INGRESS_IP>
C=0.5 python train.py
C=1.0 python train.py
C=2.0 python train.py
```

Open the MLflow UI > `Models` > `breast-cancer-classifier`. You should see three versions. Click `Version 1` and `Transition to > Staging`. We will let the Azure DevOps pipeline handle the `Staging > Production` step.

## Step 5: Build the Azure DevOps promotion pipeline

![Figure 2. Azure DevOps promotion pipeline with manual approval gate](images/02-promotion-pipeline-sequence.png)
*Figure 2. Azure DevOps promotion pipeline with manual approval gate*

In Azure DevOps, create a new repo (`mlflow-promotion`) and push the layout below.

```
mlflow-promotion/
├── azure-pipelines.yml
└── scripts/
    └── promote.py
```

Paste the following into `scripts/promote.py`:

```python
import os, sys
import mlflow
from mlflow.tracking import MlflowClient

MODEL_NAME = "breast-cancer-classifier"
MIN_ROC = float(os.environ.get("MIN_ROC", "0.95"))

mlflow.set_tracking_uri(os.environ["MLFLOW_TRACKING_URI"])
client = MlflowClient()

# Find the latest version in Staging
staging = client.get_latest_versions(MODEL_NAME, stages=["Staging"])
if not staging:
    sys.exit("No version in Staging, nothing to promote.")
v = staging[0]
run = client.get_run(v.run_id)
roc = run.data.metrics.get("roc_auc", 0)

print(f"Candidate: version={v.version} run_id={v.run_id} roc_auc={roc:.4f}")

# Quality gate
if roc < MIN_ROC:
    sys.exit(f"FAIL: roc_auc {roc:.4f} below threshold {MIN_ROC}")

# Promote. This archives whatever is in Production
client.transition_model_version_stage(
    name=MODEL_NAME,
    version=v.version,
    stage="Production",
    archive_existing_versions=True,
)
print(f"PROMOTED version {v.version} to Production.")
```

Paste the following into `azure-pipelines.yml`:

```yaml
trigger: none  # promotion is manual / scheduled, not on commit

pool:
  vmImage: ubuntu-latest

variables:
  - group: mlflow-vars   # contains MLFLOW_TRACKING_URI

stages:
  - stage: Promote
    jobs:
      - deployment: PromoteToProd
        environment: ml-production  # the approval gate lives here
        strategy:
          runOnce:
            deploy:
              steps:
                - checkout: self
                - task: UsePythonVersion@0
                  inputs:
                    versionSpec: '3.10'
                - script: |
                    pip install mlflow==2.18.0
                    python scripts/promote.py
                  env:
                    MLFLOW_TRACKING_URI: $(MLFLOW_TRACKING_URI)
                    MIN_ROC: '0.95'
                  displayName: 'Promote Staging > Production'
```

The trick that makes this a real gate is the `environment: ml-production` line. Azure DevOps lets you attach an approver to an environment and the pipeline will pause until the approver clicks `Approve`.

## Step 6: Add the approval gate and run a promotion end-to-end

![Figure 3. Model version lifecycle across MLflow registry stages](images/02-model-stage-transitions.png)
*Figure 3. Model version lifecycle across MLflow registry stages*

In Azure DevOps, go to `Pipelines > Environments > New environment > ml-production`. Open the environment, click the three-dot menu > `Approvals and checks > Add check > Approvals`, and add yourself as the approver.

Also add the variable group `mlflow-vars` under `Pipelines > Library > Variable groups > +` with one variable: `MLFLOW_TRACKING_URI = http://<INGRESS_IP>`.

Commit the repo, then `Pipelines > New pipeline > Azure Repos Git > pick the repo > Existing YAML > /azure-pipelines.yml > Run`.

The pipeline will:

1. Pull the candidate version from `Staging`.
2. Check its `roc_auc` is above `MIN_ROC`.
3. Pause for approval. You will get a notification at the top of the run.
4. After you click `Approve`, run `promote.py` which calls `transition_model_version_stage("Production", archive_existing_versions=True)`.

Refresh the MLflow UI > `Models > breast-cancer-classifier`. The promoted version will now show `Production`, and the previously-Production one (if any) will show `Archived`.

## Troubleshooting

- **`mlflow.exceptions.RestException: INVALID_PARAMETER_VALUE: ... Failed to set the artifact location ...`**: the MLflow pod cannot reach Blob Storage. Re-check the connection string in the `Secret` and confirm the Blob firewall does not block the AKS egress IP.
- **`No version in Staging`**: you forgot to transition a version manually before running the pipeline. Either click `Transition to > Staging` in the UI or add an upstream stage in the pipeline that pushes a version into `Staging`.
- **Pipeline stuck on `Waiting for approval`**: the approver email is not the one logged into Azure DevOps. Confirm via `Pipelines > Environments > ml-production > Approvals`.

## Clean up

```bash
kubectl delete namespace mlflow
az group delete -n $RG --yes --no-wait
```

## Conclusion

If you got this far, you have an MLflow tracking + registry on AKS backed by real persistent services. Models from a Python training script land in a named registry entry, and a candidate moves from `Staging` to `Production` through an Azure DevOps pipeline with a real human approval gate.

The next post keeps the registry but moves the CI side to GitHub Actions, adds DVC for data versioning, Trivy and Bandit for the security gates, and ArgoCD for the actual rollout.
