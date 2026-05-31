# Containerised LLM Inference on AKS: OLLAMA, Multi-stage Docker, and an HPA Tuned for Cold-Start

This is the follow-up to my earlier OLLAMA + DeepSeek post. I want to walk through how I took that setup and turned it into a properly containerised LLM inference service running on Azure Kubernetes Service (AKS). The model server gets packaged in a multi-stage Docker image, exposed through a `ClusterIP` and Ingress, with a Horizontal Pod Autoscaler (HPA) tuned so the first request after a quiet period does not time out the client.

NOTE: The same steps work on EKS or GKE with minor cluster name changes. Only the cluster bootstrap is Azure-specific.

---

### STEPS

Step 1: Provision a small AKS cluster with a GPU node pool  
Step 2: Build a multi-stage Docker image for OLLAMA + the model weights  
Step 3: Push the image to Azure Container Registry (ACR)  
Step 4: Deploy the inference service to AKS  
Step 5: Wire up an Ingress and a `ClusterIP` Service  
Step 6: Tune the HPA so cold-start does not kill the user's first call  
Step 7: Smoke test from `curl` and from a Python client

---

## Why is this important?

![Figure 1: End-to-end cluster architecture, client traffic through Ingress to OLLAMA on a tainted GPU node pool](images/01-aks-llm-cluster-architecture.png)
*Figure 1: End-to-end cluster architecture, client traffic through Ingress to OLLAMA on a tainted GPU node pool*

Most teams that ship an LLM internally start the same way: a VM, an OLLAMA install, and a port open to the office. That works until a second team wants to use it, or someone needs to bump the model, or the box reboots and nobody remembers the install steps.

Putting the same workload on AKS gives you the parts that matter: image versioning, rolling restarts, autoscaling against real load, health probes, and a single Ingress your other services can route to. The model server itself is still OLLAMA. What changes is the operating surface around it.

## Prerequisites

- **Azure subscription:** With Contributor on a resource group you can use (`rg-mlops-demo`).
- **Azure CLI:** `az --version` should be 2.60 or later. Run `az login` before starting.
- **kubectl:** v1.29 or later.
- **Docker Desktop:** For the local image build. WSL2 backend on Windows is fine.
- **An ACR registry:** We will create one in Step 1 if you do not have one already.
- **GPU quota:** A `Standard_NC6s_v3` (6 vCPU, 1x V100) is the cheapest GPU SKU that runs a 7B model comfortably. Request quota under `Subscription > Usage + quotas` if your account does not have it yet.

## Tools Used

- **OLLAMA:** Runs the model and exposes an HTTP API on `:11434`.
- **DeepSeek-R1 7B:** The model we will serve. Swap with any OLLAMA-supported model.
- **Docker (multi-stage):** Smaller final image, faster `kubectl rollout`.
- **AKS:** Managed Kubernetes on Azure.
- **ACR:** Image registry. AKS pulls from it via managed identity, no `imagePullSecrets` needed.
- **NGINX Ingress Controller:** Single entry point for HTTP traffic into the cluster.
- **HPA:** Horizontal Pod Autoscaler. Scales replicas based on CPU/GPU utilisation.

---

## Step 1: Provision a small AKS cluster with a GPU node pool

Open a terminal and run the commands below. We will create the resource group, the AKS cluster, and a GPU-backed node pool in three calls.

```bash
RG=rg-mlops-demo
LOC=uksouth
AKS=aks-llm-demo
ACR=acrllmdemo$RANDOM

az group create -n $RG -l $LOC

az acr create -n $ACR -g $RG --sku Basic

az aks create \
  -g $RG -n $AKS \
  --node-count 1 \
  --node-vm-size Standard_B2ms \
  --enable-managed-identity \
  --attach-acr $ACR \
  --network-plugin azure \
  --generate-ssh-keys

az aks nodepool add \
  -g $RG --cluster-name $AKS \
  -n gpu \
  --node-count 1 \
  --node-vm-size Standard_NC6s_v3 \
  --node-taints sku=gpu:NoSchedule
```

The taint `sku=gpu:NoSchedule` keeps non-GPU pods off the expensive node. We will add a matching `toleration` on the inference deployment in Step 4.

NOTE: The GPU node pool will start billing as soon as it provisions. Scale it to zero between runs with `az aks nodepool scale -g $RG --cluster-name $AKS -n gpu --node-count 0`.

Once the cluster is up, connect to it:

```bash
az aks get-credentials -g $RG -n $AKS
kubectl get nodes
```

You should see two nodes: one system, one GPU.

