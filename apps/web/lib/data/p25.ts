import { whatHelps } from '@jemma/profiling/logic'
import type { Format } from '@jemma/profiling/logic'
import { createSupabaseServer } from '../supabase/server'
import { loadShortLabels } from '../topics'

type Db = Awaited<ReturnType<typeof createSupabaseServer>>

export const FORMAT_LABEL: Record<Format, string> = { reading: 'Reading cards', diagram: 'Diagram', audio: 'Audio memo' }

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** A `YYYY-MM-DD` date as a UTC date, so the weekday never shifts with the server's time zone. */
const dayOf = (iso: string) => new Date(`${iso}T00:00:00Z`)
export const weekdayShort = (iso: string) => WEEKDAYS[dayOf(iso).getUTCDay()]!
export const weekdayLong = (iso: string) => WEEKDAYS_LONG[dayOf(iso).getUTCDay()]!
export const dayNumber = (iso: string) => dayOf(iso).getUTCDate()
/** "Thu 29 Oct" */
export const dayLabel = (iso: string) => `${weekdayShort(iso)} ${dayNumber(iso)} ${MONTHS[dayOf(iso).getUTCMonth()]}`

/** The topic as the boards write it in lists: "Adding fractions with different denominators" is "Adding fractions". */
/** "Decimal comma": 4.2 is "4,2". */
export const decimalComma = (n: number) => n.toFixed(1).replace('.', ',')

/** The topic family the "what helps" numbers are about: tonight's topic, else the child's latest trial, else nothing to name ("these"). */
export function helpsFamily(opts: { topicFamily?: string | null; latestTrialFamily?: string | null }): string {
  return opts.topicFamily || opts.latestTrialFamily || 'these'
}

export type PlannedSession = {
  id: string
  plannedFor: string
  topicId: string | null
  topicName: string
  shortName: string
  format: Format
  minutes: number
  questions: number | null
  hasLesson: boolean
  status: 'planned' | 'in_progress'
  /** Short session (under 8 minutes): the boards call it a quick check. */
  quickCheck: boolean
}

export type Tonight = PlannedSession & {
  /** What the lesson shows, in the headline: "fraction bars", "reading cards", "an audio memo". */
  withPhrase: string
}

function withPhrase(format: Format, lessonContent: unknown): string {
  if (format === 'reading') return 'reading cards'
  if (format === 'audio') return 'an audio memo'
  const content = lessonContent as { diagram?: { steps?: { diagram?: { kind?: string } }[] } } | null
  return content?.diagram?.steps?.[0]?.diagram?.kind === 'fraction_bar' ? 'fraction bars' : 'a diagram'
}

export type LearnData = {
  childFirstName: string
  tonight: (Tonight & { whyTonight: { label: string; href: string } | null }) | null
  week: PlannedSession[]
  helps: { family: string; rows: { format: Format; status: 'too_early' | 'measured'; average: number; sessions: number }[] }
}

async function plannedSessions(db: Db, childId: string): Promise<(PlannedSession & { lessonId: string | null })[]> {
  const { data, error } = await db
    .from('sessions')
    .select('id, planned_for, topic_id, topic_name, format, planned_minutes, question_count, lesson_id, status')
    .eq('child_id', childId)
    .in('status', ['planned', 'in_progress'])
    .order('planned_for', { ascending: true })
  if (error) throw new Error(`p25: ${error.message}`)
  const short = await loadShortLabels(db)
  return data.map((s) => {
    const minutes = s.planned_minutes ?? 0
    const topicName = s.topic_name ?? ''
    const quickCheck = minutes > 0 && minutes < 8
    return {
      id: s.id,
      plannedFor: s.planned_for,
      topicId: s.topic_id,
      topicName,
      shortName: short(topicName),
      format: (s.format ?? 'reading') as Format,
      minutes,
      questions: s.question_count,
      hasLesson: s.lesson_id !== null,
      lessonId: s.lesson_id,
      status: s.status as 'planned' | 'in_progress',
      quickCheck,
    }
  })
}

