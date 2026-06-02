# CICD PROJECT: Production-grade microservices e-commerce platform on AKS using Azure DevOps, Helm, ArgoCD, and Key Vault

Picture a UK retailer running a flash sale at 19:00 GMT on Black Friday. Traffic spikes from 200 req/s to 18k req/s in under ninety seconds. The catalog service needs to keep serving product reads, the cart service must hold session state, and the checkout service has to talk to a relational database without falling over. That is the kind of platform we are going to build. Three microservices, one AKS cluster, GitOps from end to end, secrets stored properly in Azure Key Vault, and a pipeline that does not leak credentials into stdout.

## Tools used

- Azure Kubernetes Service (AKS) Standard tier cluster, Kubernetes 1.30, Azure CNI overlay networking
- Azure DevOps Services with multi-stage YAML pipelines
- Azure Container Registry (ACR) Premium SKU for image storage & Helm OCI charts
- Helm 3.15 for packaging each microservice
- ArgoCD 2.11 running inside the cluster, App-of-Apps pattern, manifest GitOps repo as source of truth
- NGINX Ingress Controller behind an Azure Application Gateway (Standard_v2)
- Azure Cosmos DB for MongoDB (vCore) for the catalog read store
- Azure Cache for Redis (Standard C1) for cart session state
- Azure SQL Database (General Purpose, serverless) for checkout transactions
- Azure Key Vault + Secrets Store CSI Driver for runtime secret injection
- Self-hosted Azure Pipelines agent running as a Deployment on AKS, scaled by KEDA
- SonarCloud for static analysis, Trivy for image CVE scanning
- Microsoft Entra Workload ID for pod-to-Azure auth, no client secrets anywhere

## Prerequisites

- An Azure subscription where you can create resource groups and assign roles at subscription scope (you need at least Contributor + User Access Administrator, or Owner)
- Azure CLI version 2.62 or later, with the `aks-preview` extension installed
- Azure DevOps organisation with a project already created
- kubectl 1.30 and Helm 3.15 on your workstation
- GitHub or Azure Repos to host four repos: `catalog-svc`, `cart-svc`, `checkout-svc`, `gitops-manifests`
- A registered domain so the ingress can serve TLS via cert-manager (we will use `shop.example.co.uk` throughout)

## Project Architecture

Three microservices, three repos, one manifest repo. Each service repo carries its own Dockerfile, Helm chart, and `azure-pipelines.yml`. The pipeline builds the Docker image, pushes to ACR, packages the Helm chart, pushes the chart to the same ACR as an OCI artifact, then updates the `gitops-manifests` repo with the new chart version. ArgoCD watches that manifest repo and reconciles the cluster. The cluster pulls images via the kubelet identity, pulls secrets via the CSI driver, and exposes traffic through NGINX behind Application Gateway. Nothing on the public internet talks directly to a pod, ever.

Data layer: catalog reads from Cosmos DB Mongo API, cart reads/writes Redis, checkout commits orders to Azure SQL. All three get their connection strings from Key Vault, never from a ConfigMap.

## Step 1. Provision the platform with Bicep

We will Bicep the lot. One template per concern, deployed in order. Run the following commands to create the top-level resource group:

```bash
az group create --name rg-shop-prod-uks --location uksouth
az group create --name rg-shop-data-uks --location uksouth
```

Paste the following into `infra/aks.bicep`:

```bicep
param location string = resourceGroup().location
param clusterName string = 'aks-shop-prod'
param kubernetesVersion string = '1.30.3'
param dnsPrefix string = 'shopprod'

resource aks 'Microsoft.ContainerService/managedClusters@2024-09-01' = {
  name: clusterName
  location: location
  sku: {
    name: 'Base'
    tier: 'Standard'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    kubernetesVersion: kubernetesVersion
    dnsPrefix: dnsPrefix
    oidcIssuerProfile: {
      enabled: true
    }
    securityProfile: {
      workloadIdentity: {
        enabled: true
      }
    }
    addonProfiles: {
      azureKeyvaultSecretsProvider: {
        enabled: true
        config: {
          enableSecretRotation: 'true'
          rotationPollInterval: '2m'
        }
      }
      azurepolicy: {
        enabled: true
      }
    }
    agentPoolProfiles: [
      {
        name: 'systempool'
        count: 2
        vmSize: 'Standard_D4ds_v5'
        mode: 'System'
        osType: 'Linux'
        osSKU: 'AzureLinux'
        type: 'VirtualMachineScaleSets'
      }
      {
        name: 'apppool'
        count: 3
        minCount: 3
        maxCount: 20
        enableAutoScaling: true
        vmSize: 'Standard_D8ds_v5'
        mode: 'User'
        osType: 'Linux'
        osSKU: 'AzureLinux'
        type: 'VirtualMachineScaleSets'
      }
    ]
    networkProfile: {
      networkPlugin: 'azure'
      networkPluginMode: 'overlay'
      networkPolicy: 'cilium'
      networkDataplane: 'cilium'
      podCidr: '10.244.0.0/16'
      serviceCidr: '10.0.0.0/16'
      dnsServiceIP: '10.0.0.10'
    }
  }
}

output oidcIssuer string = aks.properties.oidcIssuerProfile.issuerURL
output clusterName string = aks.name
```

