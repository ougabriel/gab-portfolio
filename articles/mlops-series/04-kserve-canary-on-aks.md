# KServe on AKS: Canary Rollouts and Traffic Splitting for Model Versions

I want to walk through installing KServe on an AKS cluster, deploying a model as an `InferenceService`, and using the built-in canary feature to roll out a new model version with `10%` of traffic first, then `50%`, then `100%`. There is a single-line revert if the canary misbehaves.

NOTE: KServe used to be called KFServing and used to live inside Kubeflow. Since v0.10 it is a standalone project. Everything below is for KServe `v0.13.x`.

---

### STEPS

Step 1: Prepare the AKS cluster (Istio, cert-manager, Knative)  
Step 2: Install KServe  
Step 3: Stage two model versions in Blob Storage (or S3)  
Step 4: Deploy the first version as an `InferenceService`  
Step 5: Promote to a new version using `canaryTrafficPercent`  
Step 6: Split traffic 50/50, then 100%  
Step 7: Roll back instantly when the canary misbehaves

---

## Why is this important?

Model rollouts have a problem that code rollouts do not. A code regression usually fails loudly: exceptions, 500s, a flatlining graph. A bad model often fails quietly. Slightly worse predictions, slightly higher false-positive rate, slightly different latency tail. You will not catch that with a `readinessProbe`.

The fix is to put the new version in front of a small slice of real traffic and watch the outcome metrics for a real window of time. KServe gives you that natively with one field, `canaryTrafficPercent`, which routes a percentage of requests to the new revision while the old revision keeps serving the rest.

## Prerequisites

- **AKS cluster** with at least one node pool with `4 vCPU, 16 GB` per node. Smaller works for sklearn; larger if you are running a transformer.
- **kubectl** v1.29+ and **helm** v3.13+.
- **A trained model artifact** in Azure Blob Storage or S3, accessible via a URI like `https://<account>.blob.core.windows.net/<container>/<path>/`. We will use scikit-learn for the demo.
- **Cluster admin** for the install steps.

## Tools Used

![Figure 1. KServe stack on AKS: Istio, Knative, cert-manager and the InferenceService control plane](images/04-kserve-aks-stack-architecture.png)
*Figure 1. KServe stack on AKS: Istio, Knative, cert-manager and the InferenceService control plane*

- **KServe:** Serves the model as a Kubernetes CRD called `InferenceService`.
- **Knative Serving:** The autoscaling + revision model underneath KServe.
- **Istio:** Service mesh that does the traffic splitting.
- **cert-manager:** Issues certs that KServe needs internally.
- **scikit-learn:** Just for the demo model; KServe supports XGBoost, PyTorch, TensorFlow, ONNX, HuggingFace, and custom containers identically.

---

## Step 1: Prepare the AKS cluster (Istio, cert-manager, Knative)

KServe has a stack of dependencies. Install them in order using their official manifests.

```bash
# Istio
curl -L https://istio.io/downloadIstio | sh -
cd istio-*/
./bin/istioctl install --set profile=default -y
cd ..

# cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.15.3/cert-manager.yaml
kubectl -n cert-manager wait --for=condition=Available deploy --all --timeout=120s

# Knative Serving
kubectl apply -f https://github.com/knative/serving/releases/download/knative-v1.15.2/serving-crds.yaml
kubectl apply -f https://github.com/knative/serving/releases/download/knative-v1.15.2/serving-core.yaml

# Knative + Istio integration
kubectl apply -f https://github.com/knative/net-istio/releases/download/knative-v1.15.1/net-istio.yaml
```

Confirm everything is running:

```bash
kubectl get pods -n istio-system
kubectl get pods -n knative-serving
kubectl get pods -n cert-manager
```

All three namespaces should show pods in `Running 1/1`.

## Step 2: Install KServe

```bash
kubectl apply -f https://github.com/kserve/kserve/releases/download/v0.13.1/kserve.yaml
kubectl apply -f https://github.com/kserve/kserve/releases/download/v0.13.1/kserve-cluster-resources.yaml
```

Wait until `kserve-controller-manager` in the `kserve` namespace is `Running`:

