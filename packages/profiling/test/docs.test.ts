import { existsSync, globSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { describe, expect, test } from 'vitest'
import { AI_JOBS } from '../src/plans'
import { registry } from '../src/tools/registry'

// The submission documents must stay true. These tests read the files and the code only: no database, no network, no model.

const root = resolve(import.meta.dirname, '../../..')
const read = (file: string) => readFileSync(join(root, file), 'utf8')
const words = (text: string) => text.split(/\s+/).filter(Boolean).length

/** Every number written as "<n> tools" (the claim about the size of Jemma's MCP server), or "<n> AI jobs". */
const numbers = (text: string, noun: string) => [...text.matchAll(new RegExp(`\\b(\\d+) ${noun}\\b`, 'gi'))].map((m) => Number(m[1]))

const SUBMISSION_DOCS = [
  'README.md',
  'ARCHITECTURE.md',
  'docs/architecture.md',
  'docs/judges.md',
  'docs/mcp-server.md',
  'docs/submission-description.md',
  'docs/compliance.md',
  'docs/video-shot-list.md',
]

describe('ARCHITECTURE.md is one page', () => {
  const text = read('ARCHITECTURE.md')

  test('it has at most 450 words', () => {
    expect(words(text)).toBeLessThanOrEqual(450)
  })

  test('it has one mermaid diagram and one table', () => {
    expect(text.match(/^```mermaid$/gm)).toHaveLength(1)
    // The separator row (`| --- | --- |`) is the one line that marks a table.
    expect(text.match(/^\|\s*:?-{3,}/gm)).toHaveLength(1)
  })

  test('its sections come in the agreed order', () => {
    const headings = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1])
    expect(headings).toEqual(['Agent shape', 'MCP servers', 'Models', 'Where a person decides', 'What is logged', 'Cost per run'])
  })

  test('it points at the long version', () => {
    expect(text).toContain('docs/architecture.md')
  })
})

describe('numbers that cannot go stale', () => {
  test('every tool count in the documents is the length of the registry', () => {
    const must = ['ARCHITECTURE.md', 'docs/architecture.md', 'docs/judges.md', 'docs/mcp-server.md', 'docs/submission-description.md']
    for (const file of must) expect(numbers(read(file), '(?:MCP )?tools'), `${file} states how many tools there are`).not.toHaveLength(0)
    for (const file of SUBMISSION_DOCS) {
      for (const n of numbers(read(file), '(?:MCP )?tools')) expect(n, `${file} says ${n} tools`).toBe(registry.length)
    }
  })

  test('every AI job count in the documents is the number of jobs', () => {
    const must = ['ARCHITECTURE.md', 'docs/architecture.md', 'packages/profiling/src/jobs/README.md']
    for (const file of must) expect(numbers(read(file), 'AI jobs'), `${file} states how many AI jobs there are`).not.toHaveLength(0)
    for (const file of [...SUBMISSION_DOCS, 'packages/profiling/src/jobs/README.md']) {
      for (const n of numbers(read(file), 'AI jobs')) expect(n, `${file} says ${n} AI jobs`).toBe(AI_JOBS.length)
    }
  })

  test('every prompt file has a job and every job has a prompt file', () => {
    const files = globSync('packages/profiling/src/jobs/*.md', { cwd: root })
      .map((f) => f.replace(/^.*\//, '').replace(/\.md$/, ''))
      .filter((f) => f !== 'README')
    expect([...files].sort()).toEqual([...AI_JOBS].sort())
  })

  test('the migration count in the architecture document is the number of files', () => {
    const files = globSync('supabase/migrations/*.sql', { cwd: root })
    const stated = numbers(read('docs/architecture.md'), 'migration files')
    expect(stated).not.toHaveLength(0)
    for (const n of stated) expect(n).toBe(files.length)
  })

  test('the recorded answers count in the README is the number of rows in the fixture', () => {
    const rows = JSON.parse(gunzipSync(readFileSync(join(root, 'fixtures/ai-replays.json.gz'))).toString('utf8')) as unknown[]
    const stated = numbers(read('README.md'), 'recorded answers')
    expect(stated).not.toHaveLength(0)
    for (const n of stated) expect(n).toBe(rows.length)
  })
})

describe('docs/mcp-server.md', () => {
  const text = read('docs/mcp-server.md')
  const reference = text.slice(text.indexOf('## Tool reference'), text.indexOf('## Example session'))
  const sections = [...reference.matchAll(/^### `([a-z_]+)`$/gm)].map((m) => m[1])

  test('every tool in the registry has its own section', () => {
    const missing = registry.map((t) => t.name).filter((name) => !sections.includes(name))
    expect(missing).toEqual([])
  })

  test('no section describes a tool that the registry does not have', () => {
    const names = registry.map((t) => t.name)
    expect(sections.filter((s) => !names.includes(s!))).toEqual([])
  })

  test('each tool section says whether the tool reads or saves', () => {
    for (const name of registry.map((t) => t.name)) {
      const start = reference.indexOf(`### \`${name}\``)
      const next = reference.indexOf('\n### ', start + 1)
      expect(reference.slice(start, next === -1 ? undefined : next), name).toMatch(/- Kind: (read|save)/)
    }
  })
})

describe('docs/submission-description.md', () => {
  const text = read('docs/submission-description.md')

  test('it is about 300 words', () => {
    const body = words(text)
    expect(body).toBeGreaterThanOrEqual(280)
    expect(body).toBeLessThanOrEqual(320)
  })

  test('it names the sub-theme, the school, the links and the licence', () => {
    for (const needle of [
      'Longitudinal strength tracking',
      'Hillview Primary',
      'https://github.com/AI-Native-Ventures/jemma',
      'https://jemma-web.horizonsystems.workers.dev/demo',
      'MIT',
    ]) {
      expect(text, needle).toContain(needle)
    }
  })
})

describe('the submission documents', () => {
  test('hold no placeholder and no local path', () => {
    // The words are written in two halves so that this file does not contain them itself.
    const banned = [
      ['to be ', 'announced'],
      ['<live ', 'link>'],
      ['TB', 'C'],
      ['TO', 'DO'],
      ['lorem ', 'ipsum'],
      ['/Us', 'ers/'],
      ['.cla', 'ude/'],
      ['coord', '-work'],
      ['heavy', '-run'],
    ].map((halves) => halves.join(''))
    for (const file of SUBMISSION_DOCS) {
      const text = read(file).toLowerCase()
      for (const word of banned) expect(text.includes(word.toLowerCase()), `${file} has "${word}"`).toBe(false)
    }
  })

  test('hold no em dash (the README, ARCHITECTURE.md and EVALS.md are outside the other test)', () => {
    const dash = String.fromCharCode(0x2014)
    for (const file of [...SUBMISSION_DOCS, 'EVALS.md']) expect(read(file).includes(dash), file).toBe(false)
  })

  test('do not claim that a real teacher or real learners used Jemma', () => {
    for (const file of SUBMISSION_DOCS) {
      const text = read(file)
      expect(text, file).not.toMatch(/(we|I) (talked|spoke) to (a|the|our) (real )?teacher/i)
      expect(text, file).not.toMatch(/teachers? (told|asked|said to) us/i)
      expect(text, file).not.toMatch(/real learners? (used|tried|tested)/i)
    }
  })
})

describe('docs/compliance.md', () => {
  const text = read('docs/compliance.md')
  const rows = text
    .split('\n')
    .filter((l) => l.startsWith('|') && !/^\|\s*-{3,}/.test(l))
    .slice(1) // the header row
    .map((l) => l.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim()))

  test('it has rows, each with the four columns', () => {
    expect(rows.length).toBeGreaterThanOrEqual(25)
    for (const row of rows) expect(row, row[0]).toHaveLength(4)
  })

  test('every status is one of the four allowed', () => {
    for (const row of rows) expect(row[3], row[0]).toMatch(/^(met|met with a limit|not met|the owner's)\b/)
  })

  test('a row that says met or met with a limit names its proof, and every file it names exists', () => {
    for (const row of rows) {
      const [rule, , proof, status] = row as [string, string, string, string]
      if (/^(met|met with a limit)\b/.test(status)) expect(proof.length, rule).toBeGreaterThan(5)
      const named = [...`${row[1]} ${proof}`.matchAll(/`([^`\s]+)`/g)].map((m) => m[1]!.replace(/:\d+(-\d+)?$/, ''))
      for (const file of named.filter((n) => /\.(ts|tsx|md|json|jsonl|gz|sql|sh|yml|png)$/.test(n) && n.includes('/') && !n.startsWith('http'))) {
        expect(existsSync(join(root, file)), `${rule} cites ${file}`).toBe(true)
      }
    }
  })

  test('a limit is written next to every "met with a limit"', () => {
    for (const row of rows) if (/^met with a limit/.test(row[3]!)) expect(row[3]!.length, row[0]).toBeGreaterThan(30)
  })
})
