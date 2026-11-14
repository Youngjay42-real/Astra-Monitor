import { z } from 'zod'
import { assessInputSchema, assessmentSchema, checkinInputSchema, checkinSchema, checkinsSchema, eventsSchema, evidenceSchema, inventoryItemSchema, inventorySchema, predictionsSchema, protocolSchema, statusSchema, type AssessInput, type CheckinInput, type InventoryItem } from './schemas'

export const isMock = (import.meta.env.VITE_USE_MOCK ?? 'true') === 'true'
const baseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '')
export class ApiError extends Error {
  status?: number
  constructor(message: string, status?: number) { super(message); this.name = 'ApiError'; this.status = status }
}
export function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'Something went wrong. Please try again.' }

type RequestOptions = { method?: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal }
export async function request<T>(path: string, schema: z.ZodType<T>, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET'
  let data: unknown
  if (isMock) {
    options.signal?.throwIfAborted()
    const { mockRequest } = await import('./mock')
    data = await mockRequest(path, method, options.body)
    options.signal?.throwIfAborted()
  } else {
    const url = new URL(baseUrl)
    if (!['http:', 'https:'].includes(url.protocol)) throw new ApiError('The API URL must use HTTP or HTTPS.')
    const timeout = AbortSignal.timeout(12000)
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method, signal, headers: { Accept: 'application/json', ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      })
      if (!response.ok) throw new ApiError(response.status === 422 ? 'The API rejected these values. Check your entries and try again.' : `The API request failed (${response.status}). Please try again.`, response.status)
      try { data = await response.json() } catch { throw new ApiError('The API returned invalid JSON. Contact the backend team.') }
    } catch (error) {
      if (options.signal?.aborted) throw error
      if (timeout.aborted) throw new ApiError('The API took too long to respond. Please retry.')
      if (error instanceof ApiError) throw error
      throw new ApiError('Cannot reach the API. Check your connection and API configuration.')
    }
  }
  const result = schema.safeParse(data)
  if (!result.success) throw new ApiError('The API response does not match the agreed format. Contact the backend team.')
  return result.data
}
export const api = {
  status: (signal?: AbortSignal) => request('/api/status', statusSchema, { signal }),
  checkins: (signal?: AbortSignal) => request('/api/checkins', checkinsSchema, { signal }),
  saveCheckin: (body: CheckinInput) => request('/api/checkins', checkinSchema, { method: 'POST', body: checkinInputSchema.parse(body) }),
  events: (signal?: AbortSignal) => request('/api/radiation/events', eventsSchema, { signal }),
  evidence: (signal?: AbortSignal) => request('/api/evidence', evidenceSchema, { signal }),
  assess: (body: AssessInput) => request('/api/assess', assessmentSchema, { method: 'POST', body: assessInputSchema.parse(body) }),
  protocol: (id: string, signal?: AbortSignal) => request(`/api/protocols/${encodeURIComponent(id)}`, protocolSchema, { signal }),
  inventory: (signal?: AbortSignal) => request('/api/inventory', inventorySchema, { signal }),
  saveInventory: (body: InventoryItem) => request('/api/inventory', inventoryItemSchema, { method: 'POST', body: inventoryItemSchema.parse(body) }),
  predictions: (signal?: AbortSignal) => request('/api/predictions', predictionsSchema, { signal }),
}
