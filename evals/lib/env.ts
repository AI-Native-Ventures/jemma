import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { assertDevProject } from '../../packages/profiling/scripts/env'

export type Env = Record<string, string | undefined>

const ROOT_ENV_FILE = new URL('../../.env.local', import.meta.url)

/** The repo's `.env.local` under `process.env`. Values are never printed. */
export function loadEnv(): Env {
  let fromFile: Env = {}
  try {
    fromFile = parseEnv(readFileSync(ROOT_ENV_FILE, 'utf8'))
  } catch {
    // no file: the shell may hold the values
  }
  return { ...fromFile, ...process.env }
}

export function required(env: Env, key: string): string {
  const value = env[key]
  if (!value) throw new Error(`required environment value is missing: ${key}`)
  return value
}

/** Only the local stack or the team's dev project, never anything else. */
export function assertAllowedDatabase(env: Env): void {
  assertDevProject(env)
}

/** Everything the goose child must not see. OPENROUTER_API_KEY is the one secret it needs, so it is not in this list. */
export const KEEP_OUT = [
  'SUPABASE_PROJECT_ID', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_DB_PASSWORD', 'SUPABASE_DB_URL',
  'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'EVENTS_SECRET', 'AGENT_URL', 'JEMMA_MCP_TOKEN', 'CHILD_PIN_PEPPER',
  'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'OPENAI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GOOGLE_API_KEY',
  'DEEPSEEK_API_KEY', 'OPENCODE_API_KEY', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY',
  'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_BEARER_TOKEN_BEDROCK', 'GOOGLE_APPLICATION_CREDENTIALS', 'ANTHROPIC_VERTEX_PROJECT_ID',
]

/**
 * Runs `work` with `values` in `process.env` and the secrets goose must not see taken out, then puts everything back.
 * The runner copies `process.env` when it starts goose, so this has to wrap the whole agent run.
 */
export async function withScrubbedEnv<T>(values: Record<string, string>, work: () => Promise<T>): Promise<T> {
  const saved = new Map<string, string | undefined>()
  for (const key of [...KEEP_OUT, ...Object.keys(values)]) saved.set(key, process.env[key])
  for (const key of KEEP_OUT) delete process.env[key]
  for (const [key, value] of Object.entries(values)) process.env[key] = value
  try {
    return await work()
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

/** Runs `work` with `values` in `process.env` (the event helper reads them), then restores. */
export async function withTemporaryEnv<T>(values: Record<string, string>, work: () => Promise<T>): Promise<T> {
  const previous = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key])
    process.env[key] = value
  }
  try {
    return await work()
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}
