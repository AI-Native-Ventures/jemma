import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

/** The repo-root .env.local (local stack or jemma-dev keys, free model ids) merged under process.env. Values are never printed. */
export function loadEnv(): Record<string, string> {
  const file = fileURLToPath(new URL('../../../.env.local', import.meta.url))
  const fromFile = existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {}
  return { ...fromFile, ...process.env } as Record<string, string>
}

/** The team's dev project. Kept as the default so the safety net stays when JEMMA_ALLOWED_SUPABASE_REF is not set. */
export const DEFAULT_ALLOWED_SUPABASE_REF = 'ayxgctbemuvozwktstaa'

/**
 * True when the URL is the local Supabase stack (host localhost or 127.0.0.1), or its host contains `allowedRef`
 * (the default ref when `allowedRef` is missing or empty).
 */
export function isAllowedSupabaseUrl(url: string | undefined, allowedRef?: string): boolean {
  if (!url) return false
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    return false
  }
  if (host === 'localhost' || host === '127.0.0.1') return true
  const ref = allowedRef?.trim() || DEFAULT_ALLOWED_SUPABASE_REF
  return host.includes(ref)
}

/**
 * Refuses to run against any Supabase project but the local stack and the allowed one: the team's dev project,
 * or the ref in JEMMA_ALLOWED_SUPABASE_REF.
 */
export function assertDevProject(env: Record<string, string | undefined>): void {
  if (isAllowedSupabaseUrl(env.SUPABASE_URL, env.JEMMA_ALLOWED_SUPABASE_REF)) return
  const ref = env.JEMMA_ALLOWED_SUPABASE_REF?.trim() || DEFAULT_ALLOWED_SUPABASE_REF
  throw new Error(
    `SUPABASE_URL must be the local stack (localhost or 127.0.0.1) or a project whose address contains "${ref}". ` +
      'Set JEMMA_ALLOWED_SUPABASE_REF to allow another project.',
  )
}
