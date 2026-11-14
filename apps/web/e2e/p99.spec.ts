import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServiceClient } from '@jemma/profiling/db'
import { expect, test as base, type Page } from '@playwright/test'
import { createSandbox, deleteSandbox } from '../../../supabase/seed/demo'
import { signInWithPassword } from './helpers/session'

// A family whose school does not use Jemma (P99), on a phone. (a) A new parent account adds a child alone in Grade 5 on "Add a child": it lands on the
// child's page ("Practising on their own", no school, no tab bar), "Practise at home" opens the child's own home with no switch and Grade 5 in My maths,
// and "Make a sign-in code" makes a code the child signs in with on their own phone. (b) Zanele M on /demo: Kagiso's page, Practise at home, My maths with
// the chips Grade 8 and Grade 9, and Add your own work with his marked test. No model is called: nothing here asks Jemma to write a practice.
//
// RUNS IN CI on every push (job "Feature specs in a browser", .github/workflows/ci.yml, the step with the real agent, phone), on CI's own local database.
// Never run it against the hosted preview database. Screenshots are written only when P99_PROOF is set, to design/proof/p99, named by width (360, 390 or
// 1440), by a person who runs it by hand against a build.

const check = expect.configure({ timeout: 45_000 })
const admin = () => createServiceClient({ SUPABASE_URL: process.env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY! })

