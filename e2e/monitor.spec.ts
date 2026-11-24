import { expect, test, type Page } from '@playwright/test'
import type { MessagesSnapshot } from '../src/api/types'
import { checkConsistency } from '../src/stream/consistency'
import type { MessagesData } from '../src/stream/reducers'

const MOCK = 'http://localhost:4100'
const REASONS = [
  'Refund is above the AI limit (500 SAR)',
  'Customer asked to speak to a person',
  'Billing dispute needs a supervisor',
  'العميل غير راضٍ ويطلب موظفاً',
]

const messagesLog = (page: Page) => page.getByRole('log', { name: 'Messages' })
const conversations = (page: Page) => page.getByRole('listbox', { name: 'Conversations' }).getByRole('option')

/** Reads the app's query cache through the dev-only `window.__hams` handle. */
async function clientThread(page: Page, id: string) {
  return page.evaluate((id) => {
    const rt = (window as unknown as { __hams: { queryClient: { getQueryData(k: unknown): unknown } } }).__hams
    return rt.queryClient.getQueryData(['messages', id]) as MessagesData | undefined
  }, id)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(conversations(page)).toHaveCount(8)
})

test('loads the list and keeps the 5,000-message thread virtualized', async ({ page }) => {
  await conversations(page).filter({ hasText: 'Sara Alqahtani' }).click()
  const rows = messagesLog(page).locator('[data-index]')
  await expect(rows.first()).toBeVisible()
  expect(await rows.count()).toBeLessThan(100)

  await messagesLog(page).evaluate((el) => {
    el.scrollTop = 0
  })
  await expect
    .poll(() => messagesLog(page).evaluate((el) => Math.min(...[...el.querySelectorAll<HTMLElement>('[data-index]')].map((r) => Number(r.dataset.index)))))
    .toBe(0)
})

test('survives drops without gaps or duplicates', async ({ page, request }) => {
  await conversations(page).filter({ hasText: 'John Carter' }).click()
  await expect(messagesLog(page).locator('[data-index]').first()).toBeVisible()
  const badge = page.getByRole('status')

  for (let drop = 1; drop <= 2; drop++) {
    await expect(badge).toHaveText('Reconnecting…', { timeout: 45_000 })
    await expect(badge).toHaveText('Connected', { timeout: 15_000 })
  }

  const id = await page.evaluate(() => {
    const rt = (window as unknown as { __hams: { queryClient: { getQueryCache(): { findAll(f: unknown): { queryKey: unknown[] }[] } } } }).__hams
    return rt.queryClient.getQueryCache().findAll({ queryKey: ['messages'] })[0]!.queryKey[1] as string
  })
  const server = (await (await request.get(`${MOCK}/conversations/${id}/messages`)).json()) as MessagesSnapshot
  // Let the client catch up past the server snapshot before comparing.
  await expect
    .poll(async () => Number((await badge.getAttribute('title'))?.replace('Last event #', '')))
    .toBeGreaterThanOrEqual(server.lastEventId)

  expect(checkConsistency(server, (await clientThread(page, id))!)).toEqual([])
})

test('hand-off → take over → reply with rollback', async ({ page }) => {
  await conversations(page).filter({ hasText: 'Needs human' }).first().click()
  await page.getByRole('button', { name: 'Take over' }).click()
  const reply = page.getByRole('textbox', { name: 'Reply' })
  await expect(reply).toBeEnabled()

  // Force the first send to fail like the mock's random 500.
  let forced = false
  await page.route(`${MOCK}/conversations/*/messages`, async (route) => {
    if (route.request().method() === 'POST' && !forced) {
      forced = true
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Random failure, please retry' }),
      })
    }
    return route.fallback()
  })

  const text = 'We are looking into it — نتابع طلبك'
  await reply.fill(text)
  await reply.press('Enter')
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Random failure, please retry')
  await expect(messagesLog(page).getByText(text, { exact: true })).toHaveCount(0)
  await page.unroute(`${MOCK}/conversations/*/messages`)

  // The real mock still fails ~1 in 5; retry until it goes through.
  for (let attempt = 0; attempt < 6 && (await alert.count()) > 0; attempt++) {
    await alert.first().getByRole('button', { name: 'Retry' }).click()
    await page.waitForTimeout(1500)
  }
  await expect(alert).toHaveCount(0)
  await expect(messagesLog(page).getByText(text, { exact: true })).toHaveCount(1)
})

test('a live hand-off shows its reason', async ({ page }) => {
  const banner = page.getByRole('region', { name: 'Hand-off' })
  await expect(async () => {
    const candidates = conversations(page).filter({ hasText: 'Needs human' })
    for (let i = 0; i < (await candidates.count()); i++) {
      await candidates.nth(i).click()
      const text = (await banner.textContent({ timeout: 1000 }).catch(() => '')) ?? ''
      if (REASONS.some((r) => text.includes(r))) return
    }
    throw new Error('no hand-off with a reason yet')
  }).toPass({ timeout: 45_000, intervals: [2000] })
  await expect(messagesLog(page).getByText(/Transferred to a human/)).toBeVisible()
})

test('switching to Arabic gives the mirrored RTL interface', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Language' }).selectOption('ar')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('المراقبة المباشرة')
  await expect(page.getByRole('listbox', { name: 'المحادثات' })).toBeVisible()
  await expect(page.getByRole('status')).toHaveText(/متصل|جارٍ/)
  const sidebar = await page.locator('.sidebar').boundingBox()
  const main = await page.locator('.main').boundingBox()
  expect(sidebar!.x).toBeGreaterThan(main!.x)

  // The preference survives a reload, and the interface comes back in Arabic.
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('المراقبة المباشرة')
  await page.getByRole('combobox', { name: 'اللغة' }).selectOption('en')
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Live monitor')
})
