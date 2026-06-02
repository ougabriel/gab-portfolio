# AZURE PROJECT: Multi-region active-active web app on AKS with Front Door, Cosmos DB multi-write, and automated failover

Every Fortune 500 with global users runs some variant of this pattern; banks, airlines, retail. Two AKS clusters in paired regions, one Cosmos DB account with multi-region writes on, Azure Front Door Premium in front, and ACR geo-replicated so image pulls stay local. The Azure DevOps pipeline deploys both regions in parallel with the second gated, and we induce a failure with kubectl drain to prove failover. Primary is UK South, secondary is West Europe.

## Tools used

- **Azure Kubernetes Service (AKS)** for the two clusters running the web app, version 1.30 node pool
- **Azure Front Door Premium** for global anycast, WAF, health probes, and origin priority/weight routing
- **Azure Cosmos DB for NoSQL** with multi-region writes enabled and Last Writer Wins conflict resolution
- **Azure Container Registry Premium** with geo-replication to West Europe
- **Azure DevOps Pipelines** with one stage per region, parallel deploy, gated promotion
- **Bicep** for the infrastructure (Front Door, Cosmos, ACR, AKS)
- **kubectl & Helm** for the workload and the induced-failure test
- **Azure CLI** for the bits Bicep does not cover cleanly
- **Azure Monitor & Log Analytics** in each region for the diagnostic logs

## Prerequisites

- An Azure subscription with Owner on the resource groups (you will create two RGs, one per region)
- Azure CLI 2.60 or newer logged in with `az login`
- `kubectl` 1.30 and `helm` 3.14
- An Azure DevOps organization with a project, and a service connection to the subscription (Workload Identity federation is the cleanest option)
- A custom domain you can move DNS for, plus a wildcard SSL story or Front Door managed certs
- About 3 to 4 hours, and a willingness to spend roughly £40 to £60 on Cosmos throughput and Front Door Premium if you leave it running overnight

## Project Architecture

Two AKS clusters, one in UK South and one in West Europe. Each cluster runs the same web app behind the AKS standard load balancer (you can swap in App Gateway Ingress Controller later). Front Door Premium has two origins (one per regional LB public IP) and routes by latency, with health probes hitting `/healthz` every 30 seconds. Cosmos DB is a single account, `Microsoft.DocumentDB/databaseAccounts`, with two write regions and Session consistency. ACR Premium replicates the image to West Europe so both clusters pull locally. The Azure DevOps pipeline builds once, pushes to ACR, then runs two parallel stages with the second gated by a manual approval.

Failover test: `kubectl drain` every node in West Europe, watch Front Door pull that origin out on the next probe interval, confirm zero 5xx from the client, then uncordon and watch it come back.

## Step 1. Create the resource groups, ACR, and Cosmos DB account

Create the two regional resource groups and a shared "global" RG for non-regional resources.

```bash
az group create -n rg-multiregion-global -l uksouth
az group create -n rg-multiregion-uks -l uksouth
az group create -n rg-multiregion-weu -l westeurope
```

i> Create the ACR in the global RG, Premium tier, because only Premium supports geo-replication.

```bash
az acr create \
  --resource-group rg-multiregion-global \
  --name acrmultiregion$RANDOM \
  --sku Premium \
  --location uksouth
```

ii> Add the West Europe replica. Replication is per registry not per repository, so every image you push goes both ways.

```bash
ACR_NAME=$(az acr list -g rg-multiregion-global --query "[0].name" -o tsv)
az acr replication create \
  --registry $ACR_NAME \
  --location westeurope
```

iii> Now the Cosmos DB account, SQL database, and container, with multi-region writes on and Session consistency. Paste the following into `cosmos.bicep`:

```bicep
param accountName string = 'cosmos-multiregion-${uniqueString(resourceGroup().id)}'
param primaryRegion string = 'uksouth'
param secondaryRegion string = 'westeurope'

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: accountName
  location: primaryRegion
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    enableMultipleWriteLocations: true
    enableAutomaticFailover: false
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: primaryRegion
        failoverPriority: 0
        isZoneRedundant: true
      }
      {
        locationName: secondaryRegion
        failoverPriority: 1
        isZoneRedundant: true
      }
    ]
  }
}

resource sqlDb 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmos
  name: 'appdb'
  properties: {
    resource: { id: 'appdb' }
    options: { autoscaleSettings: { maxThroughput: 4000 } }
  }
}

resource sqlContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: sqlDb
  name: 'orders'
  properties: {
    resource: {
      id: 'orders'
      partitionKey: { paths: [ '/customerId' ], kind: 'Hash' }
      conflictResolutionPolicy: {
        mode: 'LastWriterWins'
        conflictResolutionPath: '/_ts'
      }
    }
  }
}

output cosmosEndpoint string = cosmos.properties.documentEndpoint
```

