import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServiceClient } from '@jemma/profiling/db'
import { expect, test, type Page } from '@playwright/test'

// Sign up and sign in with an email and a password (P100), on a phone. No email is sent: the local database confirms a new email sign-up by
// itself (supabase/config.toml: [auth.email] enable_signup = true, enable_confirmations = false), so a session comes back at once.
//  1. A new teacher opens /sign-up, makes an account with a name, an email and a password, picks Teacher, and reaches the school step of the
//     onboarding with their own name on it;
//  2. signs out, signs in with a wrong password and sees "That email and password do not match.", then with the right one and is home again;
//  3. a short password and an email that already has an account are refused in plain words; "Email me a code instead" opens the code flow.
//
// RUNS IN CI on every push (job "Feature specs in a browser", .github/workflows/ci.yml), on CI's own local database. No agent, no model.
// Never run it against the hosted preview database: it makes a real account. The password is made up and belongs to nothing else.
// Screenshots are written only when P100_PROOF is set, to design/proof/p100, named by width (390 or 1440).

const check = expect.configure({ timeout: 45_000 })
const admin = () => createServiceClient({ SUPABASE_URL: process.env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY! })

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const email = `p100-teacher-${stamp}@example.test`
const name = `Ms Nkosi ${stamp.slice(-4)}`
const PASSWORD = 'not-a-real-password-1'
const PASSWORD_LABEL = 'Make a password, at least 8 characters'

