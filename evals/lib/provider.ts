import { brief } from './checks'
import type { AttemptRecord } from './types'
import type { ResultFile } from './result'

/**
 * When the provider answers a goose run with an error, goose still exits 0 and prints its own line as the last message:
 * "Ran into this error: <category>: <text>". The category is goose's own (`Server error`, `Rate limit exceeded`, or
 * `Request failed: <reason> (<status>)`), so the rule below reads that category and the status, not the sentence after it.
 * Only a provider that did not answer counts: a rate limit, a capacity or server error, a 429 or a 5xx. A bad request
 * (400), a wrong key or a model that simply ended are not.
 */
const GOOSE_ERROR = /^\s*Ran into this error:\s*/i
const RETRY_TAIL = /\s*Please retry if you think this is a transient or recoverable error\.?\s*$/i
const NO_ANSWER = /^(?:Server error\b|Rate limit\b|Request failed:[^()]*\((?:429|5\d\d)\))/i

/** The provider's message (without goose's framing) when the note says the provider gave no answer, else null. */
export function providerErrorOf(note: string): string | null {
  const start = GOOSE_ERROR.exec(note)
  if (!start) return null
  const body = note.slice(start[0].length).replace(RETRY_TAIL, '').replace(/\.{2,}/g, '.').replace(/\s+/g, ' ').trim()
  return NO_ANSWER.test(body) ? brief(body, 240) : null
}

/** The attempt's provider error: the saved field when the result has one, else read from the saved note. */
export function attemptRefusal(a: Pick<AttemptRecord, 'status' | 'note' | 'providerError'>): string | null {
  if (a.status !== 'failed') return null
  return a.providerError !== undefined ? a.providerError : providerErrorOf(a.note)
}

/**
 * Whether the provider gave this run no answer: the harness had no error and the last attempt, the one that ended the
 * agent run, ended on a provider error. Such a run says nothing about the model, so it is told apart from a judged one.
 * Returns the provider's message, or null when the run was judged.
 */
export function refusalOf(r: Pick<ResultFile, 'error' | 'attempts'>): string | null {
  if (r.error) return null
  const last = r.attempts.at(-1)
  return last ? attemptRefusal(last) : null
}
