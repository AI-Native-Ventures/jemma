import { resolve } from 'node:path'
import { createServiceClient } from '@jemma/profiling/db'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { openSandbox, type OpenedSandbox } from './helpers/sandbox'

const admin = () =>
  createServiceClient({
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  })

const actual = (board: string) => resolve(import.meta.dirname, `../../../design/actual/${board}.png`)

/** Design match gate: boards are phone-size, so screenshots come from the phone project only. */
async function shot(page: Page, testInfo: TestInfo, board: string) {
  if (testInfo.project.name !== 'phone') return
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: 'nextjs-portal{display:none}' })
  // Grow the viewport to the page so sticky bars sit at the bottom, as on the board.
  // The flag sheet is a fixed 844 high overlay, so it keeps the phone viewport.
  const height = board === 'parent-flag-mark' ? 844 : await page.evaluate(() => document.documentElement.scrollHeight)
  await page.setViewportSize({ width: 390, height: Math.max(844, height) })
  await page.screenshot({ path: actual(board), fullPage: true })
}

async function noHorizontalScroll(page: Page) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(wide).toBe(false)
}

// Dev-mode first hits compile routes and server actions, which is slow on a busy machine.
test.setTimeout(120_000)
const SLOW = { timeout: 45_000 }

let sandbox: OpenedSandbox | undefined
test.afterEach(async () => {
  await sandbox?.cleanup().catch(() => undefined)
  sandbox = undefined
})

async function gapId(childId: string, topic: string) {
  const { data, error } = await admin().from('gaps').select('id').eq('child_id', childId).eq('topic_name', topic).single()
  if (error) throw error
  return data.id
}

async function aminaPaper(childId: string) {
  const { data, error } = await admin().from('papers').select('id').eq('child_id', childId).eq('kind', 'test').not('test_id', 'is', null).single()
  if (error) throw error
  return data.id
}

test('topic: slip, missed questions as crops, format trials, opens the marked paper', async ({ page }, testInfo) => {
  sandbox = await openSandbox(page, { stage: 'marked', role: 'parent' })
  const id = await gapId(sandbox.childId, 'Adding fractions with different denominators')
  await page.goto(`/p/${sandbox.childId}/topics/${id}`)

  await expect(page.getByRole('heading', { name: 'Adding fractions with different denominators', level: 1 })).toBeVisible()
  await expect(page.getByText('New gap')).toBeVisible()
  await expect(page.getByText('Amina adds the tops and the bottoms. She did it in all 3 questions that needed it.')).toBeVisible()
  await expect(page.getByText('The questions she missed')).toBeVisible()
  await expect(page.getByText('Wrote 2/6. Right answer 3/4.')).toBeVisible()
  await expect(page.getByText('Wrote 3/9. Right answer 5/6.')).toBeVisible()
  await expect(page.getByText('Wrote 3 2/6. Right answer 3 3/4.')).toBeVisible()
  await expect(page.getByText('Jemma tries each format 3 times on this topic before saying what helps Amina.')).toBeVisible()
  await expect(page.getByText('Too early to tell')).toBeVisible()
  await expect(page.getByText('0 of 3 done')).toHaveCount(3)
  await expect(page.getByText('None done yet. The first one is ready.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Practise it now' })).toBeVisible()
  await noHorizontalScroll(page)
  await shot(page, testInfo, 'parent-topic')

  await page.getByRole('link', { name: 'Question 4: open the marked paper' }).click()
  await expect(page).toHaveURL(/\/papers\/[^/]+\?q=4/, SLOW)
  await expect(page.locator('[data-q="4"][data-highlight="true"]')).toBeVisible(SLOW)
})

test('paper: marked sheet, missed list, flag a mark queues a check for the teacher', async ({ page }, testInfo) => {
  sandbox = await openSandbox(page, { stage: 'marked', role: 'parent' })
  const paperId = await aminaPaper(sandbox.childId)
  await page.goto(`/p/${sandbox.childId}/papers/${paperId}`)

  await expect(page.getByText(/^\w{3} \d+ \w{3} · marked by Jemma at \d\d:\d\d$/)).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('6 out of 10. Every mark she lost was on adding.')
  await expect(page.getByText('Section A: Fractions')).toBeVisible()
  await expect(page.getByText('Section B: Decimals')).toBeVisible()
  await expect(page.getByText(/Ms Banda snapped Amina's paper at \d\d:\d\d\. Jemma marked it against her memo\. Coral marks are the ones Amina missed\./)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Think a mark is wrong? Tell Ms Banda' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'The 4 she missed' })).toBeVisible()
  await expect(page.getByText('Wrote 0,30, right is 0,75')).toBeVisible()
  await expect(page.getByText('One slip behind all 4: she adds the tops and the bottoms, and lines up the last digits in decimals.')).toBeVisible()
  await expect(page.getByText('Adding fractions: how to help')).toBeVisible()
  await noHorizontalScroll(page)
  await shot(page, testInfo, 'parent-paper')

  // Flag Q4 (the board's example).
  const { data: q4 } = await admin().from('question_results').select('id').eq('paper_id', paperId).eq('n', 4).single()
  await page.goto(`/p/${sandbox.childId}/papers/${paperId}/flag?q=${q4!.id}`)
  await expect(page.getByRole('heading', { name: 'Question 4 · 1 1/2 + 2 1/4' })).toBeVisible()
  await expect(page.getByText('Jemma marked it wrong. Right answer 3 3/4.')).toBeVisible()
  await expect(page.getByText("Ms Banda decides. If she changes it, you'll see the new mark and her name.")).toBeVisible()
  await shot(page, testInfo, 'parent-flag-mark')

  await page.getByLabel('Think this mark is wrong? Tell Ms Banda what you see').fill('The photo cuts off her answer')
  await page.getByRole('button', { name: 'Send to Ms Banda' }).click()
  await expect(page).toHaveURL(new RegExp(`/papers/${paperId}\\?flagged=1`), SLOW)
  const { data: items } = await admin().from('needs_you_items').select('kind, status, detail, ref_id').eq('school_id', (await schoolOf(sandbox.childId))).eq('kind', 'check_answer').eq('child_id', sandbox.childId)
  expect(items).toHaveLength(1)
  expect(items![0]!.detail).toContain('The photo cuts off her answer')
  expect(items![0]!.ref_id).toBe(paperId)
})

