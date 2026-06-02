# Multi-stage YAML pipelines in Azure DevOps: stages, jobs, deployments, environments, and approvals

Classic releases shipped a lot of software for a lot of teams, but the click-driven editor stopped scaling the day pipelines turned into product. Every approval rule, every variable scope, every retry policy lived in the UI and not in the repo, which meant the deployment process was effectively undocumented. Multi-stage YAML pipelines fix that. The whole thing, build through production cutover, sits in `azure-pipelines.yml` next to the code, gets reviewed in pull requests, and rolls back with `git revert`. This walkthrough is the pattern I use when I rebuild a classic release as a single YAML file, with one build stage, two deployment stages, an Azure DevOps `environment` per target, and manual approval before production.

### STEPS

1. Lay out the `stages`, `jobs`, and `steps` skeleton
2. Add a build stage that publishes a pipeline artifact
3. Create the `staging` and `production` environments in Azure DevOps
4. Add a `deployment` job that targets `staging` with `runOnce`
5. Add a `deployment` job that targets `production` with a canary or rolling strategy
6. Wire approvals on the production environment
7. Pass variables and outputs between stages

## Why this matters

The shape of a real release rarely fits one job. You build once, then deploy that exact artifact to several environments in order, with gates between them. Classic releases modelled this with separate Release Pipelines linked to Build Pipelines, which made traceability painful: the build that produced the artifact and the release that shipped it were two different objects with two different histories. YAML multi-stage pipelines collapse the model. A `stages:` list defines the boundaries, a `deployment` job inside each stage records history against an `environment`, and `dependsOn` plus `condition` expressions handle the topology (sequential, fan-out, fan-in, conditional). Resource owners attach checks to the environment, not the pipeline, so a single pipeline definition can deploy to dev with no approval and to prod behind a two-person sign-off without any branching logic in YAML.

The other reason to move: deployment strategies. `runOnce`, `rolling`, and `canary` are first-class keys inside the `strategy:` block on a `deployment` job, and each one exposes the same set of lifecycle hooks (`preDeploy`, `deploy`, `routeTraffic`, `postRouteTraffic`, and the `on: failure` / `on: success` rollback hooks). That means a staging deploy that worked yesterday can be promoted to canary tomorrow by swapping one keyword.

## Prerequisites

