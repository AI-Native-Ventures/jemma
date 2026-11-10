// Per-judge demo sandboxes: a made-up school with its own users, at one of three stages.
// Server only: needs the service role client.
import type { Json, JemmaDb } from '../../packages/profiling/src/db'
import type { ToolContext } from '../../packages/profiling/src/tools/context'
import { loadHistory } from '../../packages/profiling/src/tools/read/get-learner-history'
import { storedTerms } from '../../packages/profiling/src/tools/save/save-long-view'
import { LessonSchema, ReteachSchema, GuidanceSchema, TopicMapDraftSchema, AnswerKeyItemSchema } from '../../packages/profiling/src/schemas'
import { classTest1Results, classTest1Roster, classTest1Scores, classTest1ScoresBeforeFix, classTest1Wrong, siphoQ7BeforeFix } from './fixtures/class-test-1'
import { AMINA_ACTIVITIES, AWAY_DAY_INDEX, CAST, CHILD_PIN, CLASS, NOTES, SCHOOL, lastSchoolDays } from './fixtures/cast'
import { FIXED_GAPS, FORMAT_FAMILY, FORMAT_TRIALS, TERM3_ROWS } from './fixtures/history'
import { longHistory } from './fixtures/long-history'
import { PATTERN_LEARNERS, wordPatterns } from './fixtures/long-view-wording'
import {
  AMINA_LESSON, AMINA_LOG, CLASS_LOG, CURRICULUM_DOCS, HOMEWORK_NEEDS, SIPHO_NEEDS, WEEK_PLAN, PARENT_NOTES, TEACHER_NOTES, HOMEWORK_ROWS, LESSON_TOPIC, RETEACH, RETEACH_EXPLANATION, RETEACH_MISSING_BASIC, RETEACH_TOPIC, RETEACH_WHY,
  SESSION_DONE, SESSION_LOG, SESSION_TRY, SESSION_WARMUP, TEST_TITLE, TERMS, answerKeyItems, guidanceCard, topicMapDraft,
} from './fixtures/marked-state'
import { SAMPLE_FILES, answerCrop, ensureSampleFiles } from './fixtures/sample-papers'

export type SandboxStage = 'start' | 'marked' | 'session_done'

