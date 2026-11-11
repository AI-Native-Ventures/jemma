import { cache } from 'react'
import type { Tables } from '@jemma/profiling/db'
import { whatHelps } from '@jemma/profiling/logic'
import { createSupabaseAdmin } from '../supabase/admin'
import { createSupabaseServer } from '../supabase/server'

/** Parent evidence screens: topic detail, marked paper, flag a mark, tests list, notifications. */

const TZ = 'Africa/Johannesburg'

/** "Mon 26 Oct". */
export function fmtDay(iso: string | Date): string {
  const d = new Date(iso)
  const part = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...o }).format(d)
  return `${part({ weekday: 'short' })} ${part({ day: 'numeric' })} ${part({ month: 'short' })}`
}

/** "14:12". */
export function fmtTime(iso: string | Date): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
}

const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d)
const weekdayLong = (d: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'long' }).format(d)
const hourOf = (d: Date) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(d))

/** South African school terms by month. */
export function termOf(iso: string): number {
  const m = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, month: 'numeric' }).format(new Date(iso)))
  return m <= 3 ? 1 : m <= 6 ? 2 : m <= 9 ? 3 : 4
}

const lowerFirst = (s: string) => (s ? s[0]!.toLowerCase() + s.slice(1) : s)

export type ChildBasics = {
  id: string
  firstName: string
  grade: number
  schoolName: string
  /** The subject of the child's class, or the subjects of their classes joined with "and". A paper or a topic carries the subject of its own class. */
  subject: string
  /** Every subject the child has a class in, oldest class first. */
  subjects: string[]
  teacherName: string
}

export type ClassFacts = { classId: string; createdAt: string; subject: string; teacherId: string }

/** What the child's classes say: the subjects (oldest class first, each once), and the oldest class's teacher. One class gives its own subject and teacher. */
export function summariseClasses(rows: ClassFacts[]): { subjects: string[]; subject: string; teacherId: string | null; oldestClassId: string | null } {
  const sorted = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const subjects = [...new Set(sorted.map((r) => r.subject))]
  return { subjects, subject: subjects.join(' and '), teacherId: sorted[0]?.teacherId ?? null, oldestClassId: sorted[0]?.classId ?? null }
}

/** A test row names the subject of its own class when the child has more than one subject. With one subject the lines stay as they were. */
export function testRowLines(lines: string[], subject: string | null, subjectCount: number): string[] {
  if (!subject || subjectCount < 2 || lines.length === 0) return lines
  return [`${subject} · ${lines[0]}`, ...lines.slice(1)]
}

/** The child, the school and the class teacher. The teacher's name needs the service client: parents cannot read profiles. */
export const getChildBasics = cache(async (childId: string): Promise<ChildBasics | null> => {
  const supabase = await createSupabaseServer()
  const { data: child } = await supabase
    .from('children')
    .select('id, first_name, grade, schools(name)')
    .eq('id', childId)
    .maybeSingle()
  if (!child) return null
  const { data: enrol } = await supabase.from('enrolments').select('class_id, classes(subject, teacher_id, created_at)').eq('child_id', childId)
  const mine = summariseClasses(
    (enrol ?? []).flatMap((e) => (e.classes ? [{ classId: e.class_id, createdAt: e.classes.created_at, subject: e.classes.subject, teacherId: e.classes.teacher_id }] : [])),
  )
  let teacherName = 'your teacher'
  if (mine.teacherId) {
    const { data: teacher } = await createSupabaseAdmin().from('profiles').select('display_name').eq('user_id', mine.teacherId).maybeSingle()
    if (teacher) teacherName = teacher.display_name
  }
  return {
    id: child.id,
    firstName: child.first_name,
    grade: child.grade,
    schoolName: child.schools?.name ?? '',
    subject: mine.subject,
    subjects: mine.subjects,
    teacherName,
  }
})

export type ResultRow = {
  id: string
  paperId: string
  n: number
  prompt: string
  answer: string
  correct: boolean
  topicName: string
  misconception: string | null
  /** The memo's answer, only filled for questions the child missed. */
  rightAnswer: string | null
}

