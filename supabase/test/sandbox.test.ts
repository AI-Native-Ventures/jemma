import { afterAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createSandbox, deleteSandbox, resetSandbox } from '../seed/demo'
import { SAMPLE_FILES } from '../seed/fixtures/sample-papers'
import { classTest1Scores, classTest1ScoresBeforeFix } from '../seed/fixtures/class-test-1'
import { CAST } from '../seed/fixtures/cast'
import { longHistory } from '../seed/fixtures/long-history'
import { HILLVIEW_CLASSES, HILLVIEW_LINKS, madeUpClasses } from '../seed/fixtures/hillview'
import { classGaps } from '../../packages/profiling/src/logic'
import {
  AnswerKeyItemSchema,
  GuidanceSchema,
  LessonSchema,
  ReteachSchema,
  TopicMapDraftSchema,
} from '../../packages/profiling/src/schemas'
import type { JemmaDb } from '../../packages/profiling/src/db'

const url = process.env.SUPABASE_URL!
const anonKey = process.env.SUPABASE_ANON_KEY!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(url, serviceKey, opts) as unknown as JemmaDb

const sandboxIds: string[] = []
async function make(stage?: 'start' | 'marked' | 'session_done', kind?: 'hillview' | 'empty') {
  const s = await createSandbox(admin, { stage, kind })
  sandboxIds.push(s.sandboxId)
  return s
}

async function ok<T>(q: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data as NonNullable<T>
}

async function loginsOf(sandboxId: string) {
  const row = await ok(admin.from('demo_sandboxes').select('school_id, logins, stage').eq('id', sandboxId).single())
  return row as { school_id: string; stage: string; logins: Record<string, { email: string; password: string; userId: string }> }
}

async function signIn(sandboxId: string, who: 'teacher' | 'parent' | 'learner') {
  const { logins } = await loginsOf(sandboxId)
  const login = logins[who]!
  const client = createClient(url, anonKey, opts)
  const { error } = await client.auth.signInWithPassword({ email: login.email, password: login.password })
  if (error) throw new Error(`${who} sign-in failed: ${error.message}`)
  return client
}

/** Signs in as a teacher or parent stored under `teachers` or `parents` in the sandbox row. */
async function signInAs(sandboxId: string, key: string) {
  const { logins } = await loginsOf(sandboxId)
  const all = logins as unknown as Record<string, Record<string, { email: string; password: string }>>
  const login = all.teachers?.[key] ?? all.parents?.[key]
  if (!login) throw new Error(`no login for ${key}`)
  const client = createClient(url, anonKey, opts)
  const { error } = await client.auth.signInWithPassword({ email: login.email, password: login.password })
  if (error) throw new Error(`${key} sign-in failed: ${error.message}`)
  return client
}

afterAll(async () => {
  await Promise.all(sandboxIds.map((id) => deleteSandbox(admin, id).catch(() => undefined)))
}, 120_000)

