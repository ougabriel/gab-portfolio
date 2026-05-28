import React from 'react'

type ProjectEntry = {
  folio: string
  topic: string
  title: string
  summary: string
  stack: string[]
  href?: string
}

const projects: ProjectEntry[] = [
  {
    folio: 'No. 01',
    topic: 'CI/CD · AWS · EKS',
    title: 'Full-stack Blog App on AWS with Jenkins + GitOps',
    summary:
      'Production-shaped pipeline: Jenkins for build, Terraform for infra, SonarQube for quality, GitOps for delivery, Prometheus and Grafana watching the result. The article walks the path end-to-end.',
    stack: ['Git', 'GitOps', 'Jenkins', 'Nexus', 'Docker', 'AWS EKS', 'Terraform', 'Prometheus', 'Grafana'],
    href: 'https://ougabriel.medium.com/cicd-project-production-level-blog-app-deployment-using-eks-nexus-sonarqube-trivy-with-40eb648a688a',
  },
  {
    folio: 'No. 02',
    topic: 'ArgoCD · Azure DevOps',
    title: '3-tier microservice voting app, GitOps-delivered',
    summary:
      'Classic vote / result / worker split, deployed via ArgoCD app-of-apps against an Azure DevOps pipeline. Sync waves, environment promotion, and rollback are all wired.',
    stack: ['Git', 'Bash', 'Azure DevOps', 'Kubernetes', 'ArgoCD', 'Docker'],
    href: 'https://ougabriel.medium.com/ci-cd-project-deploy-a-3-tier-microservice-voting-app-using-argocd-and-azure-devops-pipeline-1b3fb9d19138',
  },
  {
    folio: 'No. 03',
    topic: 'Docker · ECR · K8s',
    title: 'Python service with /healthcheck on Docker + ECR + Kubernetes',
    summary:
      'Trivy and SonarQube gates, Pytest in CI, Bandit and Flake8 quality bars, a multi-stage Dockerfile, and Kubernetes readiness probes wired to a /healthcheck endpoint.',
    stack: ['Docker', 'ECR', 'Kubernetes', 'Trivy', 'SonarQube', 'Pytest', 'Bandit', 'Flake8', 'Terraform', 'GitHub Actions'],
    href: 'https://ougabriel.medium.com/ci-cd-project-deploy-a-python-app-with-docker-ecr-kubernetes-terraform-and-github-actions-on-77d5ea47f108',
  },
  {
    folio: 'No. 04',
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
            Each project is a real piece of work shipped end-to-end —
            infrastructure, pipeline, and the application that lives on top.
            Articles linked below contain the full reproduction path.
          </p>
        </div>
      </section>

      <section>
        <div className="page" style={{ paddingTop: '1.5rem', paddingBottom: '4rem' }}>
          {projects.map((p) => (
            <a
              key={p.folio}
              href={p.href ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="dispatch group"
              style={{ alignItems: 'start' }}
            >
              <span className="folio">{p.folio}</span>
              <div>
                <div className="meta" style={{ marginBottom: '0.5rem' }}>
                  <span className="signal">◆</span> {p.topic}
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
                  {p.title}
                </h3>
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
                <div className="flex flex-wrap gap-1.5">
                  {p.stack.map((s) => (
                    <span key={s} className="topic-chip">
                      <span className="diamond">◆</span>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
              <span className="meta dispatch-meta-right">READ ↗</span>
            </a>
          ))}
        </div>
      </section>
    </div>
  )
}

export default Project
