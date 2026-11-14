import { describe, expect, test } from 'vitest'
import { capsMapOf } from '../../packages/profiling/src/curriculum/caps-map'
import { isIndependent, isOwnRecord } from '../../packages/profiling/src/own-class-names'
import { LessonSchema } from '../../packages/profiling/src/schemas'
import { HILLVIEW_PARENTS, INDEPENDENT_FAMILY, hillviewPeople } from '../seed/fixtures/hillview'
import {
  INDEPENDENT_GRADES,
  independentChildRow,
  independentClassRows,
  independentLinkRow,
  independentMarkedTest,
  independentMaps,
  independentPractice,
  independentSchoolRow,
} from '../seed/fixtures/own-independent'
import { ownGapRow, ownItemRows, ownLessonRow, ownPaperRow, ownResultRows, ownSessionRow, ownTestLogRow } from '../seed/fixtures/own-workspace'

// Zanele M and Kagiso in every Hillview demo copy (P99): what the seed would write, with no database. The rows are checked here; CI proves that the seed
// writes them, that the clean-up removes the personal school, and that the feature spec walks it as Zanele.

const NOW = new Date('2026-11-14T10:00:00.000Z')
const gradeEight = capsMapOf(8)!

describe('the family on the demo page', () => {
  test('Zanele M is one of the parents, and her one child is Kagiso, on his own, in Grade 8', () => {
    expect(HILLVIEW_PARENTS.map((p) => p.displayName)).toContain('Zanele M')
    expect(INDEPENDENT_FAMILY).toEqual({ parent: 'zanele', child: 'Kagiso', grade: 8 })
    const zanele = hillviewPeople(2026).parents.find((p) => p.key === 'zanele')!
    expect(zanele.displayName).toBe('Zanele M')
    expect(zanele.children).toEqual([{ name: 'Kagiso', grade: 8, alone: true }])
  })

  test('no other parent has a child on their own, and Kagiso is no learner of any Hillview class', () => {
    const people = hillviewPeople(2026)
    for (const p of people.parents.filter((x) => x.key !== 'zanele')) for (const c of p.children) expect((c as { alone?: boolean }).alone).toBeUndefined()
    expect(people.learners.flatMap((g) => g.names)).not.toContain('Kagiso')
  })
})

describe('the personal school, Kagiso and Zanele’s link', () => {
  test('the school is private, named for Kagiso, in South Africa, with no region and no grades (as the app writes it), tied to the sandbox', () => {
    expect(independentSchoolRow('ZA', 'box-1')).toEqual({ name: "Kagiso's own", country: 'ZA', region: null, grades: null, kind: 'private', sandbox_id: 'box-1' })
  })

  test('Kagiso is ONE row: his own record, no login yet, no school child behind him, and his mum’s name', () => {
    const row = independentChildRow({ schoolId: 'own-school', parent: { firstName: 'Zanele', relation: 'mum' } })
    expect(row).toEqual({
      school_id: 'own-school', first_name: 'Kagiso', last_name: null, grade: 8, user_id: null, private_of: null, parent_first_name: 'Zanele', parent_relation: 'mum',
    })
    // With his school's kind, the one rule says his record is an own workspace and that he is independent.
    expect(isOwnRecord({ private_of: row.private_of, schools: { kind: 'private' } })).toBe(true)
    expect(isIndependent({ private_of: row.private_of, schools: { kind: 'private' } })).toBe(true)
  })

  test('there is a Mathematics class for Grade 8 and for Grade 9, owned by Zanele (the person who added him), each with its own class code', () => {
    let n = 0
    const rows = independentClassRows({ schoolId: 'own-school', parentId: 'u-zanele', year: 2026, code: () => `CODE0${++n}` })
    expect(INDEPENDENT_GRADES).toEqual([8, 9])
    expect(rows).toEqual([
      { school_id: 'own-school', teacher_id: 'u-zanele', name: 'Grade 8 (my own)', grade: 8, year: 2026, subject: 'Mathematics', join_code: 'CODE01' },
      { school_id: 'own-school', teacher_id: 'u-zanele', name: 'Grade 9 (my own)', grade: 9, year: 2026, subject: 'Mathematics', join_code: 'CODE02' },
    ])
  })

  test('Zanele’s link is approved from the start, for the Grade 8 class, with her own consent as the act of adding him', () => {
    expect(independentLinkRow({ parentId: 'u-zanele', childId: 'kagiso', classId: 'class-8', at: NOW.toISOString() })).toEqual({
      parent_id: 'u-zanele', child_id: 'kagiso', class_id: 'class-8', status: 'approved', consent: { guardian: true, teach: true, improve: false }, decided_at: NOW.toISOString(),
    })
  })

  test('the maps are the approved CAPS maps of Grade 8 and Grade 9, the ones the app writes', () => {
    const maps = independentMaps()
    expect(maps.map((m) => m.grade)).toEqual([8, 9])
    for (const m of maps) {
      expect(m).toEqual(capsMapOf(m.grade))
      expect(m.rows.length).toBeGreaterThan(10)
      expect(m.log).toBe(`Loaded the CAPS map for Grade ${m.grade}: ${m.rows.length} topics`)
    }
  })
})