Two things worth noting here. First, `oidcIssuerProfile.enabled` and `securityProfile.workloadIdentity.enabled` both have to be true, otherwise the federated identity step later just silently does nothing. Second, the `azureKeyvaultSecretsProvider` addon is what installs the Secrets Store CSI Driver on every node; we do not install it via Helm.

Deploy it:

```bash
az deployment group create \
  --resource-group rg-shop-prod-uks \
  --template-file infra/aks.bicep \
  --parameters clusterName=aks-shop-prod
```

## Step 2: Stand up the data services and Key Vault

Paste the following into `infra/data.bicep`:

```bicep
param location string = resourceGroup().location

resource kv 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'kv-shop-prod-uks'
  location: location
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: tenant().tenantId
    enableRbacAuthorization: true
    enablePurgeProtection: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 30
  }
}

resource cosmos 'Microsoft.DocumentDB/mongoClusters@2024-07-01' = {
  name: 'cosmos-shop-catalog'
  location: location
  properties: {
    administratorLogin: 'shopadmin'
    administratorLoginPassword: 'REPLACE_AT_DEPLOY_TIME'
    serverVersion: '7.0'
    nodeGroupSpecs: [
      {
        kind: 'Shard'
        sku: 'M30'
        diskSizeGB: 128
        nodeCount: 1
      }
    ]
  }
}

resource redis 'Microsoft.Cache/redis@2024-03-01' = {
  name: 'redis-shop-cart'
  location: location
  properties: {
    sku: {
      name: 'Standard'
      family: 'C'
      capacity: 1
    }
    enableNonSslPort: false
    minimumTlsVersion: '1.2'
  }
}

resource sql 'Microsoft.Sql/servers@2023-08-01-preview' = {
  name: 'sql-shop-checkout'
  location: location
  properties: {
    administratorLogin: 'shopadmin'
    administratorLoginPassword: 'REPLACE_AT_DEPLOY_TIME'
    version: '12.0'
    publicNetworkAccess: 'Disabled'
  }
}

resource sqlDb 'Microsoft.Sql/servers/databases@2023-08-01-preview' = {
  parent: sql
  name: 'checkout'
  location: location
  sku: {
    name: 'GP_S_Gen5_2'
    tier: 'GeneralPurpose'
  }
  properties: {
    autoPauseDelay: 60
    minCapacity: json('0.5')
  }
}
```

Once deployed, push the three real connection strings into Key Vault. Do not commit them, paste them on the terminal:

```bash
az keyvault secret set --vault-name kv-shop-prod-uks --name catalog-mongo-conn --value "<cosmos-conn-string>"
az keyvault secret set --vault-name kv-shop-prod-uks --name cart-redis-conn    --value "<redis-conn-string>"
az keyvault secret set --vault-name kv-shop-prod-uks --name checkout-sql-conn  --value "<sql-conn-string>"
```

## Step 3: Wire up Microsoft Entra Workload ID

Each microservice gets its own user-assigned managed identity, its own Kubernetes ServiceAccount, and a federated identity credential bridging the two. This is the pattern Microsoft now recommends in place of the older pod-managed identity preview.

Run the following script (substitute the OIDC issuer URL that the AKS deployment returned):

```bash
export RG=rg-shop-prod-uks
export AKS=aks-shop-prod
export OIDC=$(az aks show -n $AKS -g $RG --query "oidcIssuerProfile.issuerURL" -o tsv)
export TENANT=$(az account show --query tenantId -o tsv)

for svc in catalog cart checkout; do
  az identity create -g $RG -n "mi-${svc}"
  CLIENT_ID=$(az identity show -g $RG -n "mi-${svc}" --query clientId -o tsv)
  PRINCIPAL_ID=$(az identity show -g $RG -n "mi-${svc}" --query principalId -o tsv)

  az role assignment create \
    --role "Key Vault Secrets User" \
    --assignee-object-id $PRINCIPAL_ID \
    --assignee-principal-type ServicePrincipal \
    --scope $(az keyvault show --name kv-shop-prod-uks --query id -o tsv)

  az identity federated-credential create \
    --name "fed-${svc}" \
    --identity-name "mi-${svc}" \
    --resource-group $RG \
    --issuer $OIDC \
    --subject "system:serviceaccount:shop:${svc}-sa" \
    --audiences api://AzureADTokenExchange
done
```

