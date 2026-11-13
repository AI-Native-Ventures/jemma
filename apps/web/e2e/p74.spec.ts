import { deflateSync, crc32 } from 'node:zlib'
import { mkdirSync, readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { resolve } from 'node:path'
import { createServiceClient } from '@jemma/profiling/db'
import { expect, test as base, type Page, type Request } from '@playwright/test'
import { answerKeyItems } from '../../../supabase/seed/fixtures/marked-state'
import { openSandbox, type OpenedSandbox } from './helpers/sandbox'

// Files reach Jemma through a plain upload route (/t/upload, /p/upload), not through a form action. Cloudflare's edge refuses a
// request that has a `next-action` header and the bytes '$F or "$F in its body, and a PDF or a photo holds them by chance. The edge
// cannot be reached from here: this spec proves the part that can be proven locally. A file's bytes travel in a POST to the route
// with no `next-action` header, nothing on a screen sends one with a file, and the bytes are stored whole.
//
// Run it against a production build, on the ports of the packet (the stand-in agent below listens on 8774):
//   pnpm --filter web build
//   AGENT_URL=http://127.0.0.1:8774 pnpm --filter web exec next start --port 3274        (own terminal, stop it by its pid after)
//   PREVIEW_URL=http://localhost:3274 pnpm --filter web exec playwright test p74 --workers=1
// Screenshots for the reviewer are written only when P74_PROOF is set, to design/proof/p74, named by width (390 or 1440).

const check = expect.configure({ timeout: 45_000 })
const admin = () => createServiceClient({ SUPABASE_URL: process.env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY! })
/**
 * The bytes stored under a path. Read through a signed address, which is new each time: a replaced object (a retaken photo is written
 * over the same path) is never read from a cache that still holds the old one.
 */
async function bytesOf(bucket: 'papers' | 'curriculum', path: string): Promise<Buffer> {
  // the shared database drops a request now and then ("fetch failed"): ask again a few times before calling it a failure
  let last: unknown
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const signed = await admin().storage.from(bucket).createSignedUrl(path, 120)
      if (signed.error) throw signed.error
      const res = await fetch(signed.data.signedUrl)
      if (res.status !== 200) throw new Error(`stored object answered ${res.status}`)
      return Buffer.from(await res.arrayBuffer())
    } catch (e) {
      last = e
      await new Promise((done) => setTimeout(done, 1500))
    }
  }
  throw last
}
const FIXTURES = resolve(import.meta.dirname, '../../../fixtures/curriculum/unseen')
const GRADE9 = 'grade9-mathematics-za.pdf'

const proofDir = resolve(import.meta.dirname, '../../../design/proof/p74')
async function proof(page: Page, name: string) {
  if (!process.env.P74_PROOF) return
  mkdirSync(proofDir, { recursive: true })
  const width = page.viewportSize()!.width >= 1024 ? 1440 : page.viewportSize()!.width
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: 'nextjs-portal{display:none} *{transition:none !important;animation:none !important}' })
  await page.screenshot({ path: resolve(proofDir, `${name}-${width}.png`), fullPage: true })
}

/** The agent's stand-in: accepts every post to /events, so the web app believes the agent took the event. It runs no job. */
let agent: Server
base.beforeAll(async () => {
  agent = createServer((req, res) => {
    if (req.url === '/health') return void res.writeHead(200).end('ok')
    req.resume()
    req.on('end', () => res.writeHead(202, { 'content-type': 'application/json' }).end('{"queued":true}'))
  })
  await new Promise<void>((done) => agent.listen(8774, done))
})
base.afterAll(async () => {
  await new Promise((done) => agent.close(done))
})

/**
 * A small valid PNG whose text chunk holds the four spellings the edge refuses: '$F, "$F and the same with a space after the quote.
 * Built here so the spec needs no file next to it. The chunks carry their real CRCs, so a reader that checks them is satisfied.
 */
