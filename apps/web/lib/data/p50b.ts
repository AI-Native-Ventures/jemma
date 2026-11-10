import type { JemmaDb } from '@jemma/profiling/db'
import { createSupabaseServer } from '../supabase/server'

// "Share with parents": what the teacher's screens need to show the card while a test is held, and the quiet line after.
// Read with the teacher's own session, so row level security decides what they see.

const TZ = 'Africa/Johannesburg'

/** The card: a held test with at least one marked paper. */
export type ShareCardData = {
  testId: string
  /** Papers marked, each with a learner. */
  marked: number
  /** Papers still waiting for the teacher in Needs you. */
  waiting: number
}

/** `Tue 10 Nov 09:30`, in South African time. */
export function dateTimeLabel(iso: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  )
  return `${parts.weekday} ${parts.day} ${parts.month} ${parts.hour}:${parts.minute}`
}

/** Counts for one test from its papers. Null when the test is not held or nothing is marked yet: then there is no card. */
export function shareCardOf(testId: string, held: boolean, papers: { status: string; child_id: string | null }[]): ShareCardData | null {
  if (!held) return null
  const marked = papers.filter((p) => p.status === 'marked' && p.child_id).length
  if (marked === 0) return null
  return { testId, marked, waiting: papers.filter((p) => p.status === 'needs_you').length }
}

/** The card for class home: the newest held test of the class that has a marked paper. */
export async function getShareCard(classId: string, client?: JemmaDb): Promise<ShareCardData | null> {
  const supabase = client ?? ((await createSupabaseServer()) as unknown as JemmaDb)
  const { data: held } = await supabase.from('tests').select('id').eq('class_id', classId).eq('held', true).order('created_at', { ascending: false })
  if (!held?.length) return null
  const { data: papers } = await supabase.from('papers').select('test_id, status, child_id').in('test_id', held.map((t) => t.id))
  for (const t of held) {
    const card = shareCardOf(t.id, true, (papers ?? []).filter((p) => p.test_id === t.id))
    if (card) return card
  }
  return null
}

export type ShareState = {
  /** The card to show (the test is held and has a marked paper), else null. */
  card: ShareCardData | null
  /** `Shared with parents by Ms Banda, Tue 10 Nov 09:30`, once the test is shared. */
  sharedLine: string | null
}

/** Where a test stands on the test page and the progress page. */
export async function getShareState(classId: string, testId: string, client?: JemmaDb): Promise<ShareState> {
  const supabase = client ?? ((await createSupabaseServer()) as unknown as JemmaDb)
  const { data: test } = await supabase.from('tests').select('id, held, shared_at, shared_by').eq('id', testId).eq('class_id', classId).maybeSingle()
  if (!test) return { card: null, sharedLine: null }
  if (test.held) {
    const { data: papers } = await supabase.from('papers').select('status, child_id').eq('test_id', testId)
    return { card: shareCardOf(testId, true, papers ?? []), sharedLine: null }
  }
  if (!test.shared_at) return { card: null, sharedLine: null } // never held: older tests and the seeded ones that predate the gate
  // The name was kept with the approval. If that is missing, the teacher's own profile (when it is them).
  const { data: approval } = await supabase.from('approvals').select('decided_by_name').eq('kind', 'share_results').eq('ref_id', testId).order('decided_at', { ascending: false }).limit(1).maybeSingle()
  let name = approval?.decided_by_name ?? null
  if (!name && test.shared_by) {
    const { data: profile } = await supabase.from('profiles').select('display_name').eq('user_id', test.shared_by).maybeSingle()
    name = profile?.display_name ?? null
  }
  return { card: null, sharedLine: `Shared with parents by ${name ?? 'your teacher'}, ${dateTimeLabel(test.shared_at)}` }
}
