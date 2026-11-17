// The pure pieces of the two "My maths" screens (/k/maths and /k/maths/[family]). No database, no clock. The screens say "Mathematics", the
// part's label and the topic's name: never "strand" and never "subtopic".

import { scoreText, STRENGTH_FROM, STRUGGLE_BELOW, type MyMathsStrand, type MyMathsTopic, type Score } from '@jemma/profiling/logic'

export type Stage = 'new' | 'practising' | 'fixed'

/** What a row says for a score: "No score yet", or "5 of 6 right". Never a percent. */
export const rowScore = (score: Score): string => scoreText(score)

/** The stage in the words the gaps screen always used. */
export const stageWords = (stage: Stage): string => ({ new: 'New', practising: 'Practising', fixed: 'Fixed' })[stage]

/** What a topic row says besides its score: the stage of the gap on it, or nothing. */
export const topicLine = (topic: Pick<MyMathsTopic, 'gap'>): string | null => (topic.gap ? stageWords(topic.gap) : null)

/** What a row of "Your gaps" says: its stage and its score. */
export const gapLine = (gap: { stage: Stage; score: Score }): string => `${stageWords(gap.stage)} \u00b7 ${rowScore(gap.score)}`

/**
 * The circle of a topic (P122), in the teacher's Long view language: `full` from 80 percent, `half` from 50 to 79, `empty` below 50, `none` when
 * nothing was asked. Made from the same `{ right, asked }` the rows say ("3 of 5 right"): school marks and the learner's practice together. The
 * thresholds are the Long view's own (`STRENGTH_FROM`, `STRUGGLE_BELOW`), compared without a division so 4 of 5 is exactly 80.
 */
export type Level = 'full' | 'half' | 'empty' | 'none'
export function levelOfScore(score: Score): Level {
  if (score.asked <= 0) return 'none'
  if (score.right * 100 >= STRENGTH_FROM * score.asked) return 'full'
  if (score.right * 100 >= STRUGGLE_BELOW * score.asked) return 'half'
  return 'empty'
}

/** What each circle means, in the legend's words (the one place the screen names the 80). Never shown beside a learner's own count. */
export const LEGEND: { level: Level; text: string }[] = [
  { level: 'full', text: '80% or more' },
  { level: 'half', text: '50 to 79' },
  { level: 'empty', text: 'below 50' },
  { level: 'none', text: 'not tried' },
]

/** What a circle says to a screen reader: the same four meanings, in words. */
export const levelWords = (level: Level): string =>
  ({ full: '80 percent or more', half: '50 to 79 percent', empty: 'below 50 percent', none: 'not tried yet' })[level]

/** How a part stands: `secure` topics at 80 percent or more, `started` topics tried but below that, `untried` topics with no answer. */
export type PartSummary = { total: number; secure: number; started: number; untried: number }
export function summaryOf(levels: Level[]): PartSummary {
  const count = (l: Level) => levels.filter((x) => x === l).length
  const untried = count('none')
  return { total: levels.length, secure: count('full'), started: levels.length - count('full') - untried, untried }
}

/** The one short line under a part's circles: "2 of 10 secure \u00b7 3 started", or "Not started yet" when no topic was tried. */
export function summaryLine(s: PartSummary): string {
  if (s.secure === 0 && s.started === 0) return 'Not started yet'
  return s.started === 0 ? `${s.secure} of ${s.total} secure` : `${s.secure} of ${s.total} secure \u00b7 ${s.started} started`
}

/** What a screen reader says for the circles of a part: "Algebra: 2 of 10 topics at 80 percent or more, 3 started, 5 not tried". */
export const progressLabel = (name: string, s: PartSummary): string =>
  `${name}: ${s.secure} of ${s.total} topics at 80 percent or more, ${s.started} started, ${s.untried} not tried`

export const NO_MAP_LINE = "Your teacher has not set up this year's topics yet."

export type StrandScreen =
  | { kind: 'topics'; title: string; score: string; topics: MyMathsTopic[] }
  | { kind: 'no-topics'; title: string; score: string; line: string; button: string; choice: { topicName: string } }

/**
 * What the screen of one part shows: this year's topics of the part, or, when the class has no approved map or the map has no topic of this
 * part, one line and one button to practise the part itself (the part's label is the choice). The line is `NO_MAP_LINE` unless the caller says
 * another one: in "My own" there is no teacher to wait for ("No topics yet for Grade 9.").
 */
export function strandScreen(strand: MyMathsStrand, noMapLine: string = NO_MAP_LINE): StrandScreen {
  const score = rowScore(strand.score)
  if (strand.topics.length > 0) return { kind: 'topics', title: strand.label, score, topics: strand.topics }
  return { kind: 'no-topics', title: strand.label, score, line: noMapLine, button: `Practise ${strand.label}`, choice: { topicName: strand.label } }
}

/**
 * When the Practise button is held back: only while a practice is being written (P155: tonight's lesson is never a gate, a learner may learn and practise
 * whatever they like). The link goes to My maths, where the practice that is being written is the first card (P128: there is no "Today" page). My
 * maths itself shows the text without it. The Learn button of a topic is never held back, in any status.
 */
export type Lock = { text: string; href: '/k'; link: string }
export function lockOf(status: 'free' | 'due' | 'writing'): Lock | null {
  if (status === 'writing') return { text: 'Jemma is writing your practice.', href: '/k', link: 'Go to My maths' }
  return null
}

/** A quiet pointer on a part page while tonight's lesson waits: it holds nothing back, every button stays. */
export function waitingOf(status: 'free' | 'due' | 'writing'): { text: string; href: '/k'; link: string } | null {
  return status === 'due' ? { text: "Tonight's lesson is waiting on", href: '/k', link: 'My maths' } : null
}
