'use server'

import { createServiceClient } from '@jemma/profiling/db'
import { insertActivity } from '@jemma/profiling/records'
import { requireRole } from '@/lib/auth'
import { sendEvent } from '@/lib/agent'
import { createSupabaseServer } from '@/lib/supabase/server'

const KINDS = ['sport', 'club', 'music', 'art', 'other'] as const
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const SINCE = ['This term', 'Last term', 'This year', 'Longer']

export type ActivityInput = { kind: (typeof KINDS)[number] | null; name: string; place: string; days: string[]; since: string }
export type SaveResult = { ok: true } | { ok: false; error: string }

/** Saves an activity for a child the parent can see, then tells the agent (`activity.added`). */
export async function saveActivity(childId: string, input: ActivityInput): Promise<SaveResult> {
  const { userId } = await requireRole('parent')
  if (!input.kind || !KINDS.includes(input.kind)) return { ok: false, error: 'Pick what kind of activity it is.' }
  const name = input.name.trim()
  if (!name) return { ok: false, error: 'Say what it is called.' }
  if (!SINCE.includes(input.since)) return { ok: false, error: 'Pick since when.' }

  // RLS decides whether this parent may see the child; the write itself runs with the service client.
  const supabase = await createSupabaseServer()
  const { data: child } = await supabase.from('children').select('id').eq('id', childId).maybeSingle()
  if (!child) return { ok: false, error: 'We could not find this child.' }

  const db = createServiceClient({
    SUPABASE_URL: process.env.SUPABASE_URL ?? '',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  })
  await insertActivity(db, {
    childId,
    createdBy: userId,
    kind: input.kind,
    name,
    place: input.place.trim() || null,
    days: DAYS.filter((d) => input.days.includes(d)),
    since: input.since,
  })
  try {
    await sendEvent('activity.added', { childId })
  } catch (e) {
    // The event row is recorded before it is posted; a failed post must not lose the activity.
    console.error('activity.added could not be delivered', e)
  }
  return { ok: true }
}
