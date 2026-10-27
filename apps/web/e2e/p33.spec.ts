import { resolve } from 'node:path'
import { createServiceClient } from '@jemma/profiling/db'
import { expect, test, type Page } from '@playwright/test'
import { openSandbox, type OpenedSandbox } from './helpers/sandbox'

const actual = (board: string) => resolve(import.meta.dirname, `../../../design/actual/${board}.png`)

/** Design match gate for laptop boards: full page at 1440 wide. */
async function shot(page: Page, board: string) {
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: 'nextjs-portal{display:none}' })
  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  await page.setViewportSize({ width: 1440, height: Math.max(900, height) })
  await page.screenshot({ path: actual(board), fullPage: true })
}

async function noHorizontalScroll(page: Page) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(wide).toBe(false)
}

test.setTimeout(120_000)
const SLOW = { timeout: 45_000 }

let sandbox: OpenedSandbox | undefined
test.afterEach(async () => {
  await sandbox?.cleanup().catch(() => undefined)
  sandbox = undefined
})

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'laptop', 'laptop layouts only')
})

test('class home: sidebar, headline, needs you strip, gaps beside the selected gap', async ({ page }) => {
  sandbox = await openSandbox(page, { stage: 'marked', role: 'teacher' })
  await page.goto(`/t/${sandbox.classId}`)

  await expect(page.getByRole('navigation', { name: '6B Mathematics' })).toBeVisible(SLOW)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('4 of 5 learners add the tops and the bottoms when adding fractions.')
  await expect(page.getByText(/^Class · \w{3} \d+ \w{3}$/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Class report' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Snap a test' })).toBeVisible()
  await expect(page.getByText("Check 1 answer on Sipho's paper")).toBeVisible()

  const list = page.getByRole('region', { name: "What the class doesn't get yet" })
  await expect(list.getByRole('link')).toHaveText([
    /Adding fractions with different denominators/,
    /Adding decimals/,
    /Comparing fractions/,
    /Class Test 1: Fractions and decimals/,
  ])
  await expect(list.getByRole('link').first()).toHaveAttribute('aria-current', 'true')

  const detail = page.getByRole('region', { name: 'Adding fractions with different denominators' })
  await expect(detail.getByText('Gap 1 of 3')).toBeVisible()
  await expect(detail.getByRole('heading', { name: "Who's stuck" })).toBeVisible()
  await expect(detail.getByText('2/6, 3/9, 3 2/6').first()).toBeVisible()
  await expect(detail.getByRole('heading', { name: 'The mistake, seen 10 times' })).toBeVisible()
  await expect(detail.getByText('1/2 + 1/4 = 2/6')).toBeVisible()
  await expect(detail.getByRole('heading', { name: /^Reteach tomorrow/ })).toBeVisible()
  await expect(detail.getByRole('button', { name: 'Mark reteach done' })).toBeVisible()
  await expect(detail.getByRole('button', { name: 'Print' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'What Jemma did today' })).toBeVisible()
  await noHorizontalScroll(page)
  await shot(page, 'laptop-teacher-class')

  // Picking another gap swaps the panel without leaving the page.
  await page.setViewportSize({ width: 1440, height: 900 })
  await list.getByRole('link', { name: /Adding decimals/ }).click()
  await expect(page).toHaveURL(/gap=adding-decimals/)
  await expect(page.getByText('Gap 2 of 3')).toBeVisible(SLOW)
  await page.goto(`/t/${sandbox.classId}`)
  await expect(page.getByText('Gap 1 of 3')).toBeVisible(SLOW)
})

test('class home: Class report opens the report', async ({ page }) => {
  sandbox = await openSandbox(page, { stage: 'marked', role: 'teacher' })
  await page.goto(`/t/${sandbox.classId}`)
  await page.getByRole('link', { name: 'Class report' }).click(SLOW)
  await expect(page).toHaveURL(new RegExp(`/t/${sandbox.classId}/report$`))
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible(SLOW)
})

