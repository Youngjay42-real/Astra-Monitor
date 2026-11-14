/** Shared demo mission identity for phone ↔ desktop crew link (not PHI). */

export const DEFAULT_MISSION_CODE = 'ASTRA-DEMO'
export const MISSION_STORAGE_KEY = 'astra-mission-code'

function storage(): Storage | null {
  try {
    if (typeof sessionStorage === 'undefined') return null
    return sessionStorage
  } catch {
    return null
  }
}

export function readMissionCode(): string {
  const stored = storage()?.getItem(MISSION_STORAGE_KEY)?.trim().toUpperCase()
  return stored || DEFAULT_MISSION_CODE
}

export function writeMissionCode(code: string): string {
  const normalized = code.trim().toUpperCase() || DEFAULT_MISSION_CODE
  storage()?.setItem(MISSION_STORAGE_KEY, normalized)
  return normalized
}

/** Capture ?mission= from the URL and persist for this tab session. */
export function syncMissionFromUrl(search = window.location.search): string {
  const params = new URLSearchParams(search)
  const fromQuery = params.get('mission')?.trim()
  if (fromQuery) return writeMissionCode(fromQuery)
  return readMissionCode()
}

export function missionJoinUrl(origin = window.location.origin): string {
  const code = readMissionCode()
  return `${origin}/dashboard.html?mission=${encodeURIComponent(code)}#check-in`
}

export function qrImageUrl(data: string, size = 200): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`
}
