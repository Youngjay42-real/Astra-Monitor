import { test, expect } from '@playwright/test'
import { demoStatus } from '../src/api/mock'

const protocol={id:'crew-check-in',title:'API protocol',summary:'A simulated backend protocol.',steps:[{id:'one',text:'Record observations.'}],required_items:[]}
const initialCheckin={id:'seed',created_at:'2026-11-13T19:07:00Z',heart_rate:72,bp_sys:118,bp_dia:76,spo2:98,sleep_hours:5.5,mood:3,exercise_minutes:15,symptoms:''}

test('API mode reports a failed status request and recovers through Retry without demo fallback',async({page})=>{
 let fail=true
 await page.route('http://localhost:8000/**',async(route)=>{
  const path=new URL(route.request().url()).pathname
  const data=path==='/api/status'?demoStatus:path.startsWith('/api/protocols/')?protocol:[]
  await route.fulfill({status:path==='/api/status'&&fail?503:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(data)})
 })
 await page.goto('/dashboard.html')
 const hero=page.locator('#overview')
 await expect(hero).toContainText('Status unavailable')
 await expect(hero.getByRole('alert')).toContainText('failed (503)')
 await expect(page.getByText('SIMULATED DATA',{exact:true})).toHaveCount(0)
 await expect(page.getByText('API CONNECTED MODE',{exact:true})).toBeVisible()
 fail=false
 await hero.getByRole('button',{name:'Retry',exact:true}).click()
 await expect(hero).toContainText('Caution — attention recommended')
 await expect(hero.getByRole('alert')).toHaveCount(0)
})

test('rejects malformed payloads and dangerous evidence links',async({page})=>{
 await page.route('http://localhost:8000/**',async(route)=>{
  const path=new URL(route.request().url()).pathname
  const data=path==='/api/status'?{overall:'nominal'}:path==='/api/evidence'?[{id:'bad',source:'NTRS',title:'Unsafe link',description:'',url:'javascript:alert(1)'}]:path.startsWith('/api/protocols/')?protocol:[]
  await route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(data)})
 })
 await page.goto('/dashboard.html')
 await expect(page.locator('#overview').getByRole('alert')).toContainText('does not match the agreed format')
 await expect(page.locator('.evidence-section').getByRole('alert')).toContainText('does not match the agreed format')
 await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0)
})

test('POST uses the agreed check-in fields and refreshes backend status and history',async({page})=>{
 let checkins=[initialCheckin]
 let statusReads=0
 let payload:Record<string,unknown>|undefined
 await page.route('http://localhost:8000/**',async(route)=>{
  const request=route.request(), path=new URL(request.url()).pathname
  let data:unknown=[]
  if(path==='/api/status'){statusReads++;data=demoStatus}
  if(path.startsWith('/api/protocols/')) data=protocol
  if(path==='/api/checkins') {
   if(request.method()==='POST') {payload=request.postDataJSON();const entry={...payload,id:'saved-api',created_at:new Date().toISOString()} as typeof initialCheckin;checkins=[entry,...checkins];data=entry}
   else data=checkins
  }
  await route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(data)})
 })
 await page.goto('/dashboard.html')
 await expect(page.getByText('Caution — attention recommended',{exact:true})).toBeVisible()
 const before=statusReads
 const form=page.getByRole('form',{name:'Daily check-in'})
 for(const [name,value] of Object.entries({heart_rate:'73',bp_sys:'120',bp_dia:'80',spo2:'99',sleep_hours:'8',exercise_minutes:'40'})) await form.locator(`[name="${name}"]`).fill(value)
 await form.getByLabel('Mood').selectOption('4')
 await form.locator('[name="symptoms"]').fill('Simulated API check-in')
 await form.getByRole('button',{name:'Save check-in',exact:true}).click()
 await expect(form.getByText('Check-in saved. Mission data refreshed.')).toBeVisible()
 expect(payload).toEqual({heart_rate:73,bp_sys:120,bp_dia:80,spo2:99,sleep_hours:8,exercise_minutes:40,mood:4,symptoms:'Simulated API check-in'})
 expect(statusReads).toBeGreaterThan(before)
 await page.getByText('Recent check-ins',{exact:false}).click()
 await expect(page.getByRole('cell',{name:'Simulated API check-in'})).toBeVisible()
})
