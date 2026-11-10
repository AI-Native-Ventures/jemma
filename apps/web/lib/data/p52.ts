import type { JemmaDb, Tables } from '@jemma/profiling/db'
import {
  STRENGTH_FROM,
  STRUGGLE_BELOW,
  buildTable,
  compareSlots,
  historySlots,
  missingSlots,
  plainDate,
  recordLabel,
  slotKey,
  type LongViewRecord,
  type LongViewResult,
  type SlotRef,
} from '@jemma/profiling/logic'
import { LongViewEvidenceListSchema, LongViewStoredTermsSchema, type LongViewEvidence, type LongViewKind, type LongViewStatus, type LongViewStoredTerm, type LongViewTerm } from '@jemma/profiling/schemas'
import { createSupabaseServer } from '../supabase/server'

// The Long view screens read here, always with the signed-in person's own session (row level security decides what they see).
// `buildLongView` is pure: the screen and the tool both use `buildTable`, so the grid can never disagree with what the tool found.

const DAY_MS = 24 * 60 * 60 * 1000
/** A record written into the records more than this many days after it happened is "logged late" (the same rule as `get_learner_history`). */
export const LATE_AFTER_DAYS = 60
/** An update that was queued or running this long ago is taken as lost: the screen shows the retry card instead of waiting for ever. */
export const STALE_AFTER_MS = 15 * 60_000
/** Opening the screen asks for an update only when none was asked for in this time. */
export const OPEN_UPDATE_GAP_MS = 10 * 60_000

export type PatternRow = Tables<'long_view_patterns'>

// ---------- words ----------

const STRANDS: Record<string, string> = {
  whole_numbers: 'Whole numbers',
  fractions: 'Fractions',
  decimals: 'Decimals',
  shapes: 'Shapes and space',
  measurement: 'Measurement',
  data: 'Data handling',
}
const STRAND_ORDER = Object.keys(STRANDS)

/** Plain strand name. A family the six names do not cover is tidied (`patterns_and_algebra` becomes `Patterns and algebra`). */
export function strandName(family: string): string {
  const known = STRANDS[family]
  if (known) return known
  const words = family.replace(/[_-]+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Other'
}

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many)

export type DotLevel = 'full' | 'half' | 'empty' | 'none'

/** Full from 80 percent, half from 50 to 79, empty below 50. */
export function levelOf(percent: number): Exclude<DotLevel, 'none'> {
  if (percent >= STRENGTH_FROM) return 'full'
  if (percent < STRUGGLE_BELOW) return 'empty'
  return 'half'
}

/** `Fractions, Grade 5 Term 2: 40 percent, 10 marks`, or `no results` when the term has nothing for the strand. */
export function cellAlt(strand: string, grade: number, term: number, cell: { percent: number; points: number } | null): string {
  const where = `${strand}, Grade ${grade} Term ${term}`
  return cell ? `${where}: ${cell.percent} percent, ${cell.points} ${plural(cell.points, 'mark')}` : `${where}: no results`
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** South Africa is UTC+2 all year. */
const SAST_MS = 2 * 60 * 60 * 1000

/** A timestamp as South African wall clock, read through the UTC fields of the shifted date. */
const local = (iso: string) => new Date(Date.parse(iso) + SAST_MS)
const pad = (n: number) => String(n).padStart(2, '0')
const dayKey = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`

/** `8 Nov 2026`, for a stamp or a plain date. */
export function dateLabel(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return plainDate(iso)
  const d = local(iso)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** `today at 14:12`, `yesterday at 14:12`, or `Tue 3 Nov at 14:12`, in South African time. */
export function whenLabel(iso: string, now: Date): string {
  const d = local(iso)
  const at = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  const today = new Date(now.getTime() + SAST_MS)
  if (dayKey(d) === dayKey(today)) return `today at ${at}`
  if (dayKey(d) === dayKey(new Date(today.getTime() - DAY_MS))) return `yesterday at ${at}`
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} at ${at}`
}

