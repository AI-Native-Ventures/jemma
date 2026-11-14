import { mkdirSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { resolve } from 'node:path'
import { createServiceClient } from '@jemma/profiling/db'
import { expect, test as base, type Page } from '@playwright/test'
import { generatedPng } from './helpers/png'
import { openSandbox, type OpenedSandbox } from './helpers/sandbox'

// "Add your own work" in My own (P97). Amina, in a fresh Hillview copy, taps My own and opens Add your own work:
//  1. her preloaded marked test shows "Marked test: 6 of 8 right" at once (no upload in the demo), its screen shows each question with a tick or a
//     cross and "What to practise" with a Practise button on the topic of her two wrong answers, and no page of it scrolls sideways at 360, 390 or 1440;
//  2. a new marked test: a generated PNG goes through the upload route, the screen says "Jemma is reading your test.", and when the spec plays the agent
//     (the results written with the service client, as `save_own_test_results` does) the screen shows the marked view;
//  3. a test Jemma could not read shows the retry, and "Take the photos again" puts the same paper back to queued and the event back to queued;
//  4. her own curriculum: a PDF goes through the upload route, the screen says "Jemma is reading your curriculum."; when the spec plays the agent (the
//     draft written into the map) she checks the draft, takes a topic out and taps "These look right": the class has the topics and the approval names her.
//
// The stand-in agent below answers 202 to every post and runs no job, so an event stays queued until the spec plays the agent. Nothing here calls a
// model, and no real handwriting or curriculum is read: the photo is a small generated PNG and the PDF a few bytes.
//
// RUNS IN CI on every push (job "Feature specs in a browser", .github/workflows/ci.yml, the step with the stand-in agent, phone), on CI's own local
// database. There the stand-in takes port 8787 (STAND_IN_AGENT_PORT), where the web app posts. Never run it against the hosted preview database.
// Screenshots are written only when P97_PROOF is set, to design/proof/p97, named by width (390 or 1440).

const check = expect.configure({ timeout: 45_000 })
const admin = () => createServiceClient({ SUPABASE_URL: process.env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY! })

const proofDir = resolve(import.meta.dirname, '../../../design/proof/p97')
async function proof(page: Page, name: string) {
  if (!process.env.P97_PROOF) return
  mkdirSync(proofDir, { recursive: true })
  const width = page.viewportSize()!.width >= 1024 ? 1440 : page.viewportSize()!.width
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: 'nextjs-portal{display:none} *{transition:none !important;animation:none !important}' })
  await page.screenshot({ path: resolve(proofDir, `${name}-${width}.png`), fullPage: true })
}

/** The page does not scroll sideways at this width. */
async function noSidewaysScroll(page: Page) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(wide, 'the page scrolls sideways').toBeLessThanOrEqual(0)
}

/** The agent's stand-in: accepts every post to /events, so the web app believes the agent took the event. It runs no job. */
let agent: Server
const STAND_IN_PORT = Number(process.env.STAND_IN_AGENT_PORT ?? 8783)
base.beforeAll(async () => {
  agent = createServer((req, res) => {
    if (req.url === '/health') return void res.writeHead(200).end('ok')
    req.resume()
    req.on('end', () => res.writeHead(202, { 'content-type': 'application/json' }).end('{"queued":true}'))
  })
  await new Promise<void>((done) => agent.listen(STAND_IN_PORT, done))
})
base.afterAll(async () => {
  await new Promise((done) => agent.close(done))
})

const opened: OpenedSandbox[] = []
// A copy is removed as soon as its test is over, so the copies do not pile up on CI's database.
base.afterEach(async () => {
  await Promise.all(opened.splice(0).map((s) => s.cleanup().catch(() => undefined)))
})

const test = base
test.use({ screenshot: 'only-on-failure', actionTimeout: 45_000 })
test.setTimeout(240_000)

