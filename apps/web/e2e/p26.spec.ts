import { createServiceClient } from '@jemma/profiling/db'
import { expect, test, type Page } from '@playwright/test'
import { openSandbox, type OpenedSandbox } from './helpers/sandbox'

const admin = () =>
  createServiceClient({
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  })

test.setTimeout(120_000)
test.use({ actionTimeout: 30_000 })
let sb: OpenedSandbox | undefined
test.afterEach(async () => {
  await sb?.cleanup()
  sb = undefined
})

async function loginCode(childId: string): Promise<string> {
  const { data, error } = await admin().from('child_logins').select('code').eq('child_id', childId).single()
  if (error) throw new Error(error.message)
  return data.code
}

/** Saves the full page at the board's height (the phone project is 390 wide). */
async function shoot(page: Page, board: string, height: number) {
  if (page.viewportSize()!.width !== 390) return
  await page.setViewportSize({ width: 390, height })
  await page.screenshot({ path: `../../design/actual/${board}.png` })
}

async function noSideScroll(page: Page) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(wide).toBe(false)
}

test('parent-child-settings: copy, teacher link, coming sheet', async ({ page }) => {
  sb = await openSandbox(page, { stage: 'marked', role: 'parent' })
  const code = await loginCode(sb.childId)
  await page.goto(`/p/${sb.childId}/settings`)
  await expect(page.getByRole('heading', { name: "Amina's settings. Most families never need to change these." })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'About Amina' })).toBeVisible()
  await expect(page.getByText('Grade 6 · Hillview Primary').last()).toBeVisible()
  await expect(page.getByText(`Code ${code} and her own PIN`)).toBeVisible()
  await expect(page.getByText('She signs in without an email')).toBeVisible()
  await expect(page.getByText('Ms Banda', { exact: true })).toBeVisible()
  await expect(page.getByText(/^6B Mathematics · linked \w{3} \d{1,2} \w{3}$/)).toBeVisible()
  await expect(page.getByText('Right or wrong shows')).toBeVisible()
  await expect(page.getByRole('button', { name: 'At the end' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText("Ms Banda's class tests follow her settings.")).toBeVisible()
  await expect(page.getByText("Tonight's lesson is ready")).toBeVisible()
  await expect(page.getByRole('link', { name: 'Remove Amina from Jemma' })).toHaveAttribute('href', '/p/data')
  await page.getByRole('button', { name: "Add another teacher's code" }).click()
  await expect(page.getByRole('dialog', { name: 'Coming after the challenge' })).toBeVisible()
  await page.getByRole('button', { name: 'Got it' }).click()
  await noSideScroll(page)
  await shoot(page, 'parent-child-settings', 1212)
})

test('parent-child-login: shows the code, makes a new one with a PIN', async ({ page }) => {
  sb = await openSandbox(page, { stage: 'marked', role: 'parent' })
  const old = await loginCode(sb.childId)
  await page.goto(`/p/${sb.childId}/settings/login`)
  await expect(page.getByRole('heading', { name: 'Amina signs in with her own code and PIN. No email needed.' })).toBeVisible()
  await expect(page.getByText(old, { exact: true })).toBeVisible()
  await expect(page.getByText('Amina picks it the first time she signs in.')).toBeVisible()
  await expect(page.getByText('Keep the code at home. Ms Banda can\'t see it.')).toBeVisible()
  await expect(page.getByText('The old code stops working.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Done' })).toHaveAttribute('href', `/p/${sb.childId}/settings`)
  await noSideScroll(page)
  await shoot(page, 'parent-child-login', 844)

  await page.getByRole('button', { name: 'Make a new code' }).click()
  await page.getByLabel('Choose a 4-digit PIN').fill('4321')
  await page.getByRole('button', { name: 'Save new code' }).click()
  await expect(page.getByText(old, { exact: true })).toHaveCount(0, { timeout: 30_000 })
  const fresh = await loginCode(sb.childId)
  expect(fresh).not.toBe(old)
  await expect(page.getByText(fresh, { exact: true })).toBeVisible()
  const { data } = await admin().from('child_logins').select('user_id').eq('code', fresh).single()
  if (data) await admin().auth.admin.deleteUser(data.user_id)
})

test('parent-account: name, email, rows, sign out', async ({ page }) => {
  sb = await openSandbox(page, { stage: 'marked', role: 'parent' })
  await page.goto('/p/account')
  await expect(page.getByRole('heading', { name: 'Thandi M' })).toBeVisible()
  await expect(page.getByText(/@demo\.jemma\.invalid$/)).toBeVisible()
  await expect(page.getByText('Your children')).toBeVisible()
  await expect(page.getByText('In the app · lesson ready and lesson finished')).toBeVisible()
  await expect(page.getByText('Download audio lessons on Wi-Fi only')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Privacy and your data' })).toHaveAttribute('href', '/p/data')
  await expect(page.getByRole('link', { name: 'Help' })).toHaveAttribute('href', '/help')
  await noSideScroll(page)
  await shoot(page, 'parent-account', 844)
  await page.getByRole('button', { name: 'Data saver' }).click()
  await expect(page.getByRole('button', { name: 'Data saver' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/sign-in/)
})

test('parent-data: consents, improve toggle saves, delete copy', async ({ page }) => {
  sb = await openSandbox(page, { stage: 'marked', role: 'parent' })
  await page.goto('/p/data')
  await expect(page.getByRole('heading', { name: 'See, fix, download or delete what Jemma keeps about your family.' })).toBeVisible()
  await expect(page.getByText("Amina's schoolwork is used to teach her")).toBeVisible()
  await expect(page.getByText(/^Agreed \w{3} \d{1,2} \w{3} · needed for Jemma to work$/)).toBeVisible()
  await expect(page.getByText('Her photos, marks and lessons leave Jemma within 30 days.')).toBeVisible()
  await expect(page.getByText('These are your rights under POPIA.')).toBeVisible()
  await noSideScroll(page)
  await shoot(page, 'parent-data', 1028)
  const improve = page.getByRole('button', { name: /Use Amina's work, name removed, to improve Jemma/ })
  await expect(improve).toHaveAttribute('aria-pressed', 'false')
  await improve.click()
  await expect(improve).toHaveAttribute('aria-pressed', 'true')
  await expect
    .poll(async () => {
      const { data } = await admin().from('parent_links').select('consent').eq('child_id', sb!.childId).single()
      return (data?.consent as { improve?: boolean } | null)?.improve
    })
    .toBe(true)
  await page.getByRole('button', { name: "Delete Amina's data" }).click()
  await expect(page.getByRole('dialog', { name: 'Coming after the challenge' })).toBeVisible()
})
