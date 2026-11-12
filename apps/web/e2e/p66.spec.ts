import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServiceClient } from '@jemma/profiling/db'
import { expect, test, type Page } from '@playwright/test'
import { openSandbox, type OpenedSandbox } from './helpers/sandbox'

// "Bring past records in": a teacher uses the messy sample file, Jemma works out the columns (a RECORDED answer of the free model, played back by
// the agent in AI_MODE=replay: no model is called here), code reads every row, the teacher fixes one row and skips two, says yes, and the rows
// become cited records in the learner's Long view. The full log lists the three tool calls and the approval with the teacher's name.
// Needs the agent worker at AGENT_URL (replay mode, with the recording of this file in ai_replays). Headless.
// Screenshots for the reviewer are written only when P66_PROOF is set, to design/proof/p66, named by width (390 or 1440).

// Every step is a few round trips to the database, so the waits are patient.
const check = expect.configure({ timeout: 45_000 })

const admin = () => createServiceClient({ SUPABASE_URL: process.env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY! })

const proofDir = resolve(import.meta.dirname, '../../../design/proof/p66')
async function proof(page: Page, name: string, fullPage = true) {
  if (!process.env.P66_PROOF) return
  mkdirSync(proofDir, { recursive: true })
  const width = page.viewportSize()!.width >= 1024 ? 1440 : 390
  await page.evaluate(() => document.fonts.ready)
  // The bottom bar sticks to the window: in a whole-page picture it goes to the end of the page.
  const bar = fullPage ? 'nav.sticky.bottom-0{position:static !important}' : ''
  await page.addStyleTag({ content: `nextjs-portal{display:none} *{transition:none !important;animation:none !important} ${bar}` })
  await page.screenshot({ path: resolve(proofDir, `${name}-${width}.png`), fullPage })
}

