import type { DiagnosedResult } from '../../../packages/profiling/src/logic/types'

export type KeyItem = { n: number; prompt: string; answer: string; topicName: string }

export const classTest1Key: KeyItem[] = [
  { n: 1, prompt: '1/2 + 1/4', answer: '3/4', topicName: 'Adding fractions' },
  { n: 2, prompt: '2/3 + 1/6', answer: '5/6', topicName: 'Adding fractions' },
  { n: 3, prompt: '3/4 - 1/2', answer: '1/4', topicName: 'Subtracting fractions' },
  { n: 4, prompt: '1 1/2 + 2 1/4', answer: '3 3/4', topicName: 'Adding mixed numbers' },
  { n: 5, prompt: '2/5 of 20', answer: '8', topicName: 'Fraction of a quantity' },
  { n: 6, prompt: 'Bigger: 2/3 or 3/5', answer: '2/3', topicName: 'Comparing fractions' },
  { n: 7, prompt: '3/5 as a decimal', answer: '0,6', topicName: 'Fractions and decimals' },
  { n: 8, prompt: '0,5 + 0,25', answer: '0,75', topicName: 'Adding decimals' },
  { n: 9, prompt: 'Which fraction is 0,25?', answer: 'B', topicName: 'Fractions and decimals' },
  { n: 10, prompt: 'R20, spends 3/4. Left?', answer: 'R5', topicName: 'Fraction of a quantity' },
]

export const classTest1Roster = [
  { id: 'amina', name: 'Amina' },
  { id: 'thabo', name: 'Thabo' },
  { id: 'lerato', name: 'Lerato' },
  { id: 'sipho', name: 'Sipho' },
  { id: 'naledi', name: 'Naledi' },
]

const ADD_FRACTIONS_GAP = 'Adding fractions with different denominators'
const TOPS_AND_BOTTOMS = 'Adds the tops and the bottoms'

type Wrong = { answer: string; misconception: string; gapTopicName: string; confidence?: number }

const wrongQ1: Wrong = { answer: '2/6', misconception: TOPS_AND_BOTTOMS, gapTopicName: ADD_FRACTIONS_GAP }
const wrongQ2: Wrong = { answer: '3/9', misconception: TOPS_AND_BOTTOMS, gapTopicName: ADD_FRACTIONS_GAP }
const wrongQ4: Wrong = { answer: '3 2/6', misconception: TOPS_AND_BOTTOMS, gapTopicName: ADD_FRACTIONS_GAP }
const wrongQ4Sipho: Wrong = {
  answer: '3 2/4',
  misconception: 'Adds the tops and keeps one bottom',
  gapTopicName: ADD_FRACTIONS_GAP,
}
const wrongQ6: Wrong = {
  answer: '3/5',
  misconception: 'Thinks bigger numbers make a bigger fraction',
  gapTopicName: 'Comparing fractions',
}
const wrongQ8: Wrong = { answer: '0,30', misconception: 'Lines up the last digits', gapTopicName: 'Adding decimals' }

/** Wrong answers per learner, keyed by question number. */
export const classTest1Wrong: Record<string, Record<number, Wrong>> = {
  amina: { 1: wrongQ1, 2: wrongQ2, 4: wrongQ4, 8: wrongQ8 },
  thabo: { 1: wrongQ1, 2: wrongQ2, 4: wrongQ4, 6: wrongQ6, 8: wrongQ8 },
  lerato: { 6: wrongQ6 },
  sipho: { 1: wrongQ1, 2: wrongQ2, 4: wrongQ4Sipho },
  naledi: { 1: wrongQ1, 4: wrongQ4, 8: wrongQ8 },
}

/** Sipho's Q7 as first read: `0,8` at confidence 0.42. Fixing it to `0,6` gives 7/10. */
export const siphoQ7BeforeFix = { n: 7, answerRead: '0,8', confidence: 0.42 }

/** Marks out of 10 after Sipho's Q7 fix. */
export const classTest1Scores: Record<string, number> = { amina: 6, thabo: 5, lerato: 9, sipho: 7, naledi: 7 }

/** Marks before the Q7 fix (Sipho is 6/10). */
export const classTest1ScoresBeforeFix: Record<string, number> = { ...classTest1Scores, sipho: 6 }

/** One row per learner per question, ordered by question number then roster. Uses the data after Sipho's Q7 fix. */
export const classTest1Results: DiagnosedResult[] = classTest1Key.flatMap((q) =>
  classTest1Roster.map((c): DiagnosedResult => {
    const w = classTest1Wrong[c.id]?.[q.n]
    return {
      childId: c.id,
      n: q.n,
      prompt: q.prompt,
      answerRead: w ? w.answer : q.answer,
      correct: !w,
      topicName: q.topicName,
      gapTopicName: w ? w.gapTopicName : null,
      misconception: w ? w.misconception : null,
    }
  }),
)
