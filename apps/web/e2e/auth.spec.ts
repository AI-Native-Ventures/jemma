import { createServiceClient } from '@jemma/profiling/db'
import { expect, test } from '@playwright/test'
import { signInWithPassword } from './helpers/session'

const admin = () =>
  createServiceClient({
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  })

test('signed-out visit to /t goes to /sign-in', async ({ page }) => {
  await page.goto('/t')
  await expect(page).toHaveURL(/\/sign-in$/)
})

test('signed-out visit to /k and /p goes to /sign-in', async ({ page }) => {
  await page.goto('/k')
  await expect(page).toHaveURL(/\/sign-in$/)
  await page.goto('/p')
  await expect(page).toHaveURL(/\/sign-in$/)
})

test.describe('signed in as a parent', () => {
  const email = `p07-parent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1`
  let userId = ''

  test.beforeAll(async () => {
    const created = await admin().auth.admin.createUser({ email, password, email_confirm: true })
    if (created.error) throw created.error
    userId = created.data.user.id
    const { error } = await admin().from('profiles').insert({ user_id: userId, role: 'parent', display_name: 'P07 Parent' })
    if (error) throw error
  })

  test.afterAll(async () => {
    if (userId) await admin().auth.admin.deleteUser(userId)
  })

  test('parent visiting /t lands on /p', async ({ page }) => {
    await signInWithPassword(page, email, password)
    await page.goto('/t')
    await expect(page).toHaveURL(/\/p$/)
  })

  test('parent visiting /k lands on /p', async ({ page }) => {
    await signInWithPassword(page, email, password)
    await page.goto('/k')
    await expect(page).toHaveURL(/\/p$/)
  })
})
