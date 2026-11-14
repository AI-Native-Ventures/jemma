import { mkdirSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { resolve } from 'node:path'
import { deflateSync } from 'node:zlib'
import { createServiceClient, type Json } from '@jemma/profiling/db'
import { paperQuestions } from '@jemma/profiling/logic'
import { LessonSchema } from '@jemma/profiling/schemas'
import { expect, test as base, type Page } from '@playwright/test'
import { openSandbox, type OpenedSandbox } from './helpers/sandbox'

// A learner can answer a practice on paper and send one photo. After Learn the screen asks how to answer. "Answer on paper" shows the five
// questions of `paperQuestions`, numbered 1 to 5, with one button that takes a photo. The photo goes through the learner's upload route
// (/k/upload, `snapPractice`), the screen says Jemma is reading it and asks again every 3 seconds. When the read is done the Results screen of
// today shows, built from the stored items. When the read failed the screen says so and offers the photo again or the screen.
//
// The stand-in agent below answers 202 to every post and runs no job, so the spec plays the agent where the job would run: it writes the five
// try answers and closes the session with the service client (what `save_practice_answers` does), or ends the event failed. Nothing here
// calls a model, and no real photo of handwriting is read: the photo is a small generated PNG.
//
// WRITTEN, NOT RUN (the shared database could not take a browser spec when this was written). Run it against a production build, phone project:
//   pnpm --filter web build
//   AGENT_URL=http://127.0.0.1:8783 pnpm --filter web exec next start --port 3283        (own terminal, stop it by its pid after)
//   P83_PROOF=1 PREVIEW_URL=http://localhost:3283 pnpm --filter web exec playwright test p83 --project=phone --workers=1
// Screenshots are written only when P83_PROOF is set, to design/proof/p83 (390 wide).

const check = expect.configure({ timeout: 45_000 })
const admin = () => createServiceClient({ SUPABASE_URL: process.env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY! })

const proofDir = resolve(import.meta.dirname, '../../../design/proof/p83')
async function proof(page: Page, name: string) {
  if (!process.env.P83_PROOF) return
  mkdirSync(proofDir, { recursive: true })
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: 'nextjs-portal{display:none} *{transition:none !important;animation:none !important}' })
  // The session overlay scrolls inside itself, so grow the viewport to its content to capture a whole screen.
  const height = await page.evaluate(() =>
    Math.max(document.documentElement.scrollHeight, ...Array.from(document.querySelectorAll<HTMLElement>('.fixed.inset-0')).map((e) => e.scrollHeight)),
  )
  const size = page.viewportSize()!
  if (height > size.height) await page.setViewportSize({ width: size.width, height })
  await page.screenshot({ path: resolve(proofDir, `${name}-390.png`), fullPage: true })
  await page.setViewportSize(size)
}

/** The agent's stand-in: accepts every post to /events, so the web app believes the agent took the event. It runs no job. */
let agent: Server
// The port the web app posts to (its AGENT_URL). CI frees 8787 (the real agent's) and sets STAND_IN_AGENT_PORT=8787.
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
// A copy is removed as soon as its test is over: every copy adds topics that each screen reads through row level security, so copies left
// standing until the end of the file make every screen slower (seen on CI).
base.afterEach(async () => {
  await Promise.all(opened.splice(0).map((s) => s.cleanup().catch(() => undefined)))
})
async function sandbox(page: Page, role: 'learner' | 'teacher' = 'learner') {
  const s = await openSandbox(page, { stage: 'marked', role })
  opened.push(s)
  return s
}

const test = base
test.use({ screenshot: 'only-on-failure', actionTimeout: 45_000 })
test.setTimeout(240_000)

