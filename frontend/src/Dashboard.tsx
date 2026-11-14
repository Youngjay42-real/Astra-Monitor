import { useEffect, useState } from 'react'
import { ArrowUpRight, Orbit } from 'lucide-react'
import { api } from './api/client'
import { useResource } from './hooks/useResource'
import type { CheckinInput } from './api/schemas'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { ScanConsole } from './components/ScanConsole'
import { CheckinForm } from './components/CheckinForm'
import { Monitors } from './components/Monitors'
import { SpaceWeather } from './components/SpaceWeather'
import { DecisionSupport } from './components/DecisionSupport'
import { Inventory } from './components/Inventory'
import { Evidence } from './components/Evidence'
import { syncMissionFromUrl } from './lib/mission'

export default function Dashboard() {
  useEffect(() => {
    syncMissionFromUrl()
  }, [])

  const status = useResource(api.status, { pollMs: 8000 })
  const history = useResource(api.checkins, { pollMs: 5000 })
  const events = useResource(api.events)
  const inventory = useResource(api.inventory)
  const evidence = useResource(api.evidence)
  const predictions = useResource(api.predictions, { pollMs: 8000 })
  const [protocolId, setProtocolId] = useState('crew-check-in')
  const [draft, setDraft] = useState<CheckinInput | null>(null)
  const [draftKey, setDraftKey] = useState(0)

  function openProtocol(id = 'crew-check-in') {
    setProtocolId(id)
    document.getElementById('protocols')?.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    })
  }

  async function onSaved() {
    await Promise.all([status.reload(), history.reload(), predictions.reload()])
  }

  function onExtracted(next: CheckinInput) {
    setDraft(next)
    setDraftKey((k) => k + 1)
  }

  const linkState = status.loading ? 'loading' : status.error ? 'offline' : 'live'

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Header crew={status.data?.crew_name} linkState={linkState} />
      <main id="main" className="dashboard-main">
        <Hero
          status={status.data}
          loading={status.loading}
          error={status.error}
          openProtocols={() => openProtocol()}
        />

        <div className="observe-band">
          <ScanConsole onExtracted={onExtracted} />
          <CheckinForm
            history={history.data}
            historyError={history.error}
            retryHistory={() => void history.reload()}
            onSaved={onSaved}
            draft={draft}
            draftKey={draftKey}
          />
        </div>

        <Monitors
          status={status.data}
          loading={status.loading}
          error={status.error}
          retry={() => void status.reload()}
          predictions={predictions.data}
          predictionError={predictions.error}
          retryPredictions={() => void predictions.reload()}
          openProtocol={openProtocol}
        />

        <div className="act-band" id="protocols-band">
          <DecisionSupport
            protocolId={protocolId}
            onProtocolChange={setProtocolId}
            inventory={inventory.data}
            inventoryError={inventory.error}
          />
          <Inventory
            items={inventory.data}
            loading={inventory.loading}
            error={inventory.error}
            reload={inventory.reload}
          />
        </div>

        <section id="context" className="context-band section page-width" aria-label="Mission context">
          <SpaceWeather
            events={events.data}
            loading={events.loading}
            error={events.error}
            retry={() => void events.reload()}
          />
          <Evidence
            items={evidence.data}
            loading={evidence.loading}
            error={evidence.error}
            retry={() => void evidence.reload()}
          />
        </section>
      </main>
      <footer className="site-footer page-width">
        <div className="footer-top">
          <a href="#overview" className="wordmark">
            <Orbit size={24} strokeWidth={1.3} aria-hidden="true" />
            ASTRA-MED
          </a>
          <a href="#overview" className="back-to-top">
            Back to console
            <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </div>
        <div className="footer-bottom">
          <p>
            SI disclosure: simulated interface for exploration research. Backend API mode; intended for
            simulated crew data only. AI-assisted design and development; demo image scan is not clinical
            imaging.
          </p>
          <p>
            Not a substitute for flight surgeon care.
            <br />
            No clinical diagnosis or autonomous treatment.
          </p>
        </div>
      </footer>
    </>
  )
}
