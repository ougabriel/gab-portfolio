# AZURE PROJECT: Internal developer platform with Backstage on AKS, scaffolder templates auto-provisioning Azure DevOps repos and AKS namespaces

Spotify built Backstage for their own engineers in 2016, open-sourced it in 2020, and now banks, telcos and a couple of automotive groups I have worked alongside use it as the front door to everything they ship. The pattern is the same everywhere: a developer hits a "Create new service" button, picks a template, fills three fields, and ninety seconds later they have a git repo, a Helm chart, an AKS namespace, an ArgoCD Application syncing the cluster, and an Application Insights workspace already wired in. No tickets. No waiting on the platform team. That is what we are building here.

The whole thing runs on AKS, talks to Azure DevOps over the REST API, and uses Entra ID for SSO so the same engineer who logs into the portal also gets the right RBAC on the cluster namespace that gets created for them. Read the whole thing before you start clicking; the cost section and the adoption gotchas at the bottom are the parts that will save you a quarter of pain.

## Tools used

- Backstage v1.32 (the upstream OSS distribution from Spotify, not a vendor fork)
- Azure Kubernetes Service (AKS), Kubernetes 1.30, Standard tier
- Azure Database for PostgreSQL Flexible Server, 15
- Microsoft Entra ID (formerly Azure AD) for OIDC SSO
- Azure DevOps Services, REST API version 7.2
- ArgoCD 2.12 running in the same AKS cluster
- NGINX Ingress Controller and cert-manager for the TLS frontend
- Helm 3.15 for packaging and installing Backstage
- Azure Container Registry (ACR), Premium SKU
- Application Insights & Log Analytics workspace for the catalog tie-in
- az CLI 2.65, kubectl 1.30, Node.js 20 LTS (Backstage requires Node 20 from 1.30+)

## Prerequisites

- An Azure subscription with Owner on at least one resource group
- An Azure DevOps organisation (`dev.azure.com/{organization}`) where you can create projects and a service principal scoped PAT
- Entra ID tenant admin or an admin willing to consent to an app registration for you
- A domain name with DNS you control (we will point `backstage.yourcompany.io` at the ingress)
- A workstation with `az`, `kubectl`, `helm`, `node 20`, `yarn 4`, and `git`
- About 12 GB of free disk and the patience to let yarn install a 1.2 GB node_modules folder

## Project Architecture

The system has five moving parts. Backstage runs as two pods (frontend and backend, same container in the standard layout) inside an AKS namespace called `backstage`. It writes catalog data, scaffolder runs and audit logs to PostgreSQL Flexible Server over a private endpoint. When an engineer clicks a template, the scaffolder backend calls the Azure DevOps REST API at `https://dev.azure.com/{organization}/_apis/git/repositories?api-version=7.2-preview.1` to create the repo, then calls back into the local kubeconfig to create the namespace and RoleBinding on the same AKS cluster, then writes an ArgoCD Application manifest into the platform git repo so ArgoCD picks it up on its next sync. The catalog plugin runs every 10 minutes and re-scans Azure DevOps for `catalog-info.yaml` files plus the AKS cluster for `backstage.io/kubernetes-id` labels.

## Step 1. Create the resource group, AKS cluster and PostgreSQL Flexible Server

Run the following commands to spin up the base infrastructure. Pick a region close to your engineers; latency on the scaffolder calls matters more than people expect.

```bash
RG=rg-backstage-prod
LOC=uksouth
AKS=aks-backstage-prod
PG=pg-backstage-prod
ACR=acrbackstageprod

az group create -n $RG -l $LOC

az aks create \
  -g $RG -n $AKS \
  --kubernetes-version 1.30.5 \
  --node-count 3 \
  --node-vm-size Standard_D4s_v5 \
  --tier standard \
  --network-plugin azure \
  --network-plugin-mode overlay \
  --enable-managed-identity \
  --enable-workload-identity \
  --enable-oidc-issuer \
  --enable-azure-rbac \
  --enable-aad \
  --generate-ssh-keys

az acr create -g $RG -n $ACR --sku Premium
az aks update -g $RG -n $AKS --attach-acr $ACR

az postgres flexible-server create \
  -g $RG -n $PG \
  --location $LOC \
  --tier GeneralPurpose \
  --sku-name Standard_D2ds_v5 \
  --version 15 \
  --storage-size 128 \
  --high-availability ZoneRedundant \
  --admin-user pgadmin \
  --admin-password 'ChangeMeBefore3pm!' \
  --public-access None
```