Deploy it:

```bash
az deployment group create \
  -g rg-multiregion-global \
  -f cosmos.bicep
```

A few things on that Bicep. `enableMultipleWriteLocations: true` is the switch that makes both regions writable. `enableAutomaticFailover` stays false because with multi-region writes on, failover is handled at the SDK/region layer; turning both on is a common misconfiguration. `Session` consistency is what almost every prod app uses; Strong loses multi-region writes. `LastWriterWins` on `/_ts` is fine for orders; for money-related writes use Custom with a stored procedure.

## Step 2: Create the two AKS clusters

Run the following to create the UK South cluster, attaching ACR so the kubelet identity can pull without imagePullSecrets.

```bash
az aks create \
  --resource-group rg-multiregion-uks \
  --name aks-uks \
  --location uksouth \
  --kubernetes-version 1.30.5 \
  --node-count 2 \
  --node-vm-size Standard_D4s_v5 \
  --enable-managed-identity \
  --attach-acr $ACR_NAME \
  --network-plugin azure \
  --zones 1 2 3 \
  --generate-ssh-keys
```

Repeat for West Europe:

```bash
az aks create \
  --resource-group rg-multiregion-weu \
  --name aks-weu \
  --location westeurope \
  --kubernetes-version 1.30.5 \
  --node-count 2 \
  --node-vm-size Standard_D4s_v5 \
  --enable-managed-identity \
  --attach-acr $ACR_NAME \
  --network-plugin azure \
  --zones 1 2 3 \
  --generate-ssh-keys
```

Pull credentials for both contexts so you can flip between them easily:

```bash
az aks get-credentials -g rg-multiregion-uks -n aks-uks --context aks-uks
az aks get-credentials -g rg-multiregion-weu -n aks-weu --context aks-weu
```

Confirm both clusters are up:

```bash
kubectl --context aks-uks get nodes
kubectl --context aks-weu get nodes
```

You should see 2 Ready nodes in each.

## Step 3: Build & push the app image to ACR

Below is a minimal Node.js app that reads/writes Cosmos DB and exposes `/healthz`. Paste the following into `app/server.js`:

```javascript
const express = require('express');
const { CosmosClient } = require('@azure/cosmos');

const app = express();
app.use(express.json());

const client = new CosmosClient({
  endpoint: process.env.COSMOS_ENDPOINT,
  key: process.env.COSMOS_KEY,
  connectionPolicy: { preferredLocations: [ process.env.REGION ] }
});
const container = client.database('appdb').container('orders');

app.get('/healthz', (req, res) => res.status(200).json({ ok: true, region: process.env.REGION }));

app.post('/orders', async (req, res) => {
  const { resource } = await container.items.create(req.body);
  res.status(201).json(resource);
});

app.get('/orders/:id', async (req, res) => {
  const { resource } = await container.item(req.params.id, req.body.customerId).read();
  res.json(resource);
});

app.listen(3000, () => console.log('listening on 3000, region=', process.env.REGION));
```

And the Dockerfile:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

Build and push using ACR Tasks:

```bash
az acr build \
  --registry $ACR_NAME \
  --image webapp:v1 \
  ./app
```

Geo-replication kicks in automatically; within a minute the West Europe replica has the same image.

## Step 4: Kubernetes manifests for the workload

Below is the YAML for the deployment, service, and configmap. `preferredLocations` is set per region via the `REGION` env var, which makes the Cosmos SDK route writes locally. Paste the following into `k8s/webapp.yaml`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: webapp-config
data:
  COSMOS_ENDPOINT: "https://cosmos-multiregion-xxxxx.documents.azure.com:443/"
---
apiVersion: v1
kind: Secret
metadata:
  name: webapp-secret
type: Opaque
stringData:
  COSMOS_KEY: "REPLACE_WITH_PRIMARY_KEY"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: webapp
