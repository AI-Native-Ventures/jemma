import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

/** Reads the repo-root .env.local (jemma-dev keys) for tests that talk to Supabase. */
export function loadEnv(): Record<string, string> {
  const file = fileURLToPath(new URL('../../../../.env.local', import.meta.url))
  const fromFile = existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {}
  return { ...fromFile, ...process.env } as Record<string, string>
}