Workload identity (`--enable-workload-identity`) is the bit you do not want to skip. We use it later so Backstage pods can talk to Azure DevOps and Azure Resource Manager without a stored secret. The cluster will land as a `Microsoft.ContainerService/managedClusters` resource and AKS will quietly create a second resource group (the node resource group) that holds the VM scale sets and disks.

## Step 2: Wire up Entra ID for SSO

Backstage uses OIDC. Create an app registration so users land on a "Sign in with Microsoft" button.

i> In the Entra portal go to App registrations, New registration. Name it `backstage-prod`. Redirect URI is `Web` with value `https://backstage.yourcompany.io/api/auth/microsoft/handler/frame`.

ii> Under Certificates & secrets create a client secret. Copy the value now; you cannot see it again.

iii> Under API permissions add `Microsoft Graph > User.Read` and `email`, `openid`, `profile`. Grant admin consent.

iv> Under Token configuration add the optional claims `email`, `family_name`, `given_name`, `preferred_username`.

Note the Application (client) ID and Directory (tenant) ID. We will paste them into `app-config.production.yaml` in Step 4.

## Step 3: Install ArgoCD, ingress-nginx and cert-manager

Run the following commands to bring up the GitOps and edge pieces:

```bash
# ArgoCD
kubectl create namespace argocd
kubectl apply -n argocd -f \
  https://raw.githubusercontent.com/argoproj/argo-cd/v2.12.4/manifests/install.yaml

# ingress-nginx
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace \
  --set controller.service.annotations."service\.beta\.kubernetes\.io/azure-load-balancer-health-probe-request-path"=/healthz

# cert-manager
helm repo add jetstack https://charts.jetstack.io
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace \
  --version v1.15.3 \
  --set crds.enabled=true
```

Get the public IP that ingress-nginx provisioned and point `backstage.yourcompany.io` and `argocd.yourcompany.io` at it in your DNS. Run the command to fetch the IP:

```bash
kubectl get svc -n ingress-nginx ingress-nginx-controller \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
```

Then drop in a ClusterIssuer for Let's Encrypt:

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: platform@yourcompany.io
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
```

## Step 4: Scaffold the Backstage app

On your workstation, bootstrap a new Backstage app. The CLI will ask for a name; call it `backstage` to keep paths short.

```bash
npx @backstage/create-app@latest
cd backstage
yarn install
```

Install the Azure DevOps, Kubernetes and Microsoft auth plugins; these are the three that make this whole project work.

```bash
yarn --cwd packages/backend add \
  @backstage/plugin-scaffolder-backend-module-azure \
  @backstage/plugin-catalog-backend-module-azure \
  @backstage/plugin-kubernetes-backend \
  @backstage/plugin-auth-backend-module-microsoft-provider

yarn --cwd packages/app add \
  @backstage/plugin-azure-devops \
  @backstage/plugin-kubernetes
```

Now paste the following into `app-config.production.yaml` at the repo root. Replace the `${...}` values with secrets that will come from a Kubernetes Secret later.

```yaml
app:
  title: Acme Developer Platform
  baseUrl: https://backstage.yourcompany.io

backend:
  baseUrl: https://backstage.yourcompany.io
  listen:
    port: 7007
  database:
    client: pg
    connection:
      host: ${POSTGRES_HOST}
      port: 5432
      user: pgadmin
      password: ${POSTGRES_PASSWORD}
      database: backstage_plugin_catalog
      ssl:
        rejectUnauthorized: true
  cors:
    origin: https://backstage.yourcompany.io

integrations:
  azure:
    - host: dev.azure.com
      credentials:
        - organizations: [acme]
          personalAccessToken: ${AZURE_DEVOPS_PAT}

