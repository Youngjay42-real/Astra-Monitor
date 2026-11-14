import { Orbit } from 'lucide-react'

export function Header({ crew, linkState }: { crew?: string; linkState: 'live' | 'offline' | 'loading' }) {
  const modeLabel = {
    live: 'LIVE',
    offline: 'OFFLINE',
    loading: 'LINKING…',
  }[linkState]

  return (
    <header className="site-header">
      <div className="header-inner page-width">
        <a href="#overview" className="wordmark" aria-label="ASTRA-MED overview">
          <Orbit size={29} strokeWidth={1.3} aria-hidden="true" />
          <span>ASTRA-MED</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#scan">Scan</a>
          <a href="#check-in">Log</a>
          <a href="#monitors">Scores</a>
          <a href="#protocols">Act</a>
          <a href="#context">Context</a>
        </nav>
        <div className="crew-context">
          <span className={`data-mode link-${linkState}`}>
            <span className="status-dot" aria-hidden="true" />
            {modeLabel}
          </span>
          <span className="crew-name">{crew ?? 'Crew dashboard'}</span>
        </div>
      </div>
    </header>
  )
}
