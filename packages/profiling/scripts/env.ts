import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

/** The repo-root .env.local (jemma-dev keys, free model ids) merged under process.env. Values are never printed. */
export function loadEnv(): Record<string, string> {
  const file = fileURLToPath(new URL('../../../.env.local', import.meta.url))
  const fromFile = existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {}
  return { ...fromFile, ...process.env } as Record<string, string>
}

/** Refuses to run against any Supabase project but jemma-dev. */
export function assertDevProject(env: Record<string, string>): void {
  if (!env.SUPABASE_URL?.includes('ayxgctbemuvozwktstaa')) throw new Error('scripts only run against jemma-dev (ayxgctbemuvozwktstaa)')
}
