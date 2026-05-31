# A GitHub Actions Pipeline for ML Model CI/CD with DVC, MLflow, Trivy, Bandit, and ArgoCD

Here is how I wired up a CI/CD pipeline for an ML model using GitHub Actions. The pipeline pulls training data from DVC, trains the model and logs it to an MLflow registry, runs Bandit for Python security checks and Trivy for the container image, builds and pushes the inference image to a registry, updates the Kubernetes manifests in a separate GitOps repo, and lets ArgoCD do the actual rollout.

NOTE: This guide assumes you have an MLflow tracking server running. If you do not, my previous post walks through standing one up on AKS in roughly 30 minutes.

---

### STEPS

Step 1: Lay out the model repo and the GitOps repo  
Step 2: Wire DVC to an S3 (or Azure Blob) remote  
Step 3: Write the training script that logs to MLflow  
Step 4: Write the inference service and Dockerfile  
Step 5: Build the GitHub Actions workflow  
Step 6: Add the security gates (Bandit and Trivy)  
Step 7: Set up ArgoCD to watch the GitOps repo  
Step 8: Push a code change end-to-end and watch the rollout

---

## Why is this important?

![End-to-end pipeline from git push to ArgoCD rollout](images/03-ml-cicd-pipeline-overview.png)
*End-to-end pipeline from git push to ArgoCD rollout*

Model code without a pipeline is a script that lives on someone's laptop. A pipeline is what turns a `git push` into a model in production with a paper trail: who trained it, on which data version, what the test scores were, which security scans passed, and which commit triggered the rollout.

The other thing CI/CD gives you for ML specifically is the data version. Code versions are easy, that is what `git` is for. Data versions are harder because the data is too big for `git`. DVC fills that hole by tracking the data with a small pointer file that lives in git, while the data itself lives in object storage.

## Prerequisites

- **A GitHub account** and a repo for the model code.
- **A second GitHub repo for the GitOps manifests** (`-gitops` suffix is a common naming convention).
- **An MLflow tracking server URL.** I will reference it as `MLFLOW_TRACKING_URI`.
- **A container registry.** GHCR is free with GitHub and we will use that here.
- **A Kubernetes cluster with ArgoCD installed.** A `kind` or `k3d` cluster works; AKS works.
- **An S3 bucket or Azure Blob container** for the DVC remote.

## Tools Used

- **GitHub Actions:** Runs the pipeline.
- **DVC:** Versions the training data, stored in object storage with a small pointer in git.
- **MLflow:** Tracking + registry for the model artifacts.
- **Bandit:** Static security analyser for Python.
- **Trivy:** Container image vulnerability scanner.
- **GHCR:** GitHub Container Registry for the inference image.
- **ArgoCD:** GitOps controller that reconciles the cluster against the manifest repo.

---

## Step 1: Lay out the model repo and the GitOps repo

Create two repos. The model repo holds the training code, inference code, Dockerfile, and pipeline definition. The GitOps repo holds the Kubernetes manifests and is what ArgoCD watches.

Model repo (`fraud-classifier`):

```
fraud-classifier/
├── .github/workflows/cicd.yml
├── data/
│   └── transactions.csv.dvc        # DVC pointer file
├── src/
│   ├── train.py
│   └── serve.py
├── tests/
│   └── test_serve.py
├── Dockerfile
├── requirements.txt
├── dvc.yaml
└── README.md
```

GitOps repo (`fraud-classifier-gitops`):

```
fraud-classifier-gitops/
└── apps/
    └── fraud-classifier/
        ├── deployment.yaml
        ├── service.yaml
        └── kustomization.yaml
```

NOTE: The cleanest split is "code in repo A, deployment state in repo B". Mixing them works for one or two services and starts hurting as soon as you have five.

## Step 2: Wire DVC to an S3 (or Azure Blob) remote

Inside the model repo:

```bash
cd fraud-classifier
python -m venv .venv && source .venv/Scripts/activate
pip install "dvc[s3]==3.55.0"
dvc init
git add .dvc .gitignore && git commit -m "init DVC"
```

Add a remote (use whichever object store you have):

```bash
# S3
dvc remote add -d storage s3://my-mlops-dvc-bucket/fraud-classifier
dvc remote modify storage region eu-west-2

# Or Azure Blob
dvc remote add -d storage azure://mlops-dvc/fraud-classifier
```

Track the data file. Once it is in `data/transactions.csv`, run:

```bash
dvc add data/transactions.csv
dvc push
git add data/transactions.csv.dvc data/.gitignore && git commit -m "track training data v1"
```

The `.dvc` file is a small YAML pointer that gets committed; the actual CSV gets pushed to the remote. CI will run `dvc pull` to fetch it.

## Step 3: Write the training script that logs to MLflow

Paste the following into `src/train.py`:

