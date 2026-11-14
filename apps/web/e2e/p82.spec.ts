import { createServiceClient } from '@jemma/profiling/db'
import { expect, test, type Page } from '@playwright/test'
import { createSandbox, deleteSandbox, type SandboxKind } from '../../../supabase/seed/demo'
import { signInWithPassword } from './helpers/session'

// The official South African Mathematics curriculum (CAPS) in the teacher's hands (P82). WRITTEN AND NOT RUN: the shared database could not
// serve a browser spec on the day it was written, so nothing here has been seen to pass. Phone project.
// - An empty school, a Grade 10 class, one tap on "Start from the CAPS map": the review screen shows Term 1 with "Algebraic expressions",
//   the teacher approves, and the approved board says where the topics come from.
// - A fresh demo copy as Mr Dlamini: his class 7A starts with its CAPS map already approved.

const check = expect.configure({ timeout: 45_000 })
const admin = () => createServiceClient({ SUPABASE_URL: process.env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY! })

type Login = { email: string; password: string }

/** Makes a copy of the made-up school (or the empty one), signs the page in as one teacher and sets the demo cookie. Returns a clean-up. */
async function openAs(page: Page, kind: SandboxKind, teacher: 'banda' | 'dlamini' = 'banda') {
  const db = admin()
  const made = await createSandbox(db, { stage: 'start', kind })
  const cleanup = () => deleteSandbox(db, made.sandboxId)
  try {
    const row = await db.from('demo_sandboxes').select('logins').eq('id', made.sandboxId).single()
    if (row.error) throw new Error(`openAs: ${row.error.message}`)
    const logins = row.data.logins as unknown as { teacher: Login; teachers?: Record<string, Login> }
    const login = teacher === 'banda' ? logins.teacher : logins.teachers![teacher]!
    await signInWithPassword(page, login.email, login.password)
    const baseURL = new URL(process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000')
    await page.context().addCookies([{ name: 'jemma_demo', value: made.sandboxId, domain: baseURL.hostname, path: '/', httpOnly: true, secure: false, sameSite: 'Lax' }])
    return { ...made, cleanup }
  } catch (e) {
    await cleanup().catch(() => undefined)
    throw e
  }
}

test.describe('the CAPS map', () => {
  test('an empty school: a Grade 10 class starts from the CAPS map, the teacher checks Term 1 and approves', async ({ page }) => {
    test.setTimeout(300_000)
    const box = await openAs(page, 'empty')
    try {
      await page.goto('/t/new?grade=10')
      await check(page.getByLabel('Grade', { exact: true })).toHaveValue('10')
      await page.getByLabel('Class name').fill('10A Mathematics')
      await page.getByRole('button', { name: 'Create class' }).click()
      await check(page).toHaveURL(/\/t\/new\/[0-9a-f-]{36}$/)
      const classId = page.url().split('/').pop()!

      // The first thing on the curriculum screen is the CAPS map, above the upload buttons, and upload stays possible.
      await page.goto(`/t/${classId}/curriculum`)
      await check(page.getByText('The official South African topics for Grade 10, term by term. You check it and approve it.')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Add a file' })).toBeVisible()
      await page.getByRole('button', { name: 'Start from the CAPS map' }).click()

      // The review screen: Term 1 with "Algebraic expressions". No document, no model, no waiting.
      await check(page).toHaveURL(new RegExp(`/t/${classId}/curriculum/map$`))
      await check(page.getByText('Algebraic expressions').first()).toBeVisible()
      await expect(page.getByText('Term 1').first()).toBeVisible()
      const db = admin()
      const maps = (await db.from('curriculum_maps').select('id, status').eq('class_id', classId)).data!
      expect(maps).toHaveLength(1)
      expect(maps[0]!.status).toBe('draft')
      expect((await db.from('curriculum_docs').select('id').eq('class_id', classId)).data).toHaveLength(0)
      expect((await db.from('events').select('id').eq('school_id', box.schoolId).eq('type', 'curriculum.uploaded')).data).toHaveLength(0)

      // Approve it as today. The approved board says where the topics come from, with the address as a link.
      await page.getByRole('button', { name: 'Approve map' }).click()
      await check(page).toHaveURL(new RegExp(`/t/${classId}/curriculum$`))
      await check(page.getByText(/^From Curriculum and Assessment Policy Statement \(CAPS\)/)).toBeVisible()
      await expect(page.getByText(/Department of Basic Education/).first()).toBeVisible()
      await expect(page.getByRole('link', { name: 'education.gov.za' })).toHaveAttribute('href', /^https:\/\/www\.education\.gov\.za\//)
      const topics = (await db.from('topics').select('id').eq('map_id', maps[0]!.id)).data!
      expect(topics.length).toBeGreaterThan(0)
    } finally {
      await box.cleanup().catch(() => undefined)
    }
  })

  test('a fresh demo copy as Mr Dlamini: 7A starts with its CAPS map approved, and 6B does not', async ({ page }) => {
    test.setTimeout(300_000)
    const box = await openAs(page, 'hillview', 'dlamini')
    try {
      const db = admin()
      const classes = (await db.from('classes').select('id, name').eq('school_id', box.schoolId)).data!
      const seven = classes.find((c) => c.name === '7A Mathematics')!.id
      const six = classes.find((c) => c.name === '6B Mathematics')!.id

      await page.goto(`/t/${seven}/curriculum`)
      await check(page.getByText(/^From Curriculum and Assessment Policy Statement \(CAPS\)/)).toBeVisible()
      await expect(page.getByText(/Approved/).first()).toBeVisible()
      await expect(page.getByRole('button', { name: 'Start from the CAPS map' })).toHaveCount(0)

      // 6B keeps its first step: no map until the teacher's own upload.
      expect((await db.from('curriculum_maps').select('id').eq('class_id', six)).data).toHaveLength(0)
      const maps = (await db.from('curriculum_maps').select('status').eq('class_id', seven)).data!
      expect(maps.map((m) => m.status)).toEqual(['approved'])
    } finally {
      await box.cleanup().catch(() => undefined)
    }
  })
})