describe('the two finished practice sessions in Grade 8', () => {
  const practice = independentPractice()

  test('one is on Integers and one on Algebraic expressions, both topics of the Grade 8 map, with the family the map gives them', () => {
    expect(practice.map((p) => p.topicName)).toEqual(['Integers', 'Algebraic expressions'])
    for (const p of practice) {
      const topic = gradeEight.rows.find((r) => r.name === p.topicName)
      expect(topic, p.topicName).toBeDefined()
      expect(topic!.family).toBe(p.family)
    }
  })

  test('each has a whole lesson: 15 questions, 5 at each level, 2 warm-up questions, and a format that matches', () => {
    for (const p of practice) {
      expect(LessonSchema.safeParse(p.lesson).success, p.topicName).toBe(true)
      expect(p.lesson.questions).toHaveLength(15)
      expect(p.lesson.warmup).toHaveLength(2)
      expect(p.format).toBe(p.lesson.format)
    }
  })

  test('each has 5 Try answers, three right and two wrong, from the questions of its own lesson, and its two warm-up answers', () => {
    for (const p of practice) {
      expect(p.tries).toHaveLength(5)
      expect(p.tries.filter((t) => t.correct)).toHaveLength(3)
      const own = new Set(p.lesson.questions.map((q) => q.prompt))
      for (const t of p.tries) {
        expect(own.has(t.q.prompt), t.q.prompt).toBe(true)
        expect(t.correct).toBe(t.answer === t.q.answer)
        expect(t.difficulty).toBe(t.q.difficulty)
      }
      expect(p.warmup).toHaveLength(2)
      expect(p.warmup.every((w) => w.correct && w.answer === w.q.answer)).toBe(true)
    }
  })

  test('the rows are the ones Amina’s own workspace gets: a lesson, a done session and its items for each practice, in Kagiso’s name', () => {
    for (const p of practice) {
      expect(ownLessonRow(p, { childId: 'kagiso', topicId: 't1' })).toMatchObject({ child_id: 'kagiso', topic_id: 't1', topic_name: p.topicName })
      const session = ownSessionRow(p, { childId: 'kagiso', lessonId: 'l1', topicId: 't1' }, NOW)
      expect(session).toMatchObject({ child_id: 'kagiso', status: 'done', topic_name: p.topicName, question_count: 5, right: 3 })
      const items = ownItemRows(p, 's1')
      expect(items.filter((i) => i.phase === 'try')).toHaveLength(5)
      expect(items.filter((i) => i.phase === 'warmup')).toHaveLength(2)
    }
  })

  test('the two sessions finished on different days before the copy was made', () => {
    expect(practice.map((p) => p.finishedDaysAgo)).toEqual([2, 1])
  })
})

describe('the one marked test, already read', () => {
  const test8 = independentMarkedTest()

  test('8 questions on two topics of the Grade 8 map, 6 ticks and 2 crosses, the crosses on the topic of the one open gap', () => {
    expect(test8.results).toHaveLength(8)
    expect(test8.results.filter((r) => r.correct)).toHaveLength(6)
    expect(test8.gapTopicName).toBe('Algebraic equations')
    expect(test8.results.filter((r) => !r.correct).map((r) => r.topicName)).toEqual(['Algebraic equations', 'Algebraic equations'])
    expect([...new Set(test8.results.map((r) => r.topicName))].sort()).toEqual(['Algebraic equations', 'Exponents'])
    for (const r of test8.results) expect(gradeEight.rows.some((t) => t.name === r.topicName), r.topicName).toBe(true)
  })

  test('its topics are not the two the practices count, so the practice counts stay as they are', () => {
    const practised = new Set(independentPractice().map((p) => p.topicName))
    for (const r of test8.results) expect(practised.has(r.topicName), r.topicName).toBe(false)
  })

  test('the paper is Kagiso’s own, no test, marked, with 6 as its total, and the rows are numbered 1 to 8 with the topic id of the Grade 8 map', () => {
    expect(ownPaperRow('kagiso', NOW, test8)).toMatchObject({ test_id: null, child_id: 'kagiso', owner: 'parent', kind: 'test', status: 'marked', total: 6 })
    const rows = ownResultRows(test8, { paperId: 'p1', childId: 'kagiso', topicIdOf: (name) => `id:${name}` })
    expect(rows.map((r) => r.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(rows.map((r) => r.mark)).toEqual([1, 1, 0, 0, 1, 1, 1, 1])
    expect(rows[2]).toMatchObject({ child_id: 'kagiso', topic_id: 'id:Algebraic equations', correct: false })
  })

  test('the gap and the line of "What Jemma did" say what the reader writes for a test', () => {
    expect(ownGapRow({ childId: 'kagiso', topicId: 't', topicName: test8.gapTopicName, wrongResultIds: ['a', 'b'] })).toMatchObject({ child_id: 'kagiso', stage: 'new', topic_name: 'Algebraic equations', evidence: ['a', 'b'] })
    expect(ownTestLogRow({ schoolId: 'own-school', childId: 'kagiso', at: NOW.toISOString(), test: test8 })).toMatchObject({ text: 'Read your marked test: 6 of 8 right', tool: 'save_own_test_results' })
  })
})