```python
import os, json
import mlflow
import mlflow.sklearn
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score

MODEL_NAME = "fraud-classifier"
DATA = "data/transactions.csv"

mlflow.set_tracking_uri(os.environ["MLFLOW_TRACKING_URI"])
mlflow.set_experiment("fraud-classifier")

df = pd.read_csv(DATA)
y = df.pop("is_fraud")
X = df

X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

n_est = int(os.environ.get("N_EST", "150"))
max_d = int(os.environ.get("MAX_DEPTH", "8"))

with mlflow.start_run() as run:
    mlflow.log_params({"n_estimators": n_est, "max_depth": max_d})
    mlflow.log_param("git_sha", os.environ.get("GITHUB_SHA", "local"))
    mlflow.log_param("data_dvc_hash", os.environ.get("DATA_DVC_HASH", "unknown"))

    clf = RandomForestClassifier(n_estimators=n_est, max_depth=max_d, n_jobs=-1, random_state=42)
    clf.fit(X_tr, y_tr)
    score = roc_auc_score(y_te, clf.predict_proba(X_te)[:, 1])
    mlflow.log_metric("roc_auc", score)

    info = mlflow.sklearn.log_model(
        clf, artifact_path="model", registered_model_name=MODEL_NAME
    )

    out = {
        "run_id": run.info.run_id,
        "version": info.registered_model_version,
        "roc_auc": score,
    }
    with open("training-result.json", "w") as f:
        json.dump(out, f)
    print(json.dumps(out, indent=2))
```

Two details worth flagging: we log `git_sha` and `data_dvc_hash` as parameters so every MLflow run can be traced back to a specific commit and a specific dataset version. That traceability is the whole point.

## Step 4: Write the inference service and Dockerfile

Paste the following into `src/serve.py`:

```python
import os, json
import mlflow.sklearn
from fastapi import FastAPI
from pydantic import BaseModel
import pandas as pd

MODEL_NAME = "fraud-classifier"
MODEL_STAGE = os.environ.get("MODEL_STAGE", "Production")

mlflow.set_tracking_uri(os.environ["MLFLOW_TRACKING_URI"])
model = mlflow.sklearn.load_model(f"models:/{MODEL_NAME}/{MODEL_STAGE}")

app = FastAPI()

class Tx(BaseModel):
    amount: float
    merchant_category: int
    hour_of_day: int
    is_weekend: int

@app.get("/healthcheck")
def health():
    return {"status": "ok", "model_stage": MODEL_STAGE}

@app.post("/predict")
def predict(tx: Tx):
    X = pd.DataFrame([tx.model_dump()])
    p = float(model.predict_proba(X)[:, 1][0])
    return {"fraud_probability": p, "is_fraud": p > 0.5}
```

Paste the following into `Dockerfile`:

```dockerfile
# ---------- builder ----------
FROM python:3.11-slim AS builder
WORKDIR /build
COPY requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

# ---------- runtime ----------
FROM python:3.11-slim
RUN useradd --create-home --uid 1001 app
WORKDIR /app
COPY --from=builder /root/.local /home/app/.local
COPY src ./src
ENV PATH=/home/app/.local/bin:$PATH \
    MODEL_STAGE=Production
USER 1001
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost:8000/healthcheck || exit 1
CMD ["uvicorn", "src.serve:app", "--host", "0.0.0.0", "--port", "8000"]
```

`requirements.txt`:

```
mlflow==2.18.0
scikit-learn==1.5.2
pandas==2.2.3
fastapi==0.115.4
uvicorn==0.32.0
pydantic==2.9.2
```

## Step 5: Build the GitHub Actions workflow

![GitHub Actions job graph with security gates](images/03-github-actions-job-graph.png)
*GitHub Actions job graph with security gates*

Paste the following into `.github/workflows/cicd.yml`:

```yaml
name: ML CI/CD

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -r requirements.txt pytest bandit
      - name: Bandit
        run: bandit -r src -ll
      - name: Unit tests
        run: pytest -q tests

  train:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -r requirements.txt 'dvc[s3]==3.55.0'

      - name: DVC pull
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        run: |
          dvc pull
          echo "DATA_DVC_HASH=$(md5sum data/transactions.csv | cut -d ' ' -f1)" >> $GITHUB_ENV

      - name: Train + log to MLflow
        env:
          MLFLOW_TRACKING_URI: ${{ secrets.MLFLOW_TRACKING_URI }}
        run: python src/train.py

      - uses: actions/upload-artifact@v4
        with:
          name: training-result
          path: training-result.json

  build:
    needs: train
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    outputs:
      image: ${{ steps.meta.outputs.tags }}
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=sha,prefix=
            type=raw,value=latest
      - uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  scan:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Trivy image scan
        uses: aquasecurity/trivy-action@0.24.0
        with:
          image-ref: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
          severity: 'HIGH,CRITICAL'
          exit-code: '1'
          ignore-unfixed: true

  bump-gitops:
    needs: scan
    runs-on: ubuntu-latest
    steps:
      - name: Checkout GitOps repo
        uses: actions/checkout@v4
        with:
          repository: ${{ github.repository_owner }}/fraud-classifier-gitops
          token: ${{ secrets.GITOPS_PAT }}
          path: gitops
      - name: Update image tag
        run: |
          cd gitops/apps/fraud-classifier
          sed -i "s|image: ghcr.io/.*|image: ghcr.io/${{ github.repository }}:${{ github.sha }}|" deployment.yaml
          git config user.email "ci@example.com"
          git config user.name "ci-bot"
          git commit -am "bump image to ${{ github.sha }}"
          git push
```

