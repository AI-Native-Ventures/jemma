import type { Guidance } from '@jemma/profiling/schemas'
import { GuidanceSchema } from '@jemma/profiling/schemas'
import { slug } from './p18'
import { createSupabaseServer } from '../supabase/server'
import { loadShortLabels } from '../topics'

export type AttStatus = 'here' | 'late' | 'away'
export type ObsKind = 'participation' | 'confidence' | 'effort' | 'behaviour'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Mon 26 Oct" from a YYYY-MM-DD day or a timestamp. */
export function dayLabel(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value.length === 10 ? `${value}T00:00:00Z` : value) : value
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

export const todayIso = () => new Date().toISOString().slice(0, 10)

/** South African school terms by calendar quarter. */
export const termOf = (d: Date = new Date()) => Math.floor(d.getUTCMonth() / 3) + 1

/** "Today" when the stamp is today, else "Wed 21 Oct". */
function whenLabel(stamp: string): string {
  return stamp.slice(0, 10) === todayIso() ? 'Today' : dayLabel(stamp)
}

/** `Adding fractions` for `Adding fractions with different denominators`, as the boards show it. */
const shortOrNull = (short: (name: string) => string, n: string | undefined) => (n ? short(n) : null)

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

export type LearnerRow = { id: string; name: string; topGap: string | null; average: number | null; present: number; recorded: number }

export type LearnersView = {
  className: string
  headline: string
  todayLabel: string
  registerTaken: boolean
  learners: LearnerRow[]
  joinCode: string
}

type Att = { child_id: string; day: string; status: AttStatus }

function attendanceOf(rows: Att[], childId: string) {
  const mine = rows.filter((r) => r.child_id === childId)
  return { present: mine.filter((r) => r.status !== 'away').length, recorded: mine.length, mine }
}

type PaperRow = { child_id: string | null; test_id: string | null; total: number | null; status: string }

/** Mean of each class-test paper's mark as a percentage of its test's total. */
function averageOf(papers: PaperRow[], outOf: Map<string, number>, childId: string): number | null {
  const pcts = papers
    .filter((p) => p.child_id === childId && p.test_id && p.status === 'marked' && p.total !== null)
    .map((p) => (p.total! / (outOf.get(p.test_id!) || 10)) * 100)
  if (pcts.length === 0) return null
  return Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)
}

async function classChildren(classId: string) {
  const supabase = await createSupabaseServer()
  const { data: enrolled } = await supabase.from('enrolments').select('child_id, children(id, first_name, parent_first_name, parent_relation)').eq('class_id', classId)
  return (enrolled ?? []).flatMap((e) => (e.children ? [e.children] : [])).sort((a, b) => a.first_name.localeCompare(b.first_name))
}

export async function getLearnersView(classId: string): Promise<LearnersView> {
  const supabase = await createSupabaseServer()
  const short = await loadShortLabels(supabase)
  const [kids, clsRes, testsRes] = await Promise.all([
    classChildren(classId),
    supabase.from('classes').select('name, join_code').eq('id', classId).single(),
    supabase.from('tests').select('id, out_of').eq('class_id', classId),
  ])
  const ids = kids.map((k) => k.id)
  const outOf = new Map((testsRes.data ?? []).map((t) => [t.id, t.out_of]))
  const [attRes, gapRes, paperRes] = await Promise.all([
    supabase.from('attendance').select('child_id, day, status').in('child_id', ids),
    supabase.from('gaps').select('child_id, topic_name, stage, created_at').in('child_id', ids).neq('stage', 'fixed').order('created_at'),
    supabase.from('papers').select('child_id, test_id, total, status').in('child_id', ids),
  ])
  const att = (attRes.data ?? []) as Att[]
  const gaps = gapRes.data ?? []
  const papers = paperRes.data ?? []

  const learners: LearnerRow[] = kids.map((k) => {
    const { present, recorded } = attendanceOf(att, k.id)
    return {
      id: k.id,
      name: k.first_name,
      topGap: shortOrNull(short, gaps.find((g) => g.child_id === k.id)?.topic_name),
      average: averageOf(papers, outOf, k.id),
      present,
      recorded,
    }
  })

  const counts = new Map<string, number>()
  for (const l of learners) if (l.topGap) counts.set(l.topGap, (counts.get(l.topGap) ?? 0) + 1)
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  const marked = papers.some((p) => p.test_id && p.status === 'marked')
  const headline = !marked
    ? 'No tests marked yet.'
    : top
      ? `Everyone is marked. ${top[1]} ${top[1] === 1 ? 'learner shares' : 'learners share'} one gap: ${lower(top[0])}.`
      : 'Everyone is marked. No gaps to work on right now.'

  const today = todayIso()
  return {
    className: clsRes.data?.name ?? '',
    headline,
    todayLabel: dayLabel(today),
    registerTaken: att.some((a) => a.day === today),
    learners,
    joinCode: clsRes.data?.join_code ?? '',
  }
}

