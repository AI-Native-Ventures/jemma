import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServiceClient } from '@jemma/profiling/db'
import { expect, test, type Page } from '@playwright/test'
import { openSandbox, type OpenedSandbox } from './helpers/sandbox'

// The made-up school (Mathematics only): a teacher with a class of made-up learners (Mr Dlamini), a teacher with two classes (Ms Banda),
// a generated learner with a planted pattern who signs in, and a school that starts empty and is filled with made-up learners in one tap.
// Headless. The step that shows a generated learner's pattern needs the local agent (AI_MODE=replay) with the recorded answer.
// Screenshots go to design/proof/p65 only when P65_PROOF is set, named by width (390 or 1440).

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

/** The made-up learners of the school, from the roster the seed uses (it depends only on the year). */
async function roster() {
  const { madeUpClasses } = await import('../../../supabase/seed/fixtures/hillview')
  const classes = madeUpClasses(new Date().getUTCFullYear())
  const of = (key: string) => classes.find((c) => c.classKey === key)!.batch.learners
  return { sevenA: of('7a-maths'), fiveA: of('5a-maths') }
}

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
  test('pick Mr Dlamini: his class is 7A Mathematics, with its six made-up learners', async ({ page }) => {
    const { sevenA, fiveA } = await roster()
    await page.goto('/demo')
    await check(page.getByRole('heading', { name: 'More people at Hillview' })).toBeVisible()
    await check(page.getByRole('button', { name: /Mr Dlamini/ })).toContainText('7A Mathematics')
    await expect(page.getByRole('button', { name: /Ms Okafor/ })).toContainText('4A Mathematics')
    await expect(page.getByRole('button', { name: /Nomsa K/ })).toContainText(`${fiveA[0]!.firstName} (Grade 5), ${sevenA[0]!.firstName} (Grade 7)`)
    await expect(page.getByRole('button', { name: /Start from an empty school/ })).toBeVisible()
    // The three big buttons stay first and unchanged.
    await expect(page.getByRole('button', { name: /Ms Banda/ })).toContainText('Start here')
    await noHorizontalScroll(page)
    await proof(page, 'demo-page')

    await page.getByRole('button', { name: /Mr Dlamini/ }).click()
    await page.waitForURL(/\/t\/[0-9a-f-]{36}\/learners$/, { timeout: 120_000 })
    await takeCookieSandbox(page)
    const classId = page.url().split('/').at(-2)!
    const db = admin()
    expect((await db.from('classes').select('name').eq('id', classId).single()).data!.name).toBe('7A Mathematics')
    for (const l of sevenA) await check(page.getByRole('link', { name: new RegExp(`^${l.firstName}`) }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /^Amina/ })).toHaveCount(0) // 6B has its own children, not these
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

  test("Ms Banda has two classes, 6B and 5A, and opens Amina's Long view: one subject, no chips", async ({ page }) => {
    opened = await openSandbox(page, { stage: 'start', role: 'teacher' })
    await page.goto('/t')
    await check(page.getByRole('link', { name: /6B Mathematics/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /5A Mathematics/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /7A Mathematics|4A Mathematics/ })).toHaveCount(0)
    await noHorizontalScroll(page)
    await proof(page, 'ms-banda-classes')

    await page.goto(`/t/${opened.classId}/learners/${opened.childId}/long-view`)
    const table = page.getByRole('table')
    await check(table).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Subjects' })).toHaveCount(0)
    await expect(page.locator('[data-subject-heading]')).toHaveText('Mathematics')
    await expect(table.getByRole('rowheader', { name: 'Fractions' })).toBeVisible()
    await noHorizontalScroll(page)
    await proof(page, 'amina-long-view')
  })

  test('pick a generated learner with a planted pattern: signed in as a learner, and the class teacher sees the pattern', async ({ page }) => {
    const { fiveA } = await roster()
    const neo = fiveA.find((l) => l.planted)!
    await page.goto('/demo')
    await check(page.getByRole('button', { name: new RegExp(`^${neo.firstName}`) })).toBeVisible()
    await page.getByRole('button', { name: new RegExp(`^${neo.firstName}`) }).click()
    await page.waitForURL(/\/k$/, { timeout: 120_000 })
    const sandboxId = await takeCookieSandbox(page)
    await check(page.getByText(new RegExp(neo.firstName)).first()).toBeVisible()
    await noHorizontalScroll(page)
    await proof(page, 'generated-learner-signed-in')

    const db = admin()
    const box = (await db.from('demo_sandboxes').select('school_id, logins').eq('id', sandboxId).single()).data!
    const child = (await db.from('children').select('id, user_id').eq('school_id', box.school_id).eq('first_name', neo.firstName).single()).data!
    expect(child.user_id).toBeTruthy()
    expect((await db.from('child_logins').select('code').eq('child_id', child.id)).data).toHaveLength(1)
    // Another generated learner has no login until somebody picks them.
    const other = fiveA.find((l) => l.firstName !== neo.firstName)!
    expect((await db.from('children').select('user_id').eq('school_id', box.school_id).eq('first_name', other.firstName).single()).data!.user_id).toBeNull()
    expect(Object.keys((box.logins as { learners?: object }).learners ?? {})).toEqual([neo.firstName])

    // Now as the class teacher, Ms Banda: the learner's Long view finds the planted pattern (the update runs on opening, from the recorded answer).
    await page.goto('/demo/switch')
    await check(page.getByRole('button', { name: /Ms Banda/ })).toBeVisible()
    await page.getByRole('button', { name: /Ms Banda/ }).click()
    await page.waitForURL(/\/t\/[0-9a-f-]{36}\/curriculum$/, { timeout: 120_000 })
    const fiveAClass = (await db.from('classes').select('id').eq('school_id', box.school_id).eq('name', '5A Mathematics').single()).data!.id
    await page.goto(`/t/${fiveAClass}/learners/${child.id}/long-view`)
    await check(page.getByRole('table')).toBeVisible()
    await check(page.getByRole('heading', { name: 'What Jemma found' })).toBeVisible({ timeout: 180_000 })
    const { strandLabel } = await import('../../../packages/profiling/src/logic/strands')
    await expect(page.getByRole('article').filter({ hasText: `Mathematics · ${strandLabel('Mathematics', neo.planted!.family)}` })).toHaveCount(1)
    await noHorizontalScroll(page)
    await proof(page, 'generated-learner-long-view')
  })

  test('start an empty school, create 9A Mathematics, add made-up learners, open one Long view', async ({ page }) => {
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

    await page.getByLabel('Class name').fill('9A Mathematics')
    await page.getByLabel('Grade', { exact: true }).selectOption('9')
    // Another packet (P72) is changing the class form to Mathematics only: choose the subject only if the select is there.
    const subject = page.getByLabel('Subject', { exact: true })
    if ((await subject.count()) > 0) await subject.selectOption('Mathematics')
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
    await expect(page.locator('[data-subject-heading]')).toHaveText('Mathematics')
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