```bash
kubectl -n kserve get pods -w
```

## Step 3: Stage two model versions in Blob Storage

Train a quick sklearn model locally and push the resulting `.joblib` to Blob. Do this twice with different hyperparameters so you end up with a `v1` and a `v2`.

```bash
mkdir -p kserve-demo && cd kserve-demo
python -m venv .venv && source .venv/Scripts/activate
pip install scikit-learn joblib
touch train.py
```

Paste the following into `train.py`:

```python
import os, sys, joblib
from sklearn.datasets import load_iris
from sklearn.ensemble import RandomForestClassifier

n_est = int(sys.argv[1]) if len(sys.argv) > 1 else 50
X, y = load_iris(return_X_y=True)
clf = RandomForestClassifier(n_estimators=n_est, random_state=42)
clf.fit(X, y)
out = f"model.joblib"
joblib.dump(clf, out)
print(f"saved {out} with n_estimators={n_est}")
```

Train v1 and v2:

```bash
python train.py 50 && mv model.joblib model-v1.joblib
python train.py 200 && mv model.joblib model-v2.joblib
```

Upload them into separate folders in Blob:

```bash
RG=rg-kserve-demo
SA=sakservedemo$RANDOM
az group create -n $RG -l uksouth
az storage account create -g $RG -n $SA --sku Standard_LRS
az storage container create --account-name $SA --name models --auth-mode login

az storage blob upload --account-name $SA --container-name models \
  --name v1/model.joblib --file model-v1.joblib --auth-mode login

az storage blob upload --account-name $SA --container-name models \
  --name v2/model.joblib --file model-v2.joblib --auth-mode login
```

Make the container publicly readable for the demo. In production, use a `kubernetes-secret` for the storage account key (see the KServe docs):

```bash
az storage container set-permission --account-name $SA --name models \
  --public-access blob --auth-mode login
```

The two storage URIs are now:

```
https://<SA>.blob.core.windows.net/models/v1/
https://<SA>.blob.core.windows.net/models/v2/
```

## Step 4: Deploy the first version as an InferenceService

Create `kserve/iris.yaml`:

```yaml
apiVersion: serving.kserve.io/v1beta1
kind: InferenceService
metadata:
  name: iris
spec:
  predictor:
    model:
      modelFormat:
        name: sklearn
      storageUri: "https://REPLACE_SA.blob.core.windows.net/models/v1"
      resources:
        requests:
          cpu: "200m"
          memory: "512Mi"
        limits:
          cpu: "1"
          memory: "2Gi"
```

Replace `REPLACE_SA` with your storage account name, then apply:

```bash
kubectl apply -f kserve/iris.yaml
kubectl get inferenceservice iris -w
```

Wait until the URL column shows a value. That URL is the public endpoint. KServe goes through the Istio Ingress Gateway, so for AKS you can find the external IP with:

```bash
kubectl -n istio-system get svc istio-ingressgateway
```

Smoke test it:

```bash
INGRESS=$(kubectl -n istio-system get svc istio-ingressgateway -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
HOST=$(kubectl get inferenceservice iris -o jsonpath='{.status.url}' | sed 's|http://||')

curl -H "Host: $HOST" http://$INGRESS/v1/models/iris:predict \
  -d '{
    "instances": [[5.1, 3.5, 1.4, 0.2]]
  }'
```

Expected response:

```json
{"predictions": [0]}
```

That is the v1 model serving traffic.

## Step 5: Promote to a new version using canaryTrafficPercent

![Figure 2. Request flow when canaryTrafficPercent is set to 10](images/04-kserve-canary-traffic-split-flow.png)
*Figure 2. Request flow when canaryTrafficPercent is set to 10*

Now update the `storageUri` to v2 AND add `canaryTrafficPercent: 10`. KServe will create a new revision behind the same service, send 10% of traffic to it, and keep the rest going to v1.

Edit `kserve/iris.yaml`:

```yaml
apiVersion: serving.kserve.io/v1beta1
kind: InferenceService
metadata:
  name: iris
spec:
  predictor:
    canaryTrafficPercent: 10        # NEW
    model:
      modelFormat:
        name: sklearn
      storageUri: "https://REPLACE_SA.blob.core.windows.net/models/v2"   # CHANGED
      resources:
        requests:
          cpu: "200m"
          memory: "512Mi"
        limits:
          cpu: "1"
          memory: "2Gi"
```

