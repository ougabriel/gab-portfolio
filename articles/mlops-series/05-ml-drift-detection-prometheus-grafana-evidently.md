# Detecting Model Drift in Production with Evidently AI, Prometheus, Grafana, and AlertManager

Here's how I wrapped a deployed ML model with a sidecar that computes data-drift metrics using Evidently AI, exposed those metrics in the Prometheus format, scraped them with kube-prometheus-stack, visualised them in Grafana, and wrote an AlertManager rule that pages when drift crosses a threshold.

NOTE: Drift detection without an alerting rule is a dashboard nobody looks at. The point of this guide is the alert at the end. Everything before it is plumbing.

---

### STEPS

Step 1: Install kube-prometheus-stack on AKS  
Step 2: Set up a reference dataset for "what normal looks like"  
Step 3: Write a small drift sidecar that exposes `/metrics`  
Step 4: Deploy the model + drift sidecar together  
Step 5: Add a `ServiceMonitor` so Prometheus scrapes the sidecar  
Step 6: Build a Grafana dashboard for the drift signals  
Step 7: Add an AlertManager rule that pages on sustained drift

---

## Why is this important?

![AlertManager rule state transitions for sustained drift](images/05-drift-alert-state-machine.png)
*AlertManager rule state transitions for sustained drift*

A model that scored well on its test set in `staging` will quietly stop scoring well in `production` if the inputs change. The textbook example: a fraud model trained on pre-2020 transactions starts under-predicting fraud in 2024 because the merchant categories shifted.

You will not see this in your latency dashboard. You will not see this in your error rate. You will only see it weeks later when an analyst notices the false-negative rate climbed and asks "when did this start". Drift detection is the early warning: a measurable, scrapable signal that the inputs your model is seeing are no longer the inputs it was trained on.

## Prerequisites

- **AKS cluster** with the inference service from the KServe guide already running. Any inference service you can route to and tap the input data will work.
- **kubectl** and **helm**.
- **A reference dataset** (typically the training set, or a slice of historical production data you have agreed to call "normal"). A few thousand rows is plenty.
- **Python 3.11** for the drift sidecar.

## Tools Used

- **Evidently AI:** Computes drift metrics (PSI, Wasserstein, KS, chi-squared) between a reference dataset and a current dataset.
- **kube-prometheus-stack:** A Helm chart that ships Prometheus, Grafana, AlertManager, the node exporter, and the `ServiceMonitor` CRD in one install.
- **prometheus-client (Python):** Exposes the drift metrics on `/metrics` in the format Prometheus expects.
- **AlertManager:** Fires alerts to Slack, PagerDuty, or email when a Prometheus rule matches.

---

## Step 1: Install kube-prometheus-stack on AKS

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

kubectl create namespace monitoring

helm install kps prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --set grafana.adminPassword='change-me' \
  --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false
```

The last flag is the one that matters for our use case. It tells Prometheus to pick up `ServiceMonitor` resources from any namespace, not just the ones with the matching Helm label.

Wait for the stack:

```bash
kubectl -n monitoring get pods -w
```

Port-forward Grafana and login with `admin / change-me`:

```bash
kubectl -n monitoring port-forward svc/kps-grafana 3000:80
```

## Step 2: Set up a reference dataset

The reference dataset is the snapshot of inputs your model saw during training. Save it as a parquet file and put it where the sidecar can read it. The simplest option is a `ConfigMap`, but parquet is binary so a `Secret` (which is base64) is cleaner, or a small PVC mounted into the sidecar.

For the demo, I bake it into the sidecar image. In production, point at a parquet file in Blob or S3 instead.

```bash
mkdir -p drift-sidecar && cd drift-sidecar
python -m venv .venv && source .venv/Scripts/activate
pip install pandas pyarrow evidently
```

Generate a reference dataset (or use your real one):

```python
# make_reference.py
import pandas as pd, numpy as np
np.random.seed(42)
n = 5000
df = pd.DataFrame({
    "amount": np.random.lognormal(3, 1.2, n),
    "merchant_category": np.random.randint(1, 12, n),
    "hour_of_day": np.random.randint(0, 24, n),
    "is_weekend": np.random.randint(0, 2, n),
})
df.to_parquet("reference.parquet")
print(df.describe())
```

```bash
python make_reference.py
```

## Step 3: Write a small drift sidecar that exposes /metrics

Paste the following into `drift_sidecar.py`:

```python
import os, time, threading, json
from collections import deque

import pandas as pd
from fastapi import FastAPI, Request
from prometheus_client import Gauge, generate_latest, CONTENT_TYPE_LATEST
from starlette.responses import Response

from evidently.report import Report
from evidently.metrics import (
    DataDriftPreset,
    ColumnDriftMetric,
)

WINDOW = int(os.environ.get("DRIFT_WINDOW", "500"))   # rolling window of recent inputs
INTERVAL = int(os.environ.get("DRIFT_INTERVAL", "60"))  # seconds between drift computations

reference = pd.read_parquet("/refs/reference.parquet")
window = deque(maxlen=WINDOW)

