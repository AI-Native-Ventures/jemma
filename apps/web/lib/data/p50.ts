import { createSupabaseServer } from '../supabase/server'

const TZ = 'Africa/Johannesburg'

/** Entries on one page of the log. */
export const PAGE_SIZE = 50

/** The columns of `tool_calls` the log screen reads. */
export type ToolCallRow = {
  id: string
  server: string
  tool: string
  via: string
  engine: string | null
  model: string | null
  input: unknown
  output: unknown
  ok: boolean
  error: string | null
  started_at: string
  duration_ms: number
}

/** The columns of `approvals` the log screen reads. */
export type ApprovalRow = {
  id: string
  kind: string
  decision: string
  decided_by_name: string
  decided_at: string
  note: string | null
}

export type LogEntry =
  | {
      kind: 'tool'
      id: string
      at: string
      label: string
      who: string
      failed: boolean
      /** The input as formatted JSON. */
      input: string
      /** The output as formatted JSON, or the error text of a call that failed. */
      output: string
    }
  | { kind: 'approval'; id: string; at: string; name: string; text: string }

export type LogPage = {
  entries: LogEntry[]
  /** The exact time of the last entry shown, for the "Show older" link. Null when there is nothing older. */
  olderCursor: string | null
}

const TOOL_LABELS: Record<string, string> = {
  get_learner_profile: 'Read a learner profile',
  get_job: 'Looked up the next job',
  get_curriculum_doc: 'Read a curriculum document',
  get_memo: 'Read the memo photo',
  get_paper: 'Read a paper',
  get_practice_paper: 'Read the photo of a practice answered on paper',
  get_class_results: 'Read the class results',
  get_child_context: "Read a learner's background",
  complete_job: 'Finished a job',
  save_topic_map_draft: 'Saved a draft topic map',
  save_answer_key: 'Saved an answer key',
  subject_guidance: 'Saved subject guidance',
  add_observation: 'Saved a teacher note',
  record_attendance: 'Saved the register',
  add_activity: 'Saved an activity',
  mark_paper: 'Marked a paper',
  save_practice_answers: 'Marked a practice answered on paper',
  update_learner_profile: 'Updated a learner profile',
  class_gap_report: 'Wrote the class report',
  plan_next_session: 'Planned the next lesson',
  save_lesson: 'Saved a lesson',
  log_external_calls: 'Saved what an agent did on other servers',
  get_learner_history: "Read a learner's history",
  save_long_view: 'Saved the Long view',
  get_record_import: 'Read a file of past records',
  save_record_mapping: 'Worked out the columns of a past records file',
  import_learner_records: 'Added past records to the Long view',
  add_learner_record: 'Saved one past result',
}

/** A plain label for a tool call. A Jemma tool without a label keeps its raw name; a call to another server says which. */
export function toolLabel(server: string, tool: string): string {
  if (server === 'runner' && tool === 'agent_run') return 'Agent run, tokens and cost'
  if (server === 'jemma') return TOOL_LABELS[tool] ?? tool
  return `${tool} on ${server}`
}

/** Who ran the tool call. */
export function whoRan(row: Pick<ToolCallRow, 'via' | 'engine' | 'model'>): string {
  if (row.via === 'mcp') return 'Agent through MCP'
  if (row.via === 'runner') {
    const detail = [row.engine, row.model].filter(Boolean).join(', ')
    return detail ? `Runner: ${detail}` : 'Runner'
  }
  return 'Jemma cloud'
}

/** What a person did, as the end of the sentence. A function gets the note kept with the decision (`share_results` keeps the test title). */
const APPROVAL_WORDS: Record<string, Partial<Record<string, string | ((note: string | null) => string)>>> = {
  topic_map: { approved: 'approved the topic map' },
  answer_key: { approved: 'approved the answer key' },
  mark: { edited: 'changed an answer on a paper' },
  paper_name: { confirmed: 'said whose paper it is' },
  paper: { confirmed: 'confirmed a marked paper' },
  guardian_link: { approved: "approved a parent's request to link", declined: "declined a parent's request to link" },
  reteach: { confirmed: 'marked a reteach as taught' },
  homework_scan: { confirmed: 'confirmed a homework scan' },
  long_view_pattern: { approved: 'said a Long view pattern looks right', declined: 'set a Long view pattern aside' },
  long_view_talk: { confirmed: 'talked to a parent about a Long view pattern' },
  share_results: { shared: (note) => `shared the results of ${note?.trim() || 'a test'} with parents` },
  record_import: { approved: (note) => `approved adding the past records in ${note?.trim() || 'a file'}` },
}

