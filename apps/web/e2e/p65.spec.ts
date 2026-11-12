import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServiceClient } from '@jemma/profiling/db'
import { expect, test, type Page } from '@playwright/test'
import { openSandbox, type OpenedSandbox } from './helpers/sandbox'

// The made-up school: a teacher with other classes (Mr Dlamini), a learner with three subjects (Amina's Long view and its subject chips),
// a generated learner who signs in, and a school that starts empty and is filled with made-up learners in one tap.
// Headless, no agent needed (an update the agent cannot take is marked failed and the grid still shows). Screenshots go to
// design/proof/p65 only when P65_PROOF is set, named by width (390 or 1440).

const admin = () =>
  createServiceClient({
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  })

const proofDir = resolve(import.meta.dirname, '../../../design/proof/p65')
async function proof(page: Page, name: string, fullPage = true) {
  if (!process.env.P65_PROOF) return
  mkdirSync(proofDir, { recursive: true })
  const width = page.viewportSize()!.width >= 1024 ? 1440 : 390
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: 'nextjs-portal{display:none} *{transition:none !important;animation:none !important}' })
  await page.screenshot({ path: resolve(proofDir, `${name}-${width}.png`), fullPage })
}

async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
}

// First request compiles a route in dev, and every step is a few round trips to the database.
test.setTimeout(240_000)
const check = expect.configure({ timeout: 60_000 })

const FIVE = ['Amina', 'Thabo', 'Lerato', 'Sipho', 'Naledi']

const made: string[] = []
let opened: OpenedSandbox | null = null

/** The sandbox the demo page made by itself, from the cookie, so the test can clean it up. */
async function takeCookieSandbox(page: Page): Promise<string> {
  const cookie = (await page.context().cookies()).find((c) => c.name === 'jemma_demo')
  expect(cookie, 'jemma_demo cookie').toBeTruthy()
  made.push(cookie!.value)
  return cookie!.value
}

test.afterEach(async () => {
  const { deleteSandbox } = await import('../../../supabase/seed/demo')
  const db = admin()
  await Promise.all([...made.splice(0).map((id) => deleteSandbox(db, id).catch(() => undefined)), opened?.cleanup().catch(() => undefined)])
  opened = null
})

