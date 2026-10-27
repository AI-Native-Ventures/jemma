import { resolve } from 'node:path'
import { createServiceClient } from '@jemma/profiling/db'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { signInWithPassword } from './helpers/session'

const admin = () =>
  createServiceClient({
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  })

const actual = (board: string) => resolve(import.meta.dirname, `../../../design/actual/${board}.png`)

/** Design match gate: boards are phone-size, so screenshots are saved from the phone project only. */
async function shot(page: Page, testInfo: TestInfo, board: string) {
  if (testInfo.project.name !== 'phone') return
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: 'nextjs-portal{display:none}' })
  await page.screenshot({ path: actual(board), fullPage: true })
}

async function noHorizontalScroll(page: Page) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(wide).toBe(false)
}

const unique = (tag: string) => `p11-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`

/** A user with no profile yet, plus a 6 digit code from the admin API (no real email is sent). */
async function newUserWithCode(tag: string) {
  const email = unique(tag)
  const created = await admin().auth.admin.createUser({ email, email_confirm: true })
  if (created.error) throw created.error
  const link = await admin().auth.admin.generateLink({ type: 'magiclink', email })
  if (link.error) throw link.error
  return { email, userId: created.data.user.id, code: link.data.properties.email_otp as string }
}

/** The code screen draws AUTH_OTP_LENGTH boxes (default 6, as on the board). */
const OTP_LENGTH = Number(process.env.AUTH_OTP_LENGTH) || 6

async function typeCode(page: Page, code: string) {
  for (let i = 0; i < code.length; i++) await page.getByLabel(`Digit ${i + 1} of ${OTP_LENGTH}`).fill(code.charAt(i))
}

/** jemma-dev may email longer codes than the board's 6; those tests need AUTH_OTP_LENGTH set to match (or the dashboard set to 6). */
function skipIfCodeLengthDiffers(code: string) {
  test.skip(code.length !== OTP_LENGTH, `jemma-dev emails ${code.length} digit codes; run with AUTH_OTP_LENGTH=${code.length} or set the project's OTP length to 6`)
}

test('manifest names the app and asks to be standalone', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest')
  expect(res.ok()).toBe(true)
  const manifest = await res.json()
  expect(manifest.name).toBe('Jemma')
  expect(manifest.theme_color).toBe('#FF6A4D')
  expect(manifest.display).toBe('standalone')
  expect(manifest.icons.length).toBeGreaterThan(1)
  expect((await request.get(manifest.icons[0].src)).ok()).toBe(true)
  expect((await request.get('/sw.js')).ok()).toBe(true)
})

