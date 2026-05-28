import React from 'react'

type Reel = {
  folio: string
  topic: string
  title: string
  summary: string
}

// The YouTube channel is the source of truth for the live video list.
// Each reel below is a thematic anchor that links to the channel — no
// fabricated video IDs or thumbnails are rendered.
const reels: Reel[] = [
  {
    folio: 'Reel 01',
    topic: 'CI/CD',
    title: 'Pipelines, end-to-end',
    summary:
      'GitHub Actions and Azure DevOps walkthroughs: build, scan, sign, ship. Where each gate sits and why the failure modes look the way they do.',
  },
  {
    folio: 'Reel 02',
    topic: 'Kubernetes',
    title: 'Clusters in the field',
    summary:
      'AKS and EKS standups, ArgoCD GitOps, ingress and probe configuration. Recorded against real workloads, including the breakage.',
  },
  {
    folio: 'Reel 03',
    topic: 'Azure / MLOps',
    title: 'AI on Azure',
    summary:
      'Containerised inference, model registries, and the bits of Azure ML that pay rent. Includes the DeepSeek-on-Windows-Server build.',
  },
]

const Videos: React.FC = () => {
  return (
    <div>
      <section className="hairline-b">
        <div className="page" style={{ paddingTop: '3rem', paddingBottom: '3rem' }}>
          <div className="flex items-baseline justify-between mb-6">
            <span className="folio">Vol. I / Video Blog</span>
            <a
              href="https://www.youtube.com/@GabrielOkom"
              target="_blank"
              rel="noopener noreferrer"
              className="folio hover:signal"
            >
              @GABRIELOKOM ↗
            </a>
          </div>
          <h1 className="display">
            Videos<span className="accent">.</span>
          </h1>
          <p className="prose-mono" style={{ marginTop: '1.5rem' }}>
            Recorded walkthroughs of the same work the articles describe —
            pipelines wired end-to-end, clusters standing up, and the
            decisions made on screen. The live list lives on <em>YouTube</em>.
          </p>
          <div style={{ marginTop: '2rem' }}>
            <a
              href="https://www.youtube.com/@GabrielOkom"
              target="_blank"
              rel="noopener noreferrer"
              className="field-btn field-btn-solid"
            >
              OPEN THE CHANNEL ↗
            </a>
          </div>
        </div>
      </section>

      <section>
        <div className="page" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
          <div className="section-masthead">
            <h2>Reels</h2>
            <span className="rule-fill" />
            <span className="meta tnum">03</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
            {reels.map((r, i) => (
              <a
                key={r.folio}
                href="https://www.youtube.com/@GabrielOkom"
                target="_blank"
                rel="noopener noreferrer"
                className="group block p-6 hairline-b md:border-b-0"
                style={{
                  borderTop: '1px solid var(--rule)',
                  borderLeft: i > 0 ? '1px solid var(--rule)' : undefined,
                }}
              >
                <div className="meta" style={{ marginBottom: '1rem' }}>
                  {r.folio.toUpperCase()} <span className="signal">/</span> {r.topic}
                </div>
                <div
                  style={{
                    fontSize: '1.35rem',
                    fontWeight: 600,
                    letterSpacing: '-0.01em',
                    marginBottom: '0.75rem',
                    lineHeight: 1.2,
                  }}
                  className="group-hover:signal transition-colors"
                >
                  {r.title}
                </div>
                <p className="dim" style={{ fontSize: '13px', lineHeight: 1.6, margin: 0 }}>
                  {r.summary}
                </p>
                <div className="meta" style={{ marginTop: '1.5rem' }}>WATCH ↗</div>
              </a>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

export default Videos