- An Azure DevOps project with **Pipelines** enabled and at least one Microsoft-hosted parallel job (free tier is fine for a single pipeline).
- A Git repo in the project with an `azure-pipelines.yml` file at the root.
- The **Creator** role on Environments. Members of **Build Administrators**, **Release Administrators**, or **Project Administrators** have this by default. Stakeholders do not.
- An Azure Resource Manager service connection if the deployment touches Azure resources. Create it under `Project settings > Service connections > New service connection > Azure Resource Manager`.
- Basic YAML literacy. If `key: value` and two-space indentation feels foreign, the [Create your first pipeline](https://learn.microsoft.com/en-us/azure/devops/pipelines/create-first-pipeline) walkthrough is the right starting point.

## Tools Used

- **Azure Pipelines:** the build and release plane. We use multi-stage YAML, one file, checked in.
- **Stages:** logical boundaries inside the pipeline. Each `stage` groups one or more jobs. A stage can hold up to 256 jobs.
- **Jobs:** the unit of execution. A `job` runs on an agent. A `deployment` job is a special job type that records history against an environment.
- **Steps:** the leaves. `script`, `bash`, `pwsh`, `task`, `checkout`, `download`, `template`. Steps run sequentially on the same agent.
- **Environments:** named deployment targets (`Dev`, `Staging`, `Production`). Environments hold resources (Kubernetes namespaces, virtual machines) and approvals.
- **Approvals and checks:** gates attached to an environment by the resource owner. They block any stage that consumes the environment until the check passes.

## Step 1: Lay out the stages, jobs, and steps skeleton

Stages run sequentially by default. The order is the order they appear in the YAML, with one exception: if you set `dependsOn: []` on a stage, it runs in parallel with whichever stage came before. A bare skeleton with three stages looks like this.

```yaml
trigger:
  branches:
    include:
      - main

stages:
  - stage: Build
    displayName: Build and test
    jobs:
      - job: BuildJob
        pool:
          vmImage: ubuntu-latest
        steps:
          - script: echo "build placeholder"

  - stage: DeployStaging
    displayName: Deploy to staging
    dependsOn: Build
    jobs:
      - job: Placeholder
        steps:
          - script: echo "staging placeholder"

  - stage: DeployProduction
    displayName: Deploy to production
    dependsOn: DeployStaging
    condition: and(succeeded(), eq(variables['Build.SourceBranch'], 'refs/heads/main'))
    jobs:
      - job: Placeholder
        steps:
          - script: echo "production placeholder"
```

Two things to notice. First, `dependsOn:` is explicit. Even though `Build` already comes first, naming it as the dependency means a future reorder of the file does not silently change the topology. Second, the production stage has both an implicit success requirement (because it depends on `DeployStaging`) and an explicit branch filter. If you customise the `condition:` you lose the default `succeeded()` check, so you have to put it back yourself. Hence the `and(succeeded(), ...)` pattern.

NOTE: `dependsOn: []` (the empty list) is the documented way to make a stage run in parallel with another. Omitting `dependsOn:` entirely makes the stage run sequentially after the previous one. The two are not the same.

## Step 2: Build once, publish an artifact, deploy that artifact

The build stage compiles, tests, and publishes. Downstream stages consume the published artifact rather than rebuilding. This is what gives you a single immutable thing to promote.

```yaml
- stage: Build
  displayName: Build and test
  jobs:
    - job: BuildJob
      pool:
        vmImage: ubuntu-latest
      variables:
        buildConfiguration: Release
      steps:
        - checkout: self
          fetchDepth: 1

        - task: UseDotNet@2
          displayName: Install .NET SDK
          inputs:
            packageType: sdk
            version: 8.0.x

        - script: dotnet restore
          displayName: Restore packages

        - script: dotnet build --configuration $(buildConfiguration) --no-restore
          displayName: Build

        - script: dotnet test --configuration $(buildConfiguration) --no-build --logger trx
          displayName: Run tests

        - task: PublishTestResults@2
          condition: succeededOrFailed()
          inputs:
            testResultsFormat: VSTest
            testResultsFiles: '**/*.trx'

        - script: dotnet publish src/Web/Web.csproj -c $(buildConfiguration) -o $(Build.ArtifactStagingDirectory)/web
          displayName: Publish web

        - task: PublishPipelineArtifact@1
          displayName: Publish pipeline artifact
          inputs:
            targetPath: $(Build.ArtifactStagingDirectory)/web
            artifact: web
            publishLocation: pipeline
```

`PublishTestResults@2` runs with `condition: succeededOrFailed()` so a failed test still surfaces in the run summary. `PublishPipelineArtifact@1` is the modern artifact task; the older `PublishBuildArtifacts@1` still works but writes to file shares and is slower. The deployment stages will pull this artifact down automatically because of how the `deploy` lifecycle hook is wired (more on that in Step 4).

## Step 3: Create environments in Azure DevOps

Environments are not declared in YAML. They live in Azure DevOps and are referenced by name from the pipeline. Create them up front so approvals are in place before the first run.

Navigate to `Azure DevOps > Project > Pipelines > Environments > Create environment`. Name the first one `staging`, leave the resource type as **None** for a plain environment (or pick **Kubernetes** / **Virtual machines** if you want to register specific resources), and click **Create**. Repeat for `production`.

NOTE: If a YAML pipeline references an environment that does not exist and the run is triggered through the web editor by an authenticated user, Azure Pipelines creates the environment automatically. If the reference is added through an external editor and triggered by CI, the pipeline fails with `Environment XXXX could not be found`. Create the environments manually to avoid the surprise.

## Step 4: Deploy to staging with runOnce

The staging stage uses a `deployment` job. The job names an `environment`, picks a `strategy`, and lists steps under the `deploy:` lifecycle hook.

```yaml
- stage: DeployStaging
  displayName: Deploy to staging
  dependsOn: Build
  variables:
    azureSubscription: sc-azure-nonprod
    appName: contoso-web-staging
    resourceGroup: rg-contoso-staging
  jobs:
    - deployment: DeployWeb
      displayName: Deploy web app
      pool:
        vmImage: ubuntu-latest
      environment: staging
      strategy:
        runOnce:
          deploy:
            steps:
              - download: current
                artifact: web
              - task: AzureWebApp@1
                displayName: Deploy to Azure Web App
                inputs:
                  azureSubscription: $(azureSubscription)
                  appType: webAppLinux
                  appName: $(appName)
                  package: $(Pipeline.Workspace)/web
          on:
            failure:
              steps:
                - script: echo "deployment failed, paging on-call"
            success:
              steps:
                - script: echo "deployment ok"
```

A few things worth calling out. A `deployment` job does not auto-clone the repo. If you need source code in the deployment steps, add `- checkout: self`. The `deploy` hook automatically downloads pipeline artifacts; you can disable that with `- download: none` or, as above, be explicit and pin to a single artifact name. The `on: failure` and `on: success` hooks run after the main hooks finish, exactly once for `runOnce`. They are the right place to put rollback scripts and notifications, not in the main `deploy` block where a failure would skip them.

## Step 5: Deploy to production with a strategy that matches reality

`runOnce` is fine for staging and small apps. Production usually wants either `rolling` (VM fleets) or `canary` (Kubernetes, with traffic shifting). Both expose the same lifecycle hooks: `preDeploy`, `deploy`, `routeTraffic`, `postRouteTraffic`, plus `on:`.

A canary deploy that goes 10 percent, then 20 percent, then 100 percent against an AKS environment looks like this:

```yaml
- stage: DeployProduction
  displayName: Deploy to production
  dependsOn: DeployStaging
  condition: and(succeeded(), eq(variables['Build.SourceBranch'], 'refs/heads/main'))
  jobs:
    - deployment: DeployWebProd
      displayName: Canary roll out to AKS
      pool:
        vmImage: ubuntu-latest
      environment: production.contoso-prod-ns
      strategy:
        canary:
          increments: [10, 20]
          preDeploy:
            steps:
              - script: echo "warming caches, pre-flight checks"
          deploy:
            steps:
              - download: current
                artifact: web
              - task: KubernetesManifest@1
                displayName: Deploy canary
                inputs:
                  action: $(strategy.action)
                  namespace: contoso-prod-ns
                  strategy: $(strategy.name)
                  percentage: $(strategy.increment)
                  manifests: $(Pipeline.Workspace)/web/manifests/*.yaml
          postRouteTraffic:
            pool: server
            steps:
              - script: echo "watching SLOs for 10 minutes"
          on:
            failure:
              steps:
                - task: KubernetesManifest@1
                  inputs:
                    action: reject
                    namespace: contoso-prod-ns
                    strategy: $(strategy.name)
                    manifests: $(Pipeline.Workspace)/web/manifests/*.yaml
            success:
              steps:
                - task: KubernetesManifest@1
                  inputs:
                    action: promote
                    namespace: contoso-prod-ns
                    strategy: $(strategy.name)
                    manifests: $(Pipeline.Workspace)/web/manifests/*.yaml
```

The `environment: production.contoso-prod-ns` syntax names the environment and a specific resource inside it (the Kubernetes namespace). Connection details flow into the `KubernetesManifest@1` task automatically because of that resource binding, so no service connection input is needed on the task itself. `$(strategy.action)`, `$(strategy.name)`, and `$(strategy.increment)` are runtime variables exposed by the canary strategy; they drive the `action` and `percentage` inputs of the task without you hardcoding values.

For a VM fleet, swap `canary` for `rolling` and set `maxParallel`:

```yaml
strategy:
  rolling:
    maxParallel: 25%
    deploy:
      steps:
        - download: current
          artifact: web
        - task: IISWebAppDeploymentOnMachineGroup@0
          displayName: Deploy to IIS
          inputs:
            WebSiteName: 'Default Web Site'
            Package: '$(Pipeline.Workspace)/web/**/*.zip'
```

`maxParallel` accepts a number or a percentage like `25%`. The strategy is currently only supported on VM resources.

## Step 6: Wire approvals on the production environment

Approvals are not a YAML keyword. They live on the environment.

Go to `Pipelines > Environments > production > More actions (...) > Approvals and checks > + > Approvals`. Add the approvers (a group is better than named users; group membership changes do not require touching the pipeline), set the timeout (default 30 days, I usually drop it to 7), and decide whether the requester can self-approve. Save.

The next run that hits `DeployProduction` pauses before the first job and waits for someone in the approver group to click **Approve**. Approvals stack with other checks (Branch control, Business hours, REST API gates) and all of them must pass for the stage to proceed. The approval lives on the environment, so two pipelines pointing at the same `production` environment share the same gate.

NOTE: A `deployment` job is what triggers the environment check. A plain `job` that references an environment with `environment:` will not invoke approvals. If approvals are silently being skipped, the most common cause is that someone refactored the production stage from `- deployment:` to `- job:`.

## Step 7: Pass variables between stages

Variables defined at the stage level are visible to all jobs in that stage. Variables defined at pipeline level are visible everywhere. Output variables from one stage to another use the `stageDependencies` syntax.

```yaml
stages:
  - stage: Build
    jobs:
      - job: SetVersion
        steps:
          - bash: echo "##vso[task.setvariable variable=imageTag;isOutput=true]1.4.$(Build.BuildId)"
            name: tagStep

  - stage: DeployStaging
    dependsOn: Build
    variables:
      imageTag: $[ stageDependencies.Build.SetVersion.outputs['tagStep.imageTag'] ]
    jobs:
      - deployment: Deploy
        environment: staging
        strategy:
          runOnce:
            deploy:
              steps:
                - script: echo "deploying image tag $(imageTag)"
```

The shape is `stageDependencies.<stage>.<job>.outputs['<step>.<var>']`. For variables produced inside a `deployment` job rather than a plain job, the step prefix is the resource name, like `Deploy_<resource>.<step>.<var>` for rolling or `deploy_<increment>.<step>.<var>` for canary.

## Troubleshooting

- **`Job is pending...` forever.** Two jobs in the same stage share a name, or a job name collides with a reserved keyword like `deployment`. Job names inside a stage must be unique. Rename, push, retry.
- **`Environment XXXX could not be found. The environment does not exist or has not been authorized for use.`** The environment was referenced from a YAML change made in an external editor (not the web editor), so Azure Pipelines refused to auto-create it. Create the environment manually in `Pipelines > Environments` and re-run.
- **Approvals get skipped on production.** The stage uses a plain `- job:` instead of `- deployment:`. Only deployment jobs trigger environment checks.
- **Custom `condition:` makes a stage run after a failure.** Customising `condition:` removes the default success check. Wrap your condition with `and(succeeded(), ...)` to restore it.
- **Output variable from stage A is empty in stage B.** Three things to check: `isOutput=true` is set on the `##vso[task.setvariable ...]` command, the producing step has a `name:`, and stage B has `dependsOn: A`. Without the dependency, `stageDependencies` is empty.
- **Rolling retry redeploys every VM, not just the failed ones.** Documented limitation. Retrying a rolling stage re-runs against the full target set.

## Clean up

Pipelines created during testing keep accumulating runs against the environment, which clutters deployment history. To tear down: disable the pipeline in `Pipelines > <pipeline> > More actions > Settings > Processing of new run requests > Disabled`, then delete the environments in `Pipelines > Environments > <env> > More actions > Delete`. Deleting an environment removes its deployment history and any attached approvals. Service connections used by the pipeline can be revoked from `Project settings > Service connections`.

If you got this far, the pipeline does what a classic release used to do, only versioned, reviewable, and revertable. The build stage produces one artifact. Staging gets it through `runOnce` with no gate. Production waits for human approval, then rolls it out by canary or rolling depending on the target. Variables flow between stages through `stageDependencies`. The next thing worth wiring up is templates: extract the deployment job into a `template:` file, parametrise the environment name, and call it twice from the main pipeline. That is how the same YAML scales from one app to twenty without copy-paste.