## Step 2: Build a multi-stage Docker image for OLLAMA + the model weights

![Figure 2: Multi-stage Docker build keeps the model weights baked in while shrinking the runtime layer](images/01-multi-stage-docker-build-flow.png)
*Figure 2: Multi-stage Docker build keeps the model weights baked in while shrinking the runtime layer*

Create a project folder and add the Dockerfile below.

```bash
mkdir -p llm-inference && cd llm-inference
touch Dockerfile
```

Paste the following into `Dockerfile`:

```dockerfile
# ---------- stage 1: pull the OLLAMA binary and the model ----------
FROM ollama/ollama:0.5.7 AS pull
ENV OLLAMA_MODELS=/models
RUN mkdir -p /models && \
    (ollama serve &) && \
    sleep 5 && \
    ollama pull deepseek-r1:7b && \
    pkill ollama

# ---------- stage 2: minimal runtime ----------
FROM ollama/ollama:0.5.7
ENV OLLAMA_MODELS=/models \
    OLLAMA_HOST=0.0.0.0:11434 \
    OLLAMA_KEEP_ALIVE=24h
COPY --from=pull /models /models
EXPOSE 11434
ENTRYPOINT ["ollama", "serve"]
```

The first stage downloads the model weights once during the build, which is the slow step (~4 GB for 7B). The second stage carries only the runtime and the weights into the final image. No `ollama pull` happens at pod start, which is what makes cold-start tolerable.

`OLLAMA_KEEP_ALIVE=24h` tells OLLAMA to keep the model resident in GPU memory for a day. Without it, the model unloads after 5 minutes of idle and your next call eats a 20-40 second reload.

## Step 3: Push the image to ACR

```bash
ACR=$(az acr list -g $RG --query "[0].name" -o tsv)
az acr login -n $ACR
docker build -t $ACR.azurecr.io/llm-inference:0.1.0 .
docker push $ACR.azurecr.io/llm-inference:0.1.0
```

The image will be in the 5-6 GB range with a 7B model. ACR Basic is fine for one model. If you plan to host several, upgrade to Standard for the 100 GB storage quota.

## Step 4: Deploy the inference service to AKS

Create `k8s/deployment.yaml`:

```bash
mkdir -p k8s
touch k8s/deployment.yaml
```

Paste the following into it:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: llm-inference
  labels:
    app: llm-inference
spec:
  replicas: 1
  selector:
    matchLabels:
      app: llm-inference
  template:
    metadata:
      labels:
        app: llm-inference
    spec:
      tolerations:
        - key: sku
          operator: Equal
          value: gpu
          effect: NoSchedule
      nodeSelector:
        agentpool: gpu
      containers:
        - name: ollama
          image: REPLACE_ACR.azurecr.io/llm-inference:0.1.0
          ports:
            - containerPort: 11434
          resources:
            requests:
              cpu: "2"
              memory: "8Gi"
              nvidia.com/gpu: "1"
            limits:
              cpu: "4"
              memory: "16Gi"
              nvidia.com/gpu: "1"
          readinessProbe:
            httpGet:
              path: /api/tags
              port: 11434
            initialDelaySeconds: 30
            periodSeconds: 10
            failureThreshold: 6
          livenessProbe:
            httpGet:
              path: /api/tags
              port: 11434
            initialDelaySeconds: 90
            periodSeconds: 30
```

Replace `REPLACE_ACR` with your actual registry name, then apply:

```bash
kubectl apply -f k8s/deployment.yaml
kubectl get pods -w
```

NOTE: The first pod start will be slow. AKS has to pull the 5 GB image onto the GPU node. Expect 3-5 minutes. After that, the image is cached on the node and restarts are fast.

You also need the NVIDIA device plugin on the cluster for `nvidia.com/gpu` to be schedulable. Install it once:

```bash
kubectl apply -f https://raw.githubusercontent.com/NVIDIA/k8s-device-plugin/v0.14.5/nvidia-device-plugin.yml
```

## Step 5: Wire up an Ingress and a ClusterIP Service

Create `k8s/service.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: llm-inference
spec:
  type: ClusterIP
  selector:
    app: llm-inference
  ports:
    - port: 80
      targetPort: 11434
```

Install the NGINX Ingress Controller if it is not already on the cluster:

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --create-namespace --namespace ingress-nginx \
  --set controller.service.annotations."service\.beta\.kubernetes\.io/azure-load-balancer-health-probe-request-path"=/healthz
```

Then create `k8s/ingress.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: llm-inference
  annotations:
    nginx.ingress.kubernetes.io/proxy-read-timeout: "600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "600"
spec:
  ingressClassName: nginx
  rules:
    - http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: llm-inference
                port:
                  number: 80
```

