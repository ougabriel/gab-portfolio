import React from 'react'
import { Link } from 'react-router-dom'

type Dispatch = {
  folio: string
  date: string
  topic: string
  read: string
  title: string
  href: string
}

const dispatches: Dispatch[] = [
  {
    folio: 'No. 08',
    date: '2025-01-29',
    topic: 'AI / Azure',
    read: '12 MIN',
    title: "Deploy 'DeepSeek AI' using OLLAMA API on an Azure Windows Server",
    href: 'https://ougabriel.medium.com/deploy-deepseek-ai-using-ollama-api-on-your-azure-windows-server-6008d3d6d532',
  },
  {
    folio: 'No. 07',
    date: '2024-11-04',
    topic: 'CI/CD · EKS',
    read: '14 MIN',
    title: 'Deploy a Python app with /healthcheck on AWS EKS using Terraform & GitHub Actions',
    href: 'https://ougabriel.medium.com/ci-cd-pipeline-deploy-python-app-with-healthcheck-on-aws-eks-using-terraform-github-actions-cb9db07d93a1',
  },
  {
    folio: 'No. 06',
    date: '2024-11-03',
    topic: 'Docker · K8s',
    read: '10 MIN',
    title: 'Deploy a Python app with /healthcheck on Docker, ECR, and Kubernetes',
    href: 'https://ougabriel.medium.com/ci-cd-project-deploy-a-python-app-with-docker-ecr-kubernetes-terraform-and-github-actions-on-77d5ea47f108',
  },
  {
    folio: 'No. 05',
    date: '2024-10-08',
    topic: 'AWS · Security',
    read: '9 MIN',
    title: 'Securing data at rest, in transit, and in use on AWS',
    href: 'https://ougabriel.medium.com/how-i-secured-data-at-rest-data-on-transit-and-data-in-use-on-aws-a500ccd4b58c',
  },
  {
    folio: 'No. 04',
    date: '2024-09-19',
    topic: 'EKS · DevSecOps',
    read: '16 MIN',
    title: 'Production-level Blog App on EKS with Nexus, SonarQube, and Trivy',
    href: 'https://ougabriel.medium.com/cicd-project-production-level-blog-app-deployment-using-eks-nexus-sonarqube-trivy-with-40eb648a688a',
  },
  {
    folio: 'No. 03',
    date: '2024-09-05',
    topic: 'ArgoCD · Azure',
    read: '13 MIN',
    title: 'Deploy a 3-tier microservice voting app with ArgoCD and Azure DevOps',
    href: 'https://ougabriel.medium.com/ci-cd-project-deploy-a-3-tier-microservice-voting-app-using-argocd-and-azure-devops-pipeline-1b3fb9d19138',
  },
]

const topics = [
  { code: 'MLOps', count: '06' },
  { code: 'Kubernetes', count: '11' },
  { code: 'Azure', count: '09' },
  { code: 'AWS', count: '07' },
  { code: 'Terraform', count: '05' },
  { code: 'GitHub Actions', count: '06' },
  { code: 'ArgoCD', count: '03' },
  { code: 'Prometheus', count: '04' },
  { code: 'DevSecOps', count: '04' },
  { code: 'Python', count: '08' },
]

const certifications = [
  { id: 'AZ-400', name: 'Azure DevOps Engineer Expert' },
  { id: 'AZ-104', name: 'Azure Administrator Associate' },
  { id: 'AZ-204', name: 'Azure Developer Associate' },
  { id: 'SC-200', name: 'Security Operations Analyst Associate' },
  { id: 'GH-Foundations', name: 'GitHub Foundations & Actions' },
  { id: 'Google IT', name: 'Google Certified IT Support' },
]