const proofDir = resolve(import.meta.dirname, '../../../design/proof/p99')
async function proof(page: Page, name: string) {
  if (!process.env.P99_PROOF) return
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

const screenText = (page: Page) => page.locator('main').first().innerText()

type Cleanup = () => Promise<void>
const cleanups: Cleanup[] = []
base.afterEach(async () => {
  for (const c of cleanups.splice(0)) await c().catch(() => undefined)
})

const test = base
test.use({ screenshot: 'only-on-failure', actionTimeout: 45_000 })
test.setTimeout(300_000)

const typePin = async (page: Page, pin: string) => {
  for (const d of pin) await page.getByRole('button', { name: d, exact: true }).click()
}

test.describe('a family whose school does not use Jemma', () => {
  test('a new parent adds a child alone in Grade 5, practises at home with them, and makes them a sign-in code they use', async ({ page }) => {
    const db = admin()
    const email = `p99-parent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`
    const password = `pw-${Math.random().toString(36).slice(2)}-Aa1`
    const created = await db.auth.admin.createUser({ email, password, email_confirm: true })
    if (created.error) throw created.error
    const parentId = created.data.user.id
    const inserted = await db.from('profiles').insert({ user_id: parentId, role: 'parent', display_name: 'Palesa Test' })
    if (inserted.error) throw inserted.error
    const users = [parentId]
    let schoolId: string | null = null
    cleanups.push(async () => {
      if (schoolId) await db.from('schools').delete().eq('id', schoolId)
      for (const id of users) await db.auth.admin.deleteUser(id)
    })

    // The start screen of a parent with no child, then the add-a-child page: the class code form first, the second way under it.
    await signInWithPassword(page, email, password)
    await page.goto('/p/add')
    await check(page.getByRole('heading', { level: 1 })).toHaveText("Link your child with the teacher's class code")
    await expect(page.getByLabel('Class code')).toBeVisible()
    const alone = page.getByRole('button', { name: "My child's school doesn't use Jemma" })
    await expect(alone).toHaveAttribute('aria-expanded', 'false')
    await alone.click()
    await expect(alone).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByLabel('Country')).toHaveValue('ZA')
    expect(await page.getByLabel('Country').locator('option').first().textContent()).toBe('South Africa')
    await expect(page.getByLabel('Grade').locator('option')).toHaveCount(13)
    await atEveryWidth(page, 'add-child-alone')

    // Nothing typed: the two things a parent forgets are said in words, and nothing is made.
    await page.getByRole('button', { name: 'Add your child' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'first name' })).toHaveText('Type your child’s first name.')
    await page.getByLabel("Your child's first name").fill('Neo')
    await page.getByRole('button', { name: 'Add Neo' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Pick a grade' })).toHaveText('Pick a grade from 1 to 12.')
    expect((await db.from('parent_links').select('id').eq('parent_id', parentId)).data).toEqual([])

    // Grade 5: the parent lands on the child's page.
    await page.getByLabel('Grade').selectOption('5')
    await page.getByRole('button', { name: 'Add Neo' }).click()
    await page.waitForURL(/\/p\/[0-9a-f-]{36}$/, { timeout: 90_000 })
    const childId = page.url().split('/').pop()!
    await check(page.getByRole('heading', { level: 1 })).toHaveText('Neo')
    await expect(page.getByText('Practising on their own')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Practise at home with Neo' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Make a sign-in code for Neo' })).toBeVisible()
    await expect(page.getByText('Grade 5 · On their own').first()).toBeAttached()
    // No tab bar, no school and no teacher on the page.
    await expect(page.getByRole('navigation')).toHaveCount(0)
    expect(await page.locator('body').innerText()).not.toMatch(/school|teacher|\bclass\b|marked|needs you|attendance/i)
    await atEveryWidth(page, 'child-page')

    // The data: one child in a personal school, no twin, no login yet, an approved link, the Grade 5 class with its approved map.
    const child = (await db.from('children').select('id, school_id, grade, user_id, private_of, first_name').eq('id', childId).single()).data!
    schoolId = child.school_id
    expect(child).toMatchObject({ first_name: 'Neo', grade: 5, user_id: null, private_of: null })
    const school = (await db.from('schools').select('name, kind, country, sandbox_id').eq('id', child.school_id).single()).data!
    expect(school).toEqual({ name: "Neo's own", kind: 'private', country: 'ZA', sandbox_id: null })
    expect((await db.from('children').select('id').eq('private_of', childId)).data).toEqual([])
    const links = (await db.from('parent_links').select('parent_id, status, class_id').eq('child_id', childId)).data!
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({ parent_id: parentId, status: 'approved' })
    const classes = (await db.from('classes').select('id, name, grade').eq('school_id', child.school_id)).data!
    expect(classes.map((c) => [c.name, c.grade])).toEqual([['Grade 5 (my own)', 5]])
    expect(links[0]!.class_id).toBe(classes[0]!.id)
    expect((await db.from('curriculum_maps').select('status').eq('class_id', classes[0]!.id)).data).toEqual([{ status: 'approved' }])

    // Practise at home: the child's own home on the parent's phone, with no switch and the one short line, and Grade 5 in My maths.
    await page.getByRole('button', { name: 'Practise at home with Neo' }).click()
    await page.waitForURL(/\/k$/, { timeout: 90_000 })
    await check(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText('Your own practice.', { exact: true })).toBeVisible()
    await expect(page.getByRole('group', { name: 'Where you practise' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'My school' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /Add your own work/ })).toHaveAttribute('href', '/k/own')
    expect(await screenText(page)).not.toMatch(/school|teacher/i)
    await atEveryWidth(page, 'home')
    await page.getByRole('link', { name: 'My maths' }).first().click()
    await expect(page).toHaveURL(/\/k\/maths$/, { timeout: 45_000 })
    await check(page.getByRole('heading', { level: 1, name: 'My maths' })).toBeVisible()
    const grades = page.getByRole('navigation', { name: 'Grades' })
    await expect(grades.getByRole('link', { name: 'Grade 5' })).toHaveAttribute('aria-current', 'page')
    await expect(grades.getByRole('link', { name: '+ Another grade' })).toBeVisible()
    await expect(grades.getByRole('link')).toHaveCount(2)
    await expect(page.getByRole('group', { name: 'Where you practise' })).toHaveCount(0)
    await expect(page.getByText('Your own practice.', { exact: true })).toBeVisible()
    expect(await screenText(page)).not.toMatch(/your school|your teacher|marks a test|my school/i)
    await atEveryWidth(page, 'my-maths')

    // Add your own work works for this child too, and says nothing of a school.
    await page.getByRole('link', { name: /Add your own work/ }).first().click()
    await expect(page).toHaveURL(/\/k\/own$/, { timeout: 45_000 })
    await check(page.getByRole('heading', { level: 1, name: 'Add your own work' })).toBeVisible()
    await expect(page.getByRole('link', { name: /A marked test/ })).toHaveAttribute('href', '/k/own/test')
    await expect(page.getByRole('link', { name: /Your own curriculum/ })).toContainText("A plan or a book's contents.")
    await expect(page.getByRole('group', { name: 'Where you practise' })).toHaveCount(0)
    expect(await screenText(page)).not.toMatch(/school|teacher/i)

    // The parent takes the phone back and makes the sign-in code: 4 digits, then the code on the card.
    await page.getByRole('link', { name: 'Grown-up? Take the phone back.' }).click()
    await page.waitForURL(new RegExp(`/p/${childId}$`), { timeout: 45_000 })
    await page.getByRole('button', { name: 'Make a sign-in code for Neo' }).click()
    await page.getByLabel('Choose a 4-digit PIN').fill('4321')
    await page.getByRole('button', { name: 'Make the code' }).click()
    const codeLabel = await page.getByLabel(/Neo's code is /).getAttribute('aria-label', { timeout: 90_000 })
    const code = codeLabel!.replace("Neo's code is ", '')
    expect(code).toMatch(/^[A-Z2-9]{6}$/)
    await expect(page.getByRole('button', { name: 'Make a new code' })).toBeVisible()
    const login = (await db.from('child_logins').select('code, user_id, pin_set_by').eq('child_id', childId).single()).data!
    expect(login).toMatchObject({ code, pin_set_by: parentId })
    users.push(login.user_id)
    expect((await db.from('children').select('user_id').eq('id', childId).single()).data!.user_id).toBe(login.user_id)

    // The child signs in on their own phone with the code and the PIN: their own home, no switch.
    await page.context().clearCookies()
    await page.goto('/k/sign-in')
    await expect(page.getByText('0 of 4 digits typed')).toBeAttached()
    await page.getByLabel('Your code').fill(code)
    await typePin(page, '4321')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/k', { timeout: 90_000 })
    await check(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText('Your own practice.', { exact: true })).toBeVisible()
    await expect(page.getByRole('group', { name: 'Where you practise' })).toHaveCount(0)
    expect(await screenText(page)).not.toMatch(/school|teacher/i)
    await noSidewaysScroll(page)
  })

  test('Zanele M on the demo page: Kagiso on his own in Grade 8, Practise at home, Grade 8 and Grade 9, and his marked test', async ({ page }) => {
    const db = admin()
    const sandbox = await createSandbox(db, { stage: 'start' })
    cleanups.push(() => deleteSandbox(db, sandbox.sandboxId))
    const baseURL = new URL(process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000')
    await page.context().addCookies([{ name: 'jemma_demo', value: sandbox.sandboxId, domain: baseURL.hostname, path: '/', httpOnly: true, secure: false, sameSite: 'Lax' }])

    // The data of the copy: Kagiso is one child of a personal school tied to the sandbox, linked to Zanele by an approved link, and in no Hillview class.
    const kids = (await db.from('children').select('id, school_id, grade, private_of, user_id').eq('first_name', 'Kagiso')).data!
    const own = (await db.from('schools').select('id').eq('sandbox_id', sandbox.sandboxId).eq('kind', 'private')).data!.map((s) => s.id)
    const kagiso = kids.find((k) => own.includes(k.school_id))!
    expect(kagiso).toMatchObject({ grade: 8, private_of: null, user_id: null })
    expect((await db.from('enrolments').select('class_id').eq('child_id', kagiso.id)).data).toHaveLength(2)
    expect((await db.from('parent_links').select('status').eq('child_id', kagiso.id)).data).toEqual([{ status: 'approved' }])
    expect((await db.from('children').select('id').eq('school_id', sandbox.schoolId).eq('first_name', 'Kagiso')).data).toEqual([])

    // The demo page lists the button with the other parents.
    await page.goto('/demo')
    await check(page.getByRole('heading', { name: 'More people at Hillview' })).toBeVisible()
    const zanele = page.getByRole('button', { name: /Zanele M/ })
    await expect(zanele).toContainText('Parent · Kagiso (on his own, Grade 8)')
    await noSidewaysScroll(page)
    await proof(page, 'demo-zanele')
    await zanele.click()

    // Kagiso's page: his name, "Practising on their own", his grades with his counts, the two buttons, no school.
    await page.waitForURL(new RegExp(`/p/${kagiso.id}$`), { timeout: 90_000 })
    await check(page.getByRole('heading', { level: 1 })).toHaveText('Kagiso')
    await expect(page.getByText('Practising on their own')).toBeVisible()
    const practised = page.getByRole('region', { name: 'What Kagiso has practised' })
    await expect(practised.getByText('Grade 8')).toBeVisible()
    await expect(practised.getByText('Grade 9')).toBeVisible()
    expect(await practised.innerText()).toMatch(/\d+ of \d+ right/)
    await expect(page.getByRole('button', { name: 'Practise at home with Kagiso' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Make a sign-in code for Kagiso' })).toBeVisible()
    await expect(page.getByRole('navigation')).toHaveCount(0)
    expect(await page.locator('body').innerText()).not.toMatch(/Hillview|school|teacher|\bclass\b|needs you|attendance/i)
    await atEveryWidth(page, 'kagiso-page')

    // Practise at home: his own home, no switch; My maths has the chips Grade 8 (his own, chosen) and Grade 9; the marked test is under Add your own work.
    await page.getByRole('button', { name: 'Practise at home with Kagiso' }).click()
    await page.waitForURL(/\/k$/, { timeout: 90_000 })
    await check(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText('Your own practice.', { exact: true })).toBeVisible()
    await expect(page.getByRole('group', { name: 'Where you practise' })).toHaveCount(0)
    await page.getByRole('link', { name: 'My maths' }).first().click()
    await expect(page).toHaveURL(/\/k\/maths$/, { timeout: 45_000 })
    const grades = page.getByRole('navigation', { name: 'Grades' })
    await expect(grades.getByRole('link', { name: 'Grade 8' })).toHaveAttribute('aria-current', 'page')
    await expect(grades.getByRole('link', { name: 'Grade 9' })).toBeVisible()
    await expect(grades.getByRole('link', { name: '+ Another grade' })).toBeVisible()
    await expect(grades.getByRole('link')).toHaveCount(3)
    expect(await screenText(page)).toMatch(/\d+ of \d+ right/)
    expect(await screenText(page)).not.toMatch(/your school|your teacher|marks a test|my school/i)
    await grades.getByRole('link', { name: 'Grade 9' }).click()
    await check(page.getByText('This is Grade 9 work. Take your time.')).toBeVisible()
    await atEveryWidth(page, 'my-maths-grade-9')

    await page.getByRole('link', { name: /Add your own work/ }).first().click()
    await expect(page).toHaveURL(/\/k\/own$/, { timeout: 45_000 })
    await check(page.getByRole('heading', { level: 1, name: 'Add your own work' })).toBeVisible()
    await expect(page.getByText('Marked test: 6 of 8 right')).toBeVisible()
    expect(await screenText(page)).not.toMatch(/school|teacher/i)
    await atEveryWidth(page, 'add-your-own-work')

    // The data is still his alone: no twin was made, and the school child's record, the class lists and Amina's workspace are as they were.
    expect((await db.from('children').select('id').eq('private_of', kagiso.id)).data).toEqual([])
    expect((await db.from('schools').select('id').eq('sandbox_id', sandbox.sandboxId).eq('kind', 'private')).data).toHaveLength(2)
  })
})