/** Parent-side link to the test questions the topic came from, for example "Class Test 1, questions 1, 2 and 4". */
async function whyTonight(db: Db, childId: string, topicId: string | null, topicName: string, childHref: string) {
  const { data } = await db
    .from('question_results')
    .select('n, topic_id, gap_topic_id, topic_name, created_at, papers!inner(kind, test_id)')
    .eq('child_id', childId)
    .eq('correct', false)
    .order('created_at', { ascending: false })
  const rows = (data ?? []).filter(
    (r) =>
      r.papers?.kind === 'test' &&
      r.papers.test_id &&
      (topicId ? r.topic_id === topicId || r.gap_topic_id === topicId : r.topic_name === topicName),
  )
  const first = rows[0]
  if (!first?.papers?.test_id) return null
  const testId = first.papers.test_id
  const { data: test } = await db.from('tests').select('title').eq('id', testId).maybeSingle()
  if (!test) return null
  const ns = rows
    .filter((r) => r.papers?.test_id === testId)
    .map((r) => r.n)
    .sort((a, b) => a - b)
  const list = ns.length > 1 ? `${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}` : String(ns[0])
  const key = topicId ?? encodeURIComponent(topicName)
  return {
    label: `${test.title.split(':')[0]}, question${ns.length > 1 ? 's' : ''} ${list}`,
    href: `${childHref}/topics/${key}`,
  }
}

export async function loadLearn(childId: string): Promise<LearnData> {
  const db = await createSupabaseServer()
  const [{ data: child }, sessions] = await Promise.all([
    db.from('children').select('first_name').eq('id', childId).single(),
    plannedSessions(db, childId),
  ])
  const first = sessions[0] ?? null

  let tonight: LearnData['tonight'] = null
  let topicFamily: string | null = null
  if (first) {
    const [lesson, topic, why] = await Promise.all([
      first.lessonId ? db.from('lessons').select('content').eq('id', first.lessonId).single() : Promise.resolve({ data: null }),
      first.topicId ? db.from('topics').select('family').eq('id', first.topicId).maybeSingle() : Promise.resolve({ data: null }),
      whyTonight(db, childId, first.topicId, first.topicName, `/p/${childId}`),
    ])
    topicFamily = topic.data?.family ?? null
    tonight = { ...first, withPhrase: withPhrase(first.format, lesson.data?.content ?? null), whyTonight: why }
  }

  const { data: latest } = topicFamily
    ? { data: null }
    : await db.from('format_trials').select('topic_family').eq('child_id', childId).order('created_at', { ascending: false }).limit(1).maybeSingle()
  const family = helpsFamily({ topicFamily, latestTrialFamily: latest?.topic_family })
  const { data: trials } = await db.from('format_trials').select('format, score').eq('child_id', childId).eq('topic_family', family)
  const helps = whatHelps((trials ?? []).map((t) => ({ format: t.format as Format, score: t.score })))
  const rows = (['diagram', 'reading', 'audio'] as const).map((format) => {
    const h = helps[format]
    return {
      format,
      status: h.status,
      average: h.status === 'measured' ? h.average : 0,
      sessions: h.sessions,
    }
  })

  return { childFirstName: child?.first_name ?? '', tonight, week: sessions, helps: { family, rows } }
}

export type HandoverData = { childFirstName: string; parentInitials: string; tonight: Tonight }

export async function loadHandover(childId: string, parentName: string): Promise<HandoverData | null> {
  const db = await createSupabaseServer()
  const [{ data: child }, sessions] = await Promise.all([
    db.from('children').select('first_name').eq('id', childId).single(),
    plannedSessions(db, childId),
  ])
  const first = sessions.find((s) => s.hasLesson) ?? null
  if (!first || !child) return null
  const { data: lesson } = await db.from('lessons').select('content').eq('id', first.lessonId!).single()
  const initials = parentName
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .join('')
    .slice(0, 2)
  return {
    childFirstName: child.first_name,
    parentInitials: initials || 'P',
    tonight: { ...first, withPhrase: withPhrase(first.format, lesson?.content ?? null) },
  }
}

const NAMES: Record<number, string> = { 2: 'halves', 3: 'thirds', 4: 'quarters', 5: 'fifths', 6: 'sixths', 8: 'eighths', 10: 'tenths' }
const denominatorName = (d: number) => NAMES[d] ?? `${d}ths`
const sentenceList = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : (xs[0] ?? ''))

const denominators = (prompt: string) => [...prompt.matchAll(/\d+\/(\d+)/g)].map((m) => Number(m[1]))

export type SessionItemView = {
  position: number
  prompt: string
  wrote: string
  right: string
  correct: boolean
  seconds: number
  adapted: 'easier' | 'harder' | null
  /** Right answers in a row just before this question. */
  rightRun: number
}

