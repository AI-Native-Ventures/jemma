import { builtInMapOf, writeApprovedMap } from './curriculum/caps-map'
import type { JemmaDb } from './db'
import { buildMyMaths, type Score } from './logic'
import { maybe, ok } from './tools/context'
import { loadMyMathsInput } from './tools/read/practice-input'
import { capsClassName, isCapsClassName, isIndependent, isOwnRecord, OWN_GRADES, type OwnRecordChild } from './own-class-names'

// A learner's own private workspace ("My own") beside the school one ("My school"). It is a SECOND `children` row for the same learner (the
// "twin": same name, grade and login, `private_of` = the school child), in a personal school of its own (`schools.kind = 'private'`), with one
// private class for each grade the learner added. Every learner feature (the CAPS maps, practice, "My maths", sessions, paper answers) already
// works by child id and school id, so it works on the twin unchanged and stays apart from the school child: its record, gaps, Long view and
// the class reports never see it. Nothing here writes to the school child, its class or its school. Server only: every function takes the
// service client, and checks that the person acting may act for the learner.

export { capsClassName, isCapsClassName, isIndependent, isOwnRecord, OWN_GRADES }
export type { OwnRecordChild }

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
 *
 * A child whose school does not use Jemma (P99: a child of a personal school, `private_of` null) has no school workspace to keep apart: its own record
 * IS its "My own". It answers the child itself and makes nothing (never a twin of a twin).
 */
export async function ensureOwnWorkspace(db: JemmaDb, childId: string, actorUserId: string): Promise<string> {
  const child = (await maybe(db.from('children').select(CHILD_COLUMNS).eq('id', childId).maybeSingle())) as SchoolChild | null
  if (!child) throw new OwnWorkspaceError('That learner was not found.')
  if (child.private_of) throw new OwnWorkspaceError('My own has no My own of its own.')
  await mustMayActFor(db, child, actorUserId)

  const home = await ok(db.from('schools').select('country, region, grades, sandbox_id, kind').eq('id', child.school_id).single())
  if (home.kind === 'private') return child.id
  const found = await twinOfChild(db, childId)
  if (found) return found.id

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
 * person acting (the learner, or the parent who acts for them), with the learner enrolled. `twinId` is the private twin of a school child, or (P99) a
 * child of a personal school whose school does not use Jemma: its own record is the workspace. In a school in South Africa the class gets the CAPS map of
 * that grade, approved, with its topics, written by the same code the demo seed uses for 5A, 7A and 4A, and the line "Loaded the CAPS map for
 * Grade {N}: {count} topics". Anywhere else the class has no map yet. Adding a grade that is already there adds nothing (and finishes a map that
 * an earlier call did not write). Grade 0, grade 13 and a grade that is not a whole number are refused.
 */
export async function addOwnGrade(db: JemmaDb, twinId: string, grade: number, actorUserId: string, now: Date = new Date()): Promise<AddedGrade> {
  if (!isGrade(grade)) throw new OwnWorkspaceError(`Pick a grade from ${OWN_GRADES.from} to ${OWN_GRADES.to}.`)
  const twin = (await maybe(db.from('children').select(CHILD_COLUMNS).eq('id', twinId).maybeSingle())) as SchoolChild | null
  if (!twin) throw new OwnWorkspaceError('That is not a private workspace.')
  const school = await ok(db.from('schools').select('country, kind').eq('id', twin.school_id).single())
  if (school.kind !== 'private') throw new OwnWorkspaceError('That is not a private workspace.')
  // A twin is acted for through the school child it belongs to; a child of a personal school is acted for directly.
  const home = twin.private_of ? await maybe(db.from('children').select('id, user_id').eq('id', twin.private_of).maybeSingle()) : twin
  if (!home) throw new OwnWorkspaceError('That learner was not found.')
  await mustMayActFor(db, home, actorUserId)
  return addGradeToWorkspace(db, { schoolId: twin.school_id, childId: twinId, country: school.country }, grade, actorUserId, now)
}

/**
 * The work of `addOwnGrade` once the person acting is known to be allowed: finds or makes the CAPS class of `grade` in the personal school, enrols the
 * child, and writes the CAPS map when the school is in South Africa and the class has none. It checks nobody: only `addOwnGrade` (which has checked) and
 * `addChildAlone` (the parent who is adding the child is the person who makes the workspace) call it.
 */
