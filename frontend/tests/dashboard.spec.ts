import { test, expect } from '@playwright/test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test.beforeEach(async ({page}) => {
 await page.goto('/dashboard.html')
 await expect(page.getByText('Caution — attention recommended',{exact:true})).toBeVisible()
})

test('renders all sections, self-hosted assets, accessible navigation, and responsive layouts',async({page},info)=>{
 const errors:string[]=[]
 page.on('pageerror',error=>errors.push(error.message))
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text())})
 await expect(page).toHaveTitle('ASTRA-MED | Crew Health')
 for(const heading of ['Your daily check-in','Health, across five domains','Space weather','From symptoms to next steps','Medical inventory','Evidence behind the interface']) await expect(page.getByRole('heading',{name:heading,exact:true})).toBeVisible()
 await expect(page.locator('.domain-row')).toHaveCount(5)
 await expect(page.locator('vite-error-overlay')).toHaveCount(0)
 await page.keyboard.press('Tab')
 await expect(page.getByRole('link',{name:'Skip to content'})).toBeFocused()
 await page.getByRole('link',{name:'Log check-in',exact:true}).click()
 await expect(page).toHaveURL(/#check-in$/)
 await expect(page.getByRole('button',{name:'Save check-in',exact:true})).toBeVisible()
 for(const width of [320,390,768,1024,1536]) {
  await page.setViewportSize({width,height:900})
  const size=await page.evaluate(()=>({document:document.documentElement.scrollWidth,viewport:innerWidth}))
  expect(size.document,`No horizontal overflow at ${width}px`).toBeLessThanOrEqual(size.viewport)
 }
 await page.setViewportSize(info.project.name==='mobile'?{width:390,height:844}:{width:1536,height:1024})
 await page.goto('/dashboard.html')
 await page.getByText('Caution — attention recommended',{exact:true}).waitFor()
 await page.evaluate(()=>document.fonts.ready)
 await page.screenshot({path:join(tmpdir(),`astra-med-${info.project.name}.png`),fullPage:true})
 expect(errors).toEqual([])
})

test('validates a check-in, saves it, refreshes history, and persists after reload',async({page})=>{
 const form=page.getByRole('form',{name:'Daily check-in'})
 const values={heart_rate:'72',bp_sys:'70',bp_dia:'80',spo2:'98',sleep_hours:'7.2',exercise_minutes:'30'}
 for(const [name,value] of Object.entries(values)) await form.locator(`[name="${name}"]`).fill(value)
 await form.getByLabel('Mood').selectOption('4')
 await form.locator('[name="symptoms"]').fill('Simulated fatigue for testing')
 await form.getByRole('button',{name:'Save check-in',exact:true}).click()
 await expect(form.getByRole('alert')).toContainText('Systolic pressure must be greater')
 await form.locator('[name="bp_sys"]').fill('118')
 await form.getByRole('button',{name:'Save check-in',exact:true}).click()
 await expect(form.getByText('Check-in saved in the demo. Mission data refreshed.')).toBeVisible()
 await page.getByText('Recent check-ins',{exact:false}).click()
 await expect(page.getByRole('cell',{name:'Simulated fatigue for testing',exact:true})).toBeVisible()
 await page.reload()
 await page.getByText('Recent check-ins',{exact:false}).click()
 await expect(page.getByRole('cell',{name:'Simulated fatigue for testing',exact:true})).toBeVisible()
})

test('assesses selected symptoms, reviews protocol steps, and switches protocols',async({page})=>{
 const form=page.getByRole('form',{name:'Symptom assessment'})
 await form.getByRole('button',{name:'Assess symptoms',exact:true}).click()
 await expect(form.getByRole('alert')).toContainText('Select at least one symptom')
 await form.getByRole('button',{name:'Headache',exact:true}).click()
 await form.getByRole('button',{name:'Fatigue',exact:true}).click()
 await form.getByRole('button',{name:'Assess symptoms',exact:true}).click()
 await expect(page.getByRole('heading',{name:'Ranked guidance'})).toBeVisible()
 await expect(page.getByRole('heading',{name:'Review crew status',exact:true})).toBeVisible()
 const panel=page.getByRole('complementary',{name:'Protocol checklist'})
 await expect(panel).toContainText('Sterile dressing: expired, low stock.')
 for(const checkbox of await panel.getByRole('checkbox').all()) await checkbox.check()
 await expect(panel).toContainText('3 of 3 steps reviewed')
 await expect(panel).toContainText('Checklist reviewed.')
 await page.getByRole('button',{name:'Review the radiation protocol'}).click()
 await expect(panel.getByRole('heading',{name:'Radiation readiness review'})).toBeVisible()
 await expect(panel).toContainText('0 of 3 steps reviewed')
})

test('updates inventory, prevents negative stock, and preserves expiry warnings',async({page})=>{
 const panel=page.locator('#inventory')
 await panel.getByRole('button',{name:'Decrease Temperature probe',exact:true}).click()
 await expect(panel.locator('.inventory-footer [role="status"]')).toContainText('Temperature probe quantity updated to 0.')
 await expect(panel.getByRole('button',{name:'Decrease Temperature probe',exact:true})).toBeDisabled()
 await expect(page.locator('.supply-notice')).toContainText('Temperature probe: low stock, insufficient quantity.')
 await panel.getByRole('button',{name:'Increase Sterile dressing',exact:true}).click()
 await expect(panel.locator('.inventory-footer [role="status"]')).toContainText('Sterile dressing quantity updated to 3.')
 await panel.getByRole('button',{name:'Increase Sterile dressing',exact:true}).click()
 await expect(panel.locator('.inventory-footer [role="status"]')).toContainText('Sterile dressing quantity updated to 4.')
 await expect(page.locator('.supply-notice')).toContainText('Sterile dressing: expired.')
 await page.reload()
 await expect(panel.getByLabel('Sterile dressing count',{exact:true})).toHaveText('4')
})
