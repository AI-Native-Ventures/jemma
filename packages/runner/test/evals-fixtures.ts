import type { Outcome, TranscriptCall } from '../../../evals/lib/types'
import type { ResultFile } from '../../../evals/lib/result'

/** Builders for the evals tests: transcripts, outcomes and result files that never touched a database or a model. */

export const AT = '2026-11-10T10:00:00.000Z'

export const call = (server: string, tool: string, input: unknown, output: unknown, ok = true): TranscriptCall => ({ server, tool, input, output, ok, answered: true, at: AT })

export const refused = (server: string, tool: string, input: unknown, message: string): TranscriptCall => call(server, tool, input, message, false)

export function outcome(over: Partial<Outcome> = {}): Outcome {
  const attempts = over.attempts ?? [{ model: 'nvidia/nemotron-3.5-super-vl:free', seconds: 40, status: 'done' as const, note: 'All finished.', saved: true, timedOut: false, tokens: { input: 80_000, output: 3_000, costUsd: 0 } }]
  return {
    event: { status: 'done', error: null, runner: 'desktop', attempts: 1 },
    run: { status: 'done', note: 'All finished.' },
    attempts,
    calls: [],
    callsByAttempt: [over.calls ?? []],
    finalModel: attempts.at(-1)?.model ?? null,
    seconds: 42,
    reported: true,
    contentTypes: {},
    ...over,
  }
}

type Step = { name: string; input: unknown; output: unknown; error?: boolean; content?: { type: string; [k: string]: unknown }[] }

/** A goose `--output-format stream-json` run, the way the runner's own fake goose prints it. */
export function gooseStream(steps: Step[], opts: { tokens?: [number, number]; say?: string } = {}): string {
  const out: string[] = ['', '    __( O)>  goose', '   \\____)']
  let clock = 1_794_290_000
  let n = 0
  const message = (role: string, content: unknown[]) => out.push(JSON.stringify({ type: 'message', message: { id: `m${n++}`, role, created: clock++, content, metadata: {} } }))
  steps.forEach((s, i) => {
    const id = `c${i}`
    message('assistant', [{ type: 'toolRequest', id, toolCall: { status: 'success', value: { name: s.name, arguments: s.input } } }])
    const text = typeof s.output === 'string' ? s.output : JSON.stringify(s.output)
    message('user', [
      {
        type: 'toolResponse',
        id,
        toolResult: { status: 'success', value: { content: s.content ?? [{ type: 'text', text }], ...(s.error ? { isError: true } : {}), ...(typeof s.output === 'object' ? { structuredContent: s.output } : {}) } },
      },
    ])
  })
  if (opts.say) message('assistant', [{ type: 'text', text: opts.say }])
  const [input, output] = opts.tokens ?? [1000, 100]
  out.push(JSON.stringify({ type: 'complete', total_tokens: input + output, input_tokens: input, output_tokens: output, cache_read_input_tokens: 0, cache_write_input_tokens: 0, cost_usd: 0 }))
  return out.join('\n') + '\n'
}

/** A saved result file with every check passing, for the report tests. */
export function result(taskId: string, n: number, over: Partial<ResultFile> = {}): ResultFile {
  return {
    version: 1,
    runId: 'test-run',
    taskId,
    n,
    startedAt: '2026-11-10T10:00:00.000Z',
    rehearsal: false,
    seconds: 40 + n,
    wallSeconds: 70 + n,
    pass: true,
    error: null,
    checks: [{ name: 'the event ended done', pass: true, detail: 'status=done' }],
    event: { status: 'done', error: null },
    run: { status: 'done', note: 'All finished.' },
    attempts: [{ model: 'nvidia/nemotron-3.5-super-vl:free', seconds: 40 + n, status: 'done', note: 'All finished.', saved: true, timedOut: false, tokens: { input: 80_000 + n * 1000, output: 3_000, costUsd: 0 } }],
    finalModel: 'nvidia/nemotron-3.5-super-vl:free',
    tokens: { input: 80_000 + n * 1000, output: 3_000, costUsd: 0 },
    toolCalls: ['jemma__get_class_results', 'jemma__complete_job'],
    reported: true,
    facts: {},
    state: {},
    extras: {},
    liveAttempts: 1,
    sandboxIds: [`sandbox-${taskId}-${n}`],
    stream: `${taskId}-${n}.jsonl`,
    scrubbed: false,
    cleanup: [],
    ...over,
  }
}

export const failing = (name: string, detail = 'it did not hold'): Partial<ResultFile> => ({
  pass: false,
  checks: [
    { name: 'the event ended done', pass: true, detail: 'status=done' },
    { name, pass: false, detail },
  ],
})
