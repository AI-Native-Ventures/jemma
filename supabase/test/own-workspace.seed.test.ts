import { describe, expect, test } from 'vitest'
import { capsMapOf } from '../../packages/profiling/src/curriculum/caps-map'
import { LessonSchema } from '../../packages/profiling/src/schemas'
import {
  OWN_PRELOADED_GRADES,
  ownClassRows,
  ownItemRows,
  ownLessonRow,
  ownMaps,
  ownPractice,
  ownSchoolRow,
  ownSessionRow,
  ownTwinRow,
} from '../seed/fixtures/own-workspace'

// Amina's own workspace in every Hillview demo copy: what the seed would write, with no database. The rows are checked here; CI proves that the
// seed writes them and that nothing of the school moved (the demo path and the feature specs run on the copy).

const NOW = new Date('2026-11-14T10:00:00.000Z')
const gradeSix = capsMapOf(6)!

describe('the personal school, the twin and the classes', () => {
  test('the school is private, named for Amina, in her school\'s country, and tied to the sandbox so the clean-up takes it', () => {
    expect(ownSchoolRow({ country: 'ZA', region: 'Gauteng', grades: 'Grade R to 7' }, 'box-1')).toEqual({
      name: "Amina's own", country: 'ZA', region: 'Gauteng', grades: 'Grade R to 7', kind: 'private', sandbox_id: 'box-1',
    })
  })

  test('the twin has Amina\'s name, grade, login and mum, and points at her school child', () => {
    expect(ownTwinRow({ schoolId: 'own-school', aminaId: 'amina', learnerId: 'u-amina', grade: 6, parent: { firstName: 'Thandi', relation: 'mum' } })).toEqual({
      school_id: 'own-school', first_name: 'Amina', last_name: null, grade: 6, user_id: 'u-amina', private_of: 'amina', parent_first_name: 'Thandi', parent_relation: 'mum',
    })
  })

  test('there is a Mathematics class for Grade 6 and for Grade 7, owned by Amina\'s login, each with its own class code', () => {
    let n = 0
    const rows = ownClassRows({ schoolId: 'own-school', learnerId: 'u-amina', year: 2026, code: () => `CODE0${++n}` })
    expect(OWN_PRELOADED_GRADES).toEqual([6, 7])
    expect(rows).toEqual([
      { school_id: 'own-school', teacher_id: 'u-amina', name: 'Grade 6 (my own)', grade: 6, year: 2026, subject: 'Mathematics', join_code: 'CODE01' },
      { school_id: 'own-school', teacher_id: 'u-amina', name: 'Grade 7 (my own)', grade: 7, year: 2026, subject: 'Mathematics', join_code: 'CODE02' },
    ])
  })

  test('the maps are the approved CAPS maps of Grade 6 and Grade 7, the ones a learner gets by adding the grade', () => {
    const maps = ownMaps()
    expect(maps.map((m) => m.grade)).toEqual([6, 7])
    for (const m of maps) {
      expect(m).toEqual(capsMapOf(m.grade))
      expect(m.rows.length).toBeGreaterThan(10)
      expect(m.log).toBe(`Loaded the CAPS map for Grade ${m.grade}: ${m.rows.length} topics`)
    }
  })
})

describe('the two finished practice sessions in Grade 6', () => {
  const practice = ownPractice()

  test('one is on a fractions topic and one on a whole numbers topic of the Grade 6 map', () => {
    expect(practice).toHaveLength(2)
    expect(practice.map((p) => p.family)).toEqual(['fractions', 'whole_numbers'])
    for (const p of practice) {
      const topic = gradeSix.rows.find((r) => r.name === p.topicName)
      expect(topic, p.topicName).toBeDefined()
      expect(topic!.family).toBe(p.family)
    }
  })

  test('each has a lesson that is a whole lesson, with its own questions: 15 questions, 5 at each level, 2 warm-up questions', () => {
    for (const p of practice) {
      expect(LessonSchema.safeParse(p.lesson).success, p.topicName).toBe(true)
      expect(p.lesson.questions).toHaveLength(15)
      expect(p.lesson.warmup).toHaveLength(2)
      expect(p.format).toBe(p.lesson.format)
    }
  })

  test('each has 5 Try answers, some right and some wrong, from the questions of its own lesson, and its warm-up answers', () => {
    for (const p of practice) {
      expect(p.tries).toHaveLength(5)
      const right = p.tries.filter((t) => t.correct).length
      expect(right, p.topicName).toBeGreaterThan(0)
      expect(right, p.topicName).toBeLessThan(5)
      for (const t of p.tries) {
        expect(p.lesson.questions.some((q) => q.prompt === t.q.prompt), `${p.topicName}: ${t.q.prompt}`).toBe(true)
        // A right answer is the answer of the question, a wrong one is not.
        expect(t.answer === t.q.answer, t.q.prompt).toBe(t.correct)
        expect(t.seconds).toBeGreaterThan(0)
      }
      expect(p.warmup).toHaveLength(2)
    }
  })

  test('the lesson row, the session row and the items are Amina\'s twin\'s, on the topic, done and counted', () => {
    const p = practice[1]!
    const lesson = ownLessonRow(p, { childId: 'twin', topicId: 'topic-1' })
    expect(lesson).toMatchObject({ child_id: 'twin', topic_id: 'topic-1', topic_name: p.topicName, format: 'reading', content: p.lesson })

    const session = ownSessionRow(p, { childId: 'twin', lessonId: 'lesson-1', topicId: 'topic-1' }, NOW)
    expect(session).toMatchObject({
      child_id: 'twin', lesson_id: 'lesson-1', status: 'done', right: 3, minutes: 9, topic_id: 'topic-1', topic_name: p.topicName, format: 'reading', question_count: 5,
    })
    expect(session.finished_at).toBe('2026-11-13T10:00:00.000Z')
    expect(session.planned_for).toBe('2026-11-13')
    expect(Date.parse(session.created_at)).toBeLessThan(Date.parse(session.finished_at))

    const items = ownItemRows(p, 'session-1')
    expect(items.filter((i) => i.phase === 'warmup')).toHaveLength(2)
    const tries = items.filter((i) => i.phase === 'try')
    expect(tries).toHaveLength(5)
    expect(tries.map((i) => i.position)).toEqual([1, 2, 3, 4, 5])
    expect(tries.filter((i) => i.correct)).toHaveLength(session.right)
    expect(items.every((i) => i.session_id === 'session-1')).toBe(true)
  })

  test('the two sessions were finished on different days, in the past', () => {
    const days = practice.map((p) => ownSessionRow(p, { childId: 'twin', lessonId: 'l', topicId: 't' }, NOW).finished_at)
    expect(new Set(days).size).toBe(2)
    for (const d of days) expect(Date.parse(d)).toBeLessThan(NOW.getTime())
  })

  test('the counts My maths would show: Try answers only, 3 of 5 in each', () => {
    for (const p of practice) {
      const items = ownItemRows(p, 's').filter((i) => i.phase === 'try')
      expect({ right: items.filter((i) => i.correct).length, asked: items.length }).toEqual({ right: 3, asked: 5 })
    }
  })
})