The federated credential subject string format is strict; it must be `system:serviceaccount:<namespace>:<serviceaccount-name>` exactly, no trailing slash, no typo, or the token exchange will fail with `AADSTS70021`.

## Step 4: Install ingress, cert-manager, and ArgoCD

Run the command to get cluster credentials and install the three platform charts:

```bash
az aks get-credentials -n aks-shop-prod -g rg-shop-prod-uks --overwrite-existing

kubectl create ns ingress-nginx
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm install nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --set controller.service.annotations."service\.beta\.kubernetes\.io/azure-load-balancer-internal"=true \
  --set controller.replicaCount=3 \
  --version 4.11.2

kubectl create ns cert-manager
helm repo add jetstack https://charts.jetstack.io
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --set installCRDs=true \
  --version v1.15.3

kubectl create ns argocd
helm repo add argo https://argoproj.github.io/argo-helm
helm install argocd argo/argo-cd \
  --namespace argocd \
  --set server.extraArgs="{--insecure}" \
  --version 7.4.4
```

Grab the initial ArgoCD admin password. Run the following command on the terminal; because the password is base64 encoded we will need to decode it:

```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
```

Application Gateway sits in front of the internal NGINX LoadBalancer. Point a single backend pool at the NGINX private IP and let App Gateway do the public TLS termination on `*.shop.example.co.uk`. Cert-manager handles the inside-the-cluster TLS for service-to-service mTLS later.

## Step 5: Build the per-service Helm chart

Every service repo has the same structure. Below is the layout for `catalog-svc`:

```
catalog-svc/
  Dockerfile
  src/
  chart/
    Chart.yaml
    values.yaml
    templates/
      deployment.yaml
      service.yaml
      serviceaccount.yaml
      secretproviderclass.yaml
      ingress.yaml
  azure-pipelines.yml
```

Paste the following into `chart/templates/secretproviderclass.yaml`:

```yaml
apiVersion: secrets-store.csi.x-k8s.io/v1
kind: SecretProviderClass
metadata:
  name: {{ .Release.Name }}-kv
spec:
  provider: azure
  parameters:
    usePodIdentity: "false"
    clientID: {{ .Values.workloadIdentity.clientID }}
    keyvaultName: {{ .Values.keyvault.name }}
    tenantId: {{ .Values.keyvault.tenantId }}
    objects: |
      array:
        - |
          objectName: {{ .Values.secretName }}
          objectType: secret
  secretObjects:
    - secretName: {{ .Release.Name }}-app-secrets
      type: Opaque
      data:
        - objectName: {{ .Values.secretName }}
          key: connection-string
```

And the matching `serviceaccount.yaml`:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: {{ .Values.serviceAccountName }}
  namespace: {{ .Release.Namespace }}
  annotations:
    azure.workload.identity/client-id: {{ .Values.workloadIdentity.clientID }}
  labels:
    azure.workload.identity/use: "true"
```

The label `azure.workload.identity/use: "true"` on the ServiceAccount is what tells the mutating webhook to inject the projected token volume into the pod. Forget that label and your container will start, attempt a token exchange against IMDS, fail, and your logs will fill with `ManagedIdentityCredential authentication failed`.

## Step 6: Package the chart as an OCI artifact and push to ACR

ACR Premium speaks OCI, so the Helm chart can live in the same registry as the image. Run the commands to log in and push:

```bash
ACR=acrshopproduks
az acr login --name $ACR
helm registry login $ACR.azurecr.io \
  --username 00000000-0000-0000-0000-000000000000 \
  --password $(az acr login --name $ACR --expose-token --query accessToken -o tsv)

helm package chart/ --version 1.0.0
helm push catalog-1.0.0.tgz oci://$ACR.azurecr.io/charts
```

You can verify it landed by running `az acr repository list --name $ACR` and you should see `charts/catalog` alongside `catalog`.

## Step 7. Build the Azure DevOps pipeline

The pipeline runs on the self-hosted agent so traffic never leaves the cluster vnet. Paste the following into `azure-pipelines.yml` at the root of each service repo:

```yaml
trigger:
  branches:
    include: [ main ]

