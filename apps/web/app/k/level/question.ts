import type { LevelCheck } from '@/lib/data/level'
import { isYoungGrade, stripQuestion, type QuestionForChild } from '../session/[sessionId]/logic'

/** P163: question `n` (1-based) of a level check as the screen may hold it: no answer, no why, no right way. Null past the last question. */
export function questionFor(check: Pick<LevelCheck, 'questions' | 'grade'>, n: number): QuestionForChild | null {
  const item = check.questions[n - 1]
  if (!item) return null
  return stripQuestion(item.question, { position: n, phase: 'try', index: n, of: check.questions.length, ...(isYoungGrade(check.grade) ? { young: true } : {}) })
}
