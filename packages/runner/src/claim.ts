import type { JemmaDb, Json } from '@jemma/profiling/db'

export type ClaimedEvent = { id: string; school_id: string; type: string; payload: Json; attempts: number }

/** Upserts this runner's presence row (server-side clock). Needs a signed-in user. */
export async function sendHeartbeat(db: JemmaDb, runnerId: string, agents: Json, chosen: string | null): Promise<void> {
  const { error } = await db.rpc('heartbeat', { runner: runnerId, agents_in: agents, chosen_in: chosen as string })
  if (error) throw new Error(`heartbeat failed: ${error.message}`)
}

/** Claims the oldest queued desktop event of the user's school, or null. Two runners never get the same one. */
export async function claimEvent(db: JemmaDb, runnerId: string): Promise<ClaimedEvent | null> {
  const { data, error } = await db.rpc('claim_event', { runner: runnerId })
  if (error) throw new Error(`claim_event failed: ${error.message}`)
  return data?.[0] ?? null
}

/** Settles a claimed event after its whole job plan. */
export async function finishEvent(db: JemmaDb, eventId: string, status: 'done' | 'failed', error: string | null): Promise<void> {
  const res = await db.rpc('finish_event', { event: eventId, status_in: status, error_in: error as string })
  if (res.error) throw new Error(`finish_event failed: ${res.error.message}`)
}