spec:
  replicas: 3
  selector:
    matchLabels: { app: webapp }
  template:
    metadata:
      labels: { app: webapp }
    spec:
      containers:
        - name: webapp
          image: ACR_NAME.azurecr.io/webapp:v1
          ports: [{ containerPort: 3000 }]
          env:
            - name: REGION
              value: "REGION_PLACEHOLDER"
            - name: COSMOS_ENDPOINT
              valueFrom: { configMapKeyRef: { name: webapp-config, key: COSMOS_ENDPOINT } }
            - name: COSMOS_KEY
              valueFrom: { secretKeyRef: { name: webapp-secret, key: COSMOS_KEY } }
          readinessProbe:
            httpGet: { path: /healthz, port: 3000 }
            periodSeconds: 5
          livenessProbe:
            httpGet: { path: /healthz, port: 3000 }
            periodSeconds: 10
          resources:
            requests: { cpu: "100m", memory: "128Mi" }
            limits:   { cpu: "500m", memory: "512Mi" }
---
apiVersion: v1
kind: Service
metadata:
  name: webapp
  annotations:
    service.beta.kubernetes.io/azure-load-balancer-health-probe-request-path: /healthz
spec:
  type: LoadBalancer
  selector: { app: webapp }
  ports:
    - port: 80
      targetPort: 3000
```

Apply to UK South first with the region substituted:

```bash
sed -e "s/REGION_PLACEHOLDER/uksouth/" -e "s/ACR_NAME/$ACR_NAME/" k8s/webapp.yaml | \
  kubectl --context aks-uks apply -f -
```

Then West Europe:

```bash
sed -e "s/REGION_PLACEHOLDER/westeurope/" -e "s/ACR_NAME/$ACR_NAME/" k8s/webapp.yaml | \
  kubectl --context aks-weu apply -f -