type KeyItem = { n: number; answer: string }

/** Memo answers for a test. Answer keys are teacher-only under RLS, so this reads with the service client and the caller exposes only missed questions. */
async function answerKey(testId: string | null): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  if (!testId) return out
  const { data } = await createSupabaseAdmin().from('answer_keys').select('items').eq('test_id', testId).maybeSingle()
  for (const item of (data?.items as KeyItem[] | undefined) ?? []) out.set(item.n, item.answer)
  return out
}

type TestMeta = { title: string; outOf: number; topicIds: string[]; /** The subject of the class the test was written in. */ subject: string | null }

/** Test title, size and subject, read through RLS (parents see their child's class tests). */
async function testMeta(testId: string | null): Promise<TestMeta | null> {
  if (!testId) return null
  const supabase = await createSupabaseServer()
  const { data } = await supabase.from('tests').select('title, out_of, topic_ids, classes(subject)').eq('id', testId).maybeSingle()
  return data ? { title: data.title, outOf: data.out_of, topicIds: data.topic_ids, subject: data.classes?.subject ?? null } : null
}

function toResult(r: Tables<'question_results'>, key: Map<number, string>): ResultRow {
  return {
    id: r.id,
    paperId: r.paper_id,
    n: r.n,
    prompt: r.prompt,
    answer: r.answer_read,
    correct: r.correct,
    topicName: r.topic_name,
    misconception: r.misconception,
    rightAnswer: r.correct ? null : (key.get(r.n) ?? null),
  }
}

/** "Class Test 1: Fractions and decimals" -> "Class Test 1". */
const shortTitle = (title: string) => title.split(':')[0]!.trim()

// ---------------------------------------------------------------- topic

const DIAGRAM_NAMES: Record<string, string> = {
  fraction_bar: 'fraction bars',
  number_line: 'number line',
  area_model: 'area model',
  place_value: 'place value',
  bar_chart: 'bar chart',
  shape_2d: 'shapes',
  grid_area: 'grid',
}
const FORMAT_LABELS = { diagram: 'Diagram', reading: 'Reading cards', audio: 'Audio memo' } as const
const FORMAT_ORDER = ['diagram', 'reading', 'audio'] as const

type LessonContent = {
  minutes?: number
  cards?: { diagram?: { kind: string } }[]
  diagram?: { steps?: { diagram?: { kind: string } }[] }
}

function lessonName(format: Tables<'lessons'>['format'] | null, content: LessonContent | null): string {
  if (format === 'audio') return 'audio memo'
  if (format === 'reading') return 'reading cards'
  const kind = content?.diagram?.steps?.[0]?.diagram?.kind ?? content?.cards?.find((c) => c.diagram)?.diagram?.kind
  return (kind && DIAGRAM_NAMES[kind]) || 'diagram'
}

export type TopicDetail = {
  child: ChildBasics
  topicName: string
  stage: Tables<'gaps'>['stage']
  /** The slip, as a sentence about the child. Null when no result names one. */
  slip: string | null
  missed: ResultRow[]
  /** Short test name and day, for example "Class Test 1 · 26 Oct". */
  missedSource: string | null
  firstPaperId: string | null
  sessions: { id: string; label: string; detail: string; done: boolean; started: boolean }[]
  helps: { format: (typeof FORMAT_ORDER)[number]; label: string; done: number; need: number }[]
  tooEarly: boolean
  bestFormat: string | null
}

const dayWord = (plannedFor: string, now: Date) => {
  const days = Math.round((new Date(`${plannedFor}T12:00:00Z`).getTime() - new Date(`${dayKey(now)}T12:00:00Z`).getTime()) / 86_400_000)
  if (days === 0) return 'Tonight'
  if (days === 1) return 'Tomorrow'
  return weekdayLong(new Date(`${plannedFor}T12:00:00Z`))
}

