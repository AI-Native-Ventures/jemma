import { notFound } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase/server'

type Supabase = Awaited<ReturnType<typeof createSupabaseServer>>

export type ClassRef = { id: string; name: string }

/** "Adding fractions with different denominators" is shown as "Adding fractions", as on the boards. */
export function shortTopic(name: string): string {
  return name.replace(/ with different denominators$/, '')
}

/** "Class Test 1: Fractions and decimals" is shown as "Class Test 1" in headers and sentences. */
export function shortTitle(title: string): string {
  return title.split(':')[0]!.trim()
}

/** Prompts are stored with a hyphen; the boards draw a real minus sign between spaced terms. */
export function prettyPrompt(prompt: string): string {
  return prompt.replace(/ - /g, ' − ')
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Mon 26 Oct" from a calendar date (`YYYY-MM-DD`) or a UTC date. */
export function dayLabel(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(`${d.slice(0, 10)}T00:00:00Z`) : d
  return `${DAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`
}

/** South African school terms by month: Jan to Mar is Term 1, then three months each. */
export function termOf(writtenOn: string | null): number {
  if (!writtenOn) return 1
  return Math.min(4, Math.floor((Number(writtenOn.slice(5, 7)) - 1) / 3) + 1)
}

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0)

type PaperRow = { id: string; test_id: string | null; child_id: string | null; status: string; total: number | null }
type ResultRow = {
  paper_id: string
  child_id: string
  n: number
  prompt: string
  answer_read: string
  correct: boolean
  mark: number
  topic_name: string
  misconception: string | null
  gap_topic_id: string | null
}

export type QuestionSummary = {
  n: number
  prompt: string
  topic: string
  right: number
  of: number
  /** One entry per marked paper, right ones first. */
  dots: boolean[]
}

export type TestSummary = {
  id: string
  title: string
  shortTitle: string
  writtenOn: string | null
  dayLabel: string
  term: number
  outOf: number
  papers: number
  marked: number
  /** Percent per marked paper, ascending. */
  marks: number[]
  average: number
  highest: number
  lowest: number
  lowestTopics: { name: string; pct: number }[]
  questions: QuestionSummary[]
  hardest: { numbers: number[]; right: number } | null
}

function summarise(
  test: { id: string; title: string; written_on: string | null; out_of: number },
  papers: PaperRow[],
  results: ResultRow[],
): TestSummary {
  const marked = papers.filter((p) => p.status === 'marked')
  const markedIds = new Set(marked.map((p) => p.id))
  const rows = results.filter((r) => markedIds.has(r.paper_id))

  const marks = marked
    .map((p) => {
      const sum = rows.filter((r) => r.paper_id === p.id).reduce((a, r) => a + r.mark, 0)
      return pct(rows.some((r) => r.paper_id === p.id) ? sum : (p.total ?? 0), test.out_of)
    })
    .sort((a, b) => a - b)

  const byTopic = new Map<string, { right: number; all: number }>()
  const byN = new Map<number, ResultRow[]>()
  for (const r of rows) {
    const t = byTopic.get(shortTopic(r.topic_name)) ?? { right: 0, all: 0 }
    t.all += 1
    if (r.correct) t.right += 1
    byTopic.set(shortTopic(r.topic_name), t)
    byN.set(r.n, [...(byN.get(r.n) ?? []), r])
  }

  const questions = [...byN.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([n, list]) => {
      const right = list.filter((r) => r.correct).length
      return {
        n,
        prompt: prettyPrompt(list[0]!.prompt),
        topic: shortTopic(list[0]!.topic_name),
        right,
        of: list.length,
        dots: [...Array.from({ length: right }, () => true), ...Array.from({ length: list.length - right }, () => false)],
      }
    })

  const fewest = questions.length ? Math.min(...questions.map((q) => q.right)) : 0
  const hardestQs = questions.filter((q) => q.right === fewest)
  const mean = marks.length ? marks.reduce((a, b) => a + b, 0) / marks.length : 0

  return {
    id: test.id,
    title: test.title,
    shortTitle: shortTitle(test.title),
    writtenOn: test.written_on,
    dayLabel: test.written_on ? dayLabel(test.written_on) : '',
    term: termOf(test.written_on),
    outOf: test.out_of,
    papers: papers.length,
    marked: marked.length,
    marks,
    average: Math.round(mean),
    highest: marks.length ? marks[marks.length - 1]! : 0,
    lowest: marks.length ? marks[0]! : 0,
    lowestTopics: [...byTopic.entries()]
      .map(([name, t]) => ({ name, pct: pct(t.right, t.all) }))
      .sort((a, b) => a.pct - b.pct || a.name.localeCompare(b.name))
      .slice(0, 3),
    questions,
    hardest: questions.length ? { numbers: hardestQs.map((q) => q.n), right: fewest } : null,
  }
}