Apply:

```bash
kubectl apply -f kserve/iris.yaml
kubectl get inferenceservice iris -o yaml | grep -A 5 'status:'
```

The status block now shows two revisions and the traffic split:

```yaml
status:
  components:
    predictor:
      latestReadyRevision: iris-predictor-00002
      latestRolledoutRevision: iris-predictor-00001
      traffic:
        - latestRevision: false
          percent: 90
          revisionName: iris-predictor-00001
        - latestRevision: true
          percent: 10
          revisionName: iris-predictor-00002
```

Send a few hundred requests and you will see ~10% hit v2 and ~90% hit v1.

## Step 6: Split traffic 50/50, then 100%

Watch your real outcome metrics (accuracy on labelled traffic, latency tail, error rate) for whatever window you have agreed with the team. Then increase:

```yaml
canaryTrafficPercent: 50
```

`kubectl apply` again. Now you are 50/50. Same again with `canaryTrafficPercent: 100` and v2 takes all traffic.

NOTE: Once `canaryTrafficPercent: 100`, the next apply with no canary field will collapse the two revisions and v2 becomes the new baseline. From that point on, v1 is no longer serving any traffic but its revision still exists for rollback.

## Step 7: Roll back instantly when the canary misbehaves

![Figure 3. Revision state transitions as canaryTrafficPercent moves from 10 to 100 (or back to 0)](images/04-kserve-canary-promotion-states.png)
*Figure 3. Revision state transitions as canaryTrafficPercent moves from 10 to 100 (or back to 0)*

The reason canaries exist is for the moment when the new version starts returning bad predictions. The KServe rollback is the one-line response:

```bash
kubectl patch inferenceservice iris \
  --type merge \
  -p '{"spec":{"predictor":{"canaryTrafficPercent":0}}}'
```

`canaryTrafficPercent: 0` immediately routes 100% of traffic back to the previously-stable revision. No re-deploy, no image pull, no waiting. The bad revision still exists if you want to debug it; it just gets zero traffic.

To clean up properly afterward, revert the `storageUri` back to v1 and apply, which collapses the state back to a single revision.

## Troubleshooting

- **`InferenceService` stays `Unknown` forever:** Check the predictor pod with `kubectl get pods -l serving.kserve.io/inferenceservice=iris`. The image pull or model download is the usual culprit. `kubectl logs` on the `storage-initializer` init-container will tell you which.
- **`upstream connect error` from curl:** The `Host` header is wrong. KServe routes by host, so the `Host` header must match `kubectl get inferenceservice iris -o jsonpath='{.status.url}'`.
- **Traffic split is not what you set:** Knative may still be scaling up the new revision. Wait 30 seconds and check `kubectl get revision`. Both revisions must be `Ready=True` before the split is honoured.
- **Canary works but rollback does nothing:** Look at the `status.traffic` block. If it shows your canary as `latestRolledoutRevision`, the canary already became the baseline. The "previous revision" is now whatever was before it, which may not be what you wanted to roll back to.

## Clean up

```bash
kubectl delete inferenceservice iris
kubectl delete -f https://github.com/kserve/kserve/releases/download/v0.13.1/kserve-cluster-resources.yaml
kubectl delete -f https://github.com/kserve/kserve/releases/download/v0.13.1/kserve.yaml
az group delete -n $RG --yes --no-wait
```

## Conclusion

If you got this far, you can put a new model version in front of a measured slice of real traffic, watch its outcome metrics, increase the split incrementally, and roll back to the previous version in a single `kubectl patch` if anything goes wrong. The pattern is the same for sklearn, XGBoost, PyTorch, HuggingFace, or a custom inference container. Only the `modelFormat` and the `storageUri` change.

Next up, I want to wire Prometheus and Grafana to the `InferenceService`, add Evidently AI for drift metrics, and turn the manual "watch the metrics for an hour" step into a real AlertManager rule that pages on its own.
