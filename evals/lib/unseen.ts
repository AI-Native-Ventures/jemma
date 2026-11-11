import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { TopicMapDraft } from '../../packages/profiling/src/schemas'
import { check, list, median } from './checks'
import type { Check } from './types'

/**
 * The curriculum reader on documents it has not seen. Each document has a ground truth next to it
 * (`fixtures/curriculum/unseen/*.json`), and plain code scores a saved draft against it. No model judges a model.
 */

export const UNSEEN_DIR = fileURLToPath(new URL('../../fixtures/curriculum/unseen/', import.meta.url))
/** The folder of `evals/results` that holds the runs of the curriculum reader on these documents. */
export const UNSEEN_FOLDER = 'unseen-curriculum'
export const UNSEEN_RESULTS = fileURLToPath(new URL(`../results/${UNSEEN_FOLDER}/`, import.meta.url))

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

// ---------- matching a draft topic to the ground truth ----------

/** One light stemming for both sides: "Photosynthesis" and "photosynthesis", "bases" and "base", "flowering" and "flower". */
export function stem(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3)
  if (word.length > 3 && word.endsWith('s') && !/(ss|us|is)$/.test(word)) return word.slice(0, -1)
  return word
}

export const wordsOf = (text: string): string[] => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean).map(stem)

/** True when the name has every word of one of the lists. */
export function nameMatches(name: string, match: string[][]): boolean {
  const have = new Set(wordsOf(name))
  return match.some((words) => words.map(stem).every((w) => have.has(w)))
}

// ---------- scoring ----------

export const THRESHOLDS = { found: 0.8, invented: 0.15, rightTerm: 0.8 } as const
export const FAMILY_WORD = /^[a-z][a-z_]{0,23}$/

type DraftTopic = { name: string; term: number; family: string; hasCheck: boolean }
const topicsOf = (draft: TopicMapDraft): DraftTopic[] =>
  draft.terms.flatMap((t) => t.topics.map((x) => ({ name: x.name, term: t.term, family: x.family, hasCheck: !!x.check && x.check.reason.trim().length > 0 })))

const pct = (n: number, of: number) => (of === 0 ? 0 : Math.round((n / of) * 100))

export type Score = {
  pass: boolean
  checks: Check[]
  figures: { found: number; of: number; invented: number; drafted: number; rightTerm: number; termsInDraft: number[] }
}

