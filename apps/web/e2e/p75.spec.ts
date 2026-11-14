import { mkdirSync, readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { resolve } from 'node:path'
import { createServiceClient } from '@jemma/profiling/db'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { answerKeyItems, TERMS } from '../../../supabase/seed/fixtures/marked-state'
import { openSandbox, type OpenedSandbox } from './helpers/sandbox'

// A big photo or PDF is read. A teacher's phone photo (3 to 8 MB) is made smaller in the browser before it is sent (longest side
// 2000 px, JPEG), a PDF and the 120 KB sample photos are sent as they are (the same bytes: the recorded answers are found by them).
// The stored object is read back and its size and its pixels are checked. Headless, no model: a stand-in answers the web app's posts
// on the agent's port (8767).
//
// Run it against a production build, on the ports of the packet:
//   pnpm --filter web build
//   node --env-file=../../.env.local node_modules/next/dist/bin/next start --port 3274    (in apps/web, AGENT_URL=http://127.0.0.1:8767, stop it by its pid after)
//   PREVIEW_URL=http://localhost:3274 pnpm --filter web exec playwright test p75 --workers=1
// Screenshots for the reviewer are written only when P75_PROOF is set, to design/proof/p75, named by width (390 or 1440).

const check = expect.configure({ timeout: 45_000 })
const admin = () => createServiceClient({ SUPABASE_URL: process.env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY! })
const ROOT = resolve(import.meta.dirname, '../../..')
const SAMPLE_PHOTO = `${ROOT}/fixtures/papers/amina.png` // about 120 KB: sent as it is
const GRADE9 = `${ROOT}/fixtures/curriculum/unseen/grade9-mathematics-za.pdf`

const proofDir = resolve(ROOT, 'design/proof/p75')
async function proof(page: Page, name: string) {
  if (!process.env.P75_PROOF) return
  mkdirSync(proofDir, { recursive: true })
  const width = page.viewportSize()!.width >= 1024 ? 1440 : page.viewportSize()!.width
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: 'nextjs-portal{display:none} *{transition:none !important;animation:none !important}' })
  await page.screenshot({ path: resolve(proofDir, `${name}-${width}.png`), fullPage: true })
}

/** The agent's stand-in: accepts every post to /events, so the web app believes the agent took the event. It runs no job. */
let agent: Server
// The port the web app posts to (its AGENT_URL). CI frees 8787 (the real agent's) and sets STAND_IN_AGENT_PORT=8787.
const STAND_IN_PORT = Number(process.env.STAND_IN_AGENT_PORT ?? 8767)
test.beforeAll(async () => {
  agent = createServer((req, res) => {
    if (req.url === '/health') return void res.writeHead(200).end('ok')
    req.resume()
    req.on('end', () => res.writeHead(202, { 'content-type': 'application/json' }).end('{"queued":true}'))
  })
  await new Promise<void>((done) => agent.listen(STAND_IN_PORT, done))
})
test.afterAll(async () => {
  await new Promise((done) => agent.close(done))
})

const opened: OpenedSandbox[] = []
test.afterAll(async () => {
  test.setTimeout(240_000)
  await Promise.all(opened.map((s) => s.cleanup().catch(() => undefined)))
})
async function sandbox(page: Page, stage: 'start' | 'session_done') {
  const s = await openSandbox(page, { stage, role: 'teacher' })
  opened.push(s)
  return s
}

/**
 * The bytes stored under a path, read through a signed address (new each time, so a replaced object is never read from a cache), asked
 * again a few times when the shared database drops a request.
 */
async function bytesOf(bucket: 'papers' | 'curriculum', path: string): Promise<Buffer> {
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

/** The pixel size of a JPEG, read from its first start-of-frame marker. */
function jpegSize(bytes: Buffer): { width: number; height: number } {
  expect([bytes[0], bytes[1]], 'a JPEG starts with FF D8').toEqual([0xff, 0xd8])
  let i = 2
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++
      continue
    }
    const marker = bytes[i + 1]!
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7) }
    }
    i += 2 + bytes.readUInt16BE(i + 2)
  }
  throw new Error('no start-of-frame marker in the JPEG')
}

