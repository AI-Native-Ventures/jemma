import { createServiceClient, type JemmaDb } from '@jemma/profiling/db'
import { expect, test, type Page } from '@playwright/test'
import { TERMS, topicMapDraft } from '../../../supabase/seed/fixtures/marked-state'
import { signInWithPassword } from './helpers/session'
import { openSandbox } from './helpers/sandbox'

// The judges' demo path on a `start` sandbox, with the real agent worker running (`pnpm --filter agent dev`)
// and the web app posting events to AGENT_URL. The agent's AI_MODE decides the speed: `replay` answers from
// ai_replays in seconds, `record` calls the free models and stores what they say (about 20 minutes).
// Run: PLAYWRIGHT_PORT=3237 pnpm --filter web exec playwright test demo-path --project=phone --workers=1
// See docs/runbook.md.

const LIVE = (process.env.AI_MODE ?? 'replay') !== 'replay'
const PREVIEW = Boolean(process.env.PREVIEW_URL)
// SLOW_AI=1: a real model on the owner's laptop does the AI work (the operator runner), about a minute per job.
// It only makes the waits longer. No assertion changes.
const SLOW_AI = Boolean(process.env.SLOW_AI)
// SEED_MAP=1: start at step 2. The sample curriculum is a PDF, `draft_map` always runs on the cloud model (a PDF cannot be read
// through MCP), so a run that wants every other AI job on the operator puts the approved map in place first, with the seed's own
// inserts (the ones the `marked` sandbox uses). Every assertion of step 1 still runs.
const SEED_MAP = Boolean(process.env.SEED_MAP)
const AGENT_WAIT = SLOW_AI ? 60 * 60_000 : PREVIEW ? 24 * 60_000 : LIVE ? 25 * 60_000 : 5 * 60_000
const AGENT_URL = PREVIEW
  ? process.env.PREVIEW_AGENT_URL ?? 'https://jemma-agent.horizonsystems.workers.dev'
  : process.env.AGENT_URL

const db = (): JemmaDb =>
  createServiceClient({ SUPABASE_URL: process.env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY! })

type Logins = Record<'teacher' | 'parent' | 'learner', { email: string; password: string }>

const SAMPLE_BUCKET = 'sample-papers'

const eventCount = async (schoolId: string) => (await db().from('events').select('id').eq('school_id', schoolId)).data?.length ?? 0

/**
 * Waits until the agent has nothing queued or running for this school and has seen more than `since` events
 * (the count taken before the click that sends the next one). A failed event stops the test with its error.
 */
