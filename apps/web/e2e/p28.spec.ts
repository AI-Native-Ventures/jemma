import { resolve } from 'node:path'
import { createServiceClient } from '@jemma/profiling/db'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { openSandbox } from './helpers/sandbox'

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
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
}

// Building a seeded sandbox takes 10 to 25 seconds.
test.describe.configure({ timeout: 120_000 })

async function learnerCreds(sandboxId: string) {
  const { data, error } = await admin().from('demo_sandboxes').select('logins').eq('id', sandboxId).single()
  if (error) throw error
  return (data.logins as { learner: { code: string; pin: string } }).learner
}

async function typePin(page: Page, pin: string) {
  for (const d of pin) await page.getByRole('button', { name: d, exact: true }).click()
}

test.describe('child-sign-in', () => {
  test('code and PIN keypad sign the child in', async ({ page }, testInfo) => {
    const sb = await openSandbox(page, { stage: 'session_done', role: 'learner' })
    try {
      const creds = await learnerCreds(sb.sandboxId)
      await page.context().clearCookies()
      await page.goto('/k/sign-in')
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hi! Sign in to your Jemma.')
      await expect(page.getByText('Your code', { exact: true })).toBeVisible()
      await expect(page.getByText('Your PIN', { exact: true })).toBeVisible()
      await expect(page.getByText('Forgot your PIN? Ask a grown-up.')).toBeVisible()
      await page.getByLabel('Your code').fill(creds.code)
      await typePin(page, creds.pin.slice(0, 2))
      await expect(page.getByText('2 of 4 digits typed')).toBeAttached()
      await noHorizontalScroll(page)
      await shot(page, testInfo, 'child-sign-in')
      await page.getByRole('button', { name: 'Delete' }).click()
      await expect(page.getByText('1 of 4 digits typed')).toBeAttached()
      await typePin(page, creds.pin.slice(1))
      await page.getByRole('button', { name: 'Sign in' }).click()
      await page.waitForURL('**/k')
      await expect(page).toHaveURL(/\/k$/)
    } finally {
      await sb.cleanup()
    }
  })

  test('a wrong PIN shows a kind message and clears the dots', async ({ page }) => {
    const sb = await openSandbox(page, { stage: 'start', role: 'learner' })
    try {
      const creds = await learnerCreds(sb.sandboxId)
      await page.context().clearCookies()
      await page.goto('/k/sign-in')
      const wrong = creds.pin === '0000' ? '1111' : '0000'
      await page.getByLabel('Your code').fill(creds.code)
      await typePin(page, wrong)
      await page.getByRole('button', { name: 'Sign in' }).click()
      await expect(page.getByText('That code or PIN is not right. Check it and try again.')).toBeVisible()
      await expect(page.getByText('0 of 4 digits typed')).toBeAttached()
      await expect(page).toHaveURL(/\/k\/sign-in/)
    } finally {
      await sb.cleanup()
    }
  })
})

// The tab "My gaps" is now "My maths" (P80): /k/gaps redirects there, and the learner's gaps are listed under "Your gaps" with their stage and their own count.
test.describe('child-gaps (now on My maths)', () => {
  test('after the first session: the gaps are listed with their stage, and /k/gaps goes to My maths', async ({ page }, testInfo) => {
    const sb = await openSandbox(page, { stage: 'session_done', role: 'learner' })
    try {
      await page.goto('/k/gaps')
      await expect(page).toHaveURL(/\/k\/maths$/)
      await expect(page.getByRole('heading', { level: 1, name: 'My maths' })).toBeVisible()
      const gaps = page.getByRole('region', { name: 'Your gaps' })
      await expect(gaps.getByText('Practising ·', { exact: false })).toHaveCount(1)
      await expect(gaps.getByText('Fixed ·', { exact: false })).toHaveCount(3)
      await expect(gaps.getByText('New ·', { exact: false })).toHaveCount(1)
      await expect(gaps.getByText('Equivalent fractions')).toBeVisible()
      await expect(gaps.getByText('Ordering whole numbers')).toBeVisible()
      await expect(gaps.getByText('Rounding off')).toBeVisible()
      await expect(gaps.getByText('Adding fractions with different denominators')).toBeVisible()
      await expect(gaps.getByText('Adding decimals')).toBeVisible()
      await expect(page.getByRole('region', { name: 'All of Mathematics' })).toBeVisible()
      await noHorizontalScroll(page)
      await shot(page, testInfo, 'child-gaps')
    } finally {
      await sb.cleanup()
    }
  })

  test('before any session every unfixed gap is New, and each has a Practise button', async ({ page }) => {
    const sb = await openSandbox(page, { stage: 'marked', role: 'learner' })
    try {
      await page.goto('/k/maths')
      const gaps = page.getByRole('region', { name: 'Your gaps' })
      await expect(gaps.getByText('Practising ·', { exact: false })).toHaveCount(0)
      await expect(gaps.getByText('New ·', { exact: false }).first()).toBeVisible()
    } finally {
      await sb.cleanup()
    }
  })
})

test.describe('child-account', () => {
  test('colour, read aloud and done for today', async ({ page }, testInfo) => {
    const sb = await openSandbox(page, { stage: 'session_done', role: 'learner' })
    try {
      await page.goto('/k/me')
      await expect(page.getByRole('heading', { level: 1 })).toHaveText("That's you, Amina!")
      await expect(page.getByText('A grown-up can change your PIN.')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Peach' })).toHaveAttribute('aria-pressed', 'true')
      const aloud = page.getByRole('button', { name: /Read questions out loud/ })
      await expect(aloud).toHaveAttribute('aria-pressed', 'false')
      await expect(page.getByText('Jemma reads each question to you')).toBeVisible()
      await noHorizontalScroll(page)
      await shot(page, testInfo, 'child-account')
      await page.getByRole('button', { name: 'Lilac' }).click()
      await expect(page.getByRole('button', { name: 'Lilac' })).toHaveAttribute('aria-pressed', 'true')
      await aloud.click()
      await expect(aloud).toHaveAttribute('aria-pressed', 'true')
      await page.reload()
      await expect(page.getByRole('button', { name: 'Lilac' })).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByRole('button', { name: /Read questions out loud/ })).toHaveAttribute('aria-pressed', 'true')
      await page.getByRole('button', { name: "I'm done for today" }).click()
      await page.waitForURL('**/k/sign-in')
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hi! Sign in to your Jemma.')
    } finally {
      await sb.cleanup()
    }
  })
})