async function addGradeToWorkspace(db: JemmaDb, ws: { schoolId: string; childId: string; country: string }, grade: number, actorUserId: string, now: Date): Promise<AddedGrade> {
  // Only the CAPS class of the grade counts: a learner's own curriculum of the same grade (P97) never blocks it and never gets its map.
  const sameGrade = () => ok(db.from('classes').select('id').eq('school_id', ws.schoolId).eq('grade', grade).eq('name', capsClassName(grade)).order('created_at').order('id'))
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
        .insert({ school_id: ws.schoolId, teacher_id: actorUserId, name: capsClassName(grade), grade, year: now.getUTCFullYear(), subject: 'Mathematics', join_code: code })
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

  const enrolled = await ok(db.from('enrolments').select('class_id').eq('class_id', classId).eq('child_id', ws.childId))
  if (enrolled.length === 0) await ok(db.from('enrolments').insert({ class_id: classId, child_id: ws.childId }).select('class_id'))

  const caps = builtInMapOf(ws.country, grade)
  if (caps) {
    const hasMap = (await ok(db.from('curriculum_maps').select('id').eq('class_id', classId).eq('status', 'approved').limit(1))).length > 0
    if (!hasMap) {
      await writeApprovedMap(db, { classId, stored: caps.stored, approvedAt: now.toISOString(), rows: caps.rows })
      await ok(db.from('activity_log').insert({ school_id: ws.schoolId, class_id: classId, at: now.toISOString(), text: caps.log, tool: 'use_caps_map' }).select('id'))
    }
  }
  return { classId, grade, created, topics: await topicCountOf(db, classId) }
}

const NAME_MAX = 40
const squash = (text: string): string => text.trim().replace(/\s+/g, ' ')

