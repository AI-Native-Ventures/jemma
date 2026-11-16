import file from './class.json'

// The made-up class of the tour and its numbers, read from class.json. Nothing is looked up: the teacher's pages draw whatever this file holds.
//
// `tokens` is the ONE place the token counts live. It holds one row for each job (lesson, questions, marking, analysis) and one row for each learner,
// each with the tokens read (`input`) and written (`output`). The teacher's page renders whatever numbers are in it, so a real run's counts can be
// pasted over this block, nothing else changes. Rows may be added or taken away: the page draws the rows that are there and adds them up.

export type TourAverage = { /** Class average in percent, or null when the topic has not been taught yet. */ avg: number | null; /** Learners below 50 percent. */ help: number }
export type TourLearner = { id: string; name: string; /** Right or wrong for each of the five questions of the assessment. */ results: boolean[] }
export type TokenRow = { input: number; output: number }
export type TokenJob = TokenRow & { key: string; label: string }
export type TokenLearner = TokenRow & { name: string }

export type TourClass = {
  name: string
  subject: string
  grade: number
  parts: Record<string, TourAverage>
  topics: Record<string, TourAverage>
  learners: TourLearner[]
  analysis: {
    summary: string
    mistakes: { title: string; detail: string }[]
    needHelp: { name: string; why: string }[]
    reteach: string[]
  }
  tokens: { jobs: TokenJob[]; perLearner: TokenLearner[] }
}

export const TOUR_CLASS = file as unknown as TourClass

/** Tokens read plus tokens written. */
export const totalOf = (row: TokenRow): number => row.input + row.output

/** The sum of a list of rows. */
export const sumOf = (rows: TokenRow[]): TokenRow => ({ input: rows.reduce((n, r) => n + r.input, 0), output: rows.reduce((n, r) => n + r.output, 0) })

/** A count in groups of three digits with a thin space ("12 400"): written by hand so the server and the browser draw the same text. */
export const countText = (n: number): string => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
