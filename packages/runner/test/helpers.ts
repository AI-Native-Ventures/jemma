import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync as exists, readFileSync as read } from 'node:fs'
import { parseEnv } from 'node:util'

export const FAKES = fileURLToPath(new URL('./fakes', import.meta.url))

/** Puts the fake claude and codex first on PATH. Returns a restore function. */
export function useFakes(): () => void {
  const before = process.env.PATH
  process.env.PATH = `${FAKES}:${before}`
  return () => {
    process.env.PATH = before
    delete process.env.FAKE_MODE
    delete process.env.FAKE_LOG
    delete process.env.FAKE_SIGNED_IN
  }
}

export function newLog(): string {
  const file = join(mkdtempSync(join(tmpdir(), 'jemma-runner-')), 'fake.log')
  process.env.FAKE_LOG = file
  return file
}

export function readLog(file: string): Record<string, any>[] {
  return existsSync(file)
    ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : []
}

export function loadEnv(): Record<string, string> {
  const file = fileURLToPath(new URL('../../../.env.local', import.meta.url))
  const fromFile = exists(file) ? parseEnv(read(file, 'utf8')) : {}
  return { ...fromFile, ...process.env } as Record<string, string>
}

export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
