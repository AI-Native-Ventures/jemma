import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { MemoryStore } from '../src/ai'
import { createServiceClient, type JemmaDb } from '../src/db'
import { LearnerHistorySchema } from '../src/schemas'
import type { ToolContext } from '../src/tools/context'
import { getLearnerHistory } from '../src/tools/read/get-learner-history'
import { SaveLongViewOutputSchema, saveLongView } from '../src/tools/save/save-long-view'
import { createSandbox as createDemo, deleteSandbox } from '../../../supabase/seed'
import { loadEnv } from './helpers/env'

// One learner in two or three subjects, under different teachers: the history is grouped by subject, an answer takes its subject and
// grade from its class, a pattern is saved for one subject, and the teacher of that subject is asked to look.
// Database tests (jemma-demo). Nothing here calls a model.

vi.setConfig({ testTimeout: 90_000, hookTimeout: 180_000 })
const env = loadEnv()
const db: JemmaDb = createServiceClient({ SUPABASE_URL: env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY! })
const tag = `lvs${Date.now()}`
const year = new Date().getUTCFullYear()

type Demo = { sandboxId: string; schoolId: string; classId: string; amina: string; teacherId: string; otherTeacherId: string }
let d: Demo

const ctx = (): ToolContext => ({ db, schoolId: d.schoolId, eventId: null, env: { replayStore: new MemoryStore() }, now: () => new Date() })
const history = async () => LearnerHistorySchema.parse(await getLearnerHistory.run(ctx(), { childId: d.amina }))
const save = async (patterns: Parameters<typeof saveLongView.run>[1]['patterns']) => SaveLongViewOutputSchema.parse(await saveLongView.run(ctx(), { childId: d.amina, patterns }))
const rows = async () => (await db.from('long_view_patterns').select('*').eq('child_id', d.amina).order('subject').order('family')).data!
const reset = async () => {
  await db.from('long_view_patterns').delete().eq('child_id', d.amina)
  await db.from('needs_you_items').delete().eq('child_id', d.amina).eq('kind', 'review_long_view')
}

/** Marked quizzes of one strand in three terms in a row, all at 40 percent: a struggle in that subject. */
const lowQuizzes = (subject: string | null, family: string, titlePrefix: string, topic: string) =>
  [
    { year: year - 1, term: 3, month: '08' },
    { year: year - 1, term: 4, month: '11' },
    { year, term: 1, month: '02' },
  ].map((t) => ({
    school_id: d.schoolId, child_id: d.amina, source: 'quiz', grade: 7, year: t.year, term: t.term, happened_on: `${t.year}-${t.month}-10`, logged_at: `${t.year}-${t.month}-12T09:00:00Z`,
    teacher_name: 'Mrs Zulu', title: `${titlePrefix} ${t.year} T${t.term}`, family, topic_name: topic, marks: 8, out_of: 20, subject,
  }))

beforeAll(async () => {
  const s = await createDemo(db, { stage: 'start' })
  const kids = (await db.from('children').select('id, first_name').eq('school_id', s.schoolId)).data!
  const logins = (await db.from('demo_sandboxes').select('logins').eq('id', s.sandboxId).single()).data!.logins as { teacher: { userId: string }; parent: { userId: string } }
  d = { sandboxId: s.sandboxId, schoolId: s.schoolId, classId: s.classId, amina: kids.find((k) => k.first_name === 'Amina')!.id, teacherId: logins.teacher.userId, otherTeacherId: logins.parent.userId }

  // A second class for Amina: English, Grade 7, another teacher (the parent's account stands in for one). It has one test with four wrong answers in Term 1.
  const cls = (await db.from('classes').insert({ school_id: d.schoolId, teacher_id: d.otherTeacherId, name: '7A English', grade: 7, year, subject: 'English', join_code: `${tag}en`.slice(-12) }).select('id').single()).data!
  await db.from('enrolments').insert({ class_id: cls.id, child_id: d.amina })
  const map = (await db.from('curriculum_maps').insert({ class_id: cls.id, status: 'approved' }).select('id').single()).data!
  const topic = (await db.from('topics').insert({ map_id: map.id, term: 1, position: 1, name: 'Reading comprehension', family: 'reading' }).select('id').single()).data!
  const test = (await db.from('tests').insert({ class_id: cls.id, title: 'English Test 1', written_on: `${year}-02-20`, out_of: 4, topic_ids: [topic.id] }).select('id').single()).data!
  const paper = (await db.from('papers').insert({ test_id: test.id, child_id: d.amina, owner: 'teacher', kind: 'test', status: 'marked', name_read: 'Amina', total: 0 }).select('id').single()).data!
  await db.from('question_results').insert(
    [1, 2, 3, 4].map((n) => ({ paper_id: paper.id, child_id: d.amina, n, prompt: `Question ${n}`, answer_read: 'x', read_confidence: 0.95, correct: false, mark: 0, topic_id: topic.id, topic_name: 'Reading comprehension' })),
  )
  // Past English work: two more terms of reading quizzes, so reading is low in three terms in a row (Term 3 and 4 of last year, Term 1 of this year with the test).
  await db.from('learner_records').insert(lowQuizzes('English', 'reading', 'Reading quiz', 'Reading comprehension').slice(0, 2))
})
afterAll(async () => {
  if (d) await deleteSandbox(db, d.sandboxId).catch(() => undefined)
})