/** A fresh copy as Amina, My own on, and her private twin. */
async function aminaInMyOwn(page: Page) {
  const sb = await openSandbox(page, { stage: 'start', role: 'learner' })
  opened.push(sb)
  await page.goto('/k')
  await page.getByRole('button', { name: 'My own' }).click()
  await check(page.getByRole('button', { name: 'My own' })).toHaveAttribute('aria-pressed', 'true')
  const twin = (await admin().from('children').select('id, school_id').eq('private_of', sb.childId).single()).data!
  return { sb, twinId: twin.id, schoolId: twin.school_id }
}

/** The id at the end of an address like /k/own/test/{id}. */
const idOfUrl = (page: Page) => new URL(page.url()).pathname.split('/').pop()!

const newestEvent = async (type: string, key: string, id: string) =>
  (await admin().from('events').select('id, status, payload').eq('type', type).eq(`payload->>${key}`, id).order('created_at', { ascending: false }).limit(1)).data?.[0]

/** From Add your own work to the camera screen, one generated page taken and sent: the screen of the new test. */
async function sendOnePage(page: Page) {
  await page.goto('/k/own')
  await page.getByRole('link', { name: /A marked test/ }).click()
  await check(page.getByRole('heading', { level: 1, name: 'Take a photo of each page (up to 4).' })).toBeVisible()
  await page.locator('input[type="file"]').setInputFiles({ name: 'page-1.png', mimeType: 'image/png', buffer: generatedPng() })
  await check(page.getByRole('button', { name: 'Send 1 page to Jemma' })).toBeVisible()
  const posted = page.waitForResponse((r) => new URL(r.url()).pathname === '/k/upload' && r.request().method() === 'POST')
  await page.getByRole('button', { name: 'Send 1 page to Jemma' }).click()
  expect((await posted).status()).toBe(200)
  await page.waitForURL(/\/k\/own\/test\/[0-9a-f-]{36}$/, { timeout: 45_000 })
  return idOfUrl(page)
}

