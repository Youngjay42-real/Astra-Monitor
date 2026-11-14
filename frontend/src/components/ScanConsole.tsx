import { useEffect, useRef, useState } from 'react'
import { Camera, ImagePlus, LoaderCircle, ScanLine, X } from 'lucide-react'
import { extractVitalsFromImage, type ScanDraft } from '../lib/scanVitals'

type Phase = 'idle' | 'preview' | 'analyzing' | 'done' | 'error'

export function ScanConsole({ onExtracted }: { onExtracted: (draft: ScanDraft) => void }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [live, setLive] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const blobRef = useRef<Blob | null>(null)

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setLive(false)
  }

  useEffect(() => () => {
    stopCamera()
  }, [])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  async function startCamera() {
    setError('')
    stopCamera()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      streamRef.current = stream
      setLive(true)
      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        await video.play()
      }
    } catch {
      setError('Camera unavailable — upload a photo of a vitals card instead.')
      fileRef.current?.click()
    }
  }

  function setImage(blob: Blob) {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    blobRef.current = blob
    setPreviewUrl(URL.createObjectURL(blob))
    setPhase('preview')
    setError('')
    stopCamera()
  }

  function captureFrame() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    canvas.toBlob((blob) => {
      if (blob) setImage(blob)
    }, 'image/jpeg', 0.92)
  }

  function onFile(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file.')
      return
    }
    setImage(file)
  }

  async function analyze() {
    const fromInput = fileRef.current?.files?.[0] ?? null
    const blob = blobRef.current ?? fromInput
    if (!blob) {
      setError('Capture or upload a vitals card photo first.')
      return
    }
    blobRef.current = blob
    setPhase('analyzing')
    setError('')
    try {
      const draft = await extractVitalsFromImage(blob)
      onExtracted(draft)
      setPhase('done')
      document.getElementById('check-in')?.scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      })
    } catch {
      setPhase('error')
      setError('Could not read that image. Try another photo of the vitals card.')
    }
  }

  function reset() {
    stopCamera()
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    blobRef.current = null
    setPhase('idle')
    setError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <section id="scan" className="scan-section section page-width" aria-labelledby="scan-title">
      <div className="scan-intro">
        <span className="section-number">00 / OBSERVE</span>
        <h2 id="scan-title">Scan a vitals card</h2>
        <p>
          Point the phone camera at a printed or handwritten crew vitals sheet.
          Demo AI extracts fields into the check-in form — simulated only, not clinical imaging.
        </p>
        <p className="fine-print">No body scan. No diagnosis. Photo → structured demo values → mission log.</p>
      </div>

      <div className="scan-stage">
        <div className={`scan-viewport ${live || previewUrl ? 'has-media' : ''}`}>
          {previewUrl ? (
            <img src={previewUrl} alt="Captured vitals card preview" />
          ) : (
            <video ref={videoRef} playsInline muted className={live ? 'is-live' : 'is-idle'} aria-label="Camera preview" />
          )}
          {!live && !previewUrl ? (
            <div className="scan-placeholder">
              <ScanLine size={36} strokeWidth={1.2} aria-hidden="true" />
              <span>Camera or upload</span>
            </div>
          ) : null}
          {phase === 'analyzing' ? (
            <div className="scan-overlay" role="status">
              <LoaderCircle className="spin" size={28} aria-hidden="true" />
              <span>Reading vitals…</span>
            </div>
          ) : null}
        </div>

        <div className="scan-actions">
          {!previewUrl && !live ? (
            <>
              <button type="button" className="button primary" onClick={() => void startCamera()}>
                <Camera size={16} aria-hidden="true" />
                Open camera
              </button>
              <button type="button" className="button secondary" onClick={() => fileRef.current?.click()}>
                <ImagePlus size={16} aria-hidden="true" />
                Upload photo
              </button>
            </>
          ) : null}
          {live && !previewUrl ? (
            <>
              <button type="button" className="button primary" onClick={captureFrame}>
                <Camera size={16} aria-hidden="true" />
                Capture
              </button>
              <button type="button" className="button secondary" onClick={stopCamera}>
                Close camera
              </button>
            </>
          ) : null}
          {previewUrl && phase !== 'analyzing' ? (
            <>
              <button type="button" className="button primary" onClick={() => void analyze()}>
                <ScanLine size={16} aria-hidden="true" />
                {phase === 'done' ? 'Analyze again' : 'Analyze with AI'}
              </button>
              <button type="button" className="button secondary" onClick={reset}>
                <X size={16} aria-hidden="true" />
                Clear
              </button>
            </>
          ) : null}
        </div>

        {phase === 'done' ? (
          <p className="success-message" role="status">Fields filled below — review and save the check-in.</p>
        ) : null}
        {error ? <p className="scan-error" role="alert">{error}</p> : null}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => onFile(e.target.files)}
        />
      </div>
    </section>
  )
}
