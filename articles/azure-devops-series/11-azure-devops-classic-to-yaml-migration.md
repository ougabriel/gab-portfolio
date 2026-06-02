# Migrating Azure DevOps classic release pipelines to multi-stage YAML

Most teams I work with still have one or two classic release pipelines hanging around: the gold one that ships the payment service, or the one nobody dares touch because it has eleven environments and a Friday-night approval chain. The classic designer is not getting new features. The Releases hub is being wound down in favour of multi-stage YAML, and Microsoft Learn now ships the migration article as a `how-to`, not as a sales pitch. This is the playbook I use to take a classic release pipeline, stand a YAML equivalent next to it, parity-test for a release or two, then flip the switch.

### STEPS

1. Inventory the classic pipeline and its surface area
2. Stand up the YAML pipeline side by side
3. Translate stages, jobs, and the deployment block
4. Move variable groups, service connections, and secret files
5. Convert approval gates into environment checks
6. Handle deployment groups, matrices, and retention
7. Parity-test, cut over, archive the classic release

## Why this matters

The classic Releases hub is on the way out. Microsoft's own migration page is now blunt about it: classic release pipelines do not support a `Export to YAML` action the way classic build pipelines do, so every release pipeline needs a hand-rolled migration. The longer a release pipeline sits in classic, the more the team forgets which approver, which gate, and which `Deploy Azure App Service` task version actually matters. Multi-stage YAML puts the whole release plane next to the code, in a `azure-pipelines.yml` file, reviewed in the same PR as the application change. Audit trails get cleaner. Rollbacks get cheaper. Onboarding a new engineer stops requiring a screen-share tour of the classic designer.

There is also a practical reason: the YAML schema gets the new toys. Deployment strategies (`runOnce`, `rolling`, `canary`), `environment` checks, `extends` templates, and the `resources.pipelines` trigger model only live on the YAML side. Classic pipelines are frozen.

## Prerequisites

- An Azure DevOps organization and a project with at least one classic release pipeline you want to migrate.
- `Build Administrators` or `Project Administrators` membership, so you can create environments and service connections.
- A Git repo (Azure Repos Git or GitHub) where the `azure-pipelines.yml` file will live next to the application code.
- The Azure CLI with the `azure-devops` extension installed (`az extension add --name azure-devops`), used for scripted inventory and bulk variable group exports.
- Read access to the existing variable groups, secret files, and service connections that the classic release consumes.

## Tools Used

- **Azure Pipelines (multi-stage YAML):** the destination. One YAML file describes build, test, and every release stage, committed alongside the application code.
- **Azure DevOps Environments:** the YAML equivalent of a classic stage's deployment target. Holds checks (approvals, branch control, business hours, Invoke Azure Function, Invoke REST API, required template, exclusive lock) and records deployment history. Classic release stages do not use environments; YAML deployment jobs do.
- **Variable groups (Library):** the same library object you already use in classic releases. YAML pipelines reference them through `variables: - group: <name>`. No data migration required.
- **Service connections:** also reused as-is. The `AzureRM` connection that the classic `AzureWebApp` task points to is the same one the YAML `AzureWebApp@1` task points to.
- **Azure CLI with `azure-devops` extension:** `az pipelines`, `az pipelines variable-group`, `az devops service-endpoint`. Useful for scripting the parity audit.
- **Task Assistant:** the right-hand pane in the YAML editor that emits the correct `task: Name@version` block when you pick a task by name.

## Step 1: Inventory the classic pipeline and its surface area

Before writing any YAML, write down what the classic release actually does. Open the release definition, click through each stage, and capture seven things per stage: trigger condition (after-release, after-stage, manual), agent pool, the ordered task list with version numbers, the pre-deployment approvers, the pre-deployment gates, the variable scope, and the artifact source.

You can pull most of this through the API. The classic release definition is reachable at `https://dev.azure.com/{org}/{project}/_apis/release/definitions/{id}?api-version=7.1`. Save the JSON next to the new YAML file as `classic-release.snapshot.json`. It is your reference oracle when something looks wrong in parity testing.

NOTE: CLASSIC RELEASES DO NOT EXPORT TO YAML. The `Export to YAML` button on the three-dot menu only appears on classic *build* definitions. For releases, the JSON snapshot is the closest you get to a machine-readable starting point.

While you have the definition open, list every task and its version. The YAML side needs the exact same versions (or newer majors you have explicitly tested), written as `task: AzureWebApp@1`, `task: KubernetesManifest@1`, `task: AzureCLI@2`, and so on. Mismatched task versions are the most common silent regression after migration.

## Step 2: Stand up the YAML pipeline side by side

Do not delete or disable the classic release until parity is proven. The migration approach Microsoft Learn recommends, and the one I follow, is side-by-side: the classic release keeps shipping to production while the YAML version shadows it through non-production stages.

Create the file `azure-pipelines.yml` at the repo root with a minimal skeleton:

