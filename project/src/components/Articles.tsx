import React from 'react'

type Article = {
  folio: string
  date: string
  topic: string
  read: string
  title: string
  summary: string
  href: string
}

const articles: Article[] = [
  {
    folio: 'No. 26',
    date: '2026-06-02',
    topic: 'Azure DevOps',
    read: '15 MIN',
    title: 'Azure Pipelines vs GitHub Actions: how to choose, and how to bridge them',
    summary:
      'When Azure Pipelines still wins (deep boards integration, agent-pool isolation, strong release/approval model). When GitHub Actions wins (repo-native, marketplace, cleaner DX). Side-by-side on triggers, secrets, OIDC, artifacts. A hybrid pattern for orgs that want both.',
    href: 'https://ougabriel.medium.com/39e91328ba84',
  },
  {
    folio: 'No. 25',
    date: '2026-06-02',
    topic: 'Azure DevOps',
    read: '14 MIN',
    title: 'Migrating Azure DevOps classic release pipelines to multi-stage YAML',
    summary:
      'Mapping classic concepts to YAML: stages, environments, approval gates, variable groups. Phased migration: stand up YAML side-by-side, parity-test, cut over. Gotchas around variable scoping, deployment groups, and retention. A real migrated example.',
    href: 'https://ougabriel.medium.com/f990b62b6aae',
  },
  {
    folio: 'No. 24',
    date: '2026-06-02',
    topic: 'Azure DevOps · Observability',
    read: '15 MIN',
    title: 'Pipeline observability: log analytics for Azure DevOps + Azure Monitor for the apps you ship',
    summary:
      'Two observability layers: pipeline-side (streaming logs, failed-run analytics) and app-side (Azure Monitor + Container Insights for AKS workloads). Application Insights for code traces. Alert rules that fire on failed deployments.',
    href: 'https://ougabriel.medium.com/f489a54475a2',
  },
  {
    folio: 'No. 23',
    date: '2026-06-02',
    topic: 'GitOps · AKS',
    read: '14 MIN',
    title: 'GitOps on AKS with Argo CD and Flux: when to pick which, and how to wire either to Azure DevOps',
    summary:
      'GitOps loop, repo split, Argo CD install on AKS or via the Azure Arc Flux extension. App-of-apps pattern. Tying Azure Pipelines to GitOps so pipelines update manifest repo and the controller deploys. Argo vs Flux comparison.',
    href: 'https://ougabriel.medium.com/6501561dac18',
  },
  {
    folio: 'No. 22',
    date: '2026-06-02',
    topic: 'Container CI/CD · AKS',
    read: '13 MIN',
    title: 'Container CI/CD from Azure DevOps to ACR and AKS',
    summary:
      'Docker@2 build, push to ACR via service connection, Trivy scan before push, deploy to AKS via KubernetesManifest@1 or Helm. Managed-identity pull from ACR. Rollback strategy with the deployment task.',
    href: 'https://ougabriel.medium.com/58b3ed496f70',
  },
  {
    folio: 'No. 21',
    date: '2026-06-02',
    topic: 'Azure DevOps · Security',
    read: '13 MIN',
    title: 'Secret management for Azure DevOps pipelines with Key Vault and variable groups',
    summary:
      'Three options ranked: pipeline secret variables (last resort), variable groups linked to Key Vault, Key Vault tasks reading at run time. Key Vault access policies, masking, audit, rotation strategy.',
    href: 'https://ougabriel.medium.com/0756b952c3ad',
  },
  {
    folio: 'No. 20',
    date: '2026-06-02',
    topic: 'Azure DevOps · Quality',
    read: '16 MIN',
    title: 'Quality gates in Azure DevOps pipelines: SonarQube, code coverage, security scans',
    summary:
      'Static analysis with SonarQube/SonarCloud, code coverage publishing with thresholds, container image scanning with Trivy, dependency scans. Failing the pipeline on regressions. Branch policies tied to required gates.',
    href: 'https://ougabriel.medium.com/ed976d0cefdb',
  },
  {
    folio: 'No. 19',
    date: '2026-06-02',
    topic: 'Azure DevOps · Agents',
    read: '12 MIN',
    title: 'Azure DevOps agent pools: Microsoft-hosted vs self-hosted, scaling, isolation, Linux vs Windows',
    summary:
      'Microsoft-hosted cost and image catalogue. When self-hosted is needed (private network, GPU, custom toolchain). Setup of a self-hosted Linux agent on an Azure VM, capabilities + demands, security, scaling, parallel-jobs licensing.',
    href: 'https://ougabriel.medium.com/d36d4c902311',
  },
  {
    folio: 'No. 18',
    date: '2026-06-02',
    topic: 'Terraform · Azure',
    read: '14 MIN',
    title: 'Terraform on Azure DevOps with OIDC auth and remote state in a storage account',
    summary:
      'azurerm backend (storage account + container, blob-lease state-locking). OIDC auth via the Azure DevOps service connection, no SP secret. Pipeline: init / validate / plan as artifact / apply behind approval. Workspaces and drift handling.',
    href: 'https://ougabriel.medium.com/1beaee2d5f79',
  },
  {
    folio: 'No. 17',
    date: '2026-06-02',
    topic: 'Bicep · Azure',
    read: '13 MIN',
    title: 'Bicep CI/CD on Azure DevOps with what-if and approvals',
    summary:
      'Bicep file layout, lint in CI, what-if as the safety gate, YAML pipeline shape: lint > what-if > deploy with manual approval. Tagging and naming conventions. State considerations vs Terraform (none, ARM is the state).',
    href: 'https://ougabriel.medium.com/2fc1345a8ee8',
  },
  {
    folio: 'No. 16',
    date: '2026-06-02',
    topic: 'Azure DevOps · Identity',
    read: '14 MIN',
    title: 'Secretless deployments from Azure DevOps with Workload Identity Federation',
    summary:
      'Problem with long-lived SP secrets. WIF concept (federated credentials, OIDC exchange, trust scope). Set up an Azure RM service connection with WIF. Pipeline YAML with AzureCLI@2. Common pitfalls (subscription scope, federated subject mismatch).',
    href: 'https://ougabriel.medium.com/1dfbcf8cb9bf',
  },
  {
    folio: 'No. 15',
    date: '2026-06-02',
    topic: 'Azure DevOps · YAML',
    read: '14 MIN',
    title: 'Multi-stage YAML pipelines in Azure DevOps: stages, jobs, deployments, environments, and approvals',
    summary:
      'Stage / job / step model. Deployment jobs and strategies (runOnce, rolling, canary). Environments + approvals. dependsOn and conditional stages. Variables across stages. A real two-stage build-then-deploy YAML.',
    href: 'https://ougabriel.medium.com/57ccf68812c9',
  },
  {
    folio: 'No. 14',
    date: '2026-05-31',
    topic: 'MLOps / Platform',
    read: '12 MIN',
    title: 'An End-to-End MLOps Demo Repo, Terraform AKS, GitHub Actions, MLflow, KServe, and Drift Monitoring in One make up',
    summary:
      'Capstone of the MLOps series. Terraform provisions AKS, ACR, Postgres, Blob. Bootstrap installs MLflow, KServe, kube-prometheus-stack, ArgoCD. GitHub Actions trains and scans. KServe canaries. Drift sidecar pages. One make up brings it all up.',
    href: 'https://ougabriel.medium.com/95b435ab24f3',
  },
  {
    folio: 'No. 13',
    date: '2026-05-31',
    topic: 'MLOps / Observability',
    read: '14 MIN',
    title: 'Detecting Model Drift in Production, Evidently AI, Prometheus, Grafana, and AlertManager',
    summary:
      'Wrap a deployed ML model with a sidecar that computes Evidently drift metrics, scrape them with kube-prometheus-stack, visualise in Grafana, and page on sustained drift via AlertManager.',
    href: 'https://ougabriel.medium.com/448329ff6cb8',
  },
  {
    folio: 'No. 12',
    date: '2026-05-31',
    topic: 'KServe / AKS',
    read: '13 MIN',
    title: 'KServe on AKS, Canary Rollouts and Traffic Splitting for Model Versions',
    summary:
      'Install KServe on AKS, deploy a model as an InferenceService, roll out a new version at 10/50/100 percent using canaryTrafficPercent, and revert in a single kubectl patch when the canary misbehaves.',
    href: 'https://ougabriel.medium.com/90744ed5c214',
  },
  {
    folio: 'No. 11',
    date: '2026-05-31',
    topic: 'CI/CD / MLOps',
    read: '16 MIN',
    title: 'A GitHub Actions Pipeline for ML Model CI/CD, DVC, MLflow, Trivy, Bandit, and ArgoCD',
    summary:
      'End-to-end ML CI/CD on GitHub Actions. DVC for data versioning, MLflow registry for models, Bandit + Trivy as security gates, ArgoCD for the rollout. Repo split into model code and GitOps manifests.',
    href: 'https://ougabriel.medium.com/624cceaf4396',
  },
  {
    folio: 'No. 10',
    date: '2026-05-31',
    topic: 'MLflow / Azure',
    read: '14 MIN',
    title: 'MLflow + Azure ML Model Registry on AKS, With Promotion Gates in Azure DevOps',
    summary:
      'Stand up a self-hosted MLflow tracking + model registry on AKS, point it at Postgres and Blob, then promote Staging to Production through an Azure DevOps pipeline with a human approval gate.',
    href: 'https://ougabriel.medium.com/5fe064afdee1',
  },
  {
    folio: 'No. 09',
    date: '2026-05-31',
    topic: 'LLM / AKS',
    read: '12 MIN',
    title: 'Containerised LLM Inference on AKS, OLLAMA, Multi-stage Docker, and an HPA Tuned for Cold-Start',
    summary:
      'Take the OLLAMA + DeepSeek setup from the earlier post and turn it into a proper inference service on AKS. Multi-stage Docker, ClusterIP and Ingress, plus an HPA tuned so the first request after a quiet period does not time out.',
    href: 'https://ougabriel.medium.com/09a9912ed209',
  },
  {
    folio: 'No. 08',
    date: '2025-01-29',
    topic: 'AI / Azure',
    read: '12 MIN',
    title: "Deploy 'DeepSeek AI' using OLLAMA API on an Azure Windows Server",
    summary:
      'Stand up an OLLAMA-backed DeepSeek model on a Windows Server VM in Azure. Covers VM sizing, port and firewall config, model pull, and a curl-driven smoke test.',
    href: 'https://ougabriel.medium.com/deploy-deepseek-ai-using-ollama-api-on-your-azure-windows-server-6008d3d6d532',
  },
  {
    folio: 'No. 07',
    date: '2024-11-04',
    topic: 'CI/CD · EKS',
    read: '14 MIN',
    title: 'Deploy a Python app with /healthcheck on AWS EKS using Terraform & GitHub Actions',
    summary:
      'End-to-end EKS pipeline: Terraform-managed cluster, GitHub Actions build/scan/push to ECR, Helm-style manifests, and a /healthcheck endpoint wired to readiness probes.',
    href: 'https://ougabriel.medium.com/ci-cd-pipeline-deploy-python-app-with-healthcheck-on-aws-eks-using-terraform-github-actions-cb9db07d93a1',
  },
  {
    folio: 'No. 06',
    date: '2024-11-03',
    topic: 'Docker · K8s',
    read: '10 MIN',
    title: 'Deploy a Python app with /healthcheck on Docker, ECR, and Kubernetes',
    summary:
      'Multi-stage Dockerfile, Trivy and SonarQube gates, Pytest in CI, and a kubectl apply path that lands the healthcheck-instrumented service into a Kubernetes cluster.',
    href: 'https://ougabriel.medium.com/ci-cd-project-deploy-a-python-app-with-docker-ecr-kubernetes-terraform-and-github-actions-on-77d5ea47f108',
  },
  {
    folio: 'No. 05',
    date: '2024-10-08',
    topic: 'AWS · Security',
    read: '9 MIN',
    title: 'Securing data at rest, in transit, and in use on AWS',
    summary:
      'KMS, TLS, and enclave-style patterns mapped to the three data-states. Bucket policy and key-rotation choices, plus how the audit trail is closed at each layer.',
    href: 'https://ougabriel.medium.com/how-i-secured-data-at-rest-data-on-transit-and-data-in-use-on-aws-a500ccd4b58c',
  },
  {
    folio: 'No. 04',
    date: '2024-09-19',
    topic: 'EKS · DevSecOps',
    read: '16 MIN',
    title: 'Production-level Blog App on EKS with Nexus, SonarQube, and Trivy',
    summary:
      'A full-stack blog app shipped on EKS with the DevSecOps toolchain: Nexus artifact repo, SonarQube quality gates, Trivy image scanning, Prometheus and Grafana watching the result.',
    href: 'https://ougabriel.medium.com/cicd-project-production-level-blog-app-deployment-using-eks-nexus-sonarqube-trivy-with-40eb648a688a',
  },
  {
    folio: 'No. 03',
    date: '2024-09-05',
    topic: 'ArgoCD · Azure',
    read: '13 MIN',
    title: 'Deploy a 3-tier microservice voting app with ArgoCD and Azure DevOps',
    summary:
      'GitOps with ArgoCD against an Azure DevOps pipeline. App-of-apps layout, sync waves, and a vote/result/worker split that maps cleanly onto Kubernetes services.',
    href: 'https://ougabriel.medium.com/ci-cd-project-deploy-a-3-tier-microservice-voting-app-using-argocd-and-azure-devops-pipeline-1b3fb9d19138',
  },
  {
    folio: 'No. 02',
    date: '2024-08-21',
    topic: 'Career',
    read: '7 MIN',
    title: 'DevOps Engineer scenario and use case — day-to-day activities on the job',
    summary:
      'What the work actually looks like once the title is real: tickets, on-call shape, the ratio of YAML to thinking, and where the surprises tend to live.',
    href: 'https://ougabriel.medium.com/devops-engineer-scenario-and-use-case-day-to-day-activities-on-the-job-6199af118110',
  },
  {
    folio: 'No. 01',
    date: '2024-08-12',
    topic: 'Career',
    read: '8 MIN',
    title: 'How to get interview calls and DevOps jobs for aspiring engineers',
    summary:
      'Resume signal, project-shaped portfolio, and the contact patterns that actually convert. Written from the recruiter side of the table after the search.',
    href: 'https://ougabriel.medium.com/how-to-get-interview-calls-and-devops-jobs-for-aspiring-devops-engineers-2bbc81b268d7',
  },
]

