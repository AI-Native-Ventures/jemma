import { createSupabaseServer } from '@/lib/supabase/server'
import { getPile, hhmm, READ_MIN } from './p31'

/** Laptop review, snap and tests: queries for the three 1440 wide boards. Reads go through RLS. */

export type ReviewPileRow = {
  id: string
  childName: string | null
  position: number
  status: string
  total: number | null
  /** Open Needs you item for this paper, when there is one. */
  itemId: string | null
  /** Answers still marked "not sure". */
  unsure: number
}

/** The papers of a test split as the review board draws them: still to check, then marked. */
export async function getReviewPile(testId: string): Promise<{ toCheck: ReviewPileRow[]; marked: ReviewPileRow[] }> {
  const supabase = await createSupabaseServer()
  const pile = await getPile(testId)
  const ids = pile.map((p) => p.id)
  if (ids.length === 0) return { toCheck: [], marked: [] }
  const [{ data: items }, { data: reads }] = await Promise.all([
    supabase.from('needs_you_items').select('id, ref_id, created_at').in('ref_id', ids).eq('status', 'open').order('created_at').order('id'),
    supabase.from('question_results').select('paper_id, read_confidence, changed_by').in('paper_id', ids),
  ])
  const itemOf = new Map<string, string>()
  for (const i of items ?? []) if (!itemOf.has(i.ref_id)) itemOf.set(i.ref_id, i.id)
  const unsure = new Map<string, number>()
  for (const r of reads ?? []) if (r.changed_by === null && r.read_confidence < READ_MIN) unsure.set(r.paper_id, (unsure.get(r.paper_id) ?? 0) + 1)

  const rows = pile.map(
    (p): ReviewPileRow => ({
      id: p.id,
      childName: p.childName,
      position: p.position,
      status: p.status,
      total: p.total,
      itemId: itemOf.get(p.id) ?? null,
      unsure: unsure.get(p.id) ?? 0,
    }),
  )
  return { toCheck: rows.filter((r) => r.status === 'needs_you'), marked: rows.filter((r) => r.status === 'marked') }
}

export type SnapView = {
  testTitle: string
  shortTitle: string
  papers: number
  pages: number
  /** Files chosen on this laptop, one paper each. */
  uploads: { id: string; name: string }[]
  /** The newest page that arrived from the phone (the board shows the latest landing). */
  fromPhone: { id: string; position: number; childName: string | null; pageNo: number; when: string }[]
  /** `14:06`, when the key was approved. */
  keyApproved: string | null
  busy: boolean
}

/** Marks files uploaded from the laptop, so the phone list can leave them out. */
export const UPLOAD_PREFIX = 'upload-'

/** Page title of a stored path: the file name without the folders. */
function baseName(path: string): string {
  return path.split('/').pop() ?? path
}

/** The laptop snap board (step 3 of 3): what is in the pile, and what arrived from the phone. */
export async function getSnapView(testId: string): Promise<SnapView | null> {
  const supabase = await createSupabaseServer()
  const { data: test } = await supabase.from('tests').select('id, title').eq('id', testId).maybeSingle()
  if (!test) return null
  const [pile, { data: key }, { data: pages }] = await Promise.all([
    getPile(testId),
    supabase.from('answer_keys').select('approved_at').eq('test_id', testId).maybeSingle(),
    supabase
      .from('paper_pages')
      .select('id, paper_id, page_no, storage_path, created_at, papers!inner(test_id)')
      .eq('papers.test_id', testId)
      .order('created_at', { ascending: false })
      .order('id'),
  ])
  const position = new Map(pile.map((p) => [p.id, p]))
  const rows = pages ?? []
  const now = Date.now()
  return {
    testTitle: test.title,
    shortTitle: test.title.split(':')[0]!.trim(),
    papers: pile.length,
    pages: rows.length,
    uploads: rows
      .filter((r) => baseName(r.storage_path).startsWith(UPLOAD_PREFIX))
      .map((r) => ({ id: r.id, name: baseName(r.storage_path).slice(UPLOAD_PREFIX.length) }))
      .reverse(),
    fromPhone: rows
      .filter((r) => !baseName(r.storage_path).startsWith(UPLOAD_PREFIX))
      .slice(0, 1)
      .map((r) => ({
        id: r.id,
        position: position.get(r.paper_id)?.position ?? 0,
        childName: position.get(r.paper_id)?.childName ?? null,
        pageNo: r.page_no,
        when: now - new Date(r.created_at).getTime() < 120_000 ? 'Just now' : hhmm(r.created_at),
      })),
    keyApproved: key?.approved_at ? hhmm(key.approved_at) : null,
    busy: pile.some((p) => p.status === 'queued' || p.status === 'reading'),
  }
}

/** "2/6 (4)" per question: the wrong answer written most often, and how many wrote it. Null when nobody missed it. */
export async function getSlips(testId: string): Promise<Map<number, string>> {
  const supabase = await createSupabaseServer()
  const { data: papers } = await supabase.from('papers').select('id').eq('test_id', testId).eq('status', 'marked')
  const ids = (papers ?? []).map((p) => p.id)
  const slips = new Map<number, string>()
  if (ids.length === 0) return slips
  const { data } = await supabase.from('question_results').select('n, answer_read, correct').in('paper_id', ids).eq('correct', false)
  const byN = new Map<number, Map<string, number>>()
  for (const r of data ?? []) {
    const counts = byN.get(r.n) ?? new Map<string, number>()
    counts.set(r.answer_read, (counts.get(r.answer_read) ?? 0) + 1)
    byN.set(r.n, counts)
  }
  for (const [n, counts] of byN) {
    const [answer, count] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]!
    slips.set(n, `${answer} (${count})`)
  }
  return slips
}

/** One line for the reteach card: "Fraction strips · 10 minutes". */
export async function getReteachCard(classId: string, topicId: string): Promise<string | null> {
  const supabase = await createSupabaseServer()
  const { data } = await supabase
    .from('reteach_plans')
    .select('content')
    .eq('class_id', classId)
    .eq('topic_id', topicId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const content = data?.content as { title?: string; minutes?: number } | null
  return content?.title && content.minutes ? `${content.title} · ${content.minutes} minutes` : null
}

/**
 * The detail panel's lead as the laptop board words it: "4 of 5 wrote 2/6. They added the tops and the bottoms."
 * `summary` is the phone sentence from `getQuestionDetail`; its second sentence (the mistake) is kept.
 */
export function laptopSummary(q: { summary: string | null; total: number; missed: { answer: string }[] }): string | null {
  if (!q.summary || q.missed.length === 0) return q.summary
  const counts = new Map<string, number>()
  for (const m of q.missed) counts.set(m.answer, (counts.get(m.answer) ?? 0) + 1)
  const [answer, count] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]!
  const cut = q.summary.indexOf('. ')
  const mistake = cut >= 0 ? ` ${q.summary.slice(cut + 2)}` : ''
  return `${count} of ${q.total} wrote ${answer}.${mistake}`
}
