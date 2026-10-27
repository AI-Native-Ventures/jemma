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

/** Design match gate: boards are phone-size, so screenshots are saved from the phone project only. */
async function shot(page: Page, testInfo: TestInfo, board: string, height?: number) {
  if (testInfo.project.name !== 'phone') return
  if (height) await page.setViewportSize({ width: 390, height })
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: 'nextjs-portal{display:none}' })
  await page.screenshot({ path: actual(board), fullPage: true })
}

async function noHorizontalScroll(page: Page) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(wide).toBe(false)
}

let box: OpenedSandbox | null = null
test.afterEach(async () => {
  await box?.cleanup().catch(() => undefined)
  box = null
})

async function tonightSessionId(childId: string): Promise<string> {
  const { data, error } = await admin()
    .from('sessions')
    .select('id')
    .eq('child_id', childId)
    .not('lesson_id', 'is', null)
    .single()
  if (error) throw error
  return data.id
}

test.describe('parent-learn (stage marked)', () => {
  test('shows tonight, the week and what helps', async ({ page }, testInfo) => {
    box = await openSandbox(page, { stage: 'marked', role: 'parent' })
    await page.goto(`/p/${box.childId}/learn`)

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tonight: 12 minutes on adding fractions, with fraction bars.')
    await expect(page.getByRole('heading', { name: 'Adding fractions with different denominators' })).toBeVisible()
    await expect(page.getByText('12 minutes', { exact: true })).toBeVisible()
    await expect(page.getByText('5 questions', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Class Test 1, questions 1, 2 and 4')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Start, then hand Amina the phone' })).toBeVisible()
    await expect(page.getByText('Amina sees how she did at the end, never a score. You see everything.')).toBeVisible()

    const week = page.getByRole('region', { name: 'This week' })
    await expect(week.getByText('Adding fractions', { exact: true })).toHaveCount(1)
    await expect(week.getByText('Adding decimals', { exact: true })).toHaveCount(2)
    await expect(week.getByText('Adding fractions, quick check')).toBeVisible()
    await expect(week.getByText('Tonight', { exact: true })).toBeVisible()
    await expect(week.getByText('Reading cards · 10 min')).toBeVisible()
    await expect(week.getByText('5 questions · 6 min')).toBeVisible()
    await expect(week.getByText('Audio memo · 10 min')).toBeVisible()

    const helps = page.getByRole('region', { name: 'What helps Amina' })
    await expect(helps.getByText('On fraction topics so far, average out of 5')).toBeVisible()
    await expect(helps.getByText('4,2')).toBeVisible()
    await expect(helps.getByText('· 5 sessions')).toBeVisible()
    await expect(helps.getByText('3,0')).toBeVisible()
    await expect(helps.getByText('· 3 sessions')).toBeVisible()
    await expect(helps.getByText('Too early to tell · 1 session')).toBeVisible()
    await expect(helps.getByText('Measured per topic, never a label. Jemma keeps trying all three, so this can change.')).toBeVisible()

    await noHorizontalScroll(page)
    await shot(page, testInfo, 'parent-learn', 1328)
  })
})

test.describe('parent-handover (stage marked)', () => {
  test('hand over opens the child session on this device', async ({ page, context }, testInfo) => {
    box = await openSandbox(page, { stage: 'marked', role: 'parent' })
    await page.goto(`/p/${box.childId}/learn`)
    await page.getByRole('link', { name: 'Start, then hand Amina the phone' }).click()
    await page.waitForURL(`**/p/${box.childId}/learn/handover`)

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pass the phone to Amina.')
    await expect(page.getByText('Her lesson takes about 12 minutes. She sees how she did at the end, never a score.')).toBeVisible()
    await expect(page.getByText('Adding fractions with fraction bars')).toBeVisible()
    await expect(page.getByText('Diagram · 12 minutes · 5 questions')).toBeVisible()
    await expect(page.getByText("When she's done she passes it back, and you see how it went.")).toBeVisible()
    await expect(page.getByRole('link', { name: 'Not now' })).toHaveAttribute('href', `/p/${box.childId}/learn`)
    await noHorizontalScroll(page)
    await shot(page, testInfo, 'parent-handover', 844)

    const sessionId = await tonightSessionId(box.childId)
    const opened = page.waitForRequest((r) => new URL(r.url()).pathname === `/k/session/${sessionId}`)
    await page.getByRole('button', { name: 'Amina has the phone' }).click()
    await opened
    // The parent's device stays on the child's session (proxy and learner layout honour the hand-over cookie).
    await page.waitForURL(`**/k/session/${sessionId}`)
    await expect(page.getByText('Warm-up').first()).toBeVisible()

    const cookie = (await context.cookies()).find((c) => c.name === 'jemma_handover')
    expect(cookie?.httpOnly).toBe(true)
    const { data } = await admin().from('sessions').select('status').eq('id', sessionId).single()
    expect(data?.status).toBe('in_progress')
  })
})

test.describe('parent-session (stage session_done)', () => {
  test('shows the finished session', async ({ page }, testInfo) => {
    box = await openSandbox(page, { stage: 'session_done', role: 'parent' })
    const sessionId = await tonightSessionId(box.childId)
    await page.goto(`/p/${box.childId}/sessions/${sessionId}`)

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Amina got halves and quarters. Sixths and eighths still trip her up.')
    await expect(page.getByText("Tonight's session")).toBeVisible()
    await expect(page.getByText(/^Amina · \w{3} \d{1,2} \w{3}, \d{2}:\d{2}$/)).toBeVisible()
    await expect(page.getByText('3 of 5')).toBeVisible()
    await expect(page.getByText('12 min', { exact: true })).toBeVisible()
    await expect(page.getByText('Diagram', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Adding fractions moved a stage' })).toBeVisible()
    await expect(page.getByText('Practising', { exact: true })).toBeVisible()
    const { data: later } = await admin().from('sessions').select('planned_for').eq('child_id', box.childId).eq('status', 'planned').eq('planned_minutes', 6).single()
    const day = new Date(`${later!.planned_for}T00:00:00Z`)
    const long = day.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })
    await expect(page.getByText(`It counts as fixed after she gets 4 or 5 right on a later check. Next check: ${long}.`)).toBeVisible()
    await expect(page.getByText('Warm-up: 2 of 2')).toBeVisible()

    const rows = page.getByRole('region', { name: 'Each question' }).getByRole('listitem')
    await expect(rows).toHaveCount(5)
    await expect(rows.nth(0)).toContainText('1/2 + 1/4')
    await expect(rows.nth(0)).toContainText('Wrote 3/4 · 1:40')
    await expect(rows.nth(1)).toContainText('Wrote 3/9, right is 5/6 · 2:10')
    await expect(rows.nth(2)).toContainText('Made easier after the miss')
    await expect(rows.nth(4)).toContainText('Wrote 4/12, right is 7/8 · 2:30')
    await expect(rows.nth(4)).toContainText('Made harder after 2 right')
    await expect(rows.nth(1).getByRole('img', { name: 'Missed' })).toBeVisible()
    await expect(rows.nth(0).getByRole('img', { name: 'Right' })).toBeVisible()

    await expect(page.getByText('5 questions with sixths and eighths')).toBeVisible()
    await expect(page.getByText(/^\w{3} \d{1,2} \w{3} · quick check$/)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Done' })).toHaveAttribute('href', `/p/${box.childId}`)
    await noHorizontalScroll(page)
    await shot(page, testInfo, 'parent-session', 1100)
  })
})
