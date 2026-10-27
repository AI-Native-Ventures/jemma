import { mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { MemoryStore } from '@jemma/profiling/ai'
import { createServiceClient, type JemmaDb } from '@jemma/profiling/db'
import type { PaperRead } from '@jemma/profiling/schemas'
import { runJobReadPaper } from '../../../packages/profiling/src/jobs/cloud/read-paper'
import type { ToolContext } from '../../../packages/profiling/src/tools/context'
import { expect, test, type Page } from '@playwright/test'
import { openSandbox, type OpenedSandbox } from './helpers/sandbox'

// Needs AGENT_URL to answer 200 on POST /events (any stub will do): sendEvent posts there after it records the event.

test.setTimeout(180_000)

const db: JemmaDb = createServiceClient({
  SUPABASE_URL: process.env.SUPABASE_URL!,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
})

const actual = (board: string) => {
  const dir = resolve(import.meta.dirname, '../../../design/actual')
  mkdirSync(dir, { recursive: true })
  return resolve(dir, `${board}.png`)
}

/** Saves the design-match image with the dev-only Next.js indicator hidden. Phone boards are 390 wide, full page. */
async function shoot(page: Page, board: string) {
  await page.addStyleTag({ content: 'nextjs-portal{display:none !important}' })
  await page.screenshot({ path: actual(board), fullPage: true })
}

// A 1x1 PNG: enough for the camera input and for the storage round trip.
const PHOTO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const photo = { name: 'page-1.png', mimeType: 'image/png', buffer: PHOTO }

const opened: OpenedSandbox[] = []
test.afterAll(async () => {
  await Promise.all(opened.map((s) => s.cleanup().catch(() => undefined)))
})

async function sandbox(page: Page, stage: 'start' | 'marked' | 'session_done' = 'marked') {
  const s = await openSandbox(page, { stage, role: 'parent' })
  opened.push(s)
  return s
}

const profilingRequire = createRequire(resolve(import.meta.dirname, '../../../packages/profiling/package.json'))

/** Runs the read_paper job with a mock model that answers `read`, as the agent would after homework.snapped. */
async function runReadPaper(schoolId: string, paperId: string, read: PaperRead) {
  const { MockLanguageModelV4 } = (await import(pathToFileURL(profilingRequire.resolve('ai/test')).href)) as { MockLanguageModelV4: new (o: unknown) => never }
  const model = new MockLanguageModelV4({
    modelId: 'mock',
    doGenerate: async () =>
      ({
        content: [{ type: 'text', text: JSON.stringify(read) }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } },
        warnings: [],
      }) as never,
  })
  const ctx: ToolContext = { db, schoolId, eventId: null, env: { replayStore: new MemoryStore() }, now: () => new Date() }
  const prompt = readFileSync(resolve(import.meta.dirname, '../../../packages/profiling/src/jobs/read_paper.md'), 'utf8')
  await runJobReadPaper(ctx, '', { paperId }, { model, prompt })
}

const schoolOf = async (childId: string) => (await db.from('children').select('school_id').eq('id', childId).single()).data!.school_id

async function seededHomework(childId: string) {
  const { data } = await db.from('papers').select('id').eq('child_id', childId).eq('owner', 'parent').eq('kind', 'homework').single()
  return data!.id
}

async function snapOnePage(page: Page, childId: string) {
  await page.goto(`/p/${childId}/snap`)
  await page.getByRole('link', { name: 'Take the photos' }).click()
  await expect(page).toHaveURL(/\/snap\/photo\?kind=homework/)
  await page.locator('input[type=file]').setInputFiles(photo)
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page).toHaveURL(/\/snap\/[0-9a-f-]{36}$/, { timeout: 60_000 })
  return page.url().split('/').pop()!
}