auth:
  environment: production
  providers:
    microsoft:
      production:
        clientId: ${AZURE_CLIENT_ID}
        clientSecret: ${AZURE_CLIENT_SECRET}
        tenantId: ${AZURE_TENANT_ID}
        signIn:
          resolvers:
            - resolver: emailMatchingUserEntityProfileEmail

catalog:
  providers:
    azureDevOps:
      acme-org:
        organization: acme
        project: platform
        repository: '*'
        path: '/catalog-info.yaml'
        schedule:
          frequency: { minutes: 10 }
          timeout: { minutes: 3 }
  rules:
    - allow: [Component, System, API, Resource, Location, Template, Group, User]

kubernetes:
  serviceLocatorMethod:
    type: 'multiTenant'
  clusterLocatorMethods:
    - type: 'config'
      clusters:
        - name: aks-backstage-prod
          url: https://aks-backstage-prod-dns.hcp.uksouth.azmk8s.io
          authProvider: 'aksWorkloadIdentity'
          skipTLSVerify: false
```

## Step 5: Write the scaffolder template for a new microservice

This is the heart of the platform. Create a repo in Azure DevOps called `platform-templates` and inside it a folder `microservice-node/`. Drop a `template.yaml` in that folder. Below is the YAML for the template the developer will see:

```yaml
apiVersion: scaffolder.backstage.io/v1beta3
kind: Template
metadata:
  name: microservice-node
  title: Node.js Microservice on AKS
  description: Creates a Node.js service with a Helm chart, an Azure DevOps repo, an AKS namespace and an ArgoCD Application
  tags:
    - node
    - aks
    - recommended
spec:
  owner: group:platform-team
  type: service
  parameters:
    - title: Tell us about your service
      required:
        - name
        - owner
        - businessUnit
      properties:
        name:
          title: Name
          type: string
          pattern: '^[a-z][a-z0-9-]{2,28}[a-z0-9]$'
          description: lowercase, hyphens allowed, 4-30 chars
        owner:
          title: Owning team
          type: string
          ui:field: OwnerPicker
          ui:options:
            allowedKinds: [Group]
        businessUnit:
          title: Business unit
          type: string
          enum: [retail, wholesale, capital-markets, internal]
  steps:
    - id: fetch-base
      name: Fetch skeleton
      action: fetch:template
      input:
        url: ./skeleton
        values:
          name: ${{ parameters.name }}
          owner: ${{ parameters.owner }}
          businessUnit: ${{ parameters.businessUnit }}

    - id: publish-repo
      name: Create Azure DevOps repo
      action: publish:azure
      input:
        allowedHosts: ['dev.azure.com']
        description: 'Service ${{ parameters.name }} owned by ${{ parameters.owner }}'
        repoUrl: 'dev.azure.com?organization=acme&project=platform&repo=${{ parameters.name }}'
        defaultBranch: main

    - id: register
      name: Register in catalog
      action: catalog:register
      input:
        repoContentsUrl: ${{ steps.publish-repo.output.repoContentsUrl }}
        catalogInfoPath: '/catalog-info.yaml'

    - id: create-namespace
      name: Create AKS namespace
      action: kubernetes:apply
      input:
        clusterRef: aks-backstage-prod
        manifest: |
          apiVersion: v1
          kind: Namespace
          metadata:
            name: ${{ parameters.name }}
            labels:
              backstage.io/kubernetes-id: ${{ parameters.name }}
              businessUnit: ${{ parameters.businessUnit }}
          ---
          apiVersion: rbac.authorization.k8s.io/v1
          kind: RoleBinding
          metadata:
            name: ${{ parameters.owner }}-edit
            namespace: ${{ parameters.name }}
          subjects:
            - kind: Group
              name: ${{ parameters.owner }}
              apiGroup: rbac.authorization.k8s.io
          roleRef:
            kind: ClusterRole
            name: edit
            apiGroup: rbac.authorization.k8s.io

    - id: create-argocd-app
      name: Create ArgoCD Application
      action: kubernetes:apply
      input:
        clusterRef: aks-backstage-prod
        manifest: |
          apiVersion: argoproj.io/v1alpha1
          kind: Application
          metadata:
            name: ${{ parameters.name }}
            namespace: argocd
          spec:
            project: default
            source:
              repoURL: https://dev.azure.com/acme/platform/_git/${{ parameters.name }}
              targetRevision: main
              path: chart
            destination:
              server: https://kubernetes.default.svc
              namespace: ${{ parameters.name }}
            syncPolicy:
              automated:
                prune: true
                selfHeal: true
              syncOptions:
                - CreateNamespace=false

  output:
    links:
      - title: Repository
        url: ${{ steps.publish-repo.output.remoteUrl }}
      - title: Open in catalog
        icon: catalog
        entityRef: ${{ steps.register.output.entityRef }}
