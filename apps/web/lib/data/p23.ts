import { createSupabaseServer } from '../supabase/server'

/** Parent profile, report, beyond the tests and add activity. Everything is read through RLS. */

const TZ = 'Africa/Johannesburg'
const DAY = 24 * 60 * 60 * 1000
const CURRENT_DAYS = 30

function parts(d: Date, opts: Intl.DateTimeFormatOptions): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...opts }).formatToParts(d)) out[p.type] = p.value
  return out
}

const dayKey = (d: Date) => {
  const p = parts(d, { year: 'numeric', month: '2-digit', day: '2-digit' })
  return `${p.year}-${p.month}-${p.day}`
}
export const isToday = (iso: string) => dayKey(new Date(iso)) === dayKey(new Date())

export const timeOf = (iso: string) => {
  const p = parts(new Date(iso), { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${p.hour}:${p.minute}`
}
/** "Mon 26 Oct". */
export const dayLabel = (iso: string) => {
  const p = parts(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso), { weekday: 'short', day: 'numeric', month: 'short' })
  return `${p.weekday} ${p.day} ${p.month!.replace('Sept', 'Sep')}`
}
const weekdayLong = (iso: string) => parts(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso), { weekday: 'long' }).weekday!
/** "14:13" today, otherwise "Sun 18:40". */
const logTime = (iso: string) => (isToday(iso) ? timeOf(iso) : `${parts(new Date(iso), { weekday: 'short' }).weekday} ${timeOf(iso)}`)

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
const stripDot = (s: string) => s.replace(/\.$/, '')
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export const topicKey = (id: string | null, name: string) => id ?? encodeURIComponent(name)

type Chip = { label: string; href: string; kind: 'paper' | 'camera' | 'bulb' }

type ResultRow = {
  id: string
  paper_id: string
  n: number
  prompt: string
  answer_read: string
  correct: boolean
  misconception: string | null
  topic_id: string | null
  topic_name: string
  created_at: string
  papers: { kind: string; test_id: string | null; created_at: string; tests?: TestInfo | null } | null
}

const RESULT_SELECT =
  'id, paper_id, n, prompt, answer_read, correct, misconception, topic_id, topic_name, created_at, papers!inner(kind, test_id, created_at)'

type TestInfo = { title: string; out_of: number }

/** Test titles for the papers the RLS-scoped query above returned (tests are readable via the child's class). */
async function testInfo(testIds: (string | null | undefined)[]): Promise<Map<string, TestInfo>> {
  const ids = [...new Set(testIds.filter((id): id is string => Boolean(id)))]
  if (ids.length === 0) return new Map()
  const { data } = await (await createSupabaseServer()).from('tests').select('id, title, out_of').in('id', ids)
  return new Map((data ?? []).map((t) => [t.id, { title: t.title.split(':')[0]!.trim(), out_of: t.out_of }]))
}

async function withTests(rows: ResultRow[]): Promise<ResultRow[]> {
  const tests = await testInfo(rows.map((r) => r.papers?.test_id))
  for (const r of rows) if (r.papers) r.papers.tests = r.papers.test_id ? (tests.get(r.papers.test_id) ?? null) : null
  return rows
}

function paperLabel(rows: ResultRow[]): string {
  const first = rows[0]!
  const ns = [...rows].sort((a, b) => a.n - b.n).map((r) => `Q${r.n}`)
  if (first.papers?.kind === 'homework') return `Homework · ${weekdayLong(first.created_at)}`
  return `${first.papers?.tests?.title ?? 'Test'} · ${ns.join(', ')}`
}

/** One chip per paper the rows come from, in first-seen order. */
function chipsFor(childId: string, rows: ResultRow[]): Chip[] {
  const byPaper = new Map<string, ResultRow[]>()
  for (const r of rows) byPaper.set(r.paper_id, [...(byPaper.get(r.paper_id) ?? []), r])
  return [...byPaper.entries()].map(([paperId, rs]) => ({
    label: paperLabel(rs),
    href: `/p/${childId}/papers/${paperId}`,
    kind: rs[0]!.papers?.kind === 'homework' ? 'camera' : 'paper',
  }))
}

const isCurrent = (r: ResultRow) => Date.now() - new Date(r.papers?.created_at ?? r.created_at).getTime() < CURRENT_DAYS * DAY

export type MarkRow = { key: string; topicName: string; percent: number; change: number | null }

function marksByTopic(rows: ResultRow[]): MarkRow[] {
  const tests = rows.filter((r) => r.papers?.kind === 'test')
  const groups = new Map<string, ResultRow[]>()
  for (const r of tests) groups.set(r.topic_id ?? r.topic_name, [...(groups.get(r.topic_id ?? r.topic_name) ?? []), r])
  const pct = (rs: ResultRow[]) => Math.round((rs.filter((r) => r.correct).length / rs.length) * 100)
  const out: MarkRow[] = []
  for (const rs of groups.values()) {
    const cur = rs.filter(isCurrent)
    if (cur.length === 0) continue
    const prev = rs.filter((r) => !isCurrent(r))
    const latest = [...cur].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]!
    out.push({
      key: topicKey(latest.topic_id, latest.topic_name),
      topicName: latest.topic_name,
      percent: pct(cur),
      change: prev.length ? pct(cur) - pct(prev) : null,
    })
  }
  return out.sort((a, b) => a.percent - b.percent).slice(0, 5)
}

const NOTICE_SUFFIX: [RegExp, string][] = [
  [/different denominators|tops and/i, ' when the denominators are different'],
  [/decimal|last digits/i, ' when adding decimals'],
]
const GOOD_VERB: Record<string, string> = { 'Comparing fractions': 'Compares fractions well now' }

export type Notice = { text: string; chips: Chip[] }

function notices(childId: string, rows: ResultRow[], marks: MarkRow[], helpHref: string | null): Notice[] {
  const current = rows.filter(isCurrent)
  const wrong = current.filter((r) => !r.correct && r.misconception)
  const order: string[] = []
  for (const r of [...wrong].sort((a, b) => (a.papers?.kind === 'test' ? 0 : 1) - (b.papers?.kind === 'test' ? 0 : 1) || a.n - b.n)) {
    if (!order.includes(r.misconception!)) order.push(r.misconception!)
  }
  const out: Notice[] = order.map((m, i) => {
    const rs = wrong.filter((r) => r.misconception === m)
    const tests = rs.filter((r) => r.papers?.kind === 'test')
    const first = [...(tests.length ? tests : rs)].sort((a, b) => a.prompt.length - b.prompt.length || a.n - b.n)[0]!
    const suffix = NOTICE_SUFFIX.find(([re]) => re.test(`${first.topic_name} ${m}`))?.[1] ?? ''
    const chips = chipsFor(childId, [...rs].sort((a, b) => (a.papers?.kind === 'test' ? 0 : 1) - (b.papers?.kind === 'test' ? 0 : 1)))
    if (i === 0 && helpHref) chips.push({ label: 'How to help', href: helpHref, kind: 'bulb' })
    return { text: `${m}${suffix}, like ${first.prompt} = ${first.answer_read}.`, chips }
  })
  const gain = marks.filter((m) => m.percent === 100 && m.change !== null && m.change > 0).sort((a, b) => b.change! - a.change!)[0]
  if (gain) {
    const rs = current.filter((r) => r.papers?.kind === 'test' && r.correct && r.topic_name === gain.topicName)
    out.push({
      text: `${GOOD_VERB[gain.topicName] ?? `${gain.topicName}: going well now`}. Right every time since Term 3.`,
      chips: chipsFor(childId, rs),
    })
  }
  return out
}

export type ProfileData = {
  child: { id: string; firstName: string; grade: number }
  headline: string | null
  updated: string | null
  afterTest: string | null
  needs: { id: string; title: string; detail: string; href: string }[]
  marks: MarkRow[]
  notices: Notice[]
  focus: { title: string; why: string; chips: Chip[] }[]
  lookingAhead: string | null
  beyond: { note: { label: string; strong: string; rest: string } | null; attendance: { present: number; total: number } | null; activities: string | null }
  did: { time: string; text: string }[]
}

function chipFromEvidence(childId: string, byId: Map<string, ResultRow>, e: { label: string; resultIds: string[] }): Chip {
  const paperId = e.resultIds.map((id) => byId.get(id)?.paper_id).find(Boolean)
  return {
    label: e.label,
    href: paperId ? `/p/${childId}/papers/${paperId}` : `/p/${childId}/tests`,
    kind: e.label.startsWith('Homework') ? 'camera' : 'paper',
  }
}

export async function getProfile(childId: string): Promise<ProfileData | null> {
  const supabase = await createSupabaseServer()
  const [child, card, results, needs, notes, attendance, activities, log, latestTest, gaps] = await Promise.all([
    supabase.from('children').select('id, first_name, grade').eq('id', childId).maybeSingle(),
    supabase.from('guidance_cards').select('content, updated_at').eq('child_id', childId).maybeSingle(),
    supabase.from('question_results').select(RESULT_SELECT).eq('child_id', childId).order('created_at', { ascending: false }),
    supabase.from('needs_you_items').select('id, title, detail, ref_id').eq('child_id', childId).eq('status', 'open').order('created_at', { ascending: false }),
    supabase.from('observations').select('kind, text, created_at').eq('child_id', childId).order('created_at', { ascending: false }).limit(1),
    supabase.from('attendance').select('day, status').eq('child_id', childId),
    supabase.from('activities').select('name, created_at').eq('child_id', childId).order('created_at'),
    supabase.from('activity_log').select('at, text').eq('child_id', childId).order('at', { ascending: false }).limit(4),
    supabase.from('papers').select('test_id').eq('child_id', childId).eq('kind', 'test').not('test_id', 'is', null).order('created_at', { ascending: false }).limit(1),
    supabase.from('gaps').select('topic_id, topic_name, stage').eq('child_id', childId).neq('stage', 'fixed').order('created_at'),
  ])
  if (!child.data) return null

  const rows = await withTests((results.data ?? []) as unknown as ResultRow[])
  const latestTestInfo = await testInfo([latestTest.data?.[0]?.test_id])
  const byId = new Map(rows.map((r) => [r.id, r]))
  const guidance = card.data?.content as
    | { headline: string; focus: { title: string; why: string; evidence: { label: string; resultIds: string[] }[] }[]; lookingAhead: string }
    | undefined
  const marks = marksByTopic(rows)
  const firstGap = gaps.data?.[0]
  const helpHref = firstGap ? `/p/${childId}/topics/${topicKey(firstGap.topic_id, firstGap.topic_name)}` : null

  const note = notes.data?.[0]
  const days = attendance.data ?? []
  const names = (activities.data ?? []).map((a) => a.name)

  return {
    child: { id: child.data.id, firstName: child.data.first_name, grade: child.data.grade },
    headline: guidance?.headline ?? null,
    updated: card.data ? `Updated ${isToday(card.data.updated_at) ? 'today' : dayLabel(card.data.updated_at)} at ${timeOf(card.data.updated_at)}` : null,
    afterTest: latestTestInfo.get(latestTest.data?.[0]?.test_id ?? '')?.title ?? null,
    needs: (needs.data ?? []).map((n) => ({ id: n.id, title: n.title, detail: n.detail, href: `/p/${childId}/snap/${n.ref_id}` })),
    marks,
    notices: notices(childId, rows, marks, helpHref),
    focus: (guidance?.focus ?? []).map((f) => ({
      title: f.title,
      why: f.why,
      chips: f.evidence.map((e) => chipFromEvidence(childId, byId, e)),
    })),
    lookingAhead: guidance ? `Looking ahead: ${guidance.lookingAhead}` : null,
    beyond: {
      note: note
        ? isToday(note.created_at)
          ? { label: 'New note from', strong: 'Ms Banda', rest: ', today' }
          : { label: 'Note from', strong: 'Ms Banda', rest: `, ${dayLabel(note.created_at)}` }
        : null,
      attendance: days.length ? { present: days.filter((d) => d.status !== 'away').length, total: days.length } : null,
      activities: names.length ? names.map((n, i) => (i === 0 ? n : lowerFirst(n))).join(' and ') : null,
    },
    did: (log.data ?? []).map((l) => ({ time: logTime(l.at), text: l.text })),
  }
}

// ---- Beyond the tests ----------------------------------------------------------------

export type BeyondData = {
  childName: string
  teacher: string
  headline: string
  notes: { id: string; label: string; text: string; fresh: boolean }[]
  term: number
  present: number
  total: number
  away: string[]
  weeks: { label: string; days: { iso: string; dow: number; dom: number; weekday: string; status: 'here' | 'late' | 'away' }[] }[]
  activities: ActivityRow[]
}

export type ActivityRow = { id: string; kind: 'sport' | 'club' | 'music' | 'art' | 'other'; name: string; days: string[]; line: string }

const KIND_LABEL: Record<ActivityRow['kind'], string> = { sport: 'Sport', club: 'Club', music: 'Music', art: 'Art', other: 'Other' }
const DAY_LONG: Record<string, string> = { Mon: 'Mondays', Tue: 'Tuesdays', Wed: 'Wednesdays', Thu: 'Thursdays', Fri: 'Fridays', Sat: 'Saturdays', Sun: 'Sundays' }
const DAY_ORDER = Object.keys(DAY_LONG)

export function joinList(items: string[]): string {
  if (items.length < 2) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}

const kindName = (k: string) => k.charAt(0).toUpperCase() + k.slice(1)

export const termOf = (d: Date) => Math.ceil(Number(parts(d, { month: 'numeric' }).month) / 3)

function mondayOf(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}
const shortDM = (iso: string) => {
  const p = parts(new Date(`${iso}T12:00:00Z`), { day: 'numeric', month: 'short' })
  return `${p.day} ${p.month!.replace('Sept', 'Sep')}`
}

export async function getBeyond(childId: string): Promise<BeyondData | null> {
  const supabase = await createSupabaseServer()
  const [child, notes, attendance, acts] = await Promise.all([
    supabase.from('children').select('first_name').eq('id', childId).maybeSingle(),
    supabase.from('observations').select('id, kind, text, created_at, author_id').eq('child_id', childId).order('created_at', { ascending: false }),
    supabase.from('attendance').select('day, status').eq('child_id', childId).order('day'),
    supabase.from('activities').select('id, kind, name, place, days, since').eq('child_id', childId).order('created_at'),
  ])
  if (!child.data) return null
  const name = child.data.first_name
  const authors = [...new Set((notes.data ?? []).map((n) => n.author_id))]
  const { data: teachers } = authors.length ? await supabase.from('profiles').select('user_id, display_name').in('user_id', authors) : { data: [] }
  const teacher = teachers?.[0]?.display_name ?? 'Ms Banda'

  const att = attendance.data ?? []
  const away = att.filter((a) => a.status === 'away').map((a) => dayLabel(a.day))
  const byWeek = new Map<string, BeyondData['weeks'][number]['days']>()
  for (const a of att) {
    const monday = mondayOf(a.day)
    const d = new Date(`${a.day}T12:00:00Z`)
    byWeek.set(monday, [
      ...(byWeek.get(monday) ?? []),
      { iso: a.day, dow: (d.getUTCDay() + 6) % 7, dom: d.getUTCDate(), weekday: dayLabel(a.day).split(' ')[0]!, status: a.status },
    ])
  }
  const weeks = [...byWeek.entries()].map(([monday, days]) => ({ label: `Week of ${shortDM(monday)}`, days }))

  const noteList = (notes.data ?? []).map((n) => ({
    id: n.id,
    label: `${isToday(n.created_at) ? 'Today' : dayLabel(n.created_at)} · ${kindName(n.kind)}`,
    text: n.text,
    fresh: isToday(n.created_at),
  }))
  const present = att.filter((a) => a.status !== 'away').length
  const explains = (notes.data ?? []).find((n) => /explain/i.test(n.text))
  const headline = explains
    ? `${teacher} says ${name} explains her thinking well. She's been at school ${present} of ${att.length} days.`
    : `${name} has been at school ${present} of ${att.length} days.`

  return {
    childName: name,
    teacher,
    headline,
    notes: noteList,
    term: termOf(new Date()),
    present,
    total: att.length,
    away,
    weeks,
    activities: (acts.data ?? []).map((a) => ({
      id: a.id,
      kind: a.kind,
      name: a.name,
      days: a.days,
      line: [KIND_LABEL[a.kind], ...(a.days.length ? [joinList([...a.days].sort((x, y) => DAY_ORDER.indexOf(x) - DAY_ORDER.indexOf(y)).map((d) => DAY_LONG[d] ?? d))] : [])].join(' · '),
    })),
  }
}

// ---- Report ---------------------------------------------------------------------------

export type ReportData = {
  childName: string
  grade: number
  headline: string
  period: string
  term: number
  stats: { percent: number | null; testTitle: string | null; fixed: number; lessons: number }
  weeks: { label: string; items: { key: string; icon: 'calendar' | 'note' | 'camera' | 'test' | 'book'; title: string; sub: string | null; href: string }[] }[]
  working: { id: string; name: string; sub: string; href: string | null; stage: 'new' | 'practising' }[]
  fixed: { id: string; name: string; sub: string }[]
  activities: ActivityRow[]
  next: string[]
  lookingAhead: string | null
  madeOn: string
  sources: string
}

export async function getReport(childId: string): Promise<ReportData | null> {
  const supabase = await createSupabaseServer()
  const [child, results, gaps, sessions, planned, notes, attendance, acts, card, papers] = await Promise.all([
    supabase.from('children').select('first_name, grade').eq('id', childId).maybeSingle(),
    supabase.from('question_results').select(RESULT_SELECT).eq('child_id', childId),
    supabase.from('gaps').select('id, topic_id, topic_name, stage, first_practised_at, fixed_at').eq('child_id', childId).order('created_at'),
    supabase.from('sessions').select('id, topic_name, right, minutes, finished_at, question_count').eq('child_id', childId).eq('status', 'done').order('finished_at'),
    supabase.from('sessions').select('topic_name, planned_for').eq('child_id', childId).eq('status', 'planned').order('planned_for'),
    supabase.from('observations').select('id, kind, text, created_at').eq('child_id', childId).order('created_at'),
    supabase.from('attendance').select('day, status').eq('child_id', childId).order('day'),
    supabase.from('activities').select('id, kind, name, days').eq('child_id', childId).order('created_at'),
    supabase.from('guidance_cards').select('content').eq('child_id', childId).maybeSingle(),
    supabase.from('papers').select('id, kind, total, created_at, test_id').eq('child_id', childId).in('kind', ['test', 'homework']).order('created_at'),
  ])
  if (!child.data) return null
  const name = child.data.first_name
  const rows = await withTests((results.data ?? []) as unknown as ResultRow[])
  const testMap = await testInfo((papers.data ?? []).map((p) => p.test_id))
  const paperTests = (papers.data ?? []).map((p) => ({ ...p, tests: p.test_id ? (testMap.get(p.test_id) ?? null) : null }))
  const guidance = card.data?.content as { focus: { title: string }[]; lookingAhead: string } | undefined

  const att = attendance.data ?? []
  const first = att[0]?.day
  const last = att.at(-1)?.day
  const sinceMs = first ? new Date(`${first}T00:00:00Z`).getTime() : Date.now() - 14 * DAY
  const inPeriod = (iso: string) => new Date(iso).getTime() >= sinceMs - 12 * 60 * 60 * 1000
  const now = new Date()
  const term = termOf(now)
  const periodLabel = (() => {
    if (!first || !last) return ''
    const a = shortDM(first).split(' ')
    const b = shortDM(last).split(' ')
    return a[1] === b[1] ? `${a[0]} to ${b[0]} ${b[1]}` : `${shortDM(first)} to ${shortDM(last)}`
  })()

  const testPapers = paperTests.filter((p) => p.kind === 'test' && p.tests && isRecent(p.created_at))
  const latest = [...testPapers].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  const percent = latest && latest.total !== null && latest.tests ? Math.round((latest.total / latest.tests.out_of) * 100) : null

  const doneSessions = (sessions.data ?? []).filter((s) => s.finished_at && inPeriod(s.finished_at))
  const weekAgo = Date.now() - 7 * DAY
  const lessons = doneSessions.filter((s) => new Date(s.finished_at!).getTime() >= weekAgo).length
  const allGaps = gaps.data ?? []
  const nextPlanned = (topic: string) => (planned.data ?? []).find((p) => p.topic_name === topic)

  // Week by week.
  type Item = ReportData['weeks'][number]['items'][number] & { at: string }
  const weekItems = new Map<string, Item[]>()
  const push = (iso: string, item: Omit<Item, 'at'>) => {
    const monday = mondayOf(dayKey(new Date(iso)))
    weekItems.set(monday, [...(weekItems.get(monday) ?? []), { ...item, at: iso }])
  }
  const beyond = `/p/${childId}/beyond`
  const attWeeks = new Map<string, typeof att>()
  for (const a of att) attWeeks.set(mondayOf(a.day), [...(attWeeks.get(mondayOf(a.day)) ?? []), a])
  for (const [monday, days] of attWeeks) {
    const away = days.filter((d) => d.status === 'away')
    weekItems.set(monday, [
      ...(weekItems.get(monday) ?? []),
      {
        key: `att-${monday}`, icon: 'calendar', title: `At school ${days.length - away.length} of ${plural(days.length, 'day')}`,
        sub: away.length ? `Away ${joinList(away.map((a) => dayLabel(a.day)))}` : null, href: beyond, at: `${monday}T00:00:00Z`,
      },
    ])
  }
  for (const n of notes.data ?? []) {
    if (!inPeriod(n.created_at)) continue
    push(n.created_at, {
      key: n.id, icon: 'note', title: `Ms Banda: ${lowerFirst(stripDot(n.text))}`,
      sub: `${dayLabel(n.created_at)} · ${kindName(n.kind)}`, href: beyond,
    })
  }
  for (const p of paperTests) {
    if (!inPeriod(p.created_at)) continue
    if (p.kind === 'test' && p.tests) {
      push(p.created_at, {
        key: p.id, icon: 'test', title: `${p.tests.title}: ${p.total ?? 0} out of ${p.tests.out_of}`,
        sub: dayLabel(p.created_at), href: `/p/${childId}/papers/${p.id}`,
      })
    } else if (p.kind === 'homework') {
      const rs = rows.filter((r) => r.paper_id === p.id)
      if (rs.length === 0) continue
      push(p.created_at, {
        key: p.id, icon: 'camera', title: `Homework, ${lowerFirst(rs[0]!.topic_name)}: ${rs.filter((r) => r.correct).length} of ${rs.length}`,
        sub: dayLabel(p.created_at), href: `/p/${childId}/papers/${p.id}`,
      })
    }
  }
  for (const s of doneSessions) {
    const topic = s.topic_name ?? 'this topic'
    const gap = allGaps.find((g) => g.topic_name === topic)
    push(s.finished_at!, {
      key: s.id, icon: 'book',
      title: `Lesson on ${lowerFirst(topic)}: ${s.right ?? 0} of ${s.question_count ?? 5}${gap?.stage === 'practising' ? ', now practising' : ''}`,
      sub: `${dayLabel(s.finished_at!)}${s.minutes ? ` · ${s.minutes} minutes` : ''}`, href: `/p/${childId}/learn`,
    })
  }
  const weeks = [...weekItems.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monday, items]) => ({
      label: `Week of ${shortDM(monday)}`,
      items: [...items].sort((a, b) => (a.icon === 'calendar' ? -1 : b.icon === 'calendar' ? 1 : a.at.localeCompare(b.at))).map(({ at: _at, ...i }) => i),
    }))

  const working = allGaps
    .filter((g) => g.stage !== 'fixed')
    .sort((a, b) => (a.stage === b.stage ? 0 : a.stage === 'practising' ? -1 : 1))
    .map((g) => {
      const next = nextPlanned(g.topic_name)
      const nextDay = next ? weekdayLong(next.planned_for) : null
      return {
        id: g.id,
        name: g.topic_name,
        stage: g.stage as 'new' | 'practising',
        sub:
          g.stage === 'practising'
            ? `Practising since ${dayLabel(g.first_practised_at ?? new Date().toISOString())}${nextDay ? ` · check on ${nextDay}` : ''}`
            : `New${nextDay ? ` · lesson on ${nextDay}` : ''}`,
        href: g.stage === 'practising' ? `/p/${childId}/topics/${topicKey(g.topic_id, g.topic_name)}` : null,
      }
    })
  const fixed = allGaps
    .filter((g) => g.stage === 'fixed')
    .sort((a, b) => (b.fixed_at ?? '').localeCompare(a.fixed_at ?? ''))
    .map((g) => ({ id: g.id, name: g.topic_name, sub: g.fixed_at ? `Fixed ${dayLabel(g.fixed_at)}` : 'Fixed' }))

  const testCount = testPapers.length
  const hwCount = paperTests.filter((p) => p.kind === 'homework' && inPeriod(p.created_at)).length
  const noteCount = (notes.data ?? []).filter((n) => inPeriod(n.created_at)).length
  const sources = [
    plural(testCount, 'test'),
    plural(hwCount, 'homework', 'homework'),
    plural(doneSessions.length, 'lesson'),
    plural(noteCount, 'note'),
  ]
  const sourceText = `${sources.join(', ')} and the register`

  return {
    childName: name,
    grade: child.data.grade,
    headline: `${name} is steady at ${percent ?? 0}% and fixing her gaps one at a time.`,
    period: periodLabel,
    term,
    stats: { percent, testTitle: latest?.tests?.title ?? null, fixed: fixed.length, lessons },
    weeks,
    working,
    fixed,
    activities: (acts.data ?? []).map((a) => ({
      id: a.id, kind: a.kind, name: a.name, days: a.days,
      line: joinList([...a.days].sort((x, y) => DAY_ORDER.indexOf(x) - DAY_ORDER.indexOf(y)).map((d) => DAY_LONG[d] ?? d)),
    })),
    next: (guidance?.focus ?? []).map((f) => `${stripDot(f.title)}.`),
    lookingAhead: guidance ? `Looking ahead: ${guidance.lookingAhead}`.replace(/, so .*\.$/, '.') : null,
    madeOn: dayLabel(now.toISOString()),
    sources: sourceText,
  }
}

function isRecent(iso: string) {
  return Date.now() - new Date(iso).getTime() < CURRENT_DAYS * DAY
}
