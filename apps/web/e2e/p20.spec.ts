import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServiceClient } from '@jemma/profiling/db'
import { expect, test, type Page } from '@playwright/test'
import { openSandbox, type OpenedSandbox } from './helpers/sandbox'

const admin = () =>
  createServiceClient({
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  })

// First request compiles the route in dev, and a sandbox takes a few seconds to seed.
test.setTimeout(180_000)

const opened: OpenedSandbox[] = []
test.afterAll(async () => {
  await Promise.all(opened.map((s) => s.cleanup().catch(() => undefined)))
})

/** Design-match image: phone project only, 390 wide, full page, dev indicator hidden. */
async function shoot(page: Page, board: string) {
  if (test.info().project.name !== 'phone') return
  const dir = resolve(import.meta.dirname, '../../../design/actual')
  mkdirSync(dir, { recursive: true })
  await page.addStyleTag({ content: 'nextjs-portal{display:none !important}' })
  await page.screenshot({ path: resolve(dir, `${board}.png`), fullPage: true })
}

async function testIdOf(classId: string): Promise<string> {
  const { data, error } = await admin().from('tests').select('id').eq('class_id', classId).single()
  if (error) throw new Error(error.message)
  return data.id
}

test('tests list: headline, Class Test 1 card, lowest topics (session_done)', async ({ page }) => {
  const s = await openSandbox(page, { stage: 'session_done', role: 'teacher' })
  opened.push(s)
  await page.goto(`/t/${s.classId}/tests`)

  await expect(
    page.getByRole('heading', { level: 1, name: 'Class Test 1 averaged 68%. Adding fractions pulled it down.' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Term 4' })).toBeVisible()
  const card = page.getByRole('link', { name: /Class Test 1: Fractions and decimals/ })
  await expect(card).toContainText('5 of 5 papers marked')
  await expect(card).toContainText('68%')
  await expect(card).toContainText('average')
  await expect(card).toContainText('Each dot is a learner')
  await expect(card).toContainText('Marks: 50%, 60%, 70%, 70% and 90%.')
  await expect(card).toContainText('Lowest topics')
  await expect(card).toContainText('Adding mixed numbers')
  await expect(card).toContainText('20%')
  await expect(card).toContainText('Adding fractions')
  await expect(card).toContainText('30%')
  await expect(card).toContainText('Adding decimals')
  await expect(card).toContainText('40%')
  await expect(card).toContainText('See each question')
  await expect(page.getByRole('link', { name: 'Snap the next test' })).toBeVisible()
  await shoot(page, 'teacher-tests')

  await card.click()
  await expect(page).toHaveURL(new RegExp(`/t/${s.classId}/tests/[0-9a-f-]{36}$`))
})

test('tests list at the marked stage counts only marked papers', async ({ page }) => {
  const s = await openSandbox(page, { stage: 'marked', role: 'teacher' })
  opened.push(s)
  await page.goto(`/t/${s.classId}/tests`)
  const card = page.getByRole('link', { name: /Class Test 1: Fractions and decimals/ })
  await expect(card).toContainText('4 of 5 papers marked')
  await expect(card).toContainText('68%')
})

test('one test: hardest questions, stats, each question row', async ({ page }) => {
  const s = await openSandbox(page, { stage: 'session_done', role: 'teacher' })
  opened.push(s)
  const testId = await testIdOf(s.classId)
  await page.goto(`/t/${s.classId}/tests/${testId}`)

  await expect(page.getByRole('heading', { level: 1, name: 'Class Test 1: Fractions and decimals' })).toBeVisible()
  await expect(page.getByText(/^\w{3} \d{1,2} \w{3} · out of 10 · 5 papers$/)).toBeVisible()
  await expect(page.getByText('Questions 1 and 4 were the hardest. Only 1 learner got each right.')).toBeVisible()
  await expect(page.getByText('68%', { exact: true })).toBeVisible()
  await expect(page.getByText('90%', { exact: true })).toBeVisible()
  await expect(page.getByText('50%', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Each question' })).toBeVisible()

  const q1 = page.getByRole('link', { name: /^Q1/ })
  await expect(q1).toContainText('1/2 + 1/4')
  await expect(q1).toContainText('Adding fractions')
  await expect(q1).toContainText('1 of 5 right')
  await expect(page.getByRole('link', { name: /^Q3/ })).toContainText('5 of 5 right')
  await expect(page.getByRole('link', { name: /^Q10/ })).toContainText('R20, spends 3/4. Left?')
  await shoot(page, 'teacher-test')

  await q1.click()
  await expect(page).toHaveURL(new RegExp(`/tests/${testId}/q/1$`))
})

test('one question: who missed it, who got it, class gap link', async ({ page }) => {
  const s = await openSandbox(page, { stage: 'session_done', role: 'teacher' })
  opened.push(s)
  const testId = await testIdOf(s.classId)
  await page.goto(`/t/${s.classId}/tests/${testId}/q/1`)

  await expect(page.getByRole('heading', { level: 1, name: 'Question 1' })).toBeVisible()
  await expect(page.getByText('Right answer 3/4 · 1 mark')).toBeVisible()
  await expect(
    page.getByText('4 of 5 missed it, and all 4 wrote 2/6. They added the tops and the bottoms.'),
  ).toBeVisible()
  const missed = page.getByRole('region', { name: 'Missed it' })
  for (const name of ['Amina', 'Naledi', 'Sipho', 'Thabo']) await expect(missed).toContainText(name)
  await expect(missed).toContainText('2/6')
  const right = page.getByRole('region', { name: 'Got it right' })
  await expect(right).toContainText('Lerato')
  await expect(right).toContainText('3/4')
  const gap = page.getByRole('link', { name: /Class gap/ })
  await expect(gap).toContainText('Adding fractions: reteach plan ready')
  await shoot(page, 'teacher-question')

  await missed.getByRole('link', { name: /Amina/ }).click()
  await expect(page).toHaveURL(new RegExp(`/t/${s.classId}/learners/[0-9a-f-]{36}/profile$`))
})

/** ISO instant for `hh:mm` SAST on the day `offset` days from today in South Africa. */
function sastAt(offset: number, hhmm: string): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg' }).format(new Date())
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + offset)
  return `${d.toISOString().slice(0, 10)}T${hhmm}:00+02:00`
}

test('notifications: grouped by day, New tags, Mark all read', async ({ page }) => {
  const s = await openSandbox(page, { stage: 'session_done', role: 'teacher' })
  opened.push(s)
  const db = admin()
  const { data: teacher, error } = await db
    .from('profiles')
    .select('user_id')
    .eq('role', 'teacher')
    .eq('school_id', (await db.from('classes').select('school_id').eq('id', s.classId).single()).data!.school_id)
    .single()
  if (error) throw new Error(error.message)
  const base = `/t/${s.classId}`
  const rows = [
    { title: 'Amina finished her lesson: 3 of 5', body: 'Adding fractions moved from New to Practising', href: `${base}/learners/${s.childId}`, created_at: sastAt(-1, '19:12'), read_at: null },
    { title: "You approved Thandi M as Amina's parent", body: "She can now see Amina's marks, gaps and your notes", href: `${base}/learners/${s.childId}/profile`, created_at: sastAt(-1, '15:02'), read_at: sastAt(-1, '15:03') },
    { title: "Sipho's paper is done", body: 'You fixed question 7 to 0,6. Class average is now 68%', href: `${base}/tests`, created_at: sastAt(-1, '14:21'), read_at: sastAt(-1, '14:22') },
    { title: 'Class Test 1 is marked', body: '5 papers. 1 answer needed you', href: `${base}/tests`, created_at: sastAt(-1, '14:12'), read_at: sastAt(-1, '14:13') },
    { title: 'Your topic map is approved', body: 'Drafted at 13:55. You approved it at 14:01', href: `${base}/curriculum`, created_at: sastAt(-1, '14:01'), read_at: sastAt(-1, '14:02') },
  ].map((r) => ({ ...r, user_id: teacher.user_id }))
  const ins = await db.from('notifications').insert(rows)
  if (ins.error) throw new Error(ins.error.message)

  await page.goto(`${base}/notifications`)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Amina did her lesson last night. Nothing else needs you.' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Last night' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: /^Yesterday, \w{3} \d{1,2} \w{3}$/ })).toBeVisible()
  const first = page.getByRole('link', { name: /Amina finished her lesson: 3 of 5/ })
  await expect(first).toContainText('Adding fractions moved from New to Practising')
  await expect(first).toContainText('19:12')
  await expect(first.getByText('New', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /Class Test 1 is marked/ })).toContainText('14:12')
  await expect(page.getByText('Jemma only sends a push when something needs you. Everything else waits here.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mark all read' })).toBeVisible()
  await shoot(page, 'teacher-notifications')

  await page.getByRole('button', { name: 'Mark all read' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Nothing needs you. You are up to date.' })).toBeVisible()
  await expect(first.getByText('New', { exact: true })).toHaveCount(0)
  const unread = await db.from('notifications').select('id').eq('user_id', teacher.user_id).is('read_at', null)
  expect(unread.data).toHaveLength(0)
})
