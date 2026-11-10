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

/** Upserts the operator's presence row (server-side clock). Needs the service role. */
export async function sendOperatorHeartbeat(db: JemmaDb, runnerId: string, agent: string, version: string | null, tag = 'default'): Promise<void> {
  const { error } = await db.rpc('operator_heartbeat', { runner: runnerId, agent_in: agent, version_in: version as string, tag_in: tag })
  if (error) throw new Error(`operator_heartbeat failed: ${error.message}`)
}

/**
 * Claims the oldest event the cloud handed to an operator with this routing tag, or null. Events of desktop schools are
 * never claimed. One event per school at a time; two operators never get the same one. Needs the service role.
 */
export async function claimOperatorEvent(db: JemmaDb, runnerId: string, tag = 'default'): Promise<ClaimedEvent | null> {
  const { data, error } = await db.rpc('claim_operator_event', { runner: runnerId, tag_in: tag })
  if (error) throw new Error(`claim_operator_event failed: ${error.message}`)
  return data?.[0] ?? null
}

/** Settles an event an operator ran. */
export async function finishOperatorEvent(db: JemmaDb, eventId: string, status: 'done' | 'failed', error: string | null): Promise<void> {
  const res = await db.rpc('finish_operator_event', { event: eventId, status_in: status, error_in: error as string })
  if (res.error) throw new Error(`finish_operator_event failed: ${res.error.message}`)
}
