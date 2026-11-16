import { createSupabaseServer } from '@/lib/supabase/server'

/** The columns of `ai_usage` this screen reads (P137). */
export type UsageRow = {
  job: string
  prompt_tokens: number | null
  completion_tokens: number | null
  total_tokens: number | null
  reported: boolean
}

/** The kinds of work in plain words. Every job the agent runs is under one of them; a job nobody listed is "Other". */
const KIND: Record<string, string> = {
  write_lesson: 'Lessons',
  read_paper: 'Photo reading',
  read_marked_test: 'Photo reading',
  read_key: 'Photo reading',
  diagnose: 'Marking',
  class_report: 'Analysis',
  guidance: 'Analysis',
  long_view: 'Analysis',
}

export const groupOf = (job: string): string => KIND[job] ?? 'Other'

/** 12345 as "12,345". */
export const thousands = (n: number): string => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/** The tokens of one row: its total, or its prompt and completion added up when the total is missing. A call that did not report has none. */
const tokensOf = (r: UsageRow): number => r.total_tokens ?? (r.prompt_tokens ?? 0) + (r.completion_tokens ?? 0)

/** All the tokens, the number of calls that did not report, and the tokens by kind of work (biggest first, kinds with none left out). */
export function summariseUsage(rows: UsageRow[]): { total: number; unreported: number; groups: { label: string; tokens: number }[] } {
  const by = new Map<string, number>()
  let total = 0
  let unreported = 0
  for (const r of rows) {
    if (!r.reported) unreported++
    const n = tokensOf(r)
    total += n
    if (n > 0) by.set(groupOf(r.job), (by.get(groupOf(r.job)) ?? 0) + n)
  }
  const groups = [...by].map(([label, tokens]) => ({ label, tokens })).sort((a, b) => b.tokens - a.tokens)
  return { total, unreported, groups }
}

/**
 * The words on the screen, from rows already read. "AI used 12,345 tokens" with a small split by kind of work. A call whose reply held no usage is never
 * given a made-up count: it is said so in words. With no rows it shows nothing.
 */
export function AiTokensView({ rows, whose, atLeast = false }: { rows: UsageRow[]; whose: 'class' | 'learner'; atLeast?: boolean }) {
  if (rows.length === 0) return null
  const { total, unreported, groups } = summariseUsage(rows)
  const owner = whose === 'class' ? 'for this class' : 'for this learner'
  return (
    <section aria-label="AI use" className="flex flex-col gap-0.5 text-[13px] leading-[1.4] text-body">
      {total > 0 ? (
        <p className="m-0">
          <strong className="font-semibold text-ink">
            AI used {atLeast ? 'at least ' : ''}
            {thousands(total)} tokens
          </strong>{' '}
          {owner}
        </p>
      ) : (
        <p className="m-0">
          AI ran {rows.length} {rows.length === 1 ? 'time' : 'times'} {owner} and did not report its tokens.
        </p>
      )}
      {total > 0 && groups.length > 0 ? <p className="m-0">{groups.map((g) => `${g.label} ${thousands(g.tokens)}`).join(' · ')}</p> : null}
      {total > 0 && unreported > 0 ? (
        <p className="m-0">
          {unreported} AI {unreported === 1 ? 'call' : 'calls'} did not report {unreported === 1 ? 'its' : 'their'} tokens, so the number is a little low.
        </p>
      ) : null}
    </section>
  )
}

const PAGE = 1000
/** 30 000 rows is far more than a class makes; past it the screen says "at least". */
const MAX_PAGES = 30

/**
 * Reads the rows with the teacher's own client, so row-level security decides what is theirs, a page at a time (the database gives at most a thousand
 * rows in one answer). Any error (the table is missing, a page fails, no session) gives nothing: a number that is too low is worse than none.
 */
async function readRows(scope: { classId?: string; childId?: string }): Promise<{ rows: UsageRow[]; atLeast: boolean } | null> {
  if (!scope.classId && !scope.childId) return null
  try {
    const supabase = await createSupabaseServer()
    const rows: UsageRow[] = []
    for (let page = 0; page < MAX_PAGES; page++) {
      const query = supabase
        .from('ai_usage')
        .select('job, prompt_tokens, completion_tokens, total_tokens, reported')
        .order('created_at', { ascending: true })
        .range(page * PAGE, page * PAGE + PAGE - 1)
      const { data, error } = await (scope.childId ? query.eq('child_id', scope.childId) : query.eq('class_id', scope.classId!))
      if (error || !data) return null
      rows.push(...data)
      if (data.length < PAGE) return { rows, atLeast: false }
    }
    return { rows, atLeast: true }
  } catch {
    return null
  }
}

/**
 * What the AI has used, in real tokens, for a class (`classId`) or for one learner (`childId`): a server component that reads `ai_usage` under the
 * teacher's own row-level security. The table missing, empty or unreadable shows nothing and never an error.
 */
export async function AiTokens({ classId, childId }: { classId?: string; childId?: string }) {
  const found = await readRows({ classId, childId })
  if (!found) return null
  return <AiTokensView rows={found.rows} whose={childId ? 'learner' : 'class'} atLeast={found.atLeast} />
}
