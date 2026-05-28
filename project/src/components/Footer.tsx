import React from 'react'
import { Link } from 'react-router-dom'

const Footer: React.FC = () => {
  return (
    <footer className="hairline">
      <div className="page" style={{ paddingTop: '3rem', paddingBottom: '2rem' }}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <div className="meta" style={{ marginBottom: '1rem' }}>Field Log</div>
            <ul className="space-y-2" style={{ fontSize: 13 }}>
              <li><Link to="/" className="link-signal">Dispatch</Link></li>
              <li><Link to="/articles" className="link-signal">Articles</Link></li>
              <li><Link to="/videos" className="link-signal">Videos</Link></li>
              <li><Link to="/projects" className="link-signal">Projects</Link></li>
            </ul>
          </div>

          <div>
            <div className="meta" style={{ marginBottom: '1rem' }}>Topics</div>
            <ul className="space-y-2" style={{ fontSize: 13 }}>
              <li><span className="dim">MLOps</span></li>
              <li><span className="dim">Kubernetes</span></li>
              <li><span className="dim">Azure DevOps</span></li>
              <li><span className="dim">DevSecOps</span></li>
            </ul>
          </div>

          <div>
            <div className="meta" style={{ marginBottom: '1rem' }}>Channels</div>
            <ul className="space-y-2" style={{ fontSize: 13 }}>
              <li>
                <a className="link-signal" href="https://ougabriel.medium.com/" target="_blank" rel="noopener noreferrer">
                  Medium ↗
                </a>
              </li>
              <li>
                <a className="link-signal" href="https://www.youtube.com/@GabrielOkom" target="_blank" rel="noopener noreferrer">
                  YouTube ↗
                </a>
              </li>
              <li>
                <a className="link-signal" href="https://www.linkedin.com/in/gabrielokom/" target="_blank" rel="noopener noreferrer">
                  LinkedIn ↗
                </a>
              </li>
              <li>
                <a className="link-signal" href="https://github.com/ougabriel" target="_blank" rel="noopener noreferrer">
                  GitHub ↗
                </a>
              </li>
            </ul>
          </div>

          <div>
            <div className="meta" style={{ marginBottom: '1rem' }}>Direct</div>
            <ul className="space-y-2" style={{ fontSize: 13 }}>
              <li>
                <a className="link-signal" href="mailto:ougabriel@gmail.com">
                  ougabriel@gmail.com
                </a>
              </li>
              <li className="dim">London, SE6</li>
              <li className="dim">+44 7555 120605</li>
            </ul>
          </div>
        </div>

        <div
          className="hairline flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          style={{ marginTop: '2.5rem', paddingTop: '1.25rem' }}
        >
          <span className="meta">
            © {new Date().getFullYear()} GABRIEL OKOM <span className="signal">/</span> ALL RIGHTS RESERVED
          </span>
          <span className="meta">
            SET IN JETBRAINS MONO <span className="signal">/</span> VOL. I
          </span>
        </div>
      </div>
    </footer>
  )
}

export default Footer
