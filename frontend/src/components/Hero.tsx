import { ArrowDown, ArrowRight, RefreshCw, Sparkles } from 'lucide-react'
import type { Status } from '../api/schemas'

const labels = {
  nominal: 'Nominal — all systems in view',
  caution: 'Caution — attention recommended',
  critical: 'Critical — immediate review required',
} as const

export function Hero({
  status,
  loading,
  error,
  retry,
  openProtocols,
}: {
  status?: Status
  loading: boolean
  error: string
  retry: () => void
  openProtocols: () => void
}) {
  const overall = error ? 'unavailable' : status?.overall ?? (loading ? 'loading' : 'unavailable')
  const statusText = error
    ? 'Awaiting mission link'
    : loading
      ? 'Connecting to mission data…'
      : status
        ? labels[status.overall]
        : 'Awaiting mission link'

  return (
    <section id="overview" className="hero" aria-labelledby="hero-title">
      <div className="hero-scrim" aria-hidden="true" />
      <div className="hero-glow" aria-hidden="true" />
      <div className="hero-inner page-width">
        <div className="hero-copy">
          <p className="hero-kicker">
            <Sparkles size={14} strokeWidth={1.6} aria-hidden="true" />
            Exploration medical intelligence
          </p>
          <h1 id="hero-title">ASTRA-MED</h1>
          <p className="hero-tagline">Your health, in view.</p>
          <p className="hero-description">
            Decision support for the journey beyond Earth — gather indicators, evaluate risk, and act when the link home is delayed.
          </p>

          <div className={`mission-status ${overall}`} key={`${overall}-${statusText}`} role="status">
            <span className="status-dot" aria-hidden="true" />
            <span>{statusText}</span>
            {status && !error ? (
              <span className="mission-day-chip">Day {String(status.mission_day).padStart(3, '0')}</span>
            ) : null}
          </div>

          {error ? (
            <div className="connection-panel" role="alert">
              <div>
                <strong>Mission link offline</strong>
                <p>{error}</p>
              </div>
              <div className="connection-actions">
                <button type="button" className="button secondary compact" onClick={retry}>
                  <RefreshCw size={14} aria-hidden="true" />
                  Retry link
                </button>
              </div>
            </div>
          ) : null}

          <div className="hero-actions">
            <a className="button primary" href="#check-in">
              Log check-in
              <ArrowDown size={16} aria-hidden="true" />
            </a>
            <button type="button" className="button secondary" onClick={openProtocols}>
              Open protocols
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="hero-caption">
          <span>Exploration health support</span>
          <span>{status?.crew_name ?? 'Sim Crew A'}</span>
        </div>
      </div>
    </section>
  )
}