g_share = Gauge("model_drift_share_drifted_columns", "Share of columns flagged as drifted")
g_dataset = Gauge("model_drift_dataset_drift", "1 if dataset drift detected, else 0")
g_col = Gauge("model_drift_column_score", "Per-column drift score", ["column"])

app = FastAPI()

@app.post("/log")
async def log_inputs(req: Request):
    """The inference service POSTs each input here."""
    body = await req.json()
    window.append(body)
    return {"ok": True, "buffered": len(window)}

@app.get("/metrics")
def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

def compute_drift_loop():
    while True:
        time.sleep(INTERVAL)
        if len(window) < 50:
            continue  # not enough samples yet
        current = pd.DataFrame(list(window))

        report = Report(metrics=[DataDriftPreset()])
        report.run(reference_data=reference, current_data=current)
        d = report.as_dict()
        drift = d["metrics"][0]["result"]

        g_share.set(drift["share_of_drifted_columns"])
        g_dataset.set(1 if drift["dataset_drift"] else 0)
        for col_name, col_data in drift["drift_by_columns"].items():
            g_col.labels(column=col_name).set(col_data["drift_score"])

threading.Thread(target=compute_drift_loop, daemon=True).start()
```

Paste the following into `Dockerfile`:

```dockerfile
FROM python:3.11-slim
WORKDIR /app
RUN pip install --no-cache-dir \
    fastapi==0.115.4 uvicorn==0.32.0 \
    evidently==0.4.40 pandas==2.2.3 pyarrow==17.0.0 \
    prometheus-client==0.21.0
COPY drift_sidecar.py .
COPY reference.parquet /refs/reference.parquet
EXPOSE 8001
CMD ["uvicorn", "drift_sidecar:app", "--host", "0.0.0.0", "--port", "8001"]
```

Build and push to your registry:

```bash
docker build -t ghcr.io/REPLACE_OWNER/drift-sidecar:0.1.0 .
docker push ghcr.io/REPLACE_OWNER/drift-sidecar:0.1.0
```

## Step 4: Deploy the model + drift sidecar together

![Inference pod with drift sidecar showing input mirror and Prometheus scrape paths](images/05-drift-sidecar-pod-architecture.png)
*Inference pod with drift sidecar showing input mirror and Prometheus scrape paths*

The pattern: each inference pod runs two containers. The inference container handles `/predict`. The sidecar container handles `/log` (input mirror) and `/metrics` (Prometheus scrape).

The inference container needs a small change. Every time it receives a request, it fires off a non-blocking POST to `http://localhost:8001/log` with the input row. Drop this into the FastAPI app from the earlier CI/CD guide:

```python
import httpx, asyncio

async def mirror(payload):
    try:
        async with httpx.AsyncClient(timeout=0.5) as c:
            await c.post("http://localhost:8001/log", json=payload)
    except Exception:
        pass  # never let the sidecar break inference

@app.post("/predict")
async def predict(tx: Tx, request: Request):
    X = pd.DataFrame([tx.model_dump()])
    p = float(model.predict_proba(X)[:, 1][0])
    asyncio.create_task(mirror(tx.model_dump()))
    return {"fraud_probability": p, "is_fraud": p > 0.5}
```

Now update the `Deployment` to run both containers:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: fraud-classifier
spec:
  replicas: 2
  selector:
    matchLabels:
      app: fraud-classifier
  template:
    metadata:
      labels:
        app: fraud-classifier
    spec:
      containers:
        - name: serve
          image: ghcr.io/REPLACE_OWNER/fraud-classifier:latest
          ports:
            - containerPort: 8000
        - name: drift
          image: ghcr.io/REPLACE_OWNER/drift-sidecar:0.1.0
          ports:
            - containerPort: 8001
              name: metrics
          env:
            - name: DRIFT_WINDOW
              value: "500"
            - name: DRIFT_INTERVAL
              value: "60"
```

Apply:

```bash
kubectl apply -f deployment.yaml
kubectl get pods -l app=fraud-classifier -w
```

## Step 5: Add a ServiceMonitor so Prometheus scrapes the sidecar

The `Service` already exists for the inference port; add a second port for metrics:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: fraud-classifier
  labels:
    app: fraud-classifier
spec:
  type: ClusterIP
  selector:
    app: fraud-classifier
  ports:
    - name: http
      port: 80
      targetPort: 8000
    - name: metrics
      port: 8001
      targetPort: 8001
```

Then create `servicemonitor.yaml`:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: fraud-classifier-drift
  labels:
    release: kps   # must match the kube-prometheus-stack release
spec:
  selector:
    matchLabels:
      app: fraud-classifier
  endpoints:
    - port: metrics
      interval: 30s
      path: /metrics
```

NOTE: The `release: kps` label is the gotcha. The kube-prometheus-stack chart only picks up `ServiceMonitor` resources with that label by default. If your Helm release name was different, adjust.

Apply:

```bash
kubectl apply -f servicemonitor.yaml
```

Confirm Prometheus has it:

```bash
kubectl -n monitoring port-forward svc/kps-prometheus 9090:9090
# Open http://localhost:9090/targets and fraud-classifier-drift should be UP
```

## Step 6: Build a Grafana dashboard for the drift signals

In Grafana (`http://localhost:3000`), `Dashboards > New > Add visualization`, pick `Prometheus`, and use these queries:

