import { resolve } from 'node:path'
import { createServiceClient, type JemmaDb } from '@jemma/profiling/db'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { openSandbox } from './helpers/sandbox'

const db = (): JemmaDb =>
  createServiceClient({ SUPABASE_URL: process.env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY! })

const actual = (board: string) => resolve(import.meta.dirname, `../../../design/actual/${board}.png`)

/** Laptop boards are saved at 1440 wide, full page. */
async function shot(page: Page, testInfo: TestInfo, board: string) {
  if (testInfo.project.name !== 'laptop') return
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: 'nextjs-portal{display:none}' })
  await page.screenshot({ path: actual(board), fullPage: true })
}

async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
}

async function atWidths(page: Page, wide: number[]) {
  const { height } = page.viewportSize()!
  for (const width of wide) {
    await page.setViewportSize({ width, height })
    await noHorizontalScroll(page)
  }
}

// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

test('laptop review: pile, paper photo and reading side by side', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'laptop', 'laptop layout')
  test.setTimeout(120_000)
  const admin = db()
  const sb = await openSandbox(page, { stage: 'marked', role: 'teacher' })
  try {
    const schoolId = (await admin.from('classes').select('school_id').eq('id', sb.classId).single()).data!.school_id
    const item = (await admin.from('needs_you_items').select('id').eq('kind', 'check_answer').eq('school_id', schoolId).single()).data!
    await page.goto(`/t/${sb.classId}/needs-you/${item.id}`)

    await expect(page.getByRole('navigation', { name: '6B Mathematics' })).toBeVisible()
    await expect(page.getByRole('heading', { name: "I'm not sure about question 7 on Sipho's paper. I read 0,8. What does it say?" })).toBeVisible()
    await expect(page.getByText('/ Needs you / Class Test 1')).toBeVisible()

    const pile = page.getByRole('navigation', { name: 'Papers' })
    await expect(pile.getByText('To check · 1')).toBeVisible()
    await expect(pile.getByText('1 answer to check')).toBeVisible()
    await expect(pile.getByText('Marked · 4')).toBeVisible()
    await expect(pile.getByText('Amina')).toBeVisible()

    // Photo and reading are both on screen without scrolling.
    const photo = await page.getByRole('img', { name: /^Paper \d, page 1$/ }).boundingBox()
    const reading = await page.getByRole('heading', { name: 'What Jemma read' }).boundingBox()
    expect(photo && photo.y + 100 < 900 && photo.x + photo.width < 1440).toBe(true)
    expect(reading && reading.y < 900 && reading.x > (photo?.x ?? 0) + (photo?.width ?? 0) - 1).toBe(true)
    await expect(page.getByText('Read · mark · sure')).toBeVisible()
    await expect(page.getByText("Sipho's paper as you snapped it", { exact: false })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Rotate' })).toBeVisible()

    await page.getByRole('button', { name: '0,6', exact: true }).click()
    await expect(page.getByText('0,6 matches the key, so question 7 gets 1 mark.')).toBeVisible()
    await expect(page.getByText('You changed it from 0,8')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('7 / 10')).toBeVisible()
    await page.waitForLoadState('networkidle')
    await shot(page, testInfo, 'laptop-teacher-review')
    await atWidths(page, [1024, 1280, 1440])
  } finally {
    await sb.cleanup()
  }
})

