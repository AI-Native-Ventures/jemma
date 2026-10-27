import type { Tables } from '@jemma/profiling/db'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'

/** Under this read confidence an answer is shown to the parent as unsure (same bar as the paper reader). */
export const UNSURE_BELOW = 0.8

export type SnapKind = 'test' | 'homework' | 'textbook' | 'report'

export const SNAP_KINDS: SnapKind[] = ['test', 'homework', 'textbook', 'report']

export const KIND_LABEL: Record<SnapKind, string> = {
  test: 'Test',
  homework: 'Homework',
  textbook: 'Textbook page',
  report: 'Report card',
}

export function asKind(value: string | undefined): SnapKind {
  return SNAP_KINDS.find((k) => k === value) ?? 'homework'
}

export type SnapPaper = Tables<'papers'> & { childFirstName: string; pageCount: number }

/** One of the parent's own papers, read through RLS. Null when it is not theirs or is not a snap. */
export async function getSnapPaper(childId: string, paperId: string): Promise<SnapPaper | null> {
  const supabase = await createSupabaseServer()
  const { data } = await supabase
    .from('papers')
    .select('*, children(first_name), paper_pages(id)')
    .eq('id', paperId)
    .eq('child_id', childId)
    .eq('owner', 'parent')
    .maybeSingle()
  if (!data) return null
  const { children, paper_pages, ...paper } = data
  return { ...paper, childFirstName: children?.first_name ?? '', pageCount: paper_pages?.length ?? 0 }
}

export type ReadAnswer = Pick<
  Tables<'question_results'>,
  'id' | 'n' | 'prompt' | 'answer_read' | 'read_confidence' | 'correct' | 'misconception' | 'topic_name' | 'changed_by' | 'previous_answer'
>

export async function getReadAnswers(paperId: string): Promise<ReadAnswer[]> {
  const supabase = await createSupabaseServer()
  const { data } = await supabase
    .from('question_results')
    .select('id, n, prompt, answer_read, read_confidence, correct, misconception, topic_name, changed_by, previous_answer')
    .eq('paper_id', paperId)
    .order('n')
  return data ?? []
}

/** A short-lived link to the first page of a snap. Checked through RLS first, then signed with the service role. */
export async function firstPageUrl(paperId: string): Promise<string | null> {
  const supabase = await createSupabaseServer()
  const { data } = await supabase.from('paper_pages').select('storage_path').eq('paper_id', paperId).order('page_no').limit(1).maybeSingle()
  if (!data) return null
  const signed = await createSupabaseAdmin().storage.from('papers').createSignedUrl(data.storage_path, 600)
  return signed.data?.signedUrl ?? null
}

export type NextLesson = { plannedFor: string; topicName: string; minutes: number | null; weekday: string }

const weekday = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })

/** The child's next planned sessions from today, soonest first. */
export async function getUpcomingLessons(childId: string, topicName?: string): Promise<NextLesson[]> {
  const supabase = await createSupabaseServer()
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await supabase
    .from('sessions')
    .select('planned_for, topic_name, planned_minutes, minutes')
    .eq('child_id', childId)
    .eq('status', 'planned')
    .gte('planned_for', today)
    .order('planned_for')
  const all = (data ?? []).map((s) => ({
    plannedFor: s.planned_for,
    topicName: s.topic_name ?? '',
    minutes: s.planned_minutes ?? s.minutes,
    weekday: weekday(s.planned_for),
  }))
  return topicName ? all.filter((s) => s.topicName === topicName) : all
}

/** Earlier marked test where this child made the same slip, for "same slip as Class Test 1". */
export async function earlierSameSlip(childId: string, paperId: string, misconception: string): Promise<{ title: string; n: number } | null> {
  const supabase = await createSupabaseServer()
  const { data } = await supabase
    .from('question_results')
    .select('n, paper_id, papers(test_id, tests(title))')
    .eq('child_id', childId)
    .eq('misconception', misconception)
    .neq('paper_id', paperId)
    .order('created_at')
    .limit(1)
    .maybeSingle()
  const title = data?.papers?.tests?.title
  return data && title ? { title, n: data.n } : null
}

const SHORT_DAY = { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' } as const
export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', SHORT_DAY).replace(',', '')
export const shortPlanned = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', SHORT_DAY).replace(',', '')
