/** A practice answered on paper has this many questions, numbered 1 to 5. */
export const PAPER_QUESTION_COUNT = 5

/**
 * Which questions of a lesson go on paper, as indexes into `lesson.questions`: the first two of difficulty 1, the first two of
 * difficulty 2 and the first of difficulty 3, in that order (five questions for a lesson of 15, 5 at each level).
 *
 * There is no adapting on paper: a child writes all five on one sheet before anyone looks, so the same five are asked whatever
 * the first ones turn out to be. On the screen `nextInSequence` picks each question after the one before it.
 */
export function paperQuestions(lesson: { questions: { difficulty: number }[] }): number[] {
  const wanted: [level: number, count: number][] = [[1, 2], [2, 2], [3, 1]]
  return wanted.flatMap(([level, count]) =>
    lesson.questions
      .map((q, index) => ({ q, index }))
      .filter(({ q }) => q.difficulty === level)
      .slice(0, count)
      .map(({ index }) => index),
  )
}
