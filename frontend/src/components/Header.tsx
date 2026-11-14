import { Orbit } from 'lucide-react'
import { isMock } from '../api/client'

export function Header({ crew }: { crew?: string }) {
  return <header className="site-header"><div className="header-inner page-width">
    <a href="#overview" className="wordmark" aria-label="ASTRA-MED overview"><Orbit size={29} strokeWidth={1.3} aria-hidden="true" /><span>ASTRA-MED</span></a>
    <nav aria-label="Main navigation"><a href="#overview">Overview</a><a href="#check-in">Check-in</a><a href="#protocols">Protocols</a><a href="#inventory">Inventory</a></nav>
    <div className="crew-context"><span className="data-mode"><span className="status-dot" />{isMock ? 'SIMULATED DATA' : 'API CONNECTED MODE'}</span><span className="crew-name">{crew ?? 'Crew dashboard'}</span></div>
  </div></header>
}