/** True while the database still has the old unique key (learner, kind, strand): two subjects cannot both hold the same strand name yet. */
async function oldKeyStillThere(): Promise<boolean> {
  const base = { child_id: d.amina, kind: 'strength', family: `probe_${tag}`, title: 't', statement: 's', terms: [], evidence: [] }
  const first = await db.from('long_view_patterns').insert({ ...base, subject: 'Mathematics' })
  const second = await db.from('long_view_patterns').insert({ ...base, subject: 'English' })
  await db.from('long_view_patterns').delete().eq('child_id', d.amina).eq('family', `probe_${tag}`)
  if (first.error) throw new Error(`the probe could not be written: ${first.error.message}`)
  return second.error?.code === '23505'
}

describe('one learner, two subjects', () => {
  test('the history has one group for each subject, Mathematics first, and the strands stay apart', async () => {
    const h = await history()
    expect(h.subjects.map((s) => s.subject)).toEqual(['Mathematics', 'English'])
    const [maths, english] = h.subjects as [(typeof h.subjects)[number], (typeof h.subjects)[number]]
    expect(maths.families.map((f) => f.family)).toEqual(expect.arrayContaining(['fractions', 'shapes']))
    expect(maths.families.map((f) => f.family)).not.toContain('reading')
    expect(english.families.map((f) => [f.family, f.label])).toEqual([['reading', 'Reading']])
    expect(english.notCounted).toEqual([])
  })

  test("this year's marked answers take their subject and grade from the class of the test, not from the child's grade", async () => {
    const h = await history()
    const english = h.subjects.find((s) => s.subject === 'English')!
    const reading = english.families.find((f) => f.family === 'reading')!
    // Amina's own grade is 6. The English class is Grade 7, and its test is in Term 1 of this year.
    expect(reading.bySlot.at(-1)).toMatchObject({ grade: 7, year, term: 1, percent: 0, points: 4 })
    const maths = h.subjects.find((s) => s.subject === 'Mathematics')!
    expect(maths.families.find((f) => f.family === 'fractions')!.bySlot.every((t) => t.grade <= 6)).toBe(true)
    // The test's answers are English evidence only.
    const english3 = h.candidates.find((c) => c.subject === 'English')!
    expect(english3).toMatchObject({ key: 'struggle:reading', family: 'reading' })
    expect(english3.evidence.some((e) => e.kind === 'result' && e.label.startsWith('English Test 1'))).toBe(true)
    for (const c of h.candidates.filter((x) => x.subject === 'Mathematics')) expect(c.evidence.some((e) => e.label.startsWith('English Test 1'))).toBe(false)
  })

  test('every pattern code finds says its subject, and a note or an observation has none', async () => {
    const h = await history()
    expect(h.candidates.map((c) => [c.subject, c.key])).toEqual([
      ['Mathematics', 'struggle:fractions'],
      ['Mathematics', 'strength:shapes'],
      ['English', 'struggle:reading'],
    ])
    expect(h.notes.length).toBeGreaterThan(0)
    expect(h.notes.every((n) => n.subject === null)).toBe(true)
    expect(h.loggedLate.every((x) => x.subject === null || typeof x.subject === 'string')).toBe(true)
  })

  test('a record with a family and no subject reads as Mathematics: the history is the same', async () => {
    const before = JSON.stringify(await history())
    await db.from('learner_records').update({ subject: null }).eq('child_id', d.amina).not('family', 'is', null).eq('subject', 'Mathematics')
    expect(JSON.stringify(await history())).toBe(before)
  })
})