variables:
  acrName: 'acrshopproduks'
  serviceConn: 'sc-acr-shop-prod'
  imageRepo: 'catalog'
  chartRepo: 'charts/catalog'
  tag: '$(Build.BuildId)'

pool:
  name: 'aks-selfhosted-pool'

stages:
- stage: Quality
  displayName: Static analysis & CVE scan
  jobs:
  - job: Sonar
    steps:
    - task: SonarCloudPrepare@2
      inputs:
        SonarCloud: 'sc-sonarcloud'
        organization: 'shop-uks'
        scannerMode: 'CLI'
        configMode: 'manual'
        cliProjectKey: 'shop-catalog'
    - script: |
        pip install -r requirements.txt
        pytest --cov=src --cov-report=xml
      displayName: Unit tests with coverage
    - task: SonarCloudAnalyze@2
    - task: SonarCloudPublish@2

- stage: Build
  dependsOn: Quality
  jobs:
  - job: BuildAndPush
    steps:
    - task: Docker@2
      displayName: Build and push image
      inputs:
        command: buildAndPush
        repository: $(imageRepo)
        dockerfile: Dockerfile
        containerRegistry: $(serviceConn)
        tags: |
          $(tag)
          latest
    - script: |
        trivy image --severity HIGH,CRITICAL --exit-code 1 \
          $(acrName).azurecr.io/$(imageRepo):$(tag)
      displayName: Trivy CVE gate

- stage: PackageChart
  dependsOn: Build
  jobs:
  - job: HelmPush
    steps:
    - task: HelmInstaller@1
      inputs:
        helmVersionToInstall: '3.15.3'
    - script: |
        az acr login --name $(acrName)
        helm registry login $(acrName).azurecr.io \
          --username 00000000-0000-0000-0000-000000000000 \
          --password $(az acr login --name $(acrName) --expose-token --query accessToken -o tsv)
        sed -i "s/^version:.*/version: 1.0.$(tag)/" chart/Chart.yaml
        helm package chart/
        helm push catalog-1.0.$(tag).tgz oci://$(acrName).azurecr.io/charts
      displayName: Package & push OCI chart

- stage: UpdateManifests
  dependsOn: PackageChart
  jobs:
  - job: Bump
    steps:
    - checkout: git://shop/gitops-manifests
      persistCredentials: true
    - script: |
        cd apps/catalog
        sed -i "s/targetRevision:.*/targetRevision: 1.0.$(tag)/" application.yaml
        git config user.email "pipeline@shop.local"
        git config user.name "pipeline"
        git add application.yaml
        git commit -m "catalog: bump chart to 1.0.$(tag)"
        git push origin main
      displayName: Bump chart version in GitOps repo
```

The pattern here is the same as the Microsoft Learn `Deploy to Azure Kubernetes Service` template, with two changes. We swap the `KubernetesManifest@1` step for a `git push` against the GitOps repo, and we gate the build behind SonarCloud and Trivy. ArgoCD takes over after the push.

## Step 8: ArgoCD App-of-Apps

The `gitops-manifests` repo holds one root Application that points at a folder of child Applications. Paste the following into `apps/root/root-app.yaml`:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: root
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://dev.azure.com/shop/_git/gitops-manifests
    targetRevision: main
    path: apps
    directory:
      recurse: true
  destination:
    server: https://kubernetes.default.svc
    namespace: argocd
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

And a child Application for catalog at `apps/catalog/application.yaml`:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: catalog
  namespace: argocd
spec:
  project: default
  source:
    repoURL: acrshopproduks.azurecr.io
    chart: charts/catalog
    targetRevision: 1.0.123
    helm:
      values: |
        replicaCount: 3
        image:
          repository: acrshopproduks.azurecr.io/catalog
          tag: "123"
        workloadIdentity:
          clientID: 11111111-2222-3333-4444-555555555555
        keyvault:
          name: kv-shop-prod-uks
          tenantId: 99999999-aaaa-bbbb-cccc-dddddddddddd
        secretName: catalog-mongo-conn
        serviceAccountName: catalog-sa
        ingress:
          host: catalog.shop.example.co.uk
  destination:
    server: https://kubernetes.default.svc
    namespace: shop
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

Repeat for cart and checkout. Once the root Application is applied, ArgoCD picks up everything underneath and reconciles all three services in one shot.

## Step 9: Self-hosted agent on AKS

We do not want Microsoft-hosted agents reaching across the public internet to pull from private ACR; it works, but it means opening firewall rules to the entire weekly published Microsoft-hosted IP range. Instead we run the agent in-cluster. Paste the following into `infra/agent-deploy.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: azdo-agent
  namespace: azdo