export type Sandbox = {
  sandboxId: string
  schoolId: string
  classId: string
  joinCode: string
  childLoginCode: string
  childPin: '1234'
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

type Logins = Record<'teacher' | 'parent' | 'learner', { userId: string; email: string; password: string }> & {
  learner: { code: string; pin: string }
}

/** Builds one sandbox. Throws after cleaning up what it made. */
async function build(admin: JemmaDb, sandboxId: string, stage: SandboxStage): Promise<Sandbox> {
  const now = new Date()
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

    // Auth users: teacher, parent, learner (Amina signs in with her code and PIN).
    const tag = randomHex(4)
    const joinCode = randomCode()
    const childLoginCode = randomCode()
    const mkUser = async (email: string, password: string) => {
      const r = await admin.auth.admin.createUser({ email, password, email_confirm: true })
      if (r.error || !r.data.user) throw new Error(`demo seed: create user ${email}: ${r.error?.message}`)
      created.userIds.push(r.data.user.id)
      return r.data.user.id
    }
    const teacherPassword = randomHex(16)
    const parentPassword = randomHex(16)
    const learnerEmail = `${childLoginCode.toLowerCase()}@kids.jemma.invalid`
    const learnerPassword = await childPassword(childLoginCode, CHILD_PIN)
    const teacherEmail = `${CAST.teacher.emailLocal}.${tag}@demo.jemma.invalid`
    const parentEmail = `${CAST.parent.emailLocal}.${tag}@demo.jemma.invalid`
    const [teacherId, parentId, learnerId] = await Promise.all([
      mkUser(teacherEmail, teacherPassword),
      mkUser(parentEmail, parentPassword),
      mkUser(learnerEmail, learnerPassword),
    ])
    await ok(
      admin.from('profiles').insert([
        { user_id: teacherId, role: 'teacher', display_name: CAST.teacher.displayName, school_id: schoolId },
        { user_id: parentId, role: 'parent', display_name: CAST.parent.displayName, school_id: null },
        { user_id: learnerId, role: 'learner', display_name: 'Amina', school_id: schoolId },
      ]),
      'profiles',
    )

    const cls = await ok(
      admin
        .from('classes')
        .insert({
          school_id: schoolId, teacher_id: teacherId, name: CLASS.name, grade: CLASS.grade,
          year: now.getUTCFullYear(), subject: CLASS.subject, join_code: joinCode,
        })
        .select('id')
        .single(),
      'class',
    )
    const classId = cls.id

    const kids = await ok(
      admin
        .from('children')
        .insert(
          CAST.children.map((name, i) => ({
            school_id: schoolId, first_name: name, grade: CLASS.grade,
            // A bulk insert shares one timestamp; spread it so the class list keeps the cast order.
            created_at: new Date(now.getTime() - (CAST.children.length - i) * 1000).toISOString(),
            user_id: name === 'Amina' ? learnerId : null,
            parent_first_name: name === 'Amina' ? CAST.parent.firstName : null,
            parent_relation: name === 'Amina' ? CAST.parent.relation : null,
          })),
        )
        .select('id, first_name'),
      'children',
    )
    const childId = Object.fromEntries(kids.map((k) => [k.first_name.toLowerCase(), k.id])) as Record<string, string>
    const aminaId = childId.amina!

    const logins: Logins = {
      teacher: { userId: teacherId, email: teacherEmail, password: teacherPassword },
      parent: { userId: parentId, email: parentEmail, password: parentPassword },
      learner: { userId: learnerId, email: learnerEmail, password: learnerPassword, code: childLoginCode, pin: CHILD_PIN },
    }
    await ok(
      admin.from('demo_sandboxes').insert({ id: sandboxId, school_id: schoolId, logins: json(logins), stage }),
      'demo_sandboxes',
    )

    // ---- Stage start ----
    const days = lastSchoolDays(now)
    const term3PaperAt = '2026-09-25T12:00:00.000Z'
    const startWork = [
      ok(admin.from('child_logins').insert({ code: childLoginCode, child_id: aminaId, user_id: learnerId, pin_set_by: parentId }), 'child_logins'),
      ok(admin.from('enrolments').insert(kids.map((k) => ({ class_id: classId, child_id: k.id }))), 'enrolments'),
      ok(
        admin.from('attendance').insert(
          kids.flatMap((k) =>
            days.map((day, i) => ({
              child_id: k.id, day,
              status: (AWAY_DAY_INDEX[k.first_name] ?? []).includes(i) ? ('away' as const) : ('here' as const),
            })),
          ),
        ),
        'attendance',
      ),
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
      // The Long view: three school years of made-up records, in their own table (every stage has them).
      ok(
        admin.from('learner_records').insert(
          longHistory(now.getUTCFullYear(), CAST.teacher.displayName).map(({ child, ...row }) => ({ ...row, school_id: schoolId, child_id: childId[child]! })),
        ),
        'learner_records',
      ),
      ensureSampleFiles(admin),
    ]
    await Promise.all(startWork)

    if (stage !== 'start') {
      await buildMarked({ admin, now, at, schoolId, classId, teacherId, parentId, childId, aminaId, withSession: stage === 'session_done' })
    }

    return { sandboxId, schoolId, classId, joinCode, childLoginCode, childPin: CHILD_PIN }
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
  const test = await ok(
    admin
      .from('tests')
      .insert({ class_id: classId, title: TEST_TITLE, written_on: c.now.toISOString().slice(0, 10), out_of: 10, topic_ids: mapTopics.map(tid) })
      .select('id')
      .single(),
    'test',
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

/** Draft Long view patterns for Amina and Naledi, saved the way `save_long_view` saves them, and the teacher's Needs you items. */
async function seedLongView(c: MarkedCtx): Promise<void> {
  const { admin, schoolId, teacherId } = c
  const ctx: ToolContext = { db: admin, schoolId, eventId: null, env: {} as ToolContext['env'], now: () => c.now }
  for (const name of PATTERN_LEARNERS) {
    const id = c.childId[name]!
    const { history, noteLabels } = await loadHistory(ctx, id)
    const words = wordPatterns(history.candidates, history.notes)
    if (words.length === 0) continue
    const byKey = new Map(history.candidates.map((cand) => [cand.key, cand]))
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

const STORAGE_BUCKETS = ['papers', 'curriculum', 'lesson-audio']

async function removeFolder(admin: JemmaDb, bucket: string, prefix: string): Promise<void> {
  const listed = await admin.storage.from(bucket).list(prefix, { limit: 1000 })
  if (listed.error || !listed.data?.length) return
  const files: string[] = []
  const folders: string[] = []
  for (const entry of listed.data) (entry.id ? files : folders).push(`${prefix}/${entry.name}`)
  await Promise.all([
    files.length ? admin.storage.from(bucket).remove(files) : Promise.resolve(),
    ...folders.map((f) => removeFolder(admin, bucket, f)),
  ])
}

/** Cancels running events, deletes the school (cascade), then its auth users and stored files. */
async function teardown(admin: JemmaDb, schoolId: string | null, userIds: string[]): Promise<void> {
  if (schoolId) {
    await admin.from('events').update({ status: 'cancelled', finished_at: new Date().toISOString() }).eq('school_id', schoolId).in('status', ['queued', 'running'])
    await admin.from('schools').delete().eq('id', schoolId)
    await Promise.all(STORAGE_BUCKETS.map((b) => removeFolder(admin, b, schoolId).catch(() => undefined)))
  }
  await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)))
}

async function readSandbox(admin: JemmaDb, sandboxId: string) {
  const row = await okMaybe(admin.from('demo_sandboxes').select('school_id, logins, stage').eq('id', sandboxId).maybeSingle(), 'read sandbox')
  if (!row) throw new Error(`demo seed: no sandbox ${sandboxId}`)
  const logins = row.logins as Partial<Logins>
  const userIds = [logins.teacher?.userId, logins.parent?.userId, logins.learner?.userId].filter((v): v is string => !!v)
  return { schoolId: row.school_id, userIds, stage: (row.stage as SandboxStage) ?? 'start' }
}

/** Makes a new sandbox at `opts.stage` (default `start`). */
export async function createSandbox(admin: JemmaDb, opts: { stage?: SandboxStage } = {}): Promise<Sandbox> {
  return build(admin, crypto.randomUUID(), opts.stage ?? 'start')
}

/** Throws the sandbox's school and users away and builds it again, same sandbox id, at the stage it was made with. */
export async function resetSandbox(admin: JemmaDb, sandboxId: string): Promise<void> {
  const old = await readSandbox(admin, sandboxId)
  await teardown(admin, old.schoolId, old.userIds)
  await build(admin, sandboxId, old.stage)
}

/** Removes a sandbox for good (tests and housekeeping). */
export async function deleteSandbox(admin: JemmaDb, sandboxId: string): Promise<void> {
  const old = await readSandbox(admin, sandboxId)
  await teardown(admin, old.schoolId, old.userIds)
}
