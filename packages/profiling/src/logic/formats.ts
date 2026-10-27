import type { Format } from './types'

export const MIN_SESSIONS = 3

type Helps = { status: 'too_early'; sessions: number } | { status: 'measured'; average: number; sessions: number }

export function whatHelps(trials: { format: Format; score: number }[]): Record<Format, Helps> {
  const out = {} as Record<Format, Helps>
  for (const format of ['reading', 'diagram', 'audio'] as const) {
    const scores = trials.filter((t) => t.format === format).map((t) => t.score)
    out[format] =
      scores.length < MIN_SESSIONS
        ? { status: 'too_early', sessions: scores.length }
        : {
            status: 'measured',
            average: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
            sessions: scores.length,
          }
  }
  return out
}
