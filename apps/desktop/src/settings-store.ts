import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Settings } from './runner-host'

const FILE = 'settings.json'

/** Non-secret choices: which agent, paused or not, and this install's runner id. The token never goes here. */
export function createSettingsStore(dir: string) {
  const file = join(dir, FILE)
  const read = (): Settings => {
    let saved: Partial<Settings> = {}
    try {
      if (existsSync(file)) saved = JSON.parse(readFileSync(file, 'utf8')) as Partial<Settings>
    } catch {
      // a damaged file starts over
    }
    return {
      agent: saved.agent === 'claude' || saved.agent === 'codex' ? saved.agent : null,
      paused: saved.paused === true,
      runnerId: typeof saved.runnerId === 'string' ? saved.runnerId : randomUUID(),
    }
  }
  const write = (s: Settings) => {
    mkdirSync(dir, { recursive: true })
    writeFileSync(file, JSON.stringify(s))
  }
  const first = read()
  write(first)
  return {
    get: read,
    update(patch: Partial<Pick<Settings, 'agent' | 'paused'>>): Settings {
      const next = { ...read(), ...patch }
      write(next)
      return next
    },
  }
}
