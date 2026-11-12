import { fileURLToPath } from 'node:url'
import type { TopicMapDraft } from '../../packages/profiling/src/schemas'
import { check, list, median } from './checks'
import type { Check } from './types'
import { UNSEEN_DIR, OTHER_SUBJECTS_DIR, OTHER_SUBJECT_IDS, documentPath, folderOf, loadTruth, parseTruth, perfectDraft, DOCUMENT_IDS, type DocumentId, type Match, type Truth } from './unseen-truth'

export { UNSEEN_DIR, OTHER_SUBJECTS_DIR, OTHER_SUBJECT_IDS, documentPath, folderOf, loadTruth, parseTruth, perfectDraft, DOCUMENT_IDS, type DocumentId, type Match, type Truth }

/**
 * The curriculum reader on documents it has not seen. Each document has a ground truth next to it
 * (`fixtures/curriculum/unseen/*.json`, and `other-subjects/` for the three documents outside Mathematics), and plain code scores
 * a saved draft against it. No model judges a model.
 */

/** The folder of `evals/results` that holds the runs of the curriculum reader on these documents. */
export const UNSEEN_FOLDER = 'unseen-curriculum'
export const UNSEEN_RESULTS = fileURLToPath(new URL(`../results/${UNSEEN_FOLDER}/`, import.meta.url))

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
/** One or two short lowercase words ("algebra", "whole_numbers"): what a Mathematics plan may use besides the subject's list. */
export const FAMILY_ONE_OR_TWO_WORDS = /^[a-z]{2,15}([ _][a-z]{2,15})?$/

type DraftTopic = { name: string; term: number; family: string; hasCheck: boolean }
const topicsOf = (draft: TopicMapDraft): DraftTopic[] =>
  draft.terms.flatMap((t) => t.topics.map((x) => ({ name: x.name, term: t.term, family: x.family, hasCheck: !!x.check && x.check.reason.trim().length > 0 })))

const pct = (n: number, of: number) => (of === 0 ? 0 : Math.round((n / of) * 100))

export type Score = {
  pass: boolean
  checks: Check[]
  figures: {
    found: number
    of: number
    invented: number
    drafted: number
    rightTerm: number
    termsInDraft: number[]
    /** Only for a document that accepts other family words: the words the draft used that are not in the subject's list. */
    extraFamilies?: string[]
  }
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

  const inList = (family: string) => !!truth.families?.includes(family)
  const accepted = (family: string) => (truth.families ? inList(family) || (!!truth.otherFamilyWords && FAMILY_ONE_OR_TWO_WORDS.test(family)) : FAMILY_WORD.test(family))
  const bad = topics.filter((t) => !accepted(t.family)).map((t) => `${t.name}: "${t.family}"`)
  const extraFamilies = truth.otherFamilyWords ? [...new Set(topics.filter((t) => accepted(t.family) && !inList(t.family)).map((t) => t.family))].sort() : undefined
  out.push(
    check(
      truth.families ? (truth.otherFamilyWords ? "every family key is one of the subject's keys, or one or two short lowercase words" : 'every family key is one of the subject\'s keys') : 'every family key is a short lowercase word',
      topics.length > 0 && bad.length === 0,
      bad.length
        ? `not allowed: ${list(bad, 4)}`
        : truth.families
          ? extraFamilies?.length
            ? `all ${topics.length} are accepted; not in the list (${truth.families.join(', ')}): ${extraFamilies.join(', ')}`
            : `all ${topics.length} are among ${truth.families.join(', ')}`
          : `all ${topics.length} are short lowercase words`,
    ),
  )

  const termsInDraft = [...new Set(draft.terms.filter((t) => t.topics.length > 0).map((t) => t.term))].sort((a, b) => a - b)
  const countOk = termsInDraft.length === truth.termCount && termsInDraft.every((t) => t <= truth.termCount)
  out.push(check('the map has the number of terms the document has', countOk, `the document has ${truth.termCount} terms, the draft has terms ${termsInDraft.join(', ') || 'none'}`))

  return {
    pass: out.every((c) => c.pass),
    checks: out,
    figures: { found: found.length, of: truth.topics.length, invented: invented.length, drafted: topics.length, rightTerm: rightTerm.length, termsInDraft, ...(extraFamilies ? { extraFamilies } : {}) },
  }
}

// ---------- who asked about the topic listed in two terms ----------

/** Who asked the teacher about the topic that the document lists in two terms: the model, code (the step that saves the map), or nobody. */
export type AskedBy = 'model' | 'code' | 'none'