/** The first name a parent typed for a child, or the plain reason it cannot be used. */
function checkFirstName(raw: unknown): string {
  const name = typeof raw === 'string' ? squash(raw) : ''
  if (!name) throw new OwnWorkspaceError('Type your child’s first name.')
  if (name.length > NAME_MAX) throw new OwnWorkspaceError(`Keep the name under ${NAME_MAX} letters.`)
  if (!/^[\p{L}][\p{L}\p{M} '’-]*$/u.test(name)) throw new OwnWorkspaceError('Use letters only for the name.')
  return name
}

/** The sandbox a demo parent belongs to: the sandbox of the school of any child the parent is linked to. Null for a parent with no child in a demo school. */
async function sandboxOfParent(db: JemmaDb, parentId: string): Promise<string | null> {
  const links = await ok(db.from('parent_links').select('child_id').eq('parent_id', parentId).eq('status', 'approved'))
  if (links.length === 0) return null
  const kids = await ok(db.from('children').select('school_id').in('id', links.map((l) => l.child_id)))
  if (kids.length === 0) return null
  const schools = await ok(db.from('schools').select('sandbox_id').in('id', [...new Set(kids.map((k) => k.school_id))]))
  return schools.find((s) => s.sandbox_id)?.sandbox_id ?? null
}

export type AddedChild = { childId: string; schoolId: string; classId: string; grade: number; /** Topics of the approved map of the grade, 0 outside South Africa. */ topics: number }

/**
 * A parent adds a child whose school does not use Jemma (P99). Makes ONE `children` row in a personal school of its own (`schools.kind 'private'`,
 * named "{first name}'s own", the parent's chosen country, no sandbox unless the parent is a demo parent's), with `private_of` null and no login yet,
 * the CAPS class of the grade (with its approved map in South Africa: `addGradeToWorkspace`, the parent as the person acting), and the approved
 * `parent_links` row that makes the parent the linked parent. The parent's own consent is the act of adding the child, so no teacher says yes. The child
 * has no school workspace: its own record IS its "My own" (`isOwnRecord`).
 * A missing or odd name, a grade outside 1 to 12 and a country that is not a two-letter code are refused with one plain sentence (`OwnWorkspaceError`)
 * and nothing is written. A failure after the school was made removes the school again (everything under it goes with it). The caller has checked
 * that `parentId` is a parent who is signed in, and that `country` is one the app knows.
 */
export async function addChildAlone(db: JemmaDb, input: { parentId: string; firstName: unknown; grade: unknown; country: unknown }, now: Date = new Date()): Promise<AddedChild> {
  const firstName = checkFirstName(input.firstName)
  if (!isGrade(input.grade)) throw new OwnWorkspaceError(`Pick a grade from ${OWN_GRADES.from} to ${OWN_GRADES.to}.`)
  const grade = input.grade
  const country = typeof input.country === 'string' && /^[A-Z]{2}$/.test(input.country) ? input.country : null
  if (!country) throw new OwnWorkspaceError('Pick the country.')

  const [profile, sandboxId] = await Promise.all([
    maybe(db.from('profiles').select('display_name').eq('user_id', input.parentId).maybeSingle()),
    sandboxOfParent(db, input.parentId),
  ])
  const parentFirst = squash(profile?.display_name ?? '').split(' ')[0] || null

  const school = await ok(
    db.from('schools').insert({ name: `${firstName}'s own`, country, region: null, grades: null, sandbox_id: sandboxId, kind: 'private' }).select('id').single(),
  )
  try {
    const child = await ok(
      db
        .from('children')
        .insert({ school_id: school.id, first_name: firstName, last_name: null, grade, user_id: null, private_of: null, parent_first_name: parentFirst, parent_relation: null })
        .select('id')
        .single(),
    )
    const added = await addGradeToWorkspace(db, { schoolId: school.id, childId: child.id, country }, grade, input.parentId, now)
    await ok(
      db
        .from('parent_links')
        .insert({ parent_id: input.parentId, child_id: child.id, class_id: added.classId, status: 'approved', consent: { guardian: true, teach: true, improve: false }, decided_at: now.toISOString() })
        .select('id'),
    )
    return { childId: child.id, schoolId: school.id, classId: added.classId, grade, topics: added.topics }
  } catch (e) {
    // Nothing is left half made: the personal school goes, and the child, the class, the map and the enrolment with it.
    await db.from('schools').delete().eq('id', school.id)
    throw new Error(`could not add the child: ${e instanceof Error ? e.message : String(e)}`)
  }
}

/**
 * The first name of a learner who signs up alone, from the name on the account: the first word, letters only (a name made from an email, "jane.doe99",
 * still reads as a name), at most 40 letters, with a capital at the start when it was typed in small letters. "Learner" when no letter is left.
 */
export function learnerFirstName(displayName: string): string {
  const word = squash(displayName).split(' ')[0] ?? ''
  const letters = word.replace(/[^\p{L}\p{M}'’-]/gu, '').replace(/^[^\p{L}]+/u, '').slice(0, NAME_MAX)
  if (!letters) return 'Learner'
  return letters === letters.toLowerCase() ? letters.charAt(0).toUpperCase() + letters.slice(1) : letters
}

export type StartedLearner = {
  childId: string
  schoolId: string
  /** The CAPS class of the learner's grade. Null only for a learner started earlier whose class cannot be found. */
  classId: string | null
  grade: number
  /** Topics of the approved map of the grade, 0 outside South Africa. */
  topics: number
  /** False when the learner was already started: nothing was made. */
  created: boolean
}

/**
 * A learner signs up alone (P111): one login, no teacher, no parent, no code, no age. Makes ONE `children` row with `user_id` = this login in a
 * personal school of its own (`schools.kind 'private'`, named "{first name}'s own", the chosen country, no sandbox), `private_of` null and no parent
 * (the same shape as a child a parent added alone, P99, so every learner screen treats it as an independent own record), the CAPS class of the grade
 * with its approved map in South Africa (`addGradeToWorkspace`, the learner as the person acting), and last the learner's `profiles` row (role
 * 'learner', `school_id` the personal school, so the learner's own login can read it). The first name comes from the account name (`learnerFirstName`).
 * Calling it twice never makes a second child: a login that already has a child (made by this call, or by a teacher's or a parent's code) gets that child
 * back, with nothing else made, and a missing profile or school link is filled in. A login that already has another role is refused. A grade outside 1 to 12
 * and a country that is not a two-letter code are refused with one plain sentence (`OwnWorkspaceError`) and nothing is written. A failure after the school was
 * made removes the school again (the child, the class, the map and the enrolment go with it) and the profile is never left behind. The caller has checked
 * that `userId` is the signed-in person and that `country` is one the app knows.
 */
export async function startLearnerAlone(
  db: JemmaDb,
  input: { userId: string; displayName: string; grade: unknown; country: unknown },
  now: Date = new Date(),
): Promise<StartedLearner> {
  if (!isGrade(input.grade)) throw new OwnWorkspaceError(`Pick your grade, from ${OWN_GRADES.from} to ${OWN_GRADES.to}.`)
  const grade = input.grade
  const country = typeof input.country === 'string' && /^[A-Z]{2}$/.test(input.country) ? input.country : null
  if (!country) throw new OwnWorkspaceError('Pick the country.')
  const firstName = learnerFirstName(input.displayName)
  const displayName = squash(input.displayName).slice(0, 80) || firstName

  const profile = await maybe(db.from('profiles').select('role, school_id').eq('user_id', input.userId).maybeSingle())
  if (profile && profile.role !== 'learner') throw new OwnWorkspaceError('This login already has a role.')

  const childrenOf = () => ok(db.from('children').select('id, school_id, grade').eq('user_id', input.userId).is('private_of', null).order('created_at').order('id'))
  const linkProfile = async (schoolId: string) => {
    if (!profile) {
      const made = await db.from('profiles').insert({ user_id: input.userId, role: 'learner', display_name: displayName, school_id: schoolId })
      // Two taps at once: the other one made the profile first, which is the same profile.
      if (made.error && codeOf(made.error) !== '23505') throw new Error(`could not save the profile: ${made.error.message}`)
    } else if (profile.school_id !== schoolId) {
      await ok(db.from('profiles').update({ school_id: schoolId }).eq('user_id', input.userId).select('user_id'))
    }
  }

  const before = (await childrenOf())[0]
  if (before) return alreadyStarted(db, before, linkProfile)

  const school = await ok(
    db.from('schools').insert({ name: `${firstName}'s own`, country, region: null, grades: null, sandbox_id: null, kind: 'private' }).select('id').single(),
  )
  try {
    const child = await ok(
      db
        .from('children')
        .insert({ school_id: school.id, first_name: firstName, last_name: null, grade, user_id: input.userId, private_of: null, parent_first_name: null, parent_relation: null })
        .select('id')
        .single(),
    )
    // Two taps at once: the oldest child of this login stays and the other tap takes its own school away again.
    const keeper = (await childrenOf())[0]
    if (keeper && keeper.id !== child.id) {
      await db.from('schools').delete().eq('id', school.id)
      return alreadyStarted(db, keeper, linkProfile)
    }
    const added = await addGradeToWorkspace(db, { schoolId: school.id, childId: child.id, country }, grade, input.userId, now)
    await linkProfile(school.id)
    return { childId: child.id, schoolId: school.id, classId: added.classId, grade, topics: added.topics, created: true }
  } catch (e) {
    // Nothing is left half made: the personal school goes, and the child, the class, the map and the enrolment with it.
    await db.from('schools').delete().eq('id', school.id)
    throw new Error(`could not start: ${e instanceof Error ? e.message : String(e)}`)
  }
}

/** The answer of `startLearnerAlone` for a login that already has a child: that child, its CAPS class and map as they are, and the profile filled in. */
async function alreadyStarted(
  db: JemmaDb,
  child: { id: string; school_id: string; grade: number },
  linkProfile: (schoolId: string) => Promise<void>,
): Promise<StartedLearner> {
  await linkProfile(child.school_id)
  const caps = (await ok(db.from('classes').select('id').eq('school_id', child.school_id).eq('grade', child.grade).eq('name', capsClassName(child.grade)).order('created_at').order('id')))[0]
  return { childId: child.id, schoolId: child.school_id, classId: caps?.id ?? null, grade: child.grade, topics: caps ? await topicCountOf(db, caps.id) : 0, created: false }
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

/**
 * P161: a parent changes a child's country. The country belongs to the child's own space: the child's personal school when the parent added the child
 * alone, or the child's "My own" side when the child is in a teacher's class (the class keeps its school's country and its teacher's map). Each grade of
 * that space gets the new country's built-in map (it becomes the newest, so it is the one used); a country with no built-in map keeps the topics it had.
 * The child's practice, marks and lessons stay. Returns false when the child has no own space yet (nothing to change: the class decides).
 */
export async function changeChildCountry(db: JemmaDb, input: { childId: string; country: string; actorUserId: string }, now: Date = new Date()): Promise<boolean> {
  if (!/^[A-Z]{2}$/.test(input.country)) throw new OwnWorkspaceError('Pick the country.')
  const child = await ok(db.from('children').select('id, school_id').eq('id', input.childId).single())
  const home = await ok(db.from('schools').select('id, kind').eq('id', child.school_id).single())
  let schoolId: string | null = home.kind === 'private' ? home.id : null
  if (!schoolId) {
    const twins = await ok(db.from('children').select('school_id').eq('private_of', input.childId))
    schoolId = twins[0]?.school_id ?? null
  }
  if (!schoolId) return false
  await ok(db.from('schools').update({ country: input.country }).eq('id', schoolId).select('id'))
  const classes = await ok(db.from('classes').select('id, grade').eq('school_id', schoolId))
  for (const cls of classes) {
    const map = builtInMapOf(input.country, cls.grade)
    if (!map) continue
    await writeApprovedMap(db, { classId: cls.id, stored: map.stored, approvedAt: now.toISOString(), rows: map.rows })
    await ok(db.from('activity_log').insert({ school_id: schoolId, class_id: cls.id, at: now.toISOString(), text: map.log, tool: 'use_caps_map' }).select('id'))
  }
  return true
}
