import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { keepsToolLine } from '../src/operator'
import { parseTranscript } from '../src/transcript'

// The operator keeps only the lines of an agent's stream that can name a tool call (a vision job's stream is large), and
// reads the call list from them for the trace. No database, no network, no agent.

const goose = readFileSync(new URL('./fixtures/goose-stream-sample.jsonl', import.meta.url), 'utf8')
const keep = (agent: 'claude' | 'codex' | 'goose', text: string) => text.split('\n').filter((line) => keepsToolLine(agent, line))

/** What the operator did before `keepsToolLine`, for claude and codex: the first 80 characters hold one of two markers. */
const before = (line: string) => line.slice(0, 80).includes('"assistant"') || line.slice(0, 80).includes('item.completed')

const j = (o: unknown) => JSON.stringify(o)
const claudeStream = [
  j({ type: 'system', subtype: 'init', session_id: 's1', tools: [] }),
  j({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'a', name: 'mcp__jemma__get_paper', input: { paperId: 'p1' } }] } }),
  j({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'a', content: 'ok', is_error: false }] } }),
  j({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'b', name: 'mcp__jemma__mark_paper', input: { paperId: 'p1' } }] } }),
  j({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'c', name: 'mcp__jemma__complete_job', input: { eventId: 'e1', status: 'done' } }] } }),
  j({ type: 'result', subtype: 'success', is_error: false, result: 'done' }),
]
const codexStream = [
  j({ type: 'thread.started', thread_id: 't1' }),
  j({ type: 'item.completed', item: { id: 'i1', type: 'mcp_tool_call', server: 'jemma', tool: 'get_paper', arguments: { paperId: 'p1' }, status: 'completed' } }),
  j({ type: 'item.completed', item: { id: 'i2', type: 'mcp_tool_call', server: 'jemma', tool: 'complete_job', arguments: { eventId: 'e1', status: 'done' }, status: 'completed' } }),
  j({ type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 2 } }),
]

test('goose: a real stream sample keeps the lines that hold the tool calls, so the trace lists them', () => {
  const kept = keep('goose', goose).join('\n')
  const whole = parseTranscript('goose', goose).toolCalls
  expect(whole.length).toBeGreaterThan(0)
  expect(parseTranscript('goose', kept).toolCalls).toEqual(whole)
  expect(whole).toEqual(['npx__write_file', 'npx__read_text_file'])
})

test('goose: the role comes after a long message id, and the old 80 character rule would have missed it', () => {
  const lines = goose.split('\n').filter((line) => line.startsWith('{'))
  expect(lines.some((line) => line.includes('"role":"assistant"') && !before(line))).toBe(true)
  const long = `{"type":"message","message":{"id":"${'x'.repeat(120)}","role":"assistant","content":[]}}`
  expect(keepsToolLine('goose', long)).toBe(true)
  const late = `{"type":"message","message":{"id":"${'x'.repeat(200)}","role":"assistant","content":[]}}`
  expect(keepsToolLine('goose', late)).toBe(false)
})

test('goose: answers (role user), the banner and the complete line are not kept', () => {
  const user = j({ type: 'message', message: { id: 'm1', role: 'user', created: 1, content: [{ type: 'toolResponse', id: 'r1', toolResult: { status: 'success', value: {} } }] } })
  expect(keepsToolLine('goose', user)).toBe(false)
  expect(keepsToolLine('goose', '    __( O)>  new session')).toBe(false)
  expect(keepsToolLine('goose', '')).toBe(false)
  expect(keepsToolLine('goose', j({ type: 'complete', total_tokens: 12 }))).toBe(false)
})

test('claude and codex: the same lines are kept as before, whatever the engine name', () => {
  for (const [agent, stream] of [['claude', claudeStream], ['codex', codexStream]] as const) {
    const kept = keep(agent, stream.join('\n'))
    expect(kept, agent).toEqual(stream.filter(before))
    expect(kept.length, agent).toBeGreaterThan(0)
  }
  expect(keep('claude', claudeStream.join('\n'))).toHaveLength(3) // the three assistant lines; init, answers and result are dropped
  expect(keep('codex', codexStream.join('\n'))).toHaveLength(2)
})

test('claude and codex: the trace lists the same calls from the kept lines as from the whole stream', () => {
  expect(parseTranscript('claude', keep('claude', claudeStream.join('\n')).join('\n')).toolCalls).toEqual(parseTranscript('claude', claudeStream.join('\n')).toolCalls)
  expect(parseTranscript('codex', keep('codex', codexStream.join('\n')).join('\n')).toolCalls).toEqual(parseTranscript('codex', codexStream.join('\n')).toolCalls)
})

test('claude and codex: the rule is the first 80 characters, exactly as before', () => {
  const at79 = `${' '.repeat(69)}"assistant"` // ends at character 79
  const at81 = `${' '.repeat(72)}"assistant"` // ends past character 80
  expect(keepsToolLine('claude', at79)).toBe(true)
  expect(keepsToolLine('claude', at81)).toBe(false)
  expect(keepsToolLine('codex', `{"type":"item.completed","item":{}}`)).toBe(true)
  expect(keepsToolLine('codex', `${' '.repeat(80)}item.completed`)).toBe(false)
  for (const agent of ['claude', 'codex'] as const) for (const line of [at79, at81, '', '{"type":"user"}']) expect(keepsToolLine(agent, line)).toBe(before(line))
})
