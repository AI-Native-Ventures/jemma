import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** The part of Electron's safeStorage that is used (macOS: the key lives in the login keychain). */
export type Crypto = {
  isEncryptionAvailable(): boolean
  encryptString(plain: string): Uint8Array
  decryptString(cipher: Uint8Array): string
}

const FILE = 'mcp-token.enc'

/** The per-user MCP token, encrypted with the OS keychain. Without encryption nothing is written. */
export function createTokenStore(dir: string, crypto: Crypto) {
  const file = join(dir, FILE)
  return {
    save(token: string): void {
      if (!crypto.isEncryptionAvailable()) throw new Error('The macOS keychain is not available, so the token cannot be stored safely')
      mkdirSync(dir, { recursive: true })
      writeFileSync(file, crypto.encryptString(token), { mode: 0o600 })
      chmodSync(file, 0o600)
    },
    load(): string | null {
      if (!existsSync(file) || !crypto.isEncryptionAvailable()) return null
      try {
        return crypto.decryptString(readFileSync(file))
      } catch {
        return null
      }
    },
    clear(): void {
      rmSync(file, { force: true })
    },
  }
}
