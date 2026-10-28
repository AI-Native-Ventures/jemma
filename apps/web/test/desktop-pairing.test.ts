import { describe, expect, it } from 'vitest'
import {
  CODE_TTL_MS,
  MAX_CLAIM_ATTEMPTS,
  claimPairing,
  hashSecret,
  issuePairingCode,
  type PairingStore,
} from '@/app/api/desktop/_lib/pairing'

/** In-memory store with the same atomic one-time rule as the SQL one. */
function memoryStore() {
  const codes = new Map<string, { userId: string; expiresAt: number; claimed: boolean }>()
  const attempts: { hash: string; at: number }[] = []
  const tokens: { hash: string; userId: string; label: string }[] = []
  const store: PairingStore = {
    async insertCode(hash, userId, expiresAt) {
      codes.set(hash, { userId, expiresAt: expiresAt.getTime(), claimed: false })
    },
    async countAttempts(hash, since) {
      return attempts.filter((a) => a.hash === hash && a.at >= since.getTime()).length
    },
    async recordAttempt(hash, at) {
      attempts.push({ hash, at: at.getTime() })
    },
    async consumeCode(hash, now) {
      const row = codes.get(hash)
      if (!row || row.claimed || row.expiresAt <= now.getTime()) return null
      row.claimed = true
      return row.userId
    },
    async insertToken(hash, userId, label) {
      tokens.push({ hash, userId, label })
    },
  }
  return { store, codes, tokens }
}

const now = new Date('2026-10-28T10:00:00Z')

describe('desktop pairing', () => {
  it('issues a 6 character code that is stored hashed and expires in 10 minutes', async () => {
    const { store, codes } = memoryStore()
    const issued = await issuePairingCode(store, 'user-1', now)
    expect(issued.code).toMatch(/^[A-Z2-9]{6}$/)
    expect(issued.expiresAt.getTime() - now.getTime()).toBe(10 * 60 * 1000)
    expect(CODE_TTL_MS).toBe(600_000)
    expect([...codes.keys()]).toEqual([await hashSecret(issued.code)])
    expect(JSON.stringify([...codes.keys()])).not.toContain(issued.code)
  })

  it('swaps a right code for a per-user token, stored as sha256', async () => {
    const { store, tokens } = memoryStore()
    const { code } = await issuePairingCode(store, 'user-1', now)
    const res = await claimPairing(store, code, now)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(tokens).toHaveLength(1)
    expect(tokens[0]!.userId).toBe('user-1')
    expect(tokens[0]!.hash).toBe(await hashSecret(res.token))
    expect(tokens[0]!.hash).not.toBe(res.token)
  })

  it('accepts the code in lower case and with spaces', async () => {
    const { store } = memoryStore()
    const { code } = await issuePairingCode(store, 'user-1', now)
    expect((await claimPairing(store, ` ${code.toLowerCase()} `, now)).ok).toBe(true)
  })

  it('is one-time: a second claim fails', async () => {
    const { store, tokens } = memoryStore()
    const { code } = await issuePairingCode(store, 'user-1', now)
    expect((await claimPairing(store, code, now)).ok).toBe(true)
    expect(await claimPairing(store, code, now)).toEqual({ ok: false, reason: 'invalid' })
    expect(tokens).toHaveLength(1)
  })

  it('expires after 10 minutes', async () => {
    const { store, tokens } = memoryStore()
    const { code } = await issuePairingCode(store, 'user-1', now)
    const late = new Date(now.getTime() + CODE_TTL_MS + 1)
    expect(await claimPairing(store, code, late)).toEqual({ ok: false, reason: 'invalid' })
    expect(tokens).toHaveLength(0)
  })

  it('rejects a wrong code', async () => {
    const { store } = memoryStore()
    await issuePairingCode(store, 'user-1', now)
    expect(await claimPairing(store, 'ZZZZZZ', now)).toEqual({ ok: false, reason: 'invalid' })
    expect(await claimPairing(store, 'abc', now)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('rate limits tries per code, even for the right code afterwards', async () => {
    const { store, tokens } = memoryStore()
    const { code } = await issuePairingCode(store, 'user-1', now)
    // Wrong tries against the same typed code string do not unlock it; the limit is per typed code.
    for (let i = 0; i < MAX_CLAIM_ATTEMPTS; i++) {
      expect(await claimPairing(store, 'QQQQQQ', now)).toEqual({ ok: false, reason: 'invalid' })
    }
    expect(await claimPairing(store, 'QQQQQQ', now)).toEqual({ ok: false, reason: 'rate_limited' })
    // A different code is not blocked by that.
    expect((await claimPairing(store, code, now)).ok).toBe(true)
    expect(tokens).toHaveLength(1)
  })

  it('lets a code be tried again after the window passes', async () => {
    const { store } = memoryStore()
    for (let i = 0; i < MAX_CLAIM_ATTEMPTS; i++) await claimPairing(store, 'QQQQQQ', now)
    expect((await claimPairing(store, 'QQQQQQ', now)).ok).toBe(false)
    const later = new Date(now.getTime() + CODE_TTL_MS + 1)
    expect(await claimPairing(store, 'QQQQQQ', later)).toEqual({ ok: false, reason: 'invalid' })
  })
})