const Home: React.FC = () => {
  return (
    <div>
      {/* ================== MASTHEAD ================== */}
      <section className="hairline-b">
        <div className="page" style={{ paddingTop: '3.5rem', paddingBottom: '3.5rem' }}>
          <div className="flex items-baseline justify-between mb-10">
            <span className="folio">No. 01 / Vol. I / Field Log</span>
            <span className="folio hidden md:inline">{new Date().toISOString().slice(0, 10)}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 md:gap-10 items-start">
            {/* Text column — first on mobile, left on desktop */}
            <div className="md:col-span-7 lg:col-span-8 order-2 md:order-1">
              <h1 className="display">
                Notes from the<br />
                <span className="accent">production</span> trenches<span className="caret"></span>
              </h1>

              <p className="prose-mono" style={{ marginTop: '2rem' }}>
                Gabriel Okom — senior DevOps and AI/MLOps engineer at <em>KPMG
                (Microsoft Business Solutions)</em>. I align tooling with business
                outcomes: enterprise-grade CI/CD on Azure DevOps and GitHub Actions,
                Kubernetes-native infrastructure on Azure, and MLOps workflows wired
                behind AI-driven audit and analytics workloads. This is the log:
                long-form articles, recorded walkthroughs, and the field notes
                behind them — written from real production work, not slideware.
              </p>

              <div className="flex flex-wrap gap-3" style={{ marginTop: '2.5rem' }}>
                <Link to="/articles" className="field-btn field-btn-solid">
                  READ LATEST DISPATCH →
                </Link>
                <Link to="/articles" className="field-btn">
                  ALL ARTICLES <span className="dim">/ {dispatches.length.toString().padStart(2, '0')}</span>
                </Link>
                <a
                  href="https://www.youtube.com/@GabrielOkom"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="field-btn"
                >
                  VIDEO BLOG <span className="signal">↗</span>
                </a>
              </div>
            </div>

            {/* Portrait sidebar — last on mobile, right on desktop. Treated as a
                documentary plate: hairline frame, acid-lime crop marks at each
                corner (darkroom register marks), tabular caption strip below. */}
            <figure className="md:col-span-5 lg:col-span-4 order-1 md:order-2 m-0 mb-8 md:mb-0">
              <div
                style={{
                  position: 'relative',
                  border: '1px solid var(--rule)',
                  background: 'var(--ink-800)',
                  aspectRatio: '4 / 5',
                  overflow: 'hidden',
                }}
              >
                <img
                  src="/portrait.jpg"
                  alt="Gabriel Okom — portrait, London 2026"
                  loading="eager"
                  decoding="async"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    objectPosition: 'center 18%',
                    display: 'block',
                    filter: 'contrast(1.03) saturate(0.92)',
                  }}
                  onError={(e) => {
                    const t = e.target as HTMLImageElement
                    if (!t.dataset.fallback) {
                      t.dataset.fallback = '1'
                      t.src = '/profile.jpg'
                    }
                  }}
                />
                {/* Acid-lime register marks — four corners. Pure CSS, no SVG. */}
                {(['tl', 'tr', 'bl', 'br'] as const).map((pos) => {
                  const off = 8
                  const len = 14
                  const base = { position: 'absolute' as const, background: 'var(--signal)' }
                  const v = (pos === 'tl' || pos === 'tr') ? { top: off } : { bottom: off }
                  const h = (pos === 'tl' || pos === 'bl') ? { left: off } : { right: off }
                  return (
                    <span key={pos}>
                      <span style={{ ...base, ...v, ...h, width: len, height: 1 }} />
                      <span style={{ ...base, ...v, ...h, width: 1, height: len }} />
                    </span>
                  )
                })}
              </div>
              <figcaption
                className="flex items-baseline justify-between"
                style={{ paddingTop: '0.7rem', borderTop: '1px solid var(--rule)', marginTop: '0.5rem' }}
              >
                <span className="meta">
                  <span className="signal">◆</span> GABRIEL OKOM
                </span>
                <span className="meta">LONDON · 2026</span>
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* ================== TOPIC INDEX ================== */}
      <section className="hairline-b">
        <div className="page" style={{ paddingTop: '2.5rem', paddingBottom: '2.5rem' }}>
          <div className="section-masthead">
            <h2>Topic Index</h2>
            <span className="rule-fill" />
            <span className="meta tnum">{topics.length.toString().padStart(2, '0')}</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {topics.map((t) => (
              <span key={t.code} className="topic-chip">
                <span className="diamond">◆</span>
                {t.code}
                <span className="dim tnum" style={{ marginLeft: '0.5ch' }}>{t.count}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ================== SELECTED DISPATCHES ================== */}
      <section className="hairline-b">
        <div className="page" style={{ paddingTop: '3rem', paddingBottom: '3rem' }}>
          <div className="section-masthead">
            <h2>Selected Dispatches</h2>
            <span className="rule-fill" />
            <Link to="/articles" className="meta hover:signal">VIEW ALL →</Link>
          </div>

          <div>
            {dispatches.map((d) => (
              <a
                key={d.folio}
                href={d.href}
                target="_blank"
                rel="noopener noreferrer"
                className="dispatch group"
              >
                <span className="folio">{d.folio}</span>
                <div>
                  <div className="meta" style={{ marginBottom: '0.5rem' }}>
                    <span className="tnum">{d.date}</span>
                    <span className="signal" style={{ margin: '0 0.6ch' }}>/</span>
                    {d.topic}
                  </div>
                  <h3
                    className="group-hover:signal transition-colors"
                    style={{
                      fontSize: 'clamp(1.05rem, 1.6vw, 1.4rem)',
                      fontWeight: 600,
                      letterSpacing: '-0.01em',
                      lineHeight: 1.3,
                      margin: 0,
                    }}
                  >
                    {d.title}
                  </h3>
                </div>
                <span className="meta dispatch-meta-right">{d.read} ↗</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ================== VIDEO REEL ================== */}
      <section className="hairline-b">
        <div className="page" style={{ paddingTop: '3rem', paddingBottom: '3rem' }}>
          <div className="section-masthead">
            <h2>Video Blog / Reel</h2>
            <span className="rule-fill" />
            <a
              href="https://www.youtube.com/@GabrielOkom"
              target="_blank"
              rel="noopener noreferrer"
              className="meta hover:signal"
            >
              @GABRIELOKOM ↗
            </a>
          </div>

          <p className="prose-mono" style={{ marginBottom: '1.75rem' }}>
            Recorded walkthroughs that pair the articles: pipelines built end-to-end,
            cluster builds and breakage, and the why behind each tooling choice.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-0 hairline">
            {[
              { tag: 'REEL 01', label: 'CI/CD walkthroughs', topic: 'GitHub Actions · Jenkins' },
              { tag: 'REEL 02', label: 'Kubernetes in the field', topic: 'AKS · EKS · ArgoCD' },
              { tag: 'REEL 03', label: 'Azure & MLOps', topic: 'Azure DevOps · MLflow' },
            ].map((r, i) => (
              <a
                key={r.tag}
                href="https://www.youtube.com/@GabrielOkom"
                target="_blank"
                rel="noopener noreferrer"
                className={`group block p-6 ${i > 0 ? 'md:border-l' : ''} hairline-b md:border-b-0`}
                style={{ borderColor: 'var(--rule)' }}
              >
                <div className="meta" style={{ marginBottom: '1rem' }}>
                  {r.tag} <span className="signal">/</span> 03
                </div>
                <div
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 600,
                    letterSpacing: '-0.01em',
                    marginBottom: '0.5rem',
                  }}
                  className="group-hover:signal transition-colors"
                >
                  {r.label}
                </div>
                <div className="meta">{r.topic}</div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ================== CREDENTIALS ================== */}
      <section className="hairline-b">
        <div className="page" style={{ paddingTop: '3rem', paddingBottom: '3rem' }}>
          <div className="section-masthead">
            <h2>Credentials / On File</h2>
            <span className="rule-fill" />
            <span className="meta tnum">{certifications.length.toString().padStart(2, '0')}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {certifications.map((c, i) => (
              <div
                key={c.id}
                className="p-5"
                style={{
                  borderTop: '1px solid var(--rule)',
                  borderLeft: i % 3 !== 0 ? '1px solid var(--rule)' : undefined,
                }}
              >
                <div className="meta" style={{ marginBottom: '0.5rem' }}>
                  <span className="signal">◆</span> {c.id}
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 500 }}>{c.name}</div>
              </div>
            ))}
          </div>

          <p className="prose-mono" style={{ marginTop: '2rem' }}>
            MSc Cyber Security, University of Greenwich (2022). AWS Certified
            Solutions Architect — <em>in view</em>.
          </p>
        </div>
      </section>

      {/* ================== COLOPHON / CTA ================== */}
      <section>
        <div className="page" style={{ paddingTop: '3.5rem', paddingBottom: '4.5rem' }}>
          <div className="section-masthead">
            <h2>Colophon</h2>
            <span className="rule-fill" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
            <div className="md:col-span-7">
              <p className="prose-mono">
                Field Log is published from London. Set in JetBrains Mono.
                Built with React, Vite, and Tailwind. Articles are mirrored on
                Medium; recorded walkthroughs ship to YouTube. Source for this
                site lives on GitHub — patches welcome.
              </p>
            </div>
            <div className="md:col-span-5 flex flex-wrap gap-3 md:justify-end items-start">
              <a href="mailto:ougabriel@gmail.com" className="field-btn field-btn-solid">
                EMAIL ↗
              </a>
              <a
                href="https://www.linkedin.com/in/gabrielokom/"
                target="_blank"
                rel="noopener noreferrer"
                className="field-btn"
              >
                LINKEDIN ↗
              </a>
              <a
                href="https://github.com/ougabriel"
                target="_blank"
                rel="noopener noreferrer"
                className="field-btn"
              >
                GITHUB ↗
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Home
