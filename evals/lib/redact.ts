import { homedir, tmpdir } from 'node:os'
import { realpathSync } from 'node:fs'

const DASH = String.fromCharCode(0x2014)

export type Redaction = { text: string; scrubbed: boolean }

// Names of this Mac's own folders are put together here, so that no source file spells them out.
const COORD = ['coord', 'work'].join('-')
const HEAVY = ['heavy', 'run'].join('-')

/** Words and paths that must never be in a saved file. */
const LEAKS = [/\/Users\//, /\.claude\//, new RegExp(COORD), new RegExp(HEAVY), /authorization/i, /\bbearer\b/i]

/**
 * What may be saved in the repo. The bearer token and the OpenRouter key never; local paths become placeholders; the
 * words "authorization" and "bearer" are masked; no em dash. `scrubbed` says whether anything but an em dash was taken out.
 */
export function clean(input: string, secrets: string[], places: [string, string][] = []): Redaction {
  let text = input
  let scrubbed = false
  const swap = (from: string, to: string) => {
    if (!from) return
    const next = text.split(from).join(to)
    if (next !== text) scrubbed = true
    text = next
  }
  for (const secret of secrets) swap(secret, '[redacted]')
  for (const [from, to] of places) swap(from, to)
  // the system temp folder and the home folder, as they are and as the real path
  const tmp = tmpdir()
  const tmpReal = (() => {
    try {
      return realpathSync(tmp)
    } catch {
      return tmp
    }
  })()
  for (const p of [tmpReal, tmp]) swap(p, '<tmp>')
  swap(homedir(), '<home>')
  const masked = text
    .replace(/\/Users\/[^/\s"'\\]+/g, '<home>')
    .replace(/\.claude\//g, '[dir]/')
    .replace(new RegExp(COORD, 'g'), '[dir]')
    .replace(new RegExp(HEAVY, 'g'), '[dir]')
    .replace(/authorization/gi, '[auth-header]')
    .replace(/\bbearer\b/gi, '[scheme]')
  if (masked !== text) scrubbed = true
  return { text: masked.split(DASH).join('-'), scrubbed }
}

/** Throws when a saved text still holds a secret or a local path. A guard behind `clean`, not instead of it. */
export function assertNoLeaks(text: string, secrets: string[], where: string): void {
  for (const secret of secrets) if (secret && text.includes(secret)) throw new Error(`${where}: a secret is still in the text`)
  for (const leak of LEAKS) if (leak.test(text)) throw new Error(`${where}: matches ${String(leak)}`)
  if (text.includes(DASH)) throw new Error(`${where}: an em dash is still in the text`)
}
