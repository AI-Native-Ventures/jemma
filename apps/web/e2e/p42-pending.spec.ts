import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
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

const PROOF_DIR = resolve(import.meta.dirname, '../../../design/proof/p55')

/** Saves a proof image with the dev-only Next.js indicator hidden. */
async function proofShot(page: Page, name: string) {
  mkdirSync(PROOF_DIR, { recursive: true })
  await page.addStyleTag({ content: 'nextjs-portal{display:none !important}' })
  await page.screenshot({ path: resolve(PROOF_DIR, `${name}.png`) })
}

/**
 * Holds the demo sign-in (the server action posts to /demo) so the pending row stays on screen while it is measured.
 * `finish` aborts the held post and removes the hold: the sign-in never reaches the server, so no sandbox is made.
 */
async function holdDemoSignIn(page: Page) {
  let release!: () => void
  const released = new Promise<void>((r) => {
    release = r
  })
  const isDemoPath = (url: URL) => url.pathname === '/demo'
  const handler = async (route: import('@playwright/test').Route) => {
    if (route.request().method() !== 'POST') return route.continue()
    await released
    await route.abort().catch(() => undefined)
  }
  await page.route(isDemoPath, handler)
  return async () => {
    release()
    await page.unroute(isDemoPath, handler)
  }
}

/** Where every part of a pending row sits, read from the browser's own layout (text is measured by its own boxes, not its container's). */
async function readPendingRow(page: Page, name: string) {
  return page.evaluate((personName) => {
    const button = document.querySelector<HTMLElement>('button[aria-busy="true"]')
    if (!button) throw new Error('no pending row on the page')
    const box = button.getBoundingClientRect()
    let maxRight = 0
    const grow = (r: DOMRect) => {
      if (r.width === 0 && r.height === 0) return
      maxRight = Math.max(maxRight, r.right)
    }
    for (const el of button.querySelectorAll('*')) grow(el.getBoundingClientRect())
    const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim()) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const r of range.getClientRects()) grow(r)
    }
    const spans = [...button.querySelectorAll('span')]
    const nameBox = spans.find((s) => s.children.length === 0 && s.textContent === personName)?.getBoundingClientRect()
    const statusBox = button.querySelector('[role="status"]')?.getBoundingClientRect()
    return {
      buttonRight: box.right,
      buttonLeft: box.left,
      buttonTop: box.top,
      buttonBottom: box.bottom,
      buttonHeight: box.height,
      maxRight,
      nameHeight: nameBox?.height ?? -1,
      status: statusBox ? { left: statusBox.left, right: statusBox.right, top: statusBox.top, bottom: statusBox.bottom } : null,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }
  }, name)
}

const OPENING = 'Opening your copy of Hillview Primary'

const SIGN_IN_ROWS = [
  { name: 'Ms Banda', detail: 'Teacher · Grade 6 Mathematics', pill: true, tag: '', widths: [320, 390, 460, 1440] },
  { name: 'Thandi M', detail: "Parent · Amina's mother", pill: false, tag: 'parent-', widths: [390] },
  { name: 'Amina', detail: 'Learner · Grade 6', pill: false, tag: 'learner-', widths: [390] },
]

for (const row of SIGN_IN_ROWS) {
  for (const width of row.widths) {
    test(`the demo sign-in row keeps its shape while it opens (${row.name}, ${width} px)`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'phone', 'sized by the test itself, in the phone project')
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/demo')
      const button = page.getByRole('button', { name: new RegExp(`^${row.name}`) })
      await expect(button).toBeVisible()
      await proofShot(page, `demo-idle-${row.tag}${width}`)

      const finish = await holdDemoSignIn(page)
      try {
        await button.click()
        await page.locator('button[aria-busy="true"]').waitFor({ timeout: 10_000 })
        await expect(button.getByText(OPENING)).toBeVisible(SHOWN)
        await proofShot(page, `demo-pending-${row.tag}${width}`)

        const m = await readPendingRow(page, row.name)
        // (a) nothing inside the row reaches past its right edge
        expect(m.maxRight, 'right edge of the furthest thing in the row').toBeLessThanOrEqual(m.buttonRight + 0.5)
        // (b) the name stays on one line
        expect(m.nameHeight, `height of "${row.name}"`).toBeGreaterThan(0)
        expect(m.nameHeight, `height of "${row.name}"`).toBeLessThan(30)
        // (c) the pill and the detail line step aside while it opens
        if (row.pill) await expect(button.getByText('Start here')).toBeHidden(SHOWN)
        await expect(button.getByText(row.detail)).toBeHidden(SHOWN)
        // (d) the working text is shown, inside the row
        expect(m.status, 'the working text').not.toBeNull()
        expect(m.status!.left).toBeGreaterThanOrEqual(m.buttonLeft - 0.5)
        expect(m.status!.right).toBeLessThanOrEqual(m.buttonRight + 0.5)
        expect(m.status!.top).toBeGreaterThanOrEqual(m.buttonTop - 0.5)
        expect(m.status!.bottom).toBeLessThanOrEqual(m.buttonBottom + 0.5)
        // (e) the row does not grow tall
        expect(m.buttonHeight, 'row height').toBeLessThanOrEqual(110)
        // (f) the page does not scroll sideways
        expect(m.scrollWidth, 'page width').toBeLessThanOrEqual(m.clientWidth)
        // the hold really kept the judge on /demo
        expect(new URL(page.url()).pathname).toBe('/demo')
      } finally {
        await finish()
      }
    })
  }
}
