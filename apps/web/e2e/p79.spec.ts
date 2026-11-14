import { mkdirSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { resolve } from 'node:path'
import { createServiceClient } from '@jemma/profiling/db'
import { expect, test as base, type Page } from '@playwright/test'
import { MemoryStore } from '../../../packages/profiling/src/ai/stores'
import { planNextSession, type SessionPlan } from '../../../packages/profiling/src/tools/save/plan-next-session'
import { openSandbox, type OpenedSandbox } from './helpers/sandbox'

// A learner can always practise. The learner's home suggests something to practise whenever nothing is planned for tonight (P80: the first
// suggestion of My maths, with a Practise button and a link to choose something else). A tap asks for a practice (`practice.requested`, with
// the learner's choice), the home says Jemma is writing it, and when the lesson is written the home offers tonight's session. A practice that
// failed says so and offers "Try again". A learner with nothing to practise reads one plain line.
//
// The stand-in agent below answers 202 to every post and runs no job, so the spec plays the agent where a job would run: it calls the real
// planner (`plan_next_session` with `practice: true`, code only) and writes the lesson's questions into the lesson row with the service
// client. Nothing here calls a model.
//
// WRITTEN, NOT RUN (the shared database could not take a browser spec when this was written). Run it against a production build, phone project:
//   pnpm --filter web build
//   AGENT_URL=http://127.0.0.1:8779 pnpm --filter web exec next start --port 3279        (own terminal, stop it by its pid after)
//   P79_PROOF=1 PREVIEW_URL=http://localhost:3279 pnpm --filter web exec playwright test p79 --project=phone --workers=1
// Screenshots are written only when P79_PROOF is set, to design/proof/p79 (390 wide).

const check = expect.configure({ timeout: 45_000 })
const admin = () => createServiceClient({ SUPABASE_URL: process.env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY! })

const proofDir = resolve(import.meta.dirname, '../../../design/proof/p79')
async function proof(page: Page, name: string) {
  if (!process.env.P79_PROOF) return
  mkdirSync(proofDir, { recursive: true })
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: 'nextjs-portal{display:none} *{transition:none !important;animation:none !important}' })
  await page.screenshot({ path: resolve(proofDir, `${name}-390.png`), fullPage: true })
}

/** The agent's stand-in: accepts every post to /events, so the web app believes the agent took the event. It runs no job. */
let agent: Server
// The port the web app posts to (its AGENT_URL). CI frees 8787 (the real agent's) and sets STAND_IN_AGENT_PORT=8787.
const STAND_IN_PORT = Number(process.env.STAND_IN_AGENT_PORT ?? 8779)
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
async function sandbox(page: Page, stage: 'start' | 'marked' | 'session_done') {
  const s = await openSandbox(page, { stage, role: 'learner' })
  opened.push(s)
  return s
}

const test = base
test.use({ screenshot: 'only-on-failure', actionTimeout: 45_000 })
test.setTimeout(240_000)

const practiceEvents = async (childId: string) =>
  (await admin().from('events').select('id, status, error, payload').eq('type', 'practice.requested').eq('payload->>childId', childId).order('created_at')).data ?? []

