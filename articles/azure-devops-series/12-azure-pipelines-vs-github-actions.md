# Azure Pipelines vs GitHub Actions: how to choose, and how to bridge them

Most teams I talk to already use both. The repo lives on GitHub, the work items live on Azure Boards, and somebody is quietly maintaining two CI systems because neither one fully replaced the other. That is the real question here: when do you pick Azure Pipelines, when do you pick GitHub Actions, and when do you stop choosing and run them together.

### STEPS
- Step 1: Map the vocabulary across both systems
- Step 2: Compare triggers, jobs, and environments side by side
- Step 3: Wire OIDC from GitHub Actions into Azure
- Step 4: Build a hybrid pipeline: Actions for build, Azure Pipelines for release approvals

## Why this matters

The platform decision is not really about YAML. It is about who owns the release, who signs off, and where the audit trail lives. Azure Pipelines was built around the Classic release model with explicit `Environments`, `Approvals and checks`, and tight links into Azure Boards work items. GitHub Actions was built around the repo: pull requests, the marketplace, reusable workflows. Picking one without understanding what the other does well leaves you with a CI/CD plane that solves half the problem.

## Prerequisites

- An Azure subscription with `Owner` or `User Access Administrator` on the target scope. We need this to assign the federated identity its role.
- An Azure DevOps organization (we use `contoso-prod`).
- A GitHub repository where you can add Actions workflows and configure environment secrets.
- The Azure CLI 2.60 or later installed locally, signed in via `az login`.
- Familiarity with multi-stage YAML in Azure Pipelines and workflow YAML in Actions. We skip the 101.

NOTE: OIDC federation is the only auth pattern we use here. If you still have `azureSubscription` connections backed by a service principal secret, rotate them. Long-lived secrets in CI/CD are the single most common breach path in the audits I have seen this year.

## Tools Used

- **Azure Pipelines:** the build and release plane inside Azure DevOps. Multi-stage YAML in `azure-pipelines.yml`, classic Release UI still available. Owns `Environments`, `Approvals and checks`, `Variable groups`, and the agent pool model.
- **GitHub Actions:** the repo-native CI/CD plane in GitHub. Workflows live under `.github/workflows/*.yml`. Owns the `actions/*` marketplace, `environments` with required reviewers, and tight PR integration.
- **Microsoft Entra ID:** the identity provider. We register a `Microsoft Entra application` with a federated credential trusting GitHub's OIDC issuer.
- **azure/login@v2:** the official GitHub Action that exchanges the OIDC token for an Azure access token. Drop-in replacement for the old secret-based login.
- **AzureCLI@2:** the Azure Pipelines task that runs `az` commands against a service connection. Used in the release stage of the hybrid.
- **Azure DevOps service connection (Workload Identity Federation):** the Azure Pipelines side of OIDC. Replaces the `Azure Resource Manager` connection that used a client secret.
- **GitHub CLI (`gh`):** used to trigger an Azure DevOps pipeline from inside an Actions job via REST, and to read back run status.

## Step 1: Map the vocabulary across both systems

The single biggest source of confusion is that the words look similar but the scope is different. A `job` in Azure Pipelines lives inside a `stage`. A `job` in GitHub Actions lives directly inside the workflow. Get the table below into your head before you write any YAML.

| Concept | Azure Pipelines | GitHub Actions |
|---|---|---|
| Top-level config | `azure-pipelines.yml` | `.github/workflows/*.yml` |
| Trigger | `trigger:`, `pr:`, `schedules:` | `on:` (push, pull_request, schedule, workflow_dispatch) |
| Runner selection | `pool:` with `vmImage:` or self-hosted agent pool | `runs-on:` with GitHub-hosted label or self-hosted label |
| Grouping | `stages:` > `jobs:` > `steps:` | `jobs:` > `steps:` (no native stage layer) |
| Reusable unit | `task:` (e.g. `AzureCLI@2`, `UsePythonVersion@0`) | `uses:` (e.g. `actions/setup-python@v5`) |
| Inputs to reusable unit | `inputs:` | `with:` |
| Conditional | `condition:` with `eq()`, `succeeded()` | `if:` with infix `==`, `&&` |
| Job dependency | `dependsOn:` | `needs:` |
| Matrix | `strategy: matrix:` | `strategy: matrix:` (same key, different semantics) |
| Artifact publish | `PublishPipelineArtifact@1` | `actions/upload-artifact@v4` |
| Artifact consume | `DownloadPipelineArtifact@2` | `actions/download-artifact@v4` |
| Approvals | `Environments` > `Approvals and checks` | `Environments` > `Required reviewers` |
| Secrets | `Variable groups`, `Secure files` from `Library` | Repo or environment secrets, `${{ secrets.NAME }}` |