```yaml
name: $(Build.DefinitionName)_$(Date:yyyyMMdd)$(Rev:.r)

trigger:
  branches:
    include:
      - main
  paths:
    exclude:
      - docs/*
      - README.md

pr: none

variables:
  - group: app-shared-config
  - name: buildConfiguration
    value: Release

stages:
  - stage: Build
    displayName: Build and publish artifact
    jobs:
      - job: build
        pool:
          vmImage: ubuntu-latest
        steps:
          - checkout: self
            fetchDepth: 1
          - task: UseDotNet@2
            inputs:
              packageType: sdk
              version: 8.0.x
          - script: dotnet build --configuration $(buildConfiguration)
            displayName: dotnet build
          - script: dotnet test --configuration $(buildConfiguration) --no-build --logger trx
            displayName: dotnet test
          - task: PublishPipelineArtifact@1
            inputs:
              targetPath: $(Build.ArtifactStagingDirectory)
              artifactName: drop
```

Push the file, create the pipeline through `Pipelines > New pipeline > Existing Azure Pipelines YAML file`, and confirm the `Build` stage is green before you add a single deployment stage. A working build stage means artifact publishing already matches the classic release's source artifact.

## Step 3: Translate stages, jobs, and the deployment block

This is where the mapping concentrates. The translation rules are short:

- A classic *stage* becomes a YAML `stages.stage`.
- A classic *agent phase* becomes a `jobs.job`.
- A classic *deployment phase* becomes a `jobs.deployment` with an `environment` and a `strategy`.
- A classic *task* becomes a `steps.task`, identical name, identical major version.
- A classic *agentless phase* becomes a `jobs.job` with `pool: server`.

Add the first deployment stage right under the `Build` stage:

```yaml
  - stage: Deploy_Dev
    displayName: Deploy to Dev
    dependsOn: Build
    condition: succeeded()
    variables:
      - group: app-dev-secrets
    jobs:
      - deployment: deploy_dev
        displayName: deploy web app (dev)
        pool:
          vmImage: ubuntu-latest
        environment: app-dev
        strategy:
          runOnce:
            deploy:
              steps:
                - download: current
                  artifact: drop
                - task: AzureWebApp@1
                  inputs:
                    azureSubscription: sc-azure-dev
                    appName: app-dev-eun
                    package: $(Pipeline.Workspace)/drop/**/*.zip
                    deploymentMethod: zipDeploy
```

Three details matter here. First, `environment: app-dev` creates the environment if it does not already exist and the pipeline run has a known user identity, otherwise the run fails. Pre-create it through `Pipelines > Environments > Create environment` if your pipeline is triggered by an external editor. Second, `strategy: runOnce` is the YAML equivalent of a classic stage that runs all tasks once. Use `rolling` when the classic stage had `Deploy in parallel` against a deployment group, and `canary` when you want pre/post hooks (`preDeploy`, `routeTraffic`, `postRouteTraffic`, `on: failure`, `on: success`). Third, the `download: current` step replaces the implicit artifact download that classic releases did for you. YAML deployment jobs auto-download all pipeline artifacts, but pinning the artifact name is more honest about what the stage consumes.

Repeat the stage block for `Deploy_Test`, `Deploy_Prod`, each with its own `environment` and its own variable group scope.

## Step 4: Move variable groups, service connections, and secret files

You do not migrate these objects, you reuse them. A variable group `app-shared-config` defined in `Library` is referenced the same way from YAML:

```yaml
variables:
  - group: app-shared-config
  - group: app-prod-secrets
  - name: deployRegion
    value: northeurope
```

YAML variable scoping is the one place most classic teams trip. Classic releases let you set a variable on a stage through the UI, and the stage scope was automatic. In YAML, a variable defined at the root `variables:` is pipeline-scoped; a variable defined under `stages.stage.variables` is stage-scoped; a variable defined under `jobs.job.variables` is job-scoped. Secrets from a linked variable group are not exposed to script environments unless you map them explicitly:

```yaml
        - script: ./deploy.sh
          env:
            DB_PASSWORD: $(dbPassword)
```

NOTE: SECRETS FROM `variables.group` ARE NOT AUTO-MAPPED INTO `$env:` OR `${{ }}`. They have to be passed through the `env:` block on the step that needs them, or the script will see an empty string and silently deploy with no credentials.

Authorize each variable group and service connection for the new pipeline the first time it runs. The pipeline run will pause with a `This pipeline needs permission to access a resource` banner; click `Permit` once per resource.

## Step 5: Convert approval gates into environment checks

Classic pre-deployment approvals and gates do not have a one-to-one YAML keyword. They live on the environment object instead. Open `Pipelines > Environments > app-prod > Approvals and checks > +` and add the checks that match the classic stage's gate configuration.

The available check types map to classic concepts as follows. Approvals (classic pre-deployment approvers) become `Approval` checks. Branch control (classic artifact filter on branch) becomes `Branch control`. Business hours (classic schedule windows) becomes `Business hours`. Invoke Azure function and Invoke REST API are the YAML names of the classic `Invoke Azure function` and `Invoke REST API` gates. `Required template` is new in YAML and has no classic analogue; it forces the consuming pipeline to extend a specific template, which is the cleanest way to keep production-bound jobs honest. `Exclusive lock` prevents two pipeline runs from entering the same environment at once, replacing the classic `Deployment queue settings > Number of parallel deployments`.

