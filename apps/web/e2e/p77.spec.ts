import { deflateSync, crc32 } from 'node:zlib'
import { mkdirSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { resolve } from 'node:path'
import { createServiceClient } from '@jemma/profiling/db'
import { afterEventFailed, endEventFailed } from '@jemma/profiling/orchestrator'
import { expect, test as base, type Page } from '@playwright/test'
import { answerKeyItems } from '../../../supabase/seed/fixtures/marked-state'
import { openSandbox, type OpenedSandbox } from './helpers/sandbox'

// A read that failed says so. When the job behind a photo ends failed for good:
//  (i)   the memo screen shows "Jemma could not read the memo." with a retake and a retry, not "Reading the memo" for ever;
//  (ii)  a teacher's paper shows as needing a retake, and the Needs you list holds its item;
//  (iii) a parent's homework photo shows the "Check the photo" screen.
// The stand-in agent below answers 202 to every post and runs no job, so each event waits `queued` until the spec ends it the way the
// agent does: `endEventFailed`, then `afterEventFailed` (both are the functions the agent calls). Nothing here calls a model.
//
// Run it against a production build, on the ports of the packet (web 3276, the stand-in agent 8776), phone project only:
//   pnpm --filter web build
//   AGENT_URL=http://127.0.0.1:8776 pnpm --filter web exec next start --port 3276        (own terminal, stop it by its pid after)
//   P77_PROOF=1 PREVIEW_URL=http://localhost:3276 pnpm --filter web exec playwright test p77 --project=phone --workers=1
// Screenshots for the reviewer are written only when P77_PROOF is set, to design/proof/p77 (390 wide only).

const check = expect.configure({ timeout: 45_000 })
const admin = () => createServiceClient({ SUPABASE_URL: process.env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY! })
const STOPPED = 'Jemma stopped answering. Try again.'

const proofDir = resolve(import.meta.dirname, '../../../design/proof/p77')
async function proof(page: Page, name: string) {
  if (!process.env.P77_PROOF) return
  mkdirSync(proofDir, { recursive: true })
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: 'nextjs-portal{display:none} *{transition:none !important;animation:none !important}' })
  await page.screenshot({ path: resolve(proofDir, `${name}-390.png`), fullPage: true })
}

/** The agent's stand-in: accepts every post to /events, so the web app believes the agent took the event. It runs no job. */
let agent: Server
base.beforeAll(async () => {
  agent = createServer((req, res) => {
    if (req.url === '/health') return void res.writeHead(200).end('ok')
    req.resume()
    req.on('end', () => res.writeHead(202, { 'content-type': 'application/json' }).end('{"queued":true}'))
  })
  await new Promise<void>((done) => agent.listen(8776, done))
})
base.afterAll(async () => {
  await new Promise((done) => agent.close(done))
})

/** A small valid PNG, built here so the spec needs no file next to it. `note` makes two photos differ. */
function png(note = ''): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(4)
    head.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
    const tail = Buffer.alloc(4)
    tail.writeUInt32BE(crc32(body))
    return Buffer.concat([head, body, tail])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(2, 0)
  ihdr.writeUInt32BE(2, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const rows = Buffer.concat([0, 1].map(() => Buffer.from([0, 200, 120, 90, 200, 120, 90])))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('tEXt', Buffer.from(`Comment\0 a photo of a page${note}`, 'latin1')),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** The one post that carries a file to the upload route of this space, and its answer. */
async function uploadVia(page: Page, space: 't' | 'p', act: () => Promise<void>) {
  const path = `/${space}/upload`
  const answered = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === path, { timeout: 120_000 })
  await act()
  const response = await answered
  expect(response.status()).toBe(200)
  return (await response.json()) as { result: { ok: boolean; paperId?: string } }
}

/** Ends an event failed for good the way the agent does, and lets the paper say so. */
async function endFailed(eventId: string) {
  const db = admin()
  const ended = await endEventFailed(db, eventId, STOPPED, 1, new Date().toISOString())
  expect(ended.error, 'the event is ended').toBeNull()
  expect(ended.data, 'one event ended').toHaveLength(1)
  await afterEventFailed(db, ended.data![0]!)
}

const opened: OpenedSandbox[] = []
base.afterAll(async () => {
  base.setTimeout(240_000)
  await Promise.all(opened.map((s) => s.cleanup().catch(() => undefined)))
})
async function sandbox(page: Page, stage: 'start' | 'marked' | 'session_done', role: 'teacher' | 'parent') {
  const s = await openSandbox(page, { stage, role })
  opened.push(s)
  return s
}

