/**
 * Demo finger PPG from a phone RGB camera.
 * Hold a fingertip over the lens (flash on if available). Not a medical device.
 */

export type PulseSample = {
  bpm: number | null
  signalOk: boolean
  note: string
}

function meanRed(data: Uint8ClampedArray): number {
  let sum = 0
  const step = 16 * 4
  for (let i = 0; i < data.length; i += step) sum += data[i]!
  return sum / (data.length / step)
}

/** Estimate BPM from ~6–10s of video frames. */
export async function estimatePulseFromVideo(
  video: HTMLVideoElement,
  opts: { durationMs?: number; track?: MediaStreamTrack | null } = {},
): Promise<PulseSample> {
  const durationMs = opts.durationMs ?? 8000
  const canvas = document.createElement('canvas')
  const w = Math.min(160, video.videoWidth || 160)
  const h = Math.min(120, video.videoHeight || 120)
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx || !video.videoWidth) {
    return { bpm: null, signalOk: false, note: 'Camera frame not ready.' }
  }

  // Prefer torch for fingertip PPG when the browser exposes it.
  const track = opts.track
  let torchOn = false
  if (track && 'applyConstraints' in track) {
    try {
      await track.applyConstraints({ advanced: [{ torch: true } as MediaTrackConstraintSet] })
      torchOn = true
    } catch {
      /* torch optional */
    }
  }

  const samples: number[] = []
  const times: number[] = []
  const started = performance.now()

  await new Promise<void>((resolve) => {
    const tick = () => {
      const now = performance.now()
      ctx.drawImage(video, 0, 0, w, h)
      const { data } = ctx.getImageData(0, 0, w, h)
      samples.push(meanRed(data))
      times.push(now)
      if (now - started >= durationMs) {
        resolve()
        return
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  if (torchOn && track) {
    try {
      await track.applyConstraints({ advanced: [{ torch: false } as MediaTrackConstraintSet] })
    } catch {
      /* ignore */
    }
  }

  if (samples.length < 40) {
    return { bpm: null, signalOk: false, note: 'Not enough samples. Keep your finger still on the lens.' }
  }

  const mean = samples.reduce((a, b) => a + b, 0) / samples.length
  const centered = samples.map((v) => v - mean)
  const energy = centered.reduce((a, b) => a + b * b, 0) / centered.length
  if (energy < 0.4) {
    return {
      bpm: null,
      signalOk: false,
      note: 'Weak signal. Cover the rear lens with your fingertip and try again.',
    }
  }

  // Peak picking on a short moving average.
  const win = 3
  const smooth: number[] = []
  for (let i = 0; i < centered.length; i++) {
    let s = 0
    let n = 0
    for (let j = -win; j <= win; j++) {
      const k = i + j
      if (k >= 0 && k < centered.length) {
        s += centered[k]!
        n++
      }
    }
    smooth.push(s / n)
  }

  const peaks: number[] = []
  const minGapMs = 350
  for (let i = 1; i < smooth.length - 1; i++) {
    if (smooth[i]! > smooth[i - 1]! && smooth[i]! > smooth[i + 1]! && smooth[i]! > 0) {
      const t = times[i]!
      if (!peaks.length || t - peaks[peaks.length - 1]! >= minGapMs) peaks.push(t)
    }
  }

  if (peaks.length < 3) {
    return {
      bpm: null,
      signalOk: false,
      note: 'Could not lock a pulse. Hold still with the fingertip covering the camera.',
    }
  }

  const intervals: number[] = []
  for (let i = 1; i < peaks.length; i++) intervals.push(peaks[i]! - peaks[i - 1]!)
  intervals.sort((a, b) => a - b)
  const median = intervals[Math.floor(intervals.length / 2)]!
  const bpm = Math.round(60_000 / median)

  if (bpm < 40 || bpm > 180) {
    return {
      bpm: null,
      signalOk: false,
      note: 'Pulse estimate out of range. Retry with a steady fingertip on the lens.',
    }
  }

  return {
    bpm,
    signalOk: true,
    note: torchOn
      ? 'Demo fingertip PPG (torch). Exploratory only — not a medical measurement.'
      : 'Demo fingertip PPG. Exploratory only — not a medical measurement.',
  }
}
