import file from './class.json'

// The made-up class of the tour and its numbers, read from class.json. Nothing is looked up: the teacher's pages draw whatever this file holds.
//
// `tokens` is the ONE place the token counts live. They are real: the usage record of the app for one practice on this topic (the model, and the tokens
// it read and wrote for each job). `jobs` has one row for each job, and the page adds the rows up itself; a job done by the app's own code, with no
// model, has 0 and says so in its `note`. `perLearner` is one plain line about a learner's practice. The class is worked out from the one real practice
// (the learners who practised times its total), and the page says so.

export type TourAverage = { /** Class average in percent, or null when the topic has not been taught yet. */ avg: number | null; /** Learners below 50 percent. */ help: number }
export type TourLearner = { id: string; name: string; /** Right or wrong for each of the five questions of the assessment. */ results: boolean[] }
export type TokenRow = { input: number; output: number }
export type TokenJob = TokenRow & { key: string; label: string; /** What the row is, in a few words, under its name. */ note?: string }

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
  tokens: { model: { name: string; provider: string }; jobs: TokenJob[]; perLearner: string }
}

export const TOUR_CLASS = file as unknown as TourClass

/** Tokens read plus tokens written. */
export const totalOf = (row: TokenRow): number => row.input + row.output

/** The sum of a list of rows. */
export const sumOf = (rows: TokenRow[]): TokenRow => ({ input: rows.reduce((n, r) => n + r.input, 0), output: rows.reduce((n, r) => n + r.output, 0) })

/** A count in groups of three digits with a comma ("12,400"): written by hand so the server and the browser draw the same text. */
export const countText = (n: number): string => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
