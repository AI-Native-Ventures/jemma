import type { JemmaDb } from '@jemma/profiling/db'
import { hashSecret } from './pairing'

/** The user a per-user MCP token (`Authorization: Bearer`) belongs to, or null. */
export async function userOfToken(db: JemmaDb, authorization: string | null): Promise<string | null> {
  const token = /^Bearer\s+(.+)$/i.exec(authorization ?? '')?.[1]?.trim()
  if (!token) return null
  const { data } = await db.from('mcp_tokens').select('user_id').eq('token_hash', await hashSecret(token)).maybeSingle()
  return data?.user_id ?? null
}

/**
 * Settles a desktop event that stopped on a usage limit, for the user whose runner claimed it:
 * `retry` puts it back in the desktop queue, `cloud` hands it to the cloud runner (through `enqueue`).
 * Only a failed event claimed by this user is touched.
 */
export async function settleStopped(
  db: JemmaDb,
  userId: string,
  eventId: string,
  action: 'retry' | 'cloud',
  enqueue: (eventId: string) => Promise<void>,
): Promise<boolean> {
  const patch = { status: 'queued' as const, error: null, finished_at: null, claimed_by: null, runner: action === 'retry' ? ('desktop' as const) : ('cloud' as const) }
  const { data, error } = await db.from('events').update(patch).eq('id', eventId).eq('claimed_by', userId).eq('status', 'failed').select('id')
  if (error) throw new Error(error.message)
  if (!data?.length) return false
  if (action === 'cloud') await enqueue(eventId)
  return true
}