describe('sandboxes', () => {
  test('two sandboxes are isolated', async () => {
    const [a, b] = await Promise.all([make(), make()])
    expect(a.schoolId).not.toBe(b.schoolId)
    expect(a.joinCode).not.toBe(b.joinCode)
    expect(a.childLoginCode).not.toBe(b.childLoginCode)
    expect(a.childPin).toBe('1234')

    // Ms Banda teaches 6B Mathematics (the five) and 5A Mathematics (six made-up learners): she sees eleven children.
    const teacherA = await signIn(a.sandboxId, 'teacher')
    const kids = await ok(teacherA.from('children').select('first_name, school_id'))
    expect(kids).toHaveLength(11)
    expect(kids.map((k) => k.first_name)).toEqual(expect.arrayContaining(['Amina', 'Lerato', 'Naledi', 'Sipho', 'Thabo']))
    expect(new Set(kids.map((k) => k.school_id))).toEqual(new Set([a.schoolId]))
    const classes = await ok(teacherA.from('classes').select('id, name'))
    expect(classes.map((c) => c.name).sort()).toEqual(['5A Mathematics', '6B Mathematics'])
    expect(classes.map((c) => c.id)).toContain(a.classId)

    const parentB = await signIn(b.sandboxId, 'parent')
    expect(await ok(parentB.from('children').select('id'))).toEqual([])
  })

  test('reset restores the start stage', async () => {
    const s = await make()
    const before = await loginsOf(s.sandboxId)
    await ok(admin.from('curriculum_maps').insert({ class_id: s.classId, status: 'draft' }))
    const [test] = await ok(
      admin.from('tests').insert({ class_id: s.classId, title: 'Extra', out_of: 10 }).select('id'),
    )
    const kids = await ok(admin.from('children').select('id').eq('school_id', s.schoolId).limit(1))
    await ok(
      admin.from('papers').insert({ test_id: test!.id, child_id: kids[0]!.id, owner: 'teacher', kind: 'test', status: 'queued' }),
    )

    await resetSandbox(admin, s.sandboxId)

    const after = await loginsOf(s.sandboxId)
    expect(after.stage).toBe('start')
    expect(after.school_id).not.toBe(before.school_id)
    expect(await ok(admin.from('schools').select('id').eq('id', before.school_id))).toEqual([])
    const [cls] = await ok(admin.from('classes').select('id, join_code').eq('school_id', after.school_id))
    const children = await ok(admin.from('children').select('id, first_name').eq('school_id', after.school_id))
    const childIds = children.map((c) => c.id)
    expect(children).toHaveLength(23)
    const five = children.filter((c) => (CAST.children as readonly string[]).includes(c.first_name)).map((c) => c.id)
    expect(five).toHaveLength(5)

    const maps = await ok(admin.from('curriculum_maps').select('id').eq('class_id', cls!.id))
    expect(maps).toHaveLength(0)
    const tests = await ok(admin.from('tests').select('id').eq('class_id', cls!.id))
    expect(tests).toHaveLength(0)
    const testPapers = await ok(admin.from('papers').select('id').in('child_id', childIds).not('test_id', 'is', null))
    expect(testPapers).toHaveLength(0)
    // The only paper left is Amina's Term 3 history.
    const history = await ok(admin.from('papers').select('id, status').in('child_id', childIds))
    expect(history).toHaveLength(1)
    expect(await ok(admin.from('observations').select('id').in('child_id', childIds))).toHaveLength(2)
    expect(await ok(admin.from('attendance').select('child_id').in('child_id', five))).toHaveLength(50)
    expect(await ok(admin.from('attendance').select('child_id').in('child_id', childIds))).toHaveLength(230)
    // The Long view records come back too, in their own table: the five learners' Mathematics history and the made-up learners'.
    const year = new Date().getUTCFullYear()
    const expectedRecords =
      longHistory(year, CAST.teacher.displayName).length +
      madeUpClasses(year).reduce((n, x) => n + x.batch.learners.reduce((m, l) => m + l.records.length, 0), 0)
    const counted = await admin.from('learner_records').select('id', { count: 'exact', head: true }).in('child_id', childIds)
    expect(counted.count).toBe(expectedRecords)
    expect(await ok(admin.from('activities').select('id').in('child_id', childIds))).toHaveLength(2)
    expect(await ok(admin.from('gaps').select('id').in('child_id', childIds).eq('stage', 'fixed'))).toHaveLength(3)
    expect(await ok(admin.from('format_trials').select('id').in('child_id', childIds))).toHaveLength(9)
    expect(await ok(admin.from('parent_links').select('id').eq('class_id', cls!.id))).toHaveLength(0)

    // Old users are gone, new passwords work, and the child code still has PIN 1234 behind it.
    const teacher = await signIn(s.sandboxId, 'teacher')
    expect((await ok(teacher.from('children').select('id'))).length).toBe(11)
    expect(await ok(admin.from('child_logins').select('code').in('child_id', childIds))).toHaveLength(1)
  })

  test('making a sandbox and resetting one take under 12 seconds', async () => {
    const t0 = Date.now()
    const s = await make()
    const made = Date.now() - t0
    const t1 = Date.now()
    await resetSandbox(admin, s.sandboxId)
    const reset = Date.now() - t1
    process.stderr.write(`sandbox timing on ${new URL(url).hostname}: create ${made} ms, reset ${reset} ms\n`)
    expect(made).toBeLessThan(12_000)
    expect(reset).toBeLessThan(12_000)
  })

  test('the start stage has the cast, notes, history and sample files', async () => {
    const s = await make()
    const kids = await ok(admin.from('children').select('id, first_name, parent_first_name, parent_relation').eq('school_id', s.schoolId))
    const amina = kids.find((k) => k.first_name === 'Amina')!
    expect(amina.parent_first_name).toBe('Thandi')
    expect(amina.parent_relation).toBe('mum')
    const obs = await ok(admin.from('observations').select('kind, text, created_at').eq('child_id', amina.id).order('created_at'))
    expect(obs.map((o) => [o.kind, o.text])).toEqual([
      ['effort', 'Finished the decimals extension task without help.'],
      ['participation', 'Works well in a group and explains her thinking clearly.'],
    ])
    const att = await ok(admin.from('attendance').select('child_id, status').in('child_id', kids.map((k) => k.id)))
    const here = (name: string) => {
      const id = kids.find((k) => k.first_name === name)!.id
      return att.filter((a) => a.child_id === id && a.status !== 'away').length
    }
    expect([here('Amina'), here('Lerato'), here('Naledi'), here('Sipho'), here('Thabo')]).toEqual([9, 10, 9, 10, 8])
    const fixed = await ok(admin.from('gaps').select('topic_name').eq('child_id', amina.id).eq('stage', 'fixed'))
    expect(fixed.map((g) => g.topic_name).sort()).toEqual(['Equivalent fractions', 'Ordering whole numbers', 'Rounding off'])
    expect(await ok(admin.from('curriculum_maps').select('id').eq('class_id', s.classId))).toHaveLength(0)
    expect(await ok(admin.from('tests').select('id').eq('class_id', s.classId))).toHaveLength(0)
    const startLogins = await loginsOf(s.sandboxId)
    expect(await ok(admin.from('notifications').select('id').in('user_id', [startLogins.logins.teacher!.userId, startLogins.logins.parent!.userId]))).toHaveLength(0)

    const papers = Object.values(SAMPLE_FILES.papers)
    expect(papers).toHaveLength(5)
    const listed = await admin.storage.from(SAMPLE_FILES.bucket).list('class-test-1')
    expect(listed.error).toBeNull()
    for (const p of papers) {
      expect(listed.data!.map((f) => `class-test-1/${f.name}`)).toContain(p)
    }
  })

  test('stage marked has the rows the boards need', async () => {
    const s = await make('marked')
    const kids = await ok(admin.from('children').select('id, first_name').eq('school_id', s.schoolId))
    const idOf = Object.fromEntries(kids.map((k) => [k.first_name.toLowerCase(), k.id])) as Record<string, string>
    const aminaId = idOf.amina!

    // Map, test and key.
    const [map] = await ok(admin.from('curriculum_maps').select('id, status, draft').eq('class_id', s.classId))
    expect(map!.status).toBe('approved')
    const draft = TopicMapDraftSchema.parse(map!.draft)
    expect(draft.terms.flatMap((t) => t.topics)).toHaveLength(24)
    expect(draft.terms.map((t) => t.topics.length)).toEqual([6, 6, 6, 6])
    expect(await ok(admin.from('topics').select('id').eq('map_id', map!.id))).toHaveLength(24)
    const [test] = await ok(admin.from('tests').select('id, title, out_of, topic_ids').eq('class_id', s.classId))
    expect(test!.title).toBe('Class Test 1: Fractions and decimals')
    expect(test!.topic_ids).toHaveLength(7)
    const [key] = await ok(admin.from('answer_keys').select('status, items').eq('test_id', test!.id))
    expect(key!.status).toBe('approved')
    const items = (key!.items as unknown[]).map((i) => AnswerKeyItemSchema.parse(i))
    expect(items.map((i) => i.answer)).toEqual(['3/4', '5/6', '1/4', '3 3/4', '8', '2/3', '0,6', '0,75', 'B', 'R5'])

    // 5 marked papers, Amina 6 of 10.
    const papers = await ok(admin.from('papers').select('id, child_id, status, total, name_read').eq('test_id', test!.id))
    expect(papers).toHaveLength(5)
    // Pre-fix state: Sipho's paper waits on his unsure Q7 (6/10 until it is fixed).
    expect(papers.filter((p) => p.status === 'needs_you').map((p) => p.child_id)).toEqual([idOf.sipho])
    expect(papers.filter((p) => p.status === 'marked')).toHaveLength(4)
    for (const [name, score] of Object.entries(classTest1ScoresBeforeFix)) {
      expect(papers.find((p) => p.child_id === idOf[name]!)!.total).toBe(score)
    }
    const siphoPaper = papers.find((p) => p.child_id === idOf.sipho)!
    const [q7] = await ok(admin.from('question_results').select('answer_read, read_confidence, correct, mark, previous_answer, changed_by').eq('paper_id', siphoPaper.id).eq('n', 7))
    expect(q7).toMatchObject({ answer_read: '0,8', correct: false, mark: 0, previous_answer: null, changed_by: null })
    expect(q7!.read_confidence).toBeCloseTo(0.42, 2)
    const needs = await ok(admin.from('needs_you_items').select('kind, status, title, detail, ref_id, child_id').eq('school_id', s.schoolId).eq('kind', 'check_answer'))
    expect(needs).toEqual([
      { kind: 'check_answer', status: 'open', title: "Check 1 answer on Sipho's paper", detail: 'Class Test 1 · question 7 · I read 0,8', ref_id: siphoPaper.id, child_id: idOf.sipho },
    ])
    const aminaPaper = papers.find((p) => p.child_id === aminaId)!
    const aminaRows = await ok(admin.from('question_results').select('n, mark, correct, answer_read').eq('paper_id', aminaPaper.id).order('n'))
    expect(aminaRows.reduce((sum, r) => sum + r.mark, 0)).toBe(6)
    expect(aminaRows.filter((r) => !r.correct).map((r) => [r.n, r.answer_read])).toEqual([
      [1, '2/6'],
      [2, '3/9'],
      [4, '3 2/6'],
      [8, '0,30'],
    ])
    expect(await ok(admin.from('paper_pages').select('storage_path').eq('paper_id', aminaPaper.id))).toHaveLength(1)
    const stored = await admin.storage.from('papers').list(`${s.schoolId}/${aminaPaper.id}`)
    expect(stored.data!.length).toBe(1)

    // Retagged: results carry topic ids from the map.
    const tagged = await ok(admin.from('question_results').select('topic_id').eq('paper_id', aminaPaper.id))
    expect(tagged.every((r) => r.topic_id !== null)).toBe(true)
    const fixedGaps = await ok(admin.from('gaps').select('topic_id, topic_name').eq('child_id', aminaId).eq('stage', 'fixed'))
    expect(fixedGaps.find((g) => g.topic_name === 'Equivalent fractions')!.topic_id).not.toBeNull()

    // Class gaps computed from the stored rows without the unsure answer: 3 gaps, 4 / 3 / 2 learners.
    const results = await ok(
      admin
        .from('question_results')
        .select('child_id, n, prompt, answer_read, correct, topic_name, misconception, gap_topic_id, paper_id')
        .in('paper_id', papers.map((p) => p.id))
        .gte('read_confidence', 0.5),
    )
    const topics = await ok(admin.from('topics').select('id, name').eq('map_id', map!.id))
    const topicName = new Map(topics.map((t) => [t.id, t.name]))
    const gaps = classGaps(
      results.map((r) => ({
        childId: r.child_id,
        n: r.n,
        prompt: r.prompt,
        answerRead: r.answer_read,
        correct: r.correct,
        topicName: r.topic_name,
        gapTopicName: r.gap_topic_id ? (topicName.get(r.gap_topic_id) ?? null) : null,
        misconception: r.misconception,
      })),
      kids.map((k) => ({ id: k.id, name: k.first_name })),
    )
    expect(gaps.map((g) => [g.topicName, g.learners.length])).toEqual([
      ['Adding fractions with different denominators', 4],
      ['Adding decimals', 3],
      ['Comparing fractions', 2],
    ])
    expect(gaps[0]!.mistake.example).toBe('1/2 + 1/4 = 2/6')
    expect(gaps[0]!.mistake.count).toBe(10)
    const stored3 = await ok(admin.from('gaps').select('topic_name, stage, child_id').in('child_id', kids.map((k) => k.id)).neq('stage', 'fixed'))
    expect(new Set(stored3.map((g) => g.topic_name)).size).toBe(3)
    expect(stored3.every((g) => g.stage === 'new')).toBe(true)

    // Reteach, lesson, planned session, guidance, link.
    const [reteach] = await ok(admin.from('reteach_plans').select('topic_name, content, done_at, test_id, why, missing_basic, explanation').eq('class_id', s.classId))
    expect(reteach!.topic_name).toBe('Adding fractions with different denominators')
    expect(reteach!.test_id).toBe(test!.id)
    expect(reteach!.why).toBe('4 of 5 add the tops and the bottoms. It points back to equivalent fractions, a Term 1 basic.')
    expect(reteach!.missing_basic).toBe('Equivalent fractions · Term 1')
    expect(reteach!.explanation).toBe("The bottom number says the size of the pieces. Halves and quarters are different sizes, so they can't be added until the bottoms match.")
    expect(ReteachSchema.parse(reteach!.content).steps).toHaveLength(4)
    const lessons = await ok(admin.from('lessons').select('id, format, topic_name, content').eq('child_id', aminaId))
    const tonight = lessons.find((l) => LessonSchema.safeParse(l.content).success)!
    expect(tonight.format).toBe('diagram')
    const lesson = LessonSchema.parse(tonight.content)
    expect(lesson.minutes).toBe(12)
    expect(lesson.diagram!.steps).toHaveLength(3)
    // The week on parent-learn: tonight has the written lesson, the other 3 sessions have no lesson row.
    expect(lessons).toHaveLength(1)
    const sessions = await ok(
      admin.from('sessions').select('status, lesson_id, planned_for, topic_name, topic_id, format, planned_minutes, question_count').eq('child_id', aminaId).order('planned_for'),
    )
    expect(sessions.every((x) => x.status === 'planned')).toBe(true)
    const plusDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
    expect(sessions.map((x) => x.planned_for)).toEqual([0, 2, 3, 5].map(plusDays))
    expect(sessions.map((x) => x.lesson_id)).toEqual([tonight.id, null, null, null])
    expect(sessions.every((x) => x.topic_id !== null)).toBe(true)
    expect(sessions.map((x) => [x.topic_name, x.format, x.planned_minutes, x.question_count])).toEqual([
      ['Adding fractions with different denominators', 'diagram', 12, 5],
      ['Adding decimals', 'reading', 10, null],
      ['Adding fractions with different denominators', 'diagram', 6, 5],
      ['Adding decimals', 'audio', 10, null],
    ])
    const [card] = await ok(admin.from('guidance_cards').select('content').eq('child_id', aminaId))
    const guidance = GuidanceSchema.parse(card!.content)
    expect(guidance.focus).toHaveLength(2)
    const links = await ok(admin.from('parent_links').select('status, consent').eq('class_id', s.classId))
    expect(links).toHaveLength(1)
    expect(links[0]!.status).toBe('approved')
    const trials = await ok(admin.from('format_trials').select('format, score').eq('child_id', aminaId))
    expect(trials).toHaveLength(9)

    // The parent sees Amina, the learner sees only herself.
    const parent = await signIn(s.sandboxId, 'parent')
    expect((await ok(parent.from('children').select('first_name'))).map((c) => c.first_name)).toEqual(['Amina'])
    const learner = await signIn(s.sandboxId, 'learner')
    expect((await ok(learner.from('children').select('first_name'))).map((c) => c.first_name)).toEqual(['Amina'])

    const log = await ok(admin.from('activity_log').select('text').eq('class_id', s.classId))
    expect(log.map((l) => l.text)).toContain('Wrote a 10 minute reteach for adding fractions')

    // Bell: pre-fix state, newest item unread, hrefs are app routes.
    const bell = async (userId: string) =>
      await ok(admin.from('notifications').select('title, href, read_at, created_at').eq('user_id', userId).order('created_at', { ascending: false }))
    const { logins } = await loginsOf(s.sandboxId)
    const tBell = await bell(logins.teacher!.userId)
    expect(tBell.map((n) => [n.title, n.read_at === null])).toEqual([
      ['Class Test 1 is marked', true],
      ["You approved Thandi M as Amina's parent", false],
      ['Your topic map is approved', false],
    ])
    expect(tBell.map((n) => n.href)).toEqual([`/t/${s.classId}/tests/${test!.id}`, `/t/${s.classId}/learners/${aminaId}/profile`, `/t/${s.classId}/curriculum`])
    const pBell = await bell(logins.parent!.userId)
    expect(pBell.map((n) => [n.title, n.read_at === null])).toEqual([
      ["Tonight's lesson is ready", true],
      ['Class Test 1 is marked: 6 out of 10', false],
      ["Check Amina's homework", false],
    ])
    expect(pBell.map((n) => n.href)).toEqual([`/p/${aminaId}/learn`, `/p/${aminaId}/papers/${aminaPaper.id}`, expect.stringMatching(new RegExp(`^/p/${aminaId}/snap/[0-9a-f-]{36}$`))])
    // A parent signed in sees only their own bell.
    const parentClient = await signIn(s.sandboxId, 'parent')
    expect(await ok(parentClient.from('notifications').select('id'))).toHaveLength(3)
  })

  test('stage session_done has Amina at 3 of 5 and the gap at Practising', async () => {
    const s = await make('session_done')
    const [amina] = await ok(admin.from('children').select('id').eq('school_id', s.schoolId).eq('first_name', 'Amina'))
    // Post-fix state: Sipho's Q7 is 0,6 (fixed by Ms Banda), his paper is marked 7/10, the item is done.
    const [sipho] = await ok(admin.from('children').select('id').eq('school_id', s.schoolId).eq('first_name', 'Sipho'))
    const [siphoPaper] = await ok(admin.from('papers').select('id, status, total').eq('child_id', sipho!.id).not('test_id', 'is', null))
    expect(siphoPaper).toMatchObject({ status: 'marked', total: classTest1Scores.sipho })
    const [fixedQ7] = await ok(admin.from('question_results').select('answer_read, correct, mark, previous_answer, changed_by').eq('paper_id', siphoPaper!.id).eq('n', 7))
    const [teacherRow] = await ok(admin.from('classes').select('teacher_id').eq('id', s.classId))
    expect(fixedQ7).toEqual({ answer_read: '0,6', correct: true, mark: 1, previous_answer: '0,8', changed_by: teacherRow!.teacher_id })
    const doneNeeds = await ok(admin.from('needs_you_items').select('status').eq('school_id', s.schoolId).eq('kind', 'check_answer'))
    expect(doneNeeds).toEqual([{ status: 'done' }])
    const [session] = await ok(admin.from('sessions').select('id, status, right, minutes, finished_at').eq('child_id', amina!.id).eq('status', 'done'))
    expect(session!.status).toBe('done')
    expect(session!.right).toBe(3)
    expect(session!.minutes).toBe(12)
    expect(session!.finished_at).not.toBeNull()

    const items = await ok(admin.from('session_items').select('position, phase, correct, adapted, answer, seconds').eq('session_id', session!.id))
    const warmup = items.filter((i) => i.phase === 'warmup')
    const tries = items.filter((i) => i.phase === 'try').sort((a, b) => a.position - b.position)
    expect(warmup).toHaveLength(2)
    expect(warmup.every((i) => i.correct)).toBe(true)
    expect(tries.map((i) => i.correct)).toEqual([true, false, true, true, false])
    expect(tries.map((i) => i.answer)).toEqual(['3/4', '3/9', '3/8', '4/6', '4/12'])
    expect(tries.map((i) => i.adapted)).toEqual([null, null, 'easier', null, 'harder'])
    expect(tries.map((i) => i.seconds)).toEqual([100, 130, 80, 115, 150])

    const gaps = await ok(admin.from('gaps').select('topic_name, stage, first_practised_at').eq('child_id', amina!.id).neq('stage', 'fixed'))
    const adding = gaps.find((g) => g.topic_name === 'Adding fractions with different denominators')!
    expect(adding.stage).toBe('practising')
    expect(adding.first_practised_at).not.toBeNull()
    expect(gaps.find((g) => g.topic_name === 'Adding decimals')!.stage).toBe('new')
    const trials = await ok(admin.from('format_trials').select('score, session_id').eq('child_id', amina!.id).eq('format', 'diagram'))
    expect(trials).toHaveLength(6)
    expect(trials.filter((t) => t.session_id === session!.id).map((t) => t.score)).toEqual([3])
    const { logins } = await loginsOf(s.sandboxId)
    const unread = async (userId: string) =>
      (await ok(admin.from('notifications').select('title, read_at, created_at').eq('user_id', userId).order('created_at', { ascending: false })))
    const tBell = await unread(logins.teacher!.userId)
    expect(tBell.map((n) => [n.title, n.read_at === null])).toEqual([
      ['Amina finished her lesson: 3 of 5', true],
      ["Sipho's paper is done", false],
      ['Class Test 1 is marked', false],
      ["You approved Thandi M as Amina's parent", false],
      ['Your topic map is approved', false],
    ])
    const pBell = await unread(logins.parent!.userId)
    expect(pBell.map((n) => [n.title, n.read_at === null])).toEqual([
      ['Amina finished her lesson: 3 of 5', true],
      ["Tonight's lesson is ready", false],
      ['Class Test 1 is marked: 6 out of 10', false],
      ["Check Amina's homework", false],
    ])
    const log = await ok(admin.from('activity_log').select('text').eq('child_id', amina!.id))
    expect(log.map((l) => l.text)).toContain('Amina finished her lesson: 3 of 5. Moved her to Practising')
  })

  test('Hillview: three teachers, four Mathematics classes, the five learners of 6B in one class with one row each, and the parents as designed', async () => {
    const s = await make()
    expect(s.kind).toBe('hillview')
    const row = await ok(admin.from('demo_sandboxes').select('kind, logins').eq('id', s.sandboxId).single())
    expect(row.kind).toBe('hillview')
    const logins = row.logins as Record<string, unknown>
    expect(Object.keys((logins.teachers ?? {}) as object).sort()).toEqual(['dlamini', 'okafor'])
    expect(Object.keys((logins.parents ?? {}) as object).sort()).toEqual(['grace', 'nomsa', 'peter'])
    expect(logins.learners).toEqual({}) // a learner's login is made when someone picks them

    const profiles = await ok(admin.from('profiles').select('user_id, role, display_name, school_id').eq('school_id', s.schoolId))
    expect(profiles.filter((p) => p.role === 'teacher').map((p) => p.display_name).sort()).toEqual(['Mr Dlamini', 'Ms Banda', 'Ms Okafor'])
    expect(profiles.filter((p) => p.role === 'learner').map((p) => p.display_name)).toEqual(['Amina'])

    const classes = await ok(admin.from('classes').select('id, name, grade, subject, teacher_id, created_at').eq('school_id', s.schoolId).order('created_at'))
    expect(classes.map((c) => [c.name, c.grade, c.subject])).toEqual(HILLVIEW_CLASSES.map((c) => [c.name, c.grade, c.subject]))
    expect(classes[0]!.id).toBe(s.classId) // 6B Mathematics is the oldest: the home class
    const teacherName = (id: string) => profiles.find((p) => p.user_id === id)!.display_name
    expect(classes.map((c) => teacherName(c.teacher_id))).toEqual(['Ms Banda', 'Ms Banda', 'Mr Dlamini', 'Ms Okafor'])

    const children = await ok(admin.from('children').select('id, first_name, grade').eq('school_id', s.schoolId))
    expect(children).toHaveLength(23)
    expect(new Set(children.map((c) => c.first_name)).size).toBe(23)
    const enrolments = await ok(admin.from('enrolments').select('class_id, child_id').in('class_id', classes.map((c) => c.id)))
    const sixB = [classes[0]!.id]
    for (const name of CAST.children) {
      const kid = children.filter((c) => c.first_name === name)
      expect(kid, `one child row for ${name}`).toHaveLength(1)
      expect(enrolments.filter((e) => e.child_id === kid[0]!.id).map((e) => e.class_id).sort()).toEqual([...sixB].sort())
    }
    for (const c of classes.slice(1)) expect(enrolments.filter((e) => e.class_id === c.id)).toHaveLength(6)
    // Each class lists the learners it should.
    expect(enrolments.filter((e) => e.class_id === classes[0]!.id)).toHaveLength(5)

    // Parents: Thandi M links to Amina in the demo path (none yet); Nomsa K has two children in different grades; Peter A and Grace A guard one child.
    const links = await ok(admin.from('parent_links').select('parent_id, child_id, class_id, status').in('class_id', classes.map((c) => c.id)))
    expect(links.every((l) => l.status === 'approved')).toBe(true)
    expect(links).toHaveLength(HILLVIEW_LINKS.length)
    const parentName = (id: string) => profiles.find((p) => p.user_id === id)?.display_name
    const byParent = new Map<string, string[]>()
    const parentsRows = await ok(admin.from('profiles').select('user_id, display_name').in('user_id', links.map((l) => l.parent_id)))
    for (const l of links) byParent.set(parentsRows.find((p) => p.user_id === l.parent_id)!.display_name, [...(byParent.get(parentsRows.find((p) => p.user_id === l.parent_id)!.display_name) ?? []), l.child_id])
    expect(parentName(links[0]!.parent_id)).toBeUndefined() // parents have no school on their profile
    expect(byParent.get('Nomsa K')).toHaveLength(2)
    const nomsaGrades = byParent.get('Nomsa K')!.map((id) => children.find((c) => c.id === id)!.grade).sort()
    expect(nomsaGrades).toEqual([5, 7])
    expect(byParent.get('Peter A')).toHaveLength(1)
    expect(byParent.get('Grace A')).toEqual(byParent.get('Peter A'))
    expect(byParent.has('Thandi M')).toBe(false)
    const linkedChildren = new Set(links.map((l) => l.child_id))
    expect(children.filter((c) => !linkedChildren.has(c.id)).length).toBeGreaterThanOrEqual(5)

    // A parent sees only their children.
    const nomsa = await signInAs(s.sandboxId, 'nomsa')
    expect((await ok(nomsa.from('children').select('id'))).map((c) => c.id).sort()).toEqual([...byParent.get('Nomsa K')!].sort())
    // Mr Dlamini teaches 7A Mathematics (six learners): he sees those six and none of the five of 6B.
    const dlamini = await signInAs(s.sandboxId, 'dlamini')
    expect(await ok(dlamini.from('children').select('id'))).toHaveLength(6)
    const hidden = await ok(dlamini.from('learner_records').select('id').in('child_id', children.filter((c) => c.first_name === 'Amina').map((c) => c.id)))
    expect(hidden).toEqual([])
  })

  test('the five learners of 6B have exactly the Mathematics records develop gives them, and no record in another subject exists anywhere', async () => {
    const s = await make()
    const kids = await ok(admin.from('children').select('id, first_name').eq('school_id', s.schoolId).in('first_name', [...CAST.children]))
    const year = new Date().getUTCFullYear()
    const rows = await ok(admin.from('learner_records').select('subject').in('child_id', kids.map((k) => k.id)))
    expect(rows).toHaveLength(longHistory(year, CAST.teacher.displayName).length)
    const all = await ok(admin.from('learner_records').select('subject').eq('school_id', s.schoolId))
    expect(new Set(all.map((r) => r.subject))).toEqual(new Set(['Mathematics', null]))
    expect(await ok(admin.from('long_view_patterns').select('subject').in('child_id', kids.map((k) => k.id)).neq('subject', 'Mathematics'))).toEqual([])
  })

  test('an empty school has no class, no learner and one teacher; reset keeps it empty', async () => {
    const s = await make('start', 'empty')
    expect(s).toMatchObject({ kind: 'empty', classId: '' })
    const row = await loginsOf(s.sandboxId)
    expect(Object.keys(row.logins)).toEqual(['teacher'])
    expect(await ok(admin.from('classes').select('id').eq('school_id', s.schoolId))).toEqual([])
    expect(await ok(admin.from('children').select('id').eq('school_id', s.schoolId))).toEqual([])
    const profiles = await ok(admin.from('profiles').select('role, display_name').eq('school_id', s.schoolId))
    expect(profiles).toEqual([{ role: 'teacher', display_name: 'You' }])
    const teacher = await signIn(s.sandboxId, 'teacher')
    expect(await ok(teacher.from('classes').select('id'))).toEqual([])

    const before = row.school_id
    await resetSandbox(admin, s.sandboxId)
    const after = await ok(admin.from('demo_sandboxes').select('school_id, kind').eq('id', s.sandboxId).single())
    expect(after.kind).toBe('empty')
    expect(after.school_id).not.toBe(before)
    expect(await ok(admin.from('schools').select('id').eq('id', before))).toEqual([])
    expect(await ok(admin.from('classes').select('id').eq('school_id', after.school_id))).toEqual([])
    await signIn(s.sandboxId, 'teacher')
  })
})
