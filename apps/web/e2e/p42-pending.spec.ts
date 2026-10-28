import { createServiceClient } from '@jemma/profiling/db'
import { expect, test, type Page } from '@playwright/test'
import { openSandbox, type OpenedSandbox } from './helpers/sandbox'

const admin = () =>
  createServiceClient({
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  })

// First request compiles the route in dev, and a sandbox takes a few seconds to seed.
test.setTimeout(120_000)

const SHOWN = { timeout: 300 }

/** Holds page loads and server actions for 1.5 s so the waiting state can be seen deterministically. */
async function slowServer(page: Page) {
  await page.route('**/*', async (route) => {
    const h = route.request().headers()
    if ((h['next-action'] || h['rsc']) && !h['next-router-prefetch']) await new Promise((r) => setTimeout(r, 1500))
    await route.continue()
  })
}

const opened: OpenedSandbox[] = []
test.afterAll(async () => {
  await Promise.all(opened.map((s) => s.cleanup().catch(() => undefined)))
})

test('demo sign-in shows it is working within 300 ms and cannot be tapped twice', async ({ page }) => {
  await page.goto('/demo')
  await slowServer(page)
  const row = page.getByRole('button', { name: /Ms Banda/ })
  await row.click()
  await expect(row).toHaveAttribute('aria-busy', 'true', SHOWN)
  await expect(row).toBeDisabled(SHOWN)
  await expect(page).toHaveURL(/\/t\/[0-9a-f-]{36}\//, { timeout: 60_000 })
  const cookie = (await page.context().cookies()).find((c) => c.name === 'jemma_demo')
  if (cookie) {
    opened.push({
      sandboxId: cookie.value,
      classId: '',
      childId: '',
      joinCode: '',
      cleanup: async () => {
        const { deleteSandbox } = await import('../../../supabase/seed/demo')
        await deleteSandbox(admin(), cookie.value)
      },
    })
  }
})

test('a teacher form submit shows the pending button within 300 ms', async ({ page }) => {
  const sb = await openSandbox(page, { stage: 'marked', role: 'teacher' })
  opened.push(sb)
  await page.goto(`/t/${sb.classId}/learners/${sb.childId}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Amina' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Note' }).fill('Pending state check.')
  await slowServer(page)
  const save = page.getByRole('button', { name: 'Save note' })
  await save.click()
  await expect(save).toHaveAttribute('aria-busy', 'true', SHOWN)
  await expect(save.getByRole('status')).toBeVisible(SHOWN)
  await expect(save).toBeDisabled(SHOWN)
  await expect(page.getByRole('region', { name: 'Earlier notes' }).getByText('Pending state check.')).toBeVisible({ timeout: 30_000 })
})

test('a tab switch shows the top progress bar within 300 ms', async ({ page }, testInfo) => {
  const sb = await openSandbox(page, { stage: 'marked', role: 'teacher' })
  opened.push(sb)
  await page.goto(`/t/${sb.classId}`)
  await page.waitForLoadState('networkidle')
  await slowServer(page)
  const bar = page.locator('[data-nav-progress]')
  await expect(bar).toHaveAttribute('data-state', 'idle')
  const nav = testInfo.project.name === 'phone' ? page.getByRole('navigation').last() : page.getByRole('navigation').first()
  const before = page.url()
  await nav.getByRole('link').filter({ hasNotText: /^$/ }).nth(1).click()
  await expect(bar).toHaveAttribute('data-state', 'loading', SHOWN)
  const box = await bar.boundingBox()
  expect(box!.y).toBe(0)
  expect(box!.height).toBe(2)
  await expect.poll(() => page.url(), { timeout: 30_000 }).not.toBe(before)
  await expect(bar).toHaveAttribute('data-state', 'idle', { timeout: 10_000 })
})
