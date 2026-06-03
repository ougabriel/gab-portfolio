import React from 'react'

type ProjectEntry = {
  folio: string
  topic: string
  title: string
  summary: string
  stack: string[]
  href?: string      // primary link (Medium article, fallback to GitHub)
  github?: string    // optional GitHub repo
}

const projects: ProjectEntry[] = [
  {
    folio: 'No. 01',
    topic: 'Azure · Landing Zone · Bicep',
    title: 'Enterprise Azure Landing Zone (CAF + AVM + GitHub Actions OIDC)',
    summary:
      'Reference implementation for an enterprise landing zone: management-group hierarchy, hub-and-spoke network, Azure Verified Modules, policy assignments at MG scope, and OIDC-authenticated GitHub Actions pipelines for what-if + deploy with approval gates. Companion to the Medium walkthrough.',
    stack: ['Bicep', 'AVM', 'GitHub Actions', 'OIDC', 'Azure Policy', 'Management Groups', 'Hub-and-spoke', 'Bastion', 'Sentinel'],
    href: 'https://ougabriel.medium.com/2bd8f26e034b',
    github: 'https://github.com/ougabriel/azure-landing-zone-mvp-demo',
  },
  {
    folio: 'No. 02',
    topic: 'Azure · Serverless · Data',
    title: 'CloudFactory: serverless EXIF preservation + PII compliance enrichment',
    summary:
      'Non-intrusive enhancement layer that solves data drift and metadata loss in the Transfer Bridge pipeline. JSON sidecar mechanism, Azure Functions + Event Grid triggers on the Raw blob, Pillow-based EXIF extraction before processing strips it, automated PII compliance for face detection.',
    stack: ['Azure Functions', 'Event Grid', 'Blob Storage', 'Python', 'Pillow', 'Serverless', 'EXIF', 'PII'],
    github: 'https://github.com/ougabriel/cloudfactory',
  },
  {
    folio: 'No. 03',
    topic: 'AWS · EKS · Microservices',
    title: 'Video Converter: Python microservices on AWS EKS',
    summary:
      'mp4-to-mp3 conversion as four microservices on EKS: auth-server, converter-module, database-server (PostgreSQL + MongoDB), and notification-server. Helm-managed deploy, RabbitMQ for async work, end-to-end walkthrough from cluster bring-up to smoke test.',
    stack: ['Python', 'AWS EKS', 'Helm', 'RabbitMQ', 'PostgreSQL', 'MongoDB', 'Docker', 'Microservices'],
    github: 'https://github.com/ougabriel/python-aws-projects',
  },
  {
    folio: 'No. 04',
    topic: 'CI/CD · AWS · EKS',
    title: 'Full-stack Blog App on AWS with Jenkins + GitOps + monitoring',
    summary:
      'Production-shaped pipeline: Jenkins for build, Terraform for infra, SonarQube + Nexus for quality + artifacts, Trivy for image scans, GitOps for delivery, Prometheus + Blackbox Exporter + Grafana watching the result. The article walks the path end-to-end.',
    stack: ['Git', 'GitOps', 'Jenkins', 'Nexus', 'Docker', 'AWS EKS', 'Terraform', 'SonarQube', 'Trivy', 'Prometheus', 'Grafana'],
    href: 'https://ougabriel.medium.com/cicd-project-production-level-blog-app-deployment-using-eks-nexus-sonarqube-trivy-with-40eb648a688a',
    github: 'https://github.com/ougabriel/full-stack-blogging-app',
  },
  {
    folio: 'No. 05',
    topic: 'ArgoCD · Azure DevOps · AKS',
    title: '3-tier microservice voting app, GitOps-delivered',
    summary:
      'Classic vote / result / worker split (Python Flask + Node.js + Redis + PostgreSQL), containerised and deployed via ArgoCD app-of-apps against an Azure DevOps pipeline. Sync waves, environment promotion, and rollback all wired.',
    stack: ['Git', 'Bash', 'Azure DevOps', 'AKS', 'ArgoCD', 'Docker', 'Terraform', 'Python Flask', 'Node.js', 'Redis', 'PostgreSQL'],
    href: 'https://ougabriel.medium.com/ci-cd-project-deploy-a-3-tier-microservice-voting-app-using-argocd-and-azure-devops-pipeline-1b3fb9d19138',
    github: 'https://github.com/ougabriel/votingApp',
  },
  {
    folio: 'No. 06',
    topic: 'Docker · ECR · K8s',
    title: 'Python service with /healthcheck on Docker + ECR + Kubernetes',
    summary:
      'Trivy and SonarQube gates, Pytest in CI, Bandit and Flake8 quality bars, a multi-stage Dockerfile, and Kubernetes readiness probes wired to a /healthcheck endpoint. Provisioned with Terraform, delivered by GitHub Actions.',
    stack: ['Docker', 'ECR', 'Kubernetes', 'Trivy', 'SonarQube', 'Pytest', 'Bandit', 'Flake8', 'Terraform', 'GitHub Actions'],
    href: 'https://ougabriel.medium.com/ci-cd-project-deploy-a-python-app-with-docker-ecr-kubernetes-terraform-and-github-actions-on-77d5ea47f108',
  },
  {
    folio: 'No. 07',
    topic: 'AI · Azure',
    title: "OLLAMA + 'DeepSeek AI' on Azure Windows Server",
    summary:
      'Standing up DeepSeek behind the OLLAMA API on a Windows Server VM in Azure. VM sizing, NSG / firewall, model pull, and the curl-driven smoke test.',
    stack: ['Azure', 'OLLAMA', 'DeepSeek', 'Windows Server'],
    href: 'https://ougabriel.medium.com/deploy-deepseek-ai-using-ollama-api-on-your-azure-windows-server-6008d3d6d532',
  },
]