function trickyPng(note = ''): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(4)
    head.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
    const tail = Buffer.alloc(4)
    tail.writeUInt32BE(crc32(body))
    return Buffer.concat([head, body, tail])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(2, 0) // width
  ihdr.writeUInt32BE(2, 4) // height
  ihdr[8] = 8 // 8 bits
  ihdr[9] = 2 // RGB
  const rows = Buffer.concat([0, 1].map(() => Buffer.from([0, 200, 120, 90, 200, 120, 90])))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('tEXt', Buffer.from(`Comment\0 '$F "$F ' $F " $F${note}`, 'latin1')),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** What one request looked like, read when it was sent. */
type Sent = { method: string; path: string; search: string; rsc: boolean; nextAction: boolean; contentType: string; body: Buffer | null; names: string[] }
async function describeRequest(request: Request): Promise<Sent> {
  const headers = await request.allHeaders().catch(() => request.headers())
  const body = request.postDataBuffer()
  const names = body ? [...body.toString('latin1').matchAll(/filename="([^"]*)"/g)].map((m) => m[1]!) : []
  const url = new URL(request.url())
  return { method: request.method(), path: url.pathname, search: url.search, rsc: 'rsc' in headers, nextAction: 'next-action' in headers, contentType: headers['content-type'] ?? '', body, names }
}

/**
 * Every request of the page is listened to. After each test of this spec: no request with a `next-action` header carries a file.
 * Two ways to know. When Playwright gives the body (`postDataBuffer()`), a `filename=` in it is a file. When it gives none, the
 * content type and the header are the evidence: a form action with plain arguments is text/plain, and it is multipart/form-data
 * only when a File or FormData is among its arguments, so "next-action and multipart" means a file or a form went through an action.
 * What could be checked on 13 Nov 2026 (headless Chromium, Playwright 1.64): Playwright gave NO body for the fetch that carries a
 * file (`postDataBuffer()` was null), so the header and the content type were what was checked, and the control test below proves
 * both are seen on a real form action. The test annotations count the bodies read ("bodies read") and the posts that gave none.
 * That the bytes themselves arrive whole is proven on the other side: the stored object is compared with the bytes that were sent.
 */
const test = base.extend<{ sent: () => Promise<Sent[]> }>({
  sent: [
    async ({ page }, use, testInfo) => {
      const pending: Promise<Sent>[] = []
      page.on('request', (request) => pending.push(describeRequest(request)))
      await use(() => Promise.all(pending))
      const sent = await Promise.all(pending)
      const actions = sent.filter((s) => s.nextAction)
      const readable = sent.filter((s) => s.body !== null)
      testInfo.annotations.push({ type: 'requests', description: `${sent.length} requests, ${actions.length} with next-action` })
      testInfo.annotations.push({ type: 'bodies read', description: `${readable.length} (multipart bodies with a file: ${readable.filter((s) => s.names.length > 0).length})` })
      testInfo.annotations.push({ type: 'bodies not given', description: `${sent.filter((s) => s.method === 'POST' && s.body === null && !s.nextAction).length} posts without a next-action header gave no body` })
      expect(actions.filter((s) => s.names.length > 0).map((s) => `${s.path} carries ${s.names.join(', ')}`), 'a form action carries file bytes').toEqual([])
      expect(actions.filter((s) => /^multipart\/form-data/i.test(s.contentType)).map((s) => `${s.path} is multipart`), 'a form action carries a form').toEqual([])
    },
    { auto: true },
  ],
})

/** The one request that carries a file to the upload route of this space, and its answer. */
async function uploadVia(page: Page, space: 't' | 'p', act: () => Promise<void>) {
  const path = `/${space}/upload`
  const requested = page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname === path)
  const answered = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === path, { timeout: 120_000 })
  await act()
  const request = await requested
  const response = await answered
  const sent = await describeRequest(request)
  expect(sent.nextAction, `the post to ${path} has no next-action header`).toBe(false)
  expect(sent.contentType).toMatch(/^multipart\/form-data/i)
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toMatch(/application\/json/)
  return { sent, answer: (await response.json()) as { result: unknown } }
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

