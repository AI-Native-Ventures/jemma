// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// A failed `long_view.requested` event must show an error on the Long view screen and in the full log, and nowhere else.
// The class home and the learner screens have no generic failed-event card today. This test keeps it that way: any code that reads
// the events table and looks at failures has to name the one event type (or event) it is about, and that is never the Long view update.

const WEB = join(import.meta.dirname, '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (name === 'node_modules' || name === '.next') return []
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.(ts|tsx)$/.test(name) ? [full] : []
  })
}

/** Where the Long view update itself is allowed to look at its own failures. */
const LONG_VIEW_OWN = new Set(['lib/data/p52.ts', 'lib/long-view.ts'])

/** Every `.from('events')` call in the screens and their data, with the rest of its statement. */
function eventReads(): { file: string; text: string }[] {
  return ['app', 'lib'].flatMap((dir) =>
    sourceFiles(join(WEB, dir)).flatMap((path) => {
      const file = relative(WEB, path)
      const src = readFileSync(path, 'utf8')
      return [...src.matchAll(/\.from\(['"]events['"]\)/g)].map((m) => ({ file, text: src.slice(m.index, src.indexOf('\n\n', m.index) < 0 ? undefined : src.indexOf('\n\n', m.index)).split(/;\s*\n/)[0]! }))
    }),
  )
}

describe('a failed Long view update stays on the Long view screen', () => {
  it('finds the places that read events', () => {
    expect(eventReads().length).toBeGreaterThan(3)
  })

  it('no screen reads failed events without naming what they are about', () => {
    for (const read of eventReads()) {
      if (LONG_VIEW_OWN.has(read.file)) continue
      if (!/['"]failed['"]/.test(read.text)) continue
      const named = /\.eq\(['"]type['"],\s*['"](?!long_view)[a-z_.]+['"]\)/.test(read.text) || /\.eq\(['"]id['"],/.test(read.text)
      expect(named, `${read.file} reads failed events without a type of its own:\n${read.text}`).toBe(true)
    }
  })

  it('no code outside the Long view reads its events', () => {
    for (const read of eventReads()) {
      if (LONG_VIEW_OWN.has(read.file)) continue
      expect(read.text, read.file).not.toMatch(/long_view/)
    }
  })
})
