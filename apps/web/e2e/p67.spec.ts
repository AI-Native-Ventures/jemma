import { mkdirSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { resolve } from 'node:path'
import { createServiceClient } from '@jemma/profiling/db'
import { expect, test, type Page } from '@playwright/test'
import { loadTruth, perfectDraft, type Truth } from '../../../evals/lib/unseen-truth'
import { signInWithPassword } from './helpers/session'

// A curriculum Jemma has never seen, on the screens a teacher uses: the upload says no clearly (wrong kind, too big, too many
// pages) and takes a 9 MB PDF; the map of a Grade 9 Natural Sciences plan is checked and approved; a three term document gives a
// three term review screen. Headless, no model: a stand-in answers the web app's posts on the agent's port (8767), and the
// model's answer is written to the database the way the save tool writes it (the draft, from the ground truth next to the document).
//
// Run it against a production build (the body limit of the server action only means something there), on the ports of the packet:
//   pnpm --filter web build
//   AGENT_URL=http://127.0.0.1:8767 pnpm --filter web exec next start --port 3267        (own terminal, stop it after)
//   PREVIEW_URL=http://localhost:3267 pnpm --filter web exec playwright test p67 --project=phone --workers=1
// Screenshots for the reviewer are written only when P67_PROOF is set, to design/proof/p67, named by width (390 or 1440).

const check = expect.configure({ timeout: 45_000 })
const admin = () => createServiceClient({ SUPABASE_URL: process.env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY! })
const MB = 1024 * 1024
const FIXTURES = resolve(import.meta.dirname, '../../../fixtures/curriculum/unseen')

const proofDir = resolve(import.meta.dirname, '../../../design/proof/p67')
async function proof(page: Page, name: string) {
  if (!process.env.P67_PROOF) return
  mkdirSync(proofDir, { recursive: true })
  const width = page.viewportSize()!.width >= 1024 ? 1440 : page.viewportSize()!.width
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: 'nextjs-portal{display:none} *{transition:none !important;animation:none !important}' })
  await page.screenshot({ path: resolve(proofDir, `${name}-${width}.png`), fullPage: true })
}

/** The agent's stand-in: accepts every post to /events, so the web app believes the agent took the event. It runs no job. */
let agent: Server
const posted: string[] = []
test.beforeAll(async () => {
  agent = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200).end('ok')
      return
    }
    let body = ''
    req.on('data', (d) => (body += d))
    req.on('end', () => {
      try {
        posted.push((JSON.parse(body) as { eventId: string }).eventId)
      } catch {
        // not a post from the app
      }
      res.writeHead(202, { 'content-type': 'application/json' }).end('{"queued":true}')
    })
  })
  await new Promise<void>((done) => agent.listen(8767, done))
})
test.afterAll(async () => {
  await new Promise((done) => agent.close(done))
})

type Made = { schoolId: string; teacherId: string; classId: string; email: string; password: string; cleanup(): Promise<void> }
const made: Made[] = []
test.afterAll(async () => {
  for (const m of made) await m.cleanup().catch(() => undefined)
})

/** A teacher, a school and a class of this grade and subject, made straight in the database (the class form for any grade is another packet). */
async function makeClass(truth: Truth): Promise<Made> {
  const db = admin()
  const tag = `p67${Date.now()}${Math.random().toString(36).slice(2, 6)}`
  const email = `${tag}@example.test`
  const password = `${tag}-Passw0rd!`
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true })
  if (created.error) throw created.error
  const teacherId = created.data.user.id
  const school = await db.from('schools').insert({ name: `${tag} School`, country: truth.country, ai_runner: 'cloud' }).select('id').single()
  if (school.error) throw school.error
  const schoolId = school.data.id
  const profile = await db.from('profiles').insert({ user_id: teacherId, role: 'teacher', display_name: 'Ms Unseen', school_id: schoolId })
  if (profile.error) throw profile.error
  const cls = await db.from('classes').insert({ school_id: schoolId, teacher_id: teacherId, name: `${truth.grade}A ${truth.subject}`, grade: truth.grade, year: 2026, subject: truth.subject, join_code: tag.slice(-12) }).select('id').single()
  if (cls.error) throw cls.error
  const m: Made = {
    schoolId, teacherId, classId: cls.data.id, email, password,
    async cleanup() {
      const docs = await db.from('curriculum_docs').select('storage_path').eq('class_id', cls.data.id)
      const paths = (docs.data ?? []).map((d) => d.storage_path)
      if (paths.length) await db.storage.from('curriculum').remove(paths)
      await db.from('schools').delete().eq('id', schoolId)
      await db.auth.admin.deleteUser(teacherId)
    },
  }
  made.push(m)
  return m
}