`Stages` is the part that does not translate cleanly. GitHub Actions has no stage primitive. You either chain `jobs` with `needs:` or split the workflow and wire it with `workflow_run:`. Azure Pipelines has stages as a first-class boundary, which is why the hybrid pattern below puts the release there.

## Step 2: Compare triggers, jobs, and environments side by side

Here is the same build (Python 3.12, pytest, publish a wheel) in both systems.

Azure Pipelines, `azure-pipelines.yml`:

```yaml
trigger:
  branches:
    include:
      - main
  paths:
    exclude:
      - docs/*

pr:
  branches:
    include:
      - main

pool:
  vmImage: ubuntu-24.04

stages:
  - stage: build
    displayName: Build and test
    jobs:
      - job: build_test
        steps:
          - task: UsePythonVersion@0
            inputs:
              versionSpec: '3.12'
          - script: |
              python -m pip install --upgrade pip
              pip install -e .[test]
              pytest --junitxml=test-results.xml
            displayName: Install and test
          - task: PublishTestResults@2
            condition: succeededOrFailed()
            inputs:
              testResultsFiles: 'test-results.xml'
          - script: python -m build --wheel
            displayName: Build wheel
          - task: PublishPipelineArtifact@1
            inputs:
              targetPath: dist
              artifact: wheel
```

GitHub Actions, `.github/workflows/build.yml`:

```yaml
name: build
on:
  push:
    branches: [main]
    paths-ignore: ['docs/**']
  pull_request:
    branches: [main]

jobs:
  build_test:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - name: Install and test
        run: |
          python -m pip install --upgrade pip
          pip install -e .[test]
          pytest --junitxml=test-results.xml
      - name: Publish test results
        if: always()
        uses: dorny/test-reporter@v1
        with:
          name: pytest
          path: test-results.xml
          reporter: java-junit
      - name: Build wheel
        run: python -m build --wheel
      - uses: actions/upload-artifact@v4
        with:
          name: wheel
          path: dist/
```

Two things to notice. First, `actions/checkout@v4` is explicit in Actions, where Azure Pipelines does the checkout implicitly. Second, `condition: succeededOrFailed()` and `if: always()` mean the same thing (run the step even when the previous step failed), but the syntax is not interchangeable.

### When Azure Pipelines still wins

- **Deep Azure Boards integration.** A pipeline run can update a `User Story` or `Bug` work item state and write the run ID into the work item activity feed. If your delivery org tracks DORA metrics off Boards, this is hard to replicate.
- **Agent-pool isolation.** Self-hosted `Agent pools` are scoped to a project or shared at the org level with explicit permissions. You can pin a stage to a pool inside a particular VNet, and the agent never appears in any other project. GitHub self-hosted runners can be group-scoped but the boundary model is looser.
- **Mature release model.** `Environments` with `Pre-deployment approvals`, `Post-deployment approvals`, `Pre-deployment gates`, and `Post-deployment gates` were built for exactly this. Gates can poll an Azure Monitor query, an Azure Function, or a ServiceNow change record, and block the stage until the check passes. The 48-hour cap on the delay before gates execute is documented and you should plan around it.
- **Variable groups linked to Azure Key Vault.** `Library` > `Variable groups` can link directly to a Key Vault and pull secrets at queue time. Audit trail lands in the Key Vault diagnostic logs.

### When GitHub Actions wins

- **Repo-native DX.** The workflow ships with the code. PR checks, required status checks, and branch protection all live in one settings page. New engineers find it in five minutes.
- **Marketplace breadth.** The `actions/*` and `azure/*` marketplaces are deeper for OSS tooling. `actions/cache@v4`, `docker/build-push-action@v6`, `aws-actions/configure-aws-credentials@v4` cover the common cases without a custom task.
- **OIDC to Azure with no stored secret.** `azure/login@v2` plus a federated credential gives you keyless auth in about ten minutes. Step 3 walks through it.
- **Cleaner reusable workflows.** `workflow_call` with typed `inputs:` and `secrets:` is friendlier than Azure Pipelines templates with `parameters:` once you get past simple cases.

