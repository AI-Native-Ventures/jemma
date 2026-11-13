import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServiceClient } from '@jemma/profiling/db'
import { expect, test } from '@playwright/test'
import { openSandbox, type OpenedSandbox } from './helpers/sandbox'

const admin = () =>
  createServiceClient({
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  })

const actual = (board: string) => {
  const dir = resolve(import.meta.dirname, '../../../design/actual')
  mkdirSync(dir, { recursive: true })
  return resolve(dir, `${board}.png`)
}

// First request compiles the route in dev, and a sandbox takes a few seconds to seed.
test.setTimeout(120_000)

/** Saves the design-match image with the dev-only Next.js indicator hidden. */
async function shoot(page: import('@playwright/test').Page, board: string, fullPage = false) {
  await page.addStyleTag({ content: 'nextjs-portal{display:none !important}' })
  await page.screenshot({ path: actual(board), fullPage })
}

const opened: OpenedSandbox[] = []
test.afterAll(async () => {
  await Promise.all(opened.map((s) => s.cleanup().catch(() => undefined)))
})

/** Ids of sandboxes the page made by itself (Try the demo), read from the jemma_demo cookie. */
async function cookieSandbox(page: import('@playwright/test').Page): Promise<string> {
  const cookie = (await page.context().cookies()).find((c) => c.name === 'jemma_demo')
  expect(cookie, 'jemma_demo cookie').toBeTruthy()
  opened.push({
    sandboxId: cookie!.value,
    classId: '',
    childId: '',
    joinCode: '',
    cleanup: async () => {
      const { deleteSandbox } = await import('../../../supabase/seed/demo')
      await deleteSandbox(admin(), cookie!.value)
    },
  })
  return cookie!.value
}

test('Try the demo signs in as Ms Banda', async ({ page }) => {
  await page.goto('/demo')
  await expect(page.getByRole('heading', { name: 'Try the demo', level: 1 })).toBeVisible()
  // No copy yet: step 3 names the code in words, not "class code the class code".
  await expect(page.locator('li', { hasText: "link Amina with Ms Banda's class code, then open her profile." })).toBeVisible()
  await page.getByRole('button', { name: /Ms Banda/ }).click()
  await expect(page).toHaveURL(/\/t\/[0-9a-f-]{36}\/curriculum$/, { timeout: 60_000 })
  await cookieSandbox(page)
})

