import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkinInputSchema, eventsSchema, safeUrlSchema, statusSchema } from '../api/schemas'
import { inventoryState, supplyWarnings } from '../lib/inventory'
import { demoStatus } from '../api/mock'

const checkin = { heart_rate:72, bp_sys:118, bp_dia:76, spo2:98, sleep_hours:5.5, mood:3, exercise_minutes:15, symptoms:'Simulated headache' }
const item = { id:'dressing', name:'Sterile dressing', quantity:2, unit:'packs', low_threshold:3, expires_on:'2026-09-01' }
const protocol = { id:'sample', title:'Sample', summary:'Test', steps:[], required_items:[{ item_id:'dressing', quantity:3 }] }

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules() })

describe('data boundaries', () => {
 it('accepts the supplied status contract without optional UI extensions', () => {
  const domains = Object.fromEntries(Object.entries(demoStatus.domains).map(([name,domain]) => [name,{score:domain.score,label:domain.label}]))
  expect(statusSchema.safeParse({...demoStatus,domains}).success).toBe(true)
 })
 it('validates ranges, mood and the blood pressure relationship', () => {
  expect(checkinInputSchema.safeParse(checkin).success).toBe(true)
  for(const changes of [{mood:6},{heart_rate:NaN},{spo2:101},{sleep_hours:-1},{exercise_minutes:1.5},{bp_sys:70,bp_dia:80},{symptoms:'a'.repeat(1001)}]) {
   expect(checkinInputSchema.safeParse({...checkin,...changes}).success).toBe(false)
  }
 })
 it('blocks executable and embedded-data links', () => {
  for(const url of ['javascript:alert(1)','data:text/html,unsafe','file:///etc/passwd','https://nasa.gov@javascript:alert(1)']) expect(safeUrlSchema.safeParse(url).success).toBe(false)
  expect(safeUrlSchema.safeParse('https://ntrs.nasa.gov/').success).toBe(true)
 })
 it('rejects malformed event dates', () => {
  expect(eventsSchema.safeParse([{sepID:'sample',eventTime:'yesterday',instruments:[],link:'https://nasa.gov/'}]).success).toBe(false)
 })
})

describe('inventory integrity', () => {
 it('flags low and expired stock independently', () => {
  expect(inventoryState(item,'2026-11-14')).toEqual({low:true,expired:true})
  expect(inventoryState({...item,quantity:20},'2026-11-14')).toEqual({low:false,expired:true})
  expect(inventoryState({...item,expires_on:null},'2026-11-14')).toEqual({low:true,expired:false})
 })
 it('treats the expiry date as usable through that UTC day', () => {
  expect(inventoryState({...item,expires_on:'2026-11-14'},'2026-11-14').expired).toBe(false)
 })
 it('reports missing, expired and insufficient protocol supplies', () => {
  expect(supplyWarnings(protocol,[])[0]).toContain('missing')
  expect(supplyWarnings(protocol,[item])[0]).toMatch(/expired, low stock, insufficient quantity/)
  expect(supplyWarnings(protocol,[{...item,quantity:10,expires_on:'2099-01-01'}])).toEqual([])
 })
})

describe('live API transport', () => {
 async function liveApi() { vi.stubEnv('VITE_USE_MOCK','false'); vi.stubEnv('VITE_API_BASE_URL','http://localhost:8000/'); return await import('../api/client') }
 it('uses the supplied API URL and validates successful responses', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(demoStatus),{status:200}))
  vi.stubGlobal('fetch',fetchMock)
  const {api}=await liveApi()
  expect((await api.status()).overall).toBe('caution')
  expect(String(fetchMock.mock.calls[0][0])).toBe('http://localhost:8000/api/status')
 })
 it('rejects malformed successful responses', async () => {
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{"overall":"safe"}',{status:200})))
  const {api}=await liveApi()
  await expect(api.status()).rejects.toThrow('does not match')
 })
 it('does not expose server error bodies to the user', async () => {
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('sensitive internal server detail',{status:500})))
  const {api}=await liveApi()
  await expect(api.status()).rejects.toThrow('failed (500)')
 })
 it('reports offline errors instead of substituting demo data', async () => {
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('Network failed')))
  const {api}=await liveApi()
  await expect(api.status()).rejects.toThrow('Cannot reach the API')
 })
 it('validates check-ins before sending any request', async () => {
  const fetchMock=vi.fn(); vi.stubGlobal('fetch',fetchMock)
  const {api}=await liveApi()
  expect(()=>api.saveCheckin({...checkin,mood:9})).toThrow()
  expect(fetchMock).not.toHaveBeenCalled()
 })
})

describe('demo contract and persistence', () => {
 it('stores a check-in and quantity change without networking', async () => {
  vi.stubEnv('VITE_USE_MOCK','true')
  const data=new Map<string,string>()
  vi.stubGlobal('localStorage',{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value)})
  const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock)
  const {api}=await import('../api/client')
  const saved=await api.saveCheckin(checkin)
  expect((await api.checkins())[0].id).toBe(saved.id)
  const items=await api.inventory()
  await api.saveInventory({...items[0],quantity:7})
  expect((await api.inventory())[0].quantity).toBe(7)
  expect(data.size).toBe(1)
  expect(fetchMock).not.toHaveBeenCalled()
 })
})
