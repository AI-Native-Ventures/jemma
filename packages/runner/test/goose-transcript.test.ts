import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { parseTranscript, savedSomething, type TranscriptCall } from '../src'

const sample = readFileSync(new URL('./fixtures/goose-stream-sample.jsonl', import.meta.url), 'utf8')

const line = (o: unknown) => JSON.stringify(o)
let n = 0
const msg = (role: string, content: unknown[], created = 1794290000 + n, id = `m${n++}`) => line({ type: 'message', message: { id, role, created, content } })
const ask = (id: string, name: string, args: unknown) => msg('assistant', [{ type: 'toolRequest', id, toolCall: { status: 'success', value: { name, arguments: args } } }])
const reply = (id: string, text: string, extra: Record<string, unknown> = {}, status = 'success') =>
  msg('user', [{ type: 'toolResponse', id, toolResult: { status, value: { content: [{ type: 'text', text }], ...extra } } }])
const banner = ['', '    __( O)>  ● new session', '   \\____)    20261110_3 · /tmp', '     L L     goose is ready']
const finish = (extra: Record<string, unknown> = {}) => line({ type: 'complete', total_tokens: 12, input_tokens: 10, output_tokens: 2, ...extra })

test('the real stream sample: banner ignored, calls in order with server and tool split on the first __', () => {
  const seen = parseTranscript('goose', sample)
  expect(seen.calls.map((c) => `${c.server}.${c.tool}`)).toEqual(['npx.write_file', 'npx.read_text_file'])
  expect(seen.toolCalls).toEqual(['npx__write_file', 'npx__read_text_file'])
  expect(seen.calls[0]).toMatchObject({ server: 'npx', tool: 'write_file', ok: true, answered: true })
  expect((seen.calls[0]!.input as { content: string }).content).toBe('ok')
  expect(seen.calls[0]!.output).toMatchObject({ content: expect.stringContaining('Successfully wrote') })
  expect(seen.calls[1]!.output).toEqual({ content: 'ok' })
  expect(seen.calls[0]!.at).toBe(new Date(1794290623 * 1000).toISOString())
  expect(seen.calls[1]!.at).toBe(new Date(1794290625 * 1000).toISOString())
  expect(seen.lastMessage).toBe('done')
  expect(seen.completed).toBeNull()
  expect(seen.usage).toEqual({ inputTokens: 12383, outputTokens: 352, costUsd: 0 })
})

test('done only when complete_job was asked with done and answered with success', () => {
  const run = (answer: string, status = 'done', extra: Record<string, unknown> = {}, answerStatus = 'success') =>
    parseTranscript(
      'goose',
      [...banner, ask('a', 'jemma__complete_job', { eventId: 'e', status, note: 'because' }), reply('a', answer, extra, answerStatus), msg('assistant', [{ type: 'text', text: 'Finished.' }]), finish()].join('\n'),
    )
  expect(run('{"ok":true}')).toMatchObject({ completed: 'done', completeNote: 'because', lastMessage: 'Finished.' })
  expect(run('{"ok":true}', 'failed')).toMatchObject({ completed: 'failed', completeNote: 'because' })
  // an errored answer does not count, however the error is shaped
  expect(run('not in this school', 'done', { isError: true }).completed).toBeNull()
  expect(run('boom', 'done', {}, 'error').completed).toBeNull()
  // a complete_job with no answer does not count either
  const unanswered = parseTranscript('goose', [ask('a', 'jemma__complete_job', { eventId: 'e', status: 'done' }), finish()].join('\n'))
  expect(unanswered.completed).toBeNull()
  // only the Jemma server can complete a job
  const other = parseTranscript('goose', [ask('a', 'files__complete_job', { eventId: 'e', status: 'done' }), reply('a', 'ok')].join('\n'))
  expect(other.completed).toBeNull()
})