test.describe('Add your own work', () => {
  test('Amina sees her marked test at once, reads each question, and practises the gap of her two wrong answers', async ({ page }) => {
    const { twinId } = await aminaInMyOwn(page)

    await page.goto('/k/own')
    await check(page.getByRole('heading', { level: 1, name: 'Add your own work' })).toBeVisible()
    await expect(page.getByRole('link', { name: /A marked test/ })).toContainText('Take a photo of a test you got back. Jemma reads the ticks and crosses.')
    await expect(page.getByRole('link', { name: /Your own curriculum/ })).toContainText("Your school's plan or a book's contents. Jemma turns it into topics you check.")
    const listed = page.getByRole('link', { name: /Marked test: 6 of 8 right/ })
    await expect(listed).toBeVisible()
    await noSidewaysScroll(page)
    await proof(page, 'own-home')

    await listed.click()
    await check(page.getByRole('heading', { level: 1, name: '6 of 8 right.' })).toBeVisible()
    const questions = page.getByRole('list', { name: 'Your questions' })
    await expect(questions.getByRole('listitem')).toHaveCount(8)
    // exact: "Not right" holds "right", and a name is matched as a part of the words unless it is exact
    await expect(questions.getByRole('img', { name: 'Right', exact: true })).toHaveCount(6)
    await expect(questions.getByRole('img', { name: 'Not right', exact: true })).toHaveCount(2)
    await expect(questions.getByText('You wrote: 2/5')).toBeVisible()
    // the gap of the two wrong answers, with its Practise button
    await expect(page.getByRole('heading', { level: 2, name: 'What to practise' })).toBeVisible()
    await expect(page.getByText('Common fractions (Term 4)', { exact: true })).toBeVisible()
    await expect(page.getByText('2 wrong in this test')).toBeVisible()
    await expect(page.getByText(/could not read/)).toHaveCount(0)
    await noSidewaysScroll(page)
    await proof(page, 'own-test-marked')

    // The pages do not scroll sideways on the narrowest phone either.
    const size = page.viewportSize()!
    if (size.width < 1024) {
      await page.setViewportSize({ width: 360, height: 800 })
      for (const path of ['/k/own', '/k/own/test', '/k/own/curriculum', page.url()]) {
        await page.goto(path)
        await check(page.getByRole('heading', { level: 1 })).toBeVisible()
        await noSidewaysScroll(page)
      }
      await page.setViewportSize(size)
    }

    // Practise: Jemma is asked to write a practice on that topic, and the home says so.
    await page.getByRole('button', { name: 'Practise Common fractions (Term 4)' }).click()
    await check(page.getByRole('heading', { name: 'Jemma is writing your practice.' })).toBeVisible()
    const asked = (await admin().from('events').select('payload').eq('type', 'practice.requested').eq('payload->>childId', twinId)).data ?? []
    expect(asked).toHaveLength(1)
    expect(asked[0]!.payload).toMatchObject({ childId: twinId, topicName: 'Common fractions (Term 4)' })
  })

  test('a new marked test: Jemma is reading it, and when the results are written the screen shows the marked view', async ({ page }) => {
    const { twinId, schoolId } = await aminaInMyOwn(page)
    const paperId = await sendOnePage(page)
    await check(page.getByRole('heading', { level: 1, name: 'Jemma is reading your test.' })).toBeVisible()
    await expect(page.getByText('About a minute. You can wait here.')).toBeVisible()
    await noSidewaysScroll(page)
    await proof(page, 'own-test-reading')

    // The paper and its page, as the reader expects them, and one queued event with the twin and the paper.
    const db = admin()
    const paper = (await db.from('papers').select('test_id, child_id, owner, kind, status, name_read, total, error').eq('id', paperId).single()).data!
    expect(paper).toEqual({ test_id: null, child_id: twinId, owner: 'parent', kind: 'test', status: 'queued', name_read: null, total: null, error: null })
    const pages = (await db.from('paper_pages').select('page_no, storage_path').eq('paper_id', paperId)).data!
    expect(pages).toHaveLength(1)
    expect(pages[0]!.page_no).toBe(1)
    expect(pages[0]!.storage_path).toBe(`${schoolId}/${twinId}/own-test/${paperId}-1.png`)
    expect((await db.storage.from('papers').download(pages[0]!.storage_path)).error).toBeNull()
    const event = (await newestEvent('own_test.snapped', 'paperId', paperId))!
    expect(event).toMatchObject({ status: 'queued', payload: { childId: twinId, paperId } })

    // The spec plays the agent: the results (two ticks and a cross), the paper marked, the line the reader writes (one question left out), the event done.
    const rows = [
      { n: 1, prompt: '1. Simplify 4/8', answer_read: '1/2', correct: true, mark: 1 },
      { n: 2, prompt: '2. Add 1/4 and 1/4', answer_read: '1/2', correct: true, mark: 1 },
      { n: 3, prompt: '3. Add 1/2 and 1/3', answer_read: '2/5', correct: false, mark: 0 },
    ].map((r) => ({ ...r, paper_id: paperId, child_id: twinId, read_confidence: 0.9, crop: null, topic_id: null, topic_name: 'Marked test', misconception: null }))
    expect((await db.from('question_results').insert(rows)).error).toBeNull()
    expect((await db.from('papers').update({ status: 'marked', total: 2 }).eq('id', paperId)).error).toBeNull()
    expect((await db.from('activity_log').insert({ school_id: schoolId, child_id: twinId, class_id: null, at: new Date().toISOString(), text: 'Read your marked test: 2 of 3 right, 1 left out', tool: 'save_own_test_results', event_id: event.id })).error).toBeNull()
    expect((await db.from('events').update({ status: 'done', finished_at: new Date().toISOString() }).eq('id', event.id)).error).toBeNull()

    // The screen looks again by itself.
    await check(page.getByRole('heading', { level: 1, name: '2 of 3 right.' })).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('list', { name: 'Your questions' }).getByRole('listitem')).toHaveCount(3)
    await expect(page.getByText('Questions Jemma could not read: 1')).toBeVisible()
    await noSidewaysScroll(page)
    await proof(page, 'own-test-new-marked')

    // It is in the list of what she added, newest first, next to the preloaded one.
    await page.goto('/k/own')
    await expect(page.getByRole('link', { name: /Marked test: 2 of 3 right/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /Marked test: 6 of 8 right/ })).toBeVisible()
  })

  test('a test Jemma could not read says so, and "Take the photos again" puts it back to be read', async ({ page }) => {
    const { twinId } = await aminaInMyOwn(page)
    const paperId = await sendOnePage(page)
    const db = admin()
    const event = (await newestEvent('own_test.snapped', 'paperId', paperId))!

    // The spec plays the agent: the photo could not be read, the paper and the event failed.
    expect((await db.from('papers').update({ status: 'failed', error: 'read_failed' }).eq('id', paperId)).error).toBeNull()
    expect((await db.from('events').update({ status: 'failed', error: 'read_failed', finished_at: new Date().toISOString() }).eq('id', event.id)).error).toBeNull()
    await check(page.getByRole('heading', { level: 1, name: 'Jemma could not read this test.' })).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/k/own')
    await noSidewaysScroll(page)
    await proof(page, 'own-test-failed')

    await page.getByRole('button', { name: 'Take the photos again' }).click()
    await check(page.getByRole('heading', { level: 1, name: 'Jemma is reading your test.' })).toBeVisible()
    const paper = (await db.from('papers').select('status, error, child_id').eq('id', paperId).single()).data!
    expect(paper).toEqual({ status: 'queued', error: null, child_id: twinId })
    // The same event was put back (no second paper, no second event).
    expect((await newestEvent('own_test.snapped', 'paperId', paperId))).toMatchObject({ id: event.id, status: 'queued' })
    expect((await db.from('papers').select('id').eq('child_id', twinId).is('test_id', null)).data).toHaveLength(2)
  })

  test('her own curriculum: Jemma is reading it, then she checks the draft, takes a topic out and approves it', async ({ page }) => {
    const { sb, twinId, schoolId } = await aminaInMyOwn(page)
    await page.goto('/k/own')
    await page.getByRole('link', { name: /Your own curriculum/ }).click()
    await check(page.getByRole('heading', { level: 1, name: 'Your own curriculum' })).toBeVisible()
    await expect(page.getByLabel('Grade')).toHaveValue('6')
    await noSidewaysScroll(page)
    await proof(page, 'own-curriculum-upload')

    // A name is needed first: nothing is sent without one.
    await page.getByRole('button', { name: 'Add a file' }).click()
    await check(page.getByRole('alert').filter({ hasText: 'Give your curriculum a name first.' })).toHaveText('Give your curriculum a name first.')
    await page.getByLabel('Name it, like "My school\'s Term 1 plan"').fill("My school's Term 1 plan")

    const pdf = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Page >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n')
    const posted = page.waitForResponse((r) => new URL(r.url()).pathname === '/k/upload' && r.request().method() === 'POST')
    await page.locator('input[type="file"]').nth(1).setInputFiles({ name: 'plan.pdf', mimeType: 'application/pdf', buffer: pdf })
    expect((await posted).status()).toBe(200)
    await page.waitForURL(/\/k\/own\/curriculum\/[0-9a-f-]{36}$/, { timeout: 45_000 })
    const mapId = idOfUrl(page)
    await check(page.getByRole('heading', { level: 1, name: 'Jemma is reading your curriculum.' })).toBeVisible()
    await expect(page.getByText('A minute or two. You can wait here.')).toBeVisible()
    await noSidewaysScroll(page)
    await proof(page, 'own-curriculum-reading')

    // The private class, the twin in it, the document, the draft map and one queued event.
    const db = admin()
    const map = (await db.from('curriculum_maps').select('class_id, status').eq('id', mapId).single()).data!
    expect(map.status).toBe('draft')
    const cls = (await db.from('classes').select('school_id, name, grade, subject').eq('id', map.class_id).single()).data!
    expect(cls).toEqual({ school_id: schoolId, name: "My school's Term 1 plan", grade: 6, subject: 'Mathematics' })
    expect((await db.from('enrolments').select('child_id').eq('class_id', map.class_id)).data).toEqual([{ child_id: twinId }])
    const docs = (await db.from('curriculum_docs').select('title, pages, storage_path').eq('class_id', map.class_id)).data!
    expect(docs).toHaveLength(1)
    expect(docs[0]).toMatchObject({ title: 'plan', pages: 1 })
    expect(docs[0]!.storage_path.startsWith(`${schoolId}/${map.class_id}/`)).toBe(true)
    expect(await newestEvent('curriculum.uploaded', 'mapId', mapId)).toMatchObject({ status: 'queued', payload: { mapId } })

    // The list on Add your own work says so.
    await page.goto('/k/own')
    await expect(page.getByRole('link', { name: /My school's Term 1 plan/ })).toContainText('Jemma is reading it')
    await page.goBack()

    // The spec plays the agent: the draft is written into the map.
    const topic = (name: string, family: string, prerequisites: string[] = []) => ({ name, family, prerequisites, misconceptions: [] })
    const draft = {
      grade: 6,
      terms: [
        { term: 1, topics: [topic('Whole numbers', 'whole_numbers'), topic('Fractions', 'fractions', ['Whole numbers'])] },
        { term: 2, topics: [topic('Decimals', 'decimals', ['Fractions'])] },
      ],
      leftOut: [{ name: 'Probability', reason: 'It is not in Grade 6.' }],
    }
    expect((await db.from('curriculum_maps').update({ draft }).eq('id', mapId)).error).toBeNull()

    // The screen looks again by itself and shows the draft: the terms, what each needs, what was left out.
    await check(page.getByRole('heading', { level: 1, name: 'Check your topics.' })).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('heading', { level: 2, name: 'Term 1' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Term 2' })).toBeVisible()
    await expect(page.getByText('Needs topic 1')).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Jemma left these out' })).toBeVisible()
    await noSidewaysScroll(page)
    await proof(page, 'own-curriculum-draft')

    // Take one topic out, then approve.
    await page.getByRole('button', { name: 'Take out Decimals' }).click()
    await check(page.getByRole('heading', { level: 2, name: 'Term 2' })).toHaveCount(0)
    await page.getByRole('button', { name: 'These look right' }).click()
    await check(page.getByRole('heading', { level: 1, name: 'Done. Find it in My maths.' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open My maths' })).toHaveAttribute('href', '/k/maths?grade=6')
    await noSidewaysScroll(page)
    await proof(page, 'own-curriculum-done')

    // The class has the topics that were kept, the map is approved, and the approval names Amina.
    expect((await db.from('curriculum_maps').select('status').eq('id', mapId).single()).data!.status).toBe('approved')
    const topics = (await db.from('topics').select('name, term, position').eq('map_id', mapId).order('position')).data!
    expect(topics).toEqual([
      { name: 'Whole numbers', term: 1, position: 1 },
      { name: 'Fractions', term: 1, position: 2 },
    ])
    const approvals = (await db.from('approvals').select('kind, decision, decided_by_name, school_id').eq('ref_id', mapId)).data!
    expect(approvals).toEqual([{ kind: 'topic_map', decision: 'approved', decided_by_name: 'Amina', school_id: schoolId }])
    // Nothing of the school moved: Amina's school child has no own class and the school's own classes are the same five.
    expect((await db.from('enrolments').select('class_id').eq('child_id', sb.childId)).data).toHaveLength(1)
  })

  test('a learner in My school is told to switch, and has no way to add anything there', async ({ page }) => {
    const sb = await openSandbox(page, { stage: 'start', role: 'learner' })
    opened.push(sb)
    await page.goto('/k/own')
    await check(page.getByText('Switch to My own to add your own work.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'My school' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('link', { name: /A marked test/ })).toHaveCount(0)
    await page.goto('/k/own/test')
    await check(page.getByText('Switch to My own to add your own work.')).toBeVisible()
    await noSidewaysScroll(page)
    await proof(page, 'own-in-school')
  })
})