async function schoolOf(childId: string) {
  const { data, error } = await admin().from('children').select('school_id').eq('id', childId).single()
  if (error) throw error
  return data.school_id
}

test('tests: headline, needs you, terms', async ({ page }, testInfo) => {
  sandbox = await openSandbox(page, { stage: 'marked', role: 'parent' })
  await page.goto(`/p/${sandbox.childId}/tests`)

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^(Steady at|Up to|Down to) \d+%\. Adding is where Amina loses marks\.$/)
  await expect(page.getByText('Check the homework you snapped')).toBeVisible()
  await expect(page.getByText("Sunday · 5 answers, 1 I'm unsure about")).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Term 4' })).toBeVisible()
  await expect(page.getByText('Class Test 1: Fractions and decimals')).toBeVisible()
  await expect(page.getByText('Missed questions 1, 2, 4 and 8')).toBeVisible()
  await expect(page.getByText('Waiting for your check')).toBeVisible()
  await expect(page.getByText('Got a new test or homework?')).toBeVisible()
  await expect(page.getByText("Snap it. Jemma reads it and updates Amina's gaps.")).toBeVisible()
  await noHorizontalScroll(page)
  await shot(page, testInfo, 'parent-tests')

  await page.getByRole('link', { name: /Class Test 1: Fractions and decimals/ }).click()
  await expect(page).toHaveURL(/\/papers\//, SLOW)
})

test('notifications: grouped, new item, mark all read', async ({ page }, testInfo) => {
  sandbox = await openSandbox(page, { stage: 'session_done', role: 'parent' })
  const db = admin()
  const { data: link } = await db.from('parent_links').select('parent_id').eq('child_id', sandbox.childId).single()
  const base = `/p/${sandbox.childId}`
  const at = (h: number, m: number, daysAgo = 0) => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - daysAgo)
    d.setUTCHours(h - 2, m, 0, 0) // Africa/Johannesburg is UTC+2
    return d.toISOString()
  }
  const now = new Date()
  const mk = (title: string, body: string, href: string, created_at: string, read: boolean) => ({
    user_id: link!.parent_id, title, body, href, created_at, read_at: read ? created_at : null,
  })
  // Keep every row in the past so "today" groups are stable whatever time the test runs.
  const early = new Date(now.getTime() - 3 * 3600_000)
  const rows = [
    mk('Amina finished her lesson: 3 of 5', 'Adding fractions is now Practising. Next check is Thursday', `${base}/sessions/x`, now.toISOString(), false),
    mk('Class Test 1 is marked: 6 out of 10', 'See her paper and the 4 questions she missed', `${base}/tests`, early.toISOString(), true),
    mk("Check Amina's homework", 'I read 5 answers. One is faint. Can you check it?', `${base}/snap/x`, at(18, 40, 3), true),
  ]
  await db.from('notifications').insert(rows)
  await page.goto(`${base}/notifications`)

  await expect(page.getByRole('heading', { level: 1 })).toHaveText("Amina finished tonight's lesson. Have a look together.")
  await expect(page.getByText('Amina finished her lesson: 3 of 5')).toBeVisible()
  await expect(page.getByText('New', { exact: true })).toHaveCount(1)
  await expect(page.getByText('Class Test 1 is marked: 6 out of 10')).toBeVisible()
  await expect(page.getByText("Check Amina's homework")).toBeVisible()
  await expect(page.getByText('You hear from Jemma when a lesson is ready and when Amina finishes one. Change this in Amina\'s settings.')).toBeVisible()
  await noHorizontalScroll(page)
  await shot(page, testInfo, 'parent-notifications')

  await page.getByRole('button', { name: 'Mark all read' }).click()
  await expect(page.getByText('New', { exact: true })).toHaveCount(0, SLOW)
})
