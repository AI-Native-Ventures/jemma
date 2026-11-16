import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServiceClient } from '@jemma/profiling/db'
import { expect, test as base, type Page } from '@playwright/test'
import { createSandbox, deleteSandbox } from '../../../supabase/seed/demo'
import { openSandbox, type OpenedSandbox } from './helpers/sandbox'
import { signInWithPassword } from './helpers/session'

// "My own": a learner's private workspace beside the school one. In every fresh Hillview copy Amina has "My school" and "My own"; My own starts with
// the CAPS maps of Grade 6 and Grade 7 and two finished practices in Grade 6 (fractions and whole numbers, 3 of 5 right in each), so it shows real
// counts at once. Nothing in My own is in the school: Ms Banda still sees exactly the five learners of 6B, and taking the copy away takes the
// personal school too. No model is called and no agent is needed.
//
// RUNS IN CI on every push (job "Feature specs in a browser", .github/workflows/ci.yml, the step with the real agent, phone), on CI's own local database.
// Never run it against the hosted preview database. Screenshots are written only when P94_PROOF is set, to design/proof/p94, named by width (390 or 1440).

const check = expect.configure({ timeout: 45_000 })
const admin = () => createServiceClient({ SUPABASE_URL: process.env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY! })

const proofDir = resolve(import.meta.dirname, '../../../design/proof/p94')
async function proof(page: Page, name: string) {
  if (!process.env.P94_PROOF) return
  mkdirSync(proofDir, { recursive: true })
  const width = page.viewportSize()!.width >= 1024 ? 1440 : page.viewportSize()!.width
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: 'nextjs-portal{display:none} *{transition:none !important;animation:none !important}' })
  await page.screenshot({ path: resolve(proofDir, `${name}-${width}.png`), fullPage: true })
}

/** The page does not scroll sideways at this width. */
async function noSidewaysScroll(page: Page) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(wide, 'the page scrolls sideways').toBeLessThanOrEqual(0)
}

/**
 * The switch shows the tapped workspace at once and asks the server afterwards (P95b), so "pressed" no longer says the cookie is set: wait for the
 * cookie before going on, or the next page is drawn for the old workspace.
 */
const workspaceCookie = (page: Page) => async () => (await page.context().cookies()).find((c) => c.name === 'jemma_ws')?.value

const opened: OpenedSandbox[] = []
const made: string[] = []
// A copy is removed as soon as its test is over, so the copies do not pile up on CI's database.
base.afterEach(async () => {
  const db = admin()
  await Promise.all([...opened.splice(0).map((s) => s.cleanup().catch(() => undefined)), ...made.splice(0).map((id) => deleteSandbox(db, id).catch(() => undefined))])
})

const test = base
test.use({ screenshot: 'only-on-failure', actionTimeout: 45_000 })
test.setTimeout(240_000)

