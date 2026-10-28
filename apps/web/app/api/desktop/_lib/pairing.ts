import type { JemmaDb } from '@jemma/profiling/db'

export const CODE_TTL_MS = 10 * 60 * 1000
export const MAX_CLAIM_ATTEMPTS = 5
export const ATTEMPT_WINDOW_MS = 10 * 60 * 1000
const CODE_LENGTH = 6
/** No 0, 1, I, O: a code is read off one screen and typed into another. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export async function hashSecret(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Storage behind the pairing flow. Codes and tokens are only ever handled as sha256 hashes. */
export type PairingStore = {
  insertCode(hash: string, userId: string, expiresAt: Date): Promise<void>
  countAttempts(hash: string, since: Date): Promise<number>
  recordAttempt(hash: string, at: Date): Promise<void>
  /** Atomic: marks an unclaimed, unexpired code as claimed and returns its user, or null. */
  consumeCode(hash: string, now: Date): Promise<string | null>
  insertToken(hash: string, userId: string, label: string): Promise<void>
}

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('')
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `jmt_${b64}`
}

export const normaliseCode = (typed: string) => typed.replace(/\s+/g, '').toUpperCase()

export async function issuePairingCode(store: PairingStore, userId: string, now = new Date()) {
  const code = randomCode()
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS)
  await store.insertCode(await hashSecret(code), userId, expiresAt)
  return { code, expiresAt }
}

export type ClaimResult = { ok: true; token: string; userId: string } | { ok: false; reason: 'invalid' | 'rate_limited' }

/** Swaps a pairing code for a fresh per-user MCP token, once. The token is returned here and never stored in the clear. */
export async function claimPairing(store: PairingStore, typed: string, now = new Date()): Promise<ClaimResult> {
  const hash = await hashSecret(normaliseCode(typed))
  const tries = await store.countAttempts(hash, new Date(now.getTime() - ATTEMPT_WINDOW_MS))
  if (tries >= MAX_CLAIM_ATTEMPTS) return { ok: false, reason: 'rate_limited' }
  await store.recordAttempt(hash, now)
  const userId = await store.consumeCode(hash, now)
  if (!userId) return { ok: false, reason: 'invalid' }
  const token = randomToken()
  await store.insertToken(await hashSecret(token), userId, 'Jemma Desktop')
  return { ok: true, token, userId }
}

function must<T extends { error: { message: string } | null }>(res: T, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  return res
}

/** Supabase-backed store. Service role only: the tables have no policies. */
export function supabasePairingStore(db: JemmaDb): PairingStore {
  return {
    async insertCode(hash, userId, expiresAt) {
      // One live code per user: drop their older unclaimed ones and any expired leftovers.
      must(await db.from('desktop_pairing_codes').delete().eq('user_id', userId).is('claimed_at', null), 'clear old codes')
      must(
        await db.from('desktop_pairing_codes').insert({ code_hash: hash, user_id: userId, expires_at: expiresAt.toISOString() }),
        'insert code',
      )
    },
    async countAttempts(hash, since) {
      const res = must(
        await db
          .from('desktop_pairing_attempts')
          .select('id', { count: 'exact', head: true })
          .eq('code_hash', hash)
          .gte('at', since.toISOString()),
        'count attempts',
      )
      return res.count ?? 0
    },
    async recordAttempt(hash, at) {
      must(await db.from('desktop_pairing_attempts').insert({ code_hash: hash, at: at.toISOString() }), 'record attempt')
    },
    async consumeCode(hash, now) {
      // The conditional update is the one-time gate: only one caller gets the row back.
      const res = must(
        await db
          .from('desktop_pairing_codes')
          .update({ claimed_at: now.toISOString() })
          .eq('code_hash', hash)
          .is('claimed_at', null)
          .gt('expires_at', now.toISOString())
          .select('user_id'),
        'consume code',
      )
      return res.data?.[0]?.user_id ?? null
    },
    async insertToken(hash, userId, label) {
      must(await db.from('mcp_tokens').insert({ token_hash: hash, user_id: userId, label }), 'insert token')
    },
  }
}