test.describe('a learner can always practise', () => {
  test('Amina, with nothing for tonight, sees a suggestion to practise; a tap says Jemma is writing; a written lesson is offered as tonight', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'the learner screens are phone screens')
    const sb = await sandbox(page, 'session_done')
    await page.goto('/k')
    await check(page.getByRole('heading', { level: 1, name: /^Nothing new tonight, Amina! Your next lesson is on \w+day\.$/ })).toBeVisible()
    await expect(page.getByText('Jemma is getting your next lesson ready.')).toHaveCount(0)
    await expect(page.getByText('Keep a fixed gap fixed')).toHaveCount(0)
    await expect(page.getByText('Suggested for you')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Practise / })).toHaveCount(1)
    await expect(page.getByRole('link', { name: 'Choose something else' })).toBeVisible()
    await expect(page.getByText("You've fixed 3 gaps so far")).toBeVisible()
    await proof(page, 'practise-now')

    // the tap: one event with the learner's choice, queued (the stand-in answers 202), and the home says Jemma is writing
    await page.getByRole('button', { name: /^Practise / }).click()
    await check(page.getByText('Jemma is writing your practice.')).toBeVisible()
    await expect(page.getByText('A minute or two. You can wait here.')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Practise / })).toHaveCount(0)
    const events = await practiceEvents(sb.childId)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ status: 'queued', payload: { childId: sb.childId, topicName: expect.any(String) } })
    await proof(page, 'writing')

    // the spec plays the agent: the real planner plans the learner's choice for today (next to the session planned for later), and the lesson gets its questions
    const db = admin()
    const child = (await db.from('children').select('school_id').eq('id', sb.childId).single()).data!
    const asked = events[0]!.payload as { topicId?: string; topicName?: string }
    const choice = asked.topicName ? { choice: { topicId: asked.topicId ?? null, topicName: asked.topicName } } : {}
    const plan = (await planNextSession.run({ db, schoolId: child.school_id, eventId: null, env: { replayStore: new MemoryStore() }, now: () => new Date() }, { childId: sb.childId, practice: true, ...choice })) as SessionPlan
    expect(plan).toMatchObject({ planned: true, plannedFor: new Date().toISOString().slice(0, 10) })
    const finished = (await db.from('sessions').select('lesson_id').eq('child_id', sb.childId).eq('status', 'done').limit(1)).data ?? []
    const written = (await db.from('lessons').select('content').eq('id', finished[0]!.lesson_id!).single()).data!
    expect((await db.from('lessons').update({ content: written.content }).eq('id', plan.lessonId!)).error).toBeNull()

    // the home asks again every 3 seconds, so tonight's session shows by itself, with the same Start the normal sessions have
    await check(page.getByRole('heading', { level: 1, name: "Hi Amina. One thing tonight, then you're done." })).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('link', { name: 'Start' })).toBeVisible()
    await proof(page, 'tonight-offered')
  })

  test('a practice that failed says so and offers Try again, which asks again', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'the learner screens are phone screens')
    const sb = await sandbox(page, 'session_done')
    await page.goto('/k')
    await page.getByRole('button', { name: /^Practise / }).click()
    await check(page.getByText('Jemma is writing your practice.')).toBeVisible()
    const [event] = await practiceEvents(sb.childId)
    expect(event).toBeTruthy()

    // the job ended failed for good
    const db = admin()
    expect((await db.from('events').update({ status: 'failed', error: 'Jemma stopped answering. Try again.', finished_at: new Date().toISOString() }).eq('id', event!.id)).error).toBeNull()
    await check(page.getByRole('heading', { name: 'Jemma could not write your practice.' })).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Practise / })).toHaveCount(0)
    await proof(page, 'failed')

    // Try again: the same event goes back to queued (the stand-in answers 202), and the home is writing again
    await page.getByRole('button', { name: 'Try again' }).click()
    await check(page.getByText('Jemma is writing your practice.')).toBeVisible()
    const after = await practiceEvents(sb.childId)
    expect(after).toHaveLength(1)
    expect(after[0]).toMatchObject({ id: event!.id, status: 'queued', error: null })
  })

  test('a learner with nothing to practise reads one plain line and has no button', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'the learner screens are phone screens')
    const sb = await sandbox(page, 'start')
    // nothing at all: no gap, no past record, no approved map, nothing planned
    const db = admin()
    const classes = ((await db.from('enrolments').select('class_id').eq('child_id', sb.childId)).data ?? []).map((e) => e.class_id)
    await db.from('gaps').delete().eq('child_id', sb.childId)
    await db.from('learner_records').delete().eq('child_id', sb.childId)
    await db.from('sessions').delete().eq('child_id', sb.childId)
    if (classes.length) await db.from('curriculum_maps').update({ status: 'draft' }).in('class_id', classes)

    await page.goto('/k')
    await check(page.getByRole('heading', { level: 1, name: 'Nothing new tonight, Amina.' })).toBeVisible()
    await expect(page.getByText('Practice starts after your teacher marks a test.')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Practise / })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'See my maths' })).toBeVisible()
    await expect(page.getByText('Jemma is getting your next lesson ready.')).toHaveCount(0)
    await proof(page, 'nothing-to-practise')
  })
})
