import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServiceClient } from '@jemma/profiling/db'
import { addOwnGrade } from '@jemma/profiling/own'
import { expect, test as base, type Page } from '@playwright/test'
import { createSandbox, deleteSandbox } from '../../../supabase/seed/demo'
import { signInWithPassword } from './helpers/session'

// A learner who signed up alone joins their school class (P112), on a phone. A learner with a login of their own and one record in a personal school
// (the shape a sign-up alone makes) opens Me, tries a code no class has (a plain refusal), types the class code of a demo school and sends it: the
// card says who the learner is waiting for. Ms Banda finds "{name} wants to join {class}" in Needs you, opens it, says "Add as a new learner" and "Yes,
// approve". The learner signs in again and has "My school" (the official side, the class of the school) and "My own" (the practice they already had).
// No model is called and no agent is needed.
//
// RUNS IN CI on every push (job "Feature specs in a browser", .github/workflows/ci.yml, the step with the real agent, phone), on CI's own local database.
// Never run it against the hosted preview database. Screenshots are written only when P112_PROOF is set, to design/proof/p112, named by width (360, 390
// or 1440), by a person who runs it by hand against a build.

const check = expect.configure({ timeout: 45_000 })
const admin = () => createServiceClient({ SUPABASE_URL: process.env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY! })

const proofDir = resolve(import.meta.dirname, '../../../design/proof/p112')
async function proof(page: Page, name: string) {
  if (!process.env.P112_PROOF) return
  mkdirSync(proofDir, { recursive: true })
  const width = page.viewportSize()!.width
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: 'nextjs-portal{display:none} *{transition:none !important;animation:none !important}' })
  await page.screenshot({ path: resolve(proofDir, `${name}-${width}.png`), fullPage: true })
}

/** The page does not scroll sideways at this width. */
async function noSidewaysScroll(page: Page) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(wide, 'the page scrolls sideways').toBeLessThanOrEqual(0)
}

/** The page at the three widths the screens are built for (360 and 390: phones; 1440: a laptop), no sideways scroll at any of them, a screenshot of each. */
async function atEveryWidth(page: Page, name: string) {
  for (const [width, height] of [[360, 800], [390, 844], [1440, 900]] as const) {
    await page.setViewportSize({ width, height })
    await noSidewaysScroll(page)
    await proof(page, name)
  }
  await page.setViewportSize({ width: 390, height: 844 })
}

type Cleanup = () => Promise<void>
const cleanups: Cleanup[] = []
base.afterEach(async () => {
  for (const c of cleanups.splice(0)) await c().catch(() => undefined)
})

const test = base
test.use({ screenshot: 'only-on-failure', actionTimeout: 45_000 })
test.setTimeout(300_000)

/** A learner who signed up alone: a login, a learner profile, one child in a personal school, the CAPS class of Grade 6. Like what a sign-up alone makes. */
async function makeLearnerAlone() {
  const db = admin()
  const email = `p112-learner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1`
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true })
  if (created.error) throw created.error
  const userId = created.data.user.id
  const school = await db.from('schools').insert({ name: "Zola's own", country: 'ZA', kind: 'private' }).select('id').single()
  if (school.error) throw school.error
  cleanups.push(async () => {
    await db.from('schools').delete().eq('id', school.data.id)
    await db.auth.admin.deleteUser(userId)
  })
  const profile = await db.from('profiles').insert({ user_id: userId, role: 'learner', display_name: 'Zola', school_id: school.data.id })
  if (profile.error) throw profile.error
  const child = await db.from('children').insert({ school_id: school.data.id, first_name: 'Zola', grade: 6, user_id: userId }).select('id').single()
  if (child.error) throw child.error
  await addOwnGrade(db, child.data.id, 6, userId)
  return { db, email, password, userId, childId: child.data.id, schoolId: school.data.id }
}