test('laptop snap: upload, phone pages land, mark them', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'laptop', 'laptop layout')
  test.setTimeout(120_000)
  const admin = db()
  const sb = await openSandbox(page, { stage: 'session_done', role: 'teacher' })
  try {
    const t = (await admin.from('tests').select('id').eq('class_id', sb.classId).single()).data!
    await page.goto(`/t/${sb.classId}/snap/${t.id}/papers`)

    await expect(page.getByRole('heading', { name: 'Add the 5 papers. Upload scans, or snap them with your phone.' })).toBeVisible()
    await expect(page.getByText('Snap · Class Test 1')).toBeVisible()
    const steps = page.getByRole('list', { name: 'Steps' })
    await expect(steps.getByText('Class Test 1 · Fractions and decimals')).toBeVisible()
    await expect(steps.getByText('Upload or snap them now')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Upload scans or PDFs' })).toBeVisible()
    await expect(page.getByText('PDF, JPG or PNG. One pile in one PDF is fine.')).toBeVisible()
    await expect(page.getByRole('img', { name: 'QR code to open the camera on your phone' })).toBeVisible()
    await expect(page.getByText('Waiting for the next page from your phone')).toBeVisible()
    await expect(page.getByText('5 papers ready · 5 pages')).toBeVisible()

    // A file from this laptop becomes a paper and shows in the upload list.
    await page.locator('input#files').setInputFiles({ name: '6B-class-test-1.pdf', mimeType: 'application/pdf', buffer: PNG })
    await expect(page.getByText('6B-class-test-1.pdf')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Ready', { exact: true })).toBeVisible()
    await expect(page.getByText('6 papers ready · 6 pages')).toBeVisible()

    // A page snapped with the phone lands in "From your phone".
    const paper = (await admin.from('papers').select('id').eq('test_id', t.id).eq('name_read', 'Lerato').single()).data!
    const ins = await admin.from('paper_pages').insert({ paper_id: paper.id, page_no: 2, storage_path: `x/${paper.id}/2.png` })
    expect(ins.error).toBeNull()
    await expect(page.getByText(/^Paper \d · Lerato · page 2$/)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText("added to Lerato's paper", { exact: false })).toBeVisible()
    await page.waitForLoadState('networkidle')
    await shot(page, testInfo, 'laptop-teacher-snap')
    await atWidths(page, [1024, 1280, 1440])

    await expect(page.getByRole('link', { name: 'Mark them' })).toHaveAttribute('href', new RegExp(`/snap/${t.id}/progress$`))
  } finally {
    await sb.cleanup()
  }
})

test('laptop tests: list, each question and the question detail side by side', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'laptop', 'laptop layout')
  test.setTimeout(120_000)
  const sb = await openSandbox(page, { stage: 'session_done', role: 'teacher' })
  try {
    await page.goto(`/t/${sb.classId}/tests`)
    await expect(page.getByRole('heading', { name: /^Class Test 1 averaged \d+%\. Question 1 was the hardest: 1 of 5 got it\.$/ })).toBeVisible()
    await expect(page.getByText('Tests · 6B Mathematics')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Snap the next test' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Term 4' })).toBeVisible()
    await expect(page.getByText('Your first test on Jemma. Earlier terms show up once you snap them.')).toBeVisible()
    const table = page.getByRole('table')
    await expect(table.getByRole('columnheader', { name: 'Most common slip' })).toBeVisible()
    await expect(table.getByRole('row', { name: /Q1 1\/2 \+ 1\/4 Adding fractions 1\/5 2\/6 \(4\)/ })).toBeVisible()
    await expect(table.getByRole('row', { name: /Q3 .* 5\/5 None/ })).toBeVisible()

    // The selected question's detail sits beside the table.
    await expect(page.getByText('Question 1 · Adding fractions')).toBeVisible()
    await expect(page.getByText('Right answer 3/4 · 1 mark')).toBeVisible()
    await expect(page.getByText('4 of 5 wrote 2/6. They added the tops and the bottoms.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Missed it' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Got it right' })).toBeVisible()
    await expect(page.getByText(/Reteach plan ready/)).toBeVisible()
    await page.waitForLoadState('networkidle')
    await shot(page, testInfo, 'laptop-teacher-tests')

    await table.getByRole('link', { name: 'Q8' }).click()
    await expect(page.getByText('Question 8 · Adding decimals')).toBeVisible()
    await atWidths(page, [1024, 1280, 1440])
  } finally {
    await sb.cleanup()
  }
})