/**
 * A phone photo as the camera gives it: 4000 x 3000, a paper-coloured gradient, some written text and a little sensor noise, written as
 * a JPEG at quality 0.95. Drawn in a browser page of its own (headless), because Node has no canvas. It came out at about 4.6 MB on
 * 13 Nov 2026 (the first test says its size, and fails if it ever comes out under 2 MB).
 */
async function buildBigPhoto(browser: Browser): Promise<Buffer> {
  const page = await browser.newPage()
  try {
    const base64 = await page.evaluate(async () => {
      const canvas = document.createElement('canvas')
      canvas.width = 4000
      canvas.height = 3000
      const ctx = canvas.getContext('2d')!
      const paper = ctx.createLinearGradient(0, 0, 4000, 3000)
      paper.addColorStop(0, '#f6f1e6')
      paper.addColorStop(1, '#cdc3b0')
      ctx.fillStyle = paper
      ctx.fillRect(0, 0, 4000, 3000)
      ctx.fillStyle = '#23283a'
      ctx.font = '150px sans-serif'
      for (let n = 1; n <= 8; n++) ctx.fillText(`${n}.  ${n * 3} + 0,${n} = ${n * 3},${n}   Amina 23/10`, 260, 330 + (n - 1) * 330)
      const image = ctx.getImageData(0, 0, 4000, 3000)
      const px = image.data
      for (let i = 0; i < px.length; i += 4) {
        const noise = (Math.random() - 0.5) * 18
        px[i] = px[i]! + noise
        px[i + 1] = px[i + 1]! + noise
        px[i + 2] = px[i + 2]! + noise
      }
      ctx.putImageData(image, 0, 0)
      const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', 0.95))
      const bytes = new Uint8Array(await blob!.arrayBuffer())
      let text = ''
      for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      return btoa(text)
    })
    return Buffer.from(base64, 'base64')
  } finally {
    await page.close()
  }
}

let big: Buffer
test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000)
  big = await buildBigPhoto(browser)
})

/** The one post to the upload route that a click makes: a plain multipart post, answered 200 JSON. Returns its answer. */
async function uploadVia(page: Page, act: () => Promise<void>) {
  const requested = page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname === '/t/upload')
  const answered = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/t/upload', { timeout: 120_000 })
  await act()
  const request = await requested
  const headers = await request.allHeaders().catch(() => request.headers())
  expect('next-action' in headers, 'the post has no next-action header').toBe(false)
  const response = await answered
  expect(response.status()).toBe(200)
  // what the browser sent is smaller than 1 MB when a big photo was the only file: the weight is read from the header when it is given
  return { answer: (await response.json()) as { result: unknown }, sentBytes: Number(headers['content-length'] ?? NaN) }
}

async function addApprovedMap(classId: string) {
  const db = admin()
  const map = await db.from('curriculum_maps').insert({ class_id: classId, status: 'approved', draft: {}, approved_at: new Date().toISOString() }).select('id').single()
  if (map.error) throw new Error(map.error.message)
  const rows = TERMS.flatMap((t) => t.topics.map((p, i) => ({ map_id: map.data.id, term: t.term, position: i + 1, name: p.name, family: p.family, misconceptions: p.misconceptions })))
  const ins = await db.from('topics').insert(rows)
  if (ins.error) throw new Error(ins.error.message)
}

test.use({ screenshot: 'only-on-failure' })
test.setTimeout(300_000)