const Project: React.FC = () => {
  return (
    <div>
      <section className="hairline-b">
        <div className="page" style={{ paddingTop: '3rem', paddingBottom: '3rem' }}>
          <div className="flex items-baseline justify-between mb-6">
            <span className="folio">Vol. I / Projects</span>
            <span className="folio tnum">{projects.length.toString().padStart(2, '0')} / SHIPPED</span>
          </div>
          <h1 className="display">
            Projects<span className="accent">.</span>
          </h1>
          <p className="prose-mono" style={{ marginTop: '1.5rem' }}>
            Each project is a real piece of work shipped end-to-end:
            infrastructure, pipeline, and the application that lives on top.
            Articles and source repositories linked below contain the full
            reproduction path.
          </p>
        </div>
      </section>

      <section>
        <div className="page" style={{ paddingTop: '1.5rem', paddingBottom: '4rem' }}>
          {projects.map((p) => {
            const primary = p.href ?? p.github
            return (
              <div
                key={p.folio}
                className="dispatch group"
                style={{ alignItems: 'start' }}
              >
                <span className="folio">{p.folio}</span>
                <div>
                  <div className="meta" style={{ marginBottom: '0.5rem' }}>
                    <span className="signal">◆</span> {p.topic}
                  </div>
                  <a
                    href={primary}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group-hover:signal transition-colors"
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <h3
                      style={{
                        fontSize: 'clamp(1.05rem, 1.6vw, 1.35rem)',
                        fontWeight: 600,
                        letterSpacing: '-0.01em',
                        lineHeight: 1.3,
                        margin: 0,
                        marginBottom: '0.75rem',
                      }}
                    >
                      {p.title}
                    </h3>
                  </a>
                  <p
                    className="dim"
                    style={{
                      fontSize: '13px',
                      lineHeight: 1.65,
                      maxWidth: '64ch',
                      margin: 0,
                      marginBottom: '0.9rem',
                    }}
                  >
                    {p.summary}
                  </p>
                  <div className="flex flex-wrap gap-1.5" style={{ marginBottom: '0.6rem' }}>
                    {p.stack.map((s) => (
                      <span key={s} className="topic-chip">
                        <span className="diamond">◆</span>
                        {s}
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-3" style={{ marginTop: '0.4rem' }}>
                    {p.href && (
                      <a
                        href={p.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="meta"
                        style={{ textDecoration: 'none' }}
                      >
                        READ ↗
                      </a>
                    )}
                    {p.github && (
                      <a
                        href={p.github}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="meta signal"
                        style={{ textDecoration: 'none' }}
                      >
                        REPO ↗
                      </a>
                    )}
                  </div>
                </div>
                <span className="meta dispatch-meta-right" />
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

export default Project