const proofDir = resolve(import.meta.dirname, '../../../design/proof/p100')
async function proof(page: Page, shot: string) {
  if (!process.env.P100_PROOF) return
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

/** The form's own line. Filtered by its words, because the framework's route announcer is an alert too. */
const alertWith = (page: Page, words: string) => page.getByRole('alert').filter({ hasText: words })

/** Takes the made account away, whatever the test reached. */
async function removeAccount() {
  for (let pageNo = 1; pageNo <= 10; pageNo++) {
    const { data, error } = await admin().auth.admin.listUsers({ page: pageNo, perPage: 200 })
    if (error || !data.users.length) return
    const found = data.users.find((u) => u.email === email)
    if (found) return void (await admin().auth.admin.deleteUser(found.id))
  }
}

test.use({ screenshot: 'only-on-failure', actionTimeout: 45_000 })
test.setTimeout(180_000)
test.afterAll(removeAccount)

test('a teacher signs up with an email and a password, signs out, and signs in again', async ({ page }) => {
  // 1. Sign up.
  await page.goto('/sign-up')
  await check(page.getByLabel(PASSWORD_LABEL)).toHaveAttribute('autocomplete', 'new-password')
  await check(page.getByRole('button', { name: 'Make my account' })).toBeVisible()
  await expect(page.getByText(/6 digit code|No password to remember/)).toHaveCount(0)
  await noSidewaysScroll(page)
  await proof(page, 'sign-up')

  await page.getByLabel('Your name').fill(name)
  await page.getByLabel('Email').fill(email)
  const password = page.getByLabel(PASSWORD_LABEL)
  await password.fill(PASSWORD)
  // A tap made before the page has woken up is lost, so the tap is tried again until the button answers.
  await expect(async () => {
    await page.getByRole('button', { name: 'Show' }).click({ timeout: 3_000 })
    await expect(password).toHaveAttribute('type', 'text', { timeout: 3_000 })
  }).toPass({ timeout: 45_000 })
  await check(password).toHaveValue(PASSWORD)
  await page.getByRole('button', { name: 'Hide' }).click()
  await check(password).toHaveAttribute('type', 'password')
  await tickAgreement(page)
  await page.getByRole('button', { name: 'Make my account' }).click()

  // A good sign-up goes where a good code goes: the role picker.
  await check(page).toHaveURL(/\/role$/)
  await check(page.getByRole('heading', { name: 'How will you use Jemma?' })).toBeVisible()
  await page.getByRole('button', { name: /^Teacher/ }).click()
  await check(page).toHaveURL(/\/t$/)

  // The school step of the onboarding greets the teacher by the name typed at sign-up.
  await page.getByRole('link', { name: 'Create a class' }).click()
  await check(page).toHaveURL(/\/t\/onboarding$/)
  await check(page.getByRole('heading', { level: 1 })).toHaveText(`Welcome, ${name}. Where and what do you teach?`)
  await noSidewaysScroll(page)

  // 2. Sign out, then sign in again.
  await page.goto('/t/account')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await check(page).toHaveURL(/\/sign-in$/)
  await check(page.getByLabel('Password')).toHaveAttribute('autocomplete', 'current-password')
  await expect(page.getByText("Forgot your password? Ask the person who set up your school's Jemma.")).toBeVisible()
  await noSidewaysScroll(page)
  await proof(page, 'sign-in')

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('a-different-fake-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await check(alertWith(page, 'That email and password')).toHaveText('That email and password do not match.')
  await expect(page).toHaveURL(/\/sign-in$/)
  await proof(page, 'sign-in-wrong')

  // The email is still in the box, the password is not.
  await check(page.getByLabel('Email')).toHaveValue(email)
  await check(page.getByLabel('Password')).toHaveValue('')
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await check(page).toHaveURL(/\/t$/)
  await check(page.getByRole('link', { name: 'Create a class' })).toBeVisible()
})

test('a short password and an email that already has an account are refused in plain words', async ({ page }) => {
  await page.goto('/sign-up')
  await page.getByLabel('Your name').fill('Mr Dube')
  await page.getByLabel('Email').fill(`p100-short-${stamp}@example.test`)
  await page.getByLabel(PASSWORD_LABEL).fill('short')
  await tickAgreement(page)
  await page.getByRole('button', { name: 'Make my account' }).click()
  await check(alertWith(page, 'Use at least 8')).toHaveText('Use at least 8 characters.')
  // What was typed comes back, except the password.
  await check(page.getByLabel('Your name')).toHaveValue('Mr Dube')
  await check(page.getByLabel(PASSWORD_LABEL)).toHaveValue('')
  await proof(page, 'sign-up-short')

  // The email of the first test already has an account (when that test has run; this one makes it itself if it has not).
  const made = await admin().auth.admin.createUser({ email: `p100-taken-${stamp}@example.test`, password: PASSWORD, email_confirm: true })
  if (made.error) throw made.error
  try {
    await page.getByLabel('Email').fill(`p100-taken-${stamp}@example.test`)
    await page.getByLabel(PASSWORD_LABEL).fill(PASSWORD)
    await page.getByRole('button', { name: 'Make my account' }).click()
    await check(alertWith(page, 'already has an account')).toHaveText('That email already has an account. Sign in instead.')
    await page.getByRole('link', { name: 'Sign in instead.' }).click()
    await check(page).toHaveURL(/\/sign-in\?email=/)
    await check(page.getByLabel('Email')).toHaveValue(`p100-taken-${stamp}@example.test`)
  } finally {
    await admin().auth.admin.deleteUser(made.data.user.id)
  }
})

test('"Email me a code instead" opens the code flow, and the code flow has a way back', async ({ page }) => {
  await page.goto('/sign-in')
  await page.getByRole('link', { name: 'Email me a code instead' }).click()
  await check(page).toHaveURL(/\/sign-in\?method=code$/)
  await check(page.getByRole('button', { name: 'Send me a sign-in code' })).toBeVisible()
  await expect(page.getByLabel('Password')).toHaveCount(0)
  await noSidewaysScroll(page)
  await proof(page, 'sign-in-code')
  await page.getByRole('link', { name: 'Use my password instead' }).click()
  await check(page).toHaveURL(/\/sign-in$/)
  await check(page.getByLabel('Password')).toBeVisible()
})