export type RegisterView = {
  className: string
  dateLabel: string
  day: string
  learners: { id: string; name: string; present: number; recorded: number; status: AttStatus }[]
}

export async function getRegisterView(classId: string): Promise<RegisterView> {
  const supabase = await createSupabaseServer()
  const kids = await classChildren(classId)
  const ids = kids.map((k) => k.id)
  const [attRes, clsRes] = await Promise.all([
    supabase.from('attendance').select('child_id, day, status').in('child_id', ids),
    supabase.from('classes').select('name').eq('id', classId).single(),
  ])
  const att = (attRes.data ?? []) as Att[]
  const day = todayIso()
  return {
    className: clsRes.data?.name ?? '',
    dateLabel: dayLabel(day),
    day,
    learners: kids.map((k) => {
      const { present, recorded } = attendanceOf(att, k.id)
      return { id: k.id, name: k.first_name, present, recorded, status: att.find((a) => a.child_id === k.id && a.day === day)?.status ?? 'here' }
    }),
  }
}

export type NoteView = { id: string; kind: ObsKind; text: string; label: string }

export type LearnerView = {
  className: string
  id: string
  name: string
  grade: number
  linkedTo: string | null
  average: number | null
  present: number
  recorded: number
  openGaps: number
  summary: string
  term: number
  notes: NoteView[]
  attendance: { status: AttStatus }[]
  awayLabel: string | null
}

const KIND_LABEL: Record<ObsKind, string> = { participation: 'Participation', confidence: 'Confidence', effort: 'Effort', behaviour: 'Behaviour' }

async function loadChild(classId: string, childId: string) {
  const supabase = await createSupabaseServer()
  const { data: enrolled } = await supabase
    .from('enrolments')
    .select('children(id, first_name, grade, parent_first_name, parent_relation)')
    .eq('class_id', classId)
    .eq('child_id', childId)
    .maybeSingle()
  return enrolled?.children ?? null
}

async function linkedParent(childId: string, parentFirstName: string | null): Promise<string | null> {
  const supabase = await createSupabaseServer()
  const { data } = await supabase.from('parent_links').select('status').eq('child_id', childId).eq('status', 'approved').limit(1)
  return data && data.length > 0 ? (parentFirstName ?? 'a parent') : null
}

