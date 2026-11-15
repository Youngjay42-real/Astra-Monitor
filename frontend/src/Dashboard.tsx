import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Camera,
  Copy,
  Home,
  LoaderCircle,
  Moon,
  Send,
  Sparkles,
  Square,
  Upload,
} from 'lucide-react'
import { api, errorMessage } from './api/client'
import type { MissionChatTurn, SessionStatus } from './api/schemas'
import { useResource } from './hooks/useResource'
import { extractVitalsFromImage } from './lib/scanVitals'
import { qrImageUrl, syncMissionFromUrl } from './lib/mission'
import {
  getOrCreatePairId,
  getPairIdFromUrl,
  isPhoneDeviceFromUrl,
  phonePairUrl,
} from './lib/sessionPair'

type Mode = 'assess' | 'sleep'

type TimelineEvent = { id: string; at: string; title: string; detail: string }

function friendlyError(error: unknown): string {
  const raw = errorMessage(error)
  if (/api|gemini|endpoint|configured|json/i.test(raw)) {
    return "The assistant isn't available right now. Please try again."
  }
  if (/camera|permission/i.test(raw)) return 'Allow camera access on your phone to use visual checks.'
  return raw.length > 160 ? 'Something went wrong. Please try again.' : raw
}

async function blobToFrame(blob: Blob) {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return { mime_type: blob.type || 'image/jpeg', data_base64: btoa(binary) }
}

function captureFrame(video: HTMLVideoElement): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth || 720
  canvas.height = video.videoHeight || 1280
  const ctx = canvas.getContext('2d')
  if (!ctx || !video.videoWidth) return Promise.resolve(null)
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85))
}

function formatVisualReply(mode: Mode, next: Awaited<ReturnType<typeof api.observeScan>>): string {
  const parts = [`${next.condition}`]
  if (next.height_cm != null) parts.push(`Height looks around ${Math.round(next.height_cm)} cm.`)
  if (next.temperature_c != null) parts.push(`Temperature cue ~${next.temperature_c.toFixed(1)} °C.`)
  else if (next.temperature_note) parts.push(next.temperature_note)
  if (mode === 'sleep' && next.sleep_note) parts.push(next.sleep_note)
  for (const o of next.observations) parts.push(o)
  parts.push('Exploratory guidance only — not a diagnosis.')
  return parts.join(' ')
}

const DOMAIN_LABELS = {
  radiation: 'Radiation',
  bone: 'Bone',
  cardio: 'Cardio',
  immune: 'Immune',
  behavioral: 'Behavioral',
} as const

