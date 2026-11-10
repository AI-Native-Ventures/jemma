// A maintainer's tool: reads every recorded model answer from the project the env points at (read only) and writes
// them to fixtures/ai-replays.json.gz, a gzipped JSON array of { key, model, response }. Rows whose key starts with
// `lock:` are locks, not answers, and are left out. start.sh loads this file into a stranger's local database.
// Run: pnpm --filter @jemma/profiling exec tsx ../../scripts/export-replays.ts
// Uses the service key in the repo-root .env.local. Allowed only against the local stack or the project in
// JEMMA_ALLOWED_SUPABASE_REF (default: jemma-dev).
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { createServiceClient, type JemmaDb, type Json } from '../packages/profiling/src/db'
import { assertDevProject, loadEnv } from '../packages/profiling/scripts/env'
import { REPLAYS_FIXTURE, type ReplayRow } from './load-replays'

const PAGE_SIZE = 10

/** True for a recorded answer, false for a lock row. */
export const isAnswerKey = (key: string): boolean => !key.startsWith('lock:')

/**
 * The stored answer without the model host's `set-cookie` header (a short-lived session cookie from the host's
 * network, kept in the recording by the AI SDK). Nothing reads it, and it has no place in a public repo.
 */
export function scrubResponse(response: NonNullable<Json>): NonNullable<Json> {
  const outer = response as { response?: { headers?: Record<string, unknown> } } | null
  const headers = outer?.response?.headers
  if (!headers || typeof headers !== 'object') return response
  const kept = Object.fromEntries(Object.entries(headers).filter(([name]) => name.toLowerCase() !== 'set-cookie'))
  return { ...(response as object), response: { ...outer!.response, headers: kept } } as NonNullable<Json>
}

/** Reads every recorded answer in key order, a few rows at a time (each answer can be large). Only selects. */
export async function fetchReplays(db: Pick<JemmaDb, 'from'>, pageSize = PAGE_SIZE): Promise<ReplayRow[]> {
  const rows: ReplayRow[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from('ai_replays')
      .select('key, model, response')
      .not('key', 'like', 'lock:%')
      .order('key')
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`reading ai_replays failed: ${error.message}`)
    const page = (data ?? []).filter((row) => isAnswerKey(row.key))
    rows.push(...page.map((row) => ({ key: row.key, model: row.model, response: scrubResponse(row.response) })))
    if ((data ?? []).length < pageSize) return rows
  }
}

/** The file's bytes: a gzipped, compact JSON array. */
export const encodeReplays = (rows: ReplayRow[]): Buffer => gzipSync(Buffer.from(JSON.stringify(rows), 'utf8'), { level: 9 })

async function main(): Promise<void> {
  const env = loadEnv()
  assertDevProject(env)
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
  const db = createServiceClient({ SUPABASE_URL: env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY })
  const rows = await fetchReplays(db)
  const bytes = encodeReplays(rows)
  mkdirSync(dirname(REPLAYS_FIXTURE), { recursive: true })
  writeFileSync(REPLAYS_FIXTURE, bytes)
  const models = new Map<string, number>()
  for (const row of rows) models.set(row.model, (models.get(row.model) ?? 0) + 1)
  console.log(`Wrote ${rows.length} recorded answers (${(bytes.length / 1_000_000).toFixed(2)} MB gzipped) to ${REPLAYS_FIXTURE}`)
  for (const [model, count] of [...models].sort()) console.log(`  ${count} by ${model}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  })
}
