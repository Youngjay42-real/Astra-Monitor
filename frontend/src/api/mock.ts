import { z } from 'zod'
import { checkinsSchema, inventorySchema, type Checkin, type InventoryItem, type Protocol, type Status } from './schemas'

const storageKey = 'astra-med-sim-v1'
const initialInventory: InventoryItem[] = [
  { id: 'water', name: 'Water pouches', quantity: 12, unit: 'pouches', low_threshold: 3, expires_on: '2027-06-30' },
  { id: 'probe', name: 'Temperature probe', quantity: 1, unit: 'unit', low_threshold: 0, expires_on: null },
  { id: 'dressing', name: 'Sterile dressing', quantity: 2, unit: 'packs', low_threshold: 3, expires_on: '2026-09-01' },
  { id: 'gloves', name: 'Examination gloves', quantity: 8, unit: 'pairs', low_threshold: 2, expires_on: '2027-12-31' },
]
const seedCheckin: Checkin = { id: 'sample-001', created_at: '2026-11-13T19:07:00Z', heart_rate: 72, bp_sys: 118, bp_dia: 76, spo2: 98, sleep_hours: 5.5, mood: 3, exercise_minutes: 15, symptoms: 'Mild headache (simulated)' }
const storeSchema = z.object({ checkins: checkinsSchema, inventory: inventorySchema })
type DemoStore = z.infer<typeof storeSchema>
let memory: DemoStore | undefined
function readStore(): DemoStore {
  if (memory) return memory
  try {
    const saved = localStorage.getItem(storageKey)
    if (saved) { const result = storeSchema.safeParse(JSON.parse(saved)); if (result.success) return (memory = result.data) }
  } catch { /* Storage may be unavailable. The demo remains usable in memory. */ }
  return (memory = { checkins: [seedCheckin], inventory: structuredClone(initialInventory) })
}
function persist(store: DemoStore) {
  memory = store
  try { localStorage.setItem(storageKey, JSON.stringify(store)) } catch { /* In-memory fallback; no health data is logged. */ }
}
export const demoStatus: Status = {
  overall: 'caution', score: 62, crew_name: 'Sim Crew A', mission_day: 42,
  domains: {
    radiation: { score: 78, label: 'Elevated SEP activity', action: 'Review the radiation protocol', history: [42, 44, 41, 52, 57, 65, 78] },
    bone: { score: 40, label: 'Exercise below target', action: 'Review your exercise log', history: [35, 39, 33, 34, 37, 38, 40] },
    cardio: { score: 35, label: 'Nominal', action: 'Continue daily check-ins', history: [38, 40, 35, 37, 33, 36, 35] },
    immune: { score: 45, label: 'Mild symptom flags', action: 'Record any symptom changes', history: [32, 34, 36, 40, 38, 42, 45] },
    behavioral: { score: 55, label: 'Sleep debt', action: 'Review your rest plan', history: [38, 43, 41, 46, 49, 51, 55] },
  },
  actions: [ { priority: 1, text: 'Review mission radiation guidance before the next EVA.' }, { priority: 2, text: 'Review the planned exercise session with mission support.' } ],
}
const protocols: Record<string, Protocol> = {
  'crew-check-in': {
    id: 'crew-check-in', title: 'Crew check-in & contact',
    summary: 'A sample workflow for recording observations and preparing a mission medical consultation. This is not an operational medical protocol.',
    steps: [ { id: 'record', text: 'Record current symptoms and check-in readings.' }, { id: 'supplies', text: 'Review available supplies and flag expired stock.' }, { id: 'contact', text: 'Prepare a summary for mission medical support.' } ],
    required_items: [ { item_id: 'probe', quantity: 1 }, { item_id: 'dressing', quantity: 1 } ],
  },
  radiation: {
    id: 'radiation', title: 'Radiation readiness review',
    summary: 'A simulated readiness checklist. Radiation exposure and EVA decisions require mission-approved procedures and qualified mission support.',
    steps: [ { id: 'review-event', text: 'Review the recorded space-weather event and its timestamp.' }, { id: 'consult', text: 'Consult mission-approved radiation and EVA procedures.' }, { id: 'notify', text: 'Prepare the available information for mission support.' } ],
    required_items: [],
  },
}
export class MockHttpError extends Error { status: number; constructor(message: string, status: number) { super(message); this.status = status } }
export async function mockRequest(path: string, method: string, body?: unknown): Promise<unknown> {
  await new Promise((resolve) => setTimeout(resolve, 220))
  const store = readStore()
  if (path === '/api/status' && method === 'GET') return structuredClone(demoStatus)
  if (path === '/api/checkins') {
    if (method === 'GET') return structuredClone(store.checkins)
    if (method === 'POST') {
      const checkin = { ...(body as object), id: crypto.randomUUID(), created_at: new Date().toISOString() } as Checkin
      persist({ ...store, checkins: [checkin, ...store.checkins].slice(0, 500) })
      return checkin
    }
  }
  if (path === '/api/inventory') {
    if (method === 'GET') return structuredClone(store.inventory)
    if (method === 'POST') {
      const item = body as InventoryItem
      const exists = store.inventory.some((existing) => existing.id === item.id)
      persist({ ...store, inventory: exists ? store.inventory.map((existing) => existing.id === item.id ? item : existing) : [...store.inventory, item] })
      return structuredClone(item)
    }
  }
  if (path.startsWith('/api/protocols/') && method === 'GET') {
    const protocol = protocols[decodeURIComponent(path.slice('/api/protocols/'.length))]
    if (!protocol) throw new MockHttpError('Protocol not found.', 404)
    return structuredClone(protocol)
  }
  if (path === '/api/assess' && method === 'POST') return { guidance: [
    { rank: 1, title: 'Review crew status', detail: 'Record the reported symptoms and review the latest check-in. This demo returns the same illustrative guidance for every submission.', protocol_id: 'crew-check-in' },
    { rank: 2, title: 'Prepare a medical consultation', detail: 'Summarize observations and available supplies for qualified mission medical support.', protocol_id: 'crew-check-in' },
  ] }
  if (path === '/api/radiation/events' && method === 'GET') return [ { sepID: '2026-09-05T15:45:00-SEP-001', eventTime: '2026-09-05T15:45:00Z', instruments: ['GOES-P: SEISS >100 MeV'], link: 'https://kauai.ccmc.gsfc.nasa.gov/DONKI/' } ]
  if (path === '/api/evidence' && method === 'GET') return [
    { id: 'osdr', source: 'OSDR', title: 'Open Science Data Repository', description: 'Explore NASA space biology and life science datasets.', url: 'https://science.nasa.gov/biological-physical/data/' },
    { id: 'ntrs', source: 'NTRS', title: 'NASA Technical Reports Server', description: 'Browse NASA aerospace research and technical reports.', url: 'https://ntrs.nasa.gov/' },
    { id: 'hrr', source: 'HRR', title: 'Human Research Roadmap', description: 'Explore evidence, risks and gaps in human spaceflight.', url: 'https://humanresearchroadmap.nasa.gov/' },
  ]
  if (path === '/api/predictions' && method === 'GET') return [ { id: 'demo-sleep', domain: 'behavioral', label: 'Sample rising-risk flag: sleep debt. Review the rest plan.' } ]
  throw new MockHttpError('Demo endpoint not found.', 404)
}