const Articles: React.FC = () => {
  return (
    <div>
      <section className="hairline-b">
        <div className="page" style={{ paddingTop: '3rem', paddingBottom: '3rem' }}>
          <div className="flex items-baseline justify-between mb-6">
            <span className="folio">Vol. I / Articles Index</span>
            <span className="folio tnum">{articles.length.toString().padStart(2, '0')} / ON FILE</span>
          </div>
          <h1 className="display">
            Articles<span className="accent">.</span>
          </h1>
          <p className="prose-mono" style={{ marginTop: '1.5rem' }}>
            Long-form dispatches, mirrored on <em>Medium</em>. Each one is a
            walkthrough of work I shipped — written so the next engineer can
            reproduce the result, not just admire the diagram.
          </p>
        </div>
      </section>

      <section>
        <div className="page" style={{ paddingTop: '1.5rem', paddingBottom: '4rem' }}>
          {articles.map((a) => (
            <a
              key={a.folio}
              href={a.href}
              target="_blank"
              rel="noopener noreferrer"
              className="dispatch group"
            >
              <span className="folio">{a.folio}</span>
              <div>
                <div className="meta" style={{ marginBottom: '0.5rem' }}>
                  <span className="tnum">{a.date}</span>
                  <span className="signal" style={{ margin: '0 0.6ch' }}>/</span>
                  {a.topic}
                </div>
                <h3
                  className="group-hover:signal transition-colors"
                  style={{
                    fontSize: 'clamp(1.05rem, 1.6vw, 1.35rem)',
                    fontWeight: 600,
                    letterSpacing: '-0.01em',
                    lineHeight: 1.3,
                    margin: 0,
                    marginBottom: '0.75rem',
                  }}
                >
                  {a.title}
                </h3>
                <p
                  className="dim"
                  style={{
                    fontSize: '13px',
                    lineHeight: 1.65,
                    maxWidth: '64ch',
                    margin: 0,
                  }}
                >
                  {a.summary}
                </p>
              </div>
              <span className="meta dispatch-meta-right">{a.read} ↗</span>
            </a>
          ))}

          <div className="hairline" style={{ marginTop: '2.5rem', paddingTop: '1.5rem' }}>
            <a
              href="https://ougabriel.medium.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="field-btn field-btn-solid"
            >
              FOLLOW ON MEDIUM ↗
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Articles