export async function getLearnerView(classId: string, childId: string): Promise<LearnerView | null> {
  const child = await loadChild(classId, childId)
  if (!child) return null
  const supabase = await createSupabaseServer()
  const short = await loadShortLabels(supabase)
  const [clsRes, testsRes, attRes, gapRes, paperRes, obsRes, resultsRes] = await Promise.all([
    supabase.from('classes').select('name').eq('id', classId).single(),
    supabase.from('tests').select('id, out_of').eq('class_id', classId),
    supabase.from('attendance').select('child_id, day, status').eq('child_id', childId).order('day'),
    supabase.from('gaps').select('topic_name, stage, created_at').eq('child_id', childId).neq('stage', 'fixed').order('created_at'),
    supabase.from('papers').select('child_id, test_id, total, status').eq('child_id', childId),
    supabase.from('observations').select('id, kind, text, created_at').eq('child_id', childId).order('created_at', { ascending: false }),
    supabase.from('question_results').select('topic_name, correct, misconception, paper_id').eq('child_id', childId),
  ])
  const outOf = new Map((testsRes.data ?? []).map((t) => [t.id, t.out_of]))
  const att = (attRes.data ?? []) as Att[]
  const gaps = gapRes.data ?? []
  const present = att.filter((a) => a.status !== 'away').length

  const topGapFull = gaps[0]?.topic_name ?? null
  const topGap = shortOrNull(short, topGapFull ?? undefined)
  const wrong = (resultsRes.data ?? []).filter((r) => !r.correct && r.misconception)
  const mis = topGap ? (wrong.find((r) => r.topic_name === topGapFull)?.misconception ?? wrong[0]?.misconception) : null
  const byTopic = new Map<string, { right: number; all: number }>()
  for (const r of resultsRes.data ?? []) {
    const t = byTopic.get(r.topic_name) ?? { right: 0, all: 0 }
    t.all += 1
    if (r.correct) t.right += 1
    byTopic.set(r.topic_name, t)
  }
  const best = [...byTopic.entries()].filter(([, v]) => v.all > 0 && v.right === v.all).sort((a, b) => b[1].all - a[1].all)[0]?.[0]
  const summary = [best ? `Solid on ${lower(best)}.` : null, topGap ? `The gap is ${lower(topGap)}${mis ? `: ${lower(mis)}` : ''}.` : 'No open gaps right now.']
    .filter(Boolean)
    .join(' ')

  const away = [...att].reverse().find((a) => a.status === 'away')
  const last10 = att.slice(-10)
  return {
    className: clsRes.data?.name ?? '',
    id: child.id,
    name: child.first_name,
    grade: child.grade,
    linkedTo: await linkedParent(childId, child.parent_first_name),
    average: averageOf((paperRes.data ?? []) as PaperRow[], outOf, childId),
    present,
    recorded: att.length,
    openGaps: gaps.length,
    summary,
    term: termOf(),
    notes: (obsRes.data ?? []).map((o) => ({ id: o.id, kind: o.kind as ObsKind, text: o.text, label: `${whenLabel(o.created_at)} · ${KIND_LABEL[o.kind as ObsKind]}` })),
    attendance: last10.map((a) => ({ status: a.status })),
    awayLabel: away ? dayLabel(away.day) : null,
  }
}

export type TopicMark = { name: string; pct: number; change: number | null; gapKey: string | null }

export type ChildProfileView = {
  className: string
  id: string
  name: string
  linkedTo: string | null
  average: number | null
  topGap: string | null
  misconception: string | null
  needsYou: { id: string; title: string; detail: string }[]
  marks: TopicMark[]
  paper: { testId: string; title: string; writtenOn: string; right: number; outOf: number } | null
  noticed: { text: string; chips: string[] }[]
  latestNote: NoteView | null
  attendanceLine: string
  tonight: { topic: string; format: string; minutes: number } | null
  term: number
  testId: string | null
}