/** The words code uses for that question (`repeatedTopicQuestion` in packages/profiling/src/logic/topic-questions.ts). */
const CODE_QUESTION = /^Listed in Term \d(, Term \d)* and Term \d\. Which term is it taught in\?$/

/**
 * Tells who asked, from the saved draft and from the count the save step wrote in the tool log. Code asked when the question on
 * every entry of the topic is the one code writes and the count says code added some. Any other question is the model's.
 */
export function whoAsked(draft: TopicMapDraft, truth: Truth, codeQuestions: number): AskedBy {
  const two = truth.topics.find((g) => g.name === truth.traps.twoTerms.name)
  if (!two) return 'none'
  const questions = topicsOf(draft)
    .filter((t) => nameMatches(t.name, two.match) && t.hasCheck)
    .map((t) => draft.terms.find((x) => x.term === t.term)!.topics.find((x) => x.name === t.name)!.check!.reason.trim())
  if (questions.length === 0) return 'none'
  return codeQuestions > 0 && questions.every((q) => CODE_QUESTION.test(q)) ? 'code' : 'model'
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
  /** The words of this machine's network failing, when the try never got an answer (it is repeated and is not a provider's no answer). */
  machineNetwork?: string | null
  /** How many questions the step that saves the map added by code (the tool log of `save_topic_map_draft`). Null when no draft was saved; missing in results from before the field. */
  codeQuestions?: number | null
  /** Who asked about the topic that the document lists in two terms: the model, code, or nobody. Null when no draft was saved; missing in results from before the field. */
  twoTermsAskedBy?: AskedBy | null
  checks: Check[]
  figures: Score['figures'] | null
  /** The draft the model made, as saved. Null when there was none. */
  draft: TopicMapDraft | null
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

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

export const runKey = (docId: string, n: number) => `${docId}|${n}`

/** A try that really asked a model. A try lost to this machine's own network, or one that could not even make its school, is not a live run and is not on the ledger. */
export const isLiveRun = (r: UnseenResult): boolean => r.calls > 0 && !r.machineNetwork

const byRun = (results: UnseenResult[]): Map<string, UnseenResult[]> => {
  const map = new Map<string, UnseenResult[]>()
  for (const r of [...results].sort((a, b) => a.attempt - b.attempt)) map.set(runKey(r.docId, r.n), [...(map.get(runKey(r.docId, r.n)) ?? []), r])
  return map
}

/** How many tries were repeats of a run where the provider gave no answer (a try lost to this machine's network is not one). */
export function countRepeats(results: UnseenResult[]): number {
  let repeats = 0
  for (const tries of byRun(results).values()) for (let i = 1; i < tries.length; i++) if (tries[i - 1]!.verdict === 'no_answer' && !tries[i - 1]!.machineNetwork) repeats++
  return repeats
}

export type ResumePlan = {
  /** Runs (`docId|n`) that already have a result and must not be run again. */
  done: Set<string>
  /** The try number to start each unfinished run at. */
  nextAttempt: Map<string, number>
  repeatsUsed: number
  networkTries: number
}

/**
 * What a script that finds a result folder of the same run id has left to do. A pass or a fail is a result and is never run
 * again. A try lost to this machine's network is no result and uses up no repeat. A provider no answer is repeated while a
 * repeat is left, and is the result of its run when none is.
 */
export function planResume(existing: UnseenResult[], repeatsAllowed: number): ResumePlan {
  const runs = byRun(existing)
  const nextAttempt = new Map<string, number>()
  let networkTries = 0
  for (const [key, tries] of runs) {
    nextAttempt.set(key, tries[tries.length - 1]!.attempt + 1)
    networkTries += tries.filter((t) => t.machineNetwork).length
  }
  const repeatsUsed = countRepeats(existing)
  const done = new Set<string>()
  for (const [key, tries] of runs) {
    const last = tries[tries.length - 1]!
    if (last.verdict !== 'no_answer' || (!last.machineNetwork && repeatsUsed >= repeatsAllowed)) done.add(key)
  }
  return { done, nextAttempt, repeatsUsed, networkTries }
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
  const lost = runs.filter((r) => r.verdict === 'no_answer' && r.machineNetwork)
  if (lost.length) {
    const said = [...new Set(lost.map((r) => r.machineNetwork!))]
    parts.push(`${lost.length === 1 ? 'one run' : `${lost.length} runs`} never got past this Mac's own network (${said.map((m) => `"${m}"`).join(' and ')}), so ${lost.length === 1 ? 'it was' : 'they were'} not judged`)
  }
  const noAnswer = runs.filter((r) => r.verdict === 'no_answer' && !r.machineNetwork)
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
