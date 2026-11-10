import { parseTranscript } from '../../packages/runner/src/index'
import { callNames } from './checks'
import type { ResultFile } from './result'
import { answerContentTypes } from './stream'
import type { Outcome, Prepared, Task, TranscriptCall } from './types'

/**
 * Judges a saved run again with the task's current checks. A check is plain code on the facts and the transcript, and
 * both are saved with the run, so when a check turns out to have been wrong (it flagged something harmless) the saved
 * run can be read again without calling a model. The run itself is never changed: same stream, same facts, same
 * event and attempts. Only `checks`, `pass` and `extras` are recomputed, and `rescored` keeps what the earlier
 * verdict was, so nothing is hidden. The caller keeps the original file (see `evals/rescore.ts`).
 */

export type Rescored = { at: string; before: { pass: boolean; failedChecks: string[] }; why: string }

/** The stdout of each attempt, from the saved stream (a `jemma_attempt` header line starts each one). */
export function attemptsFromStream(stream: string): string[] {
  const out: string[] = []
  for (const line of stream.split('\n')) {
    if (!line.trim()) continue
    if (line.startsWith('{"type":"jemma_attempt"')) out.push('')
    else if (out.length) out[out.length - 1] += `${line}\n`
  }
  return out
}

export function rescore(result: ResultFile, stream: string, task: Task, why: string, at = new Date().toISOString()): ResultFile {
  if (result.error) throw new Error(`${result.taskId} run ${result.n} had a harness error ("${result.error.slice(0, 80)}"): there is nothing to judge again`)
  const stdouts = attemptsFromStream(stream)
  if (stdouts.length !== result.attempts.length) throw new Error(`${result.taskId} run ${result.n}: the stream has ${stdouts.length} attempt(s) but the result lists ${result.attempts.length}`)
  const callsByAttempt: TranscriptCall[][] = stdouts.map((s) => parseTranscript('goose', s).calls)
  const contentTypes: Record<string, string[]> = {}
  for (const s of stdouts) for (const [name, types] of Object.entries(answerContentTypes(s))) contentTypes[name] = [...new Set([...(contentTypes[name] ?? []), ...types])].sort()
  const outcome: Outcome = {
    event: result.event ? { status: result.event.status, error: result.event.error, runner: 'desktop', attempts: 1 } : null,
    run: result.run ? { status: result.run.status === 'done' ? 'done' : 'failed', note: result.run.note } : null,
    attempts: result.attempts,
    calls: callsByAttempt.flat(),
    callsByAttempt,
    finalModel: result.finalModel,
    seconds: result.seconds,
    reported: result.reported,
    contentTypes,
  }
  // The saved tool names must still be the ones the stream gives, or the stream is not this run's.
  const names = callNames(outcome.calls)
  if (names.join('>') !== result.toolCalls.join('>')) throw new Error(`${result.taskId} run ${result.n}: the tool calls in the stream do not match the ones saved with the result`)
  const prepared = { event: { type: 'paper.checked', payload: {} }, state: result.state } as unknown as Prepared
  const checks = task.checks(result.facts, prepared, outcome)
  const extras = task.extras?.(result.facts, prepared, outcome) ?? {}
  return {
    ...result,
    checks,
    pass: checks.length > 0 && checks.every((c) => c.pass),
    extras,
    ...({ rescored: { at, before: { pass: result.pass, failedChecks: result.checks.filter((c) => !c.pass).map((c) => c.name) }, why } satisfies Rescored } as object),
  }
}