spec:
  replicas: 2
  selector:
    matchLabels: { app: azdo-agent }
  template:
    metadata:
      labels:
        app: azdo-agent
        azure.workload.identity/use: "true"
    spec:
      serviceAccountName: azdo-agent-sa
      containers:
      - name: agent
        image: mcr.microsoft.com/azure-pipelines/vsts-agent:ubuntu-22.04
        env:
        - name: AZP_URL
          value: https://dev.azure.com/shop
        - name: AZP_POOL
          value: aks-selfhosted-pool
        - name: AZP_TOKEN
          valueFrom:
            secretKeyRef:
              name: azdo-pat
              key: token
        resources:
          requests: { cpu: "500m", memory: "1Gi" }
          limits:   { cpu: "2",    memory: "4Gi" }
```

Scale this with KEDA against the `azure-pipelines` scaler so agents spin up only when there are queued jobs. On a quiet weekend the pool sits at zero and costs nothing.

## Step 10: Smoke test with curl

If you have followed carefully you must have noticed we have not actually proved anything works yet. Run the command to hit each public endpoint:

```bash
# Catalog returns the SKU list
curl -sS https://catalog.shop.example.co.uk/api/products | jq '.[0:3]'

# Cart accepts a POST and echoes the session id
curl -sS -X POST https://cart.shop.example.co.uk/api/cart \
  -H "Content-Type: application/json" \
  -d '{"sku":"SKU-001","qty":2}'

# Checkout submits an order
curl -sS -X POST https://checkout.shop.example.co.uk/api/orders \
  -H "Content-Type: application/json" \
  -d '{"cartId":"abc-123","payment":"stripe_tok_test"}'
```

If all three return 200 you are done. If catalog returns 500 with `MongoServerSelectionError` the workload identity federation is wrong; jump back to Step 3.

## Troubleshooting

i> ArgoCD shows `OutOfSync` forever even after a successful push. Check that the Application's `source.repoURL` for OCI charts uses bare `acrshopproduks.azurecr.io` without the `https://` prefix. ArgoCD treats it differently and silently skips reconciliation if the scheme is wrong.

ii> Pods crash with `failed to get key vault secret`. The CSI driver is installed but the SecretProviderClass references a `clientID` that does not match the federated credential subject. Run `kubectl describe secretproviderclasspodstatus -n shop` and you will see the exact mismatch.

iii> Trivy fails the build on a base image you cannot patch. Either pin to `mcr.microsoft.com/dotnet/aspnet:8.0-azurelinux3.0` for Azure-curated images, or add a `.trivyignore` file with the specific CVE ID and a justification. Do not silence the whole scan.

iv> Application Gateway returns 502 even though NGINX is healthy. The backend pool is pointing at the public IP of the LoadBalancer not the private one; change the NGINX service annotation `service.beta.kubernetes.io/azure-load-balancer-internal` to `true` and recreate.

## Cost of running this

Rough monthly numbers in UK South, sustained at 3 replicas per service:

- AKS Standard tier cluster management: about £55
- 3x Standard_D8ds_v5 user nodes (24 vCPU, 96 GB total): about £580
- 2x Standard_D4ds_v5 system nodes: about £190
- ACR Premium: about £390
- Cosmos DB Mongo vCore M30: about £580
- Redis Standard C1: about £75
- Azure SQL serverless GP_S_Gen5_2 (auto-pause): about £90 idle, £280 active
- Application Gateway Standard_v2 with 3 capacity units: about £180
- Key Vault Standard: under £2

So about £2,100 to £2,400 a month for the platform before egress. Not Fortune 500 cheap, but a single team can run it without a dedicated SRE.

## Clean up

When you are done playing:

```bash
az group delete --name rg-shop-prod-uks --yes --no-wait
az group delete --name rg-shop-data-uks --yes --no-wait
```

The node resource group AKS auto-created (the one with the random suffix) gets deleted as part of the managed cluster removal, you do not have to chase it separately.

So that is the full picture. Three services, one cluster, GitOps from commit to running pod, secrets that never sit in a YAML file or a pipeline variable, and an agent pool that scales to zero on Sunday morning. If you wondering whether ArgoCD is overkill for three services, it is not; the moment you add a fourth service or a second region, the App-of-Apps pattern is the only thing that stops your platform engineers from writing kubectl commands by hand at 3 a.m. Take this, swap in your own ACR name, your own Key Vault, your own domain, and you have something a retail Fortune 500 actually runs in production. The bones are the same.

#azure #azuredevops #devops #cicdproject #aks #helm #argocd #keyvault #microservices #fortune500 #seniordevopsengineer
