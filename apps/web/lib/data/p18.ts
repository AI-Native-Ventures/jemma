import { ReteachSchema, type Reteach } from '@jemma/profiling/schemas'
import type { NeedsYouItem } from '@/components/blocks'
import { createSupabaseServer } from '@/lib/supabase/server'
import { loadShortLabels } from '@/lib/topics'
import { getShareCard, type ShareCardData } from './p50b'

export type GapStage = 'new' | 'practising' | 'fixed'

/** Shown to the teacher in South African time, as the school keeps it. */
const TZ = 'Africa/Johannesburg'

export type GapLearner = {
  childId: string
  name: string
  stage: GapStage
  wrote: string[]
  /** Questions of this gap that the learner got right (only for learners who are stuck on it). */
  rightQs: number[]
}

export type MistakeExample = { pre: string; strong: string }

export type ClassGapView = {
  key: string
  topicName: string
  /** `Adding fractions` for `Adding fractions with different denominators`. */
  shortName: string
  /** Learners stuck on it (new or practising). */
  count: number
  total: number
  learners: GapLearner[]
  counts: { new: number; practising: number; fixed: number }
  mistake: {
    label: string
    seen: number
    example: MistakeExample
    rows: { n: number; text: string; learners: number }[]
  } | null
  /** Learners with no gap here who got every one of this gap's questions right. */
  partners: { childId: string; name: string; questions: number }[]
  /** Earliest planned lesson on this topic: `Amina's lesson is Wednesday`. */
  nextLesson: { name: string; weekday: string } | null
}

export type SessionView = {
  childId: string
  name: string
  right: number
  of: number
  note: string
  stage: GapStage | null
}

export type ActivityEntry = { at: string; text: string }

export type ReteachView = {
  id: string
  topicName: string
  content: Reteach
  doneAt: string | null
  why: string | null
  missingBasic: string | null
  explanation: string | null
}

export type LatestTest = {
  id: string
  title: string
  writtenOn: string
  papers: number
  toCheck: number
  average: number | null
  range: [number, number] | null
  hardest: number | null
}

export type ClassHome = {
  /** `next` once a learner finished a lesson last night; the home then reads as the morning after. */
  mode: 'home' | 'next'
  headline: string
  dateLabel: string
  needsYou: NeedsYouItem[]
  /** Who the Needs you card says is done, when nothing is open. */
  doneName: string | null
  gaps: ClassGapView[]
  reteach: ReteachView | null
  latestTest: LatestTest | null
  lastNightSessions: SessionView[]
  waiting: string[]
  activity: ActivityEntry[]
  topGapKey: string | null
  /** A test is held (parents see nothing of it yet) and has a marked paper: the teacher can share it. */
  shareCard: ShareCardData | null
}

export type GapDetail = {
  index: number
  of: number
  gap: ClassGapView
  testTitle: string | null
  why: string
  reteach: ReteachView | null
}

// ---- Words ---------------------------------------------------------------------------------

export const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const lowerFirst = (s: string) => (s ? s[0]!.toLowerCase() + s.slice(1) : s)