test('parent-snap-type: four kinds, Homework picked, Mathematics, Take the photos', async ({ page }) => {
  const s = await sandbox(page)
  await page.goto(`/p/${s.childId}/snap`)
  await expect(page.getByText('Snap · step 1 of 3')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'What are you snapping?', level: 1 })).toBeVisible()
  for (const [name, hint] of [
    ['Test', 'Marked or not yet'],
    ['Homework', 'A worksheet or exercise book page'],
    ['Textbook page', 'So lessons use her own book'],
    ['Report card', 'Term marks from school'],
  ]) {
    await expect(page.getByRole('button', { name: new RegExp(`^${name}`) })).toContainText(hint!)
  }
  await expect(page.getByRole('button', { name: /^Homework/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Test' })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('button', { name: 'Mathematics' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('More subjects coming soon')).toBeVisible()
  await expect(page.getByText("One photo per page. Lay it flat in good light. You'll check what Jemma read before anything is saved.")).toBeVisible()
  await page.getByRole('button', { name: /^Textbook page/ }).click()
  await expect(page.getByRole('link', { name: 'Take the photos' })).toHaveAttribute('href', /kind=textbook/)
  await page.getByRole('button', { name: /^Homework/ }).click()
  await shoot(page, 'parent-snap-type')
})

test('parent-snap-photo: frame, page number, Done after a photo', async ({ page }) => {
  const s = await sandbox(page)
  await page.goto(`/p/${s.childId}/snap/photo?kind=homework`)
  await expect(page.getByText('Homework · page 1')).toBeVisible()
  await expect(page.getByText('Amina · Mathematics')).toBeVisible()
  await expect(page.getByText('Page found. Hold still.')).toBeVisible()
  await expect(page.getByText('More pages? Snap them one after another.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Snap page 1' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Done' })).toBeDisabled()
  await shoot(page, 'parent-snap-photo')
  await page.locator('input[type=file]').setInputFiles(photo)
  await expect(page.getByText('Homework · page 2')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Done' })).toBeEnabled()
  await page.getByRole('link', { name: 'Close' }).click()
  await expect(page).toHaveURL(/\/snap$/)
})

test('a good photo: reading, then the check screen, then saved', async ({ page }) => {
  const s = await sandbox(page, 'marked')
  const paperId = await snapOnePage(page, s.childId)
  const { data: event } = await db.from('events').select('type, status').eq('school_id', await schoolOf(s.childId)).eq('type', 'homework.snapped').single()
  expect(event?.type).toBe('homework.snapped')

  await expect(page.getByRole('heading', { level: 1, name: /^Reading Amina's homework\./ })).toBeVisible()
  await expect(page.getByText('The photo you just took. The coral box is the line Jemma is reading.')).toBeVisible()
  await expect(page.getByText("You can leave this screen. It lands in Needs you when it's ready.")).toBeVisible()
  await shoot(page, 'parent-snap-reading')

  await runReadPaper(await schoolOf(s.childId), paperId, {
    nameAsWritten: 'Amina',
    nameConfidence: 0.95,
    pageUsable: true,
    answers: [
      { n: 1, answerAsRead: '0,7', confidence: 0.95 },
      { n: 2, answerAsRead: '0,31', confidence: 0.4 },
    ],
  })
  // The reading page polls and moves on by itself.
  await expect(page.getByRole('button', { name: 'Confirm and save' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('heading', { level: 1 })).toHaveText("I read 2 answers and the teacher's marks. Check one, then confirm.")
  await page.getByRole('button', { name: 'Fix it' }).click()
  await page.getByRole('textbox', { name: 'What it says' }).fill('0,35')
  await page.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(page).toHaveURL(/\/snap\/[0-9a-f-]{36}\/saved$/, { timeout: 30_000 })
  await expect(page.getByRole('link', { name: 'Snap another page' })).toBeVisible()

  const { data: row } = await db.from('question_results').select('answer_read, previous_answer, read_confidence').eq('paper_id', paperId).eq('n', 2).single()
  expect(row).toMatchObject({ answer_read: '0,35', previous_answer: '0,31' })
  const { data: paper } = await db.from('papers').select('status').eq('id', paperId).single()
  expect(paper?.status).toBe('marked')
  const { data: items } = await db.from('needs_you_items').select('status').eq('ref_id', paperId)
  expect((items ?? []).every((i) => i.status === 'done')).toBe(true)
})

test('a dark photo: Photo too dark with Retake, nothing saved', async ({ page }) => {
  const s = await sandbox(page, 'marked')
  const paperId = await snapOnePage(page, s.childId)
  await runReadPaper(await schoolOf(s.childId), paperId, { nameAsWritten: null, nameConfidence: 0, pageUsable: false, problem: 'too_dark', answers: [] })
  await expect(page.getByRole('heading', { level: 1, name: 'This photo is too dark to read.' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('A brighter photo means fewer guesses.')).toBeVisible()
  await expect(page.getByText('For a clear photo')).toBeVisible()
  await expect(page.getByText('Turn on a light or move near a window')).toBeVisible()
  await expect(page.getByText('Hold the phone flat above the page')).toBeVisible()
  await expect(page.getByText('Fit the whole page inside the frame')).toBeVisible()
  await expect(page.getByText('Your photo, taken just now')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Retake photo' })).toHaveAttribute('href', /\/snap\/photo\?kind=homework/)
  await shoot(page, 'parent-error')
  const { count } = await db.from('question_results').select('id', { count: 'exact', head: true }).eq('paper_id', paperId)
  expect(count).toBe(0)
})

test('check and saved boards on the seeded homework', async ({ page }) => {
  const s = await sandbox(page, 'marked')
  const paperId = await seededHomework(s.childId)
  await page.goto(`/p/${s.childId}/snap/${paperId}`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText("I read 5 answers and the teacher's marks. Check one, then confirm.")
  await expect(page.getByRole('heading', { name: 'What Jemma read' })).toBeVisible()
  await expect(page.getByText('Amina wrote · teacher')).toBeVisible()
  await expect(page.getByText('The pencil is faint here. Does it say 0,65?')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Yes, 0,65' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Fix it' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Retake the photo' })).toBeVisible()
  await shoot(page, 'parent-snap-check')

  await page.getByRole('button', { name: 'Yes, 0,65' }).click()
  await page.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(page).toHaveURL(/\/saved$/, { timeout: 30_000 })
  await expect(page.getByRole('heading', { level: 1 })).toContainText("Saved to Amina's profile.")
  await expect(page.getByText('You confirmed question 4 says 0,65. Thank you.')).toBeVisible()
  await expect(page.getByRole('link', { name: "Back to Amina's profile" })).toHaveAttribute('href', `/p/${s.childId}`)
  await expect(page.getByRole('link', { name: 'Snap another page' })).toHaveAttribute('href', `/p/${s.childId}/snap`)
  await shoot(page, 'parent-snap-saved')
  const { data: item } = await db.from('needs_you_items').select('status').eq('ref_id', paperId).single()
  expect(item?.status).toBe('done')
})

test('another family cannot open the paper', async ({ page }) => {
  const s = await sandbox(page, 'marked')
  const res = await page.goto(`/p/${s.childId}/snap/00000000-0000-4000-8000-000000000000`)
  expect(res?.status()).toBe(404)
})
