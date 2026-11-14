import { ArrowDown, ArrowRight } from 'lucide-react'
import type { Status } from '../api/schemas'
import { ErrorNotice } from './ui'

const labels = { nominal: 'Nominal — all systems in view', caution: 'Caution — attention recommended', critical: 'Critical — immediate review required' }
export function Hero({ status, loading, error, retry, openProtocols }: { status?: Status; loading: boolean; error: string; retry: () => void; openProtocols: () => void }) {
  return <section id="overview" className="hero" aria-labelledby="hero-title">
    <div className="hero-inner page-width"><div className="hero-copy">
      <h1 id="hero-title">ASTRA-MED</h1><h2>Crew health. Mission ready.</h2>
      <p className="hero-description">Your health, in view. Decision support<br className="desktop-break" /> for the journey beyond Earth.</p>
      <p className={`mission-status ${status?.overall ?? 'unavailable'}`} key={status?.overall} role="status"><span className="status-dot" />{error ? 'Status unavailable' : loading ? 'Connecting to mission data…' : status ? labels[status.overall] : 'Status unavailable'}</p>
      <ErrorNotice error={error} retry={retry} />
      <div className="hero-actions"><a className="button primary" href="#check-in">Log check-in<ArrowDown size={16} aria-hidden="true" /></a><button className="button secondary" onClick={openProtocols}>Open protocols<ArrowRight size={16} aria-hidden="true" /></button></div>
    </div><div className="hero-caption"><span>EXPLORATION HEALTH SUPPORT</span><span>Mission day <strong>{status ? String(status.mission_day).padStart(3, '0') : '—'}</strong></span></div></div>
  </section>
}
