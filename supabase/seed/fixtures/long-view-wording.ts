// The words for the Long view patterns the `marked` and `session_done` stages are made with, so screens and specs have patterns
// without calling a model. Code (`findPatterns`) finds the patterns, exactly as the long_view job does. These are the plain titles
// and statements the job would have written to its prompt (jobs/long_view.md): what was seen and over which terms, the newer
// results named plainly when there are any, a missing term said honestly, never a label, a comparison or advice.
//
// Only Amina and Naledi get patterns here. The other three learners start without any, so their screens show the empty state and the
// first update.
import { screenPatterns } from '../../../packages/profiling/src/tools/save/save-long-view'
import type { HistoryNote, PatternCandidate } from '../../../packages/profiling/src/schemas/long-view'

export const PATTERN_LEARNERS = ['amina', 'naledi'] as const

/** Plain titles for the patterns the long history is built to show. Anything else gets the plain strand title below. */
const TITLES: Record<string, string> = {
  'struggle:fractions': 'Adding fractions is hard when the bottom numbers differ',
  'strength:shapes': 'Marks in shapes and space stay high',
  'struggle:measurement': 'Measuring length, mass and time stays hard',
}

/** What each pattern's cited teacher notes must speak about (a note is cited only when it clearly speaks about the same thing). */
const NOTES: Record<string, RegExp> = {
  'struggle:fractions': /bottom numbers/i,
  'strength:shapes': /shapes/i,
  'struggle:measurement': /scales|measur|rulers?/i,
}

const STRANDS: Record<string, string> = {
  whole_numbers: 'whole numbers',
  fractions: 'fractions',
  decimals: 'decimals',
  shapes: 'shapes and space',
  measurement: 'measurement',
  data: 'data handling',
}
const strand = (family: string) => STRANDS[family] ?? family.replace(/_/g, ' ')

const at = (t: { grade: number; term: number }) => `Grade ${t.grade} Term ${t.term}`
const andList = (items: string[]) => (items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`)

/** `Class Test 1 in Grade 6 Term 4`: the name is the first part of the source's label (before a comma or a colon), else just the grade and term. */
function newerName(s: PatternCandidate['since'][number]): string {
  const name = s.sources[0]?.label.split(',')[0]?.split(':')[0]?.trim()
  return name ? `${name} in ${at(s)}` : at(s)
}

/** The statement for one pattern, from the terms code found. Two short sentences at most. */
export function statementFor(c: PatternCandidate): string {
  const first = c.terms[0]!
  const last = c.terms[c.terms.length - 1]!
  const what = c.kind === 'struggle' ? 'low' : 'high'
  const held = `Marks in ${strand(c.family)} stayed ${what} from ${at(first)} to ${at(last)}.`
  if (c.since.length > 0) {
    const way = c.kind === 'struggle' ? 'better' : 'weaker'
    return `${held} The newer ${c.since.length === 1 ? 'result' : 'results'}, ${andList(c.since.map(newerName))}, ${c.since.length === 1 ? 'was' : 'were'} ${way}.`
  }
  const gaps = c.missingTerms.filter((m) => m.grade !== undefined)
  if (gaps.length > 0) return `${held} ${andList(gaps.map((m) => `Grade ${m.grade} Term ${m.term}`))} ${gaps.length === 1 ? 'has' : 'have'} no ${strand(c.family)} work.`
  return held
}

export type SeedPattern = { key: string; subject: string; title: string; statement: string; noteIds: string[] }

/**
 * The wording for each candidate code found, in the shape `save_long_view` takes. The same rules the tool applies are applied here
 * (`screenPatterns`): a wording that breaks one stops the seed, so a bad edit to this file shows up at once.
 */
export function wordPatterns(candidates: PatternCandidate[], notes: HistoryNote[]): SeedPattern[] {
  const words = candidates.map((c) => {
    const title = TITLES[c.key] ?? `Marks in ${strand(c.family)} stayed ${c.kind === 'struggle' ? 'low' : 'high'}`
    const speaks = NOTES[c.key]
    const noteIds = speaks ? notes.filter((n) => speaks.test(n.text)).map((n) => n.id) : []
    return { key: c.key, subject: c.subject, title: title.charAt(0).toUpperCase() + title.slice(1), statement: statementFor(c), noteIds }
  })
  const { accepted, dropped } = screenPatterns(words, candidates)
  if (dropped.length > 0) throw new Error(`demo seed: Long view wording was dropped: ${dropped.map((d) => `${d.key} (${d.reason})`).join(', ')}`)
  return accepted
}
