import { lazy, Suspense, useState } from 'react'
import { ArrowRight, ArrowUpRight, Bone, Brain, HeartPulse, Menu, Radiation, Shield, Sparkles, X } from 'lucide-react'
import { api, isMock } from './api/client'
import type { DomainName } from './api/schemas'
import { useResource } from './hooks/useResource'
import './App.css'

const EarthGlobe = lazy(() => import('./components/EarthGlobe'))
const domains = [
  { key: 'radiation', label: 'Radiation', icon: Radiation },
  { key: 'bone', label: 'Bone health', icon: Bone },
  { key: 'cardio', label: 'Cardiovascular', icon: HeartPulse },
  { key: 'immune', label: 'Immune', icon: Shield },
  { key: 'behavioral', label: 'Behavioral', icon: Brain },
] as const

function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [selectedDomain, setSelectedDomain] = useState<DomainName>()
  const status = useResource(api.status)
  const evidence = useResource(api.evidence)
  const checkins = useResource(api.checkins)
  const selected = selectedDomain && status.data?.domains[selectedDomain]

  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <div className="home-sky" aria-hidden="true" />
    <header className="site-header">
      <a className="wordmark" href="#overview" aria-label="Astra Med home"><Sparkles aria-hidden="true" /><span>ASTRA MED</span></a>
      <button className="menu-toggle icon-button" type="button" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="main-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
      <nav id="main-navigation" className={menuOpen ? 'main-nav is-open' : 'main-nav'} aria-label="Main navigation" onClick={() => setMenuOpen(false)}>
        <a href="#overview">Overview</a><a href="#crew-health">Crew health</a><a href="#research">Research</a><a href="#mission-log">Mission log</a>
      </nav>
      <a className="button button-outline workspace-button" href="/dashboard.html">Open workspace<ArrowUpRight size={15} aria-hidden="true" /></a>
    </header>
    <main id="main">
      <section className="hero" id="overview" aria-labelledby="hero-title">
        <div className="hero-copy">
          <h1 id="hero-title">A world away.<br />Still human.</h1>
          <p>Explore the science that keeps people healthy beyond our home planet.</p>
          <div className="hero-actions"><a className="button button-primary" href="#crew-health">Explore crew health</a><a className="text-link" href="#research">Browse NASA research<ArrowRight size={21} aria-hidden="true" /></a></div>
        </div>
        <div className="hero-planet"><Suspense fallback={<div className="earth-poster" role="status"><img src="/textures/earth-fallback.jpg" alt="Earth in NASA's Blue Marble composite" /><span>Preparing your view of Earth…</span></div>}><EarthGlobe /></Suspense></div>
        <div className="hero-bottom"><span className="scroll-hint">Drag to explore · Scroll to zoom</span><a href="https://svs.gsfc.nasa.gov/2915/" target="_blank" rel="noreferrer">Imagery: NASA Blue Marble<ArrowUpRight size={12} aria-hidden="true" /></a></div>
      </section>
      <section className="health-section page-section" id="crew-health" aria-labelledby="health-title">
        <div className="health-strip"><div className="health-intro"><h2 id="health-title">Mission health,<br className="health-break" /> in perspective.</h2><p>{isMock ? 'Sample mission · Demo data' : 'Connected mission data'}</p></div><div className="domain-tabs" role="group" aria-label="Explore health domains">{domains.map(({ key, label, icon: Icon }) => <button type="button" key={key} className={selectedDomain === key ? 'domain-tab selected' : 'domain-tab'} aria-pressed={selectedDomain === key} onClick={() => setSelectedDomain(selectedDomain === key ? undefined : key)}><Icon size={29} strokeWidth={1.3} aria-hidden="true" /><span>{label}</span></button>)}</div></div>
        {status.error && <div className="resource-error" role="alert">{status.error}<button className="text-link" onClick={() => void status.reload()}>Retry</button></div>}
        {selectedDomain && status.loading && <p className="domain-detail" role="status">Loading mission health…</p>}
        {selected && <div className="domain-detail" aria-live="polite"><div><span className="small-label">{domains.find((domain) => domain.key === selectedDomain)?.label}</span><h3>{selected.label}</h3><p>{selected.action}</p></div><div className="domain-score"><span>{selected.score}<small> / 100</small></span><p>{isMock ? 'Sample risk signal' : 'Risk signal'}</p><div className="score-track"><span style={{ width: `${selected.score}%` }} /></div></div></div>}
      </section>
      <section className="research-section page-section" id="research" aria-labelledby="research-title">
        <div className="section-heading"><div><span className="section-number">01 / RESEARCH</span><h2 id="research-title">Science behind<br />the mission.</h2></div><p>Follow the evidence. Explore NASA’s public research libraries and the questions shaping human spaceflight.</p></div>
        {evidence.loading && <p className="resource-message" role="status">Loading research libraries…</p>}
        {evidence.error && <div className="resource-error" role="alert">{evidence.error}<button className="text-link" onClick={() => void evidence.reload()}>Retry</button></div>}
        <div className="research-list">{evidence.data?.map((item, index) => <a href={item.url} key={item.id} target="_blank" rel="noreferrer" className="research-row"><span className="research-index">0{index + 1}</span><div><span className="small-label">{item.source}</span><h3>{item.title}</h3><p>{item.description}</p></div><ArrowUpRight size={26} strokeWidth={1.3} aria-hidden="true" /></a>)}</div>
      </section>
      <section className="log-section page-section" id="mission-log" aria-labelledby="log-title">
        <div className="section-heading"><div><span className="section-number">02 / MISSION LOG</span><h2 id="log-title">Every day.<br />Every small signal.</h2></div><div className="log-intro"><p>A place to record the human experience of a mission, one check-in at a time.</p><a className="button button-outline" href="/dashboard.html#check-in">Record a check-in<ArrowUpRight size={16} aria-hidden="true" /></a></div></div>
        <div className="log-caption"><span>{isMock ? 'SIMULATED CREW RECORDS' : 'CREW RECORDS'}</span><span>{checkins.data?.length ?? '—'} CHECK-INS</span></div>
        {checkins.loading && <p className="resource-message" role="status">Loading mission log…</p>}
        {checkins.error && <div className="resource-error" role="alert">{checkins.error}<button className="text-link" onClick={() => void checkins.reload()}>Retry</button></div>}
        {checkins.data?.length === 0 && <p className="resource-message">Your mission log is ready for its first check-in.</p>}
        <div className="log-records">{checkins.data?.slice(0, 5).map((item) => <article className="log-record" key={item.id}><div className="log-date"><time dateTime={item.created_at}>{new Intl.DateTimeFormat('en', { month: 'short', day: '2-digit' }).format(new Date(item.created_at))}</time><span>{new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' }).format(new Date(item.created_at))}</span></div><div><span className="small-label">Heart rate</span><p>{item.heart_rate}<small> bpm</small></p></div><div><span className="small-label">Blood oxygen</span><p>{item.spo2}<small> %</small></p></div><div><span className="small-label">Sleep</span><p>{item.sleep_hours}<small> hours</small></p></div><p className="log-symptoms">{item.symptoms || 'No symptoms recorded'}</p></article>)}</div>
      </section>
    </main>
    <footer className="site-footer"><a className="wordmark" href="#overview"><Sparkles size={20} aria-hidden="true" />ASTRA MED</a><p>An independent space-health learning project.</p><a href="https://science.nasa.gov/" target="_blank" rel="noreferrer">Keep exploring<ArrowUpRight size={14} aria-hidden="true" /></a></footer>
  </>
}
export default App