const test = base
test.use({ screenshot: 'only-on-failure', actionTimeout: 45_000 })
test.setTimeout(240_000)

test.describe('a read that failed says so', () => {
  test('(i) the memo screen shows the card, "Try the same photo again" asks again, "Take the photo again" sends a new photo', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'the key screens are phone screens')
    const sb = await sandbox(page, 'start', 'teacher')
    const db = admin()
    const made = await db.from('tests').insert({ class_id: sb.classId, title: 'Class Test 1: Fractions and decimals', written_on: '2026-11-02', out_of: 10, topic_ids: [], held: true }).select('id').single()
    expect(made.error).toBeNull()
    const testId = made.data!.id
    const keyUrl = `/t/${sb.classId}/snap/${testId}/key`
    const keyEvents = async () => (await db.from('events').select('id, status, error, payload').eq('type', 'key.snapped').eq('payload->>testId', testId).order('created_at')).data ?? []

    // a test made with the memo photo: Jemma worked a key out, and the teacher sends the memo through Retake. The event is the one the
    // memo makes, and it waits queued (the stand-in runs no job).
    expect((await db.from('answer_keys').insert({ test_id: testId, status: 'draft', items: answerKeyItems() })).error).toBeNull()
    await page.goto(keyUrl)
    await check(page.getByText('Memo, 1 page')).toBeVisible()
    const sent = await uploadVia(page, 't', () => page.locator('label', { hasText: /^Retake/ }).locator('input[type=file]').setInputFiles({ name: 'memo.png', mimeType: 'image/png', buffer: png() }))
    expect(sent.result).toEqual({ ok: true })
    await expect.poll(async () => (await keyEvents()).length, { timeout: 30_000 }).toBe(1)
    const eventId = (await keyEvents())[0]!.id
    expect((await keyEvents())[0]!.status).toBe('queued')

    // the read failed for good, and no answer was saved: the key has no items
    expect((await db.from('answer_keys').update({ items: [] }).eq('test_id', testId)).error).toBeNull()
    await endFailed(eventId)
    await page.goto(keyUrl)
    await check(page.getByRole('heading', { level: 1, name: 'Jemma could not read the memo.' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Reading the memo' })).toHaveCount(0)
    await expect(page.getByText('Take the photo again, closer and in good light. Or try the same photo once more.')).toBeVisible()
    await expect(page.locator('label', { hasText: 'Take the photo again' }).locator('input[type=file]')).toBeAttached()
    await expect(page.getByRole('button', { name: 'Try the same photo again' })).toBeVisible()
    await proof(page, 'memo-read-failed')

    // "Try the same photo again": the event goes back to queued (the stand-in answers 202), nothing is uploaded, the screen is "Reading the memo"
    await page.getByRole('button', { name: 'Try the same photo again' }).click()
    await check(page.getByRole('heading', { name: 'Reading the memo' })).toBeVisible()
    await expect.poll(async () => (await keyEvents())[0]?.status, { timeout: 30_000 }).toBe('queued')
    const again = (await keyEvents())[0]!
    expect(again).toMatchObject({ id: eventId, error: null })
    expect(again.payload).toEqual({ testId })
    expect(await keyEvents(), 'the same event, not a new one').toHaveLength(1)
    await expect(page.getByRole('heading', { name: 'Jemma could not read the memo.' })).toHaveCount(0)
    await proof(page, 'memo-reading-again')

    // it fails again: "Take the photo again" goes through the upload route, and the screen is "Reading the memo" with a new event
    await endFailed(eventId)
    await page.goto(keyUrl)
    await check(page.getByRole('heading', { name: 'Jemma could not read the memo.' })).toBeVisible()
    const second = await uploadVia(page, 't', () => page.locator('label', { hasText: 'Take the photo again' }).locator('input[type=file]').setInputFiles({ name: 'memo-closer.png', mimeType: 'image/png', buffer: png(' closer') }))
    expect(second.result).toEqual({ ok: true })
    await check(page.getByRole('heading', { name: 'Reading the memo' })).toBeVisible()
    await expect.poll(async () => (await keyEvents()).length, { timeout: 30_000 }).toBe(2)
    expect((await keyEvents()).map((e) => e.status)).toEqual(['failed', 'queued'])
  })

  test("(ii) a teacher's paper whose read failed shows as needing a retake, and the Needs you list holds its item", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'the paper buttons are phone buttons')
    const sb = await sandbox(page, 'session_done', 'teacher')
    const db = admin()
    const snapTest = (await db.from('tests').select('id').eq('class_id', sb.classId).single()).data!
    const papersUrl = `/t/${sb.classId}/snap/${snapTest.id}/papers`
    await page.goto(papersUrl)
    await check(page.getByRole('heading', { name: '5 papers in. Snap the next one, or add a page.' })).toBeVisible()

    // one more photo: a paper and its event, queued
    const sent = await uploadVia(page, 't', () => page.getByTestId('snap-paper').setInputFiles({ name: 'snap.png', mimeType: 'image/png', buffer: png() }))
    const paperId = sent.result.paperId!
    expect(paperId).toMatch(/^[0-9a-f-]{36}$/)
    await check(page.getByRole('heading', { name: '6 papers in. Snap the next one, or add a page.' })).toBeVisible()
    const event = (await db.from('events').select('id, status').eq('type', 'paper.snapped').eq('payload->>paperId', paperId).single()).data!
    expect(event.status).toBe('queued')

    // the read failed for good
    await endFailed(event.id)
    expect((await db.from('events').select('status, error').eq('id', event.id).single()).data).toEqual({ status: 'failed', error: STOPPED })
    expect((await db.from('papers').select('status, error').eq('id', paperId).single()).data).toEqual({ status: 'needs_you', error: 'read_failed' })
    const items = (await db.from('needs_you_items').select('kind, status, title, detail').eq('ref_id', paperId)).data ?? []
    expect(items).toEqual([{ kind: 'confirm_scan', status: 'open', title: 'Jemma could not read this photo', detail: expect.stringMatching(/ · retake the photo or check it yourself$/) }])

    // the papers screen: no longer "waiting", needs you, with its retake button
    await page.goto(papersUrl)
    await check(page.getByText('1 page · needs you')).toBeVisible()
    await expect(page.getByText(/· waiting|· reading now/)).toHaveCount(0)
    await expect(page.locator('label[aria-label="Retake paper 6"]')).toBeVisible()
    await proof(page, 'papers-needs-retake')

    // the Needs you list of the class holds the item
    await page.goto(`/t/${sb.classId}`)
    await check(page.getByText('Jemma could not read this photo').first()).toBeVisible()
    await proof(page, 'class-needs-you')

    // the item opens the papers screen of the test, where the retake button is (it was a 404 before)
    await page.getByText('Jemma could not read this photo').first().click()
    await expect(page).toHaveURL(new RegExp(`/t/${sb.classId}/snap/${snapTest.id}/papers$`), { timeout: 45_000 })
    await check(page.locator('label[aria-label="Retake paper 6"]')).toBeVisible()
  })

  test("(iii) a parent's homework photo whose read failed shows the Check the photo screen", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'the parent screens are phone screens')
    const sb = await sandbox(page, 'marked', 'parent')
    const db = admin()
    await page.goto(`/p/${sb.childId}/snap/photo?kind=homework`)
    await check(page.getByText('Homework · page 1')).toBeVisible()
    await page.locator('input[type=file]').setInputFiles({ name: 'homework.png', mimeType: 'image/png', buffer: png() })
    await check(page.getByText('Homework · page 2')).toBeVisible()
    const sent = await uploadVia(page, 'p', () => page.getByRole('button', { name: 'Done' }).click())
    const paperId = sent.result.paperId!
    await expect(page).toHaveURL(/\/snap\/[0-9a-f-]{36}$/, { timeout: 60_000 })
    await check(page.getByRole('heading', { level: 1, name: /^Reading Amina's homework\./ })).toBeVisible()
    const event = (await db.from('events').select('id, status').eq('type', 'homework.snapped').eq('payload->>paperId', paperId).single()).data!
    expect(event.status).toBe('queued')

    await endFailed(event.id)
    expect((await db.from('papers').select('status, error').eq('id', paperId).single()).data).toEqual({ status: 'failed', error: 'read_failed' })
    expect((await db.from('needs_you_items').select('id').eq('ref_id', paperId)).data, 'the parent gets no Needs you item').toEqual([])

    await page.reload()
    await check(page.getByRole('heading', { level: 1, name: 'Jemma could not read this photo.' })).toBeVisible()
    await expect(page.getByText('Check the photo', { exact: true })).toBeVisible()
    await expect(page.getByText('Another photo usually fixes it.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Retake photo' })).toBeVisible()
    await proof(page, 'parent-check-the-photo')
  })
})