/** The topic page for one gap. `gapId` is the topicKey in the route. */
export async function getTopicDetail(childId: string, gapId: string): Promise<TopicDetail | null> {
  const child = await getChildBasics(childId)
  if (!child) return null
  const supabase = await createSupabaseServer()
  const { data: gap } = await supabase.from('gaps').select('*').eq('id', gapId).eq('child_id', childId).maybeSingle()
  if (!gap) return null

  const { data: evidence } = gap.evidence.length
    ? await supabase.from('question_results').select('*').in('id', gap.evidence).order('n')
    : { data: [] as Tables<'question_results'>[] }
  const rows = evidence ?? []
  const paperIds = [...new Set(rows.map((r) => r.paper_id))]
  const { data: papers } = paperIds.length
    ? await supabase.from('papers').select('id, test_id, kind, created_at').in('id', paperIds)
    : { data: [] as Pick<Tables<'papers'>, 'id' | 'test_id' | 'kind' | 'created_at'>[] }
  const testPaper = (papers ?? []).filter((p) => p.kind === 'test' && p.test_id).sort((a, b) => a.created_at.localeCompare(b.created_at))[0]
  const missedRows = rows.filter((r) => !r.correct && r.paper_id === testPaper?.id)
  const key = await answerKey(testPaper?.test_id ?? null)
  const missed = missedRows.map((r) => toResult(r, key))
  const meta = await testMeta(testPaper?.test_id ?? null)

  const slipText = missed.find((r) => r.misconception)?.misconception ?? null
  const withSlip = missed.filter((r) => r.misconception === slipText).length
  const slip = slipText
    ? `${child.firstName} ${lowerFirst(slipText)}. ${withSlip === missed.length ? 'She did it in all' : `She did it in ${withSlip} of`} ${missed.length} questions that needed it.`
    : null

  const { data: sessionRows } = await supabase
    .from('sessions')
    .select('id, lesson_id, status, planned_for, format, planned_minutes, topic_name')
    .eq('child_id', childId)
    .eq('topic_name', gap.topic_name)
    .order('planned_for')
  const sessions = sessionRows ?? []
  const lessonIds = sessions.map((s) => s.lesson_id).filter((x): x is string => Boolean(x))
  const { data: lessons } = lessonIds.length
    ? await supabase.from('lessons').select('id, format, content').in('id', lessonIds)
    : { data: [] as Pick<Tables<'lessons'>, 'id' | 'format' | 'content'>[] }
  const now = new Date()
  const sessionCards = sessions.map((s) => {
    const lesson = (lessons ?? []).find((l) => l.id === s.lesson_id)
    const format = lesson?.format ?? s.format
    const content = (lesson?.content ?? null) as LessonContent | null
    const minutes = content?.minutes ?? s.planned_minutes ?? 12
    const state = s.status === 'done' ? 'done' : s.status === 'in_progress' ? 'started' : 'not started'
    return {
      id: s.id,
      label: `${dayWord(s.planned_for, now)} · ${lessonName(format, content)}`,
      detail: `${FORMAT_LABELS[format ?? 'diagram']?.split(' ')[0] ?? 'Diagram'} · ${minutes} minutes · ${state}`,
      done: s.status === 'done',
      started: s.status === 'in_progress',
    }
  })

  // Trials for this topic only: the ones tied to a session on this topic.
  const doneIds = sessions.filter((s) => s.status === 'done').map((s) => s.id)
  const { data: trials } = doneIds.length
    ? await supabase.from('format_trials').select('format, score').in('session_id', doneIds)
    : { data: [] as { format: Tables<'format_trials'>['format']; score: number }[] }
  const helps = whatHelps(trials ?? [])
  const best = FORMAT_ORDER.map((f) => ({ f, h: helps[f] }))
    .filter((x) => x.h.status === 'measured')
    .sort((a, b) => (b.h.status === 'measured' ? b.h.average : 0) - (a.h.status === 'measured' ? a.h.average : 0))[0]

  return {
    child: { ...child, subject: meta?.subject ?? child.subject },
    topicName: gap.topic_name,
    stage: gap.stage,
    slip,
    missed,
    missedSource: testPaper && meta ? `${shortTitle(meta.title)} · ${fmtDay(testPaper.created_at).split(' ').slice(1).join(' ')}` : null,
    firstPaperId: testPaper?.id ?? null,
    sessions: sessionCards,
    helps: FORMAT_ORDER.map((f) => ({ format: f, label: FORMAT_LABELS[f], done: helps[f].sessions, need: 3 })),
    tooEarly: !best,
    bestFormat: best ? FORMAT_LABELS[best.f] : null,
  }
}