async function classRef(supabase: Supabase, classId: string): Promise<ClassRef> {
  const { data } = await supabase.from('classes').select('id, name').eq('id', classId).maybeSingle()
  if (!data) notFound()
  return data
}

async function loadSummaries(supabase: Supabase, tests: { id: string; title: string; written_on: string | null; out_of: number }[]) {
  if (tests.length === 0) return []
  const { data: papers } = await supabase
    .from('papers')
    .select('id, test_id, child_id, status, total')
    .in('test_id', tests.map((t) => t.id))
  const paperRows = (papers ?? []) as PaperRow[]
  const { data: results } = paperRows.length
    ? await supabase
        .from('question_results')
        .select('paper_id, child_id, n, prompt, answer_read, correct, mark, topic_name, misconception, gap_topic_id')
        .in('paper_id', paperRows.map((p) => p.id))
    : { data: [] }
  const resultRows = (results ?? []) as ResultRow[]
  return tests.map((t) => {
    const mine = paperRows.filter((p) => p.test_id === t.id)
    const ids = new Set(mine.map((p) => p.id))
    return summarise(t, mine, resultRows.filter((r) => ids.has(r.paper_id)))
  })
}

export type TestsList = {
  cls: ClassRef
  headline: string | null
  groups: { term: number; tests: TestSummary[] }[]
}