async function agentIdle(schoolId: string, what: string, since: number): Promise<void> {
  const admin = db()
  const started = Date.now()
  let quiet = 0
  while (Date.now() - started < AGENT_WAIT) {
    const { data } = await admin.from('events').select('type, status, error').eq('school_id', schoolId)
    const rows = data ?? []
    const failed = rows.find((e) => e.status === 'failed')
    if (failed) throw new Error(`agent event ${failed.type} failed while ${what}: ${failed.error}`)
    const busy = rows.some((e) => e.status === 'queued' || e.status === 'running')
    quiet = busy || rows.length <= since ? 0 : quiet + 1
    if (quiet >= 3) return
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new Error(`the agent did not finish ${what} in ${AGENT_WAIT / 1000} seconds`)
}

async function sampleFile(path: string, name: string) {
  const { data, error } = await db().storage.from(SAMPLE_BUCKET).download(path)
  if (error || !data) throw new Error(`sample file ${path}: ${error?.message}`)
  return { name, mimeType: 'image/png', buffer: Buffer.from(await data.arrayBuffer()) }
}

/** The same phone, a different person: replaces the sign-in cookies. */
async function signInAs(page: Page, logins: Logins, role: keyof Logins) {
  await signInWithPassword(page, logins[role].email, logins[role].password)
}

type LessonQuestion = { prompt: string; answer: string; choices?: string[]; render?: string; terms?: string[] }

/** What the child taps or types for one question: the right answer, or something that is not. */
async function answerQuestion(page: Page, q: LessonQuestion, right: boolean) {
  const wrongChoice = (choices: string[]) => choices.findIndex((c, i) => c !== q.answer && String.fromCharCode(65 + i) !== q.answer)
  const rightChoice = (choices: string[]) => choices.findIndex((c, i) => c === q.answer || String.fromCharCode(65 + i) === q.answer)
  if (q.choices?.length) {
    const i = right ? rightChoice(q.choices) : wrongChoice(q.choices)
    await page.getByRole('button', { pressed: false }).nth(Math.max(i, 0)).click()
  } else if (q.render === 'fraction_sum' && q.terms?.length === 2) {
    const [top, bottom] = (right ? q.answer : '1/99').split('/')
    await page.getByLabel('Top number').fill(top!)
    await page.getByLabel('Bottom number').fill(bottom ?? '1')
  } else {
    await page.getByLabel('Your answer').fill(right ? q.answer : '0')
  }
  await page.getByRole('button', { name: 'Next', exact: true }).click()
}

test.use({ actionTimeout: 30_000 })

test('the whole demo path', async ({ page }) => {
  test.setTimeout(SLOW_AI ? 4 * 60 * 60_000 : PREVIEW ? 29 * 60_000 : LIVE ? 60 * 60_000 : 20 * 60_000)
  const admin = db()
  const health = await fetch(`${AGENT_URL}/health`).catch(() => null)
  expect(health?.ok, `the agent worker must be running at ${AGENT_URL} (pnpm --filter agent dev)`).toBe(true)

  const sb = await openSandbox(page, { stage: 'start', role: 'teacher' })
  try {
    const { data: box } = await admin.from('demo_sandboxes').select('school_id, logins').eq('id', sb.sandboxId).single()
    const schoolId = box!.school_id
    const logins = box!.logins as Logins
    const base = `/t/${sb.classId}`

    // 1. Teacher uploads the curriculum, Jemma drafts the map, the teacher approves it.
    let seen = 0
    if (SEED_MAP) {
      const approved = await admin
        .from('curriculum_maps')
        .insert({ class_id: sb.classId, status: 'approved', draft: topicMapDraft() as never, approved_at: new Date().toISOString() })
        .select('id')
        .single()
      expect(approved.error).toBeNull()
      const rows = await admin
        .from('topics')
        .insert(
          TERMS.flatMap((t) =>
            t.topics.map((p, i) => ({ map_id: approved.data!.id, term: t.term, position: i + 1, name: p.name, short_name: p.short ?? p.name, family: p.family, misconceptions: p.misconceptions })),
          ),
        )
        .select('id, name')
      expect(rows.error).toBeNull()
      const topicId = new Map(rows.data!.map((t) => [t.name, t.id]))
      for (const p of TERMS.flatMap((t) => t.topics).filter((t) => t.needs.length)) {
        await admin.from('topics').update({ prerequisite_ids: p.needs.map((n) => topicId.get(n)!) }).eq('id', topicId.get(p.name)!)
      }
    } else {
      await page.goto(`${base}/curriculum`)
      seen = await eventCount(schoolId)
      await page.getByRole('button', { name: 'Use the sample curriculum' }).click()
      await agentIdle(schoolId, 'drafting the map', seen)
      await page.goto(`${base}/curriculum`)
      await page.getByRole('link', { name: 'Check the draft map' }).click()
      await page.waitForURL(/\/curriculum\/map$/, { timeout: 60_000 }) // a dev server compiles the route on first visit
      await expect(page.getByRole('heading', { level: 1 })).toContainText(/topics in \d terms?/)
      await page.getByRole('button', { name: 'Approve map' }).click()
      await page.waitForURL(`**${base}/curriculum`)
      await expect(page.getByText(/^Approved /)).toBeVisible()
    }
    const map = await admin.from('curriculum_maps').select('id, status').eq('class_id', sb.classId).single()
    expect(map.data?.status).toBe('approved')
    const topics = await admin.from('topics').select('id').eq('map_id', map.data!.id)
    expect(topics.data!.length).toBeGreaterThan(5)

    // 2. Teacher snaps the memo, Jemma reads the key, the teacher approves it.
    await page.goto(`${base}/snap`)
    await expect(page.getByRole('heading', { name: 'Which test are we marking?' })).toBeVisible()
    seen = await eventCount(schoolId)
    await page.locator('input[type=file][capture]').setInputFiles(await sampleFile('class-test-1/memo.png', 'memo.png'))
    await page.waitForURL(/\/snap\/[0-9a-f-]+\/key$/)
    const testId = page.url().match(/snap\/([0-9a-f-]+)\/key/)![1]!
    await agentIdle(schoolId, 'reading the memo', seen)
    await page.reload()
    await expect(page.getByRole('heading', { name: /I read \d+ answers from the memo/ })).toBeVisible()
    for (const yes of await page.getByRole('button', { name: /^Yes, / }).all()) await yes.click().catch(() => undefined)
    await page.getByRole('button', { name: 'Approve key, snap papers' }).click()
    await page.waitForURL(/\/papers$/)
    const key = await admin.from('answer_keys').select('status, items').eq('test_id', testId).single()
    expect(key.data?.status).toBe('approved')
    expect((key.data!.items as unknown[]).length).toBe(10)

    // 3. The 5 sample papers: Jemma reads and marks them, finds the gaps, writes the class report and each lesson.
    seen = await eventCount(schoolId)
    if (test.info().project.name === 'laptop') {
      // The laptop page has no sample button: the teacher uploads the five scans (each file becomes a paper).
      const scans = await Promise.all(['amina', 'thabo', 'lerato', 'sipho', 'naledi'].map((n) => sampleFile(`class-test-1/${n}.png`, `${n}.png`)))
      await page.locator('input#files').setInputFiles(scans)
      await expect(page.getByText('5 papers ready')).toBeVisible({ timeout: 60_000 })
      await page.getByRole('link', { name: 'Mark them' }).click()
    } else {
      await page.getByRole('button', { name: 'Use the sample papers' }).click()
      await expect(page.getByRole('heading', { name: '5 papers in. Snap the next one, or add a page.' })).toBeVisible({ timeout: 30_000 })
      await page.getByRole('link', { name: 'Done snapping · 5 papers' }).click()
    }
    await page.waitForURL(/\/progress$/)
    await agentIdle(schoolId, 'reading the 5 papers', seen + 4)
    const papers = await admin.from('papers').select('id, child_id, status, total, name_read').eq('test_id', testId)
    expect(papers.data).toHaveLength(5)
    expect(papers.data!.every((p) => p.status === 'marked' || p.status === 'needs_you')).toBe(true)
    const gaps = await admin.from('gaps').select('child_id').eq('stage', 'new').in('child_id', papers.data!.map((p) => p.child_id).filter((c): c is string => !!c))
    expect(gaps.data!.length).toBeGreaterThan(0)
    const reteach = await admin.from('reteach_plans').select('topic_name').eq('test_id', testId)
    expect(reteach.data!.length).toBeGreaterThan(0)
    await page.goto(base)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    // 4. Teacher fixes Sipho Q7: through Needs you when Jemma was unsure, else on the marked paper.
    const sipho = papers.data!.find((p) => p.name_read === 'Sipho')!
    const check = await admin.from('needs_you_items').select('id').eq('school_id', schoolId).eq('kind', 'check_answer').eq('status', 'open').eq('ref_id', sipho.id)
    seen = await eventCount(schoolId)
    if (check.data?.length) {
      await page.goto(`${base}/needs-you/${check.data[0]!.id}`)
      await page.getByRole('button', { name: '0,6', exact: true }).click()
      const confirmation = test.info().project.name === 'laptop'
        ? /^0,6 matches the key, so question 7 gets 1 mark\.$/
        : /^0,6 matches the key\. Question 7 gets 1 mark\.$/
      await expect(page.getByText(confirmation)).toBeVisible({ timeout: 30_000 })
      await page.getByRole('button', { name: "Confirm Sipho's paper" }).click()
    } else {
      await page.goto(`${base}/papers/${sipho.id}/fix?q=7`)
      await page.getByRole('button', { name: 'Right', exact: true }).click()
      await page.getByRole('button', { name: 'Save' }).click()
    }
    await expect.poll(async () => (await admin.from('question_results').select('mark').eq('paper_id', sipho.id).eq('n', 7).single()).data?.mark, { timeout: 30_000 }).toBe(1)
    await agentIdle(schoolId, 'redoing the class report after the fix', seen)

    // 5. Switch to Thandi, link Amina, switch back to approve, open Amina's profile.
    await signInAs(page, logins, 'parent')
    await page.goto(`/p/add?code=${sb.joinCode}&child=Amina`)
    await page.getByRole('button', { name: 'Link Amina' }).click()
    await page.getByRole('button', { name: 'Agree and ask Ms Banda' }).click()
    await expect(page).toHaveURL(/\/p\/add\/pending/, { timeout: 30_000 })
    const link = await admin.from('parent_links').select('id, status').eq('child_id', sb.childId).single()
    expect(link.data?.status).toBe('pending')
    await signInAs(page, logins, 'teacher')
    await page.goto(`${base}/link-requests/${link.data!.id}`)
    await page.getByRole('button', { name: 'Yes, approve' }).click()
    await expect(page).toHaveURL(new RegExp(`${base}$`), { timeout: 60_000 })
    await signInAs(page, logins, 'parent')
    await page.goto(`/p/${sb.childId}`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Amina')
    await expect(page.getByRole('region', { name: 'Marks by topic' })).toBeVisible()

    // 6. Parent hands over, Amina does the session. No right or wrong on screen; she misses two tries.
    const session = await admin.from('sessions').select('id, lesson_id, status').eq('child_id', sb.childId).eq('status', 'planned').not('lesson_id', 'is', null).single()
    expect(session.error).toBeNull()
    const lesson = await admin.from('lessons').select('format, content, audio_path').eq('id', session.data!.lesson_id!).single()
    const content = lesson.data!.content as { warmup: LessonQuestion[]; questions: LessonQuestion[] }
    const byPrompt = new Map([...content.warmup, ...content.questions].map((q) => [q.prompt, q]))
    await page.goto(`/p/${sb.childId}/learn`)
    const startSessionLink = test.info().project.name === 'laptop'
      ? /^Start, then hand the phone to Amina$/
      : /^Start, then hand Amina the phone/
    await page.getByRole('link', { name: startSessionLink }).click()
    await page.waitForURL(`**/p/${sb.childId}/learn/handover`)
    await page.getByRole('button', { name: 'Amina has the phone' }).click()
    seen = await eventCount(schoolId)
    await page.waitForURL(`**/k/session/${session.data!.id}`)
    let tries = 0
    let answered: string | null = null
    for (let guard = 0; guard < 400 && !(await page.getByRole('heading', { name: /^You finished/ }).isVisible()); guard++) {
      const prompt = await page.locator('h1[data-prompt]').first().getAttribute('data-prompt', { timeout: 500 }).catch(() => null)
      if (prompt && prompt === answered) {
        await page.waitForTimeout(300) // the next question is still loading
      } else if (prompt) {
        const isTry = await page.getByText(/^Question \d+ of \d+$/).isVisible()
        if (isTry) tries++
        await answerQuestion(page, byPrompt.get(prompt)!, !(isTry && (tries === 2 || tries === 5)))
        answered = prompt
        // The child never sees right or wrong, a running score or a total during a quiz.
        if (isTry && tries < 5) await expect(page.getByText(/^(Right|Wrong|Correct|Well done|Score)\b/i)).toHaveCount(0)
      } else if (await page.getByRole('button', { name: "I'm ready" }).isVisible()) {
        answered = null
        await page.getByRole('button', { name: "I'm ready" }).click()
      } else if (await page.getByRole('button', { name: 'Next card' }).isVisible()) {
        await page.getByRole('button', { name: 'Next card' }).click()
      } else {
        await page.waitForTimeout(400)
      }
    }
    await expect(page.getByRole('heading', { name: /^You finished/ })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Got it' }).click()
    await page.getByRole('button', { name: 'Done' }).click()
    await expect(page).toHaveURL(/\/k\/done$/)
    await expect(page.getByText(/Now pass the phone back to /)).toBeVisible()
    const done = await admin.from('sessions').select('status, right').eq('id', session.data!.id).single()
    expect(done.data?.status).toBe('done')
    expect(done.data?.right).toBe(tries - 2)
    await agentIdle(schoolId, 'moving the gap and planning the next lesson', seen)

    // 7. Ms Banda's class home and Thandi's session page show the result.
    await signInAs(page, logins, 'teacher')
    await page.goto(base)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText(/Amina/).first()).toBeVisible()
    await signInAs(page, logins, 'parent')
    await page.goto(`/p/${sb.childId}/sessions/${session.data!.id}`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Amina')
    await expect(page.getByText(`${tries - 2} of ${tries}`)).toBeVisible()

    // 8. Teacher adds a note and marks the register; Thandi adds an activity; the guidance card updates.
    const card = async () => (await admin.from('guidance_cards').select('updated_at').eq('child_id', sb.childId).maybeSingle()).data?.updated_at ?? ''
    const before = await card()
    seen = await eventCount(schoolId)
    await signInAs(page, logins, 'teacher')
    await page.goto(`${base}/learners/${sb.childId}`)
    await page.getByRole('button', { name: 'Confidence' }).click()
    const note = 'Asked why we cannot just add the bottoms. Keen to try fraction strips.'
    await page.getByRole('textbox', { name: 'Note' }).fill(note)
    await page.getByRole('button', { name: 'Save note' }).click()
    await expect(page.getByRole('region', { name: 'Earlier notes' }).getByText(note)).toBeVisible({ timeout: 30_000 }) // a cold dev server or preview saves slowly
    await page.goto(`${base}/register`)
    await page.getByRole('button', { name: 'Mark everyone here' }).click()
    await page.getByRole('group', { name: 'Thabo' }).getByRole('button', { name: 'Away' }).click()
    await page.getByRole('button', { name: 'Save register' }).click()
    await page.waitForURL(new RegExp(`${base}/learners$`))
    const today = new Date().toISOString().slice(0, 10)
    const att = await admin.from('attendance').select('status').eq('day', today).in('child_id', papers.data!.map((p) => p.child_id!))
    expect(att.data).toHaveLength(5)

    await signInAs(page, logins, 'parent')
    await page.goto(`/p/${sb.childId}/activities/new`)
    await page.getByRole('button', { name: 'Club' }).click()
    await page.getByLabel('What is it called?').fill('Chess club')
    await page.getByLabel(/^Where/).fill('Hillview Primary, after school')
    await page.getByRole('button', { name: 'Wed' }).click()
    await page.getByRole('button', { name: 'Save activity' }).click()
    await expect(page).toHaveURL(`/p/${sb.childId}`, { timeout: 30_000 })
    await agentIdle(schoolId, 'updating the guidance card', seen + 1)
    expect(await card()).not.toBe(before)
    const logged = await admin.from('activity_log').select('text').eq('school_id', schoolId).eq('tool', 'subject_guidance')
    expect(logged.data!.length).toBeGreaterThan(0)
    // The teacher's note also asked for a Long view update for Amina, and the agent finished it.
    const longView = await admin.from('events').select('status').eq('school_id', schoolId).eq('type', 'long_view.requested').eq('payload->>childId', sb.childId)
    expect(longView.data!.length).toBeGreaterThan(0)
    expect(longView.data!.every((e) => e.status === 'done')).toBe(true)
    await page.goto(`/p/${sb.childId}`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Amina')
  } finally {
    await sb.cleanup().catch(() => undefined)
  }
})