// ---------------------------------------------------------------- paper

export type PaperSection = { heading: string; rows: ResultRow[] }

export type PaperDetail = {
  child: ChildBasics
  paperId: string
  title: string
  shortTitle: string
  total: number
  outOf: number
  dayLabel: string
  snappedAt: string
  markedAt: string
  sections: PaperSection[]
  missed: ResultRow[]
  slipLine: string | null
  /** Gap row of the biggest slip, for the "how to help" link. */
  topGap: { id: string; topicName: string } | null
  /** Signed URLs of the photographed pages (papers bucket), 1 hour. */
  photoUrls: string[]
}

const DECIMAL_Q = /\d,\d|decimal/i

/** Splits a printed test into "Section A: Fractions" and "Section B: Decimals" at the first decimal question. */
function sectionsOf(rows: ResultRow[]): PaperSection[] {
  const at = rows.findIndex((r) => DECIMAL_Q.test(r.prompt))
  if (at <= 0) return [{ heading: '', rows }]
  return [
    { heading: 'Section A: Fractions', rows: rows.slice(0, at) },
    { heading: 'Section B: Decimals', rows: rows.slice(at) },
  ]
}

function slipLineOf(missed: ResultRow[]): string | null {
  const slips = new Map<string, Set<string>>()
  for (const r of missed) {
    if (!r.misconception) continue
    const topics = slips.get(r.misconception) ?? new Set<string>()
    topics.add(r.topicName)
    slips.set(r.misconception, topics)
  }
  if (slips.size === 0) return null
  const parts = [...slips].map(([m, topics]) => {
    const text = lowerFirst(m)
    const decimals = [...topics].every((t) => /decimal/i.test(t)) && !/decimal/i.test(text)
    return decimals ? `${text} in decimals` : text
  })
  return `One slip behind all ${missed.length}: she ${parts.join(', and ')}.`
}