- **Share of drifted columns (timeseries):**

  ```promql
  model_drift_share_drifted_columns{job="fraud-classifier"}
  ```

- **Dataset drift flag (stat panel):**

  ```promql
  model_drift_dataset_drift{job="fraud-classifier"}
  ```

- **Per-column drift score (table):**

  ```promql
  model_drift_column_score{job="fraud-classifier"}
  ```

Set the time range to `Last 6 hours`. Save as `Model Drift: fraud-classifier`.

For a quick smoke test that the dashboard is actually working, send some normal traffic for a few minutes, then send drifted traffic and watch the share-of-drifted-columns climb:

```bash
# normal traffic
for i in {1..200}; do
  curl -s -X POST http://<your-ingress>/predict \
    -H 'content-type: application/json' \
    -d '{"amount": 50, "merchant_category": 3, "hour_of_day": 14, "is_weekend": 0}' >/dev/null
done

# drifted traffic: much higher amounts, weekend only, weird hours
for i in {1..200}; do
  curl -s -X POST http://<your-ingress>/predict \
    -H 'content-type: application/json' \
    -d '{"amount": 4500, "merchant_category": 9, "hour_of_day": 3, "is_weekend": 1}' >/dev/null
done
```

Wait one drift-compute interval (60s by default), refresh the dashboard. `model_drift_share_drifted_columns` should jump.

## Step 7: Add an AlertManager rule that pages on sustained drift

![Sequence from sidecar metrics to AlertManager Slack notification](images/05-scrape-to-alert-flow.png)
*Sequence from sidecar metrics to AlertManager Slack notification*

This is the part that earns the dashboard its keep. Create `prometheusrule.yaml`:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: fraud-classifier-drift
  labels:
    release: kps
spec:
  groups:
    - name: drift.rules
      rules:
        - alert: ModelDatasetDrift
          expr: avg_over_time(model_drift_share_drifted_columns{job="fraud-classifier"}[15m]) > 0.5
          for: 15m
          labels:
            severity: warning
            team: mlops
          annotations:
            summary: "fraud-classifier is seeing input drift"
            description: "Over half the input columns have drifted vs the reference dataset for 15 minutes."
        - alert: ModelDatasetDriftCritical
          expr: avg_over_time(model_drift_share_drifted_columns{job="fraud-classifier"}[15m]) > 0.8
          for: 10m
          labels:
            severity: critical
            team: mlops
          annotations:
            summary: "fraud-classifier inputs are massively drifted, retrain candidate"
            description: "More than 80% of input columns drifted for 10 minutes. Consider rolling back to the previous model or triggering a retrain."
```

Apply:

```bash
kubectl apply -f prometheusrule.yaml
```

In Prometheus (`http://localhost:9090/alerts`), you should see both rules listed as `inactive` until the condition fires.

To route alerts to Slack, edit the AlertManager `Secret` that the kube-prometheus-stack chart created:

```bash
kubectl -n monitoring edit secret alertmanager-kps-alertmanager
```

Replace the `alertmanager.yaml` block with something like:

```yaml
route:
  receiver: 'slack-mlops'
  group_by: ['alertname', 'job']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
receivers:
  - name: 'slack-mlops'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/REPLACE/WITH/YOURS'
        channel: '#mlops-alerts'
        send_resolved: true
        title: '{{ .CommonAnnotations.summary }}'
        text: '{{ .CommonAnnotations.description }}'
```

AlertManager will pick it up automatically within a minute.

## Troubleshooting

- **`model_drift_*` metrics never show up in Prometheus:** Check the `ServiceMonitor` `release` label matches your Helm release. Then `kubectl -n monitoring get servicemonitor` and confirm the target shows in `http://localhost:9090/targets`.
- **Sidecar pod restarts loop:** Almost always means the `reference.parquet` is not where the code expects it. Run `kubectl logs` on the sidecar. Evidently raises a clear `FileNotFoundError`.
- **Drift score never climbs even with obviously drifted inputs:** Your window size is too large or your reference is too lenient. Drop `DRIFT_WINDOW` to 100 for testing.
- **Alert fires but Slack never receives:** AlertManager config syntax errors fail silently. `kubectl -n monitoring logs kps-alertmanager-0 | grep -i error`.

## Clean up

```bash
kubectl delete -f servicemonitor.yaml -f prometheusrule.yaml -f deployment.yaml
helm -n monitoring uninstall kps
kubectl delete namespace monitoring
```

## Conclusion

If you got this far, you have a deployed model with an Evidently AI drift sidecar attached, drift metrics exposed in Prometheus format, a Grafana view of them, and an alerting rule that pages the on-call when the inputs drift far enough from the training distribution to matter. The next time your fraud rate quietly climbs, you will see it on the dashboard the same day it starts, not the week the analyst finds it.

The final post of this series pulls all five guides together (Terraform-bootstrapped AKS, GitHub Actions for the CI/CD, MLflow registry, KServe canary serving, and this drift stack) into a single demo repo you can `git clone && make up` end-to-end.
