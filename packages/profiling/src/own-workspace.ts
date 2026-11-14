import { capsMapOf, isSouthAfrica, writeApprovedMap } from './curriculum/caps-map'
import type { JemmaDb } from './db'
import { buildMyMaths, type Score } from './logic'
import { maybe, ok } from './tools/context'
import { loadMyMathsInput } from './tools/read/practice-input'
import { capsClassName, isCapsClassName, OWN_GRADES } from './own-class-names'

// A learner's own private workspace ("My own") beside the school one ("My school"). It is a SECOND `children` row for the same learner (the
// "twin": same name, grade and login, `private_of` = the school child), in a personal school of its own (`schools.kind = 'private'`), with one
// private class for each grade the learner added. Every learner feature (the CAPS maps, practice, "My maths", sessions, paper answers) already
// works by child id and school id, so it works on the twin unchanged and stays apart from the school child: its record, gaps, Long view and
// the class reports never see it. Nothing here writes to the school child, its class or its school. Server only: every function takes the
// service client, and checks that the person acting may act for the learner.

export { capsClassName, isCapsClassName, OWN_GRADES }

/** What a learner reads when a grade or a person is refused. A message is plain words. */
export class OwnWorkspaceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OwnWorkspaceError'
  }
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** A class code: 6 letters and numbers, no 0, 1, I or O (the same alphabet as the code of a school class). */
function newJoinCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

const isGrade = (grade: unknown): grade is number => typeof grade === 'number' && Number.isInteger(grade) && grade >= OWN_GRADES.from && grade <= OWN_GRADES.to

const codeOf = (e: unknown): string | undefined => (e && typeof e === 'object' ? (e as { code?: string }).code : undefined)

type SchoolChild = { id: string; school_id: string; first_name: string; last_name: string | null; grade: number; user_id: string | null; private_of: string | null; parent_first_name: string | null; parent_relation: string | null }
const CHILD_COLUMNS = 'id, school_id, first_name, last_name, grade, user_id, private_of, parent_first_name, parent_relation'

/** The twin of a school child, or null when the learner has not opened My own. */
export async function twinOfChild(db: JemmaDb, childId: string): Promise<{ id: string } | null> {
  const twin = await maybe(db.from('children').select('id').eq('private_of', childId).maybeSingle())
  return twin ? { id: twin.id } : null
}

/** The learner's own login, or an approved parent of the learner: the two people who may act for a learner. Anyone else is refused. */
async function mustMayActFor(db: JemmaDb, child: { id: string; user_id: string | null }, actorUserId: string): Promise<void> {
  if (child.user_id !== null && child.user_id === actorUserId) return
  const links = await ok(db.from('parent_links').select('id').eq('child_id', child.id).eq('parent_id', actorUserId).eq('status', 'approved').limit(1))
  if (links.length === 0) throw new OwnWorkspaceError('You cannot open My own for this learner.')
}

/**
 * The learner's private workspace: the twin of the school child, made on the first call and the same twin on every later call. The twin has the
 * school child's first name, last name, grade, login and the parent's name (the hand-back screen speaks of the parent), and it lives in a
 * personal school of its own (`kind 'private'`, named "{first name}'s own", with the school's country; its sandbox, when the school is a demo's,
 * so the demo clean-up takes it too). Nothing else is made: the classes come with `addOwnGrade`. Only the learner's own login or an approved
 * parent may ask. Answers the twin's id.
 */
