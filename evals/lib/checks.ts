import type { Check, Outcome, TranscriptCall } from './types'

export const check = (name: string, pass: boolean, detail: string): Check => ({ name, pass, detail })

/** A value as one string, for searching inside tool inputs and answers. */
export function textOf(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return ''
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/** A tool answer as an object, when it is one (an answer can come as an object or as JSON text). */
export function objectOf(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
    } catch {
      return null
    }
  }
  return null
}

export const nameOf = (c: TranscriptCall) => `${c.server}__${c.tool}`

export function callsTo(calls: TranscriptCall[], server: string, tool: string): TranscriptCall[] {
  return calls.filter((c) => c.server === server && c.tool === tool)
}

export const answeredOk = (calls: TranscriptCall[], server: string, tool: string) => callsTo(calls, server, tool).some((c) => c.ok)

/** The tool names of a list of calls, in order, with `(error)` on an answer that failed. */
export function callNames(calls: TranscriptCall[]): string[] {
  return calls.map((c) => `${nameOf(c)}${c.ok ? '' : c.answered ? ' (error)' : ' (no answer)'}`)
}

export function eventDone(outcome: Outcome): Check {
  const e = outcome.event
  return check('the event ended done', e?.status === 'done', e ? `status=${e.status}; error=${e.error ?? 'none'}; runner note=${outcome.run?.note.slice(0, 160) ?? 'none'}` : 'no event row was read')
}

export function eventSettled(outcome: Outcome): Check {
  const status = outcome.event?.status ?? 'unknown'
  return check('the event ended in a settled state (done or failed, never left running)', status === 'done' || status === 'failed', `status=${status}; error=${outcome.event?.error ?? 'none'}`)
}

export type TermRef = { grade?: number; term: number; year?: number }

export const termLabel = (t: { grade?: number; term: number }) => (t.grade === undefined ? `Term ${t.term}` : `Grade ${t.grade} Term ${t.term}`)

/** The "Grade 5 Term 3" names in a text, each once. */
export function mentionedTerms(text: string): { grade: number; term: number }[] {
  const seen = new Map<string, { grade: number; term: number }>()
  for (const m of text.matchAll(/Grade\s+(\d+)\s*,?\s*Term\s+(\d)/gi)) {
    const ref = { grade: Number(m[1]), term: Number(m[2]) }
    seen.set(`${ref.grade}-${ref.term}`, ref)
  }
  return [...seen.values()]
}

export const sameTerm = (a: { grade?: number; term: number }, b: { grade?: number; term: number }) => a.term === b.term && (a.grade === undefined || b.grade === undefined || a.grade === b.grade)

/** Sentences of a short statement. */
export const sentences = (text: string): string[] => text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)

/** Words that make a sentence say "there is nothing for this term". */
export const NO_DATA = /\b(no|not|nothing|none|missing|without|never)\b|\bhas\s+no\b|\bhave\s+no\b/i

export const median = (values: number[]): number => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/** One-line, no em dash, cut to `max` characters. */
export function brief(text: string, max = 160): string {
  const one = text.split(String.fromCharCode(0x2014)).join('-').replace(/\s+/g, ' ').trim()
  return one.length > max ? `${one.slice(0, max - 3)}...` : one
}

export const list = (items: string[], max = 6): string => (items.length === 0 ? 'none' : items.length > max ? `${items.slice(0, max).join(', ')} and ${items.length - max} more` : items.join(', '))