export default function Dashboard() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const sleepTimer = useRef(0)
  const endRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [missionCode] = useState(() => syncMissionFromUrl())
  const [pairId] = useState(() => getOrCreatePairId())
  const isPhoneSession = isPhoneDeviceFromUrl() || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  const pairUrl = useMemo(
    () => phonePairUrl(window.location.origin, missionCode, pairId),
    [missionCode, pairId],
  )

  const status = useResource(api.status, { pollMs: 8000 })
  const checkins = useResource(api.checkins, { pollMs: 10000 })
  const predictions = useResource(api.predictions, { pollMs: 12000 })

  const [session, setSession] = useState<SessionStatus | null>(null)
  const [live, setLive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sleeping, setSleeping] = useState(false)
  const [input, setInput] = useState('')
  const [lastTemp, setLastTemp] = useState<number | null>(null)
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [turns, setTurns] = useState<MissionChatTurn[]>([
    {
      role: 'assistant',
      content:
        "Welcome aboard. Scan the QR on a desktop to link your phone, or talk to me about the crew and medical kit. On your phone, enable the camera for visual checks.",
    },
  ])

  const addTimeline = useCallback((title: string, detail: string) => {
    setTimeline((t) => [
      {
        id: `${Date.now()}-${title}`,
        at: new Date().toISOString(),
        title,
        detail,
      },
      ...t,
    ].slice(0, 40))
  }, [])

  useEffect(() => {
    const device = isPhoneSession ? 'phone' : 'desktop'
    void api
      .registerSession(pairId, { device, mission: missionCode })
      .then(setSession)
      .catch(() => undefined)
  }, [pairId, missionCode, isPhoneSession])

  useEffect(() => {
    if (isPhoneSession) return
    const id = window.setInterval(() => {
      void api.sessionStatus(pairId).then(setSession).catch(() => undefined)
    }, 3000)
    return () => window.clearInterval(id)
  }, [pairId, isPhoneSession])

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    window.clearInterval(sleepTimer.current)
    setLive(false)
    setSleeping(false)
  }

  useEffect(() => () => stopCamera(), [])

  function scrollChat() {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  function push(role: MissionChatTurn['role'], content: string) {
    setTurns((t) => [...t, { role, content }])
    queueMicrotask(scrollChat)
  }

  async function openPhoneCamera() {
    stopCamera()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: isPhoneSession ? 'user' : 'environment' },
          width: { ideal: 1080 },
          height: { ideal: 1920 },
        },
        audio: false,
      })
      streamRef.current = stream
      setLive(true)
      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        video.setAttribute('playsinline', 'true')
        await video.play()
      }
      if (isPhoneSession) {
        void api.registerSession(pairId, { device: 'phone', mission: missionCode }).then(setSession)
      }
      push('assistant', 'Camera is live. Tap Check on me for a wellness pass, or ask me anything.')
      addTimeline('Camera', 'Phone camera enabled')
    } catch {
      push('assistant', friendlyError(new Error('camera permission')))
    }
  }

  async function runVisualCheck(mode: Mode) {
    const video = videoRef.current
    if (!video || !streamRef.current) {
      push('assistant', 'Turn on the camera first (use your phone for crew assessment).')
      return
    }
    setBusy(true)
    try {
      const blob = await captureFrame(video)
      if (!blob) throw new Error('capture')
      const frame = await blobToFrame(blob)
      const next = await api.observeScan({ frames: [frame], mode })
      if (next.temperature_c != null) setLastTemp(next.temperature_c)
      push('assistant', formatVisualReply(mode, next))
      addTimeline(mode === 'sleep' ? 'Sleep watch' : 'Visual assess', next.condition)
    } catch (cause) {
      push('assistant', friendlyError(cause))
    } finally {
      setBusy(false)
    }
  }

  function startSleepWatch() {
    if (!streamRef.current) {
      push('assistant', 'Turn on the camera first.')
      return
    }
    setSleeping(true)
    push('assistant', "Sleep watch is on — I'll glance every 45 seconds.")
    addTimeline('Sleep watch', 'Monitoring started')
    void runVisualCheck('sleep')
    window.clearInterval(sleepTimer.current)
    sleepTimer.current = window.setInterval(() => {
      if (!busy) void runVisualCheck('sleep')
    }, 45_000)
  }

  function stopSleepWatch() {
    window.clearInterval(sleepTimer.current)
    setSleeping(false)
    push('assistant', 'Sleep watch stopped.')
    addTimeline('Sleep watch', 'Monitoring stopped')
  }

  async function sendMessage() {
    const message = input.trim()
    if (!message || busy) return
    setInput('')
    push('user', message)
    setBusy(true)
    try {
      const history = turns.filter((t) => t.content.length > 0).slice(-12)
      const out = await api.missionChat({ message, history })
      let reply = out.reply
      if (out.inventory_updates.length > 0) {
        const names = out.inventory_updates
          .map((u) => {
            const item = out.inventory.find((i) => i.id === u.sku)
            return item ? `${item.name} → ${u.quantity}` : `${u.sku} → ${u.quantity}`
          })
          .join('; ')
        reply += ` Kit updated: ${names}.`
        addTimeline('Med kit', names)
      }
      push('assistant', reply)
      addTimeline('Message', message.slice(0, 80))
    } catch (cause) {
      push('assistant', friendlyError(cause))
    } finally {
      setBusy(false)
    }
  }

  async function onFileChange(file: File | undefined) {
    if (!file) return
    setBusy(true)
    try {
      if (file.type.startsWith('image/')) {
        const frame = await blobToFrame(file)
        const next = await api.observeScan({ frames: [frame], mode: 'assess' })
        if (next.temperature_c != null) setLastTemp(next.temperature_c)
        push('assistant', `From your upload: ${formatVisualReply('assess', next)}`)
        addTimeline('Upload', `Image assessed — ${next.condition}`)
      } else {
        push('assistant', 'Please upload a photo (JPEG or PNG) for crew assessment.')
        return
      }
      const vitals = await extractVitalsFromImage(file)
      await api.saveCheckin(vitals)
      void checkins.reload({ silent: true })
      addTimeline('Vitals file', `Logged HR ${vitals.heart_rate} · SpO₂ ${vitals.spo2}%`)
    } catch (cause) {
      push('assistant', friendlyError(cause))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function copyPairLink() {
    try {
      await navigator.clipboard.writeText(pairUrl)
      addTimeline('Pairing', 'Invite link copied')
    } catch {
      /* ignore */
    }
  }

  const latest = checkins.data?.[0]
  const overall = status.data?.overall ?? 'nominal'
  const phoneLinked = Boolean(session?.phone_connected)

  return (
    <div className="mission-console">
      <header className="mc-top">
        <div className="mc-top-left">
          <a href="/" className="mc-home" aria-label="Back to home">
            <Sparkles size={16} aria-hidden />
            <Home size={15} aria-hidden />
            Home
          </a>
          <span className="mc-title">ASTRA-MED Mission Console</span>
          <span className="mc-mission-pill">Day {String(status.data?.mission_day ?? '—').padStart(3, '0')}</span>
        </div>
        <div className="mc-top-right">
          <span className={`mc-mission-pill ${overall === 'nominal' ? '' : ''}`} style={{ color: overall === 'critical' ? 'var(--critical)' : overall === 'caution' ? 'var(--amber)' : 'var(--mint)' }}>
            <Activity size={12} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} aria-hidden />
            {status.loading ? 'Syncing…' : overall.charAt(0).toUpperCase() + overall.slice(1)}
          </span>
          <span className="mc-mission-pill">{status.data?.crew_name ?? 'Crew'}</span>
        </div>
      </header>

      <div className="mc-grid">
        <aside className="mc-panel mc-col-vitals">
          <div className="mc-panel-head">Live vitals</div>
          <div className="mc-panel-body">
            <div className="mc-vitals-grid">
              <div className="mc-vital">
                <span>Heart rate</span>
                <strong>
                  {latest?.heart_rate ?? '—'}
                  <small>bpm</small>
                </strong>
              </div>
              <div className="mc-vital">
                <span>Blood pressure</span>
                <strong>
                  {latest ? `${latest.bp_sys}/${latest.bp_dia}` : '—'}
                  <small>mmHg</small>
                </strong>
              </div>
              <div className="mc-vital">
                <span>SpO₂</span>
                <strong>
                  {latest?.spo2 ?? '—'}
                  <small>%</small>
                </strong>
              </div>
              <div className="mc-vital">
                <span>Temp cue</span>
                <strong>
                  {lastTemp != null ? lastTemp.toFixed(1) : '—'}
                  <small>°C</small>
                </strong>
              </div>
            </div>
            {status.data
              ? (Object.keys(DOMAIN_LABELS) as (keyof typeof DOMAIN_LABELS)[]).map((key) => {
                  const d = status.data!.domains[key]
                  return (
                    <div className="mc-domain-card" key={key}>
                      <header>
                        <span>{DOMAIN_LABELS[key]}</span>
                        <strong>{Math.round(d.score)}</strong>
                      </header>
                      <div className="bar">
                        <i style={{ width: `${d.score}%` }} />
                      </div>
                      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>{d.label}</p>
                    </div>
                  )
                })
              : null}
          </div>
        </aside>

        <section className="mc-col-center">
          <div className="mc-panel mc-desktop-only">
            <div className="mc-panel-head">Connect phone</div>
            <div className="mc-pair">
              <div className="mc-qr">
                <img src={qrImageUrl(pairUrl, 96)} width={96} height={96} alt="QR code to open mission on phone" />
              </div>
              <div className="mc-pair-copy">
                <h3>Pair your phone</h3>
                <p>Scan to open this mission on your phone. Your phone camera feeds crew assessment for this session.</p>
                <span className={`mc-pair-status ${phoneLinked ? 'is-on' : ''}`}>
                  {phoneLinked ? 'Phone linked' : 'Waiting for phone…'}
                </span>
                <div className="mc-pair-link">
                  <input readOnly value={pairUrl} aria-label="Phone invite link" />
                  <button type="button" className="button secondary compact" onClick={() => void copyPairLink()}>
                    <Copy size={14} /> Copy
                  </button>
                </div>
              </div>
            </div>
          </div>

          <p className="mc-phone-only" style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 8px' }}>
            You're on the phone session{getPairIdFromUrl() ? ' (paired)' : ''}. Enable the camera below.
          </p>

          <div className={`mc-camera ${live ? 'is-live' : ''}`}>
            <video ref={videoRef} playsInline muted style={{ display: live ? 'block' : 'none' }} />
            {!live ? (
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', color: 'var(--muted)', fontSize: 13, padding: 16, textAlign: 'center' }}>
                Camera preview — use your phone after pairing
              </div>
            ) : null}
            {busy ? (
              <div className="dash-camera-busy" role="status">
                <LoaderCircle className="spin" size={28} />
                <span>One moment…</span>
              </div>
            ) : null}
          </div>

          <div className="mc-toolbar">
            {!live ? (
              <button type="button" className="button primary" onClick={() => void openPhoneCamera()}>
                <Camera size={16} /> Phone camera
              </button>
            ) : (
              <button type="button" className="button secondary" onClick={stopCamera}>
                <Square size={16} /> Camera off
              </button>
            )}
            <button type="button" className="button primary" disabled={!live || busy} onClick={() => void runVisualCheck('assess')}>
              Check on me
            </button>
            {!sleeping ? (
              <button type="button" className="button secondary" disabled={!live || busy} onClick={startSleepWatch}>
                <Moon size={16} /> Sleep watch
              </button>
            ) : (
              <button type="button" className="button secondary" onClick={stopSleepWatch}>
                Stop sleep watch
              </button>
            )}
          </div>

          <div className="mc-upload">
            <Upload size={16} aria-hidden />
            <label>
              Upload photo
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                disabled={busy}
                onChange={(e) => void onFileChange(e.target.files?.[0])}
              />
            </label>
          </div>

          <div className="mc-panel mc-chat">
            <div className="mc-panel-head">Mission assistant</div>
            <div className="mc-chat-stream">
              {turns.map((turn, i) => (
                <div key={`${i}-${turn.role}`} className={`mc-bubble ${turn.role === 'user' ? 'is-user' : 'is-assistant'}`}>
                  {turn.content}
                </div>
              ))}
              <div ref={endRef} />
            </div>
            <form
              className="mc-composer"
              onSubmit={(e) => {
                e.preventDefault()
                void sendMessage()
              }}
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Talk to the assistant…"
                disabled={busy}
                aria-label="Message"
              />
              <button type="submit" className="button primary mc-send" disabled={busy || !input.trim()} aria-label="Send">
                {busy ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}
              </button>
            </form>
          </div>
        </section>

        <aside className="mc-panel mc-col-timeline">
          <div className="mc-panel-head">Mission log</div>
          <div className="mc-panel-body">
            {timeline.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--muted)' }}>Events from checks, uploads, and chat appear here.</p>
            ) : (
              timeline.map((ev) => (
                <article className="mc-timeline-item" key={ev.id}>
                  <time dateTime={ev.at}>{new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(ev.at))}</time>
                  <strong style={{ display: 'block', marginBottom: 2 }}>{ev.title}</strong>
                  {ev.detail}
                </article>
              ))
            )}
          </div>
        </aside>
      </div>

      <footer className="mc-alerts" aria-label="Alerts and warnings">
        {(status.data?.actions ?? []).slice(0, 4).map((a) => (
          <div key={a.priority} className={`mc-alert ${a.priority > 3 ? '' : 'is-nominal'}`}>
            <AlertTriangle size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'text-bottom' }} aria-hidden />
            {a.text}
          </div>
        ))}
        {(predictions.data ?? []).slice(0, 3).map((p) => (
          <div key={p.id} className="mc-alert">
            {p.label}
          </div>
        ))}
        {!status.data?.actions?.length && !predictions.data?.length ? (
          <div className="mc-alert is-nominal">All domains within expected ranges for this demo.</div>
        ) : null}
      </footer>
    </div>
  )
}