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

async function shot(page: Page, testInfo: TestInfo, board: string) {
  if (testInfo.project.name !== 'laptop') return
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: 'nextjs-portal{display:none}' })
  await page.screenshot({ path: actual(board), fullPage: true })
}

async function noHorizontalScroll(page: Page) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(wide).toBe(false)
}

/** 1024 and 1280 wide: nothing scrolls sideways. The page is put back to the project's own size afterwards. */
async function widths(page: Page, testInfo: TestInfo) {
  if (testInfo.project.name !== 'laptop') return
  for (const width of [1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await noHorizontalScroll(page)
  }
}

test.setTimeout(120_000)
const SLOW = { timeout: 45_000 }

let box: OpenedSandbox | null = null
test.afterEach(async () => {
  await box?.cleanup().catch(() => undefined)
  box = null
})

async function testPaperId(childId: string) {
  const { data, error } = await admin().from('papers').select('id').eq('child_id', childId).eq('kind', 'test').not('test_id', 'is', null).single()
  if (error) throw error
  return data.id
}

test('laptop-parent-profile: two columns with notes, attendance and activities', async ({ page }, testInfo) => {
  box = await openSandbox(page, { stage: 'marked', role: 'parent' })
  await page.goto(`/p/${box.childId}`)
  const laptop = testInfo.project.name === 'laptop'

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Amina is doing well. One thing to work on this week: adding fractions.', SLOW)
  if (!laptop) {
    // The phone keeps its own layout: Beyond the tests card, no laptop-only sections.
    await expect(page.getByRole('link', { name: /Beyond the tests/ })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Attendance' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /^Tonight: \d+ min on/ })).toHaveCount(0)
    await noHorizontalScroll(page)
    return
  }

  await expect(page.getByText(/^Profile · \w{3} \d+ \w{3}$/)).toBeVisible()
  await expect(page.getByRole('link', { name: /^Tonight: \d+ min on adding fractions$/ })).toHaveAttribute('href', `/p/${box.childId}/learn`)
  const needs = page.getByRole('region', { name: 'Needs you' })
  await expect(needs.getByText('Check the homework you snapped')).toBeVisible()
  await expect(needs.getByText("Sunday · 5 answers, 1 I'm unsure about")).toBeVisible()
  await expect(needs.getByText('Check', { exact: true })).toBeVisible()

  const marks = page.getByRole('region', { name: 'Marks by topic' })
  await expect(marks.getByText('Maths · change since Term 3')).toBeVisible()
  await expect(marks.getByRole('link', { name: 'See all tests and topics' })).toHaveAttribute('href', `/p/${box.childId}/tests`)
  const next = page.getByRole('region', { name: 'What to focus on next, and why' })
  await expect(next.getByText('Make the bottoms match, then add')).toBeVisible()

  const notes = page.getByRole('region', { name: 'Notes from Ms Banda' })
  await expect(notes.getByText(/^(Today|\w{3} \d+ \w{3}) · \w+$/).first()).toBeVisible()
  await expect(notes.getByRole('link', { name: 'All notes' })).toHaveAttribute('href', `/p/${box.childId}/beyond`)
  const att = page.getByRole('region', { name: 'Attendance' })
  await expect(att.getByText('9 of 10 days')).toBeVisible()
  await expect(att.getByText(/^Term \d so far\. Away on \w{3} \d+ \w{3}\.$/)).toBeVisible()
  const acts = page.getByRole('region', { name: 'Activities' })
  await expect(acts.getByText('Netball')).toBeVisible()
  await expect(acts.getByText('School choir')).toBeVisible()
  await expect(acts.getByRole('link', { name: 'Add' })).toHaveAttribute('href', `/p/${box.childId}/activities/new`)
  await expect(page.getByRole('link', { name: /Beyond the tests/ })).toHaveCount(0)

  // Two columns: the focus card sits to the right of the marks card.
  const m = await marks.boundingBox()
  const f = await next.boundingBox()
  expect(f!.x).toBeGreaterThan(m!.x + m!.width - 1)

  await shot(page, testInfo, 'laptop-parent-profile')
  await widths(page, testInfo)
})

test('laptop-parent-learn: tonight beside this week and what helps', async ({ page }, testInfo) => {
  box = await openSandbox(page, { stage: 'marked', role: 'parent' })
  await page.goto(`/p/${box.childId}/learn`)
  const laptop = testInfo.project.name === 'laptop'

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Tonight: \d+ minutes on adding fractions, with fraction bars\.$/, SLOW)
  if (!laptop) {
    await expect(page.getByRole('link', { name: /Start, then hand Amina the phone/ })).toBeVisible()
    await expect(page.getByRole('list', { name: 'How the lesson goes' })).toHaveCount(0)
    await noHorizontalScroll(page)
    return
  }

  await expect(page.getByText('Learn · Amina')).toBeVisible()
  const tonight = page.getByRole('region', { name: 'Adding fractions with different denominators' })
  await expect(tonight.getByText('Diagram', { exact: true })).toBeVisible()
  await expect(tonight.getByText('5 questions').first()).toBeVisible()
  await expect(tonight.getByText('Why tonight:')).toBeVisible()
  await expect(tonight.getByRole('link', { name: /^Class Test 1, questions 1, 2 and 4$/ })).toBeVisible()
  const steps = page.getByRole('list', { name: 'How the lesson goes' })
  await expect(steps).toContainText('Step 1')
  await expect(steps).toContainText('Results')
  await expect(tonight.getByText('Amina sees how she did at the end, never a score. You see everything.')).toBeVisible()
  await expect(tonight.getByRole('link', { name: 'Start, then hand the phone to Amina' })).toHaveAttribute('href', `/p/${box.childId}/learn/handover`)

  const week = page.getByRole('region', { name: 'This week' })
  await expect(week.getByText('Tonight', { exact: true })).toBeVisible()
  await expect(week.getByText('Rest days in between. Jemma moves things if a new test comes in.')).toBeVisible()
  const helps = page.getByRole('region', { name: 'What helps Amina' })
  await expect(helps.getByText('Measured per topic, never a label. Jemma keeps trying all three, so this can change.')).toBeVisible()
  await expect(helps.getByText('Too early to tell').first()).toBeVisible()

  const t = await tonight.boundingBox()
  const w = await week.boundingBox()
  expect(w!.x).toBeGreaterThan(t!.x + t!.width - 1)

  await shot(page, testInfo, 'laptop-parent-learn')
  await widths(page, testInfo)
})

test('laptop-parent-tests: list, marked paper and missed questions side by side', async ({ page }, testInfo) => {
  box = await openSandbox(page, { stage: 'marked', role: 'parent' })
  await page.goto(`/p/${box.childId}/tests`)
  const laptop = testInfo.project.name === 'laptop'

  if (!laptop) {
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^(Steady at|Up to|Down to) \d+%\. Adding is where Amina loses marks\.$/, SLOW)
    await expect(page.getByText('Got a new test or homework?')).toBeVisible()
    await expect(page.getByRole('region', { name: "Amina's marked paper" })).toHaveCount(0)
    await noHorizontalScroll(page)
    return
  }

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('6 out of 10 on Class Test 1. Every mark she lost was on adding.', SLOW)
  await expect(page.getByText('Tests · Amina')).toBeVisible()
  const list = page.getByRole('region', { name: "Amina's tests" })
  await expect(list.getByText('Needs you')).toBeVisible()
  await expect(list.getByText("Waiting for your check · 1 answer I'm unsure about")).toBeVisible()
  await expect(list.getByRole('heading', { name: 'Term 4' })).toBeVisible()
  await expect(list.getByRole('link', { name: /^6\/10 Class Test 1 \w{3} \d+ \w{3} · marked by Jemma$/ })).toHaveAttribute('aria-current', 'true')
  await expect(list.getByRole('link', { name: /^\d\/\d Homework: Adding decimals/ })).toBeVisible()
  await expect(list.getByRole('link', { name: 'Snap a test' })).toHaveAttribute('href', `/p/${box.childId}/snap`)

  const paper = page.getByRole('region', { name: "Amina's marked paper" })
  await expect(paper.getByText('Section A: Fractions')).toBeVisible()
  await expect(paper.getByText('Section B: Decimals')).toBeVisible()
  await expect(paper.getByText(/Ms Banda snapped Amina's paper at \d\d:\d\d\. Jemma marked it against her memo at \d\d:\d\d\. Coral marks are the ones Amina missed\./)).toBeVisible()
  const missed = page.getByRole('region', { name: 'The 4 she missed' })
  await expect(missed.getByText('Wrote 0,30, right is 0,75')).toBeVisible()
  await expect(missed.getByText('One slip behind all 4: she adds the tops and the bottoms, and lines up the last digits in decimals.')).toBeVisible()
  await expect(missed.getByText('Adding fractions: how to help')).toBeVisible()
  await expect(missed.getByRole('link', { name: 'Think a mark is wrong?' })).toBeVisible()

  const l = await list.boundingBox()
  const p = await paper.boundingBox()
  const m = await missed.boundingBox()
  expect(p!.x).toBeGreaterThan(l!.x + l!.width - 1)
  expect(m!.x).toBeGreaterThan(p!.x + p!.width - 1)

  await shot(page, testInfo, 'laptop-parent-tests')
  await widths(page, testInfo)

  // The same layout opens from a list row, with the question highlighted from a topic link.
  await page.setViewportSize({ width: 1440, height: 900 })
  const paperId = await testPaperId(box.childId)
  await page.goto(`/p/${box.childId}/papers/${paperId}?q=4`)
  await expect(page.getByRole('region', { name: "Amina's tests" })).toBeVisible(SLOW)
  await expect(page.getByRole('region', { name: "Amina's marked paper" }).locator('[data-q="4"][data-highlight="true"]')).toBeVisible()
  await widths(page, testInfo)
})