export async function ensureOwnWorkspace(db: JemmaDb, childId: string, actorUserId: string): Promise<string> {
  const child = (await maybe(db.from('children').select(CHILD_COLUMNS).eq('id', childId).maybeSingle())) as SchoolChild | null
  if (!child) throw new OwnWorkspaceError('That learner was not found.')
  if (child.private_of) throw new OwnWorkspaceError('My own has no My own of its own.')
  await mustMayActFor(db, child, actorUserId)
  const found = await twinOfChild(db, childId)
  if (found) return found.id

  const home = await ok(db.from('schools').select('country, region, grades, sandbox_id').eq('id', child.school_id).single())
  const school = await ok(
    db
      .from('schools')
      .insert({ name: `${child.first_name}'s own`, country: home.country, region: home.region, grades: home.grades, sandbox_id: home.sandbox_id, kind: 'private' })
      .select('id')
      .single(),
  )
  const made = await db
    .from('children')
    .insert({
      school_id: school.id,
      first_name: child.first_name,
      last_name: child.last_name,
      grade: child.grade,
      user_id: child.user_id,
      private_of: child.id,
      parent_first_name: child.parent_first_name,
      parent_relation: child.parent_relation,
    })
    .select('id')
    .single()
  if (made.error || !made.data) {
    // Two taps at once: the other one made the twin first (one twin for each learner). Take theirs and drop the school made for this one.
    await db.from('schools').delete().eq('id', school.id)
    const winner = codeOf(made.error) === '23505' ? await twinOfChild(db, childId) : null
    if (winner) return winner.id
    throw new Error(`could not open My own: ${made.error?.message ?? 'no row'}`)
  }
  return made.data.id
}

export type AddedGrade = { classId: string; grade: number; /** False when the grade was already there: nothing was added. */ created: boolean; /** Topics of the approved map, 0 when the grade has no map. */ topics: number }

const topicCountOf = async (db: JemmaDb, classId: string): Promise<number> => {
  const maps = await ok(db.from('curriculum_maps').select('id').eq('class_id', classId).eq('status', 'approved'))
  if (maps.length === 0) return 0
  return (await ok(db.from('topics').select('id').in('map_id', maps.map((m) => m.id)))).length
}

/**
 * Adds a grade (1 to 12) to a learner's own workspace: the private Mathematics CAPS class "Grade {N} (my own)" (`capsClassName`) in the personal school, owned by the
 * person acting (the learner, or the parent who acts for them), with the twin enrolled. In a school in South Africa the class gets the CAPS map of
 * that grade, approved, with its topics, written by the same code the demo seed uses for 5A, 7A and 4A, and the line "Loaded the CAPS map for
 * Grade {N}: {count} topics". Anywhere else the class has no map yet. Adding a grade that is already there adds nothing (and finishes a map that
 * an earlier call did not write). Grade 0, grade 13 and a grade that is not a whole number are refused.
 */
export async function addOwnGrade(db: JemmaDb, twinId: string, grade: number, actorUserId: string, now: Date = new Date()): Promise<AddedGrade> {
  if (!isGrade(grade)) throw new OwnWorkspaceError(`Pick a grade from ${OWN_GRADES.from} to ${OWN_GRADES.to}.`)
  const twin = (await maybe(db.from('children').select(CHILD_COLUMNS).eq('id', twinId).maybeSingle())) as SchoolChild | null
  if (!twin?.private_of) throw new OwnWorkspaceError('That is not a private workspace.')
  const home = await maybe(db.from('children').select('id, user_id').eq('id', twin.private_of).maybeSingle())
  if (!home) throw new OwnWorkspaceError('That learner was not found.')
  await mustMayActFor(db, home, actorUserId)
  const school = await ok(db.from('schools').select('country, kind').eq('id', twin.school_id).single())
  if (school.kind !== 'private') throw new OwnWorkspaceError('That is not a private workspace.')

  // Only the CAPS class of the grade counts: a learner's own curriculum of the same grade (P97) never blocks it and never gets its map.
  const sameGrade = () => ok(db.from('classes').select('id').eq('school_id', twin.school_id).eq('grade', grade).eq('name', capsClassName(grade)).order('created_at').order('id'))
  let classId: string
  let created = false
  const existing = (await sameGrade())[0]
  if (existing) classId = existing.id
  else {
    let code = newJoinCode()
    let made: string | null = null
    for (let attempt = 0; attempt < 5 && !made; attempt++) {
      const row = await db
        .from('classes')
        .insert({ school_id: twin.school_id, teacher_id: actorUserId, name: capsClassName(grade), grade, year: now.getUTCFullYear(), subject: 'Mathematics', join_code: code })
        .select('id')
        .single()
      if (row.data) made = row.data.id
      else if (codeOf(row.error) === '23505') code = newJoinCode()
      else throw new Error(`could not add the grade: ${row.error?.message ?? 'no row'}`)
    }
    if (!made) throw new Error('could not add the grade: no free class code')
    // Two taps at once: the oldest class of the grade stays and the other tap removes its own.
    const keeper = (await sameGrade())[0]!
    if (keeper.id !== made) {
      await db.from('classes').delete().eq('id', made)
      classId = keeper.id
    } else {
      classId = made
      created = true
    }
  }

  const enrolled = await ok(db.from('enrolments').select('class_id').eq('class_id', classId).eq('child_id', twinId))
  if (enrolled.length === 0) await ok(db.from('enrolments').insert({ class_id: classId, child_id: twinId }).select('class_id'))

  const caps = isSouthAfrica(school.country) ? capsMapOf(grade) : null
  if (caps) {
    const hasMap = (await ok(db.from('curriculum_maps').select('id').eq('class_id', classId).eq('status', 'approved').limit(1))).length > 0
    if (!hasMap) {
      await writeApprovedMap(db, { classId, stored: caps.stored, approvedAt: now.toISOString(), rows: caps.rows })
      await ok(db.from('activity_log').insert({ school_id: twin.school_id, class_id: classId, at: now.toISOString(), text: caps.log, tool: 'use_caps_map' }).select('id'))
    }
  }
  return { classId, grade, created, topics: await topicCountOf(db, classId) }
}

