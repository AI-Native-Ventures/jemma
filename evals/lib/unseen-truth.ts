import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { TopicMapDraft } from '../../packages/profiling/src/schemas'

/**
 * The ground truth of the three curriculum documents Jemma has not seen (`fixtures/curriculum/unseen/*.json`): what is in each
 * document, and a draft that is right in every way. Nothing else is imported here, so the web app's browser spec can read it.
 */

export const UNSEEN_DIR = fileURLToPath(new URL('../../fixtures/curriculum/unseen/', import.meta.url))

/** Words that must all be in the name of a draft topic (after the same light stemming) for it to be this topic. Several lists: any one will do. */
export type Match = string[][]

export type Truth = {
  id: string
  file: string
  mimeType: string
  grade: number
  subject: string
  country: string
  termCount: number
  textLayer: boolean
  /** The family keys the subject allows, or null: any short lowercase word is accepted. */
  families: string[] | null
  topics: { name: string; terms: number[]; family: string; match: Match }[]
  traps: {
    twoTerms: { name: string; terms: number[] }
    otherGrade: { name: string; grade: number; match: Match }
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const isTerms = (v: unknown, min = 1): v is number[] => Array.isArray(v) && v.length >= min && v.every((t) => Number.isInteger(t) && t >= 1 && t <= 4)
const isMatch = (v: unknown): v is Match => Array.isArray(v) && v.length > 0 && v.every((l) => Array.isArray(l) && l.length > 0 && l.every(isStr))

/** Reads a ground truth file and says plainly what is wrong with it. */
export function parseTruth(raw: unknown, where: string): Truth {
  const bad = (what: string) => new Error(`${where}: ${what}`)
  if (!isObj(raw)) throw bad('not an object')
  for (const k of ['id', 'file', 'mimeType', 'subject', 'country'] as const) if (!isStr(raw[k])) throw bad(`${k} is missing`)
  if (!Number.isInteger(raw.grade)) throw bad('grade is missing')
  if (!Number.isInteger(raw.termCount) || (raw.termCount as number) < 1 || (raw.termCount as number) > 4) throw bad('termCount must be 1 to 4')
  if (typeof raw.textLayer !== 'boolean') throw bad('textLayer is missing')
  if (raw.families !== null && !(Array.isArray(raw.families) && raw.families.every(isStr))) throw bad('families must be a list or null')
  if (!Array.isArray(raw.topics) || raw.topics.length === 0) throw bad('topics are missing')
  for (const t of raw.topics) {
    if (!isObj(t) || !isStr(t.name) || !isStr(t.family) || !isTerms(t.terms) || !isMatch(t.match)) throw bad(`a topic is malformed: ${JSON.stringify(t).slice(0, 80)}`)
    if ((t.terms as number[]).some((n) => n > (raw.termCount as number))) throw bad(`topic "${t.name}" is in a term the document does not have`)
  }
  const traps = raw.traps
  if (!isObj(traps) || !isObj(traps.twoTerms) || !isStr(traps.twoTerms.name) || !isTerms(traps.twoTerms.terms, 2)) throw bad('traps.twoTerms is malformed')
  if (!isObj(traps.otherGrade) || !isStr(traps.otherGrade.name) || !Number.isInteger(traps.otherGrade.grade) || !isMatch(traps.otherGrade.match)) throw bad('traps.otherGrade is malformed')
  if (!(raw.topics as { name: string }[]).some((t) => t.name === (traps.twoTerms as { name: string }).name)) throw bad('the topic listed in two terms is not among the topics')
  return raw as unknown as Truth
}

export const DOCUMENT_IDS = ['grade9-natural-sciences-za', 'grade5-english-za', 'grade4-science-technology-ke'] as const
export type DocumentId = (typeof DOCUMENT_IDS)[number]

export function loadTruth(id: string, dir = UNSEEN_DIR): Truth {
  const truth = parseTruth(JSON.parse(readFileSync(join(dir, `${id}.json`), 'utf8')), `${id}.json`)
  if (truth.id !== id) throw new Error(`${id}.json holds the ground truth of ${truth.id}`)
  return truth
}

/**
 * A draft that is right in every way the scorer looks at: every topic in its first term, a question on the topic listed in
 * two terms, the topic of another grade under leftOut. For tests, to show what a perfect run looks like.
 */
export function perfectDraft(t: Truth): TopicMapDraft {
  const terms = Array.from({ length: t.termCount }, (_, i) => i + 1) as (1 | 2 | 3 | 4)[]
  return {
    grade: t.grade,
    terms: terms.map((term) => ({
      term,
      topics: t.topics
        .filter((x) => x.terms[0] === term)
        .map((x) => ({
          name: x.name,
          family: x.family,
          prerequisites: [],
          misconceptions: [],
          ...(x.name === t.traps.twoTerms.name ? { check: { reason: `Listed in Terms ${x.terms.join(' and ')}`, options: [`Keep in Term ${x.terms[0]}`, `Move to Term ${x.terms[1]}`] } } : {}),
        })),
    })),
    leftOut: [{ name: t.traps.otherGrade.name, reason: `A Grade ${t.traps.otherGrade.grade} topic` }],
  }
}
