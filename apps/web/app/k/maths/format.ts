// The pure pieces of the two "My maths" screens (/k/maths and /k/maths/[family]). No database, no clock. The screens say "Mathematics", the
// part's label and the topic's name: never "strand" and never "subtopic".

import { scoreText, type MyMathsStrand, type MyMathsTopic, type Score } from '@jemma/profiling/logic'

export type Stage = 'new' | 'practising' | 'fixed'

/** What a row says for a score: "No score yet", or "5 of 6 right". Never a percent. */
export const rowScore = (score: Score): string => scoreText(score)

/** The stage in the words the gaps screen always used. */
export const stageWords = (stage: Stage): string => ({ new: 'New', practising: 'Practising', fixed: 'Fixed' })[stage]

/** What a topic row says besides its score: the stage of the gap on it, or nothing. */
export const topicLine = (topic: Pick<MyMathsTopic, 'gap'>): string | null => (topic.gap ? stageWords(topic.gap) : null)

/** What a row of "Your gaps" says: its stage and its score. */
export const gapLine = (gap: { stage: Stage; score: Score }): string => `${stageWords(gap.stage)} \u00b7 ${rowScore(gap.score)}`

export const NO_MAP_LINE = "Your teacher has not set up this year's topics yet."

export type StrandScreen =
  | { kind: 'topics'; title: string; score: string; topics: MyMathsTopic[] }
  | { kind: 'no-topics'; title: string; score: string; line: string; button: string; choice: { topicName: string } }

/**
 * What the screen of one part shows: this year's topics of the part, or, when the class has no approved map or the map has no topic of this
 * part, one line and one button to practise the part itself (the part's label is the choice).
 */
export function strandScreen(strand: MyMathsStrand): StrandScreen {
  const score = rowScore(strand.score)
  if (strand.topics.length > 0) return { kind: 'topics', title: strand.label, score, topics: strand.topics }
  return { kind: 'no-topics', title: strand.label, score, line: NO_MAP_LINE, button: `Practise ${strand.label}`, choice: { topicName: strand.label } }
}

/** Where nothing should be offered to practise: tonight's lesson waits, or a practice is being written. */
export type Lock = { text: string; href: '/k'; link: string }
export function lockOf(status: 'free' | 'due' | 'writing'): Lock | null {
  if (status === 'due') return { text: "Finish tonight's lesson first.", href: '/k', link: 'Go to today' }
  if (status === 'writing') return { text: 'Jemma is writing your practice.', href: '/k', link: 'Go to today' }
  return null
}