/** What the draft job would have saved: the draft, a Needs you item, and a document row so the screens have something to show. */
async function fakeModelAnswer(m: Made, truth: Truth): Promise<string> {
  const db = admin()
  const map = await db.from('curriculum_maps').select('id').eq('class_id', m.classId).eq('status', 'draft').order('created_at', { ascending: false }).limit(1)
  let mapId = map.data?.[0]?.id
  if (!mapId) {
    const ins = await db.from('curriculum_maps').insert({ class_id: m.classId, status: 'draft' }).select('id').single()
    if (ins.error) throw ins.error
    mapId = ins.data.id
  }
  const docs = await db.from('curriculum_docs').select('id').eq('class_id', m.classId)
  if (!docs.data?.length) await db.from('curriculum_docs').insert({ class_id: m.classId, storage_path: `p67/${m.classId}/${truth.file}`, title: truth.file.replace(/\.[^.]+$/, ''), pages: 4 })
  const draft = perfectDraft(truth)
  const saved = await db.from('curriculum_maps').update({ draft }).eq('id', mapId)
  if (saved.error) throw saved.error
  const topics = draft.terms.reduce((n, t) => n + t.topics.length, 0)
  const open = await db.from('needs_you_items').select('id').eq('kind', 'approve_map').eq('ref_id', mapId)
  if (!open.data?.length) {
    await db.from('needs_you_items').insert({ owner_id: m.teacherId, school_id: m.schoolId, kind: 'approve_map', ref_id: mapId, title: `Approve the topic map for ${truth.grade}A ${truth.subject}`, detail: `${topics} topics in ${draft.terms.length} terms. Check 2, then approve.` })
  }
  return mapId
}

const docsOf = async (classId: string) => (await admin().from('curriculum_docs').select('title, pages, storage_path').eq('class_id', classId)).data ?? []
const eventsOf = async (classId: string) => {
  const maps = (await admin().from('curriculum_maps').select('id').eq('class_id', classId)).data ?? []
  const out = []
  for (const map of maps) out.push(...((await admin().from('events').select('id, status').eq('type', 'curriculum.uploaded').eq('payload->>mapId', map.id)).data ?? []))
  return out
}

/** Picks a file in the real "Add a file" form, as a person would. */
async function addFile(page: Page, file: { name: string; mimeType: string; buffer: Buffer } | string) {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Add a file' }).click()
  await (await chooser).setFiles(file)
}

test.use({ screenshot: 'only-on-failure' })