test('Main shows the copy and this sandbox join code', async ({ page }) => {
  const s = await openSandbox(page, { stage: 'start', role: 'teacher' })
  opened.push(s)
  await page.goto('/demo')
  await expect(page.getByRole('heading', { name: 'Try the demo', level: 1 })).toBeVisible()
  await expect(page.getByText('You get your own copy of Hillview Primary, a made-up school.')).toBeVisible()
  await expect(page.getByText('Teacher · Grade 6 Mathematics')).toBeVisible()
  await expect(page.getByText("Parent · Amina's mother")).toBeVisible()
  await expect(page.getByText('Learner · Grade 6')).toBeVisible()
  await expect(page.getByText(s.joinCode)).toBeVisible()
  // The guide tells the judge to share, and ends on the Long view.
  await expect(page.getByText('Then tap Share with parents.', { exact: false })).toBeVisible()
  await expect(page.locator('li', { hasText: `link Amina with class code ${s.joinCode}, then open her profile.` })).toBeVisible()
  await expect(page.getByText("see the result, the updated gaps and Amina's Long view.")).toBeVisible()
  await expect(page.getByText(/Your copy started today at \d\d:\d\d\./)).toBeVisible()
  await expect(page.getByText('Every person and paper here is made up.')).toBeVisible()
  // The three big buttons come first; the rest of the school is listed under them, and an empty school can be started.
  await expect(page.getByRole('heading', { name: 'More people at Hillview' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Mr Dlamini/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Ms Okafor/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Start from an empty school/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  if (test.info().project.name === 'phone') await shoot(page, 'Main', true)
})

test('switch role shows the next demo step', async ({ page }) => {
  const s = await openSandbox(page, { stage: 'start', role: 'teacher' })
  opened.push(s)
  await page.goto('/demo/switch')
  await expect(page.getByRole('heading', { name: 'Switch who you are' })).toBeVisible()
  await expect(page.getByText('Step 1 of 5')).toBeVisible()
  await expect(page.getByText('Demo · your own copy')).toBeVisible()
  await expect(page.getByText("You're here")).toBeVisible()
  await expect(page.getByText(s.joinCode)).toBeVisible()
  if (test.info().project.name === 'phone') await shoot(page, 'demo-switch')

  await page.getByRole('button', { name: /Thandi M/ }).click()
  await expect(page).toHaveURL(/\/p$/)
  await page.goto('/demo/switch')
  await expect(page.getByText('Step 1 of 5')).toBeVisible()
})

test('switch role names the next step as the copy moves on, and waits for the share', async ({ page }) => {
  // Five papers are marked after the teacher snapped them, but nothing is shared yet: the judge is still on step 2 and is told to share.
  const marked = await openSandbox(page, { stage: 'marked', role: 'teacher' })
  opened.push(marked)
  await page.goto('/demo/switch')
  await expect(page.getByText('Step 2 of 5')).toBeVisible()
  await expect(page.getByText('Next: sign in as Ms Banda, snap the memo and 5 papers, then tap Share with parents.')).toBeVisible()

  // A finished copy is on step 5, which ends on the Long view.
  const finished = await openSandbox(page, { stage: 'session_done', role: 'teacher' })
  opened.push(finished)
  await page.goto('/demo/switch')
  await expect(page.getByText('Step 5 of 5')).toBeVisible()
  await expect(page.getByText("Next: see the result and the updated gaps as Ms Banda and as Thandi, then open Amina's Long view as Ms Banda.")).toBeVisible()

  // Hold its test again (as if the teacher had not shared it): the step goes back to 2 until the share.
  const db = admin()
  const { data: school } = await db.from('demo_sandboxes').select('school_id').eq('id', finished.sandboxId).single()
  const { data: tests } = await db.from('tests').select('id').eq('class_id', finished.classId)
  expect(school?.school_id).toBeTruthy()
  await db.from('tests').update({ held: true }).in('id', tests!.map((t) => t.id))
  await page.goto('/demo/switch')
  await expect(page.getByText('Step 2 of 5')).toBeVisible()
  await db.from('tests').update({ held: false }).in('id', tests!.map((t) => t.id))
  await page.goto('/demo/switch')
  await expect(page.getByText('Step 5 of 5')).toBeVisible()
})

test('reset demo keeps the judge on /demo', async ({ page }) => {
  const s = await openSandbox(page, { stage: 'start', role: 'teacher' })
  opened.push(s)
  await page.goto('/demo/reset')
  await expect(page.getByRole('heading', { name: 'Reset your demo?' })).toBeVisible()
  await expect(page.getByText('Clears what you snapped, marked and wrote')).toBeVisible()
  if (test.info().project.name === 'phone') await shoot(page, 'demo-reset')
  await page.getByRole('button', { name: 'Reset demo' }).click()
  await expect(page).toHaveURL(/\/demo$/, { timeout: 60_000 })
  // Same sandbox id, a fresh school: the old join code is gone.
  const { data } = await admin().from('demo_sandboxes').select('school_id').eq('id', s.sandboxId).single()
  const { count } = await admin().from('classes').select('id', { count: 'exact', head: true }).eq('id', s.classId)
  expect(data?.school_id).toBeTruthy()
  expect(count).toBe(0)
})

test('Keep my demo goes back to switch', async ({ page }) => {
  const s = await openSandbox(page, { stage: 'start', role: 'teacher' })
  opened.push(s)
  await page.goto('/demo/reset')
  await page.getByRole('link', { name: 'Keep my demo' }).click()
  await expect(page).toHaveURL(/\/demo\/switch$/)
})
