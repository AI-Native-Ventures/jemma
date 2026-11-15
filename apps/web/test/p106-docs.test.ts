// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// P106: the documents say that the family reads a guidance card only after the teacher taps Send to family, and that the card cannot be edited yet.
// They read the files only: no database, no network, no model.

const root = resolve(import.meta.dirname, '../../..')
const read = (file: string) => readFileSync(resolve(root, file), 'utf8')

/** The text under one `##` heading of a Markdown file, up to the next `##` heading. */
function section(text: string, heading: string): string {
  const start = text.indexOf(`\n## ${heading}\n`)
  expect(start, `a section "${heading}"`).toBeGreaterThanOrEqual(0)
  const rest = text.slice(start + 1)
  const next = rest.indexOf('\n## ', 4)
  return next < 0 ? rest : rest.slice(0, next)
}

describe('no document says the guidance card has no gate', () => {
  it.each(['README.md', 'docs/judges.md', 'docs/compliance.md', 'docs/architecture.md', 'ARCHITECTURE.md', 'docs/mcp-server.md'])('%s', (file) => {
    const text = read(file)
    expect(text).not.toMatch(/no gate of its own/i)
    expect(text).not.toMatch(/guidance card (has no tap|is not behind a gate)/i)
    expect(text).not.toMatch(/guidance card[^.|]*without a teacher's check/i)
    expect(text).not.toMatch(/with no teacher check/i)
  })
})

describe('the README', () => {
  const readme = read('README.md')

  it('says in "What is not finished" that a guidance card cannot be edited yet', () => {
    expect(section(readme, 'What is not finished')).toMatch(/A guidance card cannot be edited yet/)
  })

  it('names Send to family as a gate, with the card as a draft only the teacher reads', () => {
    expect(readme).toMatch(/Send to family/)
    expect(readme).toMatch(/draft that only the teacher reads/)
    expect(readme).toMatch(/sending a guidance card/)
  })
})

describe('docs/judges.md', () => {
  const judges = read('docs/judges.md')

  it('has the step where the teacher sends the guidance, in the path', () => {
    expect(section(judges, 'The 5-minute path')).toMatch(/Send to family/)
    expect(section(judges, 'The 5-minute path')).toMatch(/Guidance for Amina's family/)
  })

  it('says a parent sees the guidance card only after the teacher sends it', () => {
    expect(section(judges, 'What each role sees')).toMatch(/guidance card \(Jemma's own text, which the family sees only after the teacher taps Send to family\)/)
  })
})

describe('docs/compliance.md', () => {
  const compliance = read('docs/compliance.md')

  it('names the new gate and its tests', () => {
    expect(compliance).toContain('Send to family')
    expect(compliance).toContain('apps/web/lib/send-guidance.ts')
    expect(compliance).toContain('supabase/test/guidance-drafts.rls.test.ts')
    expect(compliance).toContain('apps/web/test/p106-send-guidance.test.ts')
  })

  it('still says what is not done: no editing, and the cards that existed before the gate count as sent', () => {
    expect(compliance).toMatch(/there is no editing yet/)
    expect(compliance).toMatch(/A card that existed before (the gate|Send to family)/)
  })
})

describe('docs/architecture.md', () => {
  const architecture = read('docs/architecture.md')

  it('has the gate in its table and the draft table in its data model', () => {
    expect(architecture).toMatch(/\| Show a guidance card to a family \| The teacher: Send to family/)
    expect(architecture).toContain('`guidance_drafts`')
    expect(architecture).toContain('0025_guidance_drafts.sql')
  })
})
