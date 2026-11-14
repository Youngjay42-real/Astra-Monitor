import { z } from 'zod'

export const domainNames = ['radiation', 'bone', 'cardio', 'immune', 'behavioral'] as const
export const scoreSchema = z.number().min(0).max(100)
const domainSchema = z.object({
  score: scoreSchema,
  label: z.string().max(500),
  action: z.string().max(500).optional(),
  history: z.array(scoreSchema).min(2).max(90).optional(),
})
export const statusSchema = z.object({
  overall: z.enum(['nominal', 'caution', 'critical']),
  score: scoreSchema,
  domains: z.object({ radiation: domainSchema, bone: domainSchema, cardio: domainSchema, immune: domainSchema, behavioral: domainSchema }),
  actions: z.array(z.object({ priority: z.number().int().positive(), text: z.string().max(500) })).max(30),
  crew_name: z.string().max(100),
  mission_day: z.number().int().nonnegative(),
})

const checkinFields = z.object({
  heart_rate: z.number().int().min(20).max(250),
  bp_sys: z.number().int().min(40).max(300),
  bp_dia: z.number().int().min(20).max(200),
  spo2: z.number().min(50).max(100),
  sleep_hours: z.number().min(0).max(24),
  mood: z.number().int().min(1).max(5),
  exercise_minutes: z.number().int().min(0).max(1440),
  symptoms: z.string().trim().max(1000),
})
export const checkinInputSchema = checkinFields.refine((value) => value.bp_sys > value.bp_dia, {
  message: 'Systolic pressure must be greater than diastolic pressure.', path: ['bp_sys'],
})
export const checkinSchema = checkinFields.extend({ id: z.string().max(100), created_at: z.iso.datetime({ offset: true }) }).refine((value) => value.bp_sys > value.bp_dia)
export const checkinsSchema = z.array(checkinSchema).max(500)
export const assessInputSchema = z.object({
  symptoms: z.array(z.string().trim().min(1).max(100)).min(1).max(10),
  severity: z.enum(['mild', 'moderate', 'severe']),
  notes: z.string().trim().max(1000),
})
export const protocolSchema = z.object({
  id: z.string().min(1).max(100), title: z.string().max(200), summary: z.string().max(2000),
  steps: z.array(z.object({ id: z.string().max(100), text: z.string().max(1000) })).max(50),
  required_items: z.array(z.object({ item_id: z.string().max(100), quantity: z.number().int().positive() })).max(50),
})
export const assessmentSchema = z.object({
  guidance: z.array(z.object({ rank: z.number().int().positive(), title: z.string().max(200), detail: z.string().max(2000), protocol_id: z.string().max(100) })).max(20),
})

// Untrusted API links must never become javascript: or data: links.
export const safeUrlSchema = z.string().max(2048).refine((value) => {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password }
  catch { return false }
}, 'Only HTTP(S) links without embedded credentials are supported.')
export const eventsSchema = z.array(z.object({ sepID: z.string().max(200), eventTime: z.iso.datetime({ offset: true }), instruments: z.array(z.string().max(200)).max(20), link: safeUrlSchema })).max(100)
export const evidenceSchema = z.array(z.object({ id: z.string().max(100), source: z.enum(['OSDR', 'NTRS', 'HRR']), title: z.string().max(300), description: z.string().max(1000), url: safeUrlSchema })).max(100)
export const inventoryItemSchema = z.object({
  id: z.string().min(1).max(100), name: z.string().max(200), quantity: z.number().int().min(0).max(999),
  unit: z.string().max(50), low_threshold: z.number().int().min(0).max(999), expires_on: z.iso.date().nullable(),
})
export const inventorySchema = z.array(inventoryItemSchema).max(200)
export const predictionsSchema = z.array(z.object({ id: z.string().max(100), domain: z.enum(domainNames), label: z.string().max(500) })).max(30)

export type Status = z.infer<typeof statusSchema>
export type DomainName = typeof domainNames[number]
export type CheckinInput = z.infer<typeof checkinInputSchema>
export type Checkin = z.infer<typeof checkinSchema>
export type AssessInput = z.infer<typeof assessInputSchema>
export type Protocol = z.infer<typeof protocolSchema>
export type Assessment = z.infer<typeof assessmentSchema>
export type InventoryItem = z.infer<typeof inventoryItemSchema>
export type Evidence = z.infer<typeof evidenceSchema>[number]
export type RadiationEvent = z.infer<typeof eventsSchema>[number]
export type Prediction = z.infer<typeof predictionsSchema>[number]
