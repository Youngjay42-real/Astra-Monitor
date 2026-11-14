import type { CheckinInput } from '../api/schemas'

/** Simulated AI extraction from a vitals card / check-in sheet image. Demo only. */
export type ScanDraft = Omit<CheckinInput, never>

function hashSeed(bytes: Uint8Array): number {
  let h = 2166136261
  for (let i = 0; i < Math.min(bytes.length, 4096); i++) {
    h ^= bytes[i]!
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function pick(seed: number, min: number, max: number): number {
  const t = ((seed % 10_000) / 10_000)
  return min + t * (max - min)
}

/** Deterministic mock parse from image bytes so demos feel consistent per photo. */
export async function extractVitalsFromImage(file: Blob): Promise<ScanDraft> {
  const buffer = new Uint8Array(await file.arrayBuffer())
  const seed = hashSeed(buffer) || 1
  const heart = Math.round(pick(seed, 62, 88))
  const bpSys = Math.round(pick(seed * 3, 108, 128))
  const bpDia = Math.round(pick(seed * 5, 68, 82))
  const spo2 = Math.round(pick(seed * 7, 96, 99) * 10) / 10
  const sleep = Math.round(pick(seed * 11, 4.5, 7.5) * 10) / 10
  const exercise = Math.round(pick(seed * 13, 0, 40))
  const mood = Math.max(1, Math.min(5, Math.round(pick(seed * 17, 2, 5))))
  const notes = [
    'Mild fatigue after EVA sim',
    'Headache after sleep loss',
    'Feeling steady',
    'Slight nausea after meal',
    '',
  ]
  const symptoms = notes[seed % notes.length] ?? ''

  // Ensure systolic > diastolic
  const sys = Math.max(bpSys, bpDia + 20)

  await new Promise((r) => setTimeout(r, 700 + (seed % 400)))

  return {
    heart_rate: heart,
    bp_sys: sys,
    bp_dia: Math.min(bpDia, sys - 18),
    spo2,
    sleep_hours: sleep,
    mood,
    exercise_minutes: exercise,
    symptoms,
  }
}
