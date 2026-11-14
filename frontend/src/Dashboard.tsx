import { useState } from 'react'
import { ArrowUpRight, Orbit } from 'lucide-react'
import { api, isMock } from './api/client'
import { useResource } from './hooks/useResource'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { CheckinForm } from './components/CheckinForm'
import { Monitors } from './components/Monitors'
import { SpaceWeather } from './components/SpaceWeather'
import { DecisionSupport } from './components/DecisionSupport'
import { Inventory } from './components/Inventory'
import { Evidence } from './components/Evidence'

export default function Dashboard() {
  const status=useResource(api.status)
  const history=useResource(api.checkins)
  const events=useResource(api.events)
  const inventory=useResource(api.inventory)
  const evidence=useResource(api.evidence)
  const predictions=useResource(api.predictions)
  const [protocolId,setProtocolId]=useState('crew-check-in')
  function openProtocol(id='crew-check-in') {
    setProtocolId(id)
    document.getElementById('protocols')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})
  }
  async function onSaved() { await Promise.all([status.reload(),history.reload(),predictions.reload()]) }
  return <>
    <a href="#main" className="skip-link">Skip to content</a>
    <Header crew={status.data?.crew_name}/>
    <main id="main">
      <Hero status={status.data} loading={status.loading} error={status.error} retry={()=>void status.reload()} openProtocols={()=>openProtocol()}/>
      <CheckinForm history={history.data} historyError={history.error} retryHistory={()=>void history.reload()} onSaved={onSaved}/>
      <Monitors status={status.data} loading={status.loading} error={status.error} retry={()=>void status.reload()} predictions={predictions.data} predictionError={predictions.error} retryPredictions={()=>void predictions.reload()} openProtocol={openProtocol}/>
      <SpaceWeather events={events.data} loading={events.loading} error={events.error} retry={()=>void events.reload()}/>
      <DecisionSupport protocolId={protocolId} onProtocolChange={setProtocolId} inventory={inventory.data} inventoryError={inventory.error}/>
      <Inventory items={inventory.data} loading={inventory.loading} error={inventory.error} reload={inventory.reload}/>
      <Evidence items={evidence.data} loading={evidence.loading} error={evidence.error} retry={()=>void evidence.reload()}/>
    </main>
    <footer className="site-footer page-width">
      <div className="footer-top"><a href="#overview" className="wordmark"><Orbit size={24} strokeWidth={1.3} aria-hidden="true"/>ASTRA-MED</a><a href="#overview" className="back-to-top">Back to orbit<ArrowUpRight size={15} aria-hidden="true"/></a></div>
      <div className="footer-bottom"><p>SI disclosure: simulated interface for exploration research. {isMock?'All crew data, scores, events and protocols are illustrative.':'Backend API mode; intended for simulated crew data only.'} AI-assisted design and development; AI-generated Earth illustration.</p><p>Not a substitute for flight surgeon care.<br/>No clinical diagnosis or autonomous treatment.</p></div>
    </footer>
  </>
}