describe('save_long_view with subjects', () => {
  const FRACTIONS = { key: 'struggle:fractions', title: 'Fractions stay hard when the bottom numbers differ', statement: 'Marks in fractions stayed low from Grade 5 Term 3 to Grade 6 Term 2.' }
  const READING = { key: 'struggle:reading', title: 'Reading marks stay low', statement: 'In English, marks in reading stayed low from Grade 6 Term 3 to Grade 7 Term 1.' }

  test('a pattern is saved for the subject it names, with that subject\'s evidence only', async () => {
    await reset()
    const out = await save([{ ...READING, subject: 'English' }])
    expect(out.dropped).toEqual([])
    expect(out.patterns).toEqual([{ id: expect.any(String), key: 'struggle:reading', subject: 'English', status: 'draft' }])
    const [row] = await rows()
    expect(row).toMatchObject({ subject: 'English', family: 'reading', kind: 'struggle', status: 'draft' })
    const ids = (row!.evidence as { id: string; label: string }[]).map((e) => e.label)
    expect(ids.length).toBeGreaterThan(0)
    expect(ids.every((l) => /English Test 1|Reading quiz/.test(l))).toBe(true)
    // Saved again, the same row is updated (a pattern is learner, kind, subject and strand).
    const again = await save([{ ...READING, subject: 'English', title: 'New words' }])
    expect(again.patterns[0]!.id).toBe(out.patterns[0]!.id)
    expect(await rows()).toHaveLength(1)
  })

  test('a subject left out is taken when only one subject has the key, and a wrong subject is dropped', async () => {
    await reset()
    const out = await save([READING, { ...FRACTIONS, subject: 'English' }, { ...FRACTIONS, subject: 'maths' }])
    expect(out.patterns.map((p) => [p.subject, p.key])).toEqual([
      ['English', 'struggle:reading'],
      ['Mathematics', 'struggle:fractions'],
    ])
    expect(out.dropped).toEqual([{ key: 'struggle:fractions', subject: 'English', reason: 'no pattern in the records' }])
  })

  test('the same strand in two subjects: a pattern with no subject is dropped and the reason says to name it', async () => {
    await reset()
    // Reading is also a struggle in Natural Sciences (records only).
    await db.from('learner_records').insert(lowQuizzes('Natural Sciences', 'reading', 'Science reading', 'Reading about energy'))
    try {
      const h = await history()
      expect(h.candidates.filter((c) => c.key === 'struggle:reading').map((c) => c.subject)).toEqual(['English', 'Natural Sciences'])
      const out = await save([READING])
      expect(out.saved).toBe(0)
      expect(out.dropped).toEqual([{ key: 'struggle:reading', reason: 'the key is in more than one subject: name the subject' }])
    } finally {
      await db.from('learner_records').delete().eq('child_id', d.amina).eq('subject', 'Natural Sciences')
    }
  })

  test('the same strand name in two subjects gives two pattern rows (needs migration 0021)', async (t) => {
    if (await oldKeyStillThere()) t.skip('migration 0021 is not applied: the database still has the old key (learner, kind, strand), so two subjects cannot hold the same strand name yet')
    await reset()
    await db.from('learner_records').insert(lowQuizzes('Natural Sciences', 'reading', 'Science reading', 'Reading about energy'))
    try {
      const out = await save([
        { ...READING, subject: 'English' },
        { ...READING, subject: 'Natural Sciences', title: 'Science reading marks stay low', statement: 'In Natural Sciences, marks in reading stayed low for three terms.' },
      ])
      expect(out.saved).toBe(2)
      expect((await rows()).map((r) => [r.subject, r.family])).toEqual([
        ['English', 'reading'],
        ['Natural Sciences', 'reading'],
      ])
    } finally {
      await db.from('learner_records').delete().eq('child_id', d.amina).eq('subject', 'Natural Sciences')
    }
  })

  test('while the old key is still in the database the second subject is dropped with a plain reason, not an error (until 0021)', async (t) => {
    if (!(await oldKeyStillThere())) t.skip('migration 0021 is applied: nothing to drop')
    await reset()
    await db.from('learner_records').insert(lowQuizzes('Natural Sciences', 'reading', 'Science reading', 'Reading about energy'))
    try {
      const out = await save([
        { ...READING, subject: 'English' },
        { ...READING, subject: 'Natural Sciences', title: 'Science reading marks stay low', statement: 'In Natural Sciences, marks in reading stayed low for three terms.' },
      ])
      expect(out.saved).toBe(1)
      expect(out.dropped).toEqual([{ key: 'struggle:reading', subject: 'Natural Sciences', reason: expect.stringContaining('0021') }])
    } finally {
      await db.from('learner_records').delete().eq('child_id', d.amina).eq('subject', 'Natural Sciences')
    }
  })

  test('a name from the data never drops a pattern, and a drop is on the tool log with its reason', async () => {
    await reset()
    // A quiz called "Track and field reading" and a topic called "The stream and the river": both hold a banned word as a name.
    await db.from('learner_records').insert([
      { school_id: d.schoolId, child_id: d.amina, source: 'quiz', grade: 7, year: year - 1, term: 2, happened_on: `${year - 1}-05-10`, logged_at: `${year - 1}-05-12T09:00:00Z`, teacher_name: 'Mrs Zulu', title: 'Track and field reading', family: 'reading', topic_name: 'The stream and the river', marks: 8, out_of: 20, subject: 'English' },
    ])
    const kept = await save([
      { ...READING, subject: 'English', title: 'Track and field reading stays low', statement: 'In English, marks in The stream and the river stayed low from Grade 7 Term 2 to Grade 7 Term 1.' },
    ])
    expect(kept.dropped).toEqual([])
    expect(kept.saved).toBe(1)

    // The same words without the name are still caught, and the drop is on the log.
    await reset()
    const dropped = await save([{ ...READING, subject: 'English', title: 'Reading is on track', statement: 'She stays on the stream of work.' }])
    expect(dropped.saved).toBe(0)
    expect(dropped.dropped).toEqual([{ key: 'struggle:reading', subject: 'English', reason: 'uses the words "track", "stream"' }])
    const logged = (await db.from('tool_calls').select('tool, output, started_at').eq('school_id', d.schoolId).eq('tool', 'save_long_view').order('started_at', { ascending: false }).limit(1)).data![0]!
    expect((logged.output as { dropped: { reason: string }[] }).dropped).toEqual([{ key: 'struggle:reading', subject: 'English', reason: 'uses the words "track", "stream"' }])
  })

  test('the teacher of the pattern\'s subject is asked to look, and a subject with no class goes to the oldest class', async () => {
    await reset()
    // Mathematics drafts (2) go to Ms Banda, English (1) to the English teacher, Natural Sciences (no class) to Ms Banda, whose class is the oldest.
    await db.from('learner_records').insert(lowQuizzes('Natural Sciences', 'life_living', 'Life quiz', 'Plants'))
    try {
      await save([
        { ...FRACTIONS, subject: 'Mathematics' },
        { key: 'strength:shapes', subject: 'Mathematics', title: 'Shapes come easily', statement: 'Marks in shapes stayed high for six terms.' },
        { ...READING, subject: 'English' },
        { key: 'struggle:life_living', subject: 'Natural Sciences', title: 'Marks in life and living stay low', statement: 'In Natural Sciences, marks in life and living stayed low for three terms.' },
      ])
      const items = (await db.from('needs_you_items').select('owner_id, detail, status').eq('child_id', d.amina).eq('kind', 'review_long_view').order('owner_id')).data!
      const byOwner = new Map(items.map((i) => [i.owner_id, i]))
      expect(items).toHaveLength(2)
      expect(byOwner.get(d.teacherId)).toMatchObject({ detail: '3 patterns to check before anything is shared.', status: 'open' })
      expect(byOwner.get(d.otherTeacherId)).toMatchObject({ detail: '1 pattern to check before anything is shared.', status: 'open' })
      // Saved again: no second item for anyone.
      await save([{ ...READING, subject: 'English' }])
      expect((await db.from('needs_you_items').select('id').eq('child_id', d.amina).eq('kind', 'review_long_view')).data).toHaveLength(2)
    } finally {
      await db.from('learner_records').delete().eq('child_id', d.amina).eq('subject', 'Natural Sciences')
    }
  })
})