/** `teacher-tests`: every test of the class, newest first, grouped by term. */
export async function getTestsList(classId: string): Promise<TestsList> {
  const supabase = await createSupabaseServer()
  const cls = await classRef(supabase, classId)
  const { data: tests } = await supabase
    .from('tests')
    .select('id, title, written_on, out_of')
    .eq('class_id', classId)
    .order('written_on', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
  const summaries = await loadSummaries(supabase, tests ?? [])

  const latest = summaries.find((s) => s.marked > 0)
  const lowest = latest?.lowestTopics[0]
  const headline = latest
    ? `${latest.shortTitle} averaged ${latest.average}%.${lowest ? ` ${lowest.name} pulled it down.` : ''}`
    : null

  const groups: TestsList['groups'] = []
  for (const s of summaries) {
    const g = groups.find((x) => x.term === s.term)
    if (g) g.tests.push(s)
    else groups.push({ term: s.term, tests: [s] })
  }
  return { cls, headline, groups }
}

async function loadTest(supabase: Supabase, classId: string, testId: string) {
  const { data: test } = await supabase
    .from('tests')
    .select('id, title, written_on, out_of')
    .eq('id', testId)
    .eq('class_id', classId)
    .maybeSingle()
  if (!test) notFound()
  const [summary] = await loadSummaries(supabase, [test])
  return summary!
}

export type TestDetail = { cls: ClassRef; test: TestSummary; hardestLine: string | null }

/** Sentence for the hardest question(s), for example "Questions 1 and 4 were the hardest. Only 1 learner got each right." */
function hardestSentence(h: TestSummary['hardest']): string | null {
  if (!h || h.numbers.length === 0) return null
  const list =
    h.numbers.length === 1
      ? `${h.numbers[0]}`
      : `${h.numbers.slice(0, -1).join(', ')} and ${h.numbers[h.numbers.length - 1]}`
  const who = h.right === 0 ? 'No learner got' : `Only ${h.right} learner${h.right === 1 ? '' : 's'} got`
  return h.numbers.length === 1
    ? `Question ${list} was the hardest. ${who} it right.`
    : `Questions ${list} were the hardest. ${who} each right.`
}

/** `teacher-test`. */
export async function getTestDetail(classId: string, testId: string): Promise<TestDetail> {
  const supabase = await createSupabaseServer()
  const cls = await classRef(supabase, classId)
  const test = await loadTest(supabase, classId, testId)
  return { cls, test, hardestLine: hardestSentence(test.hardest) }
}

export type Learner = { childId: string; name: string; answer: string }

export type QuestionDetail = {
  cls: ClassRef
  test: { id: string; title: string; shortTitle: string }
  n: number
  prompt: string
  topic: string
  rightAnswer: string
  marks: number
  total: number
  missed: Learner[]
  right: Learner[]
  summary: string | null
  gap: { topicId: string; topicName: string } | null
}

const PAST: Record<string, string> = {
  Adds: 'added',
  Subtracts: 'subtracted',
  Lines: 'lined',
  Thinks: 'thought',
  Keeps: 'kept',
  Forgets: 'forgot',
  Ignores: 'ignored',
  Multiplies: 'multiplied',
  Divides: 'divided',
  Counts: 'counted',
  Reads: 'read',
  Writes: 'wrote',
  Puts: 'put',
  Takes: 'took',
}

/** "Adds the tops and the bottoms" becomes "They added the tops and the bottoms." */
function mistakeSentence(misconception: string): string {
  const [first, ...rest] = misconception.trim().split(/\s+/)
  const past = first ? PAST[first] : undefined
  return past ? `They ${[past, ...rest].join(' ')}.` : `Mistake: ${misconception.trim()}.`
}

function mode<T>(list: T[]): { value: T; count: number } | null {
  const counts = new Map<T, number>()
  for (const v of list) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best: { value: T; count: number } | null = null
  for (const [value, count] of counts) if (!best || count > best.count) best = { value, count }
  return best
}

/** `teacher-question`. */
export async function getQuestionDetail(classId: string, testId: string, n: number): Promise<QuestionDetail> {
  const supabase = await createSupabaseServer()
  const cls = await classRef(supabase, classId)
  const { data: test } = await supabase
    .from('tests')
    .select('id, title, out_of')
    .eq('id', testId)
    .eq('class_id', classId)
    .maybeSingle()
  if (!test) notFound()

  const [{ data: papers }, { data: key }] = await Promise.all([
    supabase.from('papers').select('id, child_id, status').eq('test_id', testId).eq('status', 'marked'),
    supabase.from('answer_keys').select('items').eq('test_id', testId).maybeSingle(),
  ])
  const paperIds = (papers ?? []).map((p) => p.id)
  const { data: results } = paperIds.length
    ? await supabase
        .from('question_results')
        .select('paper_id, child_id, n, prompt, answer_read, correct, mark, topic_name, misconception, gap_topic_id')
        .in('paper_id', paperIds)
        .eq('n', n)
    : { data: [] }
  const rows = (results ?? []) as ResultRow[]
  const item = ((key?.items ?? []) as { n: number; prompt: string; answer: string; marks: number }[]).find((i) => i.n === n)
  if (rows.length === 0 && !item) notFound()

  const childIds = rows.map((r) => r.child_id)
  const { data: kids } = childIds.length
    ? await supabase.from('children').select('id, first_name').in('id', childIds)
    : { data: [] }
  const nameOf = new Map((kids ?? []).map((k) => [k.id, k.first_name]))
  const learner = (r: ResultRow): Learner => ({ childId: r.child_id, name: nameOf.get(r.child_id) ?? '', answer: r.answer_read })
  const byName = (a: Learner, b: Learner) => a.name.localeCompare(b.name)
  const missed = rows.filter((r) => !r.correct).map(learner).sort(byName)
  const right = rows.filter((r) => r.correct).map(learner).sort(byName)

  const wrong = rows.filter((r) => !r.correct)
  let summary: string | null = null
  if (rows.length > 0 && wrong.length === 0) summary = 'Everyone got it right.'
  if (wrong.length > 0) {
    const common = mode(wrong.map((r) => r.answer_read))!
    const miss = mode(wrong.map((r) => r.misconception).filter((m): m is string => Boolean(m)))
    const lead = `${wrong.length} of ${rows.length} missed it`
    const wrote =
      common.count === wrong.length
        ? wrong.length === 1
          ? `. They wrote ${common.value}.`
          : `, and all ${wrong.length} wrote ${common.value}.`
        : `, and ${common.count} wrote ${common.value}.`
    summary = `${lead}${wrote}${miss ? ` ${mistakeSentence(miss.value)}` : ''}`
  }

  let gap: QuestionDetail['gap'] = null
  const gapTopic = mode(wrong.map((r) => r.gap_topic_id).filter((g): g is string => Boolean(g)))
  if (gapTopic) {
    const { data: plan } = await supabase
      .from('reteach_plans')
      .select('topic_id, topic_name')
      .eq('class_id', classId)
      .eq('topic_id', gapTopic.value)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (plan?.topic_id) gap = { topicId: plan.topic_id, topicName: shortTopic(plan.topic_name) }
  }

  return {
    cls,
    test: { id: test.id, title: test.title, shortTitle: shortTitle(test.title) },
    n,
    prompt: prettyPrompt(rows[0]?.prompt ?? item!.prompt),
    topic: shortTopic(rows[0]?.topic_name ?? ''),
    rightAnswer: item?.answer ?? '',
    marks: item?.marks ?? 1,
    total: rows.length,
    missed,
    right,
    summary,
    gap,
  }
}

export type NotificationRow = {
  id: string
  title: string
  body: string
  href: string
  time: string
  unread: boolean
  /** Which board icon to draw. */
  icon: 'link' | 'check' | 'test' | 'map' | 'bell'
}

export type NotificationGroup = { label: string; items: NotificationRow[] }

export type NotificationsPage = {
  cls: ClassRef
  headline: string
  groups: NotificationGroup[]
  hasUnread: boolean
}

const SAST = 'Africa/Johannesburg'

function sastParts(d: Date): { ymd: string; hour: number; time: string } {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: SAST, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]))
  return { ymd: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), time: `${p.hour}:${p.minute}` }
}

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function iconFor(href: string): NotificationRow['icon'] {
  if (/\/curriculum/.test(href)) return 'map'
  if (/\/tests/.test(href)) return 'test'
  if (/\/papers\//.test(href)) return 'check'
  if (/\/learners\//.test(href)) return 'link'
  return 'bell'
}

/** Day section for a notification: last night, today, yesterday or an older date. */
function sectionOf(created: Date, now: Date): { key: string; label: string } {
  const c = sastParts(created)
  const today = sastParts(now).ymd
  const yesterday = addDays(today, -1)
  const lastNight = (c.ymd === yesterday && c.hour >= 18) || (c.ymd === today && c.hour < 6)
  if (lastNight) return { key: 'night', label: 'Last night' }
  if (c.ymd === today) return { key: today, label: 'Today' }
  if (c.ymd === yesterday) return { key: yesterday, label: `Yesterday, ${dayLabel(yesterday)}` }
  return { key: c.ymd, label: dayLabel(c.ymd) }
}

/** `teacher-notifications`: the signed-in teacher's own notifications, newest first, grouped by day. */
export async function getNotificationsPage(classId: string): Promise<NotificationsPage> {
  const supabase = await createSupabaseServer()
  const cls = await classRef(supabase, classId)
  const [{ data: rows }, { count: open }] = await Promise.all([
    supabase.from('notifications').select('id, title, body, href, created_at, read_at').order('created_at', { ascending: false }).limit(60),
    supabase.from('needs_you_items').select('id', { count: 'exact', head: true }).eq('status', 'open'),
  ])
  const now = new Date()
  const groups: (NotificationGroup & { key: string })[] = []
  for (const r of rows ?? []) {
    const created = new Date(r.created_at)
    const sec = sectionOf(created, now)
    let g = groups.find((x) => x.key === sec.key)
    if (!g) {
      g = { key: sec.key, label: sec.label, items: [] }
      groups.push(g)
    }
    g.items.push({
      id: r.id,
      title: r.title,
      body: r.body,
      href: r.href,
      time: sastParts(created).time,
      unread: r.read_at === null,
      icon: iconFor(r.href),
    })
  }

  const newest = (rows ?? []).find((r) => r.read_at === null)
  let headline = 'Nothing needs you. You are up to date.'
  if ((open ?? 0) > 0) {
    headline = open === 1 ? '1 thing needs you.' : `${open} things need you.`
  } else if (newest) {
    const m = /^(.+?) finished (her|his|their) lesson/.exec(newest.title)
    const when = sectionOf(new Date(newest.created_at), now).key === 'night' ? 'last night' : 'today'
    headline = m ? `${m[1]} did ${m[2]} lesson ${when}. Nothing else needs you.` : `${newest.title}. Nothing else needs you.`
  }
  return { cls, headline, groups: groups.map(({ label, items }) => ({ label, items })), hasUnread: (rows ?? []).some((r) => r.read_at === null) }
}
