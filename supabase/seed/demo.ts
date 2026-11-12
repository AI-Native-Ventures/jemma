// Per-judge demo sandboxes: a made-up school with its own users, at one of three stages.
// Server only: needs the service role client.
import type { Json, JemmaDb } from '../../packages/profiling/src/db'
import type { ToolContext } from '../../packages/profiling/src/tools/context'
import { loadHistory } from '../../packages/profiling/src/tools/read/get-learner-history'
import { storedTerms } from '../../packages/profiling/src/tools/save/save-long-view'
import { LessonSchema, ReteachSchema, GuidanceSchema, TopicMapDraftSchema, AnswerKeyItemSchema } from '../../packages/profiling/src/schemas'
import { classTest1Results, classTest1Roster, classTest1Scores, classTest1ScoresBeforeFix, classTest1Wrong, siphoQ7BeforeFix } from './fixtures/class-test-1'
import { AMINA_ACTIVITIES, AWAY_DAY_INDEX, CAST, CHILD_PIN, EMPTY_SCHOOL, EMPTY_TEACHER, NOTES, SCHOOL, lastSchoolDays } from './fixtures/cast'
import { FIXED_GAPS, FORMAT_FAMILY, FORMAT_TRIALS, TERM3_ROWS } from './fixtures/history'
import { HILLVIEW_CLASSES, HILLVIEW_LINKS, HILLVIEW_PARENTS, HILLVIEW_TEACHERS, madeUpClasses, madeUpLearner, sixBOtherSubjects } from './fixtures/hillview'
import { longHistory } from './fixtures/long-history'
import { PATTERN_LEARNERS, wordPatterns } from './fixtures/long-view-wording'
import {
  AMINA_LESSON, AMINA_LOG, CLASS_LOG, CURRICULUM_DOCS, HOMEWORK_NEEDS, SIPHO_NEEDS, WEEK_PLAN, PARENT_NOTES, TEACHER_NOTES, HOMEWORK_ROWS, LESSON_TOPIC, RETEACH, RETEACH_EXPLANATION, RETEACH_MISSING_BASIC, RETEACH_TOPIC, RETEACH_WHY,
  SESSION_DONE, SESSION_LOG, SESSION_TRY, SESSION_WARMUP, TEST_TITLE, TERMS, answerKeyItems, guidanceCard, topicMapDraft,
} from './fixtures/marked-state'
import { SAMPLE_FILES, answerCrop, ensureSampleFiles, type LoadSheet } from './fixtures/sample-papers'
import { readSandbox, teardown } from './teardown'

export type SandboxStage = 'start' | 'marked' | 'session_done'

/** `hillview`: the made-up school with three teachers, six classes and about 23 learners. `empty`: a school with no class and one teacher, for starting from nothing. */
export type SandboxKind = 'hillview' | 'empty'

