import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServiceClient } from '@jemma/profiling/db'
import { expect, test, type Page } from '@playwright/test'
import { openSandbox, type OpenedSandbox } from './helpers/sandbox'
import { signInWithPassword } from './helpers/session'

// "Any class, any school": a teacher makes classes in other grades, copies the learners of a class, puts a learner who is
// already at the school into a second class, makes a learner's sign-in code, and starts a school that is not in the list.
// Jemma covers Mathematics only for now (P72): the forms show the subject and do not offer a choice. Screenshots of the class form and the
// onboarding form go to design/proof/p72 only when P72_PROOF is set.
// Headless, no agent, no model. Screenshots go to design/proof/p63 only when P63_PROOF is set, named by width (390 or 1440).

const admin = () =>
  createServiceClient({
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  })

const proofDir = resolve(import.meta.dirname, '../../../design/proof/p63')
async function proof(page: Page, name: string, fullPage = true) {
  if (!process.env.P63_PROOF) return
  mkdirSync(proofDir, { recursive: true })
  const width = page.viewportSize()!.width >= 1024 ? 1440 : 390
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: 'nextjs-portal{display:none} *{transition:none !important;animation:none !important}' })
  await page.screenshot({ path: resolve(proofDir, `${name}-${width}.png`), fullPage })
}

const proofDir72 = resolve(import.meta.dirname, '../../../design/proof/p72')
async function proof72(page: Page, name: string) {
  if (!process.env.P72_PROOF) return
  mkdirSync(proofDir72, { recursive: true })
  const width = page.viewportSize()!.width >= 1024 ? 1440 : 390
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: 'nextjs-portal{display:none} *{transition:none !important;animation:none !important}' })
  await page.screenshot({ path: resolve(proofDir72, `${name}-${width}.png`), fullPage: true })
}

async function noHorizontalScroll(page: Page) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(wide).toBe(false)
}

// Every step is a few round trips to the database, so the waits are patient.
const check = expect.configure({ timeout: 30_000 })

const idOf = (url: string) => url.split('/').pop()!
const NEW_CLASS_URL = /\/t\/new\/[0-9a-f-]{36}$/

/** The subject of a new class is a read-only line, not a select: Mathematics, with a note that more come later. */
async function expectMathsLine(page: Page) {
  await check(page.getByText('Subject', { exact: true })).toBeVisible()
  await check(page.getByText('Mathematics', { exact: true })).toBeVisible()
  await check(page.getByText('More subjects come later')).toBeVisible()
  await check(page.getByLabel('Subject', { exact: true })).toHaveCount(0)
  await check(page.getByLabel('Subject name')).toHaveCount(0)
  await check(page.locator('option', { hasText: 'English' })).toHaveCount(0)
}

let sb: OpenedSandbox | null = null
let schoolId: string | null = null
const users: string[] = []

test.afterEach(async () => {
  const db = admin()
  const school = sb ? (await db.from('demo_sandboxes').select('school_id').eq('id', sb.sandboxId).maybeSingle()).data?.school_id : null
  if (school) {
    // The sign-in codes made in the test make auth users of their own; the sandbox clean-up does not know them.
    const kids = (await db.from('children').select('id').eq('school_id', school)).data ?? []
    const logins = kids.length ? ((await db.from('child_logins').select('user_id').in('child_id', kids.map((k) => k.id))).data ?? []) : []
    for (const l of logins) await db.auth.admin.deleteUser(l.user_id)
  }
  await sb?.cleanup().catch(() => undefined)
  sb = null
  if (schoolId) await db.from('schools').delete().eq('id', schoolId)
  schoolId = null
  for (const id of users.splice(0)) await db.auth.admin.deleteUser(id)
})

