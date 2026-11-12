// Taking a demo sandbox away again, and the sweep that removes old ones. Kept apart from demo.ts, which carries the fixtures
// and the sample sheets: the agent worker imports this file for its hourly sweep and must not pull all of that in.
// Server only: needs the service role client.
import type { JemmaDb } from '../../packages/profiling/src/db'

const DAY = 24 * 60 * 60_000
const STORAGE_BUCKETS = ['papers', 'curriculum', 'lesson-audio', 'records']

/** How many old sandboxes one sweep looks at, and how many it removes at most (the hourly cron makes up for the rest). */
const LOOK_AT = 20
const DEFAULT_DAYS = 7
const DEFAULT_LIMIT = 5

async function removeFolder(admin: JemmaDb, bucket: string, prefix: string): Promise<void> {
  const listed = await admin.storage.from(bucket).list(prefix, { limit: 1000 })
  if (listed.error || !listed.data?.length) return
  const files: string[] = []
  const folders: string[] = []
  for (const entry of listed.data) (entry.id ? files : folders).push(`${prefix}/${entry.name}`)
  await Promise.all([
    files.length ? admin.storage.from(bucket).remove(files) : Promise.resolve(),
    ...folders.map((f) => removeFolder(admin, bucket, f)),
  ])
}

/** Cancels running events, deletes the school (cascade), then its auth users and stored files. */
export async function teardown(admin: JemmaDb, schoolId: string | null, userIds: string[]): Promise<void> {
  if (schoolId) {
    await admin.from('events').update({ status: 'cancelled', finished_at: new Date().toISOString() }).eq('school_id', schoolId).in('status', ['queued', 'running'])
    await admin.from('schools').delete().eq('id', schoolId)
    await Promise.all(STORAGE_BUCKETS.map((b) => removeFolder(admin, b, schoolId).catch(() => undefined)))
  }
  await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)))
}

type LoginUsers = { teacher?: { userId?: string }; parent?: { userId?: string }; learner?: { userId?: string } }

/** The users named in a sandbox's `logins` (teacher, parent, learner). */
function usersOf(logins: unknown): string[] {
  const l = (logins ?? {}) as LoginUsers
  return [l.teacher?.userId, l.parent?.userId, l.learner?.userId].filter((v): v is string => !!v)
}

/** A sandbox row: its school, the users made for it and the stage it was made with. */
export async function readSandbox(admin: JemmaDb, sandboxId: string) {
  const { data, error } = await admin.from('demo_sandboxes').select('school_id, logins, stage').eq('id', sandboxId).maybeSingle()
  if (error) throw new Error(`demo seed: read sandbox: ${error.message}`)
  if (!data) throw new Error(`demo seed: no sandbox ${sandboxId}`)
  return { schoolId: data.school_id, userIds: usersOf(data.logins), stage: data.stage as string }
}

/** Removes a sandbox for good (tests and housekeeping). The school it removes is the one named in the sandbox's own row. */
export async function deleteSandbox(admin: JemmaDb, sandboxId: string): Promise<void> {
  const old = await readSandbox(admin, sandboxId)
  await teardown(admin, old.schoolId, old.userIds)
}

export type SweepOptions = {
  /** A sandbox younger than this is never touched. Default 7. Anything that is not above zero removes nothing. */
  olderThanDays?: number
  /** The most sandboxes one call removes. Default 5. */
  limit?: number
  now?: Date
  /**
   * Tests only: look at these sandbox ids and no others, so a test on a shared database cannot reach anyone else's sandbox.
   * Production calls never set it.
   */
  onlySandboxIds?: string[]
}

/** True when the school has logged activity after `cutoff`, or one of the sandbox's users signed in after it. */
async function inUse(admin: JemmaDb, schoolId: string, userIds: string[], cutoffMs: number): Promise<boolean> {
  const since = new Date(cutoffMs).toISOString()
  const activity = await admin.from('activity_log').select('id').eq('school_id', schoolId).gt('created_at', since).limit(1)
  if (activity.error) throw new Error(`activity_log: ${activity.error.message}`)
  if ((activity.data?.length ?? 0) > 0) return true
  for (const id of userIds) {
    // A user that cannot be read counts as not signed in.
    const seen = await admin.auth.admin.getUserById(id).then(
      (r) => (r.error ? null : (r.data?.user?.last_sign_in_at ?? null)),
      () => null,
    )
    if (seen && Date.parse(seen) > cutoffMs) return true
  }
  return false
}

/**
 * Removes demo sandboxes nobody uses any more. Looks at the oldest sandboxes created before the cutoff (at most 20 a call) and
 * keeps one when its school has activity after the cutoff or one of its three users signed in after it. Removes the rest, one after
 * the other, with the same teardown as `deleteSandbox`, at most `limit` a call. One that fails is logged and skipped.
 * The only place a school id comes from is the `demo_sandboxes` row, so a school with no sandbox row can never be touched.
 * Returns the ids of the sandboxes it removed.
 */
export async function sweepOldSandboxes(admin: JemmaDb, opts: SweepOptions = {}): Promise<string[]> {
  const days = opts.olderThanDays ?? DEFAULT_DAYS
  const limit = opts.limit ?? DEFAULT_LIMIT
  if (!(days > 0) || !Number.isFinite(days) || !(limit > 0)) return []
  const cutoffMs = (opts.now ?? new Date()).getTime() - days * DAY
  if (opts.onlySandboxIds && opts.onlySandboxIds.length === 0) return []

  let query = admin.from('demo_sandboxes').select('id, school_id, logins').lt('created_at', new Date(cutoffMs).toISOString())
  if (opts.onlySandboxIds) query = query.in('id', opts.onlySandboxIds)
  const { data, error } = await query.order('created_at', { ascending: true }).limit(LOOK_AT)
  if (error) throw new Error(`demo sweep: ${error.message}`)

  const removed: string[] = []
  for (const row of data ?? []) {
    if (removed.length >= limit) break
    try {
      if (await inUse(admin, row.school_id, usersOf(row.logins), cutoffMs)) continue
      await deleteSandbox(admin, row.id)
      removed.push(row.id)
    } catch (e) {
      console.error(`demo sweep: could not remove sandbox ${row.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return removed
}