The two `proxy-*-timeout` annotations matter. The default NGINX timeout is 60 seconds and an LLM generating a long response will get cut off mid-token. We bump it to 10 minutes.

Apply both:

```bash
kubectl apply -f k8s/service.yaml -f k8s/ingress.yaml
kubectl get ingress
```

Grab the external IP from the `ADDRESS` column.

## Step 6: Tune the HPA so cold-start does not kill the user's first call

![Figure 3: Request sequence showing how minReplicas=1, KEEP_ALIVE, and the 600s proxy timeout protect the user's first call](images/01-cold-start-request-sequence.png)
*Figure 3: Request sequence showing how minReplicas=1, KEEP_ALIVE, and the 600s proxy timeout protect the user's first call*

The default `HorizontalPodAutoscaler` scales on CPU. For an LLM that is the wrong signal. The GPU is the bottleneck, the CPU sits low. Two things help:

1. Scale on a **custom metric** from `ollama` (concurrent requests in flight). For that you need a Prometheus adapter, which I will cover in the drift-detection guide.
2. As a simpler first pass: keep a **minimum replica of 1**, use GPU-utilisation as the scaling signal, and set a long `stabilizationWindowSeconds` so scaling does not flap.

Create `k8s/hpa.yaml`:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: llm-inference
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: llm-inference
  minReplicas: 1
  maxReplicas: 3
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 600
      policies:
        - type: Pods
          value: 1
          periodSeconds: 300
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Pods
          value: 1
          periodSeconds: 60
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

`minReplicas: 1` is the important line. It keeps one pod warm so the first request after a quiet period does not pay the cold-start tax. If your finance team will not let you keep a GPU node warm 24/7, drop the GPU node pool to zero overnight via a CronJob and let the morning's first user wait. That is a product decision, not a technical one.

```bash
kubectl apply -f k8s/hpa.yaml
kubectl get hpa
```

## Step 7: Smoke test from curl and a Python client

Get the Ingress IP:

```bash
INGRESS_IP=$(kubectl get ingress llm-inference -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
echo $INGRESS_IP
```

Run a curl test:

```bash
curl http://$INGRESS_IP/api/generate -d '{
  "model": "deepseek-r1:7b",
  "prompt": "Write a one-line summary of what an HPA does in Kubernetes.",
  "stream": false
}'
```

The first response will take 5-10 seconds. Subsequent calls should land in 1-3 seconds for short prompts on a V100. If your first call times out, the issue is almost always the NGINX timeout. Recheck Step 5.

For a quick Python client (`client.py`):

```python
import requests, os, sys

INGRESS = os.environ.get("INGRESS_IP")
prompt = sys.argv[1] if len(sys.argv) > 1 else "Hello"

r = requests.post(
    f"http://{INGRESS}/api/generate",
    json={"model": "deepseek-r1:7b", "prompt": prompt, "stream": False},
    timeout=120,
)
print(r.json()["response"])
```

Run it:

```bash
INGRESS_IP=$INGRESS_IP python client.py "Explain a Kubernetes liveness probe in one line."
```

## Troubleshooting

- **Pod stays `Pending`:** Run `kubectl describe pod <name>`. Usually `0/2 nodes are available: 1 Insufficient nvidia.com/gpu`. Check the GPU node is up (`kubectl get nodes -L agentpool`) and the device plugin pod is running (`kubectl get pods -n kube-system | grep nvidia`).
- **NGINX 504 after ~60s:** The proxy timeout annotations did not take effect. Check `kubectl describe ingress llm-inference` and confirm the annotations are listed.
- **OLLAMA returns "model not found":** The pull-stage of the Dockerfile failed silently. Rebuild with `--progress=plain` and watch the pull output.

## Clean up

```bash
kubectl delete -f k8s/
az aks nodepool scale -g $RG --cluster-name $AKS -n gpu --node-count 0
# Or, to delete everything:
az group delete -n $RG --yes --no-wait
```

## Conclusion

If you got this far, you have taken a model that was running on a single VM and turned it into a containerised inference service on AKS, with health probes, an Ingress that does not cut off mid-response, and an HPA that keeps the GPU warm enough that real users do not see cold-start. The same shape works for any OLLAMA-supported model. Swap the `ollama pull` line in the Dockerfile and rebuild.

GitHub source for this guide: [link to be added once published]

Next up: I will plug an MLflow model registry in front of this so you can promote model versions through `dev` and `prod` with an approval gate.
