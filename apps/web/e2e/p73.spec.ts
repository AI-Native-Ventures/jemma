import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServiceClient } from '@jemma/profiling/db'
import { expect, test, type Page } from '@playwright/test'
import { openSandbox, type OpenedSandbox } from './helpers/sandbox'

// Small faults a judge can run into (P73), on the screens a teacher uses:
// - a teacher with four classes still gets a SHORT heading on the class list (Ms Banda has two in a fresh copy, 6B and 5A: two more make four);
// - the "Use the sample curriculum" button is there for a Grade 6 Mathematics class and for no other;
// - past records a teacher brought in are not listed as "Logged late" on a learner's Long view (the seeded late quiz still is);
// - the demo page says when the copy started on the judge's own clock (the browser is put in a time zone far from the server's).
// The first test needs only the web app. The second brings the tidy sample file in, so it needs the agent worker in AI_MODE=replay
// (the answer for the file is a recorded one: no model is called). Headless.
// Screenshots for the reviewer are written only when P73_PROOF is set, to design/proof/p73, named by width (390 or 1440).

const check = expect.configure({ timeout: 45_000 })
const admin = () => createServiceClient({ SUPABASE_URL: process.env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY! })
const AGENT_URL = process.env.AGENT_URL ?? 'http://localhost:8787'

const proofDir = resolve(import.meta.dirname, '../../../design/proof/p73')
async function proof(page: Page, name: string) {
  if (!process.env.P73_PROOF) return
  mkdirSync(proofDir, { recursive: true })
  const width = page.viewportSize()!.width >= 1024 ? 1440 : page.viewportSize()!.width
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: 'nextjs-portal{display:none} *{transition:none !important;animation:none !important} nav.sticky.bottom-0{position:static !important}' })
  await page.screenshot({ path: resolve(proofDir, `${name}-${width}.png`), fullPage: true })
}