test('learners: list beside the selected learner', async ({ page }) => {
  sandbox = await openSandbox(page, { stage: 'marked', role: 'teacher' })
  // The board shows Amina already linked to Thandi M, so approve the pending link first.
  const db = createServiceClient({ SUPABASE_URL: process.env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY! })
  await db.from('parent_links').update({ status: 'approved' }).eq('child_id', sandbox.childId)
  await page.goto(`/t/${sandbox.classId}/learners`)

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Everyone is marked. 4 learners share one gap: adding fractions.', SLOW)
  await expect(page.getByText('Learners · 6B Mathematics')).toBeVisible()
  await expect(page.getByRole('link', { name: "Take today's register" })).toBeVisible()

  const list = page.getByRole('region', { name: '5 learners' })
  await expect(list.getByRole('link')).toHaveCount(5)
  await expect(list.getByRole('link').first()).toHaveAttribute('aria-current', 'true')
  await expect(list.getByText('Average · days here')).toBeVisible()

  const detail = page.getByRole('region', { name: 'Amina' })
  await expect(detail.getByText('Grade 6 · linked to Thandi')).toBeVisible()
  await expect(detail.getByRole('link', { name: 'See her paper or fix a mark' })).toBeVisible()
  await expect(detail.getByText('Same profile Thandi sees. You can fix marks.')).toBeVisible()
  await expect(detail.getByRole('heading', { name: 'Marks by topic' })).toBeVisible()
  await expect(detail.getByText('Change since Term 3')).toBeVisible()
  await expect(detail.getByRole('heading', { name: 'What Jemma has noticed' })).toBeVisible()
  await expect(detail.getByRole('heading', { name: 'Your notes' })).toBeVisible()
  await expect(detail.getByRole('link', { name: 'Add a note' })).toBeVisible()
  await expect(detail.getByRole('heading', { name: 'Attendance' })).toBeVisible()
  await expect(detail.getByText('9 of 10 days')).toBeVisible()
  await expect(detail.getByText(/^Away on \w{3} \d+ \w{3}\. Today's register is next\.$/)).toBeVisible()
  await expect(detail.getByRole('heading', { name: "Tonight's lesson" })).toBeVisible()
  await expect(detail.getByText('Stage: new')).toBeVisible()
  await noHorizontalScroll(page)
  await shot(page, 'laptop-teacher-learners')

  await page.setViewportSize({ width: 1440, height: 900 })
  await list.getByRole('link', { name: /Naledi/ }).click()
  await expect(page).toHaveURL(/child=/)
  await expect(page.getByRole('region', { name: 'Naledi' }).getByText('Grade 6')).toBeVisible(SLOW)
})

test('class report: stats, topics on the map, learners table', async ({ page }) => {
  sandbox = await openSandbox(page, { stage: 'marked', role: 'teacher' })
  await page.goto(`/t/${sandbox.classId}/report`)

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^6B averages \d+%\. Adding is the one thing to reteach before term ends\.$/, SLOW)
  await expect(page.getByText(/^Term 4 report · 6B Mathematics · updated /)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Download PDF' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export marks (CSV)' })).toBeVisible()
  await expect(page.getByRole('link', { name: /\d+%\s*Class average/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /46 of 50\s*Days at school/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Lessons done at home/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Topics on your map' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open the map' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Class right, Class Test 1' })).toBeVisible()
  await expect(page.getByRole('rowheader', { name: 'Comparing fractions' })).toBeVisible()
  await expect(page.getByText('Not tested yet').first()).toBeVisible()
  await expect(page.getByText('Reteach', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Learners', level: 2 })).toBeVisible()
  await expect(page.getByRole('rowheader', { name: 'Amina' })).toBeVisible()
  await expect(page.getByText("Stage is for each learner's top gap. Notes are the ones you wrote this term.")).toBeVisible()
  await expect(page.getByText('Made by Jemma from Class Test 1, the register and your notes. Every number links to its source.')).toBeVisible()
  await noHorizontalScroll(page)
  await shot(page, 'laptop-teacher-report')
})

test('class report on the session_done stage: Amina did a lesson', async ({ page }) => {
  sandbox = await openSandbox(page, { stage: 'session_done', role: 'teacher' })
  await page.goto(`/t/${sandbox.classId}/report`)
  await expect(page.getByRole('link', { name: /1 learner\s*Lessons done at home\s*Amina, .* 3 of 5/ })).toBeVisible(SLOW)
  await expect(page.getByRole('row', { name: /Amina/ })).toContainText('Practising')
})

for (const width of [1024, 1280, 1440]) {
  test(`no horizontal scroll at ${width}`, async ({ page }) => {
    sandbox = await openSandbox(page, { stage: 'marked', role: 'teacher' })
    await page.setViewportSize({ width, height: 900 })
    for (const path of ['', '/learners', '/report']) {
      await page.goto(`/t/${sandbox.classId}${path}`)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible(SLOW)
      await noHorizontalScroll(page)
    }
  })
}
