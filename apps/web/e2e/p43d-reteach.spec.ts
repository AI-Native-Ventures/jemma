import { createServiceClient } from '@jemma/profiling/db'
import { expect, test } from '@playwright/test'
import { openSandbox } from './helpers/sandbox'

const admin = () =>
  createServiceClient({
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  })

test('mark reteach done works in one teacher session across laptop and phone views', async ({ page }) => {
  const db = admin()
  const sandbox = await openSandbox(page, { stage: 'marked', role: 'teacher' })
  try {
    const { data: plan, error: planError } = await db
      .from('reteach_plans')
      .select('id, done_at')
      .eq('class_id', sandbox.classId)
      .eq('topic_name', 'Adding fractions with different denominators')
      .single()
    expect(planError).toBeNull()
    expect(plan?.done_at).toBeNull()

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/t/${sandbox.classId}`)
    await expect(page.getByRole('button', { name: 'Mark reteach done' }).first()).toBeVisible()

    await page.setViewportSize({ width: 390, height: 844 })
    await page.locator('section[aria-labelledby="gaps"] > a').first().click()
    await expect(page).toHaveURL(new RegExp(`/t/${sandbox.classId}/gaps/`))
    const actionResponse = page.waitForResponse((response) => {
      const request = response.request()
      return request.method() === 'POST' && new URL(response.url()).pathname.endsWith('/gaps/adding-fractions-with-different-denominators')
    })
    await page.getByRole('button', { name: 'Mark reteach done' }).click()
    expect((await actionResponse).status()).toBe(200)
    await expect(page.getByText('markReteachDone: plan not found')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Reteach done' })).toBeDisabled()

    const { data, error } = await db.from('reteach_plans').select('done_at').eq('id', plan!.id).single()
    expect(error).toBeNull()
    expect(data?.done_at).not.toBeNull()
  } finally {
    await sandbox.cleanup().catch(() => undefined)
  }
})
