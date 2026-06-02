# Quality gates in Azure DevOps pipelines: SonarQube, code coverage, security scans

Most teams hit the same wall around month three of running Azure Pipelines. YAML works, builds are green, deploys go out. Then a regression slips into production because no one was watching coverage trends, the SonarQube widget sat at 47 percent for weeks, and a `CVE-2024-XXXXX` shipped inside a base image nobody had rebuilt. The fix is not more dashboards. The fix is a quality-gate stage that fails the build when any signal goes red, plus a branch policy that refuses to merge a PR if that stage did not run clean.

Here is the build I shipped for a three-service .NET 8 + Node monorepo: Sonar setup, the `PublishCodeCoverageResults@2` wiring, the Trivy container scan, the dependency check, environment approvals on top. Versions and YAML keys are pulled from Microsoft Learn so the snippets paste in clean.

### STEPS

- Step 1: Define a `quality_gates` stage in the pipeline
- Step 2: Wire SonarQube (or SonarCloud) analysis
- Step 3: Publish coverage with `PublishCodeCoverageResults@2` and fail on threshold breach
- Step 4: Add Trivy container image scanning in YAML
- Step 5: Add dependency scanning (OWASP Dependency-Check or `dotnet list package --vulnerable`)
- Step 6: Fail the pipeline on regression
- Step 7: Tie required gates to branch policies and environment checks

## Why this matters

A quality gate turns subjective judgments about code into deterministic pass/fail rules. Without it, "we have SonarQube" means "we have a website nobody visits". With it, the YAML run is the contract: green means coverage held, no new bugs of severity major or higher, no critical CVEs in the image, no high-severity vulnerable transitive dependencies. Red means the merge is blocked at the branch policy layer. Reviewers never argue about whether coverage dropped because the gate already said so.

The Azure Pipelines pieces that make this work are documented behavior, not tricks. Microsoft Learn says `PublishCodeCoverageResults@2` merges multiple summary files, supports Cobertura and JaCoCo, and runs on agent version `2.144.0` or greater. The approvals doc names five categories of checks (static, pre-check approvals, dynamic, post-check approvals, exclusive lock) in execution order. Branch control is a static check. Everything here sits inside that contract.

## Prerequisites

- `Azure DevOps` organization with a project, an Azure Repos Git repo (or GitHub connected via service connection), and an `Azure Pipelines` parallel job available.
- `SonarQube` server reachable from the agent, or a `SonarCloud` organization. Token stored as a pipeline secret.
- Self-hosted or Microsoft-hosted agent. The hosted `ubuntu-latest` image is fine for everything below.
- `Microsoft DevLabs` Sonar extension installed from the Marketplace (`SonarQube` or `SonarCloud` extension, depending on which you run).
- An `Environment` configured under `Pipelines > Environments`. We will attach approvals and checks to it.

## Tools Used

**Azure Pipelines:** the YAML build + release plane. Multi-stage pipeline, runs jobs on agents, evaluates checks before each stage.

**SonarQube / SonarCloud:** static analysis. Computes bugs, code smells, security hotspots, duplication, and a coverage figure imported from your test runner. Owns the Quality Gate verdict.

**PublishCodeCoverageResults@2:** the v2 publish task. Takes a Cobertura or JaCoCo summary file, generates a `cjson` and an HTML report, and renders the `Code Coverage` tab on the run summary.

**Trivy:** open-source vulnerability scanner from Aqua. Scans container images, file systems, and IaC. Outputs `table`, `json`, or `sarif`. Exits non-zero on findings when you ask it to.

**OWASP Dependency-Check:** scans project dependencies against the NVD. Available as a community Azure DevOps extension and as a CLI.

**Branch policies:** repo-level rules in Azure Repos. Require a build to pass, require reviewers, require linked work items. The "Build validation" policy is the hook that calls our pipeline on every PR.

**Approvals and checks:** environment-level gates. Manual approval, branch control, business hours, evaluate artifact, exclusive lock, invoke Azure Function, invoke REST API, query Azure Monitor alerts, required template, ServiceNow Change Management.

## Step 1: Define a `quality_gates` stage

Start with a clean multi-stage skeleton. The `build` stage compiles and runs unit tests with coverage. The `quality_gates` stage depends on `build`, downloads the test artifacts, and runs Sonar plus the scanners. The `deploy_dev` stage depends on `quality_gates` succeeding.