/** `Struggle · 3 terms running` while it runs to the newest term, `Struggle · 3 terms` once newer terms followed it. */
export function pillText(kind: LongViewKind, runTerms: number, hasNewer: boolean): string {
  const word = kind === 'struggle' ? 'Struggle' : 'Strength'
  return `${word} · ${runTerms} terms${kind === 'struggle' && !hasNewer ? ' running' : ''}`
}

const andList = (items: string[]) => (items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`)

/** One line for each grade: `No results for Grade 5, Terms 2 and 3`. */
export function linesFor(missing: { grade?: number; year: number; term: number }[]): string[] {
  const byGrade = new Map<number, number[]>()
  for (const m of missing) {
    const grade = m.grade ?? 0
    byGrade.set(grade, [...(byGrade.get(grade) ?? []), m.term])
  }
  return [...byGrade].map(([grade, terms]) => {
    const where = grade ? `Grade ${grade}, ` : ''
    return `No results for ${where}${plural(terms.length, 'Term')} ${andList(terms.map(String))}`
  })
}

/** The run first, then the newer terms that were stored after it (flagged `since`). */
export function groupTerms(terms: LongViewStoredTerm[]): { run: LongViewTerm[]; since: LongViewTerm[] } {
  const strip = ({ since: _since, ...t }: LongViewStoredTerm): LongViewTerm => t
  return { run: terms.filter((t) => !t.since).map(strip), since: terms.filter((t) => t.since).map(strip) }
}

type SummaryRow = { status: string; active: boolean }

/** The one line on the profile card. */
export function summaryLine(rows: SummaryRow[]): string {
  const live = rows.filter((r) => r.active)
  const drafts = live.filter((r) => r.status === 'draft').length
  if (drafts > 0) return `${drafts} ${plural(drafts, 'pattern waits', 'patterns wait')} for you`
  const checked = live.filter((r) => r.status === 'approved' || r.status === 'discussed').length
  if (checked > 0) return `${checked} ${plural(checked, 'pattern')} you have checked`
  const aside = live.filter((r) => r.status === 'dismissed').length
  if (aside > 0) return `You set aside ${aside} ${plural(aside, 'pattern')}`
  return 'Too early to tell'
}

// ---------- the view ----------

export type LvSheet = {
  title: string
  teacher: string | null
  grade: number | null
  term: number | null
  date: string
  marks: string | null
  text: string | null
  late: boolean
}

export type LvEvidence =
  | { kind: 'result'; id: string; label: string; href: string | null }
  | { kind: 'record'; id: string; label: string; sheet: LvSheet | null }
  | { kind: 'note'; id: string; label: string; sheet: LvSheet | null }

export type LvPattern = {
  id: string
  kind: LongViewKind
  family: string
  strand: string
  title: string
  statement: string
  runTerms: number
  pill: string
  /** `Since then: Grade 6 Term 3, 63 percent · ...`, or null when nothing came after the run. */
  since: string | null
  evidence: LvEvidence[]
  status: LongViewStatus
  active: boolean
  /** The records no longer show this pattern: it sits in "Set aside" with a plain line. */
  noLongerShows: boolean
  approvedOn: string | null
  discussedOn: string | null
  discussedBy: string | null
  dismissedOn: string | null
}

export type LvCell = { level: DotLevel; percent: number | null; points: number | null; alt: string }
export type LvColumn = { key: string; grade: number; year: number; term: number }

export type LvUpdate = {
  state: 'idle' | 'running' | 'failed'
  /** `today at 14:12`, or null when no update ever finished. */
  lastUpdated: string | null
  /** True when opening the screen should ask for an update: no pattern rows and no update in the last 10 minutes. */
  askOnOpen: boolean
}

export type LongView = {
  classId: string
  className: string
  childId: string
  name: string
  grade: number
  spanLine: string | null
  columns: LvColumn[]
  gradeGroups: { grade: number; span: number }[]
  rows: { family: string; name: string; cells: LvCell[] }[]
  groups: { drafts: LvPattern[]; approved: LvPattern[]; shared: LvPattern[]; setAside: LvPattern[] }
  patternCount: number
  missing: string[]
  unclear: string[]
  late: string[]
  /** The linked parent's first name, or null when no approved link exists. */
  parentName: string | null
  update: LvUpdate
}

export type LongViewInput = {
  now: Date
  classId: string
  className: string
  child: { id: string; firstName: string; grade: number; parentFirstName: string | null }
  /** True when an approved parent link exists. */
  hasParent: boolean
  records: LongViewRecord[]
  /** This year's marked answers, each with the paper and question it came from. */
  results: (LongViewResult & { paperId: string; n: number })[]
  observations: { id: string; authorName: string | null; text: string; createdAt: string }[]
  patterns: PatternRow[]
  events: { status: string; created_at: string; finished_at: string | null; error: string | null }[]
}

const isLate = (r: Pick<LongViewRecord, 'happenedOn' | 'loggedAt'>) => Date.parse(r.loggedAt) - Date.parse(r.happenedOn) > LATE_AFTER_DAYS * DAY_MS

function sheetOfRecord(r: LongViewRecord): LvSheet {
  return {
    title: r.title,
    teacher: r.teacherName,
    grade: r.grade,
    term: r.term,
    date: plainDate(r.happenedOn),
    marks: r.marks !== null && r.outOf !== null ? `${r.marks} out of ${r.outOf}` : null,
    text: r.text,
    late: isLate(r),
  }
}

/** `Class Test 1, question 4` is shown as `Class Test 1 · Q4`. */
const answerLabel = (label: string) => label.replace(/, question (\d+)$/, ' · Q$1')

/** Each run of marked answers is put in question order (Q2 before Q10). Records and notes keep the order they were stored in. */
function inQuestionOrder(chips: LvEvidence[]): LvEvidence[] {
  const out: LvEvidence[] = []
  let run: LvEvidence[] = []
  const flush = () => {
    out.push(...run.sort((a, b) => a.label.localeCompare(b.label, 'en', { numeric: true })))
    run = []
  }
  for (const chip of chips) {
    if (chip.kind === 'result') run.push(chip)
    else {
      flush()
      out.push(chip)
    }
  }
  flush()
  return out
}

const byKindThenFamily =(a: LvPattern, b: LvPattern) => (a.kind === b.kind ? 0 : a.kind === 'struggle' ? -1 : 1) || a.family.localeCompare(b.family)

function updateOf(events: LongViewInput['events'], patterns: PatternRow[], now: Date): LvUpdate {
  const sorted = [...events].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
  const age = (e: { created_at: string }) => now.getTime() - Date.parse(e.created_at)
  const waiting = (e: { status: string }) => e.status === 'queued' || e.status === 'running'
  const running = sorted.some((e) => waiting(e) && age(e) < STALE_AFTER_MS)
  const newest = sorted[0]
  const failed = !running && !!newest && (newest.status === 'failed' || (waiting(newest) && age(newest) >= STALE_AFTER_MS))
  const lastDone = sorted.find((e) => e.status === 'done' && e.finished_at)
  return {
    state: running ? 'running' : failed ? 'failed' : 'idle',
    lastUpdated: lastDone ? whenLabel(lastDone.finished_at!, now) : null,
    askOnOpen: patterns.length === 0 && !sorted.some((e) => age(e) < OPEN_UPDATE_GAP_MS),
  }
}

/** Builds everything the screen shows from rows already read. No database, no clock but `now`. */
export function buildLongView(input: LongViewInput): LongView {
  const { now, child, records, results } = input
  const { table, notCounted } = buildTable(records, results)
  const slots = historySlots(records, results, child.grade)
  const everyTerm: (SlotRef & { grade?: number })[] = [...slots, ...missingSlots(slots)].sort(compareSlots)
  const columns: LvColumn[] = everyTerm.map((s) => ({ key: slotKey(s), grade: s.grade ?? 0, year: s.year, term: s.term }))
  const gradeGroups = columns.reduce<{ grade: number; span: number }[]>((groups, c) => {
    const last = groups[groups.length - 1]
    if (last && last.grade === c.grade) last.span += 1
    else groups.push({ grade: c.grade, span: 1 })
    return groups
  }, [])

  const rows = [...table]
    .sort((a, b) => {
      const ai = STRAND_ORDER.indexOf(a.family)
      const bi = STRAND_ORDER.indexOf(b.family)
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.family.localeCompare(b.family)
    })
    .map((f) => {
      const name = strandName(f.family)
      const bySlot = new Map(f.slots.map((s) => [slotKey(s), s]))
      return {
        family: f.family,
        name,
        cells: columns.map((c): LvCell => {
          const hit = bySlot.get(c.key)
          return hit
            ? { level: levelOf(hit.percent), percent: hit.percent, points: hit.points, alt: cellAlt(name, c.grade, c.term, hit) }
            : { level: 'none', percent: null, points: null, alt: cellAlt(name, c.grade, c.term, null) }
        }),
      }
    })

  const teachers = new Set([...records.map((r) => r.teacherName), ...input.observations.flatMap((o) => (o.authorName ? [o.authorName] : []))])
  const first = slots[0]
  const last = slots[slots.length - 1]
  const spanLine = !first || !last
    ? null
    : `${first.grade === last.grade ? `Grade ${first.grade}` : `Grade ${first.grade} to Grade ${last.grade}`} · ${columns.length} ${plural(columns.length, 'term')} · ${teachers.size} ${plural(teachers.size, 'teacher')}`

  // Evidence: a marked answer links to its paper, a record or a note opens a sheet.
  const recordById = new Map(records.map((r) => [r.id, r]))
  const resultById = new Map(results.map((r) => [r.id, r]))
  const noteById = new Map(input.observations.map((o) => [o.id, o]))
  const chipOf = (e: LongViewEvidence): LvEvidence => {
    if (e.kind === 'result') {
      const hit = resultById.get(e.id)
      return { kind: 'result', id: e.id, label: answerLabel(e.label), href: hit ? `/t/${input.classId}/papers/${hit.paperId}?q=${hit.n}` : null }
    }
    const rec = recordById.get(e.id)
    if (rec) return { kind: e.kind, id: e.id, label: e.label, sheet: sheetOfRecord(rec) }
    const obs = noteById.get(e.id)
    if (obs) {
      const when = local(obs.createdAt)
      const sheet: LvSheet = {
        title: 'Teacher note',
        teacher: obs.authorName,
        grade: child.grade,
        term: Math.ceil((when.getUTCMonth() + 1) / 3),
        date: dateLabel(obs.createdAt),
        marks: null,
        text: obs.text,
        late: false,
      }
      return { kind: e.kind, id: e.id, label: e.label, sheet }
    }
    return { kind: e.kind, id: e.id, label: e.label, sheet: null }
  }

  const views: LvPattern[] = input.patterns.map((p) => {
    const kind: LongViewKind = p.kind === 'strength' ? 'strength' : 'struggle'
    const terms = LongViewStoredTermsSchema.safeParse(p.terms)
    const { run, since } = groupTerms(terms.success ? terms.data : [])
    const evidence = LongViewEvidenceListSchema.safeParse(p.evidence)
    return {
      id: p.id,
      kind,
      family: p.family,
      strand: strandName(p.family),
      title: p.title,
      statement: p.statement,
      runTerms: run.length,
      pill: pillText(kind, run.length, since.length > 0),
      since: since.length ? `Since then: ${since.map((t) => `Grade ${t.grade} Term ${t.term}, ${Math.round(t.percent)} percent`).join(' · ')}` : null,
      evidence: inQuestionOrder((evidence.success ? evidence.data : []).map(chipOf)),
      status: p.status as LongViewStatus,
      active: p.active,
      noLongerShows: !p.active,
      approvedOn: p.approved_at ? dateLabel(p.approved_at) : null,
      discussedOn: p.discussed_at ? dateLabel(p.discussed_at) : null,
      discussedBy: p.discussed_by_name,
      dismissedOn: p.dismissed_at ? dateLabel(p.dismissed_at) : null,
    }
  })
  const live = views.filter((p) => p.active)
  const groups = {
    drafts: live.filter((p) => p.status === 'draft').sort(byKindThenFamily),
    approved: live.filter((p) => p.status === 'approved').sort(byKindThenFamily),
    shared: live.filter((p) => p.status === 'discussed').sort(byKindThenFamily),
    setAside: [...live.filter((p) => p.status === 'dismissed').sort(byKindThenFamily), ...views.filter((p) => !p.active).sort(byKindThenFamily)],
  }

  return {
    classId: input.classId,
    className: input.className,
    childId: child.id,
    name: child.firstName,
    grade: child.grade,
    spanLine,
    columns,
    gradeGroups,
    rows,
    groups,
    patternCount: views.length,
    missing: linesFor(missingSlots(slots)),
    unclear: notCounted.map((n) => n.label),
    late: records
      .filter(isLate)
      .sort((a, b) => a.happenedOn.localeCompare(b.happenedOn) || recordLabel(a).localeCompare(recordLabel(b)))
      .map(recordLabel),
    parentName: input.hasParent ? child.parentFirstName?.trim() || 'the parent' : null,
    update: updateOf(input.events, input.patterns, now),
  }
}

// ---------- reading ----------

type Rows<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

async function all<T>(q: Rows<T>, what: string): Promise<T[]> {
  const { data, error } = await q
  if (error) throw new Error(`long view: ${what}: ${error.message}`)
  return data ?? []
}

/**
 * Reads one learner's Long view with the client it is given (the teacher's own session) and builds it.
 * Null when the learner is not in the class or the teacher cannot see them.
 */
export async function loadLongView(db: JemmaDb, classId: string, childId: string, now = new Date()): Promise<LongView | null> {
  const { data: enrolled } = await db
    .from('enrolments')
    .select('classes(name), children(id, first_name, grade, parent_first_name)')
    .eq('class_id', classId)
    .eq('child_id', childId)
    .maybeSingle()
  const child = enrolled?.children
  if (!child) return null

  const [rows, answers, observations, patterns, links, events] = await Promise.all([
    all(db.from('learner_records').select('*').eq('child_id', childId), 'records'),
    all(db.from('question_results').select('id, paper_id, n, correct, topic_id').eq('child_id', childId).not('topic_id', 'is', null), 'answers'),
    all(db.from('observations').select('id, author_id, text, created_at').eq('child_id', childId), 'notes'),
    all(db.from('long_view_patterns').select('*').eq('child_id', childId), 'patterns'),
    all(db.from('parent_links').select('id').eq('child_id', childId).eq('status', 'approved').limit(1), 'parent link'),
    all(
      db
        .from('events')
        .select('status, created_at, finished_at, error')
        .eq('type', 'long_view.requested')
        .eq('payload->>childId', childId)
        .order('created_at', { ascending: false })
        .limit(10),
      'updates',
    ),
  ])

  const records: LongViewRecord[] = rows.map((r) => ({
    id: r.id,
    source: r.source as LongViewRecord['source'],
    grade: r.grade,
    year: r.year,
    term: r.term,
    happenedOn: r.happened_on,
    loggedAt: r.logged_at,
    teacherName: r.teacher_name,
    title: r.title,
    family: r.family,
    topicName: r.topic_name,
    marks: r.marks,
    outOf: r.out_of,
    quality: r.quality === 'unclear' ? 'unclear' : 'clear',
    text: r.text,
    present: r.present,
    total: r.total,
  }))

  // This year's marked answers: the family comes from the topic, the date from the test (or the paper), as `get_learner_history` does it.
  const topicIds = [...new Set(answers.map((a) => a.topic_id!))]
  const paperIds = [...new Set(answers.map((a) => a.paper_id))]
  const [topics, papers] = await Promise.all([
    topicIds.length ? all(db.from('topics').select('id, family').in('id', topicIds), 'topics') : Promise.resolve([]),
    paperIds.length ? all(db.from('papers').select('id, test_id, created_at').in('id', paperIds), 'papers') : Promise.resolve([]),
  ])
  const testIds = [...new Set(papers.map((p) => p.test_id).filter((t): t is string => !!t))]
  const tests = testIds.length ? await all(db.from('tests').select('id, title, written_on').in('id', testIds), 'tests') : []
  const familyOf = new Map(topics.map((t) => [t.id, t.family]))
  const paperOf = new Map(papers.map((p) => [p.id, p]))
  const testOf = new Map(tests.map((t) => [t.id, t]))
  const results = answers.flatMap((a) => {
    const family = familyOf.get(a.topic_id!)
    const paper = paperOf.get(a.paper_id)
    if (!family || !paper) return []
    const test = paper.test_id ? testOf.get(paper.test_id) : undefined
    return [
      { id: a.id, correct: a.correct, family, isoDate: test?.written_on ?? paper.created_at, label: `${test?.title ?? 'Homework'}, question ${a.n}`, grade: child.grade, paperId: a.paper_id, n: a.n },
    ]
  })

  const authorIds = [...new Set(observations.map((o) => o.author_id))]
  const authors = authorIds.length ? await all(db.from('profiles').select('user_id, display_name').in('user_id', authorIds), 'authors') : []
  const authorName = new Map(authors.map((a) => [a.user_id, a.display_name]))

  return buildLongView({
    now,
    classId,
    className: enrolled.classes?.name ?? '',
    child: { id: child.id, firstName: child.first_name, grade: child.grade, parentFirstName: child.parent_first_name },
    hasParent: links.length > 0,
    records,
    results,
    observations: observations.map((o) => ({ id: o.id, authorName: authorName.get(o.author_id) ?? null, text: o.text, createdAt: o.created_at })),
    patterns,
    events,
  })
}

/** The signed-in person's role, or null when nobody is signed in. */
async function roleOf(db: JemmaDb): Promise<string | null> {
  const { data: auth } = await db.auth.getUser()
  if (!auth.user) return null
  const { data: profile } = await db.from('profiles').select('role').eq('user_id', auth.user.id).maybeSingle()
  return profile?.role ?? null
}

/** The teacher's Long view of one learner. Null for anyone who is not a teacher of the class. */
export async function getLongView(classId: string, childId: string): Promise<LongView | null> {
  const supabase = (await createSupabaseServer()) as unknown as JemmaDb
  if ((await roleOf(supabase)) !== 'teacher') return null
  return loadLongView(supabase, classId, childId)
}

/** The one line on the teacher's profile card. */
export async function getLongViewSummary(childId: string): Promise<string> {
  const supabase = await createSupabaseServer()
  const { data } = await supabase.from('long_view_patterns').select('status, active').eq('child_id', childId)
  return summaryLine(data ?? [])
}

export type SharedPattern = { id: string; title: string; statement: string; labels: string[]; sharedOn: string }
export type SharedLongView = { childName: string; teacherName: string; patterns: SharedPattern[] }

/**
 * What a parent may read: the patterns the teacher has talked through with them. The row policy returns only status `discussed`;
 * a pattern the records no longer show (`active = false`) is left out here, because the policy does not check it.
 * Null when the person is not a parent or has nothing shared, so the route can answer not found.
 */
export async function loadSharedLongView(db: JemmaDb, childId: string): Promise<SharedLongView | null> {
  if ((await roleOf(db)) !== 'parent') return null
  const [child, rows] = await Promise.all([
    db.from('children').select('first_name').eq('id', childId).maybeSingle(),
    db
      .from('long_view_patterns')
      .select('id, title, statement, evidence, discussed_at, discussed_by_name')
      .eq('child_id', childId)
      .eq('status', 'discussed')
      .eq('active', true)
      .order('discussed_at', { ascending: false }),
  ])
  if (!child.data || rows.error || !rows.data?.length) return null
  return {
    childName: child.data.first_name,
    teacherName: rows.data[0]!.discussed_by_name ?? 'the teacher',
    patterns: rows.data.map((p) => {
      const evidence = LongViewEvidenceListSchema.safeParse(p.evidence)
      return {
        id: p.id,
        title: p.title,
        statement: p.statement,
        labels: (evidence.success ? evidence.data : []).map((e) => answerLabel(e.label)),
        sharedOn: p.discussed_at ? dateLabel(p.discussed_at) : '',
      }
    }),
  }
}

/** The parent's own session, through `loadSharedLongView`. */
export async function getSharedLongView(childId: string): Promise<SharedLongView | null> {
  return loadSharedLongView((await createSupabaseServer()) as unknown as JemmaDb, childId)
}
