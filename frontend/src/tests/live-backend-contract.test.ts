import { describe, expect, it } from 'vitest'
import {
  assessmentSchema,
  checkinSchema,
  checkinsSchema,
  evidenceSchema,
  eventsSchema,
  inventorySchema,
  predictionsSchema,
  protocolSchema,
  statusSchema,
} from '../api/schemas'

const base = process.env.ASTRA_API_BASE ?? 'http://127.0.0.1:8765'

async function getJson(path: string, init?: RequestInit) {
  const response = await fetch(`${base}${path}`, init)
  expect(response.ok, `${path} -> ${response.status}`).toBe(true)
  return response.json()
}

describe('live backend matches frontend Zod contract', () => {
  it('validates core endpoints', async ({ skip }) => {
    try {
      const probe = await fetch(`${base}/api/health`)
      if (!probe.ok) skip()
    } catch {
      skip()
    }

    expect(statusSchema.safeParse(await getJson('/api/status')).success).toBe(true)

    const created = await getJson('/api/checkins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        heart_rate: 72,
        bp_sys: 118,
        bp_dia: 76,
        spo2: 98,
        sleep_hours: 6,
        mood: 4,
        exercise_minutes: 40,
        symptoms: '',
      }),
    })
    expect(checkinSchema.safeParse(created).success).toBe(true)
    expect(checkinsSchema.safeParse(await getJson('/api/checkins')).success).toBe(true)
    expect(eventsSchema.safeParse(await getJson('/api/radiation/events')).success).toBe(true)
    expect(evidenceSchema.safeParse(await getJson('/api/evidence')).success).toBe(true)

    const assess = await getJson('/api/assess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symptoms: ['headache'], severity: 'moderate', notes: '' }),
    })
    expect(assessmentSchema.safeParse(assess).success).toBe(true)
    const protocolId = assess.guidance[0]?.protocol_id ?? 'crew-check-in'
    expect(protocolSchema.safeParse(await getJson(`/api/protocols/${protocolId}`)).success).toBe(true)
    expect(inventorySchema.safeParse(await getJson('/api/inventory')).success).toBe(true)
    expect(predictionsSchema.safeParse(await getJson('/api/predictions')).success).toBe(true)
  }, 30000)
})