```yaml
trigger:
  branches:
    include:
      - main
      - feature/*

pr:
  branches:
    include:
      - main

variables:
  buildConfiguration: Release
  vmImageName: ubuntu-latest

stages:
  - stage: build
    displayName: Build and test
    jobs:
      - job: build_job
        pool:
          vmImage: $(vmImageName)
        steps:
          - checkout: self
            fetchDepth: 0  # full history required for Sonar blame data

  - stage: quality_gates
    displayName: Quality gates
    dependsOn: build
    condition: succeeded()
    jobs:
      - job: gates_job
        pool:
          vmImage: $(vmImageName)
        steps: []

  - stage: deploy_dev
    displayName: Deploy to dev
    dependsOn: quality_gates
    condition: succeeded()
    jobs:
      - deployment: deploy_dev_job
        environment: dev
        pool:
          vmImage: $(vmImageName)
        strategy:
          runOnce:
            deploy:
              steps:
                - script: echo "deploying"
```

NOTE: `fetchDepth: 0` matters for Sonar. Shallow clones break blame attribution, which is how Sonar decides what is "new code" for the `Clean as You Code` gate. Without full history, every line looks new.

## Step 2: Wire SonarQube analysis

The Sonar tasks come in a trio: `SonarQubePrepare`, the actual build step, then `SonarQubeAnalyze` and `SonarQubePublish`. The Publish task pulls the Quality Gate status back into the pipeline. Replace `SonarQube` with `SonarCloud` in the task names if you run the cloud variant.

Inside `build_job`, after `checkout`:

```yaml
          - task: SonarQubePrepare@7
            displayName: Sonar prepare
            inputs:
              SonarQube: 'sonarqube-prod'  # service connection name
              scannerMode: 'dotnet'
              projectKey: 'gab.payments'
              projectName: 'gab.payments'
              extraProperties: |
                sonar.exclusions=**/migrations/**,**/*.generated.cs
                sonar.cs.opencover.reportsPaths=$(Agent.TempDirectory)/**/coverage.opencover.xml
                sonar.coverage.exclusions=**/Program.cs,**/Startup.cs

          - task: DotNetCoreCLI@2
            displayName: Restore
            inputs:
              command: restore
              projects: '**/*.csproj'

          - task: DotNetCoreCLI@2
            displayName: Build
            inputs:
              command: build
              projects: '**/*.csproj'
              arguments: '--configuration $(buildConfiguration) --no-restore'

          - task: DotNetCoreCLI@2
            displayName: Test with coverage
            inputs:
              command: test
              projects: '**/*Tests/*.csproj'
              arguments: >
                --configuration $(buildConfiguration)
                --no-build
                --collect:"XPlat Code Coverage"
                --
                DataCollector.SettingsFile=$(Build.SourcesDirectory)/coverlet.runsettings
              publishTestResults: true

          - task: SonarQubeAnalyze@7
            displayName: Sonar analyze

          - task: SonarQubePublish@7
            displayName: Sonar publish
            inputs:
              pollingTimeoutSec: '300'
```

The `coverlet.runsettings` file should ask for `opencover` format alongside Cobertura. Sonar reads OpenCover via `sonar.cs.opencover.reportsPaths`. The Cobertura output goes to `PublishCodeCoverageResults@2` in the next step.

```xml
<RunSettings>
  <DataCollectionRunSettings>
    <DataCollectors>
      <DataCollector friendlyName="XPlat code coverage">
        <Configuration>
          <Format>opencover,cobertura</Format>
          <Exclude>[xunit*]*,[*Tests]*</Exclude>
        </Configuration>
      </DataCollector>
    </DataCollectors>
  </DataCollectionRunSettings>
</RunSettings>
```

## Step 3: Publish coverage with `PublishCodeCoverageResults@2`

`dotnet test` drops a `coverage.cobertura.xml` per test project under `$(Agent.TempDirectory)`. The v2 task globs them, merges them, and renders the `Code Coverage` tab. The schema is short:

```yaml
          - task: PublishCodeCoverageResults@2
            displayName: Publish coverage
            inputs:
              summaryFileLocation: '$(Agent.TempDirectory)/**/coverage.cobertura.xml'
              pathToSources: '$(Build.SourcesDirectory)'
              failIfCoverageEmpty: true
```

Three keys, all from the Learn reference. `summaryFileLocation` accepts minimatch patterns. `pathToSources` is required when the XML uses relative paths (JaCoCo always does; Cobertura sometimes does). `failIfCoverageEmpty` flips the task to red if the glob returns nothing, which catches the silent failure where someone deletes the test project and the pipeline still passes.

NOTE: The Learn page explicitly says the `Visual Studio Test`, `.NET Core`, `Ant`, `Maven`, `Gulp`, and `Grunt` tasks already publish coverage themselves. If you are using `DotNetCoreCLI@2` with `publishTestResults: true` and you also drop in `PublishCodeCoverageResults@2`, the v2 task wins on the UI tab. Pick one path. I run the explicit publish because it is the same shape across .NET, Node, and Python projects.

