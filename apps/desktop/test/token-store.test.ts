import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createTokenStore, type Crypto } from '../src/token-store'

/** Reversible "encryption" good enough to tell plain text from ciphertext in a test. */
const fakeCrypto: Crypto = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Uint8Array.from([...Buffer.from(s, 'utf8')].reverse().map((b) => b ^ 0x5a)),
  decryptString: (b) => Buffer.from([...b].map((x) => x ^ 0x5a).reverse()).toString('utf8'),
}

describe('token store', () => {
  it('round trips a token and never writes it in plain text', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jemma-token-'))
    const store = createTokenStore(dir, fakeCrypto)
    expect(store.load()).toBeNull()
    store.save('jmt_secret-token-value')
    expect(store.load()).toBe('jmt_secret-token-value')
    for (const f of readdirSync(dir)) expect(readFileSync(join(dir, f)).toString('latin1')).not.toContain('secret-token-value')
  })

  it('refuses to store anything when encryption is not available', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jemma-token-'))
    const store = createTokenStore(dir, { ...fakeCrypto, isEncryptionAvailable: () => false })
    expect(() => store.save('jmt_x')).toThrow(/keychain/i)
    expect(readdirSync(dir)).toEqual([])
  })

  it('forgets the token on clear', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jemma-token-'))
    const store = createTokenStore(dir, fakeCrypto)
    store.save('jmt_a')
    store.clear()
    expect(store.load()).toBeNull()
  })
})