/** Scores one saved draft against the ground truth of its document. Pure: no database, no model. */
export function scoreDraft(draft: TopicMapDraft, truth: Truth): Score {
  const topics = topicsOf(draft)
  const trapNames = truth.traps.otherGrade.match
  const matches = (t: DraftTopic, m: string[][]) => nameMatches(t.name, m)

  const perTruth = truth.topics.map((g) => ({ g, hits: topics.filter((t) => matches(t, g.match)) }))
  const found = perTruth.filter((x) => x.hits.length > 0)
  const invented = topics.filter((t) => !truth.topics.some((g) => matches(t, g.match)) && !matches(t, trapNames))
  const rightTerm = found.filter((x) => x.hits.some((h) => x.g.terms.includes(h.term)))

  const out: Check[] = []
  out.push(check('the draft is for the right grade', draft.grade === truth.grade, `draft grade ${draft.grade}, document grade ${truth.grade}`))

  out.push(
    check(
      `at least ${pct(THRESHOLDS.found, 1)} percent of the topics were found`,
      found.length >= Math.ceil(THRESHOLDS.found * truth.topics.length),
      `found ${found.length} of ${truth.topics.length}${found.length < truth.topics.length ? `; missing: ${list(perTruth.filter((x) => x.hits.length === 0).map((x) => x.g.name), 5)}` : ''}`,
    ),
  )

  const inventedShare = topics.length === 0 ? 1 : invented.length / topics.length
  out.push(
    check(
      `at most ${pct(THRESHOLDS.invented, 1)} percent of the draft is made up`,
      inventedShare <= THRESHOLDS.invented,
      `${invented.length} of ${topics.length} drafted topics are not in the document${invented.length ? `: ${list(invented.map((t) => t.name), 5)}` : ''}`,
    ),
  )

  out.push(
    check(
      `at least ${pct(THRESHOLDS.rightTerm, 1)} percent of the found topics are in the right term`,
      found.length > 0 && rightTerm.length >= Math.ceil(THRESHOLDS.rightTerm * found.length),
      `${rightTerm.length} of ${found.length} found topics in the right term${rightTerm.length < found.length ? `; wrong: ${list(found.filter((x) => !rightTerm.includes(x)).map((x) => `${x.g.name} (put in Term ${x.hits.map((h) => h.term).join(' and ')}, should be ${x.g.terms.join(' or ')})`), 4)}` : ''}`,
    ),
  )

  const two = perTruth.find((x) => x.g.name === truth.traps.twoTerms.name)
  const twoFlagged = !!two && two.hits.some((h) => h.hasCheck)
  out.push(
    check(
      'the topic listed in two terms is flagged with a question',
      twoFlagged,
      !two || two.hits.length === 0 ? `"${truth.traps.twoTerms.name}" is not in the draft at all` : twoFlagged ? `"${truth.traps.twoTerms.name}" has a check` : `"${truth.traps.twoTerms.name}" is in the draft with no question for the teacher`,
    ),
  )

  const inDraft = topics.filter((t) => matches(t, trapNames))
  const inLeftOut = draft.leftOut.some((l) => nameMatches(l.name, trapNames))
  const otherFlagged = inLeftOut || inDraft.some((t) => t.hasCheck)
  out.push(
    check(
      'the topic of another grade is flagged with a question or left out with a reason',
      otherFlagged,
      inLeftOut ? `"${truth.traps.otherGrade.name}" is under leftOut` : otherFlagged ? `"${truth.traps.otherGrade.name}" has a check` : inDraft.length ? `"${truth.traps.otherGrade.name}" is a normal topic of Term ${inDraft[0]!.term}, with no question` : `"${truth.traps.otherGrade.name}" is neither in the draft nor under leftOut`,
    ),
  )

  const bad = truth.families
    ? topics.filter((t) => !truth.families!.includes(t.family)).map((t) => `${t.name}: "${t.family}"`)
    : topics.filter((t) => !FAMILY_WORD.test(t.family)).map((t) => `${t.name}: "${t.family}"`)
  out.push(
    check(
      truth.families ? 'every family key is one of the subject\'s keys' : 'every family key is a short lowercase word',
      topics.length > 0 && bad.length === 0,
      bad.length ? `not allowed: ${list(bad, 4)}` : truth.families ? `all ${topics.length} are among ${truth.families.join(', ')}` : `all ${topics.length} are short lowercase words`,
    ),
  )

  const termsInDraft = [...new Set(draft.terms.filter((t) => t.topics.length > 0).map((t) => t.term))].sort((a, b) => a - b)
  const countOk = termsInDraft.length === truth.termCount && termsInDraft.every((t) => t <= truth.termCount)
  out.push(check('the map has the number of terms the document has', countOk, `the document has ${truth.termCount} terms, the draft has terms ${termsInDraft.join(', ') || 'none'}`))

  return {
    pass: out.every((c) => c.pass),
    checks: out,
    figures: { found: found.length, of: truth.topics.length, invented: invented.length, drafted: topics.length, rightTerm: rightTerm.length, termsInDraft },
  }
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

// ---------- the result of one live run ----------

export const RESULT_VERSION = 1

export type Verdict = 'pass' | 'fail' | 'no_answer'

/** What one live run of `draft_map` on one document saves. EVALS.md is generated from these files and nothing else. */
export type UnseenResult = {
  version: typeof RESULT_VERSION
  runId: string
  docId: string
  /** Which of the three runs of this document (1 to 3). */
  n: number
  /** Which try of this run: 1, or 2 and up when the provider gave no answer and the run was repeated. */
  attempt: number
  startedAt: string
  verdict: Verdict
  seconds: number
  /** Live model calls this try made: the vision call, plus the text call when it was asked. */
  calls: number
  /** The way the documents were read, from the tool log. Null when the job did not get far enough to log it. */
  way: 'vision' | 'text' | null
  /** Why the first way was not enough, from the tool log. */
  visionProblem: string | null
  model: string | null
  /** The error of the job, when it ended on one. */
  error: string | null
  /** The provider's words, when the verdict is no_answer. */
  noAnswer: string | null
  checks: Check[]
  figures: Score['figures'] | null
  /** The draft the model made, as saved. Null when there was none. */
  draft: TopicMapDraft | null
}

export function parseUnseenResult(text: string, where: string): UnseenResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (err) {
    throw new Error(`${where}: not valid JSON (${err instanceof Error ? err.message : 'parse error'})`)
  }
  const bad = (what: string) => new Error(`${where}: ${what}`)
  if (!isObj(raw)) throw bad('not a result object')
  if (raw.version !== RESULT_VERSION) throw bad(`version ${String(raw.version)} is not ${RESULT_VERSION}`)
  for (const key of ['runId', 'docId', 'startedAt'] as const) if (typeof raw[key] !== 'string') throw bad(`${key} is missing`)
  for (const key of ['n', 'attempt', 'seconds', 'calls'] as const) if (typeof raw[key] !== 'number') throw bad(`${key} is missing`)
  if (raw.verdict !== 'pass' && raw.verdict !== 'fail' && raw.verdict !== 'no_answer') throw bad('verdict is missing')
  if (!Array.isArray(raw.checks)) throw bad('checks are missing')
  return raw as unknown as UnseenResult
}

/** The last try of each run (the one that counts): a repeat replaces the try that got no answer. */
export function finalTries(results: UnseenResult[]): UnseenResult[] {
  const best = new Map<string, UnseenResult>()
  for (const r of results) {
    const key = `${r.docId}|${r.n}`
    const old = best.get(key)
    if (!old || r.attempt > old.attempt) best.set(key, r)
  }
  return [...best.values()].sort((a, b) => a.docId.localeCompare(b.docId) || a.n - b.n)
}

/** Words for what the checks found, for the row of a document in EVALS.md. */
export function whatWentWrong(runs: UnseenResult[]): string {
  const parts: string[] = []
  const noAnswer = runs.filter((r) => r.verdict === 'no_answer')
  if (noAnswer.length) {
    const said = [...new Set(noAnswer.map((r) => r.noAnswer ?? r.error ?? 'no message'))]
    parts.push(`${noAnswer.length === 1 ? 'one run' : `${noAnswer.length} runs`} got no answer from the free endpoint (${said.map((m) => `"${m}"`).join(' and ')}), so ${noAnswer.length === 1 ? 'it was' : 'they were'} not judged`)
  }
  const failed = runs.filter((r) => r.verdict === 'fail')
  const reasons = new Map<string, number[]>()
  for (const r of failed) {
    const names = r.error ? [`the job ended on an error: ${r.error.slice(0, 120)}`] : r.checks.filter((c) => !c.pass).map((c) => `${c.name} (${c.detail})`)
    for (const n of names) reasons.set(n, [...(reasons.get(n) ?? []), r.n])
  }
  for (const [why, ns] of reasons) parts.push(`run${ns.length > 1 ? 's' : ''} ${ns.join(', ')}: ${why}`)
  return parts.length ? parts.join('. ') : 'nothing: every run passed every check'
}

export const medianSeconds = (runs: UnseenResult[]) => median(runs.map((r) => r.seconds))
