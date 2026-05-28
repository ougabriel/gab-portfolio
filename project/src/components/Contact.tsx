import React, { useState } from 'react'

const channels: { folio: string; label: string; value: string; href: string }[] = [
  {
    folio: 'No. 01',
    label: 'Email — preferred',
    value: 'ougabriel@gmail.com',
    href: 'mailto:ougabriel@gmail.com',
  },
  {
    folio: 'No. 02',
    label: 'LinkedIn',
    value: '/in/gabrielokom',
    href: 'https://www.linkedin.com/in/gabrielokom/',
  },
  {
    folio: 'No. 03',
    label: 'GitHub',
    value: '@ougabriel',
    href: 'https://github.com/ougabriel',
  },
  {
    folio: 'No. 04',
    label: 'Medium',
    value: '@ougabriel',
    href: 'https://ougabriel.medium.com/',
  },
  {
    folio: 'No. 05',
    label: 'YouTube',
    value: '@GabrielOkom',
    href: 'https://www.youtube.com/@GabrielOkom',
  },
  {
    folio: 'No. 06',
    label: 'Telephone',
    value: '+44 7555 120605',
    href: 'tel:+447555120605',
  },
]

const Contact: React.FC = () => {
  const [name, setName] = useState('')
  const [from, setFrom] = useState('')
  const [body, setBody] = useState('')

  const mailto = () => {
    const subject = encodeURIComponent(`Inbound from ${name || 'Field Log'}`)
    const lines = [
      `From: ${name || '—'} <${from || '—'}>`,
      '',
      body || '',
    ]
    const b = encodeURIComponent(lines.join('\n'))
    window.location.href = `mailto:ougabriel@gmail.com?subject=${subject}&body=${b}`
  }

  return (
    <div>
      <section className="hairline-b">
        <div className="page" style={{ paddingTop: '3rem', paddingBottom: '3rem' }}>
          <div className="flex items-baseline justify-between mb-6">
            <span className="folio">Vol. I / Contact</span>
            <span className="folio">REPLIES WITHIN 24H</span>
          </div>
          <h1 className="display">
            Get in touch<span className="accent">.</span>
          </h1>
          <p className="prose-mono" style={{ marginTop: '1.5rem' }}>
            For roles, consulting, or a question about a piece in the log —
            email is the cleanest path. The form below opens your mail client
            with the message pre-filled; no third-party form processor sits in
            the middle.
          </p>
        </div>
      </section>

      <section className="hairline-b">
        <div className="page" style={{ paddingTop: '2.5rem', paddingBottom: '3rem' }}>
          <div className="section-masthead">
            <h2>Channels</h2>
            <span className="rule-fill" />
            <span className="meta tnum">{channels.length.toString().padStart(2, '0')}</span>
          </div>

          {channels.map((c) => (
            <a
              key={c.folio}
              href={c.href}
              target={c.href.startsWith('http') ? '_blank' : undefined}
              rel="noopener noreferrer"
              className="dispatch group"
            >
              <span className="folio">{c.folio}</span>
              <div>
                <div className="meta" style={{ marginBottom: '0.4rem' }}>{c.label}</div>
                <div
                  className="group-hover:signal transition-colors"
                  style={{ fontSize: '1.05rem', fontWeight: 500 }}
                >
                  {c.value}
                </div>
              </div>
              <span className="meta dispatch-meta-right">OPEN ↗</span>
            </a>
          ))}
        </div>
      </section>

      <section>
        <div className="page" style={{ paddingTop: '2.5rem', paddingBottom: '4.5rem' }}>
          <div className="section-masthead">
            <h2>Compose</h2>
            <span className="rule-fill" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
            <label className="block p-5" style={{ borderTop: '1px solid var(--rule)' }}>
              <div className="meta" style={{ marginBottom: '0.6rem' }}>Name</div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full bg-transparent outline-none"
                style={{
                  border: 0,
                  borderBottom: '1px solid var(--rule)',
                  padding: '0.4rem 0',
                  color: 'var(--bone)',
                  fontFamily: 'inherit',
                  fontSize: '0.95rem',
                }}
              />
            </label>
            <label className="block p-5" style={{ borderTop: '1px solid var(--rule)', borderLeft: '1px solid var(--rule)' }}>
              <div className="meta" style={{ marginBottom: '0.6rem' }}>Reply-to</div>
              <input
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                placeholder="you@domain.com"
                type="email"
                className="w-full bg-transparent outline-none"
                style={{
                  border: 0,
                  borderBottom: '1px solid var(--rule)',
                  padding: '0.4rem 0',
                  color: 'var(--bone)',
                  fontFamily: 'inherit',
                  fontSize: '0.95rem',
                }}
              />
            </label>
            <label className="block p-5 md:col-span-2" style={{ borderTop: '1px solid var(--rule)' }}>
              <div className="meta" style={{ marginBottom: '0.6rem' }}>Message</div>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={7}
                placeholder="Notes, brief, or the question."
                className="w-full bg-transparent outline-none resize-y"
                style={{
                  border: 0,
                  borderBottom: '1px solid var(--rule)',
                  padding: '0.4rem 0',
                  color: 'var(--bone)',
                  fontFamily: 'inherit',
                  fontSize: '0.95rem',
                  lineHeight: 1.6,
                }}
              />
            </label>
          </div>

          <div className="hairline" style={{ marginTop: '1.5rem', paddingTop: '1.5rem' }}>
            <button onClick={mailto} className="field-btn field-btn-solid">
              SEND VIA MAIL CLIENT ↗
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Contact
