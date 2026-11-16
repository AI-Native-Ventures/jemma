import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServiceClient } from '@jemma/profiling/db'
import { expect, test, type Page } from '@playwright/test'

// A learner signs up alone (P111), on a phone: no teacher, no parent, no code, no age. A new person opens /sign-up, makes an account with a name, an email and a
// password, picks Learner on the role screen, picks Grade 5 on "Which grade are you in?" and lands on /k, the learner's home, in their own Jemma:
//  1. My maths shows the Grade 5 chip and "+ Another grade", and there is no "My school | My own" switch anywhere (the learner's own record is their My own);
//  2. the database holds ONE child for the login (user_id = the login, in a personal school, no twin), the CAPS class "Grade 5 (my own)" with its approved
//     map and the learner profile, and going back to the role screen sends the learner home without making a second child;
//  3. "I'm done for today" signs out to the email and password sign-in, and the same email and password land on /k again.
// No model is called: nothing here asks Jemma to write a practice.
//
// RUNS IN CI on every push (job "Feature specs in a browser", .github/workflows/ci.yml, the step with the real agent, phone), on CI's own local database
// (the local project confirms a new email sign-up by itself, so a session comes back at once). Never run it against the hosted preview database: it makes
// a real account. The password is made up and belongs to nothing else. Screenshots are written only when P111_PROOF is set, to design/proof/p111, named by
// width (390 or 1440).

const check = expect.configure({ timeout: 45_000 })
const admin = () => createServiceClient({ SUPABASE_URL: process.env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY! })

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const email = `p111-learner-${stamp}@example.test`
const NAME = 'Naledi Nkosi'
const PASSWORD = 'not-a-real-password-1'
const PASSWORD_LABEL = 'Make a password, at least 8 characters'

const proofDir = resolve(import.meta.dirname, '../../../design/proof/p111')
async function proof(page: Page, shot: string) {
  if (!process.env.P111_PROOF) return
  mkdirSync(proofDir, { recursive: true })
  const width = page.viewportSize()!.width >= 1024 ? 1440 : page.viewportSize()!.width
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: 'nextjs-portal{display:none} *{transition:none !important;animation:none !important}' })
  await page.screenshot({ path: resolve(proofDir, `${shot}-${width}.png`), fullPage: true })
}

/** The page does not scroll sideways at this width. */
async function noSidewaysScroll(page: Page) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(wide, 'the page scrolls sideways').toBeLessThanOrEqual(0)
}

/** Ticks the agreement box the way a person does: a tap on its words. (The drawn box covers the real one, so a click on the real one is blocked.) */
async function tickAgreement(page: Page) {
  await page.getByText("I agree to Jemma's terms and privacy policy").click()
  await expect(page.getByLabel("I agree to Jemma's terms and privacy policy")).toBeChecked()
}

const screenText = (page: Page) => page.locator('main').first().innerText()

/** The login the sign-up made, by its email, or null. */
async function findLogin(): Promise<string | null> {
  for (let pageNo = 1; pageNo <= 10; pageNo++) {
    const { data, error } = await admin().auth.admin.listUsers({ page: pageNo, perPage: 200 })
    if (error || !data.users.length) return null
    const found = data.users.find((u) => u.email === email)
    if (found) return found.id
  }
  return null
}

/** Takes the made account away, whatever the test reached: the personal school first (the child, the class and the map go with it), then the login. */
async function removeAccount() {
  const userId = await findLogin()
  if (!userId) return
  const kids = (await admin().from('children').select('school_id').eq('user_id', userId)).data ?? []
  for (const kid of kids) await admin().from('schools').delete().eq('id', kid.school_id)
  await admin().auth.admin.deleteUser(userId)
}

test.use({ screenshot: 'only-on-failure', actionTimeout: 45_000 })
test.setTimeout(240_000)
test.afterAll(removeAccount)