test.describe('a big photo is made smaller before it is sent', () => {
  test.use({ actionTimeout: 45_000 })

  test('the test photo is what a phone gives: JPEG, 4000 x 3000, over 2 MB', () => {
    const { width, height } = jpegSize(big)
    expect({ width, height }).toEqual({ width: 4000, height: 3000 })
    expect(big.length, `came out at ${(big.length / 1e6).toFixed(1)} MB`).toBeGreaterThan(2_000_000)
    expect(readFileSync(SAMPLE_PHOTO).length, 'the sample photo is about 120 KB').toBeLessThan(1_000_000)
  })

  test('phone: a big photo added as a paper is stored small, and the 120 KB sample photo is stored with the same bytes', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'the snap queue is a phone screen')
    const sb = await sandbox(page, 'session_done')
    const db = admin()
    const snapTest = (await db.from('tests').select('id').eq('class_id', sb.classId).single()).data!
    const papers = async () => (await db.from('papers').select('id').eq('test_id', snapTest.id)).data ?? []
    const known = new Set((await papers()).map((p) => p.id))
    const newPageOf = async () => {
      const fresh = (await papers()).filter((p) => !known.has(p.id))
      expect(fresh, 'one new paper').toHaveLength(1)
      known.add(fresh[0]!.id)
      const pages = (await db.from('paper_pages').select('storage_path').eq('paper_id', fresh[0]!.id)).data ?? []
      expect(pages).toHaveLength(1)
      return pages[0]!.storage_path
    }
    await page.goto(`/t/${sb.classId}/snap/${snapTest.id}/papers`)
    await check(page.getByRole('heading', { name: '5 papers in. Snap the next one, or add a page.' })).toBeVisible()

    // (i) the big photo
    const first = await uploadVia(page, () => page.getByTestId('snap-paper').setInputFiles({ name: 'IMG_4021.jpg', mimeType: 'image/jpeg', buffer: big }))
    expect(first.answer.result).toMatchObject({ ok: true })
    if (Number.isFinite(first.sentBytes)) expect(first.sentBytes, 'what the browser sent').toBeLessThan(1_000_000)
    await check(page.getByRole('heading', { name: '6 papers in. Snap the next one, or add a page.' })).toBeVisible()
    await proof(page, 'papers-queue-big-photo')
    const stored = await bytesOf('papers', await newPageOf())
    expect(stored.length, 'the stored photo is under 1 MB').toBeLessThan(1_000_000)
    expect(jpegSize(stored), 'its longest side is 2000').toEqual({ width: 2000, height: 1500 })

    // (ii) the sample photo, the same way: not one byte changes
    const sample = readFileSync(SAMPLE_PHOTO)
    const second = await uploadVia(page, () => page.getByTestId('snap-paper').setInputFiles({ name: 'amina.png', mimeType: 'image/png', buffer: sample }))
    expect(second.answer.result).toMatchObject({ ok: true })
    expect((await bytesOf('papers', await newPageOf())).equals(sample), 'the sample photo is stored with the same bytes as the fixture file').toBe(true)
  })

  test('the big photo as the memo is stored small too', async ({ page }) => {
    const sb = await sandbox(page, 'start')
    await addApprovedMap(sb.classId)
    const db = admin()
    await page.goto(`/t/${sb.classId}/snap`)
    await check(page.getByRole('heading', { name: 'Which test are we marking?' })).toBeVisible()
    const done = await uploadVia(page, () => page.locator('input[type=file][capture]').setInputFiles({ name: 'memo-IMG_4022.jpg', mimeType: 'image/jpeg', buffer: big }))
    expect(done.answer.result).toEqual({ ok: true })
    await page.waitForURL(/\/snap\/[0-9a-f-]+\/key$/)
    const testId = page.url().match(/snap\/([0-9a-f-]+)\/key/)![1]!
    const key = (await db.from('answer_keys').select('memo_path').eq('test_id', testId).single()).data!
    const stored = await bytesOf('papers', key.memo_path!)
    expect(stored.length, 'the stored memo is under 1 MB').toBeLessThan(1_000_000)
    expect(jpegSize(stored)).toEqual({ width: 2000, height: 1500 })

    // Jemma has read the memo (the answers as the save tool writes them): the key screen shows the memo card
    const items = await db.from('answer_keys').update({ items: answerKeyItems() }).eq('test_id', testId)
    expect(items.error).toBeNull()
    await page.reload()
    await check(page.getByText('Memo, 1 page')).toBeVisible()
    await proof(page, 'key-after-big-memo')
  })

  test('laptop: one PDF and one big photo dropped together, the PDF is stored with the same bytes and the photo small', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'laptop', 'the upload zone is a laptop screen')
    const sb = await sandbox(page, 'session_done')
    const db = admin()
    const snapTest = (await db.from('tests').select('id').eq('class_id', sb.classId).single()).data!
    const papers = async () => (await db.from('papers').select('id').eq('test_id', snapTest.id)).data ?? []
    const known = new Set((await papers()).map((p) => p.id))
    await page.goto(`/t/${sb.classId}/snap/${snapTest.id}/papers`)
    await check(page.getByRole('heading', { name: 'Upload scans or PDFs' })).toBeVisible()

    const pdf = readFileSync(GRADE9)
    const done = await uploadVia(page, () =>
      page.locator('input#files').setInputFiles([
        { name: 'class-test-scan.pdf', mimeType: 'application/pdf', buffer: pdf },
        { name: 'IMG_4023.jpg', mimeType: 'image/jpeg', buffer: big },
      ]),
    )
    expect(done.answer.result).toEqual({ ok: true, count: 2 })
    await check(page.getByText('class-test-scan.pdf')).toBeVisible({ timeout: 30_000 })
    await check(page.getByText('IMG_4023.jpg')).toBeVisible({ timeout: 30_000 })
    await proof(page, 'upload-zone-pdf-and-photo')

    const fresh = (await papers()).filter((p) => !known.has(p.id))
    expect(fresh).toHaveLength(2)
    const rows = (await db.from('paper_pages').select('storage_path').in('paper_id', fresh.map((p) => p.id))).data ?? []
    expect(rows).toHaveLength(2)
    const pdfRow = rows.find((r) => r.storage_path.endsWith('.pdf'))!
    const photoRow = rows.find((r) => r.storage_path.endsWith('.jpg'))!
    expect((await bytesOf('papers', pdfRow.storage_path)).equals(pdf), 'the PDF is stored with the same bytes').toBe(true)
    const photo = await bytesOf('papers', photoRow.storage_path)
    expect(photo.length, 'the stored photo is under 1 MB').toBeLessThan(1_000_000)
    expect(jpegSize(photo)).toEqual({ width: 2000, height: 1500 })
  })

  test('the curriculum screen: a big photo is stored small, and a refused file is refused with today\'s message', async ({ page }) => {
    const sb = await sandbox(page, 'start')
    await page.goto(`/t/${sb.classId}/curriculum`)
    await check(page.getByRole('heading', { name: 'Add your curriculum and Jemma will draft your topic map.' })).toBeVisible()
    const addFile = async (file: { name: string; mimeType: string; buffer: Buffer }) => {
      const chooser = page.waitForEvent('filechooser')
      await page.getByRole('button', { name: 'Add a file' }).click()
      await (await chooser).setFiles(file)
    }

    // refused as before, in the same words, and nothing is sent
    await addFile({ name: 'plan.pdf', mimeType: 'application/pdf', buffer: Buffer.from('MZ\u0090\u0000 this is a program, not a PDF') })
    await check(page.getByRole('alert').filter({ hasText: 'is not a PDF, JPG or PNG file' })).toHaveText('"plan.pdf" is not a PDF, JPG or PNG file. Jemma can only read those three kinds.')
    await addFile({ name: 'whole-book.pdf', mimeType: 'application/pdf', buffer: Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(11 * 1024 * 1024)]) })
    await check(page.getByRole('alert').filter({ hasText: 'The limit is 10 MB' })).toHaveText('"whole-book.pdf" is 11.0 MB. The limit is 10 MB for one document. Make it smaller, or send only the pages for your grade.')
    const db = admin()
    expect((await db.from('curriculum_docs').select('id').eq('class_id', sb.classId)).data).toEqual([])

    // the big photo goes in, small
    const done = await uploadVia(page, () => addFile({ name: 'IMG_4024.jpg', mimeType: 'image/jpeg', buffer: big }))
    expect(done.answer.result).toEqual({ ok: true })
    await check(page.getByRole('heading', { name: 'Jemma is reading your curriculum.' })).toBeVisible()
    const docs = (await db.from('curriculum_docs').select('title, pages, storage_path').eq('class_id', sb.classId)).data ?? []
    expect(docs).toMatchObject([{ title: 'IMG_4024', pages: 1 }])
    const stored = await bytesOf('curriculum', docs[0]!.storage_path)
    expect(stored.length, 'the stored plan photo is under 1 MB').toBeLessThan(1_000_000)
    expect(jpegSize(stored)).toEqual({ width: 2000, height: 1500 })
  })
})
