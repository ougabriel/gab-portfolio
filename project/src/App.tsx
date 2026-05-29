import React, { useState } from 'react'
import { BrowserRouter as Router, Routes, Route, NavLink, Link, useLocation } from 'react-router-dom'
import Home from './components/Home'
import About from './components/About'
import Contact from './components/Contact'
import Articles from './components/Articles'
import Videos from './components/Videos'
import Project from './components/Project'
import Certifications from './components/Certifications'
import Footer from './components/Footer'

const navigation = [
  { name: 'Dispatch', href: '/' },
  { name: 'Articles', href: '/articles' },
  { name: 'Videos', href: '/videos' },
  { name: 'Projects', href: '/projects' },
  { name: 'Certifications', href: '/certifications' },
  { name: 'About/CV', href: '/about' },
  { name: 'Contact', href: '/contact' },
]

const handleDownloadCV = () => {
  const link = document.createElement('a')
  link.href = '/assets/GabrielOkomdevops25.pdf'
  link.download = 'GabrielOkomdevops25.pdf'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

const Header: React.FC = () => {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  return (
    <header className="hairline-b">
      <div className="page flex items-center justify-between" style={{ height: 68 }}>
        <Link to="/" className="flex items-baseline gap-2">
          <span className="signal" style={{ fontSize: 18, lineHeight: 1 }}>◆</span>
          <span className="font-mono" style={{ fontSize: 14, letterSpacing: '0.04em', fontWeight: 600 }}>
            gabrielokom<span className="signal">/</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-7">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              end={item.href === '/'}
              className={({ isActive }) =>
                `text-[12px] tracking-[0.14em] uppercase ${
                  isActive ? 'signal' : 'text-bone hover:signal'
                } transition-colors`
              }
            >
              {item.name}
            </NavLink>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <button onClick={handleDownloadCV} className="field-btn">
            CV<span className="signal">.PDF</span>
          </button>
        </div>

        <button
          className="md:hidden field-btn"
          aria-label="Open menu"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Close' : 'Menu'}
        </button>
      </div>

      {open && (
        <div className="md:hidden hairline-b">
          <div className="page py-4 flex flex-col gap-3">
            {navigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                end={item.href === '/'}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `text-[13px] tracking-[0.14em] uppercase ${
                    isActive ? 'signal' : 'text-bone'
                  }`
                }
              >
                {item.name}
              </NavLink>
            ))}
            <button onClick={handleDownloadCV} className="field-btn self-start mt-1">
              CV<span className="signal">.PDF</span>
            </button>
          </div>
        </div>
      )}

      {/* Sub-rail: status strip. Real info only — current role + location. */}
      <div className="hairline-b">
        <div className="page flex items-center justify-between" style={{ height: 32 }}>
          <span className="meta">
            AUDIT <span className="signal">+</span> ADVISORY CONSULTING
          </span>
          <span className="meta hidden sm:inline">
            LONDON SE6 <span className="signal">/</span> UTC+0
          </span>
          <span className="meta hidden md:inline">
            FIELD LOG <span className="signal">/</span> VOL. I
          </span>
        </div>
      </div>

      {/* suppress unused-loc warning */}
      <span className="sr-only">{location.pathname}</span>
    </header>
  )
}

const App: React.FC = () => {
  return (
    <Router>
      <div className="min-h-screen" style={{ background: '#0B0C0A' }}>
        <Header />
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/articles" element={<Articles />} />
            <Route path="/videos" element={<Videos />} />
            <Route path="/projects" element={<Project />} />
            <Route path="/certifications" element={<Certifications />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </Router>
  )
}

export default App
