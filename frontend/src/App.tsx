import { lazy, Suspense, useEffect, useState } from 'react'
import { ArrowUpRight, Menu, Smartphone, Sparkles, X } from 'lucide-react'
import { DEFAULT_MISSION_CODE, readMissionCode } from './lib/mission'
import './App.css'

const EarthGlobe = lazy(() => import('./components/EarthGlobe'))

function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [missionCode, setMissionCode] = useState(DEFAULT_MISSION_CODE)
  useEffect(() => {
    setMissionCode(readMissionCode())
  }, [])

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="home-sky" aria-hidden="true" />
      <header className="site-header">
        <a className="wordmark" href="#overview" aria-label="Astra Med home">
          <Sparkles aria-hidden="true" />
          <span>ASTRA MED</span>
        </a>
        <button
          className="menu-toggle icon-button"
          type="button"
          aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={menuOpen}
          aria-controls="main-navigation"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X /> : <Menu />}
        </button>
        <nav
          id="main-navigation"
          className={menuOpen ? 'main-nav is-open' : 'main-nav'}
          aria-label="Main navigation"
          onClick={() => setMenuOpen(false)}
        >
          <a href="#overview">Overview</a>
          <a href="/dashboard.html">Crew health</a>
          <a href="https://www.nasa.gov/hrp/nlsp/" target="_blank" rel="noreferrer">
            Research
          </a>
          <a href="/dashboard.html">Mission log</a>
        </nav>
        <a className="button button-outline workspace-button" href="/dashboard.html">
          Open workspace
          <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </header>
      <main id="main" className="home-main">
        <section className="hero hero-landing" id="overview" aria-labelledby="hero-title">
          <div className="hero-side">
            <h1 id="hero-title" className="hero-title">
              A world away.
              <br />
              Still human.
            </h1>
            <p className="hero-sidecopy">
              Explore the science that keeps people healthy beyond our home planet.
            </p>
            <div className="hero-toolbar">
              <a className="button button-primary" href="/dashboard.html">
                Open workspace
              </a>
              <a
                className="text-link"
                href={`/dashboard.html?mission=${encodeURIComponent(missionCode)}`}
              >
                Connect phone
                <Smartphone size={21} aria-hidden="true" />
              </a>
            </div>
          </div>
          <div className="hero-planet">
            <Suspense
              fallback={
                <div className="earth-poster" role="status">
                  <img src="/textures/earth-fallback.jpg" alt="" />
                </div>
              }
            >
              <EarthGlobe />
            </Suspense>
          </div>
        </section>
      </main>
    </>
  )
}

export default App