/** "Ms Banda approved the topic map". */
export function approvalText(row: Pick<ApprovalRow, 'kind' | 'decision' | 'decided_by_name'> & { note?: string | null }): string {
  const found = APPROVAL_WORDS[row.kind]?.[row.decision]
  const words = typeof found === 'function' ? found(row.note ?? null) : (found ?? `${row.decision} ${row.kind}`)
  return `${row.decided_by_name} ${words}`
}

const parts = (d: Date, opts: Intl.DateTimeFormatOptions) =>
  Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...opts }).formatToParts(d).map((p) => [p.type, p.value]))

const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d)

/** `14:12` for today, `Sun 8 Nov 18:40` for an older entry, in South African time. */
export function timeLabel(iso: string, now: Date): string {
  const d = new Date(iso)
  const clock = parts(d, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const hm = `${clock.hour}:${clock.minute}`
  if (dayKey(d) === dayKey(now)) return hm
  const day = parts(d, { weekday: 'short', day: 'numeric', month: 'short' })
  return `${day.weekday} ${day.day} ${day.month} ${hm}`
}

/** Orders times to the microsecond: Postgres keeps more than a JS Date does. */
function stamp(raw: string): number {
  const micro = Number((/\.(\d+)/.exec(raw)?.[1] ?? '').padEnd(6, '0').slice(3, 6))
  return Date.parse(raw) * 1000 + micro
}

const json = (value: unknown) => JSON.stringify(value ?? null, null, 2)

/**
 * One time-ordered list from both tables, newest first, cut to one page. `olderCursor` is the exact stored time of the
 * last entry shown (not a rounded one), so the next page starts right after it.
 */
export function mergeLog(tools: ToolCallRow[], approvals: ApprovalRow[], now: Date): LogPage {
  const all = [
    ...tools.map((row) => ({ at: row.started_at, entry: toolEntry(row, now) })),
    ...approvals.map((row) => ({ at: row.decided_at, entry: approvalEntry(row, now) })),
  ].sort((a, b) => stamp(b.at) - stamp(a.at))
  const shown = all.slice(0, PAGE_SIZE)
  return { entries: shown.map((s) => s.entry), olderCursor: all.length > PAGE_SIZE ? shown[shown.length - 1]!.at : null }
}

function toolEntry(row: ToolCallRow, now: Date): LogEntry {
  return {
    kind: 'tool',
    id: row.id,
    at: timeLabel(row.started_at, now),
    label: toolLabel(row.server, row.tool),
    who: whoRan(row),
    failed: !row.ok,
    input: json(row.input),
    output: !row.ok && row.output === null ? (row.error ?? 'It failed.') : json(row.output),
  }
}

function approvalEntry(row: ApprovalRow, now: Date): LogEntry {
  return { kind: 'approval', id: row.id, at: timeLabel(row.decided_at, now), name: row.decided_by_name, text: approvalText(row) }
}

export type LogView = {
  className: string
  page: LogPage
  /** True when this is an older page, so the screen can offer a way back to the newest. */
  older: boolean
}

/**
 * The log for a teacher's class, read with the teacher's own session so row level security decides what they see:
 * their school's tool calls and approvals. Null when the person is not a teacher or the class is not theirs.
 * `before` is the cursor of the "Show older" link.
 */
export async function getLogView(classId: string, before?: string): Promise<LogView | null> {
  const supabase = await createSupabaseServer()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', auth.user.id).maybeSingle()
  if (profile?.role !== 'teacher') return null
  const { data: cls } = await supabase.from('classes').select('id, name').eq('id', classId).maybeSingle()
  if (!cls) return null

  const cursor = before && !Number.isNaN(Date.parse(before)) ? before : undefined
  let toolQuery = supabase
    .from('tool_calls')
    .select('id, server, tool, via, engine, model, input, output, ok, error, started_at, duration_ms')
    .order('started_at', { ascending: false })
    .limit(PAGE_SIZE + 1)
  let approvalQuery = supabase
    .from('approvals')
    .select('id, kind, decision, decided_by_name, decided_at, note')
    .order('decided_at', { ascending: false })
    .limit(PAGE_SIZE + 1)
  if (cursor) {
    toolQuery = toolQuery.lt('started_at', cursor)
    approvalQuery = approvalQuery.lt('decided_at', cursor)
  }
  const [tools, approvals] = await Promise.all([toolQuery, approvalQuery])
  if (tools.error) throw new Error(`log: ${tools.error.message}`)
  if (approvals.error) throw new Error(`log: ${approvals.error.message}`)
  return { className: cls.name, page: mergeLog(tools.data, approvals.data, new Date()), older: Boolean(cursor) }
}