```

Grab the two public IPs for Front Door origins:

```bash
UKS_IP=$(kubectl --context aks-uks get svc webapp -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
WEU_IP=$(kubectl --context aks-weu get svc webapp -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
echo "UK South: $UKS_IP, West Europe: $WEU_IP"
```

## Step 5: Front Door Premium with WAF, two origins, latency routing

This is the bit doing the heavy lifting. Azure Front Door is `Microsoft.Cdn/profiles` with `sku.name: Premium_AzureFrontDoor`. Health probes are HTTP GET by default; you set protocol, path, and interval explicitly. Probe interval can go as low as 5 seconds but 30 is the sensible default.

Paste the following into `frontdoor.bicep`:

```bicep
param profileName string = 'afd-multiregion'
param endpointName string = 'app-multiregion'
param uksOriginIp string
param weuOriginIp string

resource profile 'Microsoft.Cdn/profiles@2024-02-01' = {
  name: profileName
  location: 'global'
  sku: { name: 'Premium_AzureFrontDoor' }
}

resource endpoint 'Microsoft.Cdn/profiles/afdEndpoints@2024-02-01' = {
  parent: profile
  name: endpointName
  location: 'global'
  properties: { enabledState: 'Enabled' }
}

resource originGroup 'Microsoft.Cdn/profiles/originGroups@2024-02-01' = {
  parent: profile
  name: 'og-regional'
  properties: {
    loadBalancingSettings: {
      sampleSize: 4
      successfulSamplesRequired: 3
      additionalLatencyInMilliseconds: 50
    }
    healthProbeSettings: {
      probePath: '/healthz'
      probeRequestType: 'GET'
      probeProtocol: 'Http'
      probeIntervalInSeconds: 30
    }
  }
}

resource originUks 'Microsoft.Cdn/profiles/originGroups/origins@2024-02-01' = {
  parent: originGroup
  name: 'origin-uks'
  properties: {
    hostName: uksOriginIp
    httpPort: 80
    httpsPort: 443
    priority: 1
    weight: 1000
    enabledState: 'Enabled'
  }
}

resource originWeu 'Microsoft.Cdn/profiles/originGroups/origins@2024-02-01' = {
  parent: originGroup
  name: 'origin-weu'
  properties: {
    hostName: weuOriginIp
    httpPort: 80
    httpsPort: 443
    priority: 1
    weight: 1000
    enabledState: 'Enabled'
  }
}

resource route 'Microsoft.Cdn/profiles/afdEndpoints/routes@2024-02-01' = {
  parent: endpoint
  name: 'default-route'
  properties: {
    originGroup: { id: originGroup.id }
    supportedProtocols: [ 'Http', 'Https' ]
    patternsToMatch: [ '/*' ]
    forwardingProtocol: 'HttpOnly'
    linkToDefaultDomain: 'Enabled'
    httpsRedirect: 'Enabled'
  }
  dependsOn: [ originUks, originWeu ]
}

resource wafPolicy 'Microsoft.Network/FrontDoorWebApplicationFirewallPolicies@2024-02-01' = {
  name: 'wafmultiregion'
  location: 'global'
  sku: { name: 'Premium_AzureFrontDoor' }
  properties: {
    policySettings: { enabledState: 'Enabled', mode: 'Prevention' }
    managedRules: {
      managedRuleSets: [
        {
          ruleSetType: 'Microsoft_DefaultRuleSet'
          ruleSetVersion: '2.1'
        }
        {
          ruleSetType: 'Microsoft_BotManagerRuleSet'
          ruleSetVersion: '1.1'
        }
      ]
    }
  }
}

output endpointHostName string = endpoint.properties.hostName
```

Deploy:

```bash
az deployment group create \
  -g rg-multiregion-global \
  -f frontdoor.bicep \
  --parameters uksOriginIp=$UKS_IP weuOriginIp=$WEU_IP
```

A couple of things to call out. Both origins share priority 1 and weight 1000, giving Front Door equal-cost routing across regions; the region picked per request is the lowest-latency one from the user's PoP. That is the active-active behaviour. `additionalLatencyInMilliseconds: 50` is a tolerance band so a user closer to UK South still hits UK South even if West Europe blips. The WAF attaches via a security policy on the profile.

Test the endpoint:

```bash
ENDPOINT=$(az afd endpoint show -g rg-multiregion-global \
  --profile-name afd-multiregion --endpoint-name app-multiregion \
  --query hostName -o tsv)
curl https://$ENDPOINT/healthz
```

The response should show `region: uksouth` from a UK machine and `region: westeurope` from a Frankfurt machine. Routing works.

## Step 6: Azure DevOps pipeline with parallel regional stages

Below is `azure-pipelines.yml`. It builds once, pushes to ACR (geo-replicates automatically), then runs two stages, DeployUKS and DeployWEU, in parallel. West Europe is gated by an environment approval.

```yaml
trigger:
  branches:
    include: [ main ]

variables:
  acrName: 'acrmultiregionXXXX'
  imageRepo: 'webapp'
  imageTag: '$(Build.BuildId)'

stages:
  - stage: Build
    jobs:
      - job: BuildAndPush
        pool: { vmImage: 'ubuntu-22.04' }
        steps:
          - task: AzureCLI@2
            inputs:
              azureSubscription: 'sc-multiregion'
              scriptType: 'bash'
              scriptLocation: 'inlineScript'
              inlineScript: |
                az acr build \
                  --registry $(acrName) \
                  --image $(imageRepo):$(imageTag) \
                  ./app

  - stage: DeployUKS
    dependsOn: Build
    jobs:
      - deployment: DeployUks
        environment: 'aks-uks'
        pool: { vmImage: 'ubuntu-22.04' }
        strategy:
          runOnce:
            deploy:
              steps:
                - task: KubernetesManifest@1
                  inputs:
                    action: 'deploy'
                    kubernetesServiceConnection: 'k8s-uks'
                    namespace: 'default'
                    manifests: 'k8s/webapp.yaml'
                    containers: '$(acrName).azurecr.io/$(imageRepo):$(imageTag)'

  - stage: DeployWEU
    dependsOn: Build
    jobs:
      - deployment: DeployWeu
        environment: 'aks-weu'
        pool: { vmImage: 'ubuntu-22.04' }
        strategy:
          runOnce:
            deploy:
              steps:
                - task: KubernetesManifest@1
                  inputs:
                    action: 'deploy'
                    kubernetesServiceConnection: 'k8s-weu'
                    namespace: 'default'
                    manifests: 'k8s/webapp.yaml'
                    containers: '$(acrName).azurecr.io/$(imageRepo):$(imageTag)'
```

Both DeployUKS and DeployWEU declare `dependsOn: Build` only, not on each other, so Azure DevOps runs them in parallel. To gate WEU, go to Pipelines > Environments > aks-weu > Approvals and checks and add an Approval. That gives you the "deploy primary, eyeball it, then promote" pattern auditors want to see.

## Step 7: Induce the failure and watch Front Door pull the region

This is the test. Drain every node in West Europe and confirm Front Door pulls origin-weu out within one or two probe intervals. With the probe at 30 seconds and `successfulSamplesRequired: 3` of `sampleSize: 4`, expect about 90 seconds before the origin is fully marked unhealthy.

Start a curl loop in a separate shell:

```bash
while true; do
  curl -s https://$ENDPOINT/healthz | jq -r '.region';
  sleep 1;
done
```

Cordon and drain every node in West Europe:

```bash
for n in $(kubectl --context aks-weu get nodes -o name); do
  kubectl --context aks-weu cordon $n
done

for n in $(kubectl --context aks-weu get nodes -o name); do
  kubectl --context aks-weu drain $n --ignore-daemonsets --delete-emptydir-data --force --timeout=60s
done
```

In the curl loop you will see `westeurope` answers stop appearing within 60 to 90 seconds and all answers switch to `uksouth`. Zero 5xx on the client side, because Front Door marks the origin unhealthy and routes around it.

Bring West Europe back:

```bash
for n in $(kubectl --context aks-weu get nodes -o name); do
  kubectl --context aks-weu uncordon $n
done
```

Within another minute or two the West Europe origin shows healthy again and the curl loop starts mixing `westeurope` answers back in. Active-active failover and recovery proven end to end.

## Step 8: Cost, throughput, and DNS notes

A few things to keep in mind before shipping to production.

i> **Cosmos throughput.** We provisioned 4000 RU/s autoscale on the container. With multi-region writes RU/s is provisioned per region, so the bill is roughly 2x a single-region account at the same RU/s. Use autoscale for spiky workloads, and provision at the database level if you have lots of containers sharing a budget.

ii> **Front Door Premium** is around $330/month base plus traffic. Standard is cheaper but lacks the managed Bot Manager ruleset and Private Link to origin. For active-active prod, Premium is the right call.

iii> **ACR Premium with geo-replication** is about $1.67/day per replica. Cheap, leave it on.

iv> **DNS TTLs.** Front Door gives you an `azurefd.net` hostname; when you CNAME your custom domain at it, set the TTL low (60 seconds) so that if you swap profiles for a blue/green DR drill the change propagates fast. Inside Front Door the anycast layer handles routing in milliseconds, you do not control that TTL.

v> **AKS node pool sizing.** Standard_D4s_v5 is fine for the demo. For prod use spot for batch, system pool separated from user pool, and cluster autoscaler on.

## Troubleshooting

- **Front Door reports origin unhealthy but the AKS service is up.** Check the NSG on the AKS subnet allows inbound from the `AzureFrontDoor.Backend` service tag. The probe source is that tag, not the public AFD IP.
- **Cosmos DB writes succeed in UK South but fail in West Europe with `Forbidden`.** You probably left `enableMultipleWriteLocations` false or you are using a read-only key. Recheck the Bicep and pull a fresh primary key.
- **kubectl drain hangs on a PDB.** If the deployment has a PodDisruptionBudget with `minAvailable: 100%` the drain sits forever. Lower the PDB to a sensible value (1 or 50%).
- **Pipeline DeployWEU runs before DeployUKS finishes.** That is the point, parallel. For strict order change `dependsOn: Build` on DeployWEU to `dependsOn: DeployUKS`.
- **Front Door custom domain validation stuck on `Pending`.** Add the `_dnsauth` TXT record exactly as shown; propagation is 5 to 10 minutes and validation re-runs on a timer.

## Clean up

When done, nuke the three resource groups:

```bash
az group delete -n rg-multiregion-global --yes --no-wait
az group delete -n rg-multiregion-uks --yes --no-wait
az group delete -n rg-multiregion-weu --yes --no-wait
```

The Front Door profile and Cosmos account live in `rg-multiregion-global` so deleting that RG takes them with it.

If you have followed carefully you must have noticed we only wired up the orders container; do the same for any other container your app needs, with `LastWriterWins` if writes are idempotent or Custom if not. The pipeline deploys both regions in parallel from a single image, and the Front Door config routes by latency so users get the closest healthy region. The induced-failure test is the bit most teams skip; run it monthly as a business continuity drill the same way Cosmos DB lets you trigger a forced failover. That is what Fortune 500 ops teams actually do and it is why their five 9s hold.

#azure #azuredevops #devops #aks #cosmosdb #frontdoor #multiregion #activeactive #cicdproject #fortune500 #seniordevopsengineer