export type SessionResult = {
  childFirstName: string
  finishedAt: string | null
  headline: string
  right: number
  total: number
  minutes: number
  format: Format
  topicName: string
  shortName: string
  stage: 'new' | 'practising' | 'fixed'
  warmup: { right: number; total: number }
  items: SessionItemView[]
  /** The next planned session for the same topic. */
  next: { plannedFor: string; quickCheck: boolean; questions: number | null; weak: string[] } | null
  nextCheckDay: string | null
}

/**
 * Headline: what she got is the smaller bottom of each question she got right,
 * what trips her up is the bigger bottom of each question she missed.
 */
function headline(name: string, items: SessionItemView[]): { text: string; weak: string[] } {
  const strong = [...new Set(items.filter((i) => i.correct).flatMap((i) => Math.min(...denominators(i.prompt))))].filter(Number.isFinite)
  const weak = [...new Set(items.filter((i) => !i.correct).flatMap((i) => Math.max(...denominators(i.prompt))))].filter(Number.isFinite)
  const strongNames = strong.sort((a, b) => a - b).map(denominatorName)
  const weakNames = weak.sort((a, b) => a - b).map(denominatorName)
  if (weakNames.length === 0) return { text: `${name} got every question right.`, weak: [] }
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  const tail = `${cap(sentenceList(weakNames))} still ${weakNames.length > 1 ? 'trip' : 'trips'} her up.`
  return { text: strongNames.length ? `${name} got ${sentenceList(strongNames)}. ${tail}` : tail, weak: weakNames }
}

export async function loadSessionResult(childId: string, sessionId: string): Promise<SessionResult | null> {
  const db = await createSupabaseServer()
  const { data: s } = await db
    .from('sessions')
    .select('id, child_id, status, right, minutes, finished_at, format, topic_id, topic_name, planned_for, children(first_name)')
    .eq('id', sessionId)
    .eq('child_id', childId)
    .maybeSingle()
  if (!s || s.status !== 'done') return null

  const [{ data: rows }, { data: gap }, upcoming] = await Promise.all([
    db.from('session_items').select('position, phase, question, answer, correct, seconds, adapted').eq('session_id', sessionId),
    db.from('gaps').select('stage').eq('child_id', childId).eq('topic_name', s.topic_name ?? '').maybeSingle(),
    plannedSessions(db, childId),
  ])
  const all = rows ?? []
  const tries = all.filter((r) => r.phase === 'try').sort((a, b) => a.position - b.position)
  const warm = all.filter((r) => r.phase === 'warmup')

  let run = 0
  const items: SessionItemView[] = tries.map((r) => {
    const q = r.question as { prompt: string; answer: string }
    const view: SessionItemView = {
      position: r.position,
      prompt: q.prompt,
      wrote: r.answer,
      right: q.answer,
      correct: r.correct,
      seconds: r.seconds,
      adapted: r.adapted as 'easier' | 'harder' | null,
      rightRun: run,
    }
    run = r.correct ? run + 1 : 0
    return view
  })

  const name = s.children?.first_name ?? ''
  const head = headline(name, items)
  const nextSame = upcoming.find((u) => u.topicName === s.topic_name && u.plannedFor > s.planned_for) ?? null

  return {
    childFirstName: name,
    finishedAt: s.finished_at,
    headline: head.text,
    right: s.right ?? tries.filter((r) => r.correct).length,
    total: tries.length,
    minutes: s.minutes ?? 0,
    format: (s.format ?? 'reading') as Format,
    topicName: s.topic_name ?? '',
    shortName: (await loadShortLabels(db))(s.topic_name ?? ''),
    stage: gap?.stage ?? 'new',
    warmup: { right: warm.filter((r) => r.correct).length, total: warm.length },
    items,
    next: nextSame
      ? { plannedFor: nextSame.plannedFor, quickCheck: nextSame.quickCheck, questions: nextSame.questions, weak: head.weak }
      : null,
    nextCheckDay: nextSame ? weekdayLong(nextSame.plannedFor) : null,
  }
}

/** "Mon 26 Oct, 19:12" in the school's time zone. */
export function sessionStamp(iso: string | null): string {
  if (!iso) return ''
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Johannesburg',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso))
  const p = (t: string) => parts.find((x) => x.type === t)?.value ?? ''
  return `${p('weekday')} ${p('day')} ${p('month')}, ${p('hour')}:${p('minute')}`
}

export const mmss = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

// ---- Handover cookie: lives in lib/handover.ts, re-exported for existing imports.
export { HANDOVER_COOKIE, HANDOVER_TTL_SECONDS, signHandover, verifyHandover } from '../handover'
