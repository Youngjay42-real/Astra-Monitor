import { Camera, ShieldAlert } from 'lucide-react'
import type { Status } from '../api/schemas'

const labels = {
  nominal: 'Nominal',
  caution: 'Caution',
  critical: 'Critical',
} as const

export function Hero({
  status,
  loading,
  error,
  openProtocols,
}: {
  status?: Status
  loading: boolean
  error: string
  openProtocols: () => void
}) {
  const overall = error ? 'unavailable' : status?.overall ?? (loading ? 'loading' : 'unavailable')
  const statusText = error
    ? 'Demo'
    : loading
      ? 'Loading…'
      : status
        ? labels[status.overall]
        : 'Demo'

  return (
    <section id="overview" className="command-strip" aria-labelledby="hero-title">
      <div className="command-inner page-width">
        <div className="command-identity">
          <p className="section-number">MISSION CONSOLE</p>
          <h1 id="hero-title">ASTRA-MED</h1>
          <p className="command-crew">{status?.crew_name ?? 'Sim Crew A'}</p>
        </div>

        <div className={`command-status ${overall}`} role="status">
          <span className="status-dot" aria-hidden="true" />
          <div>
            <strong>{statusText}</strong>
            {status && !error ? (
              <span className="command-day">Day {String(status.mission_day).padStart(3, '0')}</span>
            ) : null}
          </div>
          {status && !error ? (
            <span className="command-score">
              {status.score}
              <small>/100</small>
            </span>
          ) : null}
        </div>

        <div className="command-actions">
          <a className="button primary compact" href="#scan">
            <Camera size={15} aria-hidden="true" />
            Scan vitals
          </a>
          <button type="button" className="button secondary compact" onClick={openProtocols}>
            <ShieldAlert size={15} aria-hidden="true" />
            Protocols
          </button>
        </div>
      </div>
    </section>
  )
}