export type Sandbox = {
  sandboxId: string
  schoolId: string
  /** The home class (the oldest). Empty for a school with no class yet. */
  classId: string
  joinCode: string
  childLoginCode: string
  childPin: '1234'
  kind: SandboxKind
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const MIN = 60_000
const DAY = 24 * 60 * MIN

const json = (v: unknown) => v as NonNullable<Json>

type Res<T> = PromiseLike<{ data: T; error: { message: string } | null }>

async function okMaybe<T>(q: Res<T>, what: string): Promise<T> {
  const { data, error } = await q
  if (error) throw new Error(`demo seed: ${what}: ${error.message}`)
  return data
}

async function ok<T>(q: Res<T>, what: string): Promise<NonNullable<T>> {
  // Writes without `select` return null data; `.single()` already errors on a missing row.
  return (await okMaybe(q, what)) as NonNullable<T>
}

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

function randomHex(bytes: number): string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Same scheme as the web app's child sign-in: hex(HMAC_SHA256(CHILD_PIN_PEPPER, code + ':' + pin)). */
async function childPassword(code: string, pin: string): Promise<string> {
  let pepper = process.env.CHILD_PIN_PEPPER
  if (!pepper) {
    console.warn('demo seed: CHILD_PIN_PEPPER is not set, using a dev pepper. Child PIN sign-in only works if the web app uses the same value.')
    pepper = 'jemma-dev-pepper'
  }
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${code}:${pin}`))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const extOf = (path: string) => path.slice(path.lastIndexOf('.'))

export type Login = { userId: string; email: string; password: string }

/**
 * The sign-ins a sandbox stores. `teacher` is Ms Banda (or "You" in an empty school), `parent` is Thandi M and `learner` is Amina: the
 * three the demo page has always had. The other teachers and parents are made with the sandbox (`teachers`, `parents`, by key);
 * a learner's login is made when someone picks that learner (`learners`, by first name).
 */
export type Logins = {
  teacher: Login
  parent?: Login
  learner?: Login & { code: string; pin: string }
  teachers?: Record<string, Login>
  parents?: Record<string, Login>
  learners?: Record<string, Login & { code: string; pin: string }>
}

const chunks = <T>(rows: T[], size: number): T[][] => Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, (i + 1) * size))

/** Several auth users at once. Waits for all of them, so a failure never leaves a user that was made after the clean-up ran. */
async function makeUsers(admin: JemmaDb, created: { userIds: string[] }, wanted: { email: string; password: string }[]): Promise<Login[]> {
  const settled = await Promise.allSettled(
    wanted.map(async (w) => {
      const r = await admin.auth.admin.createUser({ email: w.email, password: w.password, email_confirm: true })
      if (r.error || !r.data.user) throw new Error(`demo seed: create user ${w.email}: ${r.error?.message}`)
      created.userIds.push(r.data.user.id)
      return { userId: r.data.user.id, email: w.email, password: w.password }
    }),
  )
  const failed = settled.find((s) => s.status === 'rejected')
  if (failed && failed.status === 'rejected') throw failed.reason
  return settled.map((s) => (s as PromiseFulfilledResult<Login>).value)
}

/** Builds one sandbox. Throws after cleaning up what it made. */
async function build(admin: JemmaDb, sandboxId: string, stage: SandboxStage, kind: SandboxKind, loadSheet?: LoadSheet): Promise<Sandbox> {
  return kind === 'empty' ? buildEmpty(admin, sandboxId) : buildHillview(admin, sandboxId, stage, loadSheet)
}

/** An empty school: no class, no learner, one teacher called "You". The teacher makes the first class. */
async function buildEmpty(admin: JemmaDb, sandboxId: string): Promise<Sandbox> {
  const created: { schoolId: string | null; userIds: string[] } = { schoolId: null, userIds: [] }
  try {
    const school = await ok(
      admin.from('schools').insert({ name: EMPTY_SCHOOL.name, country: EMPTY_SCHOOL.country, region: EMPTY_SCHOOL.region, grades: EMPTY_SCHOOL.grades, sandbox_id: sandboxId }).select('id').single(),
      'school',
    )
    created.schoolId = school.id
    const tag = randomHex(4)
    const [teacher] = await makeUsers(admin, created, [{ email: `${EMPTY_TEACHER.emailLocal}.${tag}@demo.jemma.invalid`, password: randomHex(16) }])
    await ok(admin.from('profiles').insert({ user_id: teacher!.userId, role: 'teacher', display_name: EMPTY_TEACHER.displayName, school_id: school.id }), 'profiles')
    const logins: Logins = { teacher: teacher! }
    await ok(admin.from('demo_sandboxes').insert({ id: sandboxId, school_id: school.id, logins: json(logins), stage: 'start', kind: 'empty' }), 'demo_sandboxes')
    return { sandboxId, schoolId: school.id, classId: '', joinCode: '', childLoginCode: '', childPin: CHILD_PIN, kind: 'empty' }
  } catch (e) {
    await teardown(admin, created.schoolId, created.userIds).catch(() => undefined)
    throw e
  }
}

/** The made-up school Hillview Primary. */
async function buildHillview(admin: JemmaDb, sandboxId: string, stage: SandboxStage, loadSheet?: LoadSheet): Promise<Sandbox> {
  const now = new Date()
  const year = now.getUTCFullYear()
  const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * MIN).toISOString()
  const dayIso = (daysAgo: number) => new Date(now.getTime() - daysAgo * DAY).toISOString()
  const created: { schoolId: string | null; userIds: string[] } = { schoolId: null, userIds: [] }

  try {
    const school = await ok(
      admin.from('schools').insert({ name: SCHOOL.name, country: SCHOOL.country, region: SCHOOL.region, grades: SCHOOL.grades, sandbox_id: sandboxId }).select('id').single(),
      'school',
    )
    const schoolId = school.id
    created.schoolId = schoolId

    // Auth users: the three teachers, the four parents and Amina (she signs in with her code and PIN). Every other learner gets a login
    // when someone picks that learner on the demo page.
    const tag = randomHex(4)
    const joinCode = randomCode()
    const childLoginCode = randomCode()
    const learnerEmail = `${childLoginCode.toLowerCase()}@kids.jemma.invalid`
    const learnerPassword = await childPassword(childLoginCode, CHILD_PIN)
    const made = await makeUsers(admin, created, [
      ...HILLVIEW_TEACHERS.map((t) => ({ email: `${t.emailLocal}.${tag}@demo.jemma.invalid`, password: randomHex(16) })),
      ...HILLVIEW_PARENTS.map((p) => ({ email: `${p.emailLocal}.${tag}@demo.jemma.invalid`, password: randomHex(16) })),
      { email: learnerEmail, password: learnerPassword },
    ])
    const teacherLogin = Object.fromEntries(HILLVIEW_TEACHERS.map((t, i) => [t.key, made[i]!])) as Record<string, Login>
    const parentLogin = Object.fromEntries(HILLVIEW_PARENTS.map((p, i) => [p.key, made[HILLVIEW_TEACHERS.length + i]!])) as Record<string, Login>
    const learnerLogin = made[made.length - 1]!
    const teacherId = teacherLogin.banda!.userId
    const parentId = parentLogin.thandi!.userId
    const learnerId = learnerLogin.userId
    await ok(
      admin.from('profiles').insert([
        ...HILLVIEW_TEACHERS.map((t) => ({ user_id: teacherLogin[t.key]!.userId, role: 'teacher' as const, display_name: t.displayName, school_id: schoolId })),
        ...HILLVIEW_PARENTS.map((p) => ({ user_id: parentLogin[p.key]!.userId, role: 'parent' as const, display_name: p.displayName, school_id: null })),
        { user_id: learnerId, role: 'learner' as const, display_name: 'Amina', school_id: schoolId },
      ]),
      'profiles',
    )

    // Six classes. 6B Mathematics is made first and keeps the oldest timestamp: it is the sandbox's home class.
    const classRows = await ok(
      admin
        .from('classes')
        .insert(
          HILLVIEW_CLASSES.map((c, i) => ({
            school_id: schoolId, teacher_id: teacherLogin[c.teacher]!.userId, name: c.name, grade: c.grade, year, subject: c.subject,
            join_code: i === 0 ? joinCode : randomCode(), created_at: new Date(now.getTime() - (HILLVIEW_CLASSES.length - i) * 1000).toISOString(),
          })),
        )
        .select('id, name'),
      'classes',
    )
    const classOf = Object.fromEntries(HILLVIEW_CLASSES.map((c) => [c.key, classRows.find((r) => r.name === c.name)!.id])) as Record<string, string>
    const classId = classOf['6b-maths']!

    // The learners: the five of 6B first (in the cast order), then the made-up learners of the other three classes.
    const madeUp = madeUpClasses(year)
    const linkedAt = (classKey: string, position: number) => HILLVIEW_LINKS.filter((l) => l.classKey === classKey && l.at === position)
    const rows = [
      ...CAST.children.map((name) => ({ name, classKey: '6b-maths', grade: 6, parent: name === 'Amina' ? { first: CAST.parent.firstName, relation: CAST.parent.relation } : null })),
      ...madeUp.flatMap((m) => {
        const c = HILLVIEW_CLASSES.find((x) => x.key === m.classKey)!
        return m.batch.learners.map((l, position) => {
          const link = linkedAt(m.classKey, position)[0]
          const parent = link ? HILLVIEW_PARENTS.find((p) => p.key === link.parent)! : null
          return { name: l.firstName, classKey: m.classKey as string, grade: c.grade, parent: parent ? { first: parent.displayName.split(' ')[0]!, relation: parent.relation } : null }
        })
      }),
    ]
    const kids = await ok(
      admin
        .from('children')
        .insert(
          rows.map((r, i) => ({
            school_id: schoolId, first_name: r.name, grade: r.grade,
            // A bulk insert shares one timestamp; spread it so the class list keeps the cast order.
            created_at: new Date(now.getTime() - (rows.length - i) * 1000).toISOString(),
            user_id: r.name === 'Amina' ? learnerId : null,
            parent_first_name: r.parent?.first ?? null,
            parent_relation: r.parent?.relation ?? null,
          })),
        )
        .select('id, first_name'),
      'children',
    )
    const idOfName = Object.fromEntries(kids.map((k) => [k.first_name, k.id])) as Record<string, string>
    const childId = Object.fromEntries(CAST.children.map((n) => [n.toLowerCase(), idOfName[n]!])) as Record<string, string>
    const aminaId = childId.amina!
    const five = CAST.children.map((n) => ({ id: idOfName[n]!, first_name: n }))

    const logins: Logins = {
      teacher: teacherLogin.banda!,
      parent: parentLogin.thandi!,
      learner: { ...learnerLogin, code: childLoginCode, pin: CHILD_PIN },
      teachers: Object.fromEntries(HILLVIEW_TEACHERS.filter((t) => t.key !== 'banda').map((t) => [t.key, teacherLogin[t.key]!])),
      parents: Object.fromEntries(HILLVIEW_PARENTS.filter((p) => p.key !== 'thandi').map((p) => [p.key, parentLogin[p.key]!])),
      learners: {},
    }
    await ok(admin.from('demo_sandboxes').insert({ id: sandboxId, school_id: schoolId, logins: json(logins), stage, kind: 'hillview' }), 'demo_sandboxes')

    // ---- Stage start ----
    const days = lastSchoolDays(now)
    const term3PaperAt = '2026-09-25T12:00:00.000Z'
    // The five learners of 6B are in all three 6B classes; each made-up learner is in their own class only.
    const enrolments = [
      ...five.flatMap((k) => ['6b-maths', '6b-english', '6b-science'].map((key) => ({ class_id: classOf[key]!, child_id: k.id }))),
      ...madeUp.flatMap((m) => m.batch.learners.map((l) => ({ class_id: classOf[m.classKey]!, child_id: idOfName[l.firstName]! }))),
    ]
    // Records: the five learners' Mathematics history (hand-built), their English and Natural Sciences history, and the made-up learners'.
    const records = [
      ...longHistory(year, CAST.teacher.displayName).map(({ child, ...row }) => ({ ...row, school_id: schoolId, child_id: childId[child]! })),
      ...sixBOtherSubjects(year).flatMap((s) => s.batch.learners.flatMap((l) => l.records.map((r) => ({ ...r, school_id: schoolId, child_id: idOfName[l.firstName]! })))),
      ...madeUp.flatMap((m) => m.batch.learners.flatMap((l) => l.records.map((r) => ({ ...r, school_id: schoolId, child_id: idOfName[l.firstName]! })))),
    ]
    // A made-up learner is away on a few of the ten days, in a different place for each.
    const awayDay = (name: string, i: number) => ((name.charCodeAt(0) + name.length + i) % 8 === 0)
    const startWork = [
      ok(admin.from('child_logins').insert({ code: childLoginCode, child_id: aminaId, user_id: learnerId, pin_set_by: parentId }), 'child_logins'),
      ok(admin.from('enrolments').insert(enrolments), 'enrolments'),
      ...chunks(
        kids.flatMap((k) =>
          days.map((day, i) => ({
            child_id: k.id, day,
            status: (CAST.children as readonly string[]).includes(k.first_name)
              ? (AWAY_DAY_INDEX[k.first_name] ?? []).includes(i) ? ('away' as const) : ('here' as const)
              : awayDay(k.first_name, i) ? ('away' as const) : ('here' as const),
          })),
        ),
        500,
      ).map((part) => ok(admin.from('attendance').insert(part), 'attendance')),
      ok(
        admin.from('observations').insert(
          NOTES.map((n) => ({ child_id: aminaId, author_id: teacherId, kind: n.kind, text: n.text, created_at: dayIso(n.daysAgo) })),
        ),
        'observations',
      ),
      ok(
        admin.from('activities').insert(AMINA_ACTIVITIES.map((a) => ({ child_id: aminaId, created_by: parentId, ...a, days: [...a.days] }))),
        'activities',
      ),
      ok(
        admin.from('format_trials').insert(
          FORMAT_TRIALS.map((t, i) => ({
            child_id: aminaId, topic_family: FORMAT_FAMILY, format: t.format, score: t.score, created_at: dayIso(60 - i * 5),
          })),
        ),
        'format_trials',
      ),
      ok(
        admin.from('gaps').insert(
          FIXED_GAPS.map((topic, i) => ({
            child_id: aminaId, topic_name: topic, stage: 'fixed' as const,
            first_practised_at: dayIso(70 - i * 3), fixed_at: dayIso(55 - i * 3),
          })),
        ),
        'fixed gaps',
      ),
      (async () => {
        const paper = await ok(
          admin
            .from('papers')
            .insert({
              child_id: aminaId, owner: 'parent', kind: 'test', status: 'marked', name_read: 'Amina',
              total: TERM3_ROWS.filter((r) => r.correct).length, created_at: term3PaperAt,
            })
            .select('id')
            .single(),
          'term 3 paper',
        )
        await ok(
          admin.from('question_results').insert(
            TERM3_ROWS.map((r, i) => ({
              paper_id: paper.id, child_id: aminaId, n: i + 1, prompt: r.prompt, answer_read: r.wrote, read_confidence: 0.95,
              correct: r.correct, mark: r.correct ? 1 : 0, topic_name: r.topic, misconception: r.misconception ?? null,
              created_at: term3PaperAt,
            })),
          ),
          'term 3 results',
        )
      })(),
      // The Long view: three school years of made-up records in their own table (every stage has them), a few hundred rows at a time.
      ...chunks(records, 500).map((part) => ok(admin.from('learner_records').insert(part), 'learner_records')),
      // The parents of made-up learners are linked from the start. Thandi M and Amina link in the demo path.
      ok(
        admin.from('parent_links').insert(
          HILLVIEW_LINKS.map((l) => ({
            parent_id: parentLogin[l.parent]!.userId, child_id: idOfName[madeUpLearner(madeUp, l.classKey, l.at)!.firstName]!, class_id: classOf[l.classKey]!,
            status: 'approved' as const, consent: { guardian: true, teach: true, improve: false }, decided_at: at(120),
          })),
        ),
        'parent links',
      ),
      ensureSampleFiles(admin, { loadSheet }),
    ]
    await Promise.all(startWork)

    if (stage !== 'start') {
      await buildMarked({ admin, now, at, schoolId, classId, teacherId, parentId, childId, aminaId, withSession: stage === 'session_done' })
    }

    return { sandboxId, schoolId, classId, joinCode, childLoginCode, childPin: CHILD_PIN, kind: 'hillview' }
  } catch (e) {
    await teardown(admin, created.schoolId, created.userIds).catch(() => undefined)
    throw e
  }
}

type MarkedCtx = {
  admin: JemmaDb
  now: Date
  at: (minutesAgo: number) => string
  schoolId: string
  classId: string
  teacherId: string
  parentId: string
  childId: Record<string, string>
  aminaId: string
  withSession: boolean
}

async function buildMarked(c: MarkedCtx): Promise<void> {
  const { admin, schoolId, classId, teacherId, parentId, childId, aminaId } = c
  const today = c.now.toISOString().slice(0, 10)
  const sampleCopy = async (from: string, bucket: string, to: string) => {
    const r = await admin.storage.from(SAMPLE_FILES.bucket).copy(from, to, { destinationBucket: bucket })
    if (r.error && !/already exists|Duplicate/i.test(r.error.message)) throw new Error(`demo seed: copy ${from}: ${r.error.message}`)
  }

  // Curriculum documents and the approved map.
  const draft = TopicMapDraftSchema.parse(topicMapDraft())
  const map = await ok(
    admin.from('curriculum_maps').insert({ class_id: classId, status: 'approved', draft: json(draft), approved_at: c.at(62) }).select('id').single(),
    'map',
  )
  const topicRows = await ok(
    admin
      .from('topics')
      .insert(
        TERMS.flatMap((t) =>
          t.topics.map((p, i) => ({
            map_id: map.id, term: t.term, position: i + 1, name: p.name, short_name: p.short ?? p.name, family: p.family, misconceptions: p.misconceptions,
          })),
        ),
      )
      .select('id, name'),
    'topics',
  )
  const topicId = new Map(topicRows.map((t) => [t.name, t.id]))
  const tid = (name: string) => {
    const id = topicId.get(name)
    if (!id) throw new Error(`demo seed: topic not on the map: ${name}`)
    return id
  }
  const docPaths = CURRICULUM_DOCS.map((d, i) => `${schoolId}/${classId}/doc-${i + 1}${extOf(SAMPLE_FILES.curriculum)}`)
  const prereqUpdates = TERMS.flatMap((t) => t.topics)
    .filter((p) => p.needs.length)
    .map((p) => ok(admin.from('topics').update({ prerequisite_ids: p.needs.map(tid) }).eq('id', tid(p.name)), 'prerequisites'))
  await Promise.all([
    ok(
      admin.from('curriculum_docs').insert(CURRICULUM_DOCS.map((d, i) => ({ class_id: classId, storage_path: docPaths[i]!, title: d.title, pages: d.pages }))),
      'curriculum_docs',
    ),
    ...docPaths.map((p) => sampleCopy(SAMPLE_FILES.curriculum, 'curriculum', p)),
    ...prereqUpdates,
  ])

  // Class Test 1 with its approved key.
  const keyItems = answerKeyItems().map((i) => AnswerKeyItemSchema.parse(i))
  const mapTopics = [...new Set(keyItems.map((i) => i.topicName))]
  // The seeded test is already shared with parents (40 minutes ago, by Ms Banda), so every screen and spec that starts from the
  // `marked` or `session_done` stage keeps working. A test made in the app starts held (see `createTest`).
  const test = await ok(
    admin
      .from('tests')
      .insert({
        class_id: classId, title: TEST_TITLE, written_on: c.now.toISOString().slice(0, 10), out_of: 10, topic_ids: mapTopics.map(tid),
        held: false, shared_at: c.at(40), shared_by: teacherId,
      })
      .select('id')
      .single(),
    'test',
  )
  await ok(
    admin.from('approvals').insert({
      school_id: schoolId, kind: 'share_results', ref_id: test.id, decision: 'shared', decided_by: teacherId, decided_by_name: CAST.teacher.displayName,
      decided_at: c.at(40), note: TEST_TITLE,
    }),
    'share approval',
  )
  const memoPath = `${schoolId}/${test.id}/memo${extOf(SAMPLE_FILES.memo)}`
  await Promise.all([
    ok(admin.from('answer_keys').insert({ test_id: test.id, status: 'approved', items: json(keyItems), memo_path: memoPath, approved_at: c.at(10) }), 'answer key'),
    sampleCopy(SAMPLE_FILES.memo, 'papers', memoPath),
  ])

  // Five marked papers.
  const paperRows = await ok(
    admin
      .from('papers')
      .insert(
        classTest1Roster.map((r) => ({
          test_id: test.id, child_id: childId[r.id]!, owner: 'teacher' as const, kind: 'test' as const,
          status: r.id === 'sipho' && !c.withSession ? ('needs_you' as const) : ('marked' as const),
          name_read: r.name,
          total: (c.withSession ? classTest1Scores : classTest1ScoresBeforeFix)[r.id]!,
        })),
      )
      .select('id, child_id'),
    'papers',
  )
  const paperOf = new Map(paperRows.map((p) => [p.child_id, p.id]))
  const pagePath = (paperId: string, name: string) => `${schoolId}/${paperId}/1${extOf(SAMPLE_FILES.papers[name as keyof typeof SAMPLE_FILES.papers])}`
  const keyOf = new Map(keyItems.map((i) => [i.n, i]))
  const resultRows = classTest1Results.map((r) => {
    const name = classTest1Roster.find((x) => x.id === r.childId)!.id
    const wrong = classTest1Wrong[name]?.[r.n]
    const key = keyOf.get(r.n)!
    const siphoQ7 = name === 'sipho' && r.n === siphoQ7BeforeFix.n
    // Before the fix Sipho's Q7 is still as read (0,8 at 0.42, wrong); the session_done stage has it fixed.
    const siphoFixed = siphoQ7 && c.withSession
    const siphoOpen = siphoQ7 && !c.withSession
    return {
      paper_id: paperOf.get(childId[name]!)!,
      child_id: childId[name]!,
      n: r.n,
      prompt: r.prompt,
      answer_read: siphoOpen ? siphoQ7BeforeFix.answerRead : r.answerRead,
      read_confidence: siphoOpen ? siphoQ7BeforeFix.confidence : siphoFixed ? 1 : wrong ? 0.93 : 0.96,
      correct: siphoOpen ? false : r.correct,
      mark: !siphoOpen && r.correct ? 1 : 0,
      crop: json(answerCrop(r.n)),
      topic_id: tid(key.topicName),
      topic_name: key.topicName,
      misconception: r.misconception,
      gap_topic_id: r.gapTopicName ? tid(r.gapTopicName) : null,
      previous_answer: siphoFixed ? siphoQ7BeforeFix.answerRead : null,
      changed_by: siphoFixed ? teacherId : null,
    }
  })
  const [results] = await Promise.all([
    ok(admin.from('question_results').insert(resultRows).select('id, child_id, n, gap_topic_id'), 'question_results'),
    ok(
      admin.from('paper_pages').insert(classTest1Roster.map((r) => ({ paper_id: paperOf.get(childId[r.id]!)!, page_no: 1, storage_path: pagePath(paperOf.get(childId[r.id]!)!, r.id) }))),
      'paper_pages',
    ),
    ...classTest1Roster.map((r) =>
      sampleCopy(SAMPLE_FILES.papers[r.id as keyof typeof SAMPLE_FILES.papers], 'papers', pagePath(paperOf.get(childId[r.id]!)!, r.id)),
    ),
  ])

  // Amina's homework from Sunday, waiting for her mum to check it.
  const hwPaper = await ok(
    admin
      .from('papers')
      .insert({ child_id: aminaId, owner: 'parent', kind: 'homework', status: 'needs_you', name_read: 'Amina', created_at: c.at(24 * 60 + 5) })
      .select('id')
      .single(),
    'homework paper',
  )
  const hwResults = await ok(
    admin
      .from('question_results')
      .insert(
        HOMEWORK_ROWS.map((r, i) => ({
          paper_id: hwPaper.id, child_id: aminaId, n: i + 1, prompt: r.prompt, answer_read: r.wrote, read_confidence: r.confidence,
          correct: r.correct, mark: r.correct ? 1 : 0, topic_id: tid('Adding decimals'), topic_name: 'Adding decimals',
          misconception: r.misconception ?? null, gap_topic_id: r.correct ? null : tid('Adding decimals'),
          created_at: c.at(24 * 60 + 5),
        })),
      )
      .select('id, n, correct'),
    'homework results',
  )

  // Diagnosed gaps: one per learner per gap topic.
  const topicOfGap = new Map<string, string>()
  for (const [name, wrongs] of Object.entries(classTest1Wrong)) {
    for (const w of Object.values(wrongs)) topicOfGap.set(`${name}|${w.gapTopicName}`, w.gapTopicName)
  }
  const gapRows = [...topicOfGap.keys()].map((key) => {
    const [name, topic] = key.split('|') as [string, string]
    const evidence = results.filter((r) => r.child_id === childId[name] && r.gap_topic_id === tid(topic)).map((r) => r.id)
    if (name === 'amina' && topic === 'Adding decimals') evidence.push(...hwResults.filter((r) => !r.correct).map((r) => r.id))
    return {
      child_id: childId[name]!, topic_id: tid(topic), topic_name: topic, stage: 'new' as const, evidence,
      created_at: c.at(5),
    }
  })
  const savedGaps = await ok(admin.from('gaps').insert(gapRows).select('id, child_id, topic_name'), 'gaps')

  // Reteach, lesson, planned session, guidance card, link, Needs you, log.
  const reteach = ReteachSchema.parse(RETEACH)
  const lesson = LessonSchema.parse(AMINA_LESSON)
  const aminaResults = results.filter((r) => r.child_id === aminaId)
  const idsFor = (ns: number[]) => aminaResults.filter((r) => ns.includes(r.n)).map((r) => r.id)
  const guidance = GuidanceSchema.parse(
    guidanceCard({ fractions: idsFor([1, 2, 4]), decimals: idsFor([8]), homework: hwResults.filter((r) => !r.correct).map((r) => r.id) }),
  )
  const lessonRow = await ok(
    admin
      .from('lessons')
      .insert({ child_id: aminaId, topic_id: tid(LESSON_TOPIC), topic_name: LESSON_TOPIC, format: 'diagram', content: json(lesson) })
      .select('id')
      .single(),
    'lesson',
  )
  const tonight = WEEK_PLAN[0]!
  const tonightPlan = {
    topic_id: tid(tonight.topic), topic_name: tonight.topic, format: tonight.format, planned_minutes: tonight.minutes, question_count: tonight.questions,
  }
  const session = await ok(
    admin
      .from('sessions')
      .insert({ child_id: aminaId, lesson_id: lessonRow.id, status: 'planned', planned_for: today, warmup: json(lesson.warmup), ...tonightPlan })
      .select('id')
      .single(),
    'session',
  )
  // The rest of Amina's week (parent-learn): planned sessions with no lesson yet.
  const dayOf = (n: number) => new Date(c.now.getTime() + n * DAY).toISOString().slice(0, 10)
  const planFields = (w: (typeof WEEK_PLAN)[number]) => ({
    topic_id: tid(w.topic), topic_name: w.topic, format: w.format, planned_minutes: w.minutes, question_count: w.questions,
  })
  await ok(
    admin.from('sessions').insert(
      WEEK_PLAN.filter((w) => w.inDays > 0).map((w) => ({
        child_id: aminaId, lesson_id: null, status: 'planned' as const, planned_for: dayOf(w.inDays), warmup: json([]), ...planFields(w),
      })),
    ),
    'week sessions',
  )
  await Promise.all([
    ok(
      admin.from('reteach_plans').insert({
        class_id: classId, test_id: test.id, topic_id: tid(RETEACH_TOPIC), topic_name: RETEACH_TOPIC, content: json(reteach),
        why: RETEACH_WHY, missing_basic: RETEACH_MISSING_BASIC, explanation: RETEACH_EXPLANATION,
      }),
      'reteach',
    ),
    ok(
      admin.from('needs_you_items').insert({
        owner_id: teacherId, school_id: schoolId, child_id: childId.sipho!, kind: 'check_answer', ref_id: paperOf.get(childId.sipho!)!,
        status: c.withSession ? 'done' : 'open', ...SIPHO_NEEDS,
      }),
      'sipho needs you',
    ),
    ok(admin.from('guidance_cards').insert({ child_id: aminaId, content: json(guidance) }), 'guidance'),
    ok(
      admin.from('parent_links').insert({
        parent_id: parentId, child_id: aminaId, class_id: classId, status: 'approved',
        consent: { guardian: true, teach: true, improve: false }, decided_at: c.at(30),
      }),
      'parent link',
    ),
    ok(
      admin.from('needs_you_items').insert({
        owner_id: parentId, school_id: schoolId, child_id: aminaId, kind: 'confirm_scan', ref_id: hwPaper.id, ...HOMEWORK_NEEDS,
      }),
      'needs you',
    ),
    ok(
      admin.from('activity_log').insert([
        ...CLASS_LOG.map((l) => ({ school_id: schoolId, class_id: classId, at: c.at(l.minutesAgo), text: l.text, tool: l.tool })),
        ...AMINA_LOG.map((l) => ({ school_id: schoolId, child_id: aminaId, at: c.at(l.minutesAgo), text: l.text, tool: l.tool })),
      ]),
      'activity_log',
    ),
    // Attach map topics to the Term 3 history, the fixed gaps and anything else tagged by name.
    ok(admin.rpc('retag_results', { map: map.id }), 'retag_results'),
  ])

  // The Long view: what the long_view job would have saved, as drafts for the teacher, with a Needs you item for each learner.
  // Code finds the patterns (the same `loadHistory` the tool reads), the wording comes from a small fixture.
  await seedLongView(c)

  // Bell items for this stage; only the newest is unread.
  const fill = (path: string, ids: Record<string, string>) => path.replace(/\{(\w+)\}/g, (_, k: string) => ids[k]!)
  const ids = { amina: aminaId, test: test.id, sipho: paperOf.get(childId.sipho!)!, aminaPaper: paperOf.get(aminaId)!, homework: hwPaper.id, session: session.id }
  const inStage = <T extends { stage: string }>(notes: T[]) => notes.filter((n) => n.stage === 'marked' || c.withSession)
  const newest = (notes: { minutesAgo: number }[]) => Math.min(...notes.map((n) => n.minutesAgo))
  const teacherNotes = inStage(TEACHER_NOTES)
  const parentNotes = inStage(PARENT_NOTES)
  await ok(
    admin.from('notifications').insert([
      ...teacherNotes.map((n) => ({
        user_id: teacherId, title: n.title, body: n.body, href: `/t/${classId}/${fill(n.href, ids)}`, created_at: c.at(n.minutesAgo),
        read_at: n.minutesAgo === newest(teacherNotes) ? null : c.at(n.minutesAgo),
      })),
      ...parentNotes.map((n) => ({
        user_id: parentId, title: n.title, body: n.body, href: `/p/${aminaId}/${fill(n.href, ids)}`, created_at: c.at(n.minutesAgo),
        read_at: n.minutesAgo === newest(parentNotes) ? null : c.at(n.minutesAgo),
      })),
    ]),
    'notifications',
  )

  if (c.withSession) {
    const finishedAt = c.now.toISOString()
    const firstAdding = savedGaps.find((g) => g.child_id === aminaId && g.topic_name === RETEACH_TOPIC)!
    await ok(
      admin.from('sessions').update({ status: 'done', right: SESSION_DONE.right, minutes: SESSION_DONE.minutes, finished_at: finishedAt }).eq('id', session.id),
      'finish session',
    )
    await Promise.all([
      ok(
        admin.from('session_items').insert([
          ...SESSION_WARMUP.map((w, i) => ({
            session_id: session.id, position: i + 1, phase: 'warmup' as const, question: json(w.q), difficulty: w.q.difficulty,
            answer: w.answer, correct: w.correct, seconds: w.seconds, adapted: null,
          })),
          ...SESSION_TRY.map((t, i) => ({
            session_id: session.id, position: i + 1, phase: 'try' as const, question: json(t.q), difficulty: t.difficulty,
            answer: t.answer, correct: t.correct, seconds: t.seconds, adapted: t.adapted,
          })),
        ]),
        'session_items',
      ),
      ok(admin.from('gaps').update({ stage: 'practising', first_practised_at: finishedAt }).eq('id', firstAdding.id), 'gap to practising'),
      ok(
        admin.from('format_trials').insert({ child_id: aminaId, topic_family: FORMAT_FAMILY, format: 'diagram', score: SESSION_DONE.trialScore, session_id: session.id }),
        'format trial',
      ),
      ok(admin.from('activity_log').insert({ school_id: schoolId, class_id: classId, child_id: aminaId, at: finishedAt, text: SESSION_LOG, tool: 'update_learner_profile' }), 'session log'),
    ])
  }
}

/** Draft Long view patterns (Mathematics) for Amina and Naledi, saved the way `save_long_view` saves them, and the teacher's Needs you items. */
async function seedLongView(c: MarkedCtx): Promise<void> {
  const { admin, schoolId, teacherId } = c
  const ctx: ToolContext = { db: admin, schoolId, eventId: null, env: {} as ToolContext['env'], now: () => c.now }
  for (const name of PATTERN_LEARNERS) {
    const id = c.childId[name]!
    const { history, noteLabels } = await loadHistory(ctx, id)
    // Mathematics only: a learner's patterns in the other subjects (the made-up English and Natural Sciences records) are found and
    // worded when someone updates the Long view, and go to the teacher of that subject.
    const candidates = history.candidates.filter((cand) => cand.subject === 'Mathematics')
    const words = wordPatterns(candidates, history.notes)
    if (words.length === 0) continue
    const byKey = new Map(candidates.map((cand) => [cand.key, cand]))
    await ok(
      admin.from('long_view_patterns').insert(
        words.map((w) => {
          const cand = byKey.get(w.key)!
          const notes = w.noteIds.map((noteId) => ({ kind: 'note' as const, id: noteId, label: noteLabels.get(noteId)! }))
          return {
            child_id: id, kind: cand.kind, family: cand.family, title: w.title, statement: w.statement,
            terms: json(storedTerms(cand)), evidence: json([...cand.evidence, ...notes]), status: 'draft', active: true,
          }
        }),
      ),
      `long view patterns for ${name}`,
    )
    await ok(
      admin.from('needs_you_items').insert({
        owner_id: teacherId, school_id: schoolId, child_id: id, kind: 'review_long_view', ref_id: id, status: 'open',
        title: `Look at ${history.child.firstName}'s Long view`,
        detail: `${words.length} ${words.length === 1 ? 'pattern' : 'patterns'} to check before anything is shared.`,
      }),
      `long view needs you for ${name}`,
    )
  }
}

/**
 * Makes a new sandbox at `opts.stage` (default `start`). `opts.loadSheet` gives the sample test sheets to a runtime that has
 * no files on disk (a Worker): see `ensureSampleFiles`.
 */
export async function createSandbox(admin: JemmaDb, opts: { stage?: SandboxStage; kind?: SandboxKind; loadSheet?: LoadSheet } = {}): Promise<Sandbox> {
  return build(admin, crypto.randomUUID(), opts.stage ?? 'start', opts.kind ?? 'hillview', opts.loadSheet)
}

/** Throws the sandbox's school and users away and builds it again, same sandbox id, at the stage and of the kind it was made with. */
export async function resetSandbox(admin: JemmaDb, sandboxId: string, opts: { loadSheet?: LoadSheet } = {}): Promise<void> {
  const old = await readSandbox(admin, sandboxId)
  await teardown(admin, old.schoolId, old.userIds)
  await build(admin, sandboxId, (old.stage as SandboxStage) ?? 'start', old.kind, opts.loadSheet)
}

// Taking a sandbox away, and the sweep of old ones, live in teardown.ts so the agent worker can use them without the fixtures.
export { deleteSandbox, sweepOldSandboxes } from './teardown'
