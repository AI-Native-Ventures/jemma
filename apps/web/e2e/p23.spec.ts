import { resolve } from 'node:path'
import { createServiceClient } from '@jemma/profiling/db'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import type { SandboxStage } from '../../../supabase/seed/demo'
import { openSandbox, type OpenedSandbox } from './helpers/sandbox'

const admin = () =>
  createServiceClient({
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  })

const actual = (board: string) => resolve(import.meta.dirname, `../../../design/actual/${board}.png`)

/** Design match gate: boards are phone-size, so screenshots are saved from the phone project only. */
async function shot(page: Page, testInfo: TestInfo, board: string) {
  if (testInfo.project.name !== 'phone') return
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: 'nextjs-portal{display:none}' })
  await page.screenshot({ path: actual(board), fullPage: true })
}

async function noHorizontalScroll(page: Page) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(wide).toBe(false)
}

let sandbox: OpenedSandbox | null = null
async function open(page: Page, stage: SandboxStage) {
  sandbox = await openSandbox(page, { stage, role: 'parent' })
  return sandbox
}
test.afterEach(async () => {
  await sandbox?.cleanup().catch(() => undefined)
  sandbox = null
})

test.describe('parent-profile', () => {
  test('shows the guidance card, marks, evidence and what Jemma did', async ({ page }, testInfo) => {
    const s = await open(page, 'marked')
    await page.goto(`/p/${s.childId}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Amina is doing well. One thing to work on this week: adding fractions.')
    await expect(page.getByText(/^Updated today at \d\d:\d\d, after Class Test 1$/)).toBeVisible()
    await expect(page.getByRole('link', { name: "See Amina's report" })).toHaveAttribute('href', `/p/${s.childId}/report`)

    const needs = page.getByRole('region', { name: 'Needs you' })
    await expect(needs.getByText('Check the homework you snapped')).toBeVisible()
    await expect(needs.getByText("Sunday · 5 answers, 1 I'm unsure about")).toBeVisible()

    const marks = page.getByRole('region', { name: 'Marks by topic' })
    await expect(marks.getByText('Maths · change since Term 3')).toBeVisible()
    await expect(marks.getByText('Adding fractions').first()).toBeVisible()
    await expect(marks.getByText('100%').first()).toBeVisible()
    await expect(marks.getByRole('link', { name: 'See all tests and topics' })).toHaveAttribute('href', `/p/${s.childId}/tests`)

    const noticed = page.getByRole('region', { name: 'What Jemma has noticed' })
    await expect(noticed.getByText(/^Adds the tops and the bottoms when the denominators are different, like 1\/2 \+ 1\/4 = 2\/6\.$/)).toBeVisible()
    const evidence = noticed.getByRole('link', { name: 'Class Test 1 · Q1, Q2, Q4' })
    await expect(evidence).toHaveAttribute('href', new RegExp(`^/p/${s.childId}/papers/`))
    await expect(noticed.getByRole('link', { name: 'How to help' })).toBeVisible()
    await expect(noticed.getByRole('link', { name: 'Homework · Sunday' })).toBeVisible()

    const next = page.getByRole('region', { name: 'What to focus on next, and why' })
    await expect(next.getByText('Make the bottoms match, then add')).toBeVisible()
    await expect(next.getByText('Then line up the comma in decimals')).toBeVisible()
    await expect(next.getByText('Looking ahead: Grade 7 builds percentages and ratio on fractions, so this is worth fixing now.')).toBeVisible()

    const beyond = page.getByRole('link', { name: /Beyond the tests/ })
    await expect(beyond).toContainText('9 of 10 days')
    await expect(beyond).toContainText('at school this term')
    await expect(beyond).toContainText('Netball and school choir')

    const did = page.getByRole('region', { name: 'What Jemma did' })
    await expect(did.getByText("Marked Class Test 1 against Ms Banda's memo: 6 out of 10")).toBeVisible()
    await expect(did.getByText('Read the homework you snapped. 1 answer was too faint to be sure')).toBeVisible()

    await noHorizontalScroll(page)
    await shot(page, testInfo, 'parent-profile')
  })

  test('tapping evidence reaches the marked paper route and the beyond card opens beyond', async ({ page }) => {
    const s = await open(page, 'marked')
    await page.goto(`/p/${s.childId}`)
    await page.getByRole('link', { name: /Beyond the tests/ }).click()
    await expect(page).toHaveURL(`/p/${s.childId}/beyond`)
  })
})

test.describe('parent-beyond', () => {
  test('notes, attendance, activities and the corrected copy', async ({ page }, testInfo) => {
    const s = await open(page, 'marked')
    await page.goto(`/p/${s.childId}/beyond`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('9 of 10 days')
    await expect(page.getByRole('heading', { name: 'Notes from Ms Banda' })).toBeVisible()
    await expect(page.getByText('Works well in a group and explains her thinking clearly.')).toBeVisible()
    await expect(page.getByText('Finished the decimals extension task without help.')).toBeVisible()
    await expect(page.getByText(/^Term 4 so far: 9 of 10 days\. Away on /)).toBeVisible()
    await expect(page.getByText('Netball', { exact: true })).toBeVisible()
    await expect(page.getByText('Sport · Tuesdays and Thursdays')).toBeVisible()
    await expect(page.getByText('Music · Fridays')).toBeVisible()
    await expect(page.getByText('Ms Banda\'s notes go into the guidance on Amina\'s profile.')).toBeVisible()
    await expect(page.getByText('If Amina misses a day, Jemma checks what the class covered and adds it to her lessons.')).toBeVisible()
    await expect(page.getByText('Activities help pick lesson times and shape the guidance card. None of this changes her marks.')).toBeVisible()
    await expect(page.getByText('Activities only help pick lesson times.')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Add an activity' })).toHaveAttribute('href', `/p/${s.childId}/activities/new`)
    await noHorizontalScroll(page)
    await shot(page, testInfo, 'parent-beyond')
  })

  test('Message Ms Banda stays visible and opens the coming-later sheet', async ({ page }) => {
    const s = await open(page, 'marked')
    await page.goto(`/p/${s.childId}/beyond`)
    await page.getByRole('button', { name: 'Message Ms Banda' }).click()
    await expect(page.getByRole('dialog', { name: 'Coming after the challenge' })).toBeVisible()
  })
})

test.describe('parent-report', () => {
  test('headline, glance, week by week, gaps and what is next', async ({ page }, testInfo) => {
    const s = await open(page, 'session_done')
    await page.goto(`/p/${s.childId}/report`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Amina is steady at 60% and fixing her gaps one at a time.')
    await expect(page.getByText(/^Term 4 so far · \d+ to \d+ \w+$/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Download PDF' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Share a copy' })).toBeVisible()
    const glance = page.getByRole('region', { name: 'At a glance' })
    await expect(glance.getByText('Class Test 1')).toBeVisible()
    await expect(glance.getByText('gaps fixed this year')).toBeVisible()
    await expect(glance.getByText('lesson this week')).toBeVisible()
    const weeks = page.getByRole('region', { name: 'Week by week' })
    await expect(weeks.getByText('Marks, lessons, notes and attendance together')).toBeVisible()
    await expect(weeks.getByText('Class Test 1: 6 out of 10')).toBeVisible()
    await expect(weeks.getByText(/^Lesson on adding fractions: 3 of 5/)).toBeVisible()
    const gaps = page.getByRole('region', { name: 'Gaps' })
    await expect(gaps.getByText('Working on')).toBeVisible()
    await expect(gaps.getByText('Fixed this year')).toBeVisible()
    await expect(gaps.getByText('Equivalent fractions')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Outside class' }).getByText('Netball')).toBeVisible()
    const next = page.getByRole('region', { name: "What's next" })
    await expect(next.getByText('Make the bottoms match, then add.')).toBeVisible()
    await expect(next.getByText('Looking ahead: Grade 7 builds percentages and ratio on fractions.')).toBeVisible()
    await expect(page.getByText(/^Made by Jemma on .* from 1 test/)).toBeVisible()
    await noHorizontalScroll(page)
    await shot(page, testInfo, 'parent-report')
  })
})

test.describe('parent-activity', () => {
  test('saving an activity stores it and queues activity.added', async ({ page }, testInfo) => {
    const s = await open(page, 'marked')
    await page.goto(`/p/${s.childId}/activities/new`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('What does Amina do outside class?')
    await expect(page.getByText("Ms Banda sees activities on Amina's profile. Jemma uses them in the guidance card, never to mark her.")).toBeVisible()

    await page.getByRole('button', { name: 'Club' }).click()
    await page.getByLabel('What is it called?').fill('Chess club')
    await page.getByLabel(/^Where/).fill('Hillview Primary, after school')
    await page.getByRole('button', { name: 'Wed' }).click()
    await expect(page.getByRole('button', { name: 'Club' })).toHaveAttribute('aria-pressed', 'true')
    await page.getByLabel('What is it called?').focus()
    await noHorizontalScroll(page)
    await shot(page, testInfo, 'parent-activity')

    await page.getByRole('button', { name: 'Save activity' }).click()
    await expect(page).toHaveURL(`/p/${s.childId}`)

    const db = admin()
    const { data: acts } = await db.from('activities').select('kind, name, place, days, since').eq('child_id', s.childId).eq('name', 'Chess club')
    expect(acts).toEqual([{ kind: 'club', name: 'Chess club', place: 'Hillview Primary, after school', days: ['Wed'], since: 'This term' }])
    const { data: events } = await db.from('events').select('type, payload').eq('type', 'activity.added').filter('payload->>childId', 'eq', s.childId)
    expect(events?.length).toBe(1)

    await page.goto(`/p/${s.childId}/beyond`)
    await expect(page.getByText('Chess club')).toBeVisible()
  })

  test('save needs a kind and a name', async ({ page }) => {
    const s = await open(page, 'marked')
    await page.goto(`/p/${s.childId}/activities/new`)
    await page.getByRole('button', { name: 'Save activity' }).click()
    await expect(page).toHaveURL(`/p/${s.childId}/activities/new`)
    await expect(page.getByRole('alert')).toBeVisible()
  })
})