test('sign-in matches the board', async ({ page }, testInfo) => {
  await page.goto('/sign-in')
  await expect(page.getByText("Each child's own tutor. Snap a test, Jemma finds the gaps and teaches them.")).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send me a sign-in code' })).toBeVisible()
  await expect(page.getByText('We email you a 6 digit code. No password to remember.')).toBeVisible()
  await expect(page.getByText('New to Jemma?')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/sign-up')
  await expect(page.getByRole('link', { name: 'Judging the challenge? Try the demo' })).toHaveAttribute('href', '/demo')
  await noHorizontalScroll(page)
  await shot(page, testInfo, 'shared-sign-in')
})

test('sign-up matches the board and needs the agreement before sending a code', async ({ page }, testInfo) => {
  await page.goto('/sign-up')
  await expect(page.getByRole('heading', { name: "Make your Jemma account. It's free for families." })).toBeVisible()
  await expect(
    page.getByText('For teachers, parents, and learners in Grade 8 and up. Younger children get their sign-in from a grown-up.'),
  ).toBeVisible()
  await expect(page.getByLabel('Your name')).toBeVisible()
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByText("I agree to Jemma's terms and privacy policy")).toBeVisible()
  await expect(page.getByRole('link', { name: 'Read it in plain words' })).toHaveAttribute('href', '/privacy')
  await expect(page.getByText('Already have an account?')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/sign-in')
  await noHorizontalScroll(page)
  await shot(page, testInfo, 'shared-sign-up')

  await page.getByLabel('Your name').fill('Test Person')
  await page.getByLabel('Email').fill('someone@example.test')
  await page.getByRole('button', { name: 'Send me a code' }).click()
  await expect(page.getByText('Tick the box to agree before we send a code.')).toBeVisible()
  await expect(page).toHaveURL(/\/sign-up$/)
})

test('code screen matches the board', async ({ page }, testInfo) => {
  await page.goto('/sign-in/code?email=ms.banda@hillview.example')
  await expect(page.getByRole('heading', { name: 'Check your email for a 6 digit code.' })).toBeVisible()
  await expect(page.getByText('We sent it to ms.banda@hillview.example. It works for 10 minutes.')).toBeVisible()
  await typeCode(page, '48291')
  await expect(page.getByText('Paste it or type it. One more digit to go.')).toBeVisible()
  await expect(page.getByRole('heading', { name: "Didn't get it?" })).toBeVisible()
  await expect(page.getByText('Check your spam folder. A new code can take a minute.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send a new code' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Use a different email' })).toHaveAttribute('href', '/sign-in')
  await noHorizontalScroll(page)
  await page.locator('body').click({ position: { x: 2, y: 2 } })
  await shot(page, testInfo, 'shared-code')
})

test('a pasted code fills every box and a wrong code is refused', async ({ page }) => {
  await page.goto('/sign-in/code?email=nobody@example.test')
  await page.getByLabel(`Digit 1 of ${OTP_LENGTH}`).focus()
  await page.evaluate((n) => {
    const data = new DataTransfer()
    data.setData('text', '0'.repeat(n))
    document.activeElement?.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  }, OTP_LENGTH)
  await expect(page.getByLabel(`Digit ${OTP_LENGTH} of ${OTP_LENGTH}`)).toHaveValue('0')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('That code did not work. Check it or send a new one.')).toBeVisible()
  await expect(page).toHaveURL(/\/sign-in\/code/)
})

test.describe('first sign-in with an emailed code', () => {
  for (const [role, home, label] of [
    ['teacher', /\/t$/, 'Teacher'],
    ['parent', /\/p$/, 'Parent'],
  ] as const) {
    test(`code verifies, then ${role} pick routes to ${role === 'teacher' ? '/t' : '/p'}`, async ({ page }, testInfo) => {
      const user = await newUserWithCode(role)
      try {
        skipIfCodeLengthDiffers(user.code)
        await page.goto(`/sign-in/code?email=${encodeURIComponent(user.email)}`)
        await typeCode(page, user.code)
        await page.getByRole('button', { name: 'Sign in' }).click()
        await expect(page).toHaveURL(/\/role$/)

        await expect(page.getByRole('heading', { name: 'How will you use Jemma?' })).toBeVisible()
        await expect(page.getByText('This decides what you see first.')).toBeVisible()
        await expect(page.getByText("I snap my class's tests and see what they don't get yet.")).toBeVisible()
        await expect(page.getByText("I support my child at home and want to know they're okay.")).toBeVisible()
        await expect(page.getByText('Learner · Grade 8 to 12')).toBeVisible()
        await expect(page.getByText('I fix my own gaps with my Jemma.')).toBeVisible()
        await expect(page.getByText('Grade 7 or younger? A grown-up adds you.')).toBeVisible()
        await expect(page.getByRole('link', { name: 'Sign in with your code' })).toHaveAttribute('href', '/k/sign-in')
        await noHorizontalScroll(page)
        if (role === 'teacher') await shot(page, testInfo, 'shared-role')

        await page.getByRole('button', { name: new RegExp(`^${label}`) }).click()
        await expect(page).toHaveURL(home)
      } finally {
        await admin().auth.admin.deleteUser(user.userId)
      }
    })
  }

  test('learner card opens the coming-later sheet', async ({ page }) => {
    const user = await newUserWithCode('learner')
    try {
      skipIfCodeLengthDiffers(user.code)
      await page.goto(`/sign-in/code?email=${encodeURIComponent(user.email)}`)
      await typeCode(page, user.code)
      await page.getByRole('button', { name: 'Sign in' }).click()
      await expect(page).toHaveURL(/\/role$/)
      await page.getByRole('button', { name: /^Learner/ }).click()
      await expect(page.getByRole('dialog', { name: 'Coming after the challenge' })).toBeVisible()
    } finally {
      await admin().auth.admin.deleteUser(user.userId)
    }
  })
})

test('a user who already has a role is sent home from /role', async ({ page }) => {
  const email = unique('has-role')
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1`
  const created = await admin().auth.admin.createUser({ email, password, email_confirm: true })
  if (created.error) throw created.error
  try {
    const { error } = await admin().from('profiles').insert({ user_id: created.data.user.id, role: 'parent', display_name: 'P11 Parent' })
    if (error) throw error
    await signInWithPassword(page, email, password)
    await page.goto('/role')
    await expect(page).toHaveURL(/\/p$/)
  } finally {
    await admin().auth.admin.deleteUser(created.data.user.id)
  }
})

test('privacy matches the board', async ({ page }, testInfo) => {
  await page.goto('/privacy')
  await expect(
    page.getByRole('heading', { name: "Your child's work stays yours. Here is what Jemma keeps and who sees it." }),
  ).toBeVisible()
  for (const h of ['What Jemma keeps', 'Who sees what', 'AI services', 'Children', 'Your rights']) {
    await expect(page.getByRole('heading', { name: h, exact: true })).toBeVisible()
  }
  await expect(page.getByText('Paper photos and marks')).toBeVisible()
  await expect(page.getByText('Children they are linked to, after the teacher says yes')).toBeVisible()
  await expect(page.getByText('Nobody, unless you ask us for help')).toBeVisible()
  await expect(page.getByText("South Africa's POPIA law treats under-18s as children, so a parent or guardian agrees before a child's work is used.")).toBeVisible()
  await expect(page.getByRole('link', { name: /Privacy and your data/ })).toHaveAttribute('href', '/p/data')
  await expect(page.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/sign-up')
  await noHorizontalScroll(page)
  await shot(page, testInfo, 'legal-privacy')
  await page.getByRole('button', { name: 'Terms of use' }).click()
  await expect(page.getByRole('dialog', { name: 'Coming after the challenge' })).toBeVisible()
})

test('help matches the board and its questions open', async ({ page }, testInfo) => {
  await page.goto('/help')
  await expect(page.getByRole('heading', { name: 'How can we help?' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Popular questions' })).toBeVisible()
  await expect(page.getByText('Tap the mark to see the photo it came from. If Jemma read it wrong, tell the teacher from the paper.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Who can see my child\'s marks?' })).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('heading', { name: 'Still stuck?' })).toBeVisible()
  await expect(page.getByText('We answer within one school day.')).toBeVisible()
  await noHorizontalScroll(page)
  await shot(page, testInfo, 'help')

  await page.getByRole('button', { name: "Who can see my child's marks?" }).click()
  await expect(page.getByRole('button', { name: "Who can see my child's marks?" })).toHaveAttribute('aria-expanded', 'true')
  await page.getByLabel('Search help').fill('demo')
  await expect(page.getByRole('button', { name: 'How do I reset the demo?' })).toBeVisible()
  await expect(page.getByRole('button', { name: "Who can see my child's marks?" })).toBeHidden()
})

test('install prompt matches the board and can be dismissed', async ({ page }, testInfo) => {
  await page.goto('/install')
  const dialog = page.getByRole('dialog', { name: 'Put Jemma on your home screen' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('It opens like an app and keeps you signed in.')).toBeVisible()
  await expect(dialog.getByText('Tap Share, then Add to Home Screen')).toBeVisible()
  await expect(dialog.getByText('Tap Install when Chrome asks')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Show me how' })).toBeVisible()
  await shot(page, testInfo, 'install-prompt')
  await dialog.getByRole('button', { name: 'Not now' }).click()
  await expect(dialog).toBeHidden()
})