test.describe('a learner who signed up alone joins their school class', () => {
  test('types the teacher code, the teacher approves a new learner, and the learner has My school and My own', async ({ page }) => {
    const learner = await makeLearnerAlone()
    const { db } = learner
    const sandbox = await createSandbox(db, { stage: 'start' })
    cleanups.push(() => deleteSandbox(db, sandbox.sandboxId))
    const logins = (await db.from('demo_sandboxes').select('logins').eq('id', sandbox.sandboxId).single()).data!.logins as Record<'teacher', { email: string; password: string }>
    const baseURL = new URL(process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000')

    // 1. The home keeps to "class" (no school, no teacher); Me has the full card; then a code no class has, then the code of the class.
    await signInWithPassword(page, learner.email, learner.password)
    await page.goto('/k')
    await check(page.getByRole('heading', { name: 'Join your class' })).toBeVisible()
    await expect(page.getByLabel('Class code')).toBeVisible()
    expect(await page.locator('main').first().innerText()).not.toMatch(/school|teacher/i)
    await atEveryWidth(page, 'learner-home-card')
    await page.goto('/k/me')
    await check(page.getByRole('heading', { name: 'Join your school class' })).toBeVisible()
    await expect(page.getByLabel("Your teacher's class code")).toBeVisible()
    await atEveryWidth(page, 'learner-card')
    // A tap made before the page has woken up is lost, so the typing and the tap are tried again until the line shows.
    await expect(async () => {
      await page.getByLabel("Your teacher's class code").fill('ZZZZZZ')
      await page.getByRole('button', { name: 'Send' }).click({ timeout: 5_000 })
      await expect(page.getByRole('alert').filter({ hasText: 'No class has that code' })).toHaveText('No class has that code. Check it with your teacher.', { timeout: 5_000 })
    }).toPass({ timeout: 45_000 })
    expect((await db.from('class_join_requests').select('id').eq('own_child_id', learner.childId)).data).toEqual([])

    await page.getByLabel("Your teacher's class code").fill(sandbox.joinCode.toLowerCase())
    await page.getByRole('button', { name: 'Send' }).click()
    await check(page.getByText('Waiting for Ms Banda to say yes.')).toBeVisible()
    const requests = (await db.from('class_join_requests').select('id, class_id, status, requested_name').eq('own_child_id', learner.childId)).data!
    expect(requests).toEqual([expect.objectContaining({ class_id: sandbox.classId, status: 'pending', requested_name: 'Zola' })])
    const requestId = requests[0]!.id
    expect((await db.from('needs_you_items').select('kind, status, title').eq('ref_id', requestId)).data).toEqual([
      expect.objectContaining({ kind: 'approve_join', status: 'open', title: expect.stringMatching(/^Zola wants to join /) }),
    ])
    // The card stays on the home too, and no second request can be made.
    await page.goto('/k')
    await check(page.getByText('Waiting for Ms Banda to say yes.')).toBeVisible()
    await expect(page.getByLabel('Class code')).toHaveCount(0)
    await atEveryWidth(page, 'learner-waiting')

    // 2. Ms Banda: the item in Needs you, who the learner is, yes.
    await page.context().clearCookies()
    await signInWithPassword(page, logins.teacher.email, logins.teacher.password)
    await page.context().addCookies([{ name: 'jemma_demo', value: sandbox.sandboxId, domain: baseURL.hostname, path: '/', httpOnly: true, secure: false, sameSite: 'Lax' }])
    await page.goto(`/t/${sandbox.classId}`)
    const item = page.getByRole('link', { name: /Zola wants to join/ })
    await check(item).toBeVisible()
    await item.click()
    await expect(page).toHaveURL(new RegExp(`/t/${sandbox.classId}/join-requests/${requestId}$`), { timeout: 45_000 })
    await check(page.getByRole('heading', { level: 1 })).toHaveText(/^Zola wants to join .+\. Who is Zola\?$/)
    await expect(page.getByRole('button', { name: 'Add as a new learner' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^This is / }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Yes, approve' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'No, decline' })).toBeVisible()
    await atEveryWidth(page, 'teacher-page')
    await expect(async () => {
      await page.getByRole('button', { name: 'Add as a new learner' }).click({ timeout: 5_000 })
      await expect(page.getByRole('button', { name: 'Add as a new learner' })).toHaveAttribute('aria-pressed', 'true', { timeout: 5_000 })
    }).toPass({ timeout: 45_000 })
    await page.getByRole('button', { name: 'Yes, approve' }).click()
    await page.waitForURL(new RegExp(`/t/${sandbox.classId}$`), { timeout: 90_000 })
    await expect(page.getByRole('link', { name: /Zola wants to join/ })).toHaveCount(0)

    // The data: a new school child of the class with the learner's login, enrolled; the own record is its twin; one approval with the teacher's name.
    const school = (await db.from('children').select('id, grade, first_name, user_id, private_of').eq('school_id', sandbox.schoolId).eq('user_id', learner.userId)).data!
    expect(school).toEqual([expect.objectContaining({ first_name: 'Zola', grade: 6, user_id: learner.userId, private_of: null })])
    const schoolChild = school[0]!.id
    expect((await db.from('enrolments').select('class_id').eq('child_id', schoolChild)).data).toEqual([{ class_id: sandbox.classId }])
    expect((await db.from('children').select('private_of, user_id, school_id').eq('id', learner.childId).single()).data).toEqual({ private_of: schoolChild, user_id: learner.userId, school_id: learner.schoolId })
    expect((await db.from('class_join_requests').select('status').eq('id', requestId).single()).data).toEqual({ status: 'approved' })
    expect((await db.from('needs_you_items').select('status').eq('ref_id', requestId)).data).toEqual([{ status: 'done' }])
    const approvals = (await db.from('approvals').select('kind, decision, decided_by_name').eq('ref_id', requestId)).data!
    expect(approvals).toEqual([{ kind: 'class_join', decision: 'approved', decided_by_name: 'Ms Banda' }])
    await noSidewaysScroll(page)

    // 3. The learner signs in again: the switch, My school first, My own beside it with the practice they already had, and no card to join.
    await page.context().clearCookies()
    await signInWithPassword(page, learner.email, learner.password)
    await page.goto('/k')
    const group = page.getByRole('group', { name: 'Where you practise' })
    await check(group).toBeVisible()
    await expect(page.getByRole('button', { name: 'My school', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'My own', exact: true })).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByRole('heading', { name: /^Join your (school )?class$/ })).toHaveCount(0)
    await atEveryWidth(page, 'learner-switch')
    await expect(async () => {
      await page.getByRole('button', { name: 'My own', exact: true }).click({ timeout: 5_000 })
      await expect(page.getByRole('button', { name: 'My own', exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 5_000 })
    }).toPass({ timeout: 45_000 })
    await page.getByRole('link', { name: 'My maths' }).first().click()
    await expect(page).toHaveURL(/\/k\/maths$/, { timeout: 45_000 })
    const grades = page.getByRole('navigation', { name: 'Grades' })
    await expect(grades.getByRole('link', { name: 'Grade 6' })).toHaveAttribute('aria-current', 'page')
    await atEveryWidth(page, 'my-own')

    // Nothing in My own went to the school: the class list has the five learners and Zola, and no practice of the own record is in the school record.
    expect((await db.from('enrolments').select('child_id').eq('class_id', sandbox.classId)).data).toHaveLength(6)
    expect((await db.from('sessions').select('id').eq('child_id', schoolChild)).data).toEqual([])
  })
})
