import React from 'react'

type Cert = {
  id: string
  vendor: string
  name: string
  status: 'Held' | 'In view'
  year?: string
}

const certs: Cert[] = [
  { id: 'AZ-400', vendor: 'Microsoft', name: 'Azure DevOps Engineer Expert', status: 'Held' },
  { id: 'AZ-104', vendor: 'Microsoft', name: 'Azure Administrator Associate', status: 'Held' },
  { id: 'AZ-204', vendor: 'Microsoft', name: 'Azure Developer Associate', status: 'Held' },
  { id: 'SC-200', vendor: 'Microsoft', name: 'Security Operations Analyst Associate', status: 'Held' },
  { id: 'GH-Foundations', vendor: 'GitHub', name: 'Foundations + Actions Certifications', status: 'Held' },
  { id: 'Google IT', vendor: 'Google', name: 'Google Certified IT Support', status: 'Held' },
  { id: 'SAA-C03', vendor: 'AWS', name: 'Solutions Architect — Associate', status: 'In view' },
]

const education = [
  { span: '2022', title: 'MSc Cyber Security', org: 'University of Greenwich' },
  { span: '2014', title: 'BSc Technology Education', org: 'Delta State University' },
]

const Certifications: React.FC = () => {
  return (
    <div>
      <section className="hairline-b">
        <div className="page" style={{ paddingTop: '3rem', paddingBottom: '3rem' }}>
          <div className="flex items-baseline justify-between mb-6">
            <span className="folio">Vol. I / Credentials</span>
            <span className="folio tnum">{certs.length.toString().padStart(2, '0')} / ON FILE</span>
          </div>
          <h1 className="display">
            Credentials<span className="accent">.</span>
          </h1>
          <p className="prose-mono" style={{ marginTop: '1.5rem' }}>
            Certifications and degrees that map cleanly onto the work in the
            log — Microsoft Azure across DevOps, infra and security, GitHub
            Actions, Google IT support, and AWS Solutions Architect <em>in view</em>.
          </p>
        </div>
      </section>

      <section className="hairline-b">
        <div className="page" style={{ paddingTop: '2.5rem', paddingBottom: '2.5rem' }}>
          <div className="section-masthead">
            <h2>Certifications</h2>
            <span className="rule-fill" />
            <span className="meta tnum">{certs.length.toString().padStart(2, '0')}</span>
          </div>

          {certs.map((c) => (
            <div key={c.id} className="dispatch" style={{ alignItems: 'baseline' }}>
              <span className="folio">{c.id}</span>
              <div>
                <div className="meta" style={{ marginBottom: '0.35rem' }}>
                  <span className="signal">◆</span> {c.vendor}
                </div>
                <div style={{ fontSize: '1.02rem', fontWeight: 500, letterSpacing: '-0.01em' }}>
                  {c.name}
                </div>
              </div>
              <span
                className="meta dispatch-meta-right"
                style={{ color: c.status === 'Held' ? 'var(--signal)' : 'var(--dim)' }}
              >
                {c.status.toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="page" style={{ paddingTop: '2.5rem', paddingBottom: '4.5rem' }}>
          <div className="section-masthead">
            <h2>Education</h2>
            <span className="rule-fill" />
            <span className="meta tnum">{education.length.toString().padStart(2, '0')}</span>
          </div>
          {education.map((e) => (
            <div key={e.title} className="dispatch">
              <span className="folio">{e.span}</span>
              <div>
                <div style={{ fontSize: '1.02rem', fontWeight: 500 }}>{e.title}</div>
                <div className="meta" style={{ marginTop: '0.25rem' }}>
                  <span className="signal">◆</span> {e.org}
                </div>
              </div>
              <span className="meta dispatch-meta-right" />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

export default Certifications
