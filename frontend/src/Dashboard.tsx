import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import {
  Activity,
  AlertTriangle,
  Camera,
  Copy,
  HeartPulse,
  Home,
  LoaderCircle,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Send,
  Smartphone,
  Sparkles,
  Square,
  Thermometer,
  Upload,
  ScrollText,
} from 'lucide-react'
import { api, errorMessage } from './api/client'
import type { MissionChatTurn, SessionSync } from './api/schemas'
import { useResource } from './hooks/useResource'
import { extractVitalsFromImage } from './lib/scanVitals'
import { estimatePulseFromVideo } from './lib/pulseFromVideo'
import { qrImageUrl, syncMissionFromUrl } from './lib/mission'
import {
  getOrCreatePairId,
  getPairIdFromUrl,
  isPhoneDeviceFromUrl,
  phonePairUrl,
} from './lib/sessionPair'

type Mode = 'assess' | 'sleep'
type TimelineEvent = { id: string; at: string; title: string; detail: string }
type DrawerId = 'phone' | 'live' | 'domains' | 'log'

function friendlyError(error: unknown): string {
  const raw = errorMessage(error)
  if (/api|gemini|grok|xai|endpoint|configured|json/i.test(raw)) {
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

function captureFrame(
  video: HTMLVideoElement,
  opts: { maxWidth?: number; quality?: number } = {},
): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  const srcW = video.videoWidth || 720
  const srcH = video.videoHeight || 1280
  const maxWidth = opts.maxWidth ?? 720
  const scale = Math.min(1, maxWidth / srcW)
  canvas.width = Math.max(1, Math.round(srcW * scale))
  canvas.height = Math.max(1, Math.round(srcH * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx || !video.videoWidth) return Promise.resolve(null)
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', opts.quality ?? 0.85))
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
  bone: 'Bone density',
  cardio: 'Cardio',
  immune: 'Immune',
  behavioral: 'Behavioral',
} as const

export default function Dashboard() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const sleepTimer = useRef(0)
  const framePublishTimer = useRef(0)
  const framePollTimer = useRef(0)
  const frameRevRef = useRef(0)
  const publishingFrame = useRef(false)
  const endRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const revisionRef = useRef(0)
  const busyRef = useRef(false)

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

  const [session, setSession] = useState<SessionSync | null>(null)
  const [live, setLive] = useState(false)
  const [remoteLive, setRemoteLive] = useState(false)
  const [remoteFrameUrl, setRemoteFrameUrl] = useState<string | null>(null)
  const remoteUrlRef = useRef<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sleeping, setSleeping] = useState(false)
  const [pulseBusy, setPulseBusy] = useState(false)
  const [liveHr, setLiveHr] = useState<number | null>(null)
  const [navWide, setNavWide] = useState(true)
  const [drawer, setDrawer] = useState<DrawerId | null>('phone')
  const [drawerWidth, setDrawerWidth] = useState(340)
  const dragRef = useRef<{ startX: number; startW: number } | null>(null)
  const [input, setInput] = useState('')
  const [lastTemp, setLastTemp] = useState<number | null>(null)
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [turns, setTurns] = useState<MissionChatTurn[]>([])

  const setBusySafe = (value: boolean) => {
    busyRef.current = value
    setBusy(value)
  }

  const applySync = useCallback((payload: Awaited<ReturnType<typeof api.sessionSync>>) => {
    setSession(payload)
    if (payload.revision > revisionRef.current) {
      revisionRef.current = payload.revision
      if (!busyRef.current && payload.turns.length) setTurns(payload.turns)
      if (payload.events?.length) setTimeline(payload.events as TimelineEvent[])
    }
    if (payload.frame_live) {
      setRemoteLive(true)
      if (!isPhoneSession) setDrawer((cur) => cur ?? 'live')
    } else if (!payload.frame_live && frameRevRef.current > 0) {
      setRemoteLive(false)
    }
  }, [isPhoneSession])

  const setRemotePreview = useCallback((url: string | null) => {
    if (remoteUrlRef.current && remoteUrlRef.current.startsWith('blob:')) {
      URL.revokeObjectURL(remoteUrlRef.current)
    }
    remoteUrlRef.current = url
    setRemoteFrameUrl(url)
  }, [])

  const publishCameraFrame = useCallback(async () => {
    if (!isPhoneSession || publishingFrame.current) return
    const video = videoRef.current
    if (!video || !streamRef.current || !video.videoWidth) return
    publishingFrame.current = true
    try {
      const blob = await captureFrame(video, { maxWidth: 480, quality: 0.55 })
      if (!blob) return
      const frame = await blobToFrame(blob)
      await api.sessionPutFrame(pairId, {
        mime_type: frame.mime_type,
        data_base64: frame.data_base64,
        live: true,
      })
    } catch {
      /* keep trying on next tick */
    } finally {
      publishingFrame.current = false
    }
  }, [isPhoneSession, pairId])

  const pullRemoteFrame = useCallback(async () => {
    if (isPhoneSession) return
    try {
      const frame = await api.sessionGetFrame(pairId)
      if (frame.frame_revision === frameRevRef.current) return
      frameRevRef.current = frame.frame_revision
      setRemoteLive(Boolean(frame.live))
      setRemotePreview(`data:${frame.mime_type};base64,${frame.data_base64}`)
      setDrawer((cur) => cur ?? 'live')
    } catch {
      /* 404 = no frame yet */
    }
  }, [isPhoneSession, pairId, setRemotePreview])

  const publishTurns = useCallback(
    async (extra: MissionChatTurn[]) => {
      try {
        const sync = await api.sessionAppendTurns(pairId, extra)
        applySync(sync)
      } catch {
        /* pairing optional when API down */
      }
    },
    [pairId, applySync],
  )

  const publishEvent = useCallback(
    async (title: string, detail: string) => {
      try {
        const sync = await api.sessionAppendEvent(pairId, title, detail)
        applySync(sync)
      } catch {
        setTimeline((t) =>
          [
            { id: `${Date.now()}-${title}`, at: new Date().toISOString(), title, detail },
            ...t,
          ].slice(0, 40),
        )
      }
    },
    [pairId, applySync],
  )

  useEffect(() => {
    const device = isPhoneSession ? 'phone' : 'desktop'
    void api
      .registerSession(pairId, { device, mission: missionCode })
      .then(() => api.sessionSync(pairId))
      .then(applySync)
      .catch(() => undefined)
  }, [pairId, missionCode, isPhoneSession, applySync])

  useEffect(() => {
    const id = window.setInterval(() => {
      void api.sessionSync(pairId).then(applySync).catch(() => undefined)
    }, 2000)
    return () => window.clearInterval(id)
  }, [pairId, applySync])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [turns.length])

  useEffect(() => {
    window.clearInterval(framePublishTimer.current)
    if (!live || !isPhoneSession) return
    void publishCameraFrame()
    framePublishTimer.current = window.setInterval(() => {
      void publishCameraFrame()
    }, 400)
    return () => window.clearInterval(framePublishTimer.current)
  }, [live, isPhoneSession, publishCameraFrame])

  useEffect(() => {
    window.clearInterval(framePollTimer.current)
    if (isPhoneSession) return
    const tick = () => {
      if (session?.frame_live || remoteLive || session?.phone_connected) void pullRemoteFrame()
    }
    tick()
    framePollTimer.current = window.setInterval(tick, 350)
    return () => window.clearInterval(framePollTimer.current)
  }, [isPhoneSession, session?.frame_live, session?.phone_connected, remoteLive, pullRemoteFrame])

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    window.clearInterval(sleepTimer.current)
    window.clearInterval(framePublishTimer.current)
    setLive(false)
    setSleeping(false)
    if (isPhoneSession) {
      void api.sessionPutFrame(pairId, { mime_type: 'image/jpeg', data_base64: '', live: false }).catch(() => undefined)
    }
  }

  useEffect(
    () => () => {
      stopCamera()
      window.clearInterval(framePollTimer.current)
      if (remoteUrlRef.current?.startsWith('blob:')) URL.revokeObjectURL(remoteUrlRef.current)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount cleanup only
    [],
  )

  function pushLocal(role: MissionChatTurn['role'], content: string) {
    setTurns((t) => [...t, { role, content }])
  }

  async function openPhoneCamera() {
    stopCamera()
    try {
      // Linked phone always prefers the rear/back camera for crew filming.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
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
        void api
          .registerSession(pairId, { device: 'phone', mission: missionCode })
          .then(() => api.sessionSync(pairId))
          .then(applySync)
          .catch(() => undefined)
      }
      const note = isPhoneSession
        ? 'Rear camera is live and sharing to the desktop console. Tap Check on me, Pulse check, or Sleep watch.'
        : 'Local camera is live. Link a phone to mirror its rear camera here.'
      pushLocal('assistant', note)
      void publishTurns([{ role: 'assistant', content: note }])
      void publishEvent('Camera', isPhoneSession ? 'Phone camera sharing to desktop' : 'Local camera enabled')
      setDrawer('live')
    } catch {
      pushLocal('assistant', friendlyError(new Error('camera permission')))
    }
  }

  async function runVisualCheck(mode: Mode) {
    const video = videoRef.current
    if (!video || !streamRef.current) {
      pushLocal('assistant', 'Turn on the rear camera first (use the linked phone).')
      return
    }
    setBusySafe(true)
    try {
      const blob = await captureFrame(video)
      if (!blob) throw new Error('capture')
      const frame = await blobToFrame(blob)
      const next = await api.observeScan({ frames: [frame], mode })
      if (next.temperature_c != null) setLastTemp(next.temperature_c)
      const reply = formatVisualReply(mode, next)
      pushLocal('assistant', reply)
      await publishTurns([{ role: 'assistant', content: reply }])
      await publishEvent(mode === 'sleep' ? 'Sleep watch' : 'Visual assess', next.condition)
    } catch (cause) {
      pushLocal('assistant', friendlyError(cause))
    } finally {
      setBusySafe(false)
    }
  }

  function startSleepWatch() {
    if (!streamRef.current) {
      pushLocal('assistant', 'Turn on the rear camera first.')
      return
    }
    setSleeping(true)
    const note = "Sleep watch is on — I'll glance every 45 seconds."
    pushLocal('assistant', note)
    void publishTurns([{ role: 'assistant', content: note }])
    void publishEvent('Sleep watch', 'Monitoring started')
    void runVisualCheck('sleep')
    window.clearInterval(sleepTimer.current)
    sleepTimer.current = window.setInterval(() => {
      if (!busyRef.current) void runVisualCheck('sleep')
    }, 45_000)
  }

  function stopSleepWatch() {
    window.clearInterval(sleepTimer.current)
    setSleeping(false)
    const note = 'Sleep watch stopped.'
    pushLocal('assistant', note)
    void publishTurns([{ role: 'assistant', content: note }])
    void publishEvent('Sleep watch', 'Monitoring stopped')
  }

  async function sendMessage() {
    const message = input.trim()
    if (!message || busy) return
    setInput('')
    pushLocal('user', message)
    setBusySafe(true)
    try {
      // Include the message we just queued (React state is still stale here).
      const history = [...turns, { role: 'user' as const, content: message }]
        .filter((t) => t.content.length > 0)
        .slice(-12)
      const out = await api.missionChat({ message, history, session_id: pairId })
      let reply = out.reply
      if (out.inventory_updates.length > 0) {
        const names = out.inventory_updates
          .map((u) => {
            const item = out.inventory.find((i) => i.id === u.sku)
            return item ? `${item.name} → ${u.quantity}` : `${u.sku} → ${u.quantity}`
          })
          .join('; ')
        reply += ` Kit updated: ${names}.`
      }
      // Always show the reply immediately. applySync skips turns while busy,
      // and the server already has this assistant turn — so a sync-only path
      // never painted until refresh.
      pushLocal('assistant', reply)
      try {
        const sync = await api.sessionSync(pairId)
        revisionRef.current = Math.max(revisionRef.current, sync.revision)
        setSession(sync)
        if (sync.turns.length) setTurns(sync.turns)
      } catch {
        /* local reply already shown */
      }
    } catch (cause) {
      pushLocal('assistant', friendlyError(cause))
    } finally {
      setBusySafe(false)
    }
  }

  async function onFileChange(file: File | undefined) {
    if (!file) return
    setBusySafe(true)
    try {
      if (file.type.startsWith('image/')) {
        const frame = await blobToFrame(file)
        const next = await api.observeScan({ frames: [frame], mode: 'assess' })
        if (next.temperature_c != null) setLastTemp(next.temperature_c)
        const reply = `From your upload: ${formatVisualReply('assess', next)}`
        pushLocal('assistant', reply)
        await publishTurns([{ role: 'assistant', content: reply }])
        await publishEvent('Upload', next.condition)
      } else {
        pushLocal('assistant', 'Please upload a photo (JPEG or PNG) for crew assessment.')
        return
      }
      const vitals = await extractVitalsFromImage(file)
      await api.saveCheckin(vitals)
      void checkins.reload({ silent: true })
      await publishEvent('Vitals file', `Logged HR ${vitals.heart_rate} · SpO₂ ${vitals.spo2}%`)
    } catch (cause) {
      pushLocal('assistant', friendlyError(cause))
    } finally {
      setBusySafe(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function copyPairLink() {
    try {
      await navigator.clipboard.writeText(pairUrl)
      await publishEvent('Pairing', 'Invite link copied')
    } catch {
      /* ignore */
    }
  }

  async function runPulseCheck() {
    const video = videoRef.current
    if (!video || !streamRef.current) {
      pushLocal('assistant', 'Open the rear camera first, then cover the lens with your fingertip.')
      return
    }
    setPulseBusy(true)
    setBusySafe(true)
    try {
      pushLocal(
        'assistant',
        'Pulse check: cover the rear camera with your fingertip and hold still for ~8 seconds…',
      )
      const track = streamRef.current.getVideoTracks()[0] ?? null
      const result = await estimatePulseFromVideo(video, { durationMs: 8000, track })
      if (result.bpm != null) {
        setLiveHr(result.bpm)
        const reply = `Live pulse estimate ~${result.bpm} bpm. ${result.note}`
        pushLocal('assistant', reply)
        await publishTurns([{ role: 'assistant', content: reply }])
        await publishEvent('Pulse check', `${result.bpm} bpm (camera PPG demo)`)
        try {
          const prior = checkins.data?.[0]
          await api.saveCheckin({
            heart_rate: result.bpm,
            bp_sys: prior?.bp_sys ?? 118,
            bp_dia: prior?.bp_dia ?? 76,
            spo2: prior?.spo2 ?? 98,
            sleep_hours: prior?.sleep_hours ?? 6,
            mood: prior?.mood ?? 3,
            exercise_minutes: prior?.exercise_minutes ?? 0,
            symptoms: 'Camera PPG demo pulse',
          })
          void checkins.reload({ silent: true })
        } catch {
          /* check-in optional */
        }
      } else {
        pushLocal('assistant', result.note)
      }
    } catch (cause) {
      pushLocal('assistant', friendlyError(cause))
    } finally {
      setPulseBusy(false)
      setBusySafe(false)
    }
  }

  const latest = checkins.data?.[0]
  const displayHr = liveHr ?? latest?.heart_rate ?? null
  const overall = status.data?.overall ?? 'nominal'
  const phoneLinked = Boolean(session?.phone_connected)
  const overallLabel = status.loading
    ? 'Syncing…'
    : overall.charAt(0).toUpperCase() + overall.slice(1)
  const openDrawer = (id: DrawerId) => {
    setDrawer((cur) => (cur === id ? null : id))
  }

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const next = Math.round(drag.startW + (event.clientX - drag.startX))
      setDrawerWidth(Math.min(520, Math.max(260, next)))
    }
    const onUp = () => {
      dragRef.current = null
      document.body.classList.remove('mc-resizing')
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [])

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragRef.current = { startX: event.clientX, startW: drawerWidth }
    document.body.classList.add('mc-resizing')
  }

  const navItems: { id: DrawerId; label: string; icon: typeof Smartphone; hint?: string }[] = [
    { id: 'phone', label: 'Phone link', icon: Smartphone, hint: phoneLinked ? 'Linked' : 'Pair' },
    {
      id: 'live',
      label: 'Live sensors',
      icon: HeartPulse,
      hint: displayHr != null ? `${displayHr} bpm` : live ? 'Cam on' : 'Cam',
    },
    { id: 'domains', label: 'Health domains', icon: Activity, hint: 'HRP' },
    { id: 'log', label: 'Mission log', icon: ScrollText, hint: timeline.length ? String(timeline.length) : undefined },
  ]

  return (
    <div className="mission-console">
      <div
        className={`mc-shell ${navWide ? 'is-nav-wide' : 'is-nav-slim'} ${drawer ? 'has-drawer' : ''}`}
        style={
          {
            '--mc-nav-w': navWide ? '232px' : '68px',
            '--mc-drawer-w': drawer ? `${drawerWidth}px` : '0px',
          } as CSSProperties
        }
      >
        <nav className="mc-nav" aria-label="Mission tools">
          <div className="mc-nav-brand">
            <a href="/" className="mc-nav-home" aria-label="Back to home">
              <Sparkles size={18} aria-hidden />
              {navWide ? <span>ASTRA-MED</span> : null}
            </a>
            <button
              type="button"
              className="mc-nav-toggle"
              aria-label={navWide ? 'Collapse sidebar labels' : 'Expand sidebar labels'}
              onClick={() => setNavWide((v) => !v)}
            >
              {navWide ? <PanelLeftClose size={16} aria-hidden /> : <PanelLeftOpen size={16} aria-hidden />}
            </button>
          </div>

          <div className="mc-nav-list" role="list">
            {navItems.map((item) => {
              const Icon = item.icon
              const active = drawer === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  role="listitem"
                  className={`mc-nav-item ${active ? 'is-active' : ''}`}
                  aria-pressed={active}
                  title={item.label}
                  onClick={() => openDrawer(item.id)}
                >
                  <Icon size={18} aria-hidden />
                  {navWide ? (
                    <span className="mc-nav-label">
                      <strong>{item.label}</strong>
                      {item.hint ? <small>{item.hint}</small> : null}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>

          <div className="mc-nav-foot">
            <span className="mc-live-chip" title="Heart rate">
              <HeartPulse size={13} aria-hidden />
              {navWide ? (displayHr != null ? `${displayHr} bpm` : '— bpm') : displayHr ?? '—'}
            </span>
            <span className="mc-live-chip" title="Temperature cue">
              <Thermometer size={13} aria-hidden />
              {navWide ? (lastTemp != null ? `${lastTemp.toFixed(1)} °C` : '— °C') : lastTemp != null ? lastTemp.toFixed(0) : '—'}
            </span>
          </div>
        </nav>

        <div className={`mc-drawer-slot ${drawer ? 'is-open' : ''}`} aria-hidden={!drawer}>
          <aside className="mc-drawer">
          <div className={`mc-drawer-panel ${drawer === 'phone' ? 'is-shown' : ''}`} hidden={drawer !== 'phone'}>
            <header className="mc-drawer-head">
              <h2>Phone link</h2>
              <button type="button" className="mc-drawer-close" onClick={() => setDrawer(null)} aria-label="Close panel">
                Close
              </button>
            </header>
            <div className="mc-drawer-body">
              <div className="mc-pair">
                <div className="mc-qr">
                  <img src={qrImageUrl(pairUrl, 96)} width={96} height={96} alt="QR code to open mission on phone" />
                </div>
                <div className="mc-pair-copy">
                  <h3>Pair your phone</h3>
                  <p>Scan to link. Phone opens the rear camera; chat stays live with this console.</p>
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
          </div>

          <div className={`mc-drawer-panel ${drawer === 'live' ? 'is-shown' : ''}`} hidden={drawer !== 'live'}>
            <header className="mc-drawer-head">
              <h2>Live sensors</h2>
              <button type="button" className="mc-drawer-close" onClick={() => setDrawer(null)} aria-label="Close panel">
                Close
              </button>
            </header>
            <div className="mc-drawer-body">
              <div className={`mc-camera ${live || remoteLive ? 'is-live' : ''}`}>
                <div className="mc-camera-badge">
                  {live
                    ? isPhoneSession
                      ? 'Phone cam · sharing'
                      : 'Local camera'
                    : remoteLive
                      ? 'Phone cam · live'
                      : 'Camera idle'}
                </div>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  style={{ display: live ? 'block' : 'none' }}
                />
                {!live && remoteLive && remoteFrameUrl ? (
                  <img className="mc-remote-feed" src={remoteFrameUrl} alt="Live phone camera feed" />
                ) : null}
                {!live && !remoteLive ? (
                  <div className="mc-camera-placeholder">
                    {isPhoneSession
                      ? 'Open the rear camera — the feed will appear on the desktop console.'
                      : 'Link a phone and open its rear camera to see the live feed here.'}
                  </div>
                ) : null}
                {busy || pulseBusy ? (
                  <div className="dash-camera-busy" role="status">
                    <LoaderCircle className="spin" size={28} />
                    <span>{pulseBusy ? 'Reading pulse…' : 'One moment…'}</span>
                  </div>
                ) : null}
              </div>

              <div className="mc-toolbar">
                {!live ? (
                  <button type="button" className="button primary" onClick={() => void openPhoneCamera()}>
                    <Camera size={16} /> Open rear camera
                  </button>
                ) : (
                  <button type="button" className="button secondary" onClick={stopCamera}>
                    <Square size={16} /> Camera off
                  </button>
                )}
                <button
                  type="button"
                  className="button primary"
                  disabled={!live || busy || pulseBusy}
                  onClick={() => void runPulseCheck()}
                >
                  <HeartPulse size={16} /> Pulse check
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={!live || busy}
                  onClick={() => void runVisualCheck('assess')}
                >
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
                <button
                  type="button"
                  className="button secondary mc-attach"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload size={16} aria-hidden />
                  Attach photo
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  tabIndex={-1}
                  disabled={busy}
                  onChange={(e) => void onFileChange(e.target.files?.[0])}
                  aria-label="Attach photo from camera or library"
                />
              </div>

              <div className="mc-vitals-grid">
                <div className="mc-vital">
                  <span>Heart rate</span>
                  <strong>
                    {displayHr ?? '—'}
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
              <p className="mc-vitals-note">
                Pulse: fingertip on the rear lens (demo PPG). Temp: only if a thermometer is visible in frame — a normal
                RGB camera cannot measure core body temperature.
              </p>
            </div>
          </div>

          <div className={`mc-drawer-panel ${drawer === 'domains' ? 'is-shown' : ''}`} hidden={drawer !== 'domains'}>
            <header className="mc-drawer-head">
              <h2>Health domains</h2>
              <button type="button" className="mc-drawer-close" onClick={() => setDrawer(null)} aria-label="Close panel">
                Close
              </button>
            </header>
            <div className="mc-drawer-body">
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
                      </div>
                    )
                  })
                : (
                  <p style={{ fontSize: 12, color: 'var(--muted)' }}>Loading domain scores…</p>
                )}
            </div>
          </div>

          <div className={`mc-drawer-panel ${drawer === 'log' ? 'is-shown' : ''}`} hidden={drawer !== 'log'}>
            <header className="mc-drawer-head">
              <h2>Mission log</h2>
              <button type="button" className="mc-drawer-close" onClick={() => setDrawer(null)} aria-label="Close panel">
                Close
              </button>
            </header>
            <div className="mc-drawer-body">
              {timeline.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--muted)' }}>Shared events from phone and desktop appear here.</p>
              ) : (
                timeline.map((ev) => (
                  <article className="mc-timeline-item" key={ev.id}>
                    <time dateTime={ev.at}>
                      {new Intl.DateTimeFormat('en', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      }).format(new Date(ev.at))}
                    </time>
                    <strong style={{ display: 'block', marginBottom: 2 }}>{ev.title}</strong>
                    {ev.detail}
                  </article>
                ))
              )}
            </div>
          </div>
          </aside>
          <div
            className="mc-drawer-resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize side panel"
            aria-valuenow={drawerWidth}
            aria-valuemin={260}
            aria-valuemax={520}
            onPointerDown={startResize}
          />
        </div>

        <div className="mc-main">
          <header className="mc-top">
            <div className="mc-top-left">
              <span className="mc-title">Mission console</span>
              <div className="mc-crew-status" role="status">
                <Activity size={14} aria-hidden />
                <span>{overallLabel}</span>
              </div>
            </div>
            <div className="mc-top-right">
              <span className="mc-mission-pill">
                Day {String(status.data?.mission_day ?? '—').padStart(3, '0')}
              </span>
              <span className="mc-mission-pill">{status.data?.crew_name ?? 'Crew'}</span>
              <a href="/" className="mc-home mc-home-compact" aria-label="Home">
                <Home size={15} aria-hidden />
              </a>
            </div>
          </header>

          <section className="mc-col-center">
            <p className="mc-phone-only" style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 8px' }}>
              Phone linked{getPairIdFromUrl() ? '' : ' (solo)'}. Rear camera · chat syncs with desktop.
            </p>

            <div className="mc-panel mc-chat">
              <div className="mc-panel-head">AI mission chat · synced</div>
              <div className="mc-chat-stream">
                {turns.map((turn, i) => (
                  <div
                    key={`${i}-${turn.role}-${turn.content.slice(0, 24)}`}
                    className={`mc-bubble ${turn.role === 'user' ? 'is-user' : 'is-assistant'}`}
                  >
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
                  placeholder="Message ASTRA-MED…"
                  disabled={busy}
                  aria-label="Message"
                />
                <button type="submit" className="button primary mc-send" disabled={busy || !input.trim()} aria-label="Send">
                  {busy ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}
                </button>
              </form>
            </div>
          </section>

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
              <div className="mc-alert is-nominal">Nominal: life support systems within demo ranges.</div>
            ) : null}
          </footer>
        </div>
      </div>
    </div>
  )
}