test('a learner signs up alone, picks Grade 5, lands on their own home, signs out, and signs in again', async ({ page }) => {
  // 1. Sign up, then pick Learner.
  await page.goto('/sign-up')
  await expect(page.getByText('For teachers, parents and learners.')).toBeVisible()
  await page.getByLabel('Your name').fill(NAME)
  await page.getByLabel('Email').fill(email)
  const password = page.getByLabel(PASSWORD_LABEL)
  await password.fill(PASSWORD)
  // A tap made before the page has woken up is lost, so the tap is tried again until the button answers.
  await expect(async () => {
    await page.getByRole('button', { name: 'Show' }).click({ timeout: 3_000 })
    await expect(password).toHaveAttribute('type', 'text', { timeout: 3_000 })
  }).toPass({ timeout: 45_000 })
  await check(password).toHaveValue(PASSWORD)
  await tickAgreement(page)
  await page.getByRole('button', { name: 'Make my account' }).click()
  await check(page).toHaveURL(/\/role$/)
  await check(page.getByRole('heading', { name: 'How will you use Jemma?' })).toBeVisible()
  const learner = page.getByRole('button', { name: /^Learner/ })
  await expect(learner).toContainText('I practise maths at any grade, 1 to 12.')
  await expect(page.getByText(/Grade 8 to 12|coming soon/i)).toHaveCount(0)
  await noSidewaysScroll(page)
  await proof(page, 'role')
  await learner.click()

  // 2. One short screen: the grade and the country, one button.
  await check(page).toHaveURL(/\/role\/learner/)
  await check(page.getByRole('heading', { name: 'Which grade are you in?' })).toBeVisible()
  await expect(page.getByLabel('Country')).toHaveValue('ZA')
  await expect(page.getByLabel('Grade').locator('option')).toHaveCount(13)
  await noSidewaysScroll(page)
  await proof(page, 'grade')
  // No grade: a plain refusal, and nothing is made. A tap made before the page has woken up is lost, so it is tried again until the line shows.
  await expect(async () => {
    await page.getByRole('button', { name: 'Start practising' }).click({ timeout: 3_000 })
    await expect(page.getByRole('alert').filter({ hasText: 'Pick your grade' })).toHaveText('Pick your grade, from 1 to 12.', { timeout: 3_000 })
  }).toPass({ timeout: 45_000 })
  await expect(page).toHaveURL(/\/role\/learner/)
  await page.getByLabel('Grade').selectOption('5')
  await page.getByRole('button', { name: 'Start practising' }).click()

  // 3. Their own home: no switch, nothing about a teacher or a school.
  await page.waitForURL(/\/k$/, { timeout: 90_000 })
  await check(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByText('Your own practice.', { exact: true })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Where you practise' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'My school', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'My own', exact: true })).toHaveCount(0)
  expect(await screenText(page)).not.toMatch(/school|teacher/i)
  await noSidewaysScroll(page)
  await proof(page, 'home')

  // My maths: the Grade 5 chip (their own grade, chosen) and "+ Another grade", no other grade.
  await page.getByRole('link', { name: 'My maths' }).first().click()
  await expect(page).toHaveURL(/\/k$/, { timeout: 45_000 })
  await check(page.getByRole('heading', { level: 1, name: 'My maths' })).toBeVisible()
  const grades = page.getByRole('navigation', { name: 'Grades' })
  await expect(grades.getByRole('link', { name: 'Grade 5' })).toHaveAttribute('aria-current', 'page')
  await expect(grades.getByRole('link', { name: '+ Another grade' })).toBeVisible()
  await expect(grades.getByRole('link')).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'My school', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'My own', exact: true })).toHaveCount(0)
  expect(await screenText(page)).not.toMatch(/your school|your teacher|marks a test|my school/i)
  await noSidewaysScroll(page)
  await proof(page, 'my-maths')

  // 4. What the database holds: one child for the login, in a personal school, with the CAPS class of Grade 5 and its approved map.
  const userId = await findLogin()
  expect(userId, 'the login the sign-up made').toBeTruthy()
  const db = admin()
  const kids = (await db.from('children').select('id, school_id, first_name, grade, user_id, private_of').eq('user_id', userId!)).data ?? []
  expect(kids).toHaveLength(1)
  expect(kids[0]).toMatchObject({ first_name: 'Naledi', grade: 5, user_id: userId, private_of: null })
  const school = (await db.from('schools').select('name, kind, country').eq('id', kids[0]!.school_id).single()).data
  expect(school).toEqual({ name: "Naledi's own", kind: 'private', country: 'ZA' })
  expect((await db.from('children').select('id').eq('private_of', kids[0]!.id)).data).toEqual([])
  const classes = (await db.from('classes').select('id, name, grade, teacher_id').eq('school_id', kids[0]!.school_id)).data ?? []
  expect(classes).toHaveLength(1)
  expect(classes[0]).toMatchObject({ name: 'Grade 5 (my own)', grade: 5, teacher_id: userId })
  expect((await db.from('curriculum_maps').select('id').eq('class_id', classes[0]!.id).eq('status', 'approved')).data).toHaveLength(1)
  expect((await db.from('profiles').select('role, school_id').eq('user_id', userId!).single()).data).toEqual({ role: 'learner', school_id: kids[0]!.school_id })

  // Going back to the role screen, or the grade screen, sends the learner home and makes no second child.
  await page.goto('/role')
  await expect(page).toHaveURL(/\/k$/, { timeout: 45_000 })
  await page.goto('/role/learner')
  await expect(page).toHaveURL(/\/k$/, { timeout: 45_000 })
  expect((await db.from('children').select('id').eq('user_id', userId!)).data).toHaveLength(1)

  // 5. Sign out from Me, then sign in with the email and the password: the learner lands on /k again.
  await page.goto('/k/me')
  await check(page.getByRole('heading', { level: 1 })).toContainText('Naledi')
  await expect(page.getByText(/PIN/)).toHaveCount(0)
  await proof(page, 'me')
  await page.getByRole('button', { name: "I'm done for today" }).click()
  await check(page).toHaveURL(/\/sign-in$/)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await check(page).toHaveURL(/\/k$/)
  await expect(page.getByText('Your own practice.', { exact: true })).toBeVisible()
  expect((await db.from('children').select('id').eq('user_id', userId!)).data).toHaveLength(1)
})