test.describe('a teacher in the demo school', () => {
  test('makes classes in other grades, copies learners, adds one, makes a sign-in code, and the demo still works', async ({ page, browser }) => {
    test.setTimeout(600_000)
    const t0 = Date.now()
    const lap = (what: string) => console.log(`p63 ${Math.round((Date.now() - t0) / 1000)}s ${what}`)
    sb = await openSandbox(page, { stage: 'start', role: 'teacher' })
    lap('sandbox open')
    const db = admin()
    const school = (await db.from('demo_sandboxes').select('school_id').eq('id', sb.sandboxId).single()).data!.school_id
    const kidsBefore = (await db.from('children').select('id').eq('school_id', school)).data!.length

    // 9A Mathematics, Grade 9.
    await page.goto('/t')
    await check(page.getByRole('link', { name: /6B Mathematics/ })).toBeVisible()
    await page.getByRole('link', { name: 'Create a class' }).click()
    await check(page).toHaveURL(/\/t\/new$/)
    await check(page.getByLabel('Grade', { exact: true }).locator('option')).toHaveCount(12)
    await expectMathsLine(page)
    await proof72(page, 'class-form')
    await check(page.getByText('More subjects are coming')).toHaveCount(0)
    await page.getByLabel('Class name').fill('9A Mathematics')
    await page.getByLabel('Grade', { exact: true }).selectOption('9')
    await noHorizontalScroll(page)
    await proof(page, 'new-class-form')
    await page.getByRole('button', { name: 'Create class' }).click()
    await check(page).toHaveURL(NEW_CLASS_URL)
    const nine = idOf(page.url())
    const nineRow = (await db.from('classes').select('name, grade, subject, school_id').eq('id', nine).single()).data!
    expect(nineRow).toEqual({ name: '9A Mathematics', grade: 9, subject: 'Mathematics', school_id: school })
    await check(page.getByRole('heading', { level: 1 })).toHaveText(/^9A is set up\./)

    lap('9A made')
    // 6C Mathematics: the learners of 6B copied, one new learner added. A subject in the address is ignored.
    await page.goto('/t/new?grade=6&subject=English&other=Reading%20Club')
    await check(page.getByLabel('Grade', { exact: true })).toHaveValue('6')
    await expectMathsLine(page)
    await page.getByLabel('Class name').fill('6C Mathematics')
    await page.getByLabel('Copy learners from another class').selectOption({ label: '6B Mathematics (5 learners)' })
    await check(page.getByText('All 5 learners are in the new class too. They are not made again.')).toBeVisible()
    await page.getByLabel('Add a learner').fill('Zola')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await check(page.getByText('1 added')).toBeVisible()
    await noHorizontalScroll(page)
    await proof(page, 'new-class-copy')
    await page.getByRole('button', { name: 'Create class' }).click()
    await check(page).toHaveURL(NEW_CLASS_URL)
    const copied = idOf(page.url())
    expect((await db.from('classes').select('name, subject').eq('id', copied).single()).data).toEqual({ name: '6C Mathematics', subject: 'Mathematics' })
    expect((await db.from('enrolments').select('child_id').eq('class_id', copied)).data!.length).toBe(6)
    expect((await db.from('children').select('id').eq('school_id', school)).data!.length).toBe(kidsBefore + 1)
    const zola = (await db.from('children').select('id, grade').eq('school_id', school).eq('first_name', 'Zola').single()).data!
    expect(zola.grade).toBe(6)

    lap('6C Mathematics made')
    // The teacher makes Zola's sign-in code, and Zola signs in with it.
    await page.goto(`/t/${copied}/settings`)
    await check(page.getByRole('heading', { level: 1 })).toHaveText('6C has 6 learners and 0 linked parents.')
    await check(page.getByText('Mathematics', { exact: true })).toBeVisible()
    await check(page.getByRole('button', { name: 'Edit subject' })).toHaveCount(0)
    await check(page.getByRole('button', { name: 'Edit grade' })).toBeVisible()
    await noHorizontalScroll(page)
    await proof(page, 'class-settings')
    await page.getByRole('button', { name: 'Make a sign-in code for Zola' }).click()
    await page.getByLabel('4 digit PIN').fill('4821')
    await page.getByRole('button', { name: 'Make the code' }).click()
    const code = (await page.getByLabel('Sign-in code', { exact: true }).textContent())!.trim()
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
    await check(page.getByText('PIN 4821')).toBeVisible()
    await proof(page, 'sign-in-code', false)
    const login = (await db.from('child_logins').select('child_id, pin_set_by').eq('code', code).single()).data!
    const teacherId = (await db.from('classes').select('teacher_id').eq('id', copied).single()).data!.teacher_id
    expect(login).toEqual({ child_id: zola.id, pin_set_by: teacherId })

    lap('code made')
    const learner = await browser.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL })
    try {
      const kid = await learner.newPage()
      await kid.goto('/k/sign-in')
      await kid.getByLabel('Your code').fill(code)
      for (const d of '4821') await kid.getByRole('button', { name: d, exact: true }).click()
      await kid.getByRole('button', { name: 'Sign in' }).click()
      await kid.waitForURL('**/k')
      await check(kid).toHaveURL(/\/k$/)
    } finally {
      await learner.close()
    }

    lap('learner signed in')
    // A learner who is already at the school goes into a second class: an enrolment, no second child.
    await page.goto(`/t/${nine}/settings`)
    await page.getByRole('button', { name: 'Add a learner' }).click()
    await page.getByLabel("Learner's first name").fill('Amina')
    const match = page.getByRole('button', { name: /^Add Amina, Grade 6, in / })
    await check(match).toBeVisible()
    await check(match).toContainText('6B Mathematics')
    await check(match).toContainText('6C Mathematics')
    await check(page.getByRole('button', { name: 'New learner' })).toBeVisible()
    await proof(page, 'add-learner', false)
    await match.click()
    await check(page.getByRole('dialog')).toHaveCount(0)
    const amina = (await db.from('children').select('id').eq('school_id', school).eq('first_name', 'Amina')).data!
    expect(amina).toHaveLength(1)
    expect((await db.from('enrolments').select('class_id').eq('child_id', amina[0]!.id)).data!.map((e) => e.class_id).sort()).toEqual([sb.classId, copied, nine].sort())
    expect((await db.from('children').select('id').eq('school_id', school)).data!.length).toBe(kidsBefore + 1)
    await page.getByRole('button', { name: 'Add a learner' }).click()
    await page.getByLabel("Learner's first name").fill('Amina')
    await check(page.getByRole('button', { name: 'Add', exact: true })).toBeVisible()
    await check(page.getByRole('button', { name: /^Add Amina, Grade 6/ })).toHaveCount(0)
    await page.keyboard.press('Escape')

    // 6B Mathematics opens as before, the class list shows three classes, and the demo's role switch works with three classes.
    await page.goto(`/t/${sb.classId}`)
    await check(page).toHaveURL(new RegExp(`/t/${sb.classId}$`))
    await expect.poll(async () => (await page.locator('body').textContent()) ?? '', { timeout: 30_000 }).toContain('6B Mathematics')
    await page.goto('/t')
    await check(page.getByRole('link', { name: /6B Mathematics/ })).toBeVisible()
    await check(page.getByRole('link', { name: /9A Mathematics/ })).toContainText('Grade 9')
    await check(page.getByRole('link', { name: /6C Mathematics/ })).toContainText('Grade 6')
    await noHorizontalScroll(page)
    await proof(page, 'class-list')

    await page.goto('/demo')
    await check(page.getByRole('heading', { name: 'Try the demo' })).toBeVisible()
    await page.goto('/demo/switch')
    await page.getByRole('button', { name: /Thandi M/ }).click()
    await check(page).toHaveURL(/\/p$/)
    await page.goto('/demo/switch')
    await page.getByRole('button', { name: /Ms Banda/ }).click()
    await check(page).toHaveURL(new RegExp(`/t/${sb.classId}/curriculum$`))
  })

  test('the grade of a class can be any of 1 to 12 and the subject is shown, not edited', async ({ page }) => {
    sb = await openSandbox(page, { stage: 'start', role: 'teacher' })
    await page.goto(`/t/${sb.classId}/settings`)
    await page.getByRole('button', { name: 'Edit grade' }).click()
    for (const g of [1, 12]) await check(page.getByRole('button', { name: `Grade ${g}`, exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Grade 12', exact: true }).click()
    await page.getByRole('button', { name: 'Save' }).click()
    await check(page.getByRole('dialog')).toHaveCount(0)
    await check(page.getByText('Grade 12', { exact: true })).toBeVisible()
    await expect.poll(async () => (await admin().from('classes').select('grade').eq('id', sb!.classId).single()).data!.grade, { timeout: 30_000 }).toBe(12)
    await check(page.getByText('Subject', { exact: true })).toBeVisible()
    await check(page.getByRole('button', { name: 'Edit subject' })).toHaveCount(0)
  })
})

test.describe('two learners with the same first name', () => {
  test('the teacher gives one a surname, and the parent is asked for it', async ({ page }) => {
    test.setTimeout(240_000)
    sb = await openSandbox(page, { stage: 'start', role: 'parent' })
    const db = admin()
    const school = (await db.from('demo_sandboxes').select('school_id').eq('id', sb.sandboxId).single()).data!.school_id
    // Amina (Dlamini) is in 6B already. A second Amina joins with another surname.
    await db.from('children').update({ last_name: 'Dlamini' }).eq('id', sb.childId)
    const second = (await db.from('children').insert({ school_id: school, first_name: 'Amina', last_name: 'Nkosi', grade: 6 }).select('id').single()).data!
    await db.from('enrolments').insert({ class_id: sb.classId, child_id: second.id })

    // First name alone does not say which child: the form asks for the surname.
    await page.goto(`/p/add/consent?code=${sb.joinCode}&child=Amina`)
    await check(page).toHaveURL(/\/p\/add\?.*needsSurname=1/)
    const alert = page.locator('p[role="alert"]')
    await check(alert).toContainText('More than one child in')
    await check(alert).toContainText('Type the surname.')
    await check(page.getByLabel("Your child's surname")).toBeVisible()
    await noHorizontalScroll(page)
    await proof(page, 'parent-surname')
    await page.getByLabel("Your child's surname").fill('nkosi')
    await page.getByRole('button', { name: 'Link Amina' }).click()
    await check(page.getByRole('heading', { level: 1 })).toContainText("Jemma keeps Amina's schoolwork")
    await page.getByRole('button', { name: /^Agree and ask/ }).click()
    await check(page).toHaveURL(/\/p\/add\/pending$/)
    const parent = (await db.from('parent_links').select('child_id, status').eq('child_id', second.id)).data!
    expect(parent).toEqual([{ child_id: second.id, status: 'pending' }])
    const need = (await db.from('needs_you_items').select('title, child_id').eq('child_id', second.id).eq('kind', 'approve_link')).data!
    expect(need).toHaveLength(1)
    expect(need[0]!.title).toBe("Thandi M wants to see Amina Nkosi's work")
  })
})

test.describe('a new teacher with a school that is not in the list', () => {
  test('signs up with a name, makes a school and a first class', async ({ page }) => {
    test.setTimeout(180_000)
    const db = admin()
    const email = `p63-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`
    const password = 'p63-Passw0rd!'
    const created = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: 'Ms Nkosi' } })
    if (created.error) throw created.error
    users.push(created.data.user.id)
    await signInWithPassword(page, email, password)

    await page.goto('/role')
    await page.getByRole('button', { name: /^Teacher/ }).click()
    await check(page).toHaveURL(/\/t$/)
    // No school yet, so the class list sends the teacher to the school step.
    await page.goto('/t/onboarding')
    await check(page.getByRole('heading', { level: 1 })).toHaveText('Welcome, Ms Nkosi. Where and what do you teach?')
    expect((await db.from('profiles').select('display_name').eq('user_id', created.data.user.id).single()).data!.display_name).toBe('Ms Nkosi')

    await expectMathsLine(page)
    await proof72(page, 'onboarding-form')
    await page.getByLabel('Grade of your first class').selectOption('3')
    await page.getByRole('button', { name: "My school isn't listed" }).click()
    const dialog = page.getByRole('dialog')
    await check(dialog).toContainText('Add your school')

    await dialog.getByRole('button', { name: 'Create school' }).click()
    await check(dialog.getByRole('alert')).toHaveText('Type the name of the school (2 to 80 letters)')
    const name = `P63 Kibera Primary ${Date.now()}`
    await dialog.getByLabel('School name').fill(name)
    await dialog.getByLabel('Country').selectOption('KE')
    await dialog.getByLabel('Region (optional)').fill('Nairobi')
    await proofOpen(page)
    await dialog.getByRole('button', { name: 'Create school' }).click()

    await check(page).toHaveURL(/\/t\/new\?grade=3$/)
    const profile = (await db.from('profiles').select('school_id').eq('user_id', created.data.user.id).single()).data!
    schoolId = profile.school_id
    expect(schoolId).not.toBeNull()
    const school = (await db.from('schools').select('name, country, region, sandbox_id').eq('id', schoolId!).single()).data!
    expect(school).toEqual({ name, country: 'KE', region: 'Nairobi', sandbox_id: null })

    await check(page.getByLabel('Grade', { exact: true })).toHaveValue('3')
    await expectMathsLine(page)
    await check(page.getByLabel('Copy learners from another class')).toHaveCount(0)
    await page.getByLabel('Class name').fill('3C Mathematics')
    await page.getByRole('button', { name: 'Create class' }).click()
    await check(page).toHaveURL(NEW_CLASS_URL)
    const row = (await db.from('classes').select('name, grade, subject, school_id').eq('id', idOf(page.url())).single()).data!
    expect(row).toEqual({ name: '3C Mathematics', grade: 3, subject: 'Mathematics', school_id: schoolId })
    await check(page.getByRole('heading', { level: 1 })).toHaveText(/^3C is set up\./)

    // A second teacher who types the same school gets the school that exists, not a copy.
    const second = await db.auth.admin.createUser({ email: `p63b-${Date.now()}@example.test`, password, email_confirm: true, user_metadata: { full_name: 'Mr Otieno' } })
    if (second.error) throw second.error
    users.push(second.data.user.id)
    await page.context().clearCookies()
    await signInWithPassword(page, second.data.user.email!, password)
    await page.goto('/role')
    await page.getByRole('button', { name: /^Teacher/ }).click()
    await check(page).toHaveURL(/\/t$/)
    await page.goto('/t/onboarding')
    await page.getByRole('button', { name: "My school isn't listed" }).click()
    const again = page.getByRole('dialog')
    await again.getByLabel('School name').fill(name.toUpperCase())
    await again.getByLabel('Country').selectOption('KE')
    await again.getByRole('button', { name: 'Create school' }).click()
    await check(again.getByRole('alert')).toContainText('is already on Jemma')
    await check(again.getByRole('button', { name: 'Yes, use this school' })).toBeVisible()
    expect((await db.from('schools').select('id').eq('name', name)).data).toHaveLength(1)
    await again.getByRole('button', { name: 'Yes, use this school' }).click()
    await check(page).toHaveURL(/\/t\/new/)
    expect((await db.from('profiles').select('school_id').eq('user_id', second.data.user.id).single()).data!.school_id).toBe(schoolId)
  })
})

/** The school form, open and filled in. */
async function proofOpen(page: Page) {
  await proof(page, 'school-form', false)
}