const sum = (scores: Score[]): Score => ({ right: scores.reduce((n, s) => n + s.right, 0), asked: scores.reduce((n, s) => n + s.asked, 0) })

/** One class of a private workspace. `caps` is true for the CAPS class of a grade (`capsClassName`), false for a learner's own curriculum (P97). */
export type OwnClass = { id: string; name: string; grade: number; caps: boolean }

/**
 * The classes of a private workspace, lowest grade first; of one grade the CAPS class comes first, then the learner's own curricula in the order
 * they were made. A cheap read (no counts): nothing but the classes.
 */
export async function listOwnClasses(db: JemmaDb, twinId: string): Promise<OwnClass[]> {
  const enrolments = await ok(db.from('enrolments').select('class_id').eq('child_id', twinId))
  const ids = [...new Set(enrolments.map((e) => e.class_id))]
  if (ids.length === 0) return []
  const classes = (await ok(db.from('classes').select('id, name, grade, created_at').in('id', ids))).map((c) => ({ ...c, caps: isCapsClassName(c.name, c.grade) }))
  return classes
    .sort((a, b) => a.grade - b.grade || Number(b.caps) - Number(a.caps) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .map((c) => ({ id: c.id, name: c.name, grade: c.grade, caps: c.caps }))
}

/**
 * The class "My maths" shows first in a private workspace: the CAPS class of the learner's own grade, else a class of that grade (an own
 * curriculum), else the lowest grade. Null when the workspace has no class yet.
 */
export async function defaultOwnClass(db: JemmaDb, twinId: string): Promise<string | null> {
  const [classes, twin] = await Promise.all([listOwnClasses(db, twinId), maybe(db.from('children').select('grade').eq('id', twinId).maybeSingle())])
  // The list puts the CAPS class of a grade before an own class of it, so the first of the learner's grade is the CAPS one when there is one.
  return (classes.find((c) => c.grade === twin?.grade) ?? classes[0])?.id ?? null
}

export type OwnGrade = { classId: string; grade: number; name: string; /** True for the CAPS class of the grade, false for the learner's own curriculum. */ caps: boolean; /** Topics on the approved map of this grade. */ topics: number; /** The learner's own count in this grade. */ score: Score }

/** The grades a private workspace has: for each, the class, the topics of its map and the learner's own count (from `buildMyMaths`, the same rule as "My maths"). */
export async function getOwnOverview(db: JemmaDb, twinId: string, now: Date = new Date()): Promise<OwnGrade[]> {
  const classes = await listOwnClasses(db, twinId)
  return Promise.all(
    classes.map(async (c) => {
      const input = await loadMyMathsInput(db, twinId, now, { classId: c.id })
      const topics = buildMyMaths(input).strands.flatMap((s) => s.topics)
      return { classId: c.id, grade: c.grade, name: c.name, caps: c.caps, topics: input.topics.length, score: sum(topics.map((t) => t.score)) }
    }),
  )
}

export type OwnPractised = { topicId: string; name: string; term: number; score: Score }
export type OwnGap = { topicName: string; stage: 'new' | 'practising' | 'fixed'; /** The grade whose map has the topic, null when no grade of the workspace has it. */ grade: number | null }
export type OwnSummary = {
  firstName: string
  grades: (OwnGrade & { practised: OwnPractised[] })[]
  gaps: { open: OwnGap[]; fixed: OwnGap[] }
  /** The last 10 finished sessions, newest first. `right` of `asked` is the Try answers only. */
  sessions: { date: string; topic: string; right: number; asked: number }[]
}

/**
 * What a teacher may look at of a learner's own workspace, read only: the grades, in each the topics practised with the learner's own counts,
 * the open and the fixed private gaps and the last 10 finished sessions. Only for the teacher of `classId`, and only for a learner enrolled in
 * it (the school child, not the twin). It reads by the twin's id and never writes. Null when the caller does not teach the class, the child is
 * not in it, or the learner has not opened My own.
 */
export async function getOwnWorkspaceForTeacher(
  db: JemmaDb,
  input: { teacherId: string; classId: string; childId: string; now?: Date },
): Promise<OwnSummary | null> {
  const now = input.now ?? new Date()
  const cls = await maybe(db.from('classes').select('id, teacher_id').eq('id', input.classId).maybeSingle())
  if (!cls || cls.teacher_id !== input.teacherId) return null
  const enrolled = await ok(db.from('enrolments').select('class_id').eq('class_id', input.classId).eq('child_id', input.childId))
  if (enrolled.length === 0) return null
  const child = await maybe(db.from('children').select('id, first_name, private_of').eq('id', input.childId).maybeSingle())
  if (!child || child.private_of) return null
  const twin = await twinOfChild(db, child.id)
  if (!twin) return null

  const classes = await listOwnClasses(db, twin.id)
  const perGrade = await Promise.all(
    classes.map(async (c) => {
      const mine = await loadMyMathsInput(db, twin.id, now, { classId: c.id })
      const topics = buildMyMaths(mine).strands.flatMap((s) => s.topics)
      const grade: OwnSummary['grades'][number] = {
        classId: c.id,
        grade: c.grade,
        name: c.name,
        caps: c.caps,
        topics: mine.topics.length,
        score: sum(topics.map((t) => t.score)),
        practised: topics.filter((t) => t.score.asked > 0).map((t) => ({ topicId: t.id, name: t.name, term: t.term, score: t.score })),
      }
      return { grade, topicIds: new Set(mine.topics.map((t) => t.id)), topicNames: new Set(mine.topics.map((t) => t.name.trim().toLowerCase())) }
    }),
  )
  const gradeOfGap = (g: { topic_id: string | null; topic_name: string }): number | null =>
    perGrade.find((p) => (g.topic_id ? p.topicIds.has(g.topic_id) : p.topicNames.has(g.topic_name.trim().toLowerCase())))?.grade.grade ?? null
  const gapRows = await ok(db.from('gaps').select('topic_id, topic_name, stage, created_at').eq('child_id', twin.id))
  const gaps = gapRows.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.topic_name.localeCompare(b.topic_name)).map((g): OwnGap => ({ topicName: g.topic_name, stage: g.stage, grade: gradeOfGap(g) }))

  const done = await ok(db.from('sessions').select('id, topic_name, finished_at').eq('child_id', twin.id).eq('status', 'done').order('finished_at', { ascending: false }).limit(10))
  const items = done.length ? await ok(db.from('session_items').select('session_id, phase, correct').in('session_id', done.map((s) => s.id))) : []
  const sessions = done.map((s) => {
    const tries = items.filter((i) => i.session_id === s.id && i.phase === 'try')
    return { date: s.finished_at ?? '', topic: s.topic_name ?? '', right: tries.filter((i) => i.correct).length, asked: tries.length }
  })

  return {
    firstName: child.first_name,
    grades: perGrade.map((p) => p.grade),
    gaps: { open: gaps.filter((g) => g.stage !== 'fixed'), fixed: gaps.filter((g) => g.stage === 'fixed') },
    sessions,
  }
}
