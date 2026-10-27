/**
 * Real run on this Mac with the signed-in Claude Code or Codex. Not part of the tests.
 *
 *   JEMMA_EMAIL=... JEMMA_PASSWORD=... JEMMA_MCP_URL=https://.../mcp JEMMA_MCP_TOKEN=... \
 *   AGENT=claude pnpm --filter @jemma/runner try-real
 *
 * Needs a queued event with runner 'desktop' in the user's school (for example a `curriculum.uploaded` event on a
 * `start` sandbox whose school has ai_runner 'desktop'). Reads SUPABASE_URL and SUPABASE_ANON_KEY from the repo
 * root .env.local. Prints the time each event took, then exits after the first settled event or TIMEOUT_MIN.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@jemma/profiling/db'
import { detectAgents, startRunner, type AgentName } from '../src'

const file = fileURLToPath(new URL('../../../.env.local', import.meta.url))
const env = { ...(existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {}), ...process.env } as Record<string, string | undefined>
const need = (k: string) => env[k] ?? (() => { throw new Error(`set ${k}`) })()

const agent = (env.AGENT ?? 'claude') as AgentName
const supabase = createClient<Database>(need('SUPABASE_URL'), need('SUPABASE_ANON_KEY'), { auth: { persistSession: false } })
const signed = await supabase.auth.signInWithPassword({ email: need('JEMMA_EMAIL'), password: need('JEMMA_PASSWORD') })
if (signed.error) throw signed.error

console.log('agents:', JSON.stringify(await detectAgents()))
const started = Date.now()
const runner = startRunner({
  supabase,
  runnerId: randomUUID(),
  agent,
  mcp: { url: need('JEMMA_MCP_URL'), token: need('JEMMA_MCP_TOKEN') },
  pollMs: 2000,
  onError: (e) => console.error('runner error:', e instanceof Error ? e.message : e),
})

const deadline = Date.now() + Number(env.TIMEOUT_MIN ?? 20) * 60_000
for (;;) {
  const { data } = await supabase.from('events').select('id, type, status, error, finished_at').in('status', ['done', 'failed']).gte('finished_at', new Date(started).toISOString()).limit(1)
  if (data?.length) {
    console.log(`settled in ${Math.round((Date.now() - started) / 1000)} s:`, JSON.stringify(data[0]))
    break
  }
  if (Date.now() > deadline) {
    console.log('no event settled before the deadline')
    break
  }
  await new Promise((r) => setTimeout(r, 2000))
}
runner.stop()
process.exit(0)
