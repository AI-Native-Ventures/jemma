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
const soft = expect.configure({ timeout: 30_000 })

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

  await soft(
    page.getByRole('heading', { level: 1, name: 'Class Test 1 averaged 68%. Adding fractions pulled it down.' }),
  ).toBeVisible()
  await soft(page.getByRole('heading', { level: 2, name: 'Term 4' })).toBeVisible()
  const card = page.getByRole('link', { name: /Class Test 1: Fractions and decimals/ })
  await soft(card).toContainText('5 of 5 papers marked')
  await soft(card).toContainText('68%')
  await soft(card).toContainText('average')
  await soft(card).toContainText('Each dot is a learner')
  await soft(card).toContainText('Marks: 50%, 60%, 70%, 70% and 90%.')
  await soft(card).toContainText('Lowest topics')
  await soft(card).toContainText('Adding mixed numbers')
  await soft(card).toContainText('20%')
  await soft(card).toContainText('Adding fractions')
  await soft(card).toContainText('30%')
  await soft(card).toContainText('Adding decimals')
  await soft(card).toContainText('40%')
  await soft(card).toContainText('See each question')
  await soft(page.getByRole('link', { name: 'Snap the next test' })).toBeVisible()
  await shoot(page, 'teacher-tests')

  await card.click()
  await soft(page).toHaveURL(new RegExp(`/t/${s.classId}/tests/[0-9a-f-]{36}$`))
})

test('tests list at the marked stage counts only marked papers', async ({ page }) => {
  const s = await openSandbox(page, { stage: 'marked', role: 'teacher' })
  opened.push(s)
  await page.goto(`/t/${s.classId}/tests`)
  const card = page.getByRole('link', { name: /Class Test 1: Fractions and decimals/ })
  await soft(card).toContainText('4 of 5 papers marked')
  await soft(card).toContainText('68%')
})

test('one test: hardest questions, stats, each question row', async ({ page }) => {
  const s = await openSandbox(page, { stage: 'session_done', role: 'teacher' })
  opened.push(s)
  const testId = await testIdOf(s.classId)
  await page.goto(`/t/${s.classId}/tests/${testId}`)

  await soft(page.getByRole('heading', { level: 1, name: 'Class Test 1: Fractions and decimals' })).toBeVisible()
  await soft(page.getByText(/^\w{3} \d{1,2} \w{3} · out of 10 · 5 papers$/)).toBeVisible()
  await soft(page.getByText('Questions 1 and 4 were the hardest. Only 1 learner got each right.')).toBeVisible()
  await soft(page.getByText('68%', { exact: true })).toBeVisible()
  await soft(page.getByText('90%', { exact: true })).toBeVisible()
  await soft(page.getByText('50%', { exact: true })).toBeVisible()
  await soft(page.getByRole('heading', { level: 2, name: 'Each question' })).toBeVisible()

  const q1 = page.getByRole('link', { name: /^Q1 / })
  await soft(q1).toContainText('1/2 + 1/4')
  await soft(q1).toContainText('Adding fractions')
  await soft(q1).toContainText('1 of 5 right')
  await soft(page.getByRole('link', { name: /^Q3/ })).toContainText('5 of 5 right')
  await soft(page.getByRole('link', { name: /^Q10/ })).toContainText('R20, spends 3/4. Left?')
  await shoot(page, 'teacher-test')

  await q1.click()
  await soft(page).toHaveURL(new RegExp(`/tests/${testId}/q/1$`))
})

test('one question: who missed it, who got it, class gap link', async ({ page }) => {
  const s = await openSandbox(page, { stage: 'session_done', role: 'teacher' })
  opened.push(s)
  const testId = await testIdOf(s.classId)
  await page.goto(`/t/${s.classId}/tests/${testId}/q/1`)

  await soft(page.getByRole('heading', { level: 1, name: 'Question 1' })).toBeVisible()
  await soft(page.getByText('Right answer 3/4 · 1 mark')).toBeVisible()
  await soft(
    page.getByText('4 of 5 missed it, and all 4 wrote 2/6. They added the tops and the bottoms.'),
  ).toBeVisible()
  const missed = page.getByRole('region', { name: 'Missed it' })
  for (const name of ['Amina', 'Naledi', 'Sipho', 'Thabo']) await soft(missed).toContainText(name)
  await soft(missed).toContainText('2/6')
  const right = page.getByRole('region', { name: 'Got it right' })
  await soft(right).toContainText('Lerato')
  await soft(right).toContainText('3/4')
  const gap = page.getByRole('link', { name: /Class gap/ })
  await soft(gap).toContainText('Adding fractions: reteach plan ready')
  await shoot(page, 'teacher-question')

  await missed.getByRole('link', { name: /Amina/ }).click()
  await soft(page).toHaveURL(new RegExp(`/t/${s.classId}/learners/[0-9a-f-]{36}/profile$`))
})

test('notifications: seeded list, New tag, Mark all read', async ({ page }) => {
  const s = await openSandbox(page, { stage: 'session_done', role: 'teacher' })
  opened.push(s)
  const base = `/t/${s.classId}`
  await page.goto(`${base}/notifications`)

  await soft(
    page.getByRole('heading', { level: 1, name: 'Amina did her lesson today. Nothing else needs you.' }),
  ).toBeVisible()
  await soft(page.getByRole('heading', { level: 2, name: 'Today' })).toBeVisible()
  const first = page.getByRole('link', { name: /Amina finished her lesson: 3 of 5/ })
  await soft(first).toContainText('Adding fractions moved from New to Practising')
  await soft(first).toContainText(/\d{2}:\d{2}/)
  await soft(first.getByText('New', { exact: true })).toBeVisible()
  await soft(page.getByRole('link', { name: /Class Test 1 is marked/ })).toContainText('5 papers. 1 answer needed you')
  await soft(page.getByRole('link', { name: /Your topic map is approved/ })).toContainText('Drafted at 13:55')
  await soft(page.getByText('Jemma only sends a push when something needs you. Everything else waits here.')).toBeVisible()
  await shoot(page, 'teacher-notifications')

  await page.getByRole('button', { name: 'Mark all read' }).click()
  await soft(page.getByRole('heading', { level: 1, name: 'Nothing needs you. You are up to date.' })).toBeVisible()
  await soft(first.getByText('New', { exact: true })).toHaveCount(0)
})