```

Inside `microservice-node/skeleton/` add the Helm chart, a sample `app.js`, a `Dockerfile`, a starter `azure-pipelines.yml` and the `catalog-info.yaml`. The `catalog-info.yaml` is what the catalog scanner picks up later; it should look like:

```yaml
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: ${{ values.name }}
  annotations:
    dev.azure.com/project-repo: acme/platform/${{ values.name }}
    backstage.io/kubernetes-id: ${{ values.name }}
    backstage.io/techdocs-ref: dir:.
spec:
  type: service
  lifecycle: experimental
  owner: ${{ values.owner }}
  system: ${{ values.businessUnit }}
```

Register the template itself in Backstage by adding a location to `app-config.production.yaml`:

```yaml
catalog:
  locations:
    - type: url
      target: https://dev.azure.com/acme/platform/_git/platform-templates?path=/microservice-node/template.yaml
      rules:
        - allow: [Template]
```

## Step 6: Build the image, push to ACR and deploy with Helm

Run the following command to build the production image from the Backstage repo root:

```bash
yarn install --immutable
yarn tsc
yarn build:backend --config app-config.yaml --config app-config.production.yaml

az acr build -r acrbackstageprod -t backstage:1.32.0 -f packages/backend/Dockerfile .
```

Create the secret that the Helm chart will read:

```bash
kubectl create namespace backstage
kubectl -n backstage create secret generic backstage-secrets \
  --from-literal=POSTGRES_HOST=pg-backstage-prod.postgres.database.azure.com \
  --from-literal=POSTGRES_PASSWORD='ChangeMeBefore3pm!' \
  --from-literal=AZURE_CLIENT_ID=<app-id> \
  --from-literal=AZURE_CLIENT_SECRET=<client-secret> \
  --from-literal=AZURE_TENANT_ID=<tenant-id> \
  --from-literal=AZURE_DEVOPS_PAT=<pat-with-Code-Read-Write-Manage>
```

Install Backstage using the community Helm chart:

```bash
helm repo add backstage https://backstage.github.io/charts
helm upgrade --install backstage backstage/backstage \
  --namespace backstage \
  --set image.repository=acrbackstageprod.azurecr.io/backstage \
  --set image.tag=1.32.0 \
  --set backstage.extraEnvVarsSecrets={backstage-secrets} \
  --set ingress.enabled=true \
  --set ingress.host=backstage.yourcompany.io \
  --set ingress.className=nginx \
  --set ingress.tls[0].secretName=backstage-tls \
  --set ingress.tls[0].hosts[0]=backstage.yourcompany.io
```

Wait for the pods to go Ready, then hit `https://backstage.yourcompany.io`. You should land on the Microsoft sign-in screen, come back signed in, and see an empty catalog with a "Create" button in the sidebar.

## Step 7: Test the full provisioning flow end to end

Click Create, pick "Node.js Microservice on AKS", fill in name `payments-api`, owner `group:payments-team`, businessUnit `retail`. Hit Next, then Create. The scaffolder logs should stream past in the UI. When it finishes you will get two links: the new Azure DevOps repo and the catalog entry.

Verify on the cluster side:

```bash
kubectl get ns payments-api
kubectl get application -n argocd payments-api
kubectl get rolebinding -n payments-api
```