To enforce a threshold, Sonar is the right place, not the publish task. Configure a Quality Gate in Sonar with conditions like `Coverage on New Code is less than 80%` and `Coverage on Overall Code is less than 70%`. The `SonarQubePublish@7` task fails the job when the gate is `ERROR`. If you want the threshold check inside the pipeline itself (so it works without Sonar), use ReportGenerator and a small script:

```yaml
          - task: reportgenerator@5
            displayName: Merge coverage reports
            inputs:
              reports: '$(Agent.TempDirectory)/**/coverage.cobertura.xml'
              targetdir: '$(Build.SourcesDirectory)/coverage-report'
              reporttypes: 'HtmlInline;Cobertura;TextSummary'

          - script: |
              COVERAGE=$(grep -oP 'line-rate="\K[^"]+' coverage-report/Cobertura.xml | head -n1)
              PCT=$(awk "BEGIN {print $COVERAGE * 100}")
              echo "Line coverage: $PCT%"
              awk "BEGIN {exit !($PCT >= 75)}" || { echo "Coverage $PCT% below 75% floor"; exit 1; }
            displayName: Enforce 75 percent floor
            workingDirectory: $(Build.SourcesDirectory)
```

## Step 4: Trivy container image scanning

If the pipeline builds a Docker image, scan it before pushing. Trivy is the cheapest path because it runs as a single binary and supports SARIF, which the `CodeQL/Advanced Security` UI can render if you have GHAS for Azure DevOps. Add a Trivy install step, build the image, then scan.

```yaml
          - script: |
              sudo apt-get install -y wget
              TRIVY_VERSION=0.58.1
              wget https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-64bit.deb
              sudo dpkg -i trivy_${TRIVY_VERSION}_Linux-64bit.deb
              trivy --version
            displayName: Install Trivy

          - task: Docker@2
            displayName: Build image
            inputs:
              command: build
              repository: gab/payments-api
              tags: |
                $(Build.BuildId)
              dockerfile: '**/Dockerfile'

          - script: |
              trivy image \
                --severity HIGH,CRITICAL \
                --ignore-unfixed \
                --exit-code 1 \
                --format sarif \
                --output trivy-results.sarif \
                gab/payments-api:$(Build.BuildId)
            displayName: Trivy scan (fail on HIGH/CRITICAL)

          - task: PublishBuildArtifacts@1
            displayName: Publish Trivy SARIF
            condition: always()
            inputs:
              pathToPublish: trivy-results.sarif
              artifactName: trivy-sarif
```

`--ignore-unfixed` keeps the gate honest: there is no point failing on a CVE for which no upstream fix exists yet. `--exit-code 1` is the line that makes Trivy fail the task. Without it, you publish a report nobody reads.

NOTE: `condition: always()` on the publish step matters. If Trivy fails the previous step, the default `succeeded()` would skip the artifact publish and you would lose the SARIF for triage.

## Step 5: Dependency scanning

For .NET, the built-in `dotnet list package --vulnerable` is the fastest signal. For Node, `npm audit --audit-level=high` plays the same role. Both exit non-zero on findings, which is what we want.

```yaml
          - script: |
              dotnet list ./src package --vulnerable --include-transitive 2>&1 | tee deps.txt
              if grep -E '>= (High|Critical)' deps.txt; then
                echo "Vulnerable transitive dependencies detected"
                exit 1
              fi
            displayName: .NET dependency scan
```

For broader cross-stack coverage, run OWASP Dependency-Check. It is a long-running scanner (NVD download dominates the runtime), so cache the NVD data directory between runs.

```yaml
          - task: Cache@2
            inputs:
              key: 'odc-nvd | "$(Agent.OS)"'
              path: $(Pipeline.Workspace)/odc-data
            displayName: Cache NVD database

          - task: dependency-check-build-task@6
            displayName: OWASP Dependency-Check
            inputs:
              projectName: 'gab-payments'
              scanPath: '$(Build.SourcesDirectory)'
              format: 'HTML,JUNIT,SARIF'
              failOnCVSS: '7'
              dataDirectory: '$(Pipeline.Workspace)/odc-data'

          - task: PublishTestResults@2
            condition: succeededOrFailed()
            inputs:
              testResultsFormat: JUnit
              testResultsFiles: '**/dependency-check-junit.xml'
              testRunTitle: OWASP Dependency-Check
```

`failOnCVSS: 7` maps to CVSS High and above. Findings show up under the `Tests` tab because of the JUnit publish, which is a nice trick: every CVE becomes a test failure with a name, a severity, and a link.

## Step 6: Fail the pipeline on regression

