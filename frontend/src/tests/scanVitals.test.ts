import { describe, expect, it } from 'vitest'
import { extractVitalsFromImage } from '../lib/scanVitals'

describe('extractVitalsFromImage', () => {
  it('returns deterministic check-in fields from an image blob', async () => {
    const bytes = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80])
    const blob = new Blob([bytes], { type: 'image/jpeg' })
    const a = await extractVitalsFromImage(blob)
    const b = await extractVitalsFromImage(blob)
    expect(a).toEqual(b)
    expect(a.heart_rate).toBeGreaterThanOrEqual(20)
    expect(a.bp_sys).toBeGreaterThan(a.bp_dia)
    expect(a.mood).toBeGreaterThanOrEqual(1)
    expect(a.mood).toBeLessThanOrEqual(5)
  })
})