## Step 3: Wire OIDC from GitHub Actions into Azure

This is the single most useful change you can make to a GitHub Actions setup that talks to Azure. We replace the `AZURE_CREDENTIALS` JSON blob (client secret) with a federated credential.

Step 3.1: Register the Entra application and capture the IDs.

```bash
az ad app create --display-name gh-oidc-contoso-prod
APP_ID=$(az ad app list --display-name gh-oidc-contoso-prod --query "[0].appId" -o tsv)
az ad sp create --id "$APP_ID"
SP_OBJECT_ID=$(az ad sp show --id "$APP_ID" --query id -o tsv)

SUBSCRIPTION_ID=$(az account show --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)

az role assignment create \
  --assignee-object-id "$SP_OBJECT_ID" \
  --assignee-principal-type ServicePrincipal \
  --role Contributor \
  --scope "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/rg-contoso-prod"
```

Step 3.2: Add the federated credential. The `subject` claim has to match exactly what GitHub will send. For a push to `main` it is `repo:OWNER/REPO:ref:refs/heads/main`. For a deploy to an Environment named `prod` it is `repo:OWNER/REPO:environment:prod`.

```bash
cat > federated-cred.json <<'EOF'
{
  "name": "gh-main",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:contoso/app:ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"]
}
EOF

az ad app federated-credential create \
  --id "$APP_ID" \
  --parameters federated-cred.json
```

Step 3.3: Store the three non-secret IDs as GitHub Actions secrets. `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`. They are technically not secrets (none of them is a credential), but storing them as `secrets` keeps them out of the run log.

Step 3.4: Use `azure/login@v2` in the workflow. The `permissions:` block at the job level is mandatory, the OIDC token issuer refuses to mint a token without `id-token: write`.

```yaml
name: deploy-dev
on:
  push:
    branches: [main]

permissions:
  id-token: write
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-24.04
    environment: dev
    steps:
      - uses: actions/checkout@v4
      - uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
      - name: Deploy bicep
        uses: azure/cli@v2
        with:
          azcliversion: latest
          inlineScript: |
            az deployment group create \
              --resource-group rg-contoso-prod \
              --template-file infra/main.bicep \
              --parameters env=dev
```

NOTE: The `subject` claim is the single most common failure mode. If you change the branch, add an environment, or move to a tag-based release, you need a second federated credential. One app can hold up to 20 of them.

## Step 4: Build a hybrid: Actions for build, Azure Pipelines for release approvals

This is the pattern I reach for when the team wants GitHub PR ergonomics but release engineering owns approvals in Azure DevOps. GitHub Actions runs on every PR and push to `main`, builds, tests, and publishes the artifact. Azure Pipelines has a release-only pipeline triggered by the artifact landing, running gated stages with `Environments` and `Approvals and checks`.

Step 4.1: Publish the build output to Azure Artifacts. Use a PAT scoped to `Packaging (read, write)` for now, then move to OIDC once Azure Artifacts OIDC GA lands in your tenant.

```yaml
  publish:
    needs: build_test
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: wheel
          path: dist/
      - name: Twine upload to Azure Artifacts
        env:
          TWINE_USERNAME: github-actions
          TWINE_PASSWORD: ${{ secrets.AZ_ARTIFACTS_PAT }}
        run: |
          pip install twine
          twine upload \
            --repository-url https://pkgs.dev.azure.com/contoso/_packaging/contoso-prod/pypi/upload/ \
            dist/*.whl
```

Step 4.2: In Azure DevOps, create a `Service connection` of type `Other Git` pointing at the GitHub repo, or use the `GitHub` service connection if you want PR comments. Then create the release pipeline. The trigger is a `resources.packages` reference, not a Git trigger.