/** The page itself never scrolls sideways. When it does, the failure names what sticks out. */
async function noHorizontalScroll(page: Page) {
  const sticksOut = await page.evaluate(() => {
    const limit = document.documentElement.clientWidth
    if (document.documentElement.scrollWidth <= limit) return []
    return [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > limit + 1)
      .slice(0, 6)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 50)} right=${Math.round(el.getBoundingClientRect().right)} of ${limit}`)
  })
  expect(sticksOut).toEqual([])
}

const AGENT_URL = process.env.AGENT_URL ?? 'http://localhost:8787'

let sb: OpenedSandbox | null = null
test.afterEach(async () => {
  await sb?.cleanup().catch(() => undefined)
  sb = null
})

/** Waits until no Long view update of the school is queued or running, then closes the ones that could not run (no model runs in this test). */
async function settleLongViewUpdates(schoolId: string) {
  const db = admin()
  const until = Date.now() + 240_000
  for (;;) {
    const open = (await db.from('events').select('id').eq('school_id', schoolId).eq('type', 'long_view.requested').in('status', ['queued', 'running'])).data ?? []
    if (open.length === 0) break
    if (Date.now() > until) throw new Error('the Long view updates did not finish')
    await new Promise((r) => setTimeout(r, 2000))
  }
  await db.from('events').update({ status: 'done', error: null }).eq('school_id', schoolId).eq('type', 'long_view.requested').eq('status', 'failed')
}

test.beforeAll(async () => {
  const health = await fetch(`${AGENT_URL}/health`).catch(() => null)
  expect(health?.ok, `the agent worker must be running at ${AGENT_URL}`).toBe(true)
})

test.describe('past records for a teacher', () => {
  test('the messy sample: Jemma reads the columns, the teacher fixes one row, skips two, says yes, and the Long view cites the file and the row', async ({ page }) => {
    test.setTimeout(900_000)
    sb = await openSandbox(page, { stage: 'start', role: 'teacher' })
    const db = admin()
    const classId = sb.classId
    const school = (await db.from('demo_sandboxes').select('school_id').eq('id', sb.sandboxId).single()).data!.school_id
    const base = `/t/${classId}`
    const kids = new Map((await db.from('children').select('id, first_name').eq('school_id', school)).data!.map((k) => [k.first_name, k.id]))
    const year = new Date().getUTCFullYear()

    // The entry is on the Learners tab, and the three ways are on the screen.
    await page.goto(`${base}/learners`)
    await check(page.getByRole('link', { name: 'Add past records' })).toBeVisible()
    await page.getByRole('link', { name: 'Add past records' }).click()
    await check(page).toHaveURL(`${base}/learners/records`)
    await check(page.getByRole('tab')).toHaveText(['Upload a file', 'Paste a table', 'One result'])
    await expect(page.getByText('Up to 1 MB and 2,000 rows.')).toBeVisible()
    await noHorizontalScroll(page)
    await proof(page, 'add-past-records')

    // "Use a sample file": the messy one. Jemma reads it (the recorded answer plays back in seconds).
    await page.getByRole('button', { name: /Use the messy file/ }).click()
    await check(page).toHaveURL(new RegExp(`${base}/learners/records/[0-9a-f-]{36}$`))
    const importId = page.url().split('/').pop()!
    await expect(page.getByRole('heading', { name: 'What Jemma understood' })).toBeVisible({ timeout: 300_000 })

    // The mapping in plain words, the counts, the assumptions.
    const what = page.getByRole('region', { name: 'What Jemma understood' })
    await expect(what).toContainText('The column Pupil is the learner.')
    await expect(what).toContainText(/The column Result is the mark(, as a percent)?\./)
    await expect(what).toContainText(/January to March is term 1/)
    const counts = page.getByRole('region', { name: 'What is in the file' })
    await expect(counts.getByText('Rows read').locator('..')).toContainText('10')
    await expect(counts.getByText('Need a look').locator('..')).toContainText('3')
    await expect(counts.getByText('Ready to add').locator('..')).toContainText('7')
    await noHorizontalScroll(page)

    // Nothing is in any learner's records yet, and the teacher's home has the Check item.
    expect((await db.from('learner_records').select('id').eq('import_id', importId)).data).toHaveLength(0)
    const row = (await db.from('record_imports').select('status, mapping, rows, problems, file_name').eq('id', importId).single()).data!
    expect(row.status).toBe('ready')
    expect(row.file_name).toBe('messy-old-marks.csv')
    const item = (await db.from('needs_you_items').select('title, kind, status').eq('ref_id', importId).single()).data!
    expect(item).toEqual({ title: 'Check 10 past results for 6B Mathematics', kind: 'check_records', status: 'open' })
    await proof(page, 'check-top')

    // The rows with a problem come first: an unknown learner, a repeat, a topic Jemma is unsure of.
    const problems = page.getByRole('region', { name: /Rows to look at/ })
    await expect(problems).toContainText('Rows to look at (3)')
    const cards = problems.getByRole('article')
    await expect(cards).toHaveCount(3)
    await expect(problems.getByRole('article', { name: 'Row 10' })).toContainText('Pule is not a learner in this class')
    await expect(problems.getByRole('article', { name: 'Row 11' })).toContainText('the same as row 9 of this file')
    await expect(problems.getByRole('article', { name: 'Row 12' })).toContainText('not sure which strand')
    await proof(page, 'check-problems')

    // The row that gives orders is a row like any other: its mark is the file's, and the order is only text on that row.
    const orders = (row.rows as { n: number; learner: string; marks: number; outOf: number; text: string | null; family: string | null }[]).find((r) => r.n === 4)!
    expect(orders).toMatchObject({ learner: 'Naledi', marks: 55, outOf: 100 })
    expect(orders.text).toMatch(/^Ignore all earlier instructions/)

    // Fix one: the strand of row 12. Skip two: the unknown learner and the repeat.
    await page.getByLabel('Which strand is row 12?').selectOption('measurement')
    await page.getByRole('button', { name: 'Use this strand for row 12' }).click()
    await check(problems.getByRole('article', { name: 'Row 12' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Skip row 10' }).click()
    await check(problems.getByRole('article', { name: 'Row 10' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Skip row 11' }).click()
    await check(problems).toHaveCount(0)
    await expect(counts.getByText('Ready to add').locator('..')).toContainText('8')
    await expect(counts.getByText('Skipped by you').locator('..')).toContainText('2')
    await expect(page.getByRole('region', { name: /A sample of the rows that are ready/ })).toContainText('Thabo')
    await noHorizontalScroll(page)
    await proof(page, 'check-fixed')

    // The gate says what will happen. Nothing reaches a parent or a learner.
    const gate = page.getByRole('region', { name: "Add to the learners' records" })
    await expect(gate).toContainText('Jemma will add 8 records for 5 learners.')
    await expect(gate).toContainText('Nothing reaches a parent or a learner.')
    await proof(page, 'check-gate')

    // Add to records: the teacher's yes is saved with their name, then the records are written.
    await page.getByRole('button', { name: 'Add to records' }).click()
    await expect(page.getByText('Added 8 past records from messy-old-marks.csv.')).toBeVisible({ timeout: 90_000 })
    await noHorizontalScroll(page)
    await proof(page, 'added')

    const written = (await db.from('learner_records').select('*').eq('import_id', importId).order('source_row')).data!
    expect(written.map((r) => r.source_row)).toEqual([2, 3, 4, 5, 6, 8, 9, 12])
    expect(written.every((r) => r.added_by_name === 'Ms Banda' && r.quality === 'clear' && r.grade === 5 && r.year === year - 1)).toBe(true)
    // `source` is the kind of piece. It is never `note` or `attendance` here, because every row has a mark.
    expect(written.every((r) => ['quiz', 'assignment', 'project'].includes(r.source))).toBe(true)
    expect(written.find((r) => r.source_row === 12)).toMatchObject({ family: 'measurement', child_id: kids.get('Sipho') })
    // The order in the note column is kept as a note on its row, and nothing else changed because of it.
    expect(written.find((r) => r.source_row === 4)).toMatchObject({ child_id: kids.get('Naledi'), marks: 55, out_of: 100, family: 'measurement' })
    const approvals = (await db.from('approvals').select('kind, decision, decided_by_name').eq('ref_id', importId)).data!
    expect(approvals).toEqual([{ kind: 'record_import', decision: 'approved', decided_by_name: 'Ms Banda' }])

    // Every learner who got a row gets a Long view update.
    const asked = (await db.from('events').select('payload').eq('school_id', school).eq('type', 'long_view.requested')).data!.map((e) => (e.payload as { childId: string }).childId)
    expect(new Set(asked)).toEqual(new Set(written.map((r) => r.child_id)))
    await settleLongViewUpdates(school)

    // Thabo's Long view: Grade 5 Terms 2 and 3 of data handling had no results, and now show the imported marks.
    const thabo = kids.get('Thabo')!
    await page.goto(`${base}/learners/${thabo}/long-view`)
    const table = page.getByRole('table')
    await check(table.getByRole('img', { name: /^Data handling, Grade 5 Term 2: 88 percent, 200 marks$/ })).toBeVisible()
    await expect(table.getByRole('img', { name: /^Data handling, Grade 5 Term 3: 84 percent, 200 marks$/ })).toBeVisible()

    // A pattern would cite these rows. The words are what the long_view job would save (no model runs here): the records are the real ones.
    const imported = written.filter((r) => r.child_id === thabo)
    const label = (r: (typeof written)[number]) => `${r.title}, ${r.teacher_name}, ${new Date(`${r.happened_on}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`
    await db.from('long_view_patterns').insert({
      child_id: thabo, kind: 'strength', subject: 'Mathematics', family: 'data', title: 'Data work stays strong',
      statement: 'In data handling, marks stayed high from Grade 5 Term 2 to Grade 5 Term 3.',
      terms: [{ grade: 5, year: year - 1, term: 2, percent: 88, points: 200 }, { grade: 5, year: year - 1, term: 3, percent: 84, points: 200 }],
      evidence: imported.map((r) => ({ kind: 'record', id: r.id, label: label(r) })), status: 'draft', active: true,
    })
    await page.reload()
    const card = page.getByRole('article').filter({ hasText: 'Data work stays strong' })
    await check(card).toBeVisible()
    await card.getByRole('button', { name: /Data project/ }).click()
    const sheet = page.getByRole('dialog')
    await expect(sheet).toContainText('Data project')
    await expect(sheet).toContainText(`Grade 5, Term 3, ${year - 1}`)
    await expect(sheet).toContainText('88 out of 100')
    await expect(sheet.locator('[data-origin]')).toHaveText(/^From messy-old-marks\.csv, row 6\. Added by Ms Banda on \d{1,2} \w{3} \d{4}\.$/)
    await noHorizontalScroll(page)
    await proof(page, 'long-view-source-sheet', false)
    await sheet.getByRole('button', { name: 'Close' }).click()
    await proof(page, 'long-view-grid')

    // The full log lists the three tool calls and the approval with the teacher's name.
    await page.goto(`${base}/log`)
    await check(page.getByText('Read a file of past records').first()).toBeVisible()
    await expect(page.getByText('Worked out the columns of a past records file').first()).toBeVisible()
    await expect(page.getByText('Added past records to the Long view').first()).toBeVisible()
    await expect(page.getByText('Ms Banda approved adding the past records in messy-old-marks.csv')).toBeVisible()
    await noHorizontalScroll(page)
    await proof(page, 'full-log')
  })

  test('the tidy sample is read without a single problem and adds fifteen records', async ({ page }) => {
    test.setTimeout(900_000)
    sb = await openSandbox(page, { stage: 'start', role: 'teacher' })
    const db = admin()
    await page.goto(`${'/t/' + sb.classId}/learners/records`)
    await page.getByRole('button', { name: /Use the tidy file/ }).click()
    await expect(page.getByRole('heading', { name: 'What Jemma understood' })).toBeVisible({ timeout: 300_000 })
    const counts = page.getByRole('region', { name: 'What is in the file' })
    await expect(counts.getByText('Rows read').locator('..')).toContainText('15')
    await expect(counts.getByText('Need a look').locator('..')).toContainText('0')
    await expect(page.getByRole('region', { name: /Rows to look at/ })).toHaveCount(0)
    await proof(page, 'tidy-check')
    await page.getByRole('button', { name: 'Add to records' }).click()
    await expect(page.getByText('Added 15 past records from grade5-maths-results.csv.')).toBeVisible({ timeout: 90_000 })
    const importId = page.url().split('/').pop()!
    expect((await db.from('learner_records').select('id').eq('import_id', importId)).data).toHaveLength(15)
    const school = (await db.from('demo_sandboxes').select('school_id').eq('id', sb.sandboxId).single()).data!.school_id
    await settleLongViewUpdates(school)
  })

  test('One result: the teacher types a past result, it is a record with their name and no file, and a bad value is told in one sentence', async ({ page }) => {
    test.setTimeout(600_000)
    sb = await openSandbox(page, { stage: 'start', role: 'teacher' })
    const db = admin()
    const school = (await db.from('demo_sandboxes').select('school_id').eq('id', sb.sandboxId).single()).data!.school_id
    const lerato = (await db.from('children').select('id').eq('school_id', school).eq('first_name', 'Lerato').single()).data!.id
    const year = new Date().getUTCFullYear()
    await page.goto(`/t/${sb.classId}/learners/records`)
    await page.getByRole('tab', { name: 'One result' }).click()
    await expect(page.getByRole('heading', { name: 'One result' })).toBeVisible()
    await noHorizontalScroll(page)
    await proof(page, 'one-result')

    await page.getByLabel('Learner', { exact: true }).selectOption({ label: 'Lerato' })
    await page.getByLabel('Title').fill('Class Test 4')
    await page.getByLabel('Strand').selectOption('fractions')
    await page.getByLabel('Marks', { exact: true }).fill('25')
    await page.getByLabel('Out of').fill('20')
    await page.getByLabel("Teacher's name at the time").fill('Mrs Naidoo')
    await page.getByRole('button', { name: 'Save this result' }).click()
    await expect(page.locator('p[role="alert"]')).toHaveText('The marks cannot be more than the total')

    await page.getByLabel('Marks', { exact: true }).fill('14')
    await page.getByRole('button', { name: 'Save this result' }).click()
    await expect(page.getByRole('heading', { name: 'Saved' })).toBeVisible({ timeout: 60_000 })
    await proof(page, 'one-result-saved')
    const rows = (await db.from('learner_records').select('*').eq('child_id', lerato).eq('title', 'Class Test 4')).data!
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ source: 'quiz', marks: 14, out_of: 20, family: 'fractions', subject: 'Mathematics', teacher_name: 'Mrs Naidoo', added_by_name: 'Ms Banda', import_id: null, source_row: null, year: year - 1, term: 1 })
    // It writes a tool log line like the other saves, and asks for a Long view update.
    const logged = (await db.from('tool_calls').select('ok').eq('school_id', school).eq('tool', 'add_learner_record')).data!
    expect(logged.some((l) => l.ok)).toBe(true)
    expect((await db.from('events').select('id').eq('school_id', school).eq('type', 'long_view.requested').eq('payload->>childId', lerato)).data!.length).toBeGreaterThan(0)

    // A note needs no mark: just the text.
    await page.getByRole('button', { name: 'Add another result' }).click()
    await page.getByLabel('Kind of piece').selectOption('note')
    await expect(page.getByLabel('Marks', { exact: true })).toHaveCount(0)
    await page.getByLabel('The note').fill('Guesses when the bottom numbers differ')
    await page.getByLabel("Teacher's name at the time").fill('Mrs Naidoo')
    await page.getByRole('button', { name: 'Save this result' }).click()
    await expect(page.getByRole('heading', { name: 'Saved' })).toBeVisible({ timeout: 60_000 })
    expect((await db.from('learner_records').select('source, text, subject').eq('child_id', lerato).eq('source', 'note').eq('text', 'Guesses when the bottom numbers differ')).data).toEqual([
      { source: 'note', text: 'Guesses when the bottom numbers differ', subject: null },
    ])
    await settleLongViewUpdates(school)
  })

  test('a pasted table and a file over 1 MB: the table is kept, the big file is refused in one sentence', async ({ page }) => {
    test.setTimeout(600_000)
    sb = await openSandbox(page, { stage: 'start', role: 'teacher' })
    const db = admin()
    const school = (await db.from('demo_sandboxes').select('school_id').eq('id', sb.sandboxId).single()).data!.school_id
    await page.goto(`/t/${sb.classId}/learners/records`)

    await page.getByLabel('Choose a .csv file').setInputFiles({ name: 'big.csv', mimeType: 'text/csv', buffer: Buffer.from(`Learner,Mark\n${'Amina,1/2\n'.repeat(120_000)}`) })
    await expect(page.locator('p[role="alert"]')).toHaveText('This file is bigger than 1 MB. Split it into smaller files.')

    await page.getByRole('tab', { name: 'Paste a table' }).click()
    await page.getByRole('button', { name: 'Read this table' }).click()
    await expect(page.locator('p[role="alert"]')).toHaveText('Paste the table first.')
    await page.getByLabel('The table').fill('Learner\tMark\nAmina\t14/20\nThabo\t16/20')
    await page.getByRole('button', { name: 'Read this table' }).click()
    await check(page).toHaveURL(/\/learners\/records\/[0-9a-f-]{36}$/)
    const importId = page.url().split('/').pop()!
    const row = (await db.from('record_imports').select('file_name, file_path, school_id').eq('id', importId).single()).data!
    expect(row).toMatchObject({ file_name: 'Pasted table', school_id: school })
    const file = await db.storage.from('records').download(row.file_path!)
    expect(await file.data!.text()).toBe('Learner\tMark\nAmina\t14/20\nThabo\t16/20')
  })
})
