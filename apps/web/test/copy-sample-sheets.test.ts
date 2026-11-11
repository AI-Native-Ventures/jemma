// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'

// scripts/copy-sample-sheets.mjs puts the 6 sample sheets of fixtures/papers where the build serves them as static assets.

const script = resolve(import.meta.dirname, '../scripts/copy-sample-sheets.mjs')
const fixtures = resolve(import.meta.dirname, '../../../fixtures/papers')
const SHEETS = ['amina', 'lerato', 'memo', 'naledi', 'sipho', 'thabo']

const temps: string[] = []
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'jemma-sheets-'))
  temps.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const run = (...args: string[]) => execFileSync(process.execPath, [script, ...args], { encoding: 'utf8' })

describe('copy-sample-sheets.mjs', () => {
  test('copies the 6 sheets of fixtures/papers, with the same sizes, into a folder it makes', () => {
    const to = join(temp(), 'public', 'sample-papers')
    run(fixtures, to)
    expect(readdirSync(to).sort()).toEqual(SHEETS.map((s) => `${s}.png`))
    for (const who of SHEETS) {
      expect(statSync(join(to, `${who}.png`)).size, who).toBe(statSync(join(fixtures, `${who}.png`)).size)
      expect(readFileSync(join(to, `${who}.png`)).equals(readFileSync(join(fixtures, `${who}.png`))), who).toBe(true)
    }
  })

  test('a file left over from an earlier copy is removed, so the folder is exactly the 6 sheets', () => {
    const to = temp()
    writeFileSync(join(to, 'old.png'), 'x')
    run(fixtures, to)
    expect(readdirSync(to).sort()).toEqual(SHEETS.map((s) => `${s}.png`))
  })

  test('it fails, and says which sheet, when one of the 6 is missing', () => {
    const from = temp()
    mkdirSync(from, { recursive: true })
    for (const who of SHEETS.filter((s) => s !== 'memo')) writeFileSync(join(from, `${who}.png`), 'x')
    expect(() => run(from, temp())).toThrow(/memo\.png/)
  })
})