The shape: `test > train > build > scan > bump-gitops`. Each job blocks the next via `needs`. The `bump-gitops` job does not deploy directly to Kubernetes. It commits to the GitOps repo, and ArgoCD takes it from there.

## Step 6: Add the security gates (Bandit and Trivy)

The two security tools above are doing different jobs:

- **Bandit:** Scans your Python source for things like hardcoded secrets, `eval()`, `subprocess` with `shell=True`. Runs in the `test` job before training even starts. `-ll` filters to medium-and-high severity to avoid drowning in noise.
- **Trivy:** Scans the built container image for known CVEs in OS packages and Python wheels. Runs in the `scan` job after the build. `exit-code: '1'` fails the job if anything HIGH or CRITICAL is found; `ignore-unfixed` filters CVEs with no upstream fix yet so you do not block on things you cannot patch.

Both are intentionally placed before the GitOps bump. If a scan fails, the image was built and pushed to GHCR but the manifest repo is never touched, so the cluster never picks the bad image up.

## Step 7: Set up ArgoCD to watch the GitOps repo

![Sequence from GitOps bump to running pod](images/03-argocd-rollout-sequence.png)
*Sequence from GitOps bump to running pod*

If ArgoCD is not on your cluster yet:

```bash
kubectl create namespace argocd
kubectl apply -n argocd \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/v2.13.0/manifests/install.yaml
```

Wait for it to come up, then port-forward and grab the admin password:

```bash
kubectl -n argocd port-forward svc/argocd-server 8080:443
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' | base64 -d
```

Login at `https://localhost:8080`, then create an `Application` that points at the GitOps repo:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: fraud-classifier
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/REPLACE_OWNER/fraud-classifier-gitops
    targetRevision: HEAD
    path: apps/fraud-classifier
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

Apply it:

```bash
kubectl apply -n argocd -f argocd-application.yaml
```

ArgoCD will now reconcile the cluster against `apps/fraud-classifier` every 3 minutes by default.

## Step 8: Push a code change end-to-end and watch the rollout

Make a trivial change (a comment in `src/serve.py` is fine), commit, push to `main`. Then watch the pipeline run:

```
GitHub > Actions > the latest run
```

Expected sequence:

1. `test` runs Bandit and pytest. Should pass in ~30 s.
2. `train` does `dvc pull`, runs `src/train.py`, logs a new version to MLflow.
3. `build` builds the image and pushes `ghcr.io/<repo>:<sha>` and `:latest`.
4. `scan` runs Trivy. If it finds a HIGH CVE, this is where the pipeline stops.
5. `bump-gitops` updates the image tag in the GitOps repo.

Once that last commit lands, open the ArgoCD UI. Within 3 minutes (or click `Refresh` for immediate), the `fraud-classifier` app will show `OutOfSync > Syncing > Synced` and the new pod will roll out.

Quick smoke test once the pod is `Ready`:

```bash
kubectl -n ml-services port-forward svc/fraud-classifier 8000:80
curl http://localhost:8000/healthcheck
curl -X POST http://localhost:8000/predict \
  -H 'content-type: application/json' \
  -d '{"amount": 942.55, "merchant_category": 7, "hour_of_day": 23, "is_weekend": 1}'
```

## Troubleshooting

- **`dvc pull` fails with `unable to authenticate`:** The AWS keys are missing or wrong. Check `Settings > Secrets and variables > Actions` on the model repo.
- **Trivy job fails on a CVE with no fix yet:** Confirm `ignore-unfixed: true` is set. If you legitimately need to allow a specific CVE, add it to a `.trivyignore` file in the repo root.
- **`bump-gitops` job fails with 403:** The `GITOPS_PAT` token does not have `repo` scope on the GitOps repo. Regenerate it as a fine-grained PAT with read+write on `fraud-classifier-gitops` only.
- **ArgoCD shows `Synced` but the pod still has the old image:** Check that `imagePullPolicy: Always` is set in `deployment.yaml`. Without it, Kubernetes will keep using the cached image if the tag is `:latest`.

## Clean up

Delete the ArgoCD Application, then the namespace:

```bash
kubectl delete application fraud-classifier -n argocd
kubectl delete namespace ml-services
```

## Conclusion

If you got this far, the model-training script is no longer a script. It is a pipeline that runs on every push, versions both the code and the data, logs every model to a registry with traceability back to the commit and dataset, gates the build behind Bandit and Trivy, and delivers the new image into the cluster through ArgoCD without ever touching `kubectl` from CI.

Next post, I want to look at the serving side specifically: using KServe to do canary rollouts and traffic-splitting between two versions of the model so a bad promotion can be reverted in seconds.