/** A small valid PNG made here (a page of ruled lines), so no file is needed and no real handwriting is claimed. */
function generatedPng(): Buffer {
  const width = 96
  const height = 64
  const raw = Buffer.alloc((width * 3 + 1) * height, 255)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0 // filter: none
    if (y % 12 === 6) for (let x = 0; x < width * 3; x++) raw[y * (width * 3 + 1) + 1 + x] = 150
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (bytes: Buffer) => {
    let c = 0xffffffff
    for (const b of bytes) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const out = Buffer.alloc(body.length + 8)
    out.writeUInt32BE(data.length, 0)
    body.copy(out, 4)
    out.writeUInt32BE(crc(body), body.length + 4)
    return out
  }
  const head = Buffer.alloc(13)
  head.writeUInt32BE(width, 0)
  head.writeUInt32BE(height, 4)
  head.set([8, 2, 0, 0, 0], 8) // 8 bits, RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

const sessionOf = async (childId: string) => {
  const { data } = await admin().from('sessions').select('id, lesson_id').eq('child_id', childId).eq('status', 'planned').not('lesson_id', 'is', null).single()
  const lesson = LessonSchema.parse((await admin().from('lessons').select('content').eq('id', data!.lesson_id!).single()).data!.content)
  return { id: data!.id, lesson }
}
const snaps = async (sessionId: string) =>
  (await admin().from('events').select('id, status, payload').eq('type', 'practice.snapped').eq('payload->>sessionId', sessionId).order('created_at')).data ?? []

/** From the learner's home to the choice: the warm-up, the lesson, "I'm ready". */
async function toTheChoice(page: Page) {
  await page.goto('/k')
  await page.getByRole('link', { name: 'Start' }).click()
  for (const n of [1, 2]) {
    await check(page.getByText(`Warm-up · ${n} of 2`)).toBeVisible()
    await page.getByRole('button', { pressed: false }).first().click()
    await page.getByRole('button', { name: 'Next', exact: true }).click()
  }
  await page.getByRole('button', { name: "I'm ready" }).click()
  await check(page.getByRole('heading', { name: 'How do you want to answer?' })).toBeVisible()
}

const noHorizontalScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)

