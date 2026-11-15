const PAIR_STORAGE_KEY = 'astra-pair-session'

export function getPairIdFromUrl(search = window.location.search): string | null {
  const id = new URLSearchParams(search).get('pair')?.trim()
  return id && id.length >= 8 ? id : null
}

export function isPhoneDeviceFromUrl(search = window.location.search): boolean {
  return new URLSearchParams(search).get('device') === 'phone'
}

export function getOrCreatePairId(): string {
  const fromUrl = getPairIdFromUrl()
  if (fromUrl) {
    try {
      sessionStorage.setItem(PAIR_STORAGE_KEY, fromUrl)
    } catch {
      /* ignore */
    }
    return fromUrl
  }
  try {
    const stored = sessionStorage.getItem(PAIR_STORAGE_KEY)
    if (stored && stored.length >= 8) return stored
    const id = crypto.randomUUID()
    sessionStorage.setItem(PAIR_STORAGE_KEY, id)
    return id
  } catch {
    return crypto.randomUUID()
  }
}

export function phonePairUrl(origin: string, mission: string, pairId: string): string {
  const params = new URLSearchParams({
    mission,
    pair: pairId,
    device: 'phone',
  })
  return `${origin}/dashboard.html?${params.toString()}`
}