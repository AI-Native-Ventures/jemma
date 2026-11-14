// The pure words and rules of "Add your own work" in My own (P97): what a learner reads, what state a test or a curriculum is in, and the shapes the
// screens are drawn from. No database, no clock, no cookies: the screens, the actions and the tests import the same file.

/** What a learner who is in My school reads. Every action of this folder says it to a child that is not the private twin. */
export const NOT_OWN = 'Switch to My own to add your own work.'

/** Pages of one marked test: the reader takes up to four photos. */
export const MAX_PAGES = 4

/** One photo, in bytes. A phone photo is made smaller in the browser first (`shrinkPhoto`), so this is only the last line of defence. */
export const MAX_PAGE_BYTES = 8_000_000

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Fri 13 Nov" from a timestamp or a date, in UTC so the day never shifts with the server's time zone. An empty or unreadable value gives an empty text. */
export function dayLabel(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso)
  return Number.isNaN(d.getTime()) ? '' : `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

// ---- a marked test ------------------------------------------------------------------------------------------------------------------------

export type OwnTestState = 'reading' | 'marked' | 'failed'

/**
 * What the screen of one marked test shows, from two facts: the status of the paper and the status of its newest `own_test.snapped` event (null
 * when there is none). A marked paper is marked. A failed paper is failed. A paper still being read is reading, unless its event has failed or was
 * cancelled: then nobody is reading it any more and the screen offers the retry.
 */
export function ownTestState(input: { paper: string; event: string | null }): OwnTestState {
  if (input.paper === 'marked') return 'marked'
  if (input.paper === 'failed') return 'failed'
  return input.event === 'failed' || input.event === 'cancelled' ? 'failed' : 'reading'
}

/** "6 of 8 right." the heading of a marked test: ticks of all the questions that were read. */
export const rightLine = (right: number, outOf: number) => `${right} of ${outOf} right.`

/** The line of a marked test in the list: "Marked test: 6 of 8 right". */
export const homeTestLine = (right: number, outOf: number) => `Marked test: ${right} of ${outOf} right`

/** Under a topic of "What to practise": how many answers of it were not right on this test. */
export const wrongLine = (wrong: number) => `${wrong} wrong in this test`

/**
 * How many questions Jemma left out because it could not read them well enough, from the line `save_own_test_results` writes in "What Jemma did":
 * "Read your marked test: 6 of 8 right, 3 left out". 0 when the line has no count (none were left out), or there is no line.
 */
export function leftOutOf(line: string | null): number {
  const found = /, (\d+) left out$/.exec((line ?? '').trim())
  return found ? Number(found[1]) : 0
}

export type OwnQuestion = { n: number; prompt: string; answer: string; right: boolean }
export type OwnGapRow = { topicId: string | null; topicName: string; wrong: number }

/** What the screen of one marked test is drawn from. */
export type OwnTestView =
  | { state: 'reading'; paperId: string }
  | { state: 'failed'; paperId: string }
  | {
      state: 'marked'
      paperId: string
      right: number
      outOf: number
      /** Questions Jemma could not read well enough, left out of the count. */
      leftOut: number
      /** True while Jemma still works out what to practise (the event of the test is not over). */
      finding: boolean
      questions: OwnQuestion[]
      /** The learner's open gaps that come from this test, each with how many answers of it were not right here. */
      gaps: OwnGapRow[]
    }

/** One row of "What you added": a marked test. `right` and `outOf` are 0 until it is marked. */
export type OwnTestRow = { id: string; state: OwnTestState; right: number; outOf: number; day: string }

/** What state an own curriculum is in: Jemma reading it, a draft to check, approved, or not readable. */
export type OwnCurriculumState = 'reading' | 'draft' | 'approved' | 'failed'

/** One row of "What you added": an own curriculum. The id is its map's. */
export type OwnCurriculumRow = { id: string; name: string; grade: number; state: OwnCurriculumState; day: string }