test('the whole Jemma job: reads, save, copy, complete', () => {
  const stream = [
    ...banner,
    ask('1', 'jemma__get_job', { eventId: 'e' }),
    reply('1', '{"job":"class_report"}'),
    ask('2', 'jemma__get_class_results', { testId: 't' }),
    reply('2', '{}'),
    ask('3', 'jemma__class_gap_report', { classId: 'c', testId: 't' }),
    reply('3', '{"ok":true}'),
    ask('4', 'files__write_file', { path: '/r/class_report-c.md', content: '# Q3' }),
    reply('4', 'Successfully wrote', { structuredContent: { content: 'Successfully wrote' } }),
    ask('5', 'jemma__complete_job', { eventId: 'e', status: 'done' }),
    reply('5', '{"ok":true}'),
    finish({ cost_usd: 0.002 }),
  ].join('\n')
  const seen = parseTranscript('goose', stream)
  expect(seen.calls.map((c) => `${c.server}__${c.tool}`)).toEqual([
    'jemma__get_job', 'jemma__get_class_results', 'jemma__class_gap_report', 'files__write_file', 'jemma__complete_job',
  ])
  expect(seen.completed).toBe('done')
  expect(seen.usage).toEqual({ inputTokens: 10, outputTokens: 2, costUsd: 0.002 })
  expect(savedSomething(seen.calls)).toBe(true)
})

test('the last message joins the pieces of one streamed message and ignores thinking', () => {
  const stream = [
    msg('assistant', [{ type: 'thinking', thinking: 'hmm' }], 1, 'g1'),
    msg('assistant', [{ type: 'text', text: 'First ' }], 2, 'g1'),
    msg('assistant', [{ type: 'text', text: 'part.' }], 2, 'g1'),
    ask('1', 'jemma__get_job', {}),
    reply('1', 'x'),
    msg('assistant', [{ type: 'text', text: 'Almost ' }], 3, 'g2'),
    msg('assistant', [{ type: 'text', text: 'there.' }], 3, 'g2'),
    msg('assistant', [{ type: 'thinking', thinking: 'more thinking' }], 3, 'g2'),
  ].join('\n')
  expect(parseTranscript('goose', stream).lastMessage).toBe('Almost there.')
})

test('a provider error arrives as plain text, with zero tokens and no cost key', () => {
  const stream = [...banner, msg('assistant', [{ type: 'text', text: 'Network error: Could not connect.' }]), line({ type: 'complete', total_tokens: 0, input_tokens: 0, output_tokens: 0 })].join('\n')
  const seen = parseTranscript('goose', stream)
  expect(seen).toMatchObject({ completed: null, lastMessage: 'Network error: Could not connect.', calls: [], usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 } })
})

test('a tool request goose could not parse is kept as an unknown call that never saved', () => {
  const stream = [msg('assistant', [{ type: 'toolRequest', id: 'x', toolCall: { status: 'error', error: 'bad arguments' } }]), reply('x', 'bad arguments', {}, 'error')].join('\n')
  const seen = parseTranscript('goose', stream)
  expect(seen.calls).toHaveLength(1)
  expect(seen.calls[0]).toMatchObject({ server: 'unknown', tool: 'unknown', ok: false, answered: true })
  expect(savedSomething(seen.calls)).toBe(false)
})

test('garbage lines and a missing complete event are fine', () => {
  const seen = parseTranscript('goose', 'goose is ready\n{not json\n{"type":"message"}\n')
  expect(seen).toMatchObject({ completed: null, lastMessage: '', calls: [], toolCalls: [], usage: null })
})

test('claude and codex transcripts keep working and carry no calls or usage', () => {
  const claude = [
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'c', name: 'mcp__jemma__complete_job', input: { eventId: 'e', status: 'done' } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'c', is_error: false, content: 'ok' }] } },
  ].map(line).join('\n')
  expect(parseTranscript('claude', claude)).toMatchObject({ completed: 'done', toolCalls: ['mcp__jemma__complete_job'], calls: [], usage: null })
})

const call = (server: string, tool: string, ok: boolean, answered = true): TranscriptCall => ({ server, tool, input: {}, output: null, ok, answered, at: '2026-11-10T00:00:00.000Z' })

test('savedSomething: reads never count, a successful or unanswered Jemma write does, an errored one does not', () => {
  expect(savedSomething([call('jemma', 'get_job', true), call('jemma', 'get_class_results', true), call('files', 'write_file', true)])).toBe(false)
  expect(savedSomething([call('jemma', 'class_gap_report', true)])).toBe(true)
  expect(savedSomething([call('jemma', 'subject_guidance', true)])).toBe(true)
  expect(savedSomething([call('jemma', 'complete_job', true)])).toBe(true)
  expect(savedSomething([call('jemma', 'class_gap_report', false)])).toBe(false)
  // the run ended while the save was in flight: it may have gone through
  expect(savedSomething([call('jemma', 'class_gap_report', false, false)])).toBe(true)
  expect(savedSomething([])).toBe(false)
})