test.describe('My own', () => {
  test('Amina in a fresh copy has the switch, taps My own and sees Grade 6 with her two practices; Ms Banda still sees exactly five learners in 6B', async ({ page }) => {
    const sb = await openSandbox(page, { stage: 'start', role: 'learner' })
    opened.push(sb)
    const db = admin()

    // The home: the switch at the top, My school on.
    await page.goto('/k')
    await check(page.getByRole('heading', { level: 1 })).toBeVisible()
    const school = page.getByRole('button', { name: 'My school' })
    const own = page.getByRole('button', { name: 'My own' })
    await expect(school).toBeVisible()
    await expect(own).toBeVisible()
    await expect(school).toHaveAttribute('aria-pressed', 'true')
    await expect(own).toHaveAttribute('aria-pressed', 'false')
    await noSidewaysScroll(page)
    await proof(page, 'switch-school')

    // My school is as it was: the school child has no topic map yet in a fresh copy, so no topic of the CAPS map is on its fractions screen.
    await page.goto('/k/maths/fractions')
    await check(page.getByRole('heading', { level: 1, name: 'Fractions' })).toBeVisible()
    await expect(page.getByText('Common fractions', { exact: true })).toHaveCount(0)

    // Tap My own: it is on, and My maths shows Grade 6 with the counts of the two practices.
    await page.goto('/k')
    await page.getByRole('button', { name: 'My own' }).click()
    await check(page.getByRole('button', { name: 'My own' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'My school' })).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(workspaceCookie(page), { timeout: 45_000 }).toBe('own')
    await noSidewaysScroll(page)
    await proof(page, 'switch-own')

    await page.goto('/k/maths')
    await check(page.getByRole('heading', { level: 1, name: 'My maths' })).toBeVisible()
    expect(await page.locator('main').first().innerText()).toMatch(/3 of 5 right/)
    await noSidewaysScroll(page)
    await proof(page, 'my-maths-own')

    await page.goto('/k/maths/fractions')
    await check(page.getByRole('heading', { level: 1, name: 'Fractions' })).toBeVisible()
    // Grade 6 CAPS teaches common fractions twice (Term 1 and Term 4): one row under each term heading, with the name CAPS gives it (P115).
    const fractions = page.getByRole('listitem').filter({ has: page.getByText('Common fractions', { exact: true }) })
    await expect(fractions).toHaveCount(2)
    await expect(page.getByRole('region', { name: 'Term 1' }).getByRole('listitem').filter({ hasText: 'Common fractions' })).toContainText('3 of 5 right')
    await expect(page.getByRole('region', { name: 'Term 4' }).getByRole('listitem').filter({ hasText: 'Common fractions' })).toContainText('No score yet')
    await expect(page.getByText('From the CAPS curriculum for Grade 6.')).toBeVisible()
    await expect(page.getByText('(Term', { exact: false })).toHaveCount(0)

    await page.goto('/k/maths/whole_numbers')
    await check(page.getByRole('heading', { level: 1, name: 'Whole numbers' })).toBeVisible()
    const whole = page.getByRole('listitem').filter({ has: page.getByText('Whole numbers: addition and subtraction (5-digit numbers)', { exact: true }) })
    await expect(whole).toHaveCount(1)
    await expect(whole).toContainText('3 of 5 right')
    await proof(page, 'my-maths-own-whole-numbers')

    // Back to My school: the home is the school's again.
    await page.goto('/k')
    await page.getByRole('button', { name: 'My school' }).click()
    await check(page.getByRole('button', { name: 'My school' })).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(workspaceCookie(page), { timeout: 45_000 }).toBe('school')

    // The data: the twin is in a personal school of its own, with a class and a CAPS map for Grade 6 and for Grade 7, and the two practices. The school
    // child has no session, and 6B has exactly its five learners.
    const twin = (await db.from('children').select('id, school_id, grade, user_id').eq('private_of', sb.childId).single()).data!
    expect(twin.school_id).not.toBe((await db.from('children').select('school_id').eq('id', sb.childId).single()).data!.school_id)
    const personal = (await db.from('schools').select('kind, sandbox_id').eq('id', twin.school_id).single()).data!
    expect(personal).toEqual({ kind: 'private', sandbox_id: sb.sandboxId })
    const classes = (await db.from('classes').select('id, grade').eq('school_id', twin.school_id).order('grade')).data!
    expect(classes.map((c) => c.grade)).toEqual([6, 7])
    for (const c of classes) expect((await db.from('curriculum_maps').select('status').eq('class_id', c.id)).data).toEqual([{ status: 'approved' }])
    expect((await db.from('sessions').select('status').eq('child_id', twin.id)).data).toEqual([{ status: 'done' }, { status: 'done' }])
    expect((await db.from('sessions').select('id').eq('child_id', sb.childId)).data).toEqual([])
    expect((await db.from('enrolments').select('child_id').eq('class_id', sb.classId)).data).toHaveLength(5)

    // Ms Banda: five learners in 6B, and Amina once.
    const logins = (await db.from('demo_sandboxes').select('logins').eq('id', sb.sandboxId).single()).data!.logins as { teacher: { email: string; password: string } }
    await page.context().clearCookies()
    await signInWithPassword(page, logins.teacher.email, logins.teacher.password)
    const baseURL = new URL(process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000')
    await page.context().addCookies([{ name: 'jemma_demo', value: sb.sandboxId, domain: baseURL.hostname, path: '/', httpOnly: true, secure: false, sameSite: 'Lax' }])
    await page.goto(`/t/${sb.classId}/learners`)
    await check(page.getByRole('heading', { level: 1 })).toBeVisible()
    const people = page.locator('main a[href*="/learners/"][href$="/profile"]')
    await expect(people).toHaveCount(5)
    await expect(page.getByRole('link', { name: /^Amina/ })).toHaveCount(1)
    await noSidewaysScroll(page)
    await proof(page, 'teacher-learners')
  })

  test('taking a copy away takes its personal school and the twin with it', async () => {
    const db = admin()
    const sb = await createSandbox(db, { stage: 'start' })
    made.push(sb.sandboxId)
    const before = (await db.from('schools').select('id, kind').eq('sandbox_id', sb.sandboxId)).data!
    // Amina's personal school and Kagiso's (P99, the child of Zanele M): each holds one child.
    expect(before.map((s) => s.kind).sort()).toEqual(['private', 'private', 'school'])
    const personals = before.filter((s) => s.kind === 'private').map((s) => s.id)
    for (const personal of personals) expect((await db.from('children').select('id').eq('school_id', personal)).data).toHaveLength(1)

    await deleteSandbox(db, sb.sandboxId)
    made.splice(0)
    expect((await db.from('schools').select('id').eq('sandbox_id', sb.sandboxId)).data).toEqual([])
    for (const personal of personals) {
      expect((await db.from('children').select('id').eq('school_id', personal)).data).toEqual([])
      expect((await db.from('classes').select('id').eq('school_id', personal)).data).toEqual([])
    }
  })

  test('a copy that starts from an empty school has no personal school', async () => {
    const db = admin()
    const sb = await createSandbox(db, { kind: 'empty' })
    made.push(sb.sandboxId)
    const schools = (await db.from('schools').select('kind').eq('sandbox_id', sb.sandboxId)).data!
    expect(schools).toEqual([{ kind: 'school' }])
  })
})
