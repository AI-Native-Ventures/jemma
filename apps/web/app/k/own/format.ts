import { curriculumStage, needsLabel, type ReadDraft } from '@/app/t/[classId]/curriculum/format'

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

// ---- an own curriculum --------------------------------------------------------------------------------------------------------------------

/** The grades a learner can give an own curriculum: the CAPS maps of My own cover Grades 1 to 12. */
export const GRADE_CHOICES: number[] = Array.from({ length: 12 }, (_, i) => i + 1)

/** The longest name a learner can give an own curriculum. */
export const NAME_MAX = 60

/** Where "Done" points: My maths at the grade. The address carries the grade, as the grade chips of My own do. */
export const myMathsHref = (grade: number): string => `/k/maths?grade=${grade}`

/**
 * The state of an own curriculum from its map (null when it has none), how many documents it has, whether its draft can be read, and whether its
 * newest `curriculum.uploaded` event failed. A draft that can be read is ready to check (or done) whatever its event says. A map Jemma has not
 * drafted yet is being read, until its event has failed. Nothing to read at all (no map, or no document) cannot be read.
 */
export function curriculumStateOf(input: { map: { status: 'draft' | 'approved' } | null; docs: number; read: boolean; eventFailed: boolean }): OwnCurriculumState {
  const stage = input.map ? curriculumStage({ status: input.map.status, docs: input.docs, read: input.read }) : 'empty'
  if (stage === 'approved') return 'approved'
  if (stage === 'draft') return 'draft'
  if (stage === 'reading') return input.eventFailed ? 'failed' : 'reading'
  return 'failed'
}

export type OwnMapTopic = { name: string; /** "Needs topic 1" or "Needs Fractions (T1)", or null. */ needs: string | null; /** Why Jemma is not sure of this topic, or null. */ note: string | null }

/** What the review of a draft is drawn from: the terms that have topics, and what Jemma left out. */
export type OwnMapView = {
  mapId: string
  classId: string
  grade: number
  name: string
  topicCount: number
  terms: { term: number; topics: OwnMapTopic[] }[]
  leftOut: { name: string; reason: string }[]
}

/**
 * The review of a draft map for the learner, from the same pieces the teacher's review uses: the terms in order (a term with no topic is not
 * listed), each topic with what it needs (`needsLabel`) and, until a choice was made about it, why Jemma was not sure of it; and the topics Jemma
 * left out, until a choice was made about them.
 */
export function reviewOf(read: ReadDraft, info: { mapId: string; classId: string; name: string }): OwnMapView {
  const terms = [...read.draft.terms]
    .filter((t) => t.topics.length > 0)
    .sort((a, b) => a.term - b.term)
    .map((t) => ({
      term: t.term,
      topics: t.topics.map((x) => ({
        name: x.name,
        needs: needsLabel(read.draft, t.term, x.prerequisites),
        note: x.check && !read.resolutions[x.name] ? x.check.reason : null,
      })),
    }))
  return {
    ...info,
    grade: read.draft.grade,
    topicCount: terms.reduce((n, t) => n + t.topics.length, 0),
    terms,
    leftOut: read.draft.leftOut.filter((l) => !read.resolutions[l.name]),
  }
}

/** What the screen of one own curriculum is drawn from. */
export type OwnCurriculumView =
  | { state: 'reading'; mapId: string; name: string }
  | { state: 'failed'; mapId: string; name: string }
  | { state: 'draft'; review: OwnMapView }
  | { state: 'approved'; mapId: string; name: string; grade: number; classId: string }