test.describe('a learner answers a practice on paper', () => {
  test('Amina chooses paper, sees five numbered questions, sends a photo, waits, and reads her results', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'the learner screens are phone screens')
    const sb = await sandbox(page)
    const { id: sessionId, lesson } = await sessionOf(sb.childId)
    await toTheChoice(page)

    // the choice: two buttons, the paper one first, neither bigger
    const paper = page.getByRole('button', { name: 'Answer on paper', exact: true })
    const screen = page.getByRole('button', { name: 'Answer on the screen', exact: true })
    await expect(paper).toBeVisible()
    await expect(screen).toBeVisible()
    const [a, b] = [await paper.boundingBox(), await screen.boundingBox()]
    expect(a!.y).toBeLessThan(b!.y)
    expect([a!.width, a!.height]).toEqual([b!.width, b!.height])
    await noHorizontalScroll(page)
    await proof(page, 'choice')

    // the sheet: the five questions of paperQuestions, numbered 1 to 5, the way the question screen draws them
    await paper.click()
    await check(page.getByRole('heading', { level: 1, name: 'Write your answers on paper. Number them 1 to 5.' })).toBeVisible()
    const wanted = paperQuestions(lesson).map((i) => lesson.questions[i]!.prompt)
    expect(wanted).toHaveLength(5)
    const items = page.locator('li[data-n]')
    await expect(items).toHaveCount(5)
    for (const [i, prompt] of wanted.entries()) {
      await expect(items.nth(i)).toHaveAttribute('data-n', String(i + 1))
      await expect(items.nth(i).locator('h2[data-prompt]')).toHaveAttribute('data-prompt', prompt)
    }
    // the answer key never reaches the screen
    const body = (await page.locator('body').innerText()).toLowerCase()
    expect(body).not.toContain('right way')
    await expect(page.getByRole('button', { name: 'Answer on the screen instead' })).toBeVisible()
    await noHorizontalScroll(page)
    await proof(page, 'sheet')

    // one photo, through the learner's upload route
    const png = generatedPng()
    const posted = page.waitForResponse((r) => new URL(r.url()).pathname === '/k/upload' && r.request().method() === 'POST')
    await page.getByTestId('paper-photo').setInputFiles({ name: 'answers.png', mimeType: 'image/png', buffer: png })
    expect((await posted).status()).toBe(200)
    await check(page.getByRole('heading', { name: 'Jemma is reading your answers.' })).toBeVisible()
    await expect(page.getByText('About a minute. You can wait here.')).toBeVisible()
    await proof(page, 'reading')

    // one event, with the stored photo and the five questions; the session is running
    const [event] = await snaps(sessionId)
    expect(event).toMatchObject({ status: 'queued', payload: { sessionId, questions: paperQuestions(lesson) } })
    const path = (event!.payload as { path: string }).path
    expect(path).toMatch(new RegExp(`^[0-9a-f-]{36}/${sb.childId}/practice/${sessionId}-\\d+\\.jpg$`))
    const stored = await admin().storage.from('papers').download(path)
    expect(Buffer.from(await stored.data!.arrayBuffer()).equals(png)).toBe(true)
    expect((await admin().from('sessions').select('status').eq('id', sessionId).single()).data?.status).toBe('in_progress')

    // the spec plays the agent: five try answers (the second wrong, the fourth not read) and the session closed, as `save_practice_answers` does
    const db = admin()
    const picks = paperQuestions(lesson).map((i) => lesson.questions[i]!)
    const rows = picks.map((q, i) => {
      const unread = i === 3
      const wrong = i === 1
      return {
        session_id: sessionId,
        position: i + 1,
        phase: 'try' as const,
        question: (unread ? { ...q, unread: true } : q) as unknown as NonNullable<Json>,
        difficulty: q.difficulty,
        answer: unread ? '' : wrong ? '1/99' : q.answer,
        correct: !unread && !wrong,
        seconds: 0,
        adapted: null,
      }
    })
    expect((await db.from('session_items').insert(rows)).error).toBeNull()
    expect((await db.from('sessions').update({ status: 'done', right: 3, minutes: 9, finished_at: new Date().toISOString() }).eq('id', sessionId)).error).toBeNull()

    // the screen asks again by itself and shows the Results of today, built from the stored items
    await check(page.getByRole('heading', { name: 'You finished, Amina!' })).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('heading', { name: 'Question 2' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Question 4' })).toBeVisible()
    await expect(page.getByRole('heading', { name: /^Question [135]$/ })).toHaveCount(0)
    // the question Jemma could not read says so under "You wrote", in place of an empty answer
    await expect(page.getByText('Jemma could not read this one')).toHaveCount(1)
    await expect(page.getByText('Jemma could not read this one')).toBeVisible()
    await noHorizontalScroll(page)
    await proof(page, 'results')

    // the same ending as on the screen: Got it, the progress, Done
    await page.getByRole('button', { name: 'Got it' }).click()
    await expect(page.getByRole('button', { name: 'Done' })).toBeVisible()
  })

  test('a photo that could not be read says so, and the child takes it again or answers on the screen', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'the learner screens are phone screens')
    const sb = await sandbox(page)
    const { id: sessionId } = await sessionOf(sb.childId)
    await toTheChoice(page)
    await page.getByRole('button', { name: 'Answer on paper', exact: true }).click()
    await page.getByTestId('paper-photo').setInputFiles({ name: 'answers.png', mimeType: 'image/png', buffer: generatedPng() })
    await check(page.getByRole('heading', { name: 'Jemma is reading your answers.' })).toBeVisible()

    // the job ended failed for good
    const db = admin()
    const [event] = await snaps(sessionId)
    expect((await db.from('events').update({ status: 'failed', error: 'the vision model kept failing', finished_at: new Date().toISOString() }).eq('id', event!.id)).error).toBeNull()
    await check(page.getByRole('heading', { name: 'Jemma could not read your photo.' })).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText('the vision model kept failing')).toHaveCount(0)
    await expect(page.locator('label', { hasText: 'Take the photo again' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Answer on the screen instead' })).toBeVisible()
    await noHorizontalScroll(page)
    await proof(page, 'failed')

    // a reload comes back to the same card, not to the choice
    await page.reload()
    await check(page.getByRole('heading', { name: 'Jemma could not read your photo.' })).toBeVisible()

    // the photo again: a second event, and the wait
    await page.getByTestId('paper-photo').setInputFiles({ name: 'answers-again.png', mimeType: 'image/png', buffer: generatedPng() })
    await check(page.getByRole('heading', { name: 'Jemma is reading your answers.' })).toBeVisible()
    expect(await snaps(sessionId)).toHaveLength(2)

    // that one failed too: the screen. The questions are asked one at a time, as they always were.
    const second = (await snaps(sessionId))[1]!
    expect((await db.from('events').update({ status: 'failed', error: 'x', finished_at: new Date().toISOString() }).eq('id', second.id)).error).toBeNull()
    await check(page.getByRole('heading', { name: 'Jemma could not read your photo.' })).toBeVisible({ timeout: 60_000 })
    await page.getByRole('button', { name: 'Answer on the screen instead' }).click()
    await check(page.getByText('Question 1 of 5')).toBeVisible()
  })

  test('answering on the screen is the flow it always was', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'the learner screens are phone screens')
    const sb = await sandbox(page)
    const { id: sessionId } = await sessionOf(sb.childId)
    await toTheChoice(page)
    await page.getByRole('button', { name: 'Answer on the screen', exact: true }).click()
    await check(page.getByText('Question 1 of 5')).toBeVisible()
    expect(await snaps(sessionId)).toHaveLength(0)
  })
})