/** One marked test paper with its questions, marks and photo URLs. Null when the paper is not the child's marked test. */
export async function getPaperDetail(childId: string, paperId: string): Promise<PaperDetail | null> {
  const child = await getChildBasics(childId)
  if (!child) return null
  const supabase = await createSupabaseServer()
  const { data: paper } = await supabase.from('papers').select('*').eq('id', paperId).eq('child_id', childId).maybeSingle()
  if (!paper || paper.kind !== 'test') return null

  const { data: resultRows } = await supabase.from('question_results').select('*').eq('paper_id', paperId).order('n')
  const key = await answerKey(paper.test_id)
  const results = (resultRows ?? []).map((r) => toResult(r, key))
  const meta = await testMeta(paper.test_id)
  const missed = results.filter((r) => !r.correct)

  const { data: log } = await supabase
    .from('activity_log')
    .select('at')
    .eq('child_id', childId)
    .eq('tool', 'mark_paper')
    .ilike('text', 'Marked%')
    .order('at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const gapIds = [...new Set((resultRows ?? []).filter((r) => !r.correct).map((r) => r.gap_topic_id).filter((x): x is string => Boolean(x)))]
  const { data: gaps } = await supabase.from('gaps').select('id, topic_id, topic_name, evidence').eq('child_id', childId).in('topic_id', gapIds.length ? gapIds : ['00000000-0000-0000-0000-000000000000'])
  const topGap = [...(gaps ?? [])].sort((a, b) => b.evidence.length - a.evidence.length)[0]

  const { data: pages } = await supabase.from('paper_pages').select('storage_path').eq('paper_id', paperId).order('page_no')
  const photoUrls: string[] = []
  for (const p of pages ?? []) {
    const { data: signed } = await supabase.storage.from('papers').createSignedUrl(p.storage_path, 3600)
    if (signed?.signedUrl) photoUrls.push(signed.signedUrl)
  }

  const title = meta?.title ?? 'Test'
  return {
    child: { ...child, subject: meta?.subject ?? child.subject },
    paperId,
    title,
    shortTitle: shortTitle(title),
    total: paper.total ?? results.filter((r) => r.correct).length,
    outOf: meta?.outOf ?? results.length,
    dayLabel: fmtDay(paper.created_at),
    snappedAt: fmtTime(paper.created_at),
    markedAt: fmtTime(log?.at ?? paper.created_at),
    sections: sectionsOf(results),
    missed,
    slipLine: slipLineOf(missed),
    topGap: topGap ? { id: topGap.id, topicName: topGap.topic_name } : null,
    photoUrls,
  }
}

/** Lowercase first word of the topic shared by every missed question, for "Every mark she lost was on adding". */
export function sharedTopicWord(missed: ResultRow[]): string | null {
  const words = new Set(missed.map((r) => r.topicName.split(' ')[0]!.toLowerCase()))
  return words.size === 1 ? [...words][0]! : null
}

// ---------------------------------------------------------------- tests list

export type TestRow = {
  key: string
  tile: string
  title: string
  lines: string[]
  href: string | null
  term: number
}

export type TestsList = {
  child: ChildBasics
  headline: string
  needsYou: { title: string; detail: string; href: string } | null
  terms: { term: number; rows: TestRow[] }[]
  unread: number
}

export async function getTestsList(childId: string, userId: string): Promise<TestsList | null> {
  const child = await getChildBasics(childId)
  if (!child) return null
  const supabase = await createSupabaseServer()
  const { data: papers } = await supabase
    .from('papers')
    .select('*')
    .eq('child_id', childId)
    .in('kind', ['test', 'homework', 'report'])
    .order('created_at', { ascending: false })
  const list = papers ?? []
  const ids = list.map((p) => p.id)
  const { data: rows } = ids.length ? await supabase.from('question_results').select('*').in('paper_id', ids).order('n') : { data: [] as Tables<'question_results'>[] }
  const resultsOf = (id: string) => (rows ?? []).filter((r) => r.paper_id === id)

  const out: TestRow[] = []
  const percents: number[] = []
  for (const p of list) {
    const results = resultsOf(p.id)
    const right = p.total ?? results.filter((r) => r.correct).length
    const meta = await testMeta(p.test_id)
    const term = termOf(p.created_at)
    if (p.kind === 'test' && meta) {
      const wrong = results.filter((r) => !r.correct).map((r) => r.n)
      percents.push(Math.round((right / (meta.outOf || 1)) * 100))
      out.push({
        key: p.id,
        tile: `${right}/${meta.outOf}`,
        title: meta.title,
        lines: testRowLines([`${fmtDay(p.created_at)} · marked by Jemma`, ...(wrong.length ? [`Missed questions ${listNumbers(wrong)}`] : [])], meta.subject, child.subjects.length),
        href: `/p/${childId}/papers/${p.id}`,
        term,
      })
    } else if (p.kind === 'homework') {
      const waiting = p.status === 'needs_you'
      const topic = results[0]?.topic_name
      out.push({
        key: p.id,
        tile: `${right}/${results.length}`,
        title: `Homework${topic ? `: ${topic}` : ''}`,
        lines: [
          `${fmtDay(p.created_at)} · ${p.owner === 'teacher' ? `${child.teacherName}'s mark` : 'Snapped by you'}`,
          waiting ? 'Waiting for your check' : 'Checked',
        ],
        href: `/p/${childId}/snap/${p.id}`,
        term,
      })
    } else {
      // A term report: a test paper with no test behind it, or a report card.
      const pct = results.length ? Math.round((right / results.length) * 100) : right
      percents.push(pct)
      out.push({
        key: p.id,
        tile: `${pct}%`,
        title: `Term ${term} report: ${child.subject}`,
        lines: [p.owner === 'parent' ? `From the report card you snapped on ${fmtDay(p.created_at)}` : `From ${child.teacherName}'s marks on ${fmtDay(p.created_at)}`],
        href: null,
        term,
      })
    }
  }

  const terms = [...new Set(out.map((r) => r.term))].sort((a, b) => b - a).map((term) => ({ term, rows: out.filter((r) => r.term === term) }))

  const { data: need } = await supabase
    .from('needs_you_items')
    .select('title, detail, ref_id, kind')
    .eq('owner_id', userId)
    .eq('child_id', childId)
    .eq('status', 'open')
    .eq('kind', 'confirm_scan')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const lost = new Map<string, number>()
  for (const r of rows ?? []) {
    if (r.correct) continue
    const word = r.topic_name.split(' ')[0]!
    lost.set(word, (lost.get(word) ?? 0) + 1)
  }
  const worst = [...lost].sort((a, b) => b[1] - a[1])[0]?.[0]
  const [latest, previous] = percents
  const trend =
    latest === undefined
      ? 'No marked tests yet.'
      : previous === undefined || Math.abs(latest - previous) <= 5
        ? `Steady at ${latest}%.`
        : latest > previous
          ? `Up to ${latest}%.`
          : `Down to ${latest}%.`
  const headline = worst ? `${trend} ${worst} is where ${child.firstName} loses marks.` : trend

  const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('read_at', null)

  return {
    child,
    headline,
    needsYou: need ? { title: need.title, detail: need.detail, href: `/p/${childId}/snap/${need.ref_id}` } : null,
    terms,
    unread: count ?? 0,
  }
}

/** [1, 2, 4, 8] -> "1, 2, 4 and 8". */
function listNumbers(ns: number[]): string {
  return ns.length < 2 ? ns.join('') : `${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}`
}

// ---------------------------------------------------------------- notifications

export type NotificationRow = {
  id: string
  title: string
  body: string
  href: string
  time: string
  unread: boolean
}

export type NotificationGroup = { label: string; items: NotificationRow[] }

export type NotificationsPage = {
  child: ChildBasics
  headline: string
  groups: NotificationGroup[]
}

function groupLabel(at: Date, now: Date): string {
  const days = Math.round((new Date(`${dayKey(now)}T12:00:00Z`).getTime() - new Date(`${dayKey(at)}T12:00:00Z`).getTime()) / 86_400_000)
  if (days <= 0) return hourOf(at) >= 17 ? 'Tonight' : 'Earlier today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return weekdayLong(at)
  return fmtDay(at)
}

export async function getNotifications(childId: string, userId: string): Promise<NotificationsPage | null> {
  const child = await getChildBasics(childId)
  if (!child) return null
  const supabase = await createSupabaseServer()
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .like('href', `/p/${childId}%`)
    .order('created_at', { ascending: false })
    .limit(50)
  const now = new Date()
  const groups: NotificationGroup[] = []
  for (const n of data ?? []) {
    const at = new Date(n.created_at)
    const label = groupLabel(at, now)
    let group = groups.find((g) => g.label === label)
    if (!group) groups.push((group = { label, items: [] }))
    group.items.push({ id: n.id, title: n.title, body: n.body, href: n.href, time: fmtTime(at), unread: n.read_at === null })
  }

  const dayStart = new Date(`${dayKey(now)}T00:00:00+02:00`).toISOString()
  const { data: finished } = await supabase.from('sessions').select('id').eq('child_id', childId).eq('status', 'done').gte('finished_at', dayStart).limit(1)
  const unread = (data ?? []).filter((n) => n.read_at === null).length
  const headline = finished?.length
    ? `${child.firstName} finished tonight's lesson. Have a look together.`
    : unread > 0
      ? `${unread} new from Jemma.`
      : 'You are up to date with Jemma.'
  return { child, headline, groups }
}

// ---------------------------------------------------------------- flag a mark

export type FlagTarget = {
  child: ChildBasics
  paper: PaperDetail
  result: ResultRow
}

/** The question to flag: `?q=<result id>`, else the first missed question. */
export async function getFlagTarget(childId: string, paperId: string, resultId: string | undefined): Promise<FlagTarget | null> {
  const paper = await getPaperDetail(childId, paperId)
  if (!paper) return null
  const all = paper.sections.flatMap((s) => s.rows)
  const result = all.find((r) => r.id === resultId) ?? paper.missed[0] ?? all[0]
  return result ? { child: paper.child, paper, result } : null
}
