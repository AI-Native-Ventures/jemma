import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServiceClient } from '@jemma/profiling/db'
import { expect, test as base, type Page } from '@playwright/test'
import { signInWithPassword } from './helpers/session'

// A parent links to a learner who signed up alone (P114), on a phone. A learner with a login of their own (one child in a personal school, no parent: the
// shape P111 makes when a learner signs up alone) opens Me, taps "Make a code" under "Link a parent" and reads a 6-character code. A new parent account
// opens "Add a child", sees the third way "My child has a code from their own Jemma", types a wrong code (words, nothing linked), then the right one (small
// letters and a space are fine), and lands on the child's page: the name, "Practising on their own", no "Make a sign-in code" (the learner has a login),
// and the data is an approved link with the code used up. The same code a second time is refused. No model is called.
//
// RUNS IN CI on every push (job "Feature specs in a browser", .github/workflows/ci.yml, the step with the real agent, phone), on CI's own local database.
// Never run it against the hosted preview database. Screenshots are written only when P114_PROOF is set, to design/proof/p114, named by width (360, 390
// or 1440), by a person who runs it by hand against a build.

const check = expect.configure({ timeout: 45_000 })
const admin = () => createServiceClient({ SUPABASE_URL: process.env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY! })

const proofDir = resolve(import.meta.dirname, '../../../design/proof/p114')
async function proof(page: Page, name: string) {
  if (!process.env.P114_PROOF) return
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

type Cleanup = () => Promise<void>
const cleanups: Cleanup[] = []
base.afterEach(async () => {
  for (const c of cleanups.splice(0)) await c().catch(() => undefined)
})

const test = base
test.use({ screenshot: 'only-on-failure', actionTimeout: 45_000 })
test.setTimeout(300_000)

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

test.describe('a parent links to a learner who signed up alone', () => {
  test('the learner makes a code on Me, a new parent types it on Add a child, and lands on the learner’s page', async ({ page }) => {
    const db = admin()
    const users: string[] = []
    let schoolId: string | null = null
    cleanups.push(async () => {
      if (schoolId) await db.from('schools').delete().eq('id', schoolId)
      for (const id of users) await db.auth.admin.deleteUser(id)
    })
    const mkLogin = async (role: 'learner' | 'parent', name: string, school: string | null) => {
      const email = `p114-${role}-${unique()}@example.test`
      const password = `pw-${Math.random().toString(36).slice(2)}-Aa1`
      const created = await db.auth.admin.createUser({ email, password, email_confirm: true })
      if (created.error) throw created.error
      users.push(created.data.user.id)
      return { id: created.data.user.id, email, password, profile: { user_id: created.data.user.id, role, display_name: name, school_id: school } }
    }

    // A learner who signed up alone: one child with their own login in a personal school, the Grade 5 class, no parent.
    const school = await db.from('schools').insert({ name: "Neo's own", country: 'ZA', kind: 'private' }).select('id').single()
    if (school.error) throw school.error
    schoolId = school.data.id
    const learner = await mkLogin('learner', 'Neo', schoolId)
    const inserted = await db.from('profiles').insert(learner.profile)
    if (inserted.error) throw inserted.error
    const child = await db.from('children').insert({ school_id: schoolId, first_name: 'Neo', last_name: null, grade: 5, user_id: learner.id, private_of: null }).select('id').single()
    if (child.error) throw child.error
    const childId = child.data.id
    const cls = await db
      .from('classes')
      .insert({ school_id: schoolId, teacher_id: learner.id, name: 'Grade 5 (my own)', grade: 5, year: 2026, subject: 'Mathematics', join_code: `P114${Math.random().toString(36).slice(2, 4).toUpperCase()}` })
      .select('id')
      .single()
    if (cls.error) throw cls.error
    const enrolled = await db.from('enrolments').insert({ class_id: cls.data.id, child_id: childId }).select('class_id')
    if (enrolled.error) throw enrolled.error

    // The learner opens Me: "Link a parent" with one button and no code yet.
    await signInWithPassword(page, learner.email, learner.password)
    await page.goto('/k/me')
    await check(page.getByRole('heading', { level: 2, name: 'Link a parent' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Make a new code' })).toHaveCount(0)
    await expect(page.getByLabel(/Your code for a parent is /)).toHaveCount(0)
    await atEveryWidth(page, 'me-no-code')

    // "Make a code": a 6-character code (letters and numbers, no look-alikes) with the line that says what to do with it, and "Make a new code".
    await page.getByRole('button', { name: 'Make a code' }).click()
    const label = await page.getByLabel(/Your code for a parent is /).getAttribute('aria-label', { timeout: 90_000 })
    const code = label!.replace('Your code for a parent is ', '')
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/)
    await expect(page.getByText('Give this code to your parent or guardian. It works for 7 days.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Make a new code' })).toBeVisible()
    const stored = (await db.from('parent_invite_codes').select('code, expires_at').eq('child_id', childId)).data!
    expect(stored).toHaveLength(1)
    expect(stored[0]!.code).toBe(code)
    const days = (new Date(stored[0]!.expires_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    expect(days).toBeGreaterThan(6.9)
    expect(days).toBeLessThan(7.1)
    await atEveryWidth(page, 'me-with-code')

    // A new code replaces the old one.
    await page.getByRole('button', { name: 'Make a new code' }).click()
    await check(page.getByLabel(/Your code for a parent is /)).not.toHaveAttribute('aria-label', `Your code for a parent is ${code}`)
    const second = (await page.getByLabel(/Your code for a parent is /).getAttribute('aria-label'))!.replace('Your code for a parent is ', '')
    expect(second).not.toBe(code)
    expect((await db.from('parent_invite_codes').select('code').eq('child_id', childId)).data).toEqual([{ code: second }])

    // A new parent account opens Add a child: the class code form, "My child's school doesn't use Jemma", and the third way under them.
    await page.context().clearCookies()
    const parent = await mkLogin('parent', 'Palesa Test', null)
    const made = await db.from('profiles').insert(parent.profile)
    if (made.error) throw made.error
    await signInWithPassword(page, parent.email, parent.password)
    await page.goto('/p/add')
    await check(page.getByRole('heading', { level: 1 })).toHaveText("Link your child with the teacher's class code")
    const way = page.getByRole('button', { name: 'My child has a code from their own Jemma' })
    await expect(page.getByRole('button', { name: "My child's school doesn't use Jemma" })).toBeVisible()
    await expect(way).toHaveAttribute('aria-expanded', 'false')
    await way.click()
    await expect(way).toHaveAttribute('aria-expanded', 'true')
    await atEveryWidth(page, 'add-child-code')

    // Nothing typed, then a code nobody has, then the old code: each is said in words and nothing is linked.
    await page.getByRole('button', { name: 'Link my child' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Type the code' })).toHaveText('Type the code your child gave you.')
    await page.getByLabel("Your child's code").fill('ZZZZZZ')
    await page.getByRole('button', { name: 'Link my child' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'not right' })).toHaveText('That code is not right. Check it with your child.')
    await page.getByLabel("Your child's code").fill(code)
    await page.getByRole('button', { name: 'Link my child' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'not right' })).toHaveText('That code is not right. Check it with your child.')
    expect((await db.from('parent_links').select('id').eq('child_id', childId)).data).toEqual([])

    // The right code, in small letters with a space: the parent lands on the child's page.
    await page.getByLabel("Your child's code").fill(`${second.slice(0, 3)} ${second.slice(3)}`.toLowerCase())
    await page.getByRole('button', { name: 'Link my child' }).click()
    await page.waitForURL(new RegExp(`/p/${childId}$`), { timeout: 90_000 })
    await check(page.getByRole('heading', { level: 1 })).toHaveText('Neo')
    await expect(page.getByText('Practising on their own')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Practise at home with Neo' })).toBeVisible()
    // The learner has a login of their own: no sign-in code to make, and the page says why.
    await expect(page.getByRole('button', { name: /sign-in code/i })).toHaveCount(0)
    await expect(page.getByText('Neo signs in with their own account, so there is no code for you to make.')).toBeVisible()
    await atEveryWidth(page, 'child-page')

    // The data: an approved link for this parent on the learner's class, and the code is used up.
    const links = (await db.from('parent_links').select('parent_id, status, class_id').eq('child_id', childId)).data!
    expect(links).toEqual([{ parent_id: parent.id, status: 'approved', class_id: cls.data.id }])
    expect((await db.from('parent_invite_codes').select('code').eq('child_id', childId)).data).toEqual([])

    // The same code a second time links nobody.
    await page.goto('/p/add')
    await page.getByRole('button', { name: 'My child has a code from their own Jemma' }).click()
    await page.getByLabel("Your child's code").fill(second)
    await page.getByRole('button', { name: 'Link my child' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'not right' })).toHaveText('That code is not right. Check it with your child.')
    expect((await db.from('parent_links').select('id').eq('child_id', childId)).data).toHaveLength(1)
  })
})