/** `Adds the tops` becomes `add the tops`, `Thinks bigger` becomes `think bigger`. */
function baseVerb(label: string): string {
  const [first = '', ...rest] = label.split(' ')
  const lower = first.toLowerCase()
  const base = /(ch|sh|x|s|z)es$/.test(lower) ? lower.slice(0, -2) : lower.endsWith('s') ? lower.slice(0, -1) : lower
  return [base, ...rest].join(' ')
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
const numberWord = (n: number) => NUMBER_WORDS[n] ?? String(n)

const joinNames = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

function partsOf(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return { weekday: get('weekday'), day: get('day'), month: get('month'), time: `${get('hour')}:${get('minute')}` }
}

const dayKey = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(date)

/** `14:12` for today, `Sun 18:40` for older. */
function logTime(at: string, now: Date): string {
  const d = new Date(at)
  const p = partsOf(d)
  return dayKey(d) === dayKey(now) ? p.time : `${p.weekday} ${p.time}`
}

function writtenLabel(writtenOn: string, now: Date): string {
  const day = dayKey(now)
  if (writtenOn === day) return 'today'
  const yesterday = dayKey(new Date(now.getTime() - 24 * 3600 * 1000))
  if (writtenOn === yesterday) return 'yesterday'
  const p = partsOf(new Date(`${writtenOn}T12:00:00Z`))
  return `${p.weekday} ${p.day} ${p.month}`
}

const weekdayOf = (day: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long' }).format(new Date(`${day}T12:00:00Z`))

function exampleOf(prompt: string, answer: string): MistakeExample {
  const bigger = /^Bigger: (.+) or (.+)$/.exec(prompt)
  if (bigger) {
    const [, a, b] = bigger as unknown as [string, string, string]
    const other = answer === b ? a : b
    return { pre: 'picks ', strong: `${answer} over ${other}` }
  }
  return { pre: '', strong: `${prompt} = ${answer}` }
}

// ---- Loading -------------------------------------------------------------------------------

async function load(classId: string) {
  const supabase = await createSupabaseServer()
  const now = new Date()
  const [{ data: cls }, { data: enrol }, { data: tests }, { data: plans }] = await Promise.all([
    supabase.from('classes').select('id, name').eq('id', classId).maybeSingle(),
    supabase.from('enrolments').select('child_id').eq('class_id', classId),
    supabase.from('tests').select('id, title, written_on, out_of').eq('class_id', classId).order('created_at', { ascending: false }).limit(1),
    supabase
      .from('reteach_plans')
      .select('id, topic_name, content, done_at, why, missing_basic, explanation')
      .eq('class_id', classId)
      .order('created_at', { ascending: false }),
  ])
  if (!cls) return null
  const childIds = (enrol ?? []).map((e) => e.child_id)
  const test = tests?.[0] ?? null
  const since = new Date(now.getTime() - 36 * 3600 * 1000).toISOString()

  const none = ['00000000-0000-0000-0000-000000000000']
  const ids = childIds.length ? childIds : none
  const [kids, gapRows, papers, needs, sessions, plannedSessions, log] = await Promise.all([
    supabase.from('children').select('id, first_name, created_at').in('id', ids),
    supabase.from('gaps').select('child_id, topic_name, stage, evidence, first_practised_at').in('child_id', ids).order('created_at'),
    test
      ? supabase.from('papers').select('id, child_id, status, total').eq('test_id', test.id)
      : Promise.resolve({ data: [] as { id: string; child_id: string | null; status: string; total: number | null }[] }),
    supabase.from('needs_you_items').select('id, child_id, kind, ref_id, status, title, detail, created_at').order('created_at', { ascending: false }),
    supabase
      .from('sessions')
      .select('id, child_id, topic_name, status, right, question_count, finished_at')
      .in('child_id', ids)
      .eq('status', 'done')
      .gte('finished_at', since),
    supabase.from('sessions').select('child_id, topic_name, planned_for').in('child_id', ids).eq('status', 'planned').gt('planned_for', dayKey(now)).order('planned_for'),
    supabase.from('activity_log').select('at, text').eq('class_id', classId).order('at', { ascending: false }).limit(4),
  ])

  const paperIds = (papers.data ?? []).map((p) => p.id)
  const results = paperIds.length
    ? ((
        await supabase
          .from('question_results')
          .select('id, child_id, n, prompt, answer_read, correct, misconception')
          .in('paper_id', paperIds)
      ).data ?? [])
    : []
  const doneIds = (sessions.data ?? []).map((s) => s.id)
  const items = doneIds.length
    ? ((await supabase.from('session_items').select('session_id, phase').in('session_id', doneIds).eq('phase', 'try')).data ?? [])
    : []

  return {
    now,
    short: await loadShortLabels(supabase, { classIds: [classId] }),
    cls,
    test,
    plans: plans ?? [],
    childIds,
    created: new Map((kids.data ?? []).map((k) => [k.id, k.created_at])),
    names: new Map((kids.data ?? []).map((k) => [k.id, k.first_name])),
    gapRows: gapRows.data ?? [],
    papers: papers.data ?? [],
    needs: (needs.data ?? []).filter((n) => !n.child_id || childIds.includes(n.child_id)),
    sessions: sessions.data ?? [],
    items,
    plannedSessions: plannedSessions.data ?? [],
    log: log.data ?? [],
    results,
  }
}

type Loaded = NonNullable<Awaited<ReturnType<typeof load>>>

function buildGaps(d: Loaded): ClassGapView[] {
  const total = d.childIds.length
  const byId = new Map(d.results.map((r) => [r.id, r]))
  const topics = [...new Set(d.gapRows.filter((g) => g.stage !== 'fixed').map((g) => g.topic_name))]
  // Class-list order: when the class was joined (enrolments have no order of their own), then first name.
  const sorted = [...d.childIds].sort(
    (a, b) => (d.created.get(a) ?? '').localeCompare(d.created.get(b) ?? '') || (d.names.get(a) ?? '').localeCompare(d.names.get(b) ?? ''),
  )
  const order = new Map(sorted.map((id, i) => [id, i]))

  const views = topics.map((topicName, position) => {
    const rows = d.gapRows.filter((g) => g.topic_name === topicName)
    const stuckRows = rows.filter((g) => g.stage !== 'fixed')
    const evOf = (childId: string) => {
      const row = rows.find((g) => g.child_id === childId)
      return (row?.evidence ?? [])
        .map((id) => byId.get(id))
        .filter((r): r is NonNullable<typeof r> => Boolean(r))
        .sort((a, b) => a.n - b.n)
    }
    const wrongCount = (childId: string) => evOf(childId).length
    // Most wrong answers on this gap first, ties in class-list order.
    const stuckIds = [...new Set(stuckRows.map((g) => g.child_id))].sort(
      (a, b) => wrongCount(b) - wrongCount(a) || (order.get(a) ?? 0) - (order.get(b) ?? 0),
    )
    const allEv = stuckIds.flatMap(evOf)
    const gapNs = [...new Set(allEv.map((r) => r.n))].sort((a, b) => a - b)
    const correctAt = (childId: string, n: number) => d.results.find((r) => r.child_id === childId && r.n === n)?.correct === true

    const learners: GapLearner[] = stuckIds.map((childId) => {
      const own = evOf(childId)
      const row = stuckRows.find((g) => g.child_id === childId)!
      return {
        childId,
        name: d.names.get(childId) ?? '',
        stage: row.stage as GapStage,
        wrote: own.map((r) => r.answer_read),
        rightQs: gapNs.filter((n) => !own.some((r) => r.n === n) && correctAt(childId, n)),
      }
    })
    const partners = d.childIds
      .filter((id) => !stuckIds.includes(id))
      .filter((id) => gapNs.length > 0 && gapNs.every((n) => correctAt(id, n)))
      .map((id) => ({ childId: id, name: d.names.get(id) ?? '', questions: gapNs.length }))

    const labelCount = new Map<string, number>()
    for (const r of allEv) {
      const label = r.misconception
      if (label) labelCount.set(label, (labelCount.get(label) ?? 0) + 1)
    }
    let best: string | null = null
    for (const [label, n] of labelCount) if (!best || n > labelCount.get(best)!) best = label
    let mistake: ClassGapView['mistake'] = null
    if (best) {
      const hits = allEv.filter((r) => r.misconception === best)
      const first = hits.slice().sort((a, b) => a.n - b.n)[0]!
      const ns = [...new Set(hits.map((r) => r.n))].sort((a, b) => a - b)
      mistake = {
        label: best,
        seen: hits.length,
        example: exampleOf(first.prompt, first.answer_read),
        rows: ns.map((n) => {
          const same = hits.filter((r) => r.n === n)
          const ex = exampleOf(same[0]!.prompt, same[0]!.answer_read)
          return { n, text: ex.pre + ex.strong, learners: new Set(same.map((r) => r.child_id)).size }
        }),
      }
    }

    const later = d.plannedSessions.find((s) => s.topic_name === topicName && stuckIds.includes(s.child_id))
    return {
      position,
      view: {
        key: slug(topicName),
        topicName,
        shortName: d.short(topicName),
        count: learners.length,
        total,
        learners,
        counts: {
          new: learners.filter((l) => l.stage === 'new').length,
          practising: learners.filter((l) => l.stage === 'practising').length,
          fixed: 0,
        },
        mistake,
        partners,
        nextLesson: later ? { name: d.names.get(later.child_id) ?? '', weekday: weekdayOf(later.planned_for) } : null,
      } satisfies ClassGapView,
    }
  })
  return views.sort((a, b) => b.view.count - a.view.count || a.position - b.position).map((v) => v.view)
}

const reteachOf = (d: Loaded, topicName: string): ReteachView | null => {
  const plan = d.plans.find((p) => p.topic_name.toLowerCase() === topicName.toLowerCase())
  if (!plan) return null
  const parsed = ReteachSchema.safeParse(plan.content)
  if (!parsed.success) return null
  return {
    id: plan.id,
    topicName: plan.topic_name,
    content: parsed.data,
    doneAt: plan.done_at,
    why: plan.why,
    missingBasic: plan.missing_basic,
    explanation: plan.explanation,
  }
}

function gapSentence(g: ClassGapView): string {
  return g.mistake
    ? `${g.count} of ${g.total} learners ${baseVerb(g.mistake.label)} when ${lowerFirst(g.shortName)}.`
    : `${g.count} of ${g.total} learners are stuck on ${lowerFirst(g.shortName)}.`
}

/** The "Jemma Desktop is off" card: what is waiting for the desktop runner and when it was snapped. */
async function waitingForDesktop(): Promise<{ title: string; detail: string } | null> {
  const supabase = await createSupabaseServer()
  const { data } = await supabase.from('events').select('type, created_at').eq('status', 'queued').eq('runner', 'desktop').order('created_at')
  if (!data?.length) return null
  const papers = data.filter((e) => e.type === 'paper.snapped' || e.type === 'homework.snapped').length
  const n = data.length
  const what = papers === n ? (n === 1 ? 'paper is' : 'papers are') : n === 1 ? 'job is' : 'jobs are'
  return {
    title: `Jemma Desktop is off. ${n} ${what} waiting.`,
    detail: `Snapped at ${partsOf(new Date(data[0]!.created_at)).time}. Your MacBook is asleep or Jemma Desktop is closed.`,
  }
}

// ---- Public reads --------------------------------------------------------------------------

export async function getClassHome(classId: string): Promise<ClassHome | null> {
  const d = await load(classId)
  if (!d) return null
  const base = `/t/${classId}`
  const gaps = buildGaps(d)
  const top = gaps[0] ?? null
  const reteach = top ? reteachOf(d, top.topicName) : null

  const open = d.needs.filter((n) => n.status === 'open')
  const desktopOff = open.some((n) => n.kind === 'desktop_off') ? await waitingForDesktop() : null
  const needsYou: NeedsYouItem[] = open.map((n) =>
    n.kind === 'desktop_off' && desktopOff
      ? { href: `${base}/settings/ai-runner`, title: desktopOff.title, detail: desktopOff.detail, desktopOff: true }
      : {
          href: n.kind === 'approve_link' ? `${base}/link-requests/${n.ref_id}` : n.kind === 'review_long_view' ? `${base}/learners/${n.ref_id}/long-view` : n.kind === 'check_records' ? `${base}/learners/records/${n.ref_id}` : `${base}/needs-you/${n.id}`,
          title: n.title,
          detail: n.detail,
        },
  )
  const lastDone = d.needs.find((n) => n.status === 'done' && n.kind === 'check_answer' && n.child_id)
  const doneName = lastDone?.child_id ? (d.names.get(lastDone.child_id) ?? null) : null

  const lastNightSessions: SessionView[] = d.sessions.map((s) => {
    const finished = s.finished_at ? new Date(s.finished_at).getTime() : 0
    const gap = d.gapRows.find((g) => g.child_id === s.child_id && g.topic_name === s.topic_name)
    const moved =
      gap?.stage === 'practising' && gap.first_practised_at && Math.abs(new Date(gap.first_practised_at).getTime() - finished) < 10 * 60 * 1000
    const tries = d.items.filter((i) => i.session_id === s.id).length
    const short = d.short(s.topic_name ?? '')
    return {
      childId: s.child_id,
      name: d.names.get(s.child_id) ?? '',
      right: s.right ?? 0,
      of: tries || s.question_count || 0,
      note: moved ? `${short} moved from New to Practising` : short,
      stage: (gap?.stage as GapStage | undefined) ?? null,
    }
  })
  const doneChildren = new Set(lastNightSessions.map((s) => s.childId))
  const waiting = d.childIds
    .filter((id) => !doneChildren.has(id))
    .map((id) => d.names.get(id) ?? '')
    .sort((a, b) => a.localeCompare(b))

  const mode: ClassHome['mode'] = lastNightSessions.length > 0 ? 'next' : 'home'
  const fixing = top?.learners.filter((l) => l.stage === 'practising').map((l) => l.name) ?? []
  const headline = !top
    ? 'No class gaps yet.'
    : mode === 'next'
      ? fixing.length
        ? `${top.shortName} is still the gap. ${joinNames(fixing)} started fixing it last night.`
        : `${top.shortName} is still the gap.`
      : gapSentence(top)

  let latestTest: LatestTest | null = null
  if (d.test) {
    const pct = d.papers
      .filter((p) => p.total !== null)
      .map((p) => Math.round((p.total! / d.test!.out_of) * 100))
    const wrongByN = new Map<number, number>()
    for (const r of d.results) if (!r.correct) wrongByN.set(r.n, (wrongByN.get(r.n) ?? 0) + 1)
    let hardest: number | null = null
    for (const [n, c] of [...wrongByN].sort((a, b) => a[0] - b[0])) if (hardest === null || c > wrongByN.get(hardest)!) hardest = n
    latestTest = {
      id: d.test.id,
      title: d.test.title,
      writtenOn: writtenLabel(d.test.written_on ?? '', d.now),
      papers: d.papers.length,
      toCheck: open.filter((n) => n.kind === 'check_answer').length,
      average: pct.length ? Math.round(pct.reduce((a, b) => a + b, 0) / pct.length) : null,
      range: pct.length ? [Math.min(...pct), Math.max(...pct)] : null,
      hardest,
    }
  }

  const p = partsOf(d.now)
  const shareCard = await getShareCard(classId)
  return {
    mode,
    headline,
    dateLabel: `${p.weekday} ${p.day} ${p.month}`,
    needsYou,
    doneName,
    gaps,
    reteach,
    latestTest,
    lastNightSessions,
    waiting,
    activity: (mode === 'next' ? d.log.slice(0, 4) : d.log.slice(0, 4).reverse()).map((l) => ({ at: logTime(l.at, d.now), text: l.text })),
    topGapKey: top?.key ?? null,
    shareCard,
  }
}

export async function getGapDetail(classId: string, key: string): Promise<GapDetail | null> {
  const d = await load(classId)
  if (!d) return null
  const gaps = buildGaps(d)
  const index = gaps.findIndex((g) => g.key === key)
  if (index < 0) return null
  const gap = gaps[index]!
  const reteach = reteachOf(d, gap.topicName)
  const why = reteach?.why ?? (gap.mistake ? `${gap.count} of ${gap.total} ${baseVerb(gap.mistake.label)}.` : `${gap.count} of ${gap.total} are stuck on this.`)
  return { index, of: gaps.length, gap, testTitle: d.test?.title ?? null, why, reteach }
}

export { numberWord, joinNames }