test.describe('the learner upload route', () => {
  test('refuses another site, a signed-out post, a teacher, an action that is not its own, and a session that is not the learner\'s', async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'the learner screens are phone screens')
    const sb = await sandbox(page)
    const { id: sessionId } = await sessionOf(sb.childId)
    const mine = new URL(process.env.PLAYWRIGHT_BASE_URL!).origin
    const asks = (action: string, args: string[]) => ({ multipart: { __action: action, __args: JSON.stringify(args) }, maxRedirects: 0 })
    await page.goto('/k')

    // signed in as the learner (page.request shares the page's cookies): another site, or none, is 403
    const evil = await page.request.post('/k/upload', { ...asks('snapPractice', [sessionId]), headers: { origin: 'https://evil.example' } })
    expect(evil.status()).toBe(403)
    expect((await page.request.post('/k/upload', asks('snapPractice', [sessionId]))).status()).toBe(403)
    // an action that is not on the list, the teacher's and the parent's included
    for (const action of ['uploadCurriculum', 'snapHomework', 'answer']) {
      expect((await page.request.post('/k/upload', { ...asks(action, [sessionId]), headers: { origin: mine } })).status(), action).toBe(400)
    }
    // the right action with no photo: the function says what is missing, and nothing is stored
    const none = await page.request.post('/k/upload', { ...asks('snapPractice', [sessionId]), headers: { origin: mine } })
    expect(none.status()).toBe(200)
    expect(await none.json()).toEqual({ result: { ok: false, message: 'Send one photo of your answers.' } })
    expect(await snaps(sessionId)).toHaveLength(0)
    // a session that is not the learner's: refused by the function's own check, with no text of the error in the answer
    const other = await page.request.post('/k/upload', { ...asks('snapPractice', ['00000000-0000-4000-8000-000000000000']), headers: { origin: mine } })
    expect(other.status()).toBe(500)
    expect(await other.json()).toEqual({ error: 'failed' })

    // nobody signed in (the `request` fixture has no cookies): sent to sign-in
    const anon = await request.post('/k/upload', { ...asks('snapPractice', [sessionId]), headers: { origin: mine } })
    expect(anon.status()).toBe(307)
    expect(anon.headers()['location']).toMatch(/\/sign-in$/)
  })

  test('a teacher on the learner route is sent to the teacher space, and the function is never reached', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'the learner screens are phone screens')
    const sb = await sandbox(page, 'teacher')
    const mine = new URL(process.env.PLAYWRIGHT_BASE_URL!).origin
    await page.goto(`/t/${sb.classId}`)
    const res = await page.request.post('/k/upload', { multipart: { __action: 'snapPractice', __args: JSON.stringify(['00000000-0000-4000-8000-000000000000']) }, maxRedirects: 0, headers: { origin: mine } })
    expect(res.status()).toBe(307)
    expect(res.headers()['location']).toMatch(/\/t$/)
  })
})
