import { ArrowUpRight } from 'lucide-react'
import { isMock } from '../api/client'
import { domainNames, type DomainName, type Prediction, type Status } from '../api/schemas'
import { ErrorNotice, Loading } from './ui'

function Sparkline({ values, label }: { values?: number[]; label: string }) {
  if (!values) return <span className="fine-print">Not supplied</span>
  const points = values.map((v, i) => `${(i / (values.length - 1) * 132).toFixed(1)},${(34 - v / 100 * 30).toFixed(1)}`).join(' ')
  return <svg className="sparkline" viewBox="0 0 136 40" role="img" aria-label={`${label} recent scores: ${values.join(', ')}`}><path d="M0 36H136" className="sparkline-base" /><polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" /><circle cx="132" cy={34-values[values.length-1]/100*30} r="2.5" fill="currentColor" /></svg>
}
export function Monitors({ status, loading, error, retry, predictions, predictionError, retryPredictions, openProtocol }: { status?: Status; loading: boolean; error: string; retry: () => void; predictions?: Prediction[]; predictionError: string; retryPredictions: () => void; openProtocol: (id: string) => void }) {
  const labels: Record<DomainName, string> = { radiation: 'Radiation', bone: 'Bone', cardio: 'Cardio', immune: 'Immune', behavioral: 'Behavioral' }
  return <section className="monitor-section section page-width" aria-labelledby="monitor-title"><div className="section-heading"><div><span className="section-number">02 / DOMAIN MONITORS</span><h2 id="monitor-title">Health, across five domains</h2></div><p className="fine-print">{isMock ? 'Illustrative scores & trends' : 'Scores & trends from the API'}<br />Higher scores indicate more attention in this demo.</p></div>
    <ErrorNotice error={error} retry={retry} />{loading && !status ? <Loading /> : null}
    {status ? <div className="domain-table"><div className="domain-table-head"><span>DOMAIN</span><span>SCORE /100</span><span>RECENT TREND</span><span>STATUS</span><span>RECOMMENDED ACTION</span></div>{domainNames.map((name, index) => { const domain=status.domains[name]; return <div className={`domain-row ${name === 'radiation' || name === 'behavioral' ? 'attention' : ''}`} key={name}><div className="domain-name"><span className="domain-index">0{index+1}</span><h3>{labels[name]}</h3></div><span className="domain-score">{domain.score}<small>/100</small></span><Sparkline values={domain.history} label={labels[name]} /><span className="domain-label"><span className="status-dot" />{domain.label}</span><button className="domain-action" onClick={() => openProtocol(name === 'radiation' ? 'radiation' : 'crew-check-in')}>{domain.action ?? 'Review mission guidance'}<ArrowUpRight size={15} aria-hidden="true" /></button></div> })}</div> : null}
    <ErrorNotice error={predictionError} retry={retryPredictions} />{predictions?.length ? <div className="prediction-notes"><span className="mono">LOOKING AHEAD</span>{predictions.map((prediction) => <p key={prediction.id}><span className="status-dot" />{prediction.label}</p>)}</div> : null}
    {status?.actions.length ? <div className="top-actions"><span className="mono">PRIORITY ACTIONS</span><ol>{status.actions.toSorted((a,b) => a.priority-b.priority).map((action,index) => <li key={`${action.priority}-${index}`}>{action.text}</li>)}</ol></div> : null}
    <p className="fine-print monitor-disclaimer">Exploration decision support, not a clinical diagnosis. Scores are not calibrated medical risk.</p>
  </section>
}