export async function getChildProfileView(classId: string, childId: string): Promise<ChildProfileView | null> {
  const learner = await getLearnerView(classId, childId)
  if (!learner) return null
  const supabase = await createSupabaseServer()
  const short = await loadShortLabels(supabase)
  const today = todayIso()
  const [needsRes, resultsRes, papersRes, testsRes, guidanceRes, gapsRes, sessionRes] = await Promise.all([
    supabase.from('needs_you_items').select('id, title, detail').eq('child_id', childId).eq('status', 'open'),
    supabase.from('question_results').select('paper_id, topic_id, topic_name, correct, misconception, n').eq('child_id', childId),
    supabase.from('papers').select('id, test_id, total, status, created_at').eq('child_id', childId).eq('status', 'marked'),
    supabase.from('tests').select('id, title, written_on, out_of, created_at').eq('class_id', classId).order('written_on', { ascending: false }),
    supabase.from('guidance_cards').select('content').eq('child_id', childId).maybeSingle(),
    supabase.from('gaps').select('topic_id, topic_name').eq('child_id', childId).neq('stage', 'fixed').order('created_at'),
    supabase.from('sessions').select('topic_name, format, planned_minutes').eq('child_id', childId).eq('planned_for', today).neq('status', 'done').limit(1),
  ])
  const papers = papersRes.data ?? []
  const tests = testsRes.data ?? []
  const results = resultsRes.data ?? []
  const latestPaper = papers.filter((p) => p.test_id).sort((a, b) => (tests.findIndex((t) => t.id === a.test_id) - tests.findIndex((t) => t.id === b.test_id)))[0] ?? null
  const latestTest = latestPaper ? tests.find((t) => t.id === latestPaper.test_id) ?? null : null
  const current = new Set(papers.filter((p) => p.test_id).map((p) => p.id))
  const previous = new Set(papers.filter((p) => !p.test_id).map((p) => p.id))

  const tally = (ids: Set<string>) => {
    const m = new Map<string, { name: string; right: number; all: number }>()
    for (const r of results) {
      if (!ids.has(r.paper_id)) continue
      const key = r.topic_id ?? r.topic_name
      const t = m.get(key) ?? { name: r.topic_name, right: 0, all: 0 }
      t.all += 1
      if (r.correct) t.right += 1
      m.set(key, t)
    }
    return m
  }
  const now = tally(current)
  const before = tally(previous)
  const gapByTopic = new Map((gapsRes.data ?? []).map((g) => [short(g.topic_name), slug(g.topic_name)]))
  const marks: TopicMark[] = [...now.entries()]
    .map(([key, v]) => {
      const pct = Math.round((v.right / v.all) * 100)
      const old = before.get(key)
      return { name: short(v.name), pct, change: old ? pct - Math.round((old.right / old.all) * 100) : null, gapKey: gapByTopic.get(short(v.name)) ?? null }
    })
    .sort((a, b) => a.pct - b.pct)

  const guidance = guidanceRes.data ? GuidanceSchema.safeParse(guidanceRes.data.content) : null
  const g: Guidance | null = guidance?.success ? guidance.data : null
  const note = learner.notes[0] ?? null
  const session = sessionRes.data?.[0]
  const topGapFull = gapsRes.data?.[0]?.topic_name ?? null
  const topGap = shortOrNull(short, topGapFull ?? undefined)
  const wrongs = results.filter((r) => !r.correct && r.misconception)
  return {
    className: learner.className,
    id: learner.id,
    name: learner.name,
    linkedTo: learner.linkedTo,
    average: learner.average,
    topGap,
    misconception: (topGap ? wrongs.find((r) => r.topic_name === topGapFull)?.misconception : null) ?? wrongs[0]?.misconception ?? null,
    needsYou: needsRes.data ?? [],
    marks,
    paper: latestPaper && latestTest ? { testId: latestTest.id, title: latestTest.title, writtenOn: latestTest.written_on ?? latestTest.created_at.slice(0, 10), right: latestPaper.total ?? 0, outOf: latestTest.out_of } : null,
    noticed: (g?.focus ?? []).map((f) => ({ text: f.why, chips: f.evidence.map((e) => e.label) })),
    latestNote: note,
    attendanceLine: `${learner.present} of ${learner.recorded} days this term${learner.awayLabel ? ` · away ${learner.awayLabel}` : ''}`,
    tonight: session?.topic_name && session.format && session.planned_minutes ? { topic: session.topic_name, format: session.format, minutes: session.planned_minutes } : null,
    term: learner.term,
    testId: latestTest?.id ?? null,
  }
}
