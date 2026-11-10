import type { AgentName } from './agents'

/** One tool call the agent made: who served it, what it was asked, what came back. Filled for Goose only. */
export type TranscriptCall = {
  server: string
  tool: string
  input: unknown
  /** What the tool answered. `null` while no answer was seen (the run ended first). */
  output: unknown
  /** The tool answered and did not error. */
  ok: boolean
  /** True once an answer was seen, ok or not. */
  answered: boolean
  /** ISO time of the request. */
  at: string
}
export type TranscriptUsage = { inputTokens: number; outputTokens: number; costUsd: number }
export type Transcript = {
  completed: 'done' | 'failed' | null
  completeNote: string | null
  lastMessage: string
  /** Raw tool names in order (`mcp__jemma__x` for Claude, `x` for Codex, `server__x` for Goose). */
  toolCalls: string[]
  /** The same calls with their input and answer. Goose only: empty for Claude and Codex. */
  calls: TranscriptCall[]
  /** Tokens and cost the run reported. Goose only: null for Claude and Codex. */
  usage: TranscriptUsage | null
}

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
 * Goose: `message` events with `toolRequest` and `toolResponse` content, and a final `complete` event (see `parseGoose`).
 */
export function parseTranscript(agent: AgentName, stdout: string): Transcript {
  if (agent === 'goose') return parseGoose(stdout)
  const out: Transcript = { completed: null, completeNote: null, lastMessage: '', toolCalls: [], calls: [], usage: null }
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
          if (b.type === 'tool_use' && typeof b.name === 'string') out.toolCalls.push(b.name)
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
      if (ev.type === 'item.completed' && item.type === 'mcp_tool_call' && typeof item.tool === 'string') out.toolCalls.push(item.tool)
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

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** Goose names a tool `<extension>__<tool>`. Split on the first `__`. */
function splitGooseName(name: string): { server: string; tool: string } {
  const at = name.indexOf('__')
  return at > 0 ? { server: name.slice(0, at), tool: name.slice(at + 2) } : { server: 'goose', tool: name }
}

/** What a tool answered, as one value: the structured result if there is one, else its text, else the raw value. */
function gooseOutput(result: Record<string, any>): unknown {
  if (result.status !== 'success') {
    const err = result.error
    return typeof err === 'string' ? err : typeof err?.message === 'string' ? err.message : (err ?? null)
  }
  const value = result.value ?? {}
  if (value.structuredContent !== undefined && value.structuredContent !== null) return value.structuredContent
  const text = (Array.isArray(value.content) ? value.content : [])
    .filter((c: any) => c?.type === 'text' && typeof c.text === 'string')
    .map((c: any) => c.text)
    .join('\n')
  return text || value
}

/**
 * Goose `--output-format stream-json`: a few banner lines that are not JSON (ignored), then one JSON object per line.
 * `message` events carry `text`, `thinking`, `toolRequest` and `toolResponse` items; the last line is `complete` with
 * token counts. A run is `done` only when `jemma__complete_job` was asked with status "done" and answered with
 * success. Goose exits 0 even when the model or provider failed, so the exit code says nothing: the text of the last
 * message is what explains a failure.
 */
function parseGoose(stdout: string): Transcript {
  const out: Transcript = { completed: null, completeNote: null, lastMessage: '', toolCalls: [], calls: [], usage: null }
  const byId = new Map<string, { call: TranscriptCall; complete: { status: 'done' | 'failed' | null; note: string | null } | null }>()
  let textId: string | null = null
  let text = ''
  const now = new Date().toISOString()

  for (const line of stdout.split('\n')) {
    if (!line.trim().startsWith('{')) continue
    let ev: Record<string, any>
    try {
      ev = JSON.parse(line)
    } catch {
      continue
    }

    if (ev.type === 'complete') {
      out.usage = { inputTokens: num(ev.input_tokens), outputTokens: num(ev.output_tokens), costUsd: num(ev.cost_usd) }
      continue
    }
    if (ev.type !== 'message' || !ev.message) continue

    const msg = ev.message as Record<string, any>
    const at = typeof msg.created === 'number' && Number.isFinite(msg.created) ? new Date(msg.created * 1000).toISOString() : now
    const items: any[] = Array.isArray(msg.content) ? msg.content : []

    for (const item of items) {
      if (item?.type === 'text' && typeof item.text === 'string' && msg.role !== 'user') {
        // The model's text arrives in pieces that share one message id. Join them, so the last message is whole.
        const id = typeof msg.id === 'string' ? msg.id : ''
        text = id === textId ? text + item.text : item.text
        textId = id
        if (text.trim()) out.lastMessage = text.trim()
      } else if (item?.type === 'toolRequest') {
        textId = null
        const value = item.toolCall?.status === 'success' ? item.toolCall.value : null
        const named = typeof value?.name === 'string' ? splitGooseName(value.name) : { server: 'unknown', tool: 'unknown' }
        const input = asObject(value?.arguments)
        const call: TranscriptCall = { ...named, input, output: null, ok: false, answered: false, at }
        out.toolCalls.push(typeof value?.name === 'string' ? value.name : 'unknown')
        out.calls.push(call)
        const isDone = call.server === 'jemma' && call.tool === 'complete_job'
        byId.set(String(item.id), { call, complete: isDone ? { status: status(input), note: typeof input.note === 'string' ? input.note : null } : null })
      } else if (item?.type === 'toolResponse') {
        const seen = byId.get(String(item.id))
        if (!seen) continue
        const result = (item.toolResult ?? {}) as Record<string, any>
        seen.call.answered = true
        seen.call.ok = result.status === 'success' && result.value?.isError !== true
        seen.call.output = gooseOutput(result)
        if (seen.call.ok && seen.complete?.status) {
          out.completed = seen.complete.status
          out.completeNote = seen.complete.note
        }
      }
    }
  }
  return out
}

/** Jemma tools that only read. Every other Jemma tool writes something (a save tool, or `complete_job`). */
const READ_ONLY = /^(get|list|read|search)_/

/**
 * True when a Jemma tool that writes was asked and either answered ok or never answered (the run ended while it
 * may still have been running). A rerun after that could write twice, so it must not happen.
 */
export function savedSomething(calls: TranscriptCall[]): boolean {
  return calls.some((c) => c.server === 'jemma' && !READ_ONLY.test(c.tool) && (c.ok || !c.answered))
}
