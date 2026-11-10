// Loads the recorded model answers (fixtures/ai-replays.json.gz) into the `ai_replays` table of whatever database
// the env points at (the local Supabase stack that start.sh sets up, or your own project).
// Run: pnpm --filter @jemma/profiling exec tsx ../../scripts/load-replays.ts
// Uses SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the repo-root .env.local. Safe to run again: rows are upserted by key.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { createServiceClient, type Json, type JemmaDb } from '../packages/profiling/src/db'
import { loadEnv } from '../packages/profiling/scripts/env'

/** One recorded model answer, as stored in the `ai_replays` table. */
export type ReplayRow = { key: string; model: string; response: NonNullable<Json> }

export const REPLAYS_FIXTURE = fileURLToPath(new URL('../fixtures/ai-replays.json.gz', import.meta.url))

/** Rows go up in requests of about this many characters, so one request never gets huge. */
const BATCH_CHARS = 2_000_000

/** Reads the gzipped JSON array and checks every row has the three fields. */
export function parseReplays(gz: Uint8Array): ReplayRow[] {
  const rows: unknown = JSON.parse(gunzipSync(gz).toString('utf8'))
  if (!Array.isArray(rows)) throw new Error('the replay file must hold a JSON array')
  return rows.map((row, i) => {
    const r = row as Partial<ReplayRow> | null
    if (!r || typeof r.key !== 'string' || typeof r.model !== 'string' || r.response === undefined || r.response === null) {
      throw new Error(`replay row ${i} needs a key, a model and a response`)
    }
    return { key: r.key, model: r.model, response: r.response as NonNullable<Json> }
  })
}

/** Splits rows into batches of about `maxChars` characters (a row bigger than that goes alone). */
export function batchRows(rows: ReplayRow[], maxChars = BATCH_CHARS): ReplayRow[][] {
  const batches: ReplayRow[][] = []
  let current: ReplayRow[] = []
  let size = 0
  for (const row of rows) {
    const chars = JSON.stringify(row).length
    if (current.length > 0 && size + chars > maxChars) {
      batches.push(current)
      current = []
      size = 0
    }
    current.push(row)
    size += chars
  }
  if (current.length > 0) batches.push(current)
  return batches
}

/** Upserts the rows by key. Returns how many were sent. */
export async function loadReplays(db: Pick<JemmaDb, 'from'>, rows: ReplayRow[], maxChars = BATCH_CHARS): Promise<number> {
  let sent = 0
  for (const batch of batchRows(rows, maxChars)) {
    const { error } = await db.from('ai_replays').upsert(batch, { onConflict: 'key' })
    if (error) throw new Error(`loading the recorded answers failed: ${error.message}`)
    sent += batch.length
  }
  return sent
}

async function main(): Promise<void> {
  const env = loadEnv()
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (start.sh writes them to .env.local)')
  }
  const rows = parseReplays(readFileSync(REPLAYS_FIXTURE))
  const db = createServiceClient({ SUPABASE_URL: env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY })
  const sent = await loadReplays(db, rows)
  console.log(`Loaded ${sent} recorded answers into ai_replays.`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  })
}
