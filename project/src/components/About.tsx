import React from 'react'

type Role = {
  span: string
  title: string
  org: string
  bullets: string[]
}

const roles: Role[] = [
  {
    span: '2025-06 — Present',
    title: 'DevOps & AI/MLOps Engineer',
    org: 'KPMG (Microsoft Business Solutions UK & Europe)',
    bullets: [
      'Enterprise-grade CI/CD on Azure DevOps and GitHub Actions: unit tests, SAST, container scanning, approval gates.',
      'Kubernetes-native infra on Azure for AI-driven audit and analytics workloads across dev/stage/prod.',
      'MLOps workflows: model versioning, artifact management, automated build/test/deploy, environment parity across subscriptions.',
      'Self-healing automation (Bash/Python) tied to alerts: pod restarts, HPA scaling, remediation runbooks.',
      'Centralised logging via Azure Monitor with correlation IDs across microservices and ML pipelines.',
      'Multi-stage Docker builds for ML inference + backend APIs: smaller images, faster cold starts.',
    ],
  },
  {
    span: '2022-11 — 2025-09',
    title: 'Senior DevOps Engineer',
    org: 'Green Culture Media and Tech Ltd',
    bullets: [
      'NGINX Ingress on Kubernetes — load balancing and traffic mgmt, 99.99% uptime on critical apps.',
      '20+ Ansible playbooks and roles; deployment time cut ~30% with consistent environments.',
      'Set up Ansible workstation + clients; YAML scripts driving software updates and upgrades fleet-wide.',
      'Prometheus + Grafana monitoring stack; proactive detection, 99.9% uptime.',
      'Terraform-driven IaC across environments; ~90% reduction in deployment errors.',
      'AKS deployments with HA, scaling and fault tolerance.',
      'Cloudflare for CDN, security, and edge performance.',
    ],
  },
  {
    span: '2021-03 — 2023-12',
    title: 'Senior DevOps Engineer',
    org: 'Sterling Oil & Energy Production Ltd',
    bullets: [
      'On-prem → Azure migration of critical applications.',
      'SRE-style monitoring and alerting wiring; downtime reduced.',
      'Shell-script automation cut manual workload by ~40%.',
      'Unit tests in CI/CD; error-free SDLC pattern.',
      'Backup + disaster recovery design with reduced manual intervention.',
      'Pioneered Kubernetes adoption to 100+ nodes; deployments ~70% faster.',
      'IaC with Terraform + Ansible across multi-cloud.',
    ],
  },
  {
    span: '2021-09 — 2022-09',
    title: 'Cyber Security Analyst',
    org: 'University of Greenwich',
    bullets: [
      'DDoS mitigation via advanced firewall rules + traffic analysis; ~40% downtime cut at peak.',
      'Azure IAM: users, groups, MFA, access control.',
      'Incident records, documentation, security-event analysis.',
      'Grafana monitoring + log review for proactive defence.',
      'Internal IT audit and risk analysis against ISO, NIST, COBIT.',
      'NSG design across institution-wide VNets.',
    ],
  },
  {
    span: '2020-08 — 2021-09',
    title: 'DevOps Engineer',
    org: 'Bluegate Hospitals',
    bullets: [
      'DevSecOps pipeline approach; production vuln count down.',
      'Test + debug discipline for code and application performance.',
      'Python automation for continuous compliance + app security.',
      'AWS cost analysis and optimisation, ~30% reduction.',
      'Key role in AWS migration of legacy systems with zero downtime.',
      'Disaster recovery + automated backup/failover.',
    ],
  },
]

const stack: [string, string][] = [
  ['Versioning', 'Git'],
  ['CI / CD', 'Jenkins, Azure DevOps, GitHub Actions'],
  ['Containers', 'Docker (multi-stage), Kubernetes (AKS, EKS)'],
  ['GitOps + Security', 'ArgoCD, Trivy, SonarQube, Nexus'],
  ['Cloud', 'AWS, Azure'],
  ['IaC + Config', 'Terraform, Helm, Ansible'],
  ['Monitoring', 'ELK, Prometheus, Grafana'],
  ['Scripting', 'Python, Bash, YAML'],
  ['App layer', 'Apache Tomcat, MySQL'],
  ['OS + Tracking', 'Ubuntu, CentOS, Windows, JIRA'],
]

const About: React.FC = () => {
  return (
    <div>
      <section className="hairline-b">
        <div className="page" style={{ paddingTop: '3rem', paddingBottom: '3rem' }}>
          <div className="flex items-baseline justify-between mb-6">
            <span className="folio">Vol. I / About</span>
            <span className="folio">LONDON, SE6</span>
          </div>
          <h1 className="display">
            About<span className="accent">.</span>
          </h1>
          <p className="prose-mono" style={{ marginTop: '1.5rem' }}>
            Senior DevOps engineer with hands-on AI/MLOps experience. At
            <em> KPMG</em>, I build enterprise-grade CI/CD on Azure DevOps and
            GitHub Actions, architect Kubernetes-native infrastructure for
            AI-driven audit and analytics workloads, and wire MLOps workflows —
            model versioning, artifact management, environment parity — across
            cloud subscriptions. Growth mindset, security-first delivery.
          </p>
        </div>
      </section>

      <section className="hairline-b">
        <div className="page" style={{ paddingTop: '2.5rem', paddingBottom: '2.5rem' }}>
          <div className="section-masthead">
            <h2>Stack / On Hand</h2>
            <span className="rule-fill" />
            <span className="meta tnum">{stack.length.toString().padStart(2, '0')}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2">
            {stack.map(([k, v], i) => (
              <div
                key={k}
                className="p-5"
                style={{
                  borderTop: '1px solid var(--rule)',
                  borderLeft: i % 2 !== 0 ? '1px solid var(--rule)' : undefined,
                }}
              >
                <div className="meta" style={{ marginBottom: '0.5rem' }}>
                  <span className="signal">◆</span> {k}
                </div>
                <div style={{ fontSize: '0.95rem' }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="page" style={{ paddingTop: '2.5rem', paddingBottom: '4rem' }}>
          <div className="section-masthead">
            <h2>Experience / Field Record</h2>
            <span className="rule-fill" />
            <span className="meta tnum">{roles.length.toString().padStart(2, '0')}</span>
          </div>

          {roles.map((r) => (
            <article key={`${r.span}-${r.title}`} className="dispatch" style={{ alignItems: 'start' }}>
              <span className="folio">{r.span}</span>
              <div>
                <h3
                  style={{
                    fontSize: '1.15rem',
                    fontWeight: 600,
                    letterSpacing: '-0.01em',
                    margin: 0,
                    marginBottom: '0.25rem',
                  }}
                >
                  {r.title}
                </h3>
                <div className="meta" style={{ marginBottom: '1rem' }}>
                  <span className="signal">◆</span> {r.org}
                </div>
                <ul className="space-y-1.5" style={{ paddingLeft: '1.1rem' }}>
                  {r.bullets.map((b, i) => (
                    <li
                      key={i}
                      style={{
                        fontSize: '13px',
                        lineHeight: 1.65,
                        color: 'var(--bone)',
                        listStyleType: 'square',
                      }}
                    >
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
              <span className="meta dispatch-meta-right" />
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

export default About
