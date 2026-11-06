import { expect, test } from 'vitest'
import { parseTranscript } from '../src/transcript'

test('Claude transcript preserves MCP tool calls in order', () => {
  const lines = [
    {
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_use', id: 'read', name: 'mcp__jemma__get_class_results', input: { testId: 'test-1' } },
          { type: 'tool_use', id: 'save', name: 'mcp__jemma__class_gap_report', input: { classId: 'class-1' } },
          { type: 'tool_use', id: 'complete', name: 'mcp__jemma__complete_job', input: { eventId: 'event-1', status: 'done' } },
        ],
      },
    },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'complete', content: 'ok', is_error: false }] } },
  ].map((line) => JSON.stringify(line))

  const result = parseTranscript('claude', lines.join('\n'))
  expect(result.toolCalls).toEqual([
    'mcp__jemma__get_class_results',
    'mcp__jemma__class_gap_report',
    'mcp__jemma__complete_job',
  ])
  expect(result.completed).toBe('done')
})