/** The page itself never scrolls sideways. When it does, the failure names what sticks out. */
async function noHorizontalScroll(page: Page) {
  const sticksOut = await page.evaluate(() => {
    const limit = document.documentElement.clientWidth
    if (document.documentElement.scrollWidth <= limit) return []
    return [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > limit + 1)
      .slice(0, 6)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 50)} right=${Math.round(el.getBoundingClientRect().right)} of ${limit}`)
  })
  expect(sticksOut).toEqual([])
}

let sb: OpenedSandbox | null = null
test.afterEach(async () => {
  await sb?.cleanup().catch(() => undefined)
  sb = null
})

/**
 * Opens a page and waits for its heading. The shared database is slow at times and a page can answer "not found" or come up empty
 * once, so the page is reloaded up to three times before the check is allowed to fail.
 */
async function openWith(page: Page, path: string, heading: string) {
  await page.goto(path)
  for (let tries = 0; tries < 3; tries++) {
    if (await page.getByRole('heading', { name: heading }).isVisible({ timeout: 20_000 }).catch(() => false)) return
    await page.reload()
  }
  await check(page.getByRole('heading', { name: heading })).toBeVisible()
}

/** Makes a class through the form (name and grade only) and returns its id. */
async function makeClass(page: Page, name: string, grade: number): Promise<string> {
  await page.goto(`/t/new?grade=${grade}`)
  await check(page.getByLabel('Grade', { exact: true })).toHaveValue(String(grade))
  await page.getByLabel('Class name').fill(name)
  await page.getByRole('button', { name: 'Create class' }).click()
  await check(page).toHaveURL(/\/t\/new\/[0-9a-f-]{36}$/)
  return page.url().split('/').pop()!
}

/** Waits until no Long view update of the school is queued or running, then closes the ones that could not run (no model runs in this test). */
async function settleLongViewUpdates(schoolId: string) {
  const db = admin()
  const until = Date.now() + 240_000
  for (;;) {
    const open = (await db.from('events').select('id').eq('school_id', schoolId).eq('type', 'long_view.requested').in('status', ['queued', 'running'])).data ?? []
    if (open.length === 0) break
    if (Date.now() > until) throw new Error('the Long view updates did not finish')
    await new Promise((r) => setTimeout(r, 2000))
  }
  await db.from('events').update({ status: 'done', error: null }).eq('school_id', schoolId).eq('type', 'long_view.requested').eq('status', 'failed')
}

// The browser is put in a time zone far from wherever the server runs, so a server time cannot pass for the judge's clock.
test.describe('the demo page start time', () => {
  test.use({ timezoneId: 'Asia/Tokyo' })

  test('"Your copy started" shows the hour of the browser\'s own clock', async ({ page }) => {
    test.setTimeout(300_000)
    sb = await openSandbox(page, { stage: 'start', role: 'teacher' })
    await page.goto('/demo')
    const line = page.getByText(/^Your copy started /)
    await check(line).toHaveText(/^Your copy started today at \d\d:\d\d\.$/)
    const shown = (await line.textContent())!.match(/(\d\d):(\d\d)/)!
    // The browser's own time now, in its own zone. The copy was made a moment ago, so the hour is the same and the minute differs by a little.
    const now = await page.evaluate(() => {
      const d = new Date()
      return { hour: d.getHours(), minute: d.getMinutes() }
    })
    const shownMinutes = Number(shown[1]) * 60 + Number(shown[2])
    const nowMinutes = now.hour * 60 + now.minute
    const behind = (nowMinutes - shownMinutes + 1440) % 1440
    // Made before now, within a few minutes (a slow database can take a minute or two), and never a time zone away.
    expect(behind).toBeLessThanOrEqual(10)
    await noHorizontalScroll(page)
    await proof(page, 'demo-started-at')
  })
})

test.describe('small faults a judge can run into', () => {
  test('four classes make a short heading, and the sample curriculum is only for the Grade 6 Mathematics class', async ({ page }) => {
    test.setTimeout(600_000)
    sb = await openSandbox(page, { stage: 'marked', role: 'teacher' })

    // A fresh copy already holds 6B Mathematics (with work waiting for the teacher) and 5A Mathematics (no test yet). Two more make four.
    const grade6 = await makeClass(page, '6C Mathematics', 6)
    const grade9 = await makeClass(page, '9A Mathematics', 9)

    // The class list: one short sentence for what needs the teacher (6B, from the seed), one for the three classes with no test yet.
    await page.goto('/t')
    const heading = page.getByRole('heading', { level: 1 })
    await check(heading).toHaveText(/^6B needs you for \w+ (paper|papers|thing|things)\. Three are waiting to be set up\.$/)
    for (const name of ['6B Mathematics', '5A Mathematics', '6C Mathematics', '9A Mathematics']) await expect(page.getByRole('link', { name: new RegExp(name) })).toBeVisible()
    // Not one sentence per class.
    for (const label of ['5A', '6C', '9A']) await expect(heading).not.toContainText(`${label} is waiting`)
    await noHorizontalScroll(page)
    await proof(page, 'class-list-four-classes')

    // Grade 9: the screen asks for the teacher's own documents and offers no sample.
    await openWith(page, `/t/${grade9}/curriculum`, 'Add your curriculum and Jemma will draft your topic map.')
    await expect(page.getByRole('button', { name: 'Add a file' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Use the sample curriculum' })).toHaveCount(0)
    await expect(page.getByText('Use the sample curriculum')).toHaveCount(0)
    await noHorizontalScroll(page)
    await proof(page, 'curriculum-grade-9')

    // Grade 6 Mathematics, in a demo school: the button is there.
    await openWith(page, `/t/${grade6}/curriculum`, 'Add your curriculum and Jemma will draft your topic map.')
    await expect(page.getByRole('button', { name: 'Use the sample curriculum' })).toBeVisible()
    await noHorizontalScroll(page)
    await proof(page, 'curriculum-grade-6')
  })

  test('the tidy sample of Add past records: its records are not under "Logged late", and the seeded late quiz still is', async ({ page }) => {
    test.setTimeout(900_000)
    const health = await fetch(`${AGENT_URL}/health`).catch(() => null)
    expect(health?.ok, `the agent worker must be running at ${AGENT_URL}`).toBe(true)

    sb = await openSandbox(page, { stage: 'start', role: 'teacher' })
    const db = admin()
    const school = (await db.from('demo_sandboxes').select('school_id').eq('id', sb.sandboxId).single()).data!.school_id
    const lerato = (await db.from('children').select('id').eq('school_id', school).eq('first_name', 'Lerato').single()).data!.id

    await page.goto(`/t/${sb.classId}/learners/records`)
    await page.getByRole('button', { name: /Use the tidy file/ }).click()
    // The screen refreshes itself while Jemma reads, but with a slow database a refresh can be cut off by the next one. So wait on the
    // database for the file to be read, then open the screen again.
    const status = async () => (await db.from('record_imports').select('status').eq('school_id', school)).data?.[0]?.status
    await expect.poll(status, { timeout: 300_000, intervals: [2000] }).toBe('ready')
    await page.reload()
    await check(page.getByRole('heading', { name: 'What Jemma understood' })).toBeVisible()
    await page.getByRole('button', { name: 'Add to records' }).click()
    await expect.poll(status, { timeout: 120_000, intervals: [2000] }).toBe('approved')
    const importId = page.url().split('/').pop()!
    // Saying yes queues the writing; the agent writes the fifteen records.
    const written = async () => (await db.from('learner_records').select('id').eq('import_id', importId)).data?.length
    await expect.poll(written, { timeout: 180_000, intervals: [2000] }).toBe(15)
    await page.reload()
    await check(page.getByText('Added 15 past records from grade5-maths-results.csv.')).toBeVisible()
    await settleLongViewUpdates(school)

    // Lerato has three records from the file (written long after they happened) and the seeded quiz that was written into the records late.
    const rows = (await db.from('learner_records').select('id, title, import_id, happened_on, logged_at').eq('child_id', lerato)).data!
    const brought = rows.filter((r) => r.import_id === importId)
    expect(brought).toHaveLength(3)
    const days = (r: { happened_on: string; logged_at: string }) => (Date.parse(r.logged_at) - Date.parse(r.happened_on)) / 86_400_000
    expect(brought.every((r) => days(r) > 60)).toBe(true)
    const seededLate = rows.filter((r) => r.import_id === null && days(r) > 60)
    expect(seededLate).toHaveLength(1)

    await page.goto(`/t/${sb.classId}/learners/${lerato}/long-view`)
    const late = page.locator('div', { has: page.getByRole('heading', { name: 'Logged late, still counted' }) }).last()
    await check(page.getByRole('heading', { name: 'Logged late, still counted' })).toBeVisible()
    // One entry: the seeded quiz. The three brought in are not in the list.
    await expect(late.getByRole('listitem')).toHaveCount(1)
    await expect(late.getByRole('listitem').first()).toContainText(seededLate[0]!.title)
    for (const r of brought) await expect(late).not.toContainText(r.title)
    await noHorizontalScroll(page)
    await proof(page, 'long-view-brought-in')
  })
})