```yaml
# azure-pipelines-release.yml
trigger: none

resources:
  packages:
    - package: contoso-app
      type: pypi
      connection: contoso-artifacts
      name: contoso-app
      version: '*'
      trigger: true

stages:
  - stage: deploy_staging
    displayName: Deploy to staging
    jobs:
      - deployment: staging
        environment: staging
        pool:
          vmImage: ubuntu-24.04
        strategy:
          runOnce:
            deploy:
              steps:
                - task: AzureCLI@2
                  inputs:
                    azureSubscription: sc-contoso-staging-wif
                    scriptType: bash
                    scriptLocation: inlineScript
                    inlineScript: |
                      az deployment group create \
                        --resource-group rg-contoso-staging \
                        --template-file $(Pipeline.Workspace)/infra/main.bicep \
                        --parameters env=staging

  - stage: deploy_prod
    displayName: Deploy to prod
    dependsOn: deploy_staging
    condition: succeeded()
    jobs:
      - deployment: prod
        environment: prod
        pool:
          vmImage: ubuntu-24.04
        strategy:
          runOnce:
            deploy:
              steps:
                - task: AzureCLI@2
                  inputs:
                    azureSubscription: sc-contoso-prod-wif
                    scriptType: bash
                    scriptLocation: inlineScript
                    inlineScript: |
                      az deployment group create \
                        --resource-group rg-contoso-prod \
                        --template-file $(Pipeline.Workspace)/infra/main.bicep \
                        --parameters env=prod
```

Step 4.3: Attach approvals. In the Azure DevOps UI, go to `Pipelines > Environments > prod > Approvals and checks > + > Approvals`, add the on-call group as required approvers, set the timeout to 24 hours, and turn on `Allow approvers to approve their own runs: false`. Do the same for `staging` if your compliance posture requires it.

Step 4.4: Service connections use Workload Identity Federation, not a secret. Navigate `Azure DevOps > Project settings > Service connections > New > Azure Resource Manager > Workload Identity federation (automatic)`. Azure DevOps creates the federated credential on the Entra app for you. The connection token is short-lived and rotated automatically.

NOTE: If you cannot use the automatic flow (some tenants block it), the manual flow is documented and uses `az ad app federated-credential create` with the Azure DevOps issuer URL. The `subject` claim for Azure DevOps is `sc://ORG/PROJECT/CONNECTION_NAME`.

## Troubleshooting

- **`AADSTS70021: No matching federated identity record found for presented assertion.`** The `subject` claim does not match. Decode the token GitHub sent with `jq` against the `ACTIONS_ID_TOKEN_REQUEST_URL` and compare to what is on the Entra app. Branch refs, environment names, and tags each need their own credential.
- **GitHub Actions step hangs at `azure/login@v2` with no output.** The job is missing `permissions: id-token: write`. The action cannot reach the token endpoint without it, and the default workflow permissions in newer GitHub orgs are read-only.
- **Azure Pipelines `resources.packages` trigger never fires.** Pipeline triggers off Azure Artifacts require the package to be pushed to a feed in the same org. Cross-org feeds work for consumption but not for triggers. If you need cross-org, use the `PipelineResource` trigger off a build pipeline instead.
- **Approval emails fire but the stage stays in `Pending`.** Check that the approver is in the project, not just the org. `Project settings > Permissions > Project Valid Users` is the gate. Org-level membership alone is not enough.
- **Self-hosted agent picks up a job that should have gone to a hosted runner.** `pool:` matches by `name`, and a `demands:` mismatch falls back silently. Add `demands: Agent.OS -equals Linux` if you mean it, and check the agent pool's `Agents` tab for the actual capability strings.

## Clean up

If you spun up a demo, remove the federated credential and role assignment first, then delete the app registration. Order matters: deleting the app does not always clean up the federated credential record in some tenants, and a stale credential pointing at a deleted app is a confusing audit finding.

```bash
az ad app federated-credential delete --id "$APP_ID" --federated-credential-id gh-main
az role assignment delete \
  --assignee "$APP_ID" \
  --role Contributor \
  --scope "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/rg-contoso-prod"
az ad app delete --id "$APP_ID"
```

The hybrid is not the answer for every team. If the release model is light (one environment, one approver, one Slack message) GitHub Actions environments do the job. If the release model is heavy (multi-region, ITIL change records, audit packs) Azure Pipelines is still the cleaner home. The middle is where most of us live, and the pattern above is what holds up once auditors start asking who approved what.