test.describe('a curriculum Jemma has never seen', () => {
  test.setTimeout(480_000)
  test.use({ actionTimeout: 45_000 })

  test('the upload turns away a wrong kind, a file over 10 MB and a plan over 40 pages, in plain words, and stores nothing', async ({ page }) => {
    const m = await makeClass(loadTruth('grade9-natural-sciences-za'))
    await signInWithPassword(page, m.email, m.password)
    await page.goto(`/t/${m.classId}/curriculum`)
    await check(page.getByRole('heading', { name: 'Add your curriculum and Jemma will draft your topic map.' })).toBeVisible()

    // wrong kind: the name says PDF, the first bytes say a program
    await addFile(page, { name: 'plan.pdf', mimeType: 'application/pdf', buffer: Buffer.from('MZ\u0090\u0000 this is a program, not a PDF') })
    await check(page.getByRole('alert').filter({ hasText: 'is not a PDF, JPG or PNG file' })).toHaveText('"plan.pdf" is not a PDF, JPG or PNG file. Jemma can only read those three kinds.')
    await proof(page, 'upload-wrong-kind')

    // over 10 MB: said before anything is sent
    const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(11 * MB)])
    await addFile(page, { name: 'whole-book.pdf', mimeType: 'application/pdf', buffer: big })
    await check(page.getByRole('alert').filter({ hasText: 'The limit is 10 MB' })).toHaveText('"whole-book.pdf" is 11.0 MB. The limit is 10 MB for one document. Make it smaller, or send only the pages for your grade.')
    await proof(page, 'upload-too-big')

    // over 40 pages: only the server can count them, and it says so in the same box
    const pages = Array.from({ length: 41 }, (_, i) => `${i + 3} 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj`).join('\n')
    await addFile(page, { name: 'long-plan.pdf', mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.4\n2 0 obj\n<< /Type /Pages /Count 41 /Kids [] >>\nendobj\n${pages}\n%%EOF`) })
    await check(page.getByRole('alert').filter({ hasText: 'The limit is 40 pages' })).toHaveText('"long-plan.pdf" has 41 pages. The limit is 40 pages for one document. Send only the pages for your grade.')
    await proof(page, 'upload-too-many-pages')

    // nothing was stored and no job was started
    expect(await docsOf(m.classId)).toEqual([])
    expect(await eventsOf(m.classId)).toEqual([])
    // the same file can be picked again after a refusal
    await expect(page.getByRole('button', { name: 'Add a file' })).toBeEnabled()
  })

  test('a 9 MB PDF goes through the upload on a build: stored whole, one document row, one job started', async ({ page }) => {
    const m = await makeClass(loadTruth('grade5-english-za'))
    await signInWithPassword(page, m.email, m.password)
    await page.goto(`/t/${m.classId}/curriculum`)
    const nine = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(9 * MB, 0x20)])
    await addFile(page, { name: 'nine-megabytes.pdf', mimeType: 'application/pdf', buffer: nine })
    // 9 MB goes from the browser through the app to storage: minutes on a busy machine and a shared database, so a long wait
    await expect(page.getByRole('heading', { name: 'Jemma is reading your curriculum.' })).toBeVisible({ timeout: 240_000 })
    const docs = await docsOf(m.classId)
    expect(docs).toHaveLength(1)
    expect(docs[0]).toMatchObject({ title: 'nine-megabytes', pages: 1 })
    const stored = await admin().storage.from('curriculum').download(docs[0]!.storage_path)
    expect(stored.error).toBeNull()
    expect(stored.data!.size).toBe(nine.length)
    expect(await eventsOf(m.classId)).toHaveLength(1)
    expect(posted.length).toBeGreaterThan(0)
  })

  test('Grade 9 Natural Sciences: the plan goes in through the form, the map is checked and approved', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'the whole flow is walked on the phone; the laptop screens are in the next test')
    const truth = loadTruth('grade9-natural-sciences-za')
    const m = await makeClass(truth)
    await signInWithPassword(page, m.email, m.password)
    await page.goto(`/t/${m.classId}/curriculum`)

    await addFile(page, `${FIXTURES}/${truth.file}`)
    await check(page.getByRole('heading', { name: 'Jemma is reading your curriculum.' })).toBeVisible()
    await check(page.getByText(/6 pages/)).toBeVisible()
    const docs = await docsOf(m.classId)
    expect(docs).toMatchObject([{ title: 'grade9-natural-sciences-za', pages: 6 }])
    const events = await eventsOf(m.classId)
    expect(events).toHaveLength(1)
    await proof(page, 'reading')

    // the model's answer, as the save tool would have written it
    await fakeModelAnswer(m, truth)
    await page.reload()
    await check(page.getByRole('heading', { name: 'Your draft topic map is ready. 2 things for you to check.' })).toBeVisible()
    await page.getByRole('link', { name: 'Check the draft map' }).click()
    await page.waitForURL('**/curriculum/map')

    // four terms, because the document has four
    for (const n of [1, 2, 3, 4]) await expect(page.getByRole('button', { name: new RegExp(`^Term ${n}`) })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Term 2 · April to June' })).toBeVisible()
    await check(page.getByText('Listed in Terms 2 and 3')).toBeVisible()
    await proof(page, 'review-grade9')
    // the left out topic sits in the term of the first open check, so it is settled first
    await page.getByRole('button', { name: 'Leave it out' }).click()
    await check(page.getByText('A Grade 8 topic. Add it?')).toHaveCount(0)
    await page.getByRole('button', { name: 'Keep in Term 2' }).click()
    await check(page.getByText('Listed in Terms 2 and 3')).toHaveCount(0)

    await page.getByRole('button', { name: 'Approve map' }).click()
    await page.waitForURL(`**/t/${m.classId}/curriculum`)
    await check(async () => {
      const map = await admin().from('curriculum_maps').select('id, status').eq('class_id', m.classId).order('created_at', { ascending: false }).limit(1).single()
      expect(map.data?.status).toBe('approved')
      const topics = await admin().from('topics').select('name, term').eq('map_id', map.data!.id)
      expect(topics.data).toHaveLength(15)
      expect(topics.data!.find((t) => t.name === 'Electric circuits')?.term).toBe(2)
      expect(topics.data!.some((t) => t.name === 'States of matter and the particle model')).toBe(false)
    }).toPass({ timeout: 45_000 })
    await proof(page, 'approved-grade9')
  })

  test('Grade 4 Science and Technology in Kenya has three terms, and the review screen shows three', async ({ page }, testInfo) => {
    const truth = loadTruth('grade4-science-technology-ke')
    const m = await makeClass(truth)
    await fakeModelAnswer(m, truth)
    await signInWithPassword(page, m.email, m.password)
    await page.goto(`/t/${m.classId}/curriculum`)
    await check(page.getByRole('heading', { name: 'Your draft topic map is ready. 2 things for you to check.' })).toBeVisible()
    await page.goto(`/t/${m.classId}/curriculum/map`)

    if (testInfo.project.name === 'phone') {
      for (const n of [1, 2, 3]) await check(page.getByRole('button', { name: new RegExp(`^Term ${n}`) })).toBeVisible()
      await expect(page.getByRole('button', { name: /^Term 4/ })).toHaveCount(0)
      // no months: the calendar quarters of a South African year are not this year's terms
      await expect(page.getByRole('heading', { name: /^Term \d$/ })).toHaveCount(1)
      await expect(page.getByText(/January to March|April to June|July to September|October to December/)).toHaveCount(0)
      // the change-term list offers three terms, not four
      await page.getByRole('button', { name: 'Edit Parts of a flowering plant' }).click()
      await expect(page.getByRole('combobox').locator('option')).toHaveText(['Term 1', 'Term 2', 'Term 3'])
    } else {
      // a term heading may carry the count of things to check after its name
      await check(page.getByRole('heading', { name: /^Term [1-4]( \d+)?$/ })).toHaveCount(3)
      await expect(page.getByRole('heading', { name: /^Term 4/ })).toHaveCount(0)
      await expect(page.getByText(/Jan to Mar|Apr to Jun|Jul to Sep|Oct to Dec/)).toHaveCount(0)
    }
    await proof(page, 'review-kenya-three-terms')
  })
})
