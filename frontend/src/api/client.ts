import { z } from 'zod'
import {
  assessInputSchema,
  assessmentSchema,
  checkinInputSchema,
  checkinSchema,
  checkinsSchema,
  eventsSchema,
  evidenceSchema,
  inventoryItemSchema,
  inventorySchema,
  observeScanInputSchema,
  observeScanSchema,
  missionChatInputSchema,
  missionChatSchema,
  sessionFrameAckSchema,
  sessionFrameSchema,
  sessionStatusSchema,
  sessionSyncSchema,
  type MissionChatInput,
  type MissionChatTurn,
  predictionsSchema,
  protocolSchema,
  statusSchema,
  type AssessInput,
  type CheckinInput,
  type InventoryItem,
  type ObserveScanInput,
} from './schemas'

/** Test-only override. Production/Render always uses the backend API (default false). */
export const isMock = import.meta.env.VITE_USE_MOCK === 'true'
// Empty string = same-origin (API + UI on one Render service).
// Local Vite preview/dev always talk to the FastAPI process on :8000.
const configuredBase = import.meta.env.VITE_API_BASE_URL
const localHost =
  typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
const baseUrl = (
  configuredBase === undefined || configuredBase === ''
    ? import.meta.env.DEV || localHost
      ? 'http://127.0.0.1:8000'
      : ''
    : configuredBase
).replace(/\/+$/, '')

export const apiBaseUrl = baseUrl || window.location.origin

export class ApiError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

type RequestOptions = { method?: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal }

export async function request<T>(path: string, schema: z.ZodType<T>, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET'
  let data: unknown

  // Mock path is reserved for automated tests (Playwright/Vitest) when VITE_USE_MOCK=true.
  if (isMock) {
    options.signal?.throwIfAborted()
    const { mockRequest } = await import('./mock')
    data = await mockRequest(path, method, options.body)
    options.signal?.throwIfAborted()
  } else {
    const absoluteBase = baseUrl || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8000')
    const url = new URL(absoluteBase)
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new ApiError('The API URL must use HTTP or HTTPS.')
    }
    const timeoutMs =
      path.includes('/observe/') || path.includes('/mission-chat') ? 60000 : 12000
    const timeout = AbortSignal.timeout(timeoutMs)
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
    try {
      const response = await fetch(`${absoluteBase}${path}`, {
        method,
        signal,
        headers: {
          Accept: 'application/json',
          ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      })
      if (!response.ok) {
        let detail = ''
        try {
          const errBody = (await response.json()) as { detail?: string }
          detail = typeof errBody.detail === 'string' ? errBody.detail : ''
        } catch {
          /* ignore */
        }
        throw new ApiError(
          detail ||
            (response.status === 422
              ? 'The API rejected these values. Check your entries and try again.'
              : `The API request failed (${response.status}). Please try again.`),
          response.status,
        )
      }
      try {
        data = await response.json()
      } catch {
        throw new ApiError('The API returned invalid JSON. Contact the backend team.')
      }
    } catch (error) {
      if (options.signal?.aborted) throw error
      if (timeout.aborted) throw new ApiError('The API took too long to respond. Please retry.')
      if (error instanceof ApiError) throw error
      throw new ApiError('Cannot reach the API. Check your connection and API configuration.')
    }
  }

  const result = schema.safeParse(data)
  if (!result.success) {
    throw new ApiError('The API response does not match the agreed format. Contact the backend team.')
  }
  return result.data
}

export const api = {
  status: (signal?: AbortSignal) => request('/api/status', statusSchema, { signal }),
  checkins: (signal?: AbortSignal) => request('/api/checkins', checkinsSchema, { signal }),
  saveCheckin: (body: CheckinInput) =>
    request('/api/checkins', checkinSchema, { method: 'POST', body: checkinInputSchema.parse(body) }),
  events: (signal?: AbortSignal) => request('/api/radiation/events', eventsSchema, { signal }),
  evidence: (signal?: AbortSignal) => request('/api/evidence', evidenceSchema, { signal }),
  assess: (body: AssessInput) =>
    request('/api/assess', assessmentSchema, { method: 'POST', body: assessInputSchema.parse(body) }),
  protocol: (id: string, signal?: AbortSignal) =>
    request(`/api/protocols/${encodeURIComponent(id)}`, protocolSchema, { signal }),
  inventory: (signal?: AbortSignal) => request('/api/inventory', inventorySchema, { signal }),
  saveInventory: (body: InventoryItem) =>
    request('/api/inventory', inventoryItemSchema, { method: 'POST', body: inventoryItemSchema.parse(body) }),
  predictions: (signal?: AbortSignal) => request('/api/predictions', predictionsSchema, { signal }),
  observeScan: (body: ObserveScanInput) =>
    request('/api/observe/scan', observeScanSchema, {
      method: 'POST',
      body: observeScanInputSchema.parse(body),
    }),
  missionChat: (body: MissionChatInput) =>
    request('/api/mission-chat', missionChatSchema, {
      method: 'POST',
      body: missionChatInputSchema.parse(body),
    }),
  registerSession: (sessionId: string, body: { device: 'phone' | 'desktop'; mission?: string }) =>
    request(`/api/session/${encodeURIComponent(sessionId)}/register`, sessionStatusSchema, {
      method: 'POST',
      body,
    }),
  sessionStatus: (sessionId: string, signal?: AbortSignal) =>
    request(`/api/session/${encodeURIComponent(sessionId)}`, sessionStatusSchema, { signal }),
  sessionSync: (sessionId: string, signal?: AbortSignal) =>
    request(`/api/session/${encodeURIComponent(sessionId)}/sync`, sessionSyncSchema, { signal }),
  sessionAppendTurns: (sessionId: string, turns: MissionChatTurn[]) =>
    request(`/api/session/${encodeURIComponent(sessionId)}/turns`, sessionSyncSchema, {
      method: 'POST',
      body: { turns },
    }),
  sessionAppendEvent: (sessionId: string, title: string, detail: string) =>
    request(`/api/session/${encodeURIComponent(sessionId)}/events`, sessionSyncSchema, {
      method: 'POST',
      body: { title, detail },
    }),
  sessionPutFrame: (
    sessionId: string,
    body: { mime_type: string; data_base64: string; live?: boolean },
  ) =>
    request(`/api/session/${encodeURIComponent(sessionId)}/frame`, sessionFrameAckSchema, {
      method: 'POST',
      body: { live: true, ...body },
    }),
  sessionGetFrame: (sessionId: string, signal?: AbortSignal) =>
    request(`/api/session/${encodeURIComponent(sessionId)}/frame`, sessionFrameSchema, { signal }),
}