A typical production environment ends up with three checks: an `Approval` with two named approvers, a `Branch control` restricting deployments to `refs/heads/main`, and an `Exclusive lock` set to `Sequential`. None of this lives in the YAML file; it lives on the environment, which is the YAML schema's deliberate separation of concerns.

## Step 6: Handle deployment groups, matrices, and retention

A few classic features need extra thought.

Deployment groups still exist and YAML can target them, but Microsoft now recommends modelling self-hosted VM targets as `environment` resources of type `virtualMachine`. The deployment job then looks like:

```yaml
      - deployment: deploy_onprem
        environment:
          name: app-prod
          resourceName: vm-prod-01
          resourceType: virtualMachine
        strategy:
          runOnce:
            deploy:
              steps:
                - script: ./install.sh
```

Multi-configuration phases (the classic `Multi-configuration` setting on an agent phase) become a YAML matrix strategy on a regular job:

```yaml
      - job: build_matrix
        strategy:
          matrix:
            linux:
              imageName: ubuntu-latest
              rid: linux-x64
            windows:
              imageName: windows-latest
              rid: win-x64
          maxParallel: 2
        pool:
          vmImage: $(imageName)
        steps:
          - script: dotnet publish -r $(rid) -c Release
```

NOTE: `matrix` IS ONLY AVAILABLE ON `jobs.job.strategy`, NOT ON `jobs.deployment.strategy`. Deployment jobs only accept `runOnce`, `rolling`, or `canary`. If you need a matrix of deployment targets, fan out with `jobs.deployment` repeated under a `${{ each }}` template expression.

Retention is the last cross-cutting concern. Classic releases had their own retention policy on each stage; YAML pipelines use project-level retention configured at `Project settings > Pipelines > Settings`. The defaults are `Days to keep runs: 30`, `Minimum runs to keep per branch: 3`. If a classic stage was set to keep production releases for 365 days, set the YAML pipeline's retention lease through the `Retention` tab on a specific run, or configure a longer project-level policy.

## Step 7: Parity-test, cut over, archive the classic release

Run the YAML pipeline against the dev environment for one full sprint while the classic release continues to ship to test and prod. Compare deployment outputs side by side: the artifact hash, the deployed file count, the resulting app version endpoint, and the timing of each task. When dev parity is clean, point the YAML pipeline at the test environment and disable the classic test stage. Repeat for prod.

When prod has run for one release through the YAML pipeline, open the classic release definition and click `Save as draft > Abandon`. Do not delete it. The classic release JSON is the only record of historical approvals and gate configuration; keep it for audit.

## Troubleshooting

- `Environment XXXX could not be found. The environment does not exist or has not been authorized for use.` The YAML run was triggered by an external editor (VS Code, a Git push from CLI), so Azure DevOps does not have a user identity to attach to environment creation. Pre-create the environment through the web UI before the first run, or trigger the first run from the web editor.
- Secret reads as empty string in a `script` step. The variable group is referenced with `- group: name` but the secret is not passed into the step's `env:` block. Map it explicitly: `env: { MY_SECRET: $(mySecret) }`.
- Task version drift. The classic release used `AzureWebApp@1` but the YAML editor's Task Assistant inserted `AzureWebAppV1@1` or `AzureRmWebAppDeployment@4`. Pin the exact task name and version from your inventory snapshot; do not let the assistant pick.
- Approval check applies to the wrong stage. Approval checks live on the environment, not on the stage. Two stages that target the same environment will both block on the same approval, which is sometimes wrong. Split into two environments (`app-prod-web`, `app-prod-api`) if you need independent approval flows.
- Cron schedule fires an hour off. YAML `schedules.cron` runs in UTC by default. Classic releases used the organization's local time zone. Convert your schedule to UTC or set the `displayName` to flag the time zone for the next engineer.

## Clean up

If a YAML migration goes sideways and you want to back out cleanly, disable the YAML pipeline through `Pipelines > <pipeline> > Settings > Processing of new run requests > Disabled`, re-enable the classic release stages through `Releases > <release> > Edit > Pre-deployment conditions`, and remove the `Pipeline permissions` entry on each environment so the YAML run cannot resume mid-flight. The variable groups and service connections stay; they were shared resources from day one.

To delete an unused environment after migration, go to `Pipelines > Environments > <name> > More actions > Delete`. The environment must have no pending checks and no in-flight runs.

That is the migration. The classic release sits archived as a JSON snapshot, the YAML pipeline ships every commit through Build, Dev, Test, Prod with the same approvers and the same variable groups it always had, and the next engineer who joins the team reads one `azure-pipelines.yml` instead of clicking through eleven stages in the classic designer. The win is not the YAML syntax, it is that the release process is now reviewed in a pull request like every other piece of code.
