// "Add made-up learners": six learners with up to three years of history in the class's subject, for a class in a demo sandbox school.
// Server only: needs the service role client. The server action that calls it checks who is asking; this checks the school.
import type { JemmaDb } from '../../packages/profiling/src/db'
import { lastSchoolDays } from './fixtures/cast'
import { awayOnDay } from './fixtures/hillview'
import { familiesFor, makeLearners } from './generator'

export const MADE_UP_COUNT = 6

export type MadeUpResult = { ok: true; childIds: string[]; names: string[] } | { ok: false; error: string }

/** The made-up teachers of the years before. The last name of a made-up learner's records is the class teacher's own. */
const EARLIER_TEACHERS = ['Mr Dube', 'Mrs Naidoo']

/** True when the class belongs to a demo sandbox school: its school has a sandbox row. Never true for a real school. */
export async function isSandboxClass(admin: JemmaDb, classId: string): Promise<boolean> {
  const { data: cls } = await admin.from('classes').select('school_id').eq('id', classId).maybeSingle()
  if (!cls) return false
  const { data: school } = await admin.from('schools').select('sandbox_id').eq('id', cls.school_id).maybeSingle()
  if (!school?.sandbox_id) return false
  const { data: box } = await admin.from('demo_sandboxes').select('id').eq('id', school.sandbox_id).eq('school_id', cls.school_id).maybeSingle()
  return Boolean(box)
}

/** The strand families the class's approved topic map uses, in map order. Empty when there is no approved map. */
async function mapFamilies(admin: JemmaDb, classId: string): Promise<string[]> {
  const { data: map } = await admin.from('curriculum_maps').select('id').eq('class_id', classId).eq('status', 'approved').order('approved_at', { ascending: false }).limit(1).maybeSingle()
  if (!map) return []
  const { data: topics } = await admin.from('topics').select('family, term, position').eq('map_id', map.id).order('term').order('position')
  return [...new Set((topics ?? []).map((t) => t.family).filter((f): f is string => Boolean(f)))]
}

/**
 * Adds six made-up learners to the class: children of the school, enrolled in the class, with attendance for the last ten school days
 * and records back up to two years before the class year, in the class's subject and two others. The strand families are the approved
 * map's, else the subject's usual ones, else the ones the jobs suggest, else three neutral ones. Works for any grade from 1 to 12.
 * Refuses a class that is not in a demo sandbox school, so a real school can never get made-up children.
 */
export async function addMadeUpLearners(admin: JemmaDb, input: { classId: string; now?: Date }): Promise<MadeUpResult> {
  const now = input.now ?? new Date()
  if (!(await isSandboxClass(admin, input.classId))) return { ok: false, error: 'Made-up learners can only be added in the demo school.' }
  const { data: cls } = await admin.from('classes').select('school_id, teacher_id, name, grade, year, subject').eq('id', input.classId).maybeSingle()
  if (!cls) return { ok: false, error: 'That class was not found.' }
  if (cls.grade < 1 || cls.grade > 12) return { ok: false, error: 'Made-up learners are made for Grades 1 to 12.' }

  const [teacher, inClass, atSchool, fromMap] = await Promise.all([
    admin.from('profiles').select('display_name').eq('user_id', cls.teacher_id).maybeSingle(),
    admin.from('enrolments').select('child_id, children(first_name)').eq('class_id', input.classId),
    admin.from('children').select('first_name').eq('school_id', cls.school_id),
    mapFamilies(admin, input.classId),
  ])
  const classNames = (inClass.data ?? []).flatMap((e) => (e.children ? [e.children.first_name] : []))
  const schoolNames = (atSchool.data ?? []).map((c) => c.first_name)
  const common = {
    subject: cls.subject, grade: cls.grade, year: cls.year, count: MADE_UP_COUNT,
    // The number already in the class changes the seed, so a second tap makes six other learners.
    seed: `made-up|${input.classId}|${classNames.length}`, families: familiesFor(cls.subject, fromMap),
    teacherNames: [...EARLIER_TEACHERS, teacher.data?.display_name ?? 'Teacher'],
  }
  let batch
  try {
    // First names not used anywhere at the school; when the list runs low, at least none already in this class.
    batch = makeLearners({ ...common, avoidNames: schoolNames })
  } catch {
    try {
      batch = makeLearners({ ...common, avoidNames: classNames })
    } catch {
      return { ok: false, error: 'There are no more made-up names to use in this class.' }
    }
  }

  const stamp = now.getTime()
  const kids = await admin
    .from('children')
    .insert(batch.learners.map((l, i) => ({ school_id: cls.school_id, first_name: l.firstName, grade: cls.grade, created_at: new Date(stamp - (batch.learners.length - i) * 1000).toISOString() })))
    .select('id, first_name')
  if (kids.error || !kids.data) return { ok: false, error: 'Could not add the learners. Try again.' }
  const idOf = new Map(kids.data.map((k) => [k.first_name, k.id]))
  const childIds = batch.learners.map((l) => idOf.get(l.firstName)!)

  const days = lastSchoolDays(now)
  const records = batch.learners.flatMap((l) => l.records.map((r) => ({ ...r, school_id: cls.school_id, child_id: idOf.get(l.firstName)! })))
  const writes = await Promise.all([
    admin.from('enrolments').insert(childIds.map((child_id) => ({ class_id: input.classId, child_id }))),
    admin.from('attendance').insert(batch.learners.flatMap((l) => days.map((day, i) => ({ child_id: idOf.get(l.firstName)!, day, status: awayOnDay(l.firstName, i) ? ('away' as const) : ('here' as const) })))),
    ...Array.from({ length: Math.ceil(records.length / 500) }, (_, i) => admin.from('learner_records').insert(records.slice(i * 500, (i + 1) * 500))),
  ])
  const failed = writes.find((w) => w.error)
  if (failed) {
    // Take the learners back out: nothing half made is left in the class.
    await admin.from('children').delete().in('id', childIds)
    return { ok: false, error: 'Could not add the learners. Try again.' }
  }
  return { ok: true, childIds, names: batch.learners.map((l) => l.firstName) }
}
