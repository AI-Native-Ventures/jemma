import type { AgentName } from './agents'

export type Transcript = { completed: 'done' | 'failed' | null; completeNote: string | null; lastMessage: string }

const isComplete = (name: unknown) => typeof name === 'string' && /(^|__|\.|\/)complete_job$/.test(name)

function asObject(v: unknown): Record<string, unknown> {
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v)
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

function status(input: Record<string, unknown>): 'done' | 'failed' | null {
  return input.status === 'done' || input.status === 'failed' ? input.status : null
}

/**
 * Reads the agent's JSONL stream. The last `complete_job` call that did not error decides the outcome.
 * Claude: stream-json (`tool_use` in assistant messages, `tool_result` in user messages).
 * Codex: `item.completed` events of type `mcp_tool_call` and `agent_message`.
 */
export function parseTranscript(agent: AgentName, stdout: string): Transcript {
  const out: Transcript = { completed: null, completeNote: null, lastMessage: '' }
  const pending = new Map<string, { status: 'done' | 'failed' | null; note: string | null }>()

  for (const line of stdout.split('\n')) {
    if (!line.trim().startsWith('{')) continue
    let ev: Record<string, any>
    try {
      ev = JSON.parse(line)
    } catch {
      continue
    }

    if (agent === 'claude') {
      const blocks: any[] = Array.isArray(ev.message?.content) ? ev.message.content : []
      if (ev.type === 'assistant') {
        for (const b of blocks) {
          if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) out.lastMessage = b.text.trim()
          if (b.type === 'tool_use' && isComplete(b.name)) {
            const input = asObject(b.input)
            pending.set(String(b.id), { status: status(input), note: typeof input.note === 'string' ? input.note : null })
          }
        }
      } else if (ev.type === 'user') {
        for (const b of blocks) {
          if (b.type === 'tool_result' && pending.has(String(b.tool_use_id)) && !b.is_error) {
            const call = pending.get(String(b.tool_use_id))!
            if (call.status) {
              out.completed = call.status
              out.completeNote = call.note
            }
          }
        }
      } else if (ev.type === 'result' && typeof ev.result === 'string' && ev.result.trim()) {
        out.lastMessage = ev.result.trim()
      }
    } else if (ev.type === 'item.completed' || ev.type === 'item.updated') {
      const item = ev.item ?? {}
      if (item.type === 'agent_message' && typeof item.text === 'string' && item.text.trim()) out.lastMessage = item.text.trim()
      if (ev.type === 'item.completed' && item.type === 'mcp_tool_call' && isComplete(item.tool) && item.status !== 'failed' && !item.error) {
        const input = asObject(item.arguments)
        const s = status(input)
        if (s) {
          out.completed = s
          out.completeNote = typeof input.note === 'string' ? input.note : null
        }
      }
    }
  }
  return out
}
