import { useCallback, useState, type FormEvent } from 'react'
import { ArrowRight, Check, ShieldCheck } from 'lucide-react'
import { api, errorMessage, isMock } from '../api/client'
import { assessInputSchema, type Assessment, type InventoryItem, type Protocol } from '../api/schemas'
import { useResource } from '../hooks/useResource'
import { supplyWarnings } from '../lib/inventory'
import { ErrorNotice, Loading } from './ui'

function ProtocolChecklist({ protocol, inventory, inventoryError }: { protocol: Protocol; inventory?: InventoryItem[]; inventoryError: string }) {
  const [complete, setComplete] = useState<string[]>([])
  const warnings = inventory ? supplyWarnings(protocol, inventory) : []
  function toggle(id: string) { setComplete((current) => current.includes(id) ? current.filter((step) => step !== id) : [...current,id]) }
  return <div className="protocol-content"><div className="protocol-title"><ShieldCheck size={20} strokeWidth={1.5} aria-hidden="true" /><span className="mono">{isMock ? 'DEMO PROTOCOL' : 'MISSION PROTOCOL'}</span></div><h3>{protocol.title}</h3><p className="protocol-summary">{protocol.summary}</p><div className="protocol-progress"><span>{complete.length} of {protocol.steps.length} steps reviewed</span><span>{protocol.steps.length ? Math.round(complete.length/protocol.steps.length*100) : 0}%</span></div><div className="progress-track" aria-hidden="true"><span style={{ width: `${protocol.steps.length ? complete.length/protocol.steps.length*100 : 0}%` }} /></div>
    <div className="protocol-steps">{protocol.steps.map((step,index) => <label className={`protocol-step ${complete.includes(step.id) ? 'is-complete' : ''}`} key={step.id}><input type="checkbox" checked={complete.includes(step.id)} onChange={() => toggle(step.id)} /><span className="check-box" aria-hidden="true">{complete.includes(step.id) ? <Check size={13} /> : null}</span><span className="step-number">0{index+1}</span><span>{step.text}</span></label>)}</div>
    {complete.length === protocol.steps.length && protocol.steps.length > 0 ? <p className="success-message" role="status">Checklist reviewed. Follow up with mission medical support.</p> : null}
    {protocol.required_items.length ? <div className={`supply-notice ${warnings.length || inventoryError ? 'warning' : ''}`}><strong>REQUIRED SUPPLIES</strong>{inventoryError ? <p>Inventory unavailable. Supplies cannot be verified.</p> : !inventory ? <p>Checking medical inventory…</p> : warnings.length ? warnings.map((warning) => <p key={warning}>{warning}</p>) : <p>Required items are stocked and within their expiry dates.</p>}<a href="#inventory">Review medical inventory<ArrowRight size={13} aria-hidden="true" /></a></div> : null}
    <p className="fine-print">Step completion is local to this view and does not record treatment.</p>
  </div>
}

export function DecisionSupport({ protocolId, onProtocolChange, inventory, inventoryError }: { protocolId: string; onProtocolChange: (id: string) => void; inventory?: InventoryItem[]; inventoryError: string }) {
  const [symptoms,setSymptoms] = useState<string[]>([])
  const [assessment,setAssessment] = useState<Assessment>()
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const loadProtocol = useCallback((signal?: AbortSignal) => api.protocol(protocolId,signal), [protocolId])
  const protocol = useResource(loadProtocol)
  function toggle(symptom: string) { setSymptoms((current) => current.includes(symptom) ? current.filter((s) => s!==symptom) : [...current,symptom]); setAssessment(undefined); setError('') }
  async function assess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const form = new FormData(event.currentTarget)
    const parsed = assessInputSchema.safeParse({ symptoms, severity: form.get('severity'), notes: form.get('notes') })
    if (!parsed.success) { setError('Select at least one symptom before continuing.'); return }
    setError(''); setBusy(true)
    try { const result = await api.assess(parsed.data); setAssessment(result); const first = result.guidance.toSorted((a,b) => a.rank-b.rank)[0]; if (first) onProtocolChange(first.protocol_id) }
    catch(cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }
  return <section id="protocols" className="decision-section section page-width" aria-labelledby="decision-title"><div className="assessment-workspace"><span className="section-number">03 / ACT</span><h2 id="decision-title">From signals<br />to next steps</h2><p className="section-description">Turn what you observed into a clear protocol path.</p><p className="medical-disclaimer">Exploration decision support, not a clinical diagnosis. Follow mission-approved procedures and consult mission medical support.</p>
    <form onSubmit={assess} aria-label="Symptom assessment"><fieldset className="symptoms-fieldset" disabled={busy}><legend>SELECT SYMPTOMS</legend><div className="symptom-options">{['Headache','Fatigue','Nausea','Dizziness'].map((symptom) => <button type="button" className={symptoms.includes(symptom.toLowerCase()) ? 'selected' : ''} aria-pressed={symptoms.includes(symptom.toLowerCase())} key={symptom} onClick={() => toggle(symptom.toLowerCase())}>{symptom}{symptoms.includes(symptom.toLowerCase()) ? <Check size={14} aria-hidden="true" /> : null}</button>)}</div></fieldset><div className="assessment-fields"><label className="field"><span>Severity</span><select name="severity" defaultValue="moderate" disabled={busy} onChange={() => setAssessment(undefined)}><option value="mild">Mild</option><option value="moderate">Moderate</option><option value="severe">Severe</option></select></label><label className="field"><span>Notes<small>optional</small></span><textarea name="notes" maxLength={1000} rows={3} disabled={busy} placeholder="Onset, duration, or anything else to note…" onChange={() => setAssessment(undefined)} /></label></div><button className="button primary" disabled={busy} type="submit">{busy ? 'Assessing…' : 'Assess symptoms'}<ArrowRight size={16} aria-hidden="true" /></button><ErrorNotice error={error} /></form>
    {assessment ? <div className="assessment-results" aria-live="polite"><h3>Ranked guidance</h3>{isMock ? <p className="fine-print">Fixed demo response; symptoms do not determine a diagnosis.</p> : null}{assessment.guidance.length === 0 ? <p>No guidance was returned. Consult mission medical support.</p> : <ol>{assessment.guidance.toSorted((a,b) => a.rank-b.rank).map((guidance,index) => <li key={`${guidance.rank}-${index}`}><span className="guidance-rank">0{guidance.rank}</span><div><h4>{guidance.title}</h4><p>{guidance.detail}</p><button type="button" className="text-button" onClick={() => onProtocolChange(guidance.protocol_id)}>Open related protocol<ArrowRight size={13} aria-hidden="true" /></button></div></li>)}</ol>}</div> : null}
  </div><aside className="protocol-panel" aria-label="Protocol checklist"><ErrorNotice error={protocol.error} retry={() => void protocol.reload()} />{protocol.loading ? <Loading>Loading protocol…</Loading> : protocol.error ? null : protocol.data ? <ProtocolChecklist key={protocol.data.id} protocol={protocol.data} inventory={inventory} inventoryError={inventoryError} /> : null}</aside></section>
}