test.describe('the made-up school', () => {
  test('pick Mr Dlamini: his class is 6B English, with the same five children', async ({ page }) => {
    await page.goto('/demo')
    await check(page.getByRole('heading', { name: 'More people at Hillview' })).toBeVisible()
    await check(page.getByRole('button', { name: /Mr Dlamini/ })).toContainText('6B English, 7A English')
    await expect(page.getByRole('button', { name: /Nomsa K/ })).toContainText('Neo (Grade 5), Thandiwe (Grade 4)')
    await expect(page.getByRole('button', { name: /Start from an empty school/ })).toBeVisible()
    // The three big buttons stay first and unchanged.
    await expect(page.getByRole('button', { name: /Ms Banda/ })).toContainText('Start here')
    await noHorizontalScroll(page)
    await proof(page, 'demo-page')

    await page.getByRole('button', { name: /Mr Dlamini/ }).click()
    await page.waitForURL(/\/t\/[0-9a-f-]{36}\/learners$/, { timeout: 120_000 })
    const sandboxId = await takeCookieSandbox(page)
    const classId = page.url().split('/').at(-2)!
    const db = admin()
    expect((await db.from('classes').select('name').eq('id', classId).single()).data!.name).toBe('6B English')
    for (const name of FIVE) await check(page.getByRole('link', { name: new RegExp(`^${name}`) }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /^Neo/ })).toHaveCount(0) // 7A English has its own children, not these
    // One child row each: the five are in three classes, not copied three times.
    const school = (await db.from('demo_sandboxes').select('school_id').eq('id', sandboxId).single()).data!.school_id
    for (const name of FIVE) expect((await db.from('children').select('id').eq('school_id', school).eq('first_name', name)).data).toHaveLength(1)
    await noHorizontalScroll(page)
    await proof(page, 'mr-dlamini-learners')

    // The switch page lists the same people, and the teacher is marked as here.
    await page.goto('/demo/switch')
    await check(page.getByRole('heading', { name: 'Switch who you are' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Mr Dlamini/ })).toContainText("You're here")
    await expect(page.getByRole('button', { name: /Ms Okafor/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Grace A/ })).toBeVisible()
    await proof(page, 'switch-more-people')
  })

  test("Ms Banda opens Amina's Long view and switches the subject chips", async ({ page }) => {
    opened = await openSandbox(page, { stage: 'start', role: 'teacher' })
    await page.goto(`/t/${opened.classId}/learners/${opened.childId}/long-view`)
    const chips = page.getByRole('navigation', { name: 'Subjects' })
    await check(chips).toBeVisible()
    await expect(chips.getByRole('link')).toHaveText(['Mathematics', 'English', 'Natural Sciences'])
    await expect(chips.getByRole('link', { name: 'Mathematics' })).toHaveAttribute('aria-current', 'page')
    const table = page.getByRole('table')
    await expect(table.getByRole('rowheader', { name: 'Fractions' })).toBeVisible()
    await expect(table.getByRole('rowheader', { name: 'Writing' })).toHaveCount(0)
    await noHorizontalScroll(page)
    await proof(page, 'amina-long-view-mathematics')

    await chips.getByRole('link', { name: 'English' }).click()
    await page.waitForURL('**/long-view?subject=English')
    await expect(chips.getByRole('link', { name: 'English' })).toHaveAttribute('aria-current', 'page')
    await check(table.getByRole('rowheader', { name: 'Writing' })).toBeVisible()
    await expect(table.getByRole('rowheader', { name: 'Fractions' })).toHaveCount(0)
    await noHorizontalScroll(page)
    await proof(page, 'amina-long-view-english')

    await chips.getByRole('link', { name: 'Natural Sciences' }).click()
    await page.waitForURL('**/long-view?subject=Natural+Sciences')
    await expect(chips.getByRole('link', { name: 'Natural Sciences' })).toHaveAttribute('aria-current', 'page')
    await check(table.getByRole('rowheader').first()).toBeVisible()
    await expect(table.getByRole('rowheader', { name: 'Fractions' })).toHaveCount(0)
    await proof(page, 'amina-long-view-natural-sciences')
  })

  test('pick a generated learner: a login is made then, and the learner is signed in', async ({ page }) => {
    await page.goto('/demo')
    await check(page.getByRole('button', { name: /^Neo/ })).toBeVisible()
    await page.getByRole('button', { name: /^Neo/ }).click()
    await page.waitForURL(/\/k$/, { timeout: 120_000 })
    const sandboxId = await takeCookieSandbox(page)
    await check(page.getByText(/Neo/).first()).toBeVisible()
    await noHorizontalScroll(page)
    await proof(page, 'generated-learner-signed-in')

    const db = admin()
    const box = (await db.from('demo_sandboxes').select('school_id, logins').eq('id', sandboxId).single()).data!
    const neo = (await db.from('children').select('id, user_id').eq('school_id', box.school_id).eq('first_name', 'Neo').single()).data!
    expect(neo.user_id).toBeTruthy()
    expect((await db.from('child_logins').select('code').eq('child_id', neo.id)).data).toHaveLength(1)
    // Another generated learner has no login until somebody picks them.
    const other = (await db.from('children').select('user_id').eq('school_id', box.school_id).eq('first_name', 'Busisiwe').single()).data!
    expect(other.user_id).toBeNull()
    expect(Object.keys((box.logins as { learners?: object }).learners ?? {})).toEqual(['Neo'])
  })

  test('start an empty school, create 9A Natural Sciences, add made-up learners, open one Long view', async ({ page }) => {
    await page.goto('/demo')
    await check(page.getByRole('button', { name: /Start from an empty school/ })).toBeVisible()
    await page.getByRole('button', { name: /Start from an empty school/ }).click()
    await page.waitForURL(/\/demo\/first-class$/, { timeout: 120_000 })
    const sandboxId = await takeCookieSandbox(page)
    const db = admin()
    expect((await db.from('demo_sandboxes').select('kind').eq('id', sandboxId).single()).data!.kind).toBe('empty')
    await check(page.getByRole('heading', { level: 1, name: 'Create your first class' })).toBeVisible()
    await noHorizontalScroll(page)
    await proof(page, 'empty-school-first-class')

    await page.getByLabel('Class name').fill('9A Natural Sciences')
    await page.getByLabel('Grade', { exact: true }).selectOption('9')
    await page.getByLabel('Subject', { exact: true }).selectOption('Natural Sciences')
    await page.getByRole('button', { name: 'Create class' }).click()
    await page.waitForURL(/\/t\/new\/[0-9a-f-]{36}$/, { timeout: 120_000 })
    const classId = page.url().split('/').pop()!

    await page.goto(`/t/${classId}/learners`)
    await check(page.getByRole('button', { name: 'Add made-up learners' })).toBeVisible()
    await noHorizontalScroll(page)
    await proof(page, 'empty-class-learners')
    await page.getByRole('button', { name: 'Add made-up learners' }).click()
    await check(page.getByRole('status')).toContainText('Added 6 made-up learners')
    const kids = (await db.from('enrolments').select('child_id').eq('class_id', classId)).data!
    expect(kids).toHaveLength(6)
    await page.reload()
    await check(page.getByRole('link', { name: /days$/ }).first()).toBeVisible()
    await noHorizontalScroll(page)
    await proof(page, 'made-up-learners-added')

    // One learner's Long view: the grid is filled from the records. The wording may still be pending.
    await page.goto(`/t/${classId}/learners/${kids[0]!.child_id}/long-view`)
    const table = page.getByRole('table')
    await check(table).toBeVisible()
    await expect(table.getByRole('rowheader').first()).toBeVisible()
    expect(await table.getByRole('rowheader').count()).toBeGreaterThanOrEqual(2)
    await expect(page.getByRole('navigation', { name: 'Subjects' }).getByRole('link', { name: 'Natural Sciences' })).toHaveAttribute('aria-current', 'page')
    await noHorizontalScroll(page)
    await proof(page, 'made-up-learner-long-view')
  })

  test('Add made-up learners is not offered in a school that is not a demo, and the action refuses it', async ({ page }) => {
    opened = await openSandbox(page, { stage: 'start', role: 'teacher' })
    // In the demo school the button is there.
    await page.goto(`/t/${opened.classId}/learners`)
    await check(page.getByRole('button', { name: 'Add made-up learners' })).toBeVisible()
    // Take the sandbox mark off the school: now it looks like a real school, and the button is gone.
    const db = admin()
    const box = (await db.from('demo_sandboxes').select('school_id').eq('id', opened.sandboxId).single()).data!
    await db.from('schools').update({ sandbox_id: null }).eq('id', box.school_id)
    try {
      await page.reload()
      await check(page.getByRole('heading', { name: 'Learners' }).first()).toBeVisible()
      await expect(page.getByRole('button', { name: 'Add made-up learners' })).toHaveCount(0)
    } finally {
      await db.from('schools').update({ sandbox_id: opened.sandboxId }).eq('id', box.school_id)
    }
  })
})