test.use({ screenshot: 'only-on-failure' })
test.setTimeout(240_000)

test.describe('files go through the upload route', () => {
  test.use({ actionTimeout: 45_000 })

  test('the premise: the Grade 9 plan and the test photo hold the bytes the edge refuses', async () => {
    const pdf = readFileSync(`${FIXTURES}/${GRADE9}`)
    expect(pdf.includes("'$F") || pdf.includes('"$F'), 'the PDF that Cloudflare answered 403').toBe(true)
    const png = trickyPng()
    for (const bad of ["'$F", '"$F', "' $F", '" $F']) expect(png.includes(bad), bad).toBe(true)
  })

  test('control: the listener does see a form action, and with plain arguments its body is text, not a form', async ({ page, sent }) => {
    const sb = await sandbox(page, 'start', 'teacher')
    await page.goto(`/t/${sb.classId}/curriculum`)
    // "Use the sample curriculum" is a form action with plain arguments (the class id)
    await page.getByRole('button', { name: 'Use the sample curriculum' }).click()
    await check(page.getByRole('heading', { name: 'Jemma is reading your curriculum.' })).toBeVisible()
    const actions = (await sent()).filter((s) => s.nextAction)
    expect(actions.length, 'the form action was seen with its next-action header').toBeGreaterThan(0)
    for (const a of actions) {
      expect(a.method).toBe('POST')
      expect(a.contentType).toMatch(/^text\/plain/)
      expect(a.names).toEqual([])
    }
  })

  test('the Grade 9 plan goes in through "Add a file" as a plain post to /t/upload, and is stored whole', async ({ page }) => {
    const sb = await sandbox(page, 'start', 'teacher')
    await page.goto(`/t/${sb.classId}/curriculum`)
    await check(page.getByRole('heading', { name: 'Add your curriculum and Jemma will draft your topic map.' })).toBeVisible()

    const { sent, answer } = await uploadVia(page, 't', async () => {
      const chooser = page.waitForEvent('filechooser')
      await page.getByRole('button', { name: 'Add a file' }).click()
      await (await chooser).setFiles(`${FIXTURES}/${GRADE9}`)
    })
    expect(answer.result).toEqual({ ok: true })
    // when Playwright gives the body (it did not on 13 Nov 2026, see the comment on the listener): the file is in it, with its bytes
    if (sent.body) {
      expect(sent.names).toEqual([GRADE9])
      expect(sent.body.includes(readFileSync(`${FIXTURES}/${GRADE9}`).subarray(78_290, 78_310))).toBe(true)
    }

    await check(page.getByRole('heading', { name: 'Jemma is reading your curriculum.' })).toBeVisible()
    await check(page.getByText(/6 pages/)).toBeVisible()
    await proof(page, 'curriculum-reading')
    const db = admin()
    const docs = (await db.from('curriculum_docs').select('title, pages, storage_path').eq('class_id', sb.classId)).data ?? []
    expect(docs).toMatchObject([{ title: 'grade9-mathematics-za', pages: 6 }])
    expect((await bytesOf('curriculum', docs[0]!.storage_path)).equals(readFileSync(`${FIXTURES}/${GRADE9}`)), 'the stored plan has the bytes of the file').toBe(true)
  })

  test('a paper photo that holds \'$F and "$F is added through the snap screen and is stored with the same bytes', async ({ page }, testInfo) => {
    const png = trickyPng()
    const sb = await sandbox(page, 'session_done', 'teacher')
    const db = admin()
    const snapTest = (await db.from('tests').select('id').eq('class_id', sb.classId).single()).data!
    const papersBefore = new Set(((await db.from('papers').select('id').eq('test_id', snapTest.id)).data ?? []).map((p) => p.id))
    await page.goto(`/t/${sb.classId}/snap/${snapTest.id}/papers`)

    const phone = testInfo.project.name === 'phone'
    if (phone) {
      // a phone snaps one photo per paper: addPaper
      await check(page.getByRole('heading', { name: '5 papers in. Snap the next one, or add a page.' })).toBeVisible()
      const { answer } = await uploadVia(page, 't', () => page.getByTestId('snap-paper').setInputFiles({ name: 'snap.png', mimeType: 'image/png', buffer: png }))
      expect(answer.result).toMatchObject({ ok: true })
      await check(page.getByRole('heading', { name: '6 papers in. Snap the next one, or add a page.' })).toBeVisible()
    } else {
      // a laptop drops files: uploadScans
      await check(page.getByRole('heading', { name: 'Upload scans or PDFs' })).toBeVisible()
      const { answer } = await uploadVia(page, 't', () => page.locator('input#files').setInputFiles({ name: 'scan-with-dollar-f.png', mimeType: 'image/png', buffer: png }))
      expect(answer.result).toEqual({ ok: true, count: 1 })
      await check(page.getByText('scan-with-dollar-f.png')).toBeVisible({ timeout: 30_000 })
    }
    await proof(page, 'papers-queue')

    const papers = ((await db.from('papers').select('id').eq('test_id', snapTest.id)).data ?? []).filter((p) => !papersBefore.has(p.id))
    expect(papers).toHaveLength(1)
    const pages = (await db.from('paper_pages').select('storage_path').eq('paper_id', papers[0]!.id)).data ?? []
    expect(pages).toHaveLength(1)
    expect((await bytesOf('papers', pages[0]!.storage_path)).equals(png), 'the stored object has the bytes that were sent').toBe(true)
  })

  test('a parent\'s homework photo goes through /p/upload', async ({ page }) => {
    const png = trickyPng()
    const sb = await sandbox(page, 'marked', 'parent')
    await page.goto(`/p/${sb.childId}/snap/photo?kind=homework`)
    await check(page.getByText('Homework · page 1')).toBeVisible()
    await page.locator('input[type=file]').setInputFiles({ name: 'homework.png', mimeType: 'image/png', buffer: png })
    await check(page.getByText('Homework · page 2')).toBeVisible()
    await proof(page, 'parent-photo-picked')

    const { answer } = await uploadVia(page, 'p', () => page.getByRole('button', { name: 'Done' }).click())
    expect(answer.result).toMatchObject({ ok: true, paperId: expect.stringMatching(/^[0-9a-f-]{36}$/) })
    await expect(page).toHaveURL(/\/snap\/[0-9a-f-]{36}$/, { timeout: 60_000 })
    await check(page.getByRole('heading', { level: 1, name: /^Reading Amina's homework\./ })).toBeVisible()
    await proof(page, 'parent-after-upload')

    const db = admin()
    const paperId = (answer.result as { paperId: string }).paperId
    const paper = await db.from('papers').select('id, owner, kind, status').eq('id', paperId).single()
    expect(paper.data).toMatchObject({ owner: 'parent', kind: 'homework' })
    const pages = (await db.from('paper_pages').select('storage_path').eq('paper_id', paperId)).data ?? []
    expect(pages).toHaveLength(1)
    // the screen shrinks a photo to a JPEG before it is sent (PhotoScreen), so the bytes differ from the PNG: it is stored, and is an image
    const stored = await bytesOf('papers', pages[0]!.storage_path)
    expect(stored.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])), 'a JPEG').toBe(true)
  })

  /**
   * A form action refreshed the screen by itself; a fetch does not, so a screen that relied on that calls router.refresh(). That is a
   * GET of the page's own data (a request with the `rsc` header) after the post to the upload route.
   */
  const refreshedAfterUpload = async (sent: () => Promise<Sent[]>) => {
    const all = await sent()
    const at = all.map((s) => s.method === 'POST' && s.path === '/t/upload').lastIndexOf(true)
    return at >= 0 && all.slice(at + 1).some((s) => s.method === 'GET' && s.rsc)
  }

  test('the memo goes in from the draft key screen (and moves on), and is retaken on the key screen (and the screen refreshes)', async ({ page, sent }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'the key screens are phone screens')
    const first = trickyPng()
    const png2 = trickyPng(' second photo of the memo')
    expect(png2.equals(first)).toBe(false)

    const sb = await sandbox(page, 'start', 'teacher')
    const db = admin()
    const made = await db.from('tests').insert({ class_id: sb.classId, title: 'Class Test 1: Fractions and decimals', written_on: '2026-11-02', out_of: 10, topic_ids: [], held: true }).select('id').single()
    expect(made.error).toBeNull()
    const testId = made.data!.id
    // a key Jemma worked out with no memo, as the draft key screen shows it
    const key = await db.from('answer_keys').insert({ test_id: testId, status: 'draft', items: answerKeyItems() })
    expect(key.error).toBeNull()
    const memoPath = async () => (await db.from('answer_keys').select('memo_path').eq('test_id', testId).single()).data!.memo_path
    const storedMemo = async () => bytesOf('papers', (await memoPath())!)

    await page.goto(`/t/${sb.classId}/snap/${testId}/key/draft`)
    await check(page.getByRole('heading', { name: /^I worked out the 10 answers/ })).toBeVisible()
    const drafted = await uploadVia(page, 't', () => page.locator('label', { hasText: 'snap the memo instead' }).locator('input[type=file]').setInputFiles({ name: 'memo.png', mimeType: 'image/png', buffer: first }))
    expect(drafted.answer.result).toEqual({ ok: true })
    await page.waitForURL(`**/snap/${testId}/key`)
    await check(page.getByText('Memo, 1 page')).toBeVisible()
    expect((await storedMemo()).equals(first), 'the memo from the draft key screen is stored whole').toBe(true)

    const retake = await uploadVia(page, 't', () => page.locator('label', { hasText: /^Retake/ }).locator('input[type=file]').setInputFiles({ name: 'memo-again.png', mimeType: 'image/png', buffer: png2 }))
    expect(retake.answer.result).toEqual({ ok: true })
    await expect.poll(() => refreshedAfterUpload(sent), { message: 'the key screen reloads its data after the retake', timeout: 30_000 }).toBe(true)
    expect((await storedMemo()).equals(png2), 'the retaken memo replaced the first, whole').toBe(true)
  })

  /**
   * The papers screen polls (every 2 s) while a paper is waiting to be read, and each poll is a refresh too. So each of the two buttons
   * below is tried on a pile with nothing waiting: the only refresh after the post is the button's own.
   */
  async function papersScreen(page: Page) {
    const sb = await sandbox(page, 'session_done', 'teacher')
    const db = admin()
    const snapTest = (await db.from('tests').select('id').eq('class_id', sb.classId).single()).data!
    const papers = (await db.from('papers').select('id').eq('test_id', snapTest.id)).data ?? []
    expect(papers).toHaveLength(5)
    const pageRows = async () => (await db.from('paper_pages').select('paper_id, page_no, storage_path').in('paper_id', papers.map((p) => p.id))).data ?? []
    await page.goto(`/t/${sb.classId}/snap/${snapTest.id}/papers`)
    await check(page.getByRole('heading', { name: '5 papers in. Snap the next one, or add a page.' })).toBeVisible()
    await expect(page.getByText(/· waiting/)).toHaveCount(0)
    return { pageRows, before: await pageRows() }
  }

  test('on the papers screen a page is added to the last paper, and the screen refreshes', async ({ page, sent }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'the paper buttons are phone buttons')
    const png = trickyPng()
    const { pageRows, before } = await papersScreen(page)
    const added = await uploadVia(page, 't', () => page.getByTestId('snap-page').setInputFiles({ name: 'page-2.png', mimeType: 'image/png', buffer: png }))
    expect(added.answer.result).toEqual({ ok: true })
    const newPages = (await pageRows()).filter((r) => !before.some((b) => b.paper_id === r.paper_id && b.page_no === r.page_no))
    expect(newPages, 'one new page row').toHaveLength(1)
    expect((await bytesOf('papers', newPages[0]!.storage_path)).equals(png), 'the added page is stored whole').toBe(true)
    // the paper goes back to the agent to be read again, and the screen says so by itself
    await check(page.getByText('2 pages · waiting')).toBeVisible()
    await expect.poll(() => refreshedAfterUpload(sent), { message: 'the papers screen reloads its data after the upload', timeout: 30_000 }).toBe(true)
    await proof(page, 'papers-queue-after-page')
  })

  test('on the papers screen a paper is retaken, and the screen refreshes', async ({ page, sent }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'the paper buttons are phone buttons')
    const png = trickyPng()
    const { pageRows } = await papersScreen(page)
    const retake = await uploadVia(page, 't', () => page.locator('label[aria-label="Retake paper 2"] input[type=file]').setInputFiles({ name: 'retake.png', mimeType: 'image/png', buffer: png }))
    expect(retake.answer.result).toEqual({ ok: true })
    // the retaken paper goes back to the agent to be read again, and the screen says so by itself
    await check(page.getByText('1 page · waiting')).toBeVisible()
    await expect.poll(() => refreshedAfterUpload(sent), { message: 'the papers screen reloads its data after the retake', timeout: 30_000 }).toBe(true)
    const same = []
    for (const r of (await pageRows()).filter((r) => r.page_no === 1)) if ((await bytesOf('papers', r.storage_path)).equals(png)) same.push(r.paper_id)
    expect(same, 'exactly one paper has the retaken photo as page 1, whole').toHaveLength(1)
  })

  test('the route refuses another site, a post with no origin, a signed-out post and the wrong role; the function still checks the class', async ({ page, request }) => {
    const sb = await sandbox(page, 'start', 'teacher')
    await page.goto(`/t/${sb.classId}`)
    const asks = (classId: string) => ({ multipart: { __action: 'uploadCurriculum', __args: JSON.stringify([classId]) }, maxRedirects: 0 })
    const mine = new URL(process.env.PLAYWRIGHT_BASE_URL!).origin

    // signed in as the teacher (page.request shares the page's cookies), but the post names another site or none: 403, nothing read
    const evil = await page.request.post('/t/upload', { ...asks(sb.classId), headers: { origin: 'https://evil.example' } })
    expect(evil.status()).toBe(403)
    expect(await evil.json()).toEqual({ error: 'wrong origin' })
    expect((await page.request.post('/t/upload', asks(sb.classId))).status()).toBe(403)
    // an action that is not on the list
    const unknown = await page.request.post('/t/upload', { multipart: { __action: 'approveKey', __args: '[]' }, maxRedirects: 0, headers: { origin: mine } })
    expect(unknown.status()).toBe(400)
    // the same origin: the function runs. Their own class is accepted (no file, nothing stored), a class that is not theirs is refused by
    // the function's own check and the answer holds no text of the error
    const own = await page.request.post('/t/upload', { ...asks(sb.classId), headers: { origin: mine } })
    expect(own.status()).toBe(200)
    expect(await own.json()).toEqual({ result: { ok: true } })
    const notMine = await page.request.post('/t/upload', { ...asks('00000000-0000-4000-8000-000000000000'), headers: { origin: mine } })
    expect(notMine.status()).toBe(500)
    expect(await notMine.json()).toEqual({ error: 'failed' })
    // a teacher on the parent route is sent home by the proxy, the function is never reached
    const wrongRole = await page.request.post('/p/upload', { multipart: { __action: 'snapHomework', __args: '["a","homework","Mathematics"]' }, maxRedirects: 0, headers: { origin: mine } })
    expect(wrongRole.status()).toBe(307)
    expect(wrongRole.headers()['location']).toMatch(/\/t$/)
    // nobody signed in (the `request` fixture has no cookies): sent to sign-in
    const anon = await request.post('/t/upload', { ...asks(sb.classId), headers: { origin: mine } })
    expect(anon.status()).toBe(307)
    expect(anon.headers()['location']).toMatch(/\/sign-in$/)
  })
})