Each gate above already fails its own step. The stage rolls up: if any required step fails, the `quality_gates` stage is red, and `deploy_dev` is skipped because of `condition: succeeded()`. That is the contract.

Two refinements worth knowing. First, mark non-blocking scans with `continueOnError: true` and surface them as warnings, not failures. Useful for a new scanner during its grace period. Second, use `Test Impact Analysis` (TIA) on the `VSTest@2` task when your test suite gets long. The Learn page on TIA is explicit: it works only with `Version 2.*` of `Visual Studio Test`, it falls back to running all tests for unknown file types, and it does not support `.NET Core`, data-driven tests, or UWP. For .NET Framework with VSTest, enabling it is one input:

```yaml
          - task: VSTest@2
            inputs:
              testSelector: testAssemblies
              testAssemblyVer2: '**\*Tests.dll'
              runOnlyImpactedTests: true
              runAllTestsAfterXBuilds: 50
```

`runAllTestsAfterXBuilds: 50` is the configurable override the doc recommends: every fiftieth build runs the full suite as a sanity baseline.

## Step 7: Tie gates to branch policies and environment checks

The pipeline gate is half the story. The other half is the branch policy that refuses to merge if the pipeline did not run.

In Azure Repos, go to `Project settings > Repositories > [your repo] > Policies > Branch Policies > main`. Enable:

1. `Build validation`: pick the `quality_gates` pipeline, set `Policy requirement` to `Required`, set `Build expiration` to `12 hours`. Now every PR to `main` runs the pipeline, including the gate stage, before merge is allowed.
2. `Minimum number of reviewers`: 1, with `Reset code reviewer votes when there are new changes` ticked.
3. `Check for linked work items`: required.

For the deploy stages, the Microsoft Learn approvals doc lists the checks you attach at the environment level under `Pipelines > Environments > [env] > Approvals and checks`. The ones I use for `prod`:

- `Approvals`: two named approvers, "approvers can approve own runs" disabled, `Timeout` set to 24 hours. If the approval is not given inside the window, the stage is marked skipped (per the doc).
- `Branch control`: allowed branches `refs/heads/main`, "Ensure protection of the branch" enabled. Microsoft Learn notes that branch names must be fully qualified as `refs/heads/<branch>`.
- `Business hours`: 09:00-18:00 weekdays in `Europe/London`. Avoids 2am deploys.
- `Evaluate artifact`: a Rego policy that rejects container images without an SBOM annotation. The doc states this check currently supports container image artifacts only.

These are static-and-dynamic checks per the doc's execution order: static (branch control) runs first, then pre-check approvals, then dynamic (approval, business hours, invoke checks). If any decision is terminally negative, the stage is not executed.

## Troubleshooting

- **Sonar reports 0 percent coverage even though tests ran.** The `sonar.cs.opencover.reportsPaths` glob did not find a file. Confirm `coverlet.runsettings` requested `opencover` format (not just `cobertura`) and that the path uses `$(Agent.TempDirectory)`, not `$(Build.SourcesDirectory)`. The collector writes under a GUID-named subfolder; the `**` in the glob has to be there.
- **`PublishCodeCoverageResults@2` task succeeds but the Code Coverage tab is empty.** The Learn `Known issues` section says this is almost always an invalid input XML. Open the cobertura file and check the root element is `<coverage>` with a `line-rate` attribute. If your tool emitted a wrapper element, the v2 task silently produces an empty `cjson`.
- **Trivy exits 0 even when CVEs are listed.** You forgot `--exit-code 1`. The default is 0 regardless of findings. Also check `--severity`: if you scan for `CRITICAL` only but the new finding is `HIGH`, it will not trigger.
- **Branch control check fails with "branch is not in allowed list" on a branch that clearly is allowed.** The check requires fully qualified names. `main` is rejected; `refs/heads/main` is accepted. The doc calls this out explicitly.
- **Environment approval never appears in the UI.** The Learn FAQ answer is that stage conditions have to be satisfied first. If your stage has `condition: and(succeeded(), eq(variables['Build.SourceBranch'], 'refs/heads/main'))` and the branch is `feature/x`, the stage is skipped and the approval never fires.

## Clean up

If you spun up a test project to validate the gate, delete the service connection (`Project settings > Service connections`), revoke the Sonar token in `SonarQube > My Account > Security`, and uninstall the OWASP Dependency-Check extension from the org if no other project uses it. Environments are cheap to leave, but delete the `dev` and `prod` environments under `Pipelines > Environments` if the project is gone, otherwise you accumulate stale approval policies.

That is the build. The next time someone opens a PR, the pipeline runs the same `quality_gates` stage that production runs against, branch policy refuses the merge until it goes green, and the reviewer gets to look at the code instead of relitigating whether the coverage drop matters. The gate decided.