You should see the namespace with the `backstage.io/kubernetes-id: payments-api` label, the ArgoCD Application syncing, and the RoleBinding pointing at the payments team group. ArgoCD will pull the Helm chart from the new repo and deploy the sample pod within a couple of minutes.

i> If catalog ingestion has not picked up the new component yet, do not wait the full 10 minutes; go to the entity URL and click the refresh icon next to the location.

ii> Application Insights wiring happens through the `catalog-info.yaml` annotation `dev.azure.com/project-repo`; the Azure DevOps plugin reads pipeline runs and surfaces them on the entity page.

## Cost model

For a 150-engineer organisation running this in production, monthly Azure costs in UK South look roughly like this:

- AKS Standard tier control plane: ~$73
- 3 x Standard_D4s_v5 nodes: ~$420
- PostgreSQL Flexible Server GP D2ds_v5 with ZRS HA: ~$285
- ACR Premium: ~$50
- Log Analytics + Application Insights ingestion at ~5 GB/day: ~$110
- Public IP, egress, backups: ~$60

Call it $1,000/month all-in. The thing to watch is PostgreSQL; the catalog table grows linearly with the number of entities scanned and the audit log grows with every scaffolder run. Set a retention policy from day one or you will be paying for storage you do not need by month six.

## Troubleshooting

**Backend crashes on boot with `database "backstage_plugin_catalog" does not exist`.** Flexible Server does not auto-create databases. Run `CREATE DATABASE backstage_plugin_catalog;` and the same for `backstage_plugin_auth`, `backstage_plugin_scaffolder`, `backstage_plugin_search` before the first deploy.

**The `publish:azure` step fails with 401.** The PAT scope is the trap. You need `Code (Read, write & manage)` plus `Project and Team (Read, write & manage)`. The narrower `Code (Read & write)` scope cannot create new repos.

**Scaffolder creates the repo but the catalog never picks it up.** Check that the template's skeleton actually writes a `catalog-info.yaml` at the repo root and that the catalog provider's `path` matches. Also confirm the AzureDevOps catalog provider's `repository: '*'` glob is reaching the new repo; some orgs scope it tighter than they remember.

**ArgoCD Application stuck in `Unknown` sync state.** ArgoCD needs a repo credential for Azure DevOps even if the user PAT created the repo. Add an `argocd-repo-creds` secret with the same PAT, or better, set up a managed identity federation between AKS and Azure DevOps.

## Adoption gotchas

Do not roll this out without an evangelism plan. I have watched two banks deploy Backstage perfectly and then sit on 4% adoption for nine months because nobody told the engineers it existed or why it was better than the wiki. The thing that works: pick three friendly teams, sit with them while they migrate their first service through the template, then let them tell the next three teams. Top-down "everyone must use the portal" emails get ignored.

The other piece, which is the Team Topologies bit, is that the platform team owns the templates and the runtime but does not own the services. The moment your platform engineers start writing application code inside other teams' repos because "it is faster", you have stopped being a platform team and become a shared services team, and the model breaks. Keep the boundary clean: templates and golden paths in, application logic out.

## Clean up

If you spun this up just to try it, run the following commands to delete everything:

```bash
az group delete -n rg-backstage-prod --yes --no-wait
```

That will take down the AKS cluster, the node resource group, PostgreSQL, ACR and the public IP. Delete the Entra ID app registration manually from the portal and revoke the Azure DevOps PAT under User settings.

So that is the full pattern. If you have followed carefully you must have noticed we only wrote one template; the real value shows up when you have a handful of them covering Node, .NET, Python, a static site, a database request and a Kafka topic request. Build the second template next week, not the second month, because the rate at which you add templates is exactly the rate at which engineers stop opening tickets. Also keep an eye on the catalog table size in PostgreSQL & set a TechDocs S3-equivalent (Azure Blob) before the on-disk docs cache eats your backend pod's PVC. That bit caught us once and it caught a Big-Four consultancy I was working with the same month, so it is not just you.

#azure #azuredevops #devops #backstage #aks #internaldeveloperplatform #platformengineering #fortune500 #seniordevopsengineer
