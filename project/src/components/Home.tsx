import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

const stampNow = () => {
  const d = new Date()
  const date = d.toLocaleDateString('en-CA')
  const time = d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const tzParts = Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(d)
  const tz = tzParts.find((p) => p.type === 'timeZoneName')?.value ?? ''
  return { date, time, tz }
}

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
    folio: 'No. 26',
    date: '2026-06-02',
    topic: 'Azure DevOps',
    read: '15 MIN',
    title: 'Azure Pipelines vs GitHub Actions: how to choose, and how to bridge them',
    href: 'https://ougabriel.medium.com/39e91328ba84',
  },
  {
    folio: 'No. 25',
    date: '2026-06-02',
    topic: 'Azure DevOps',
    read: '14 MIN',
    title: 'Migrating Azure DevOps classic release pipelines to multi-stage YAML',
    href: 'https://ougabriel.medium.com/f990b62b6aae',
  },
  {
    folio: 'No. 24',
    date: '2026-06-02',
    topic: 'Azure DevOps · Observability',
    read: '15 MIN',
    title: 'Pipeline observability: log analytics for Azure DevOps + Azure Monitor for the apps you ship',
    href: 'https://ougabriel.medium.com/f489a54475a2',
  },
  {
    folio: 'No. 23',
    date: '2026-06-02',
    topic: 'GitOps · AKS',
    read: '14 MIN',
    title: 'GitOps on AKS with Argo CD and Flux, and how to wire either to Azure DevOps',
    href: 'https://ougabriel.medium.com/6501561dac18',
  },
  {
    folio: 'No. 22',
    date: '2026-06-02',
    topic: 'Container CI/CD',
    read: '13 MIN',
    title: 'Container CI/CD from Azure DevOps to ACR and AKS',
    href: 'https://ougabriel.medium.com/58b3ed496f70',
  },
  {
    folio: 'No. 15',
    date: '2026-06-02',
    topic: 'Azure DevOps · YAML',
    read: '14 MIN',
    title: 'Multi-stage YAML pipelines in Azure DevOps: stages, jobs, deployments, environments, and approvals',
    href: 'https://ougabriel.medium.com/57ccf68812c9',
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
  const [stamp, setStamp] = useState(stampNow)
  useEffect(() => {
    const t = setInterval(() => setStamp(stampNow()), 15 * 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <div>
      {/* ================== MASTHEAD ================== */}
      <section className="hairline-b">
        <div className="page" style={{ paddingTop: '3.5rem', paddingBottom: '3.5rem' }}>
          <div
            className="grid grid-cols-1 md:grid-cols-3 items-baseline gap-y-2 mb-10"
            style={{ columnGap: '1rem' }}
          >
            <span className="folio">No. 01 / Vol. I / Field Log</span>
            <span className="folio tnum md:text-center">
              {stamp.date} <span className="signal">·</span> {stamp.time} {stamp.tz}
            </span>
            <Link
              to="/contact"
              className="folio md:text-right hover:signal transition-colors"
              aria-label="Deploy window open — go to contact"
            >
              <span className="pulse-square" />TIME TO RING. LET'S DEPLOY <span className="signal">↗</span>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 md:gap-10 items-start">
            {/* Text column — first on mobile, left on desktop */}
            <div className="md:col-span-7 lg:col-span-8 order-2 md:order-1">
              <h1 className="display">
                Notes from the<br />
                <span className="accent">production</span> trenches<span className="caret"></span>
              </h1>

              <p className="prose-mono" style={{ marginTop: '2rem' }}>
                Gabriel Okom — senior DevOps and AI/MLOps engineer working
                across <em>tech, audit and advisory consulting</em>. I align tooling
                with business outcomes: enterprise-grade CI/CD on Azure DevOps
                and GitHub Actions, Kubernetes-native infrastructure on Azure,
                and MLOps workflows wired behind AI-driven audit and analytics
                workloads. This is the log: long-form articles, recorded
                walkthroughs, and the field notes behind them — written from
                real production work, not slideware.
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

            {/* Portrait sidebar — last on mobile, right on desktop. Circular
                byline treatment: concentric hairline rings (camera-reticle feel),
                acid-lime tick marks at N/E/S/W on the outer ring, tabular caption
                strip below. Still inside the Industrial register — no shadows,
                no gradients, hairlines only. */}
            <figure className="md:col-span-5 lg:col-span-4 order-1 md:order-2 m-0 mb-8 md:mb-0 flex flex-col items-center">
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  maxWidth: 320,
                  aspectRatio: '1 / 1',
                }}
              >
                {/* Outer ring — concentric hairline */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    border: '1px solid var(--rule)',
                    borderRadius: '50%',
                  }}
                />
                {/* Photo circle — inset from outer ring */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 12,
                    borderRadius: '50%',
                    overflow: 'hidden',
                    background: 'var(--ink-800)',
                    border: '1px solid var(--rule)',
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
                      objectPosition: 'center 22%',
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
                </div>

                {/* Radial register marks at N/E/S/W on the outer ring */}
                {([
                  { side: 'top',    style: { top: -4, left: '50%', width: 1, height: 8, transform: 'translateX(-50%)' } },
                  { side: 'right',  style: { top: '50%', right: -4, width: 8, height: 1, transform: 'translateY(-50%)' } },
                  { side: 'bottom', style: { bottom: -4, left: '50%', width: 1, height: 8, transform: 'translateX(-50%)' } },
                  { side: 'left',   style: { top: '50%', left: -4, width: 8, height: 1, transform: 'translateY(-50%)' } },
                ] as const).map((m) => (
                  <span
                    key={m.side}
                    style={{
                      position: 'absolute',
                      background: 'var(--signal)',
                      ...m.style,
                    }}
                  />
                ))}

                {/* Tiny folio chip pinned bottom-right of the ring */}
                <span
                  className="folio"
                  style={{
                    position: 'absolute',
                    bottom: -22,
                    right: 0,
                    fontSize: 10,
                    letterSpacing: '0.22em',
                  }}
                >
                  No. 00 / PORTRAIT
                </span>
              </div>

              <figcaption
                className="w-full flex items-baseline justify-between"
                style={{
                  paddingTop: '0.7rem',
                  borderTop: '1px solid var(--rule)',
                  marginTop: '2.5rem',
                }}
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
