import { test, expect, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'

test.use({ viewport: { width: 1487, height: 1058 }, reducedMotion: 'reduce' })
async function globeImage(page: Page) {
  const box = await page.locator('.earth-canvas').boundingBox()
  if (!box) throw new Error('Globe canvas is not visible')
  const image = await page.screenshot({ clip: { x: box.x + 100, y: box.y + 100, width: box.width - 200, height: box.height - 200 } })
  return createHash('sha256').update(image).digest('hex')
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.earth-canvas')).toHaveAttribute('data-state', 'ready', { timeout: 30000 })
})

test('renders the globe and supports zoom, keyboard rotation, reset, and workspace navigation', async ({ page }) => {
  test.setTimeout(90000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const canvas = page.locator('.earth-canvas canvas')
  const capture = () => globeImage(page)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('A world away.Still human.')
  await expect(page.getByRole('button', { name: 'Resume rotation' })).toBeVisible()
  const initial = await capture()
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await expect.poll(capture, { timeout: 15000 }).not.toBe(initial)
  await page.getByRole('button', { name: 'Reset Earth view' }).click()
  await expect.poll(capture, { timeout: 15000 }).toBe(initial)
  await canvas.focus()
  await page.keyboard.press('ArrowRight')
  await expect.poll(capture, { timeout: 15000 }).not.toBe(initial)
  await page.getByRole('button', { name: 'Reset Earth view' }).click()
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Globe canvas is not visible')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 30, { steps: 10 })
  await page.mouse.up()
  await expect.poll(capture, { timeout: 15000 }).not.toBe(initial)
  await page.getByRole('link', { name: 'Open workspace' }).click()
  await expect(page).toHaveURL(/dashboard\.html$/)
  await expect(page.getByRole('form', { name: 'Daily check-in' })).toBeVisible()
  expect(errors).toEqual([])
})

test('animates Earth, then pauses every animated layer', async ({ page }) => {
  const capture = () => globeImage(page)
  const initial = await capture()
  await page.getByRole('button', { name: 'Resume rotation' }).click()
  await expect.poll(capture, { timeout: 15000 }).not.toBe(initial)
  await page.getByRole('button', { name: 'Pause rotation' }).click()
  const paused = await capture()
  expect(await capture()).toBe(paused)
})

test('shows data-backed domain details and safe research links', async ({ page }) => {
  await page.getByRole('button', { name: 'Radiation', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Elevated SEP activity' })).toBeVisible()
  await expect(page.locator('.domain-score')).toContainText('78')
  await page.getByRole('button', { name: 'Radiation', exact: true }).click()
  await expect(page.locator('.domain-detail')).toHaveCount(0)
  const links = page.locator('.research-list a')
  await expect(links).toHaveCount(3)
  for (const link of await links.all()) expect(await link.getAttribute('href')).toMatch(/^https:\/\//)
  await expect(page.getByRole('link', { name: 'Record a check-in' })).toHaveAttribute('href', '/dashboard.html#check-in')
})

test('has usable mobile navigation and no overflow at mobile, tablet, or desktop widths', async ({ page }) => {
  for (const width of [320, 390, 760, 1024, 1487]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}px`).toBe(true)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
  await page.getByRole('navigation').getByRole('link', { name: 'Research', exact: true }).click()
  await expect(page).toHaveURL(/#research$/)
  await expect(page.getByRole('navigation')).toBeHidden()
  await expect(page.locator('#research-title')).toBeInViewport()
})

test('falls back to a NASA image when WebGL is unavailable', async ({ browser }) => {
  const context = await browser.newContext()
  await context.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (...args: Parameters<typeof getContext>) {
      if (String(args[0]).includes('webgl')) return null
      return Reflect.apply(getContext, this, args)
    } as typeof getContext
  })
  const page = await context.newPage()
  await page.goto('/')
  await expect(page.locator('.earth-canvas')).toHaveAttribute('data-state', 'fallback')
  await expect(page.getByText('NASA Blue Marble · 3D view unavailable on this device')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Zoom in', exact: true })).toBeDisabled()
  await expect(page.getByRole('link', { name: 'Open workspace' })).toBeVisible()
  await context.close()
})
