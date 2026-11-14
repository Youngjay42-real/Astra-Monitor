import { useRef, useState, type FormEvent } from 'react'
import { ArrowRight, Check, ChevronDown } from 'lucide-react'
import { api, errorMessage, isMock } from '../api/client'
import { checkinInputSchema, type Checkin } from '../api/schemas'
import { ErrorNotice, formatDate } from './ui'

const fields = [
  { name: 'heart_rate', label: 'Heart rate', unit: 'bpm', min: 20, max: 250, step: 1, placeholder: '72' },
  { name: 'bp_sys', label: 'BP · systolic', unit: 'mmHg', min: 40, max: 300, step: 1, placeholder: '118' },
  { name: 'bp_dia', label: 'BP · diastolic', unit: 'mmHg', min: 20, max: 200, step: 1, placeholder: '76' },
  { name: 'spo2', label: 'SpO₂', unit: '%', min: 50, max: 100, step: 0.1, placeholder: '98' },
  { name: 'sleep_hours', label: 'Sleep', unit: 'hours', min: 0, max: 24, step: 0.1, placeholder: '5.5' },
  { name: 'exercise_minutes', label: 'Exercise', unit: 'min', min: 0, max: 1440, step: 1, placeholder: '15' },
] as const

export function CheckinForm({ history, historyError, retryHistory, onSaved }: { history?: Checkin[]; historyError: string; retryHistory: () => void; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const latest = history?.toSorted((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0]
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setSaved(false)
    setError('')
    const values = new FormData(event.currentTarget)
    const numericFields = Object.fromEntries([...fields.map((field) => field.name), 'mood'].map((name) => [name, Number(values.get(name))]))
    const parsed = checkinInputSchema.safeParse({ ...numericFields, symptoms: values.get('symptoms') ?? '' })
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Please check your values.'); return }
    setBusy(true)
    try { await api.saveCheckin(parsed.data); setSaved(true); formRef.current?.reset(); await onSaved() }
    catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }
  return <section id="check-in" className="checkin-section section page-width" aria-labelledby="checkin-title">
    <div className="checkin-intro"><span className="section-number">01 / DAILY LOG</span><h2 id="checkin-title">Your daily<br />check-in</h2><p>A moment for you.<br />A clearer picture for your crew.</p>
      <p className="last-checkin">LAST CHECK-IN<br /><span>{latest ? formatDate(latest.created_at, true) : 'No check-ins yet'}</span></p>
      <p className="fine-print">{isMock ? 'Use simulated values only. Demo scores stay fixed after saving.' : 'Exploration decision support. Use simulated crew data only.'}</p>
      <ErrorNotice error={historyError} retry={retryHistory} />
    </div>
    <div className="checkin-workspace"><form ref={formRef} onSubmit={submit} aria-label="Daily check-in" className="checkin-form" onChange={() => { setSaved(false); setError('') }}>
      {fields.map((field) => <label key={field.name} className="field"><span>{field.label}<small>{field.unit}</small></span><input required name={field.name} type="number" inputMode="decimal" min={field.min} max={field.max} step={field.step} placeholder={field.placeholder} disabled={busy} /></label>)}
      <label className="field mood-field"><span>Mood<small>1–5</small></span><select name="mood" defaultValue="" required disabled={busy}><option value="" disabled>Select mood</option><option value="1">1 · Very low</option><option value="2">2 · Low</option><option value="3">3 · Steady</option><option value="4">4 · Good</option><option value="5">5 · Great</option></select></label>
      <label className="field symptom-field"><span>Symptoms<small>optional</small></span><input name="symptoms" maxLength={1000} placeholder="How are you feeling?" disabled={busy} /></label>
      <div className="form-bottom"><span className="fine-print">Consistent logs help you see changes over time.</span><button className={`button primary ${saved ? 'saved' : ''}`} disabled={busy} type="submit">{busy ? 'Saving…' : saved ? 'Check-in saved' : 'Save check-in'}{saved ? <Check size={16} aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}</button></div>
      <div className="form-feedback" aria-live="polite">{saved ? <p className="success-message">Check-in saved{isMock ? ' in the demo' : ''}. Mission data refreshed.</p> : null}<ErrorNotice error={error} /></div>
    </form>
    {history?.length ? <details className="checkin-history"><summary>Recent check-ins <span>{history.length} logged<ChevronDown size={14} aria-hidden="true" /></span></summary><div className="history-scroll"><table><thead><tr><th scope="col">Logged (UTC)</th><th scope="col">HR</th><th scope="col">BP</th><th scope="col">SpO₂</th><th scope="col">Sleep</th><th scope="col">Mood</th><th scope="col">Exercise</th><th scope="col">Symptoms</th></tr></thead><tbody>{history.toSorted((a,b) => Date.parse(b.created_at)-Date.parse(a.created_at)).slice(0,5).map((entry) => <tr key={entry.id}><td>{formatDate(entry.created_at, true)}</td><td>{entry.heart_rate} bpm</td><td>{entry.bp_sys}/{entry.bp_dia}</td><td>{entry.spo2}%</td><td>{entry.sleep_hours} h</td><td>{entry.mood}/5</td><td>{entry.exercise_minutes} min</td><td>{entry.symptoms || 'None reported'}</td></tr>)}</tbody></table></div></details> : null}
    </div>
  </section>
}
