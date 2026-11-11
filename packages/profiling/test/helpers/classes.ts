import type { JemmaDb } from '../../src/db'
import { ok } from '../../src/tools/context'
import type { Sandbox } from './sandbox'

export type ExtraClass = {
  classId: string
  mapId: string
  topicIds: string[]
  testId: string
  /** A marked paper of Amina on this class's test, with one wrong answer on the first topic. */
  paperId: string
  resultId: string
  teacherId: string
}

/** A second teacher in the sandbox's school. Delete the user with `db.auth.admin.deleteUser(id)` when the test ends. */
export async function addTeacher(db: JemmaDb, s: Sandbox, tag: string): Promise<string> {
  const created = await db.auth.admin.createUser({ email: `${tag}-teacher2@example.test`, password: `${tag}-Passw0rd!`, email_confirm: true })
  if (created.error) throw created.error
  const id = created.data.user.id
  await ok(db.from('profiles').insert({ user_id: id, role: 'teacher', display_name: 'Mr Second', school_id: s.schoolId }).select())
  return id
}

/**
 * A second class for the sandbox's school, with Amina enrolled in it: an approved map with `topics` (each with one known
 * mistake), a test with a one-question key, and a marked paper of Amina with one wrong answer on the first topic.
 * Made after the sandbox class, so it is the newer of the two.
 */
export async function addClass(
  db: JemmaDb,
  s: Sandbox,
  o: { tag: string; name: string; subject: string; grade: number; topics: string[]; family?: string; teacherId?: string },
): Promise<ExtraClass> {
  const teacherId = o.teacherId ?? s.teacherId
  const [cls] = await ok(
    db.from('classes').insert({ school_id: s.schoolId, teacher_id: teacherId, name: o.name, grade: o.grade, year: 2026, subject: o.subject, join_code: o.tag.slice(-12) }).select('id'),
  )
  const classId = cls!.id
  await ok(db.from('enrolments').insert({ class_id: classId, child_id: s.aminaId }).select())
  const [map] = await ok(db.from('curriculum_maps').insert({ class_id: classId, status: 'approved', approved_at: new Date().toISOString() }).select('id'))
  const mapId = map!.id
  const topics = await ok(
    db
      .from('topics')
      .insert(o.topics.map((name, i) => ({ map_id: mapId, term: 1, position: i + 1, name, family: o.family ?? 'other', misconceptions: [`Mistake in ${name}`] })))
      .select('id, name, position'),
  )
  topics.sort((a, b) => a.position - b.position)
  const topicIds = topics.map((t) => t.id)
  const [test] = await ok(
    db.from('tests').insert({ class_id: classId, title: `${o.name} test`, written_on: '2026-10-05', out_of: 1, topic_ids: [topicIds[0]!] }).select('id'),
  )
  const testId = test!.id
  await ok(
    db
      .from('answer_keys')
      .insert({ test_id: testId, status: 'approved', items: [{ n: 1, prompt: 'Question one', answer: '4', marks: 1, topicName: o.topics[0]!, confidence: 1 }] })
      .select(),
  )
  const [paper] = await ok(
    db.from('papers').insert({ test_id: testId, child_id: s.aminaId, owner: 'teacher', kind: 'test', status: 'marked', name_read: 'Amina', total: 0 }).select('id'),
  )
  const [result] = await ok(
    db
      .from('question_results')
      .insert({
        paper_id: paper!.id, child_id: s.aminaId, n: 1, prompt: 'Question one', answer_read: '5', read_confidence: 0.95, correct: false, mark: 0,
        topic_id: topicIds[0]!, topic_name: o.topics[0]!, misconception: null,
      })
      .select('id'),
  )
  return { classId, mapId, topicIds, testId, paperId: paper!.id, resultId: result!.id, teacherId }
}
