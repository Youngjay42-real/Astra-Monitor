import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_MISSION_CODE,
  MISSION_STORAGE_KEY,
  missionJoinUrl,
  qrImageUrl,
  readMissionCode,
  syncMissionFromUrl,
  writeMissionCode,
} from '../lib/mission'

function mockSessionStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
  })
}

describe('mission crew link', () => {
  beforeEach(() => {
    mockSessionStorage()
  })

  it('defaults to ASTRA-DEMO', () => {
    expect(readMissionCode()).toBe(DEFAULT_MISSION_CODE)
  })

  it('persists mission codes from the join URL', () => {
    expect(syncMissionFromUrl('?mission=crew-42')).toBe('CREW-42')
    expect(sessionStorage.getItem(MISSION_STORAGE_KEY)).toBe('CREW-42')
    expect(readMissionCode()).toBe('CREW-42')
  })

  it('builds a check-in join URL and QR image', () => {
    writeMissionCode('ASTRA-DEMO')
    const join = missionJoinUrl('https://example.test')
    expect(join).toBe('https://example.test/dashboard.html?mission=ASTRA-DEMO#check-in')
    expect(qrImageUrl(join)).toContain(encodeURIComponent(join))
  })
})
