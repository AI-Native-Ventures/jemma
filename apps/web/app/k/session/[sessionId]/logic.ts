import { completeAnswer, fillMissing, finishAnswer, missingPart, nextDifficulty, nextStage, paperQuestions, type MissingPart, type Stage } from '@jemma/profiling/logic'
import type { Form, Question } from '@jemma/profiling/schemas'

/** Every try run starts at the middle level and adapts from there. */
export const START_LEVEL = 2
/** Same default the agent uses when it moves a gap on a finished lesson. */
export const FIX_AFTER_DAYS = 3
export const DEFAULT_TRY_COUNT = 5

export type Phase = 'warmup' | 'try'

/** What the child's screen may hold while a quiz runs: no answer, no why, no right way. */
export type QuestionForChild = {
  /** 1-based across warm-up then try. */
  position: number
  phase: Phase
  /** 1-based inside its phase. */
  index: number
  /** Questions in its phase. */
  of: number
  prompt: string
  render: Question['render']
  terms?: string[]
  answerKind: Question['answerKind']
  choices?: string[]
  /** The form an expression has to be in, when the question asks for one (a senior class only). */
  form?: Form
}

/** A stored `session_items` row (question holds the whole `Question`, as the seed writes it). */
export type StoredItem = {
  phase: Phase
  position: number
  question: Question
  answer: string
  correct: boolean
  difficulty: number
  seconds: number
  /** A paper answer that could not be read: the answer is empty and it counts as missed. Kept inside the stored question, see `save_practice_answers`. */
  unread?: boolean
}

export type MissedQuestion = {
  /** Number among the try questions, as the results screen titles it. */
  n: number
  prompt: string
  render: Question['render']
  terms?: string[]
  wrote: string
  /** The answer on paper could not be read: the screen says so under "You wrote" instead of showing an empty answer. */
  unread?: boolean
  right: string
  why: string
  rightWay: string
}

export function stripQuestion(
  q: Question,
  at: { position: number; phase: Phase; index: number; of: number },
): QuestionForChild {
  return {
    position: at.position,
    phase: at.phase,
    index: at.index,
    of: at.of,
    prompt: q.prompt,
    render: q.render,
    ...(q.terms ? { terms: q.terms } : {}),
    answerKind: q.answerKind,
    ...(q.choices ? { choices: q.choices } : {}),
    ...(q.form ? { form: q.form } : {}),
  }
}

const sorted = (items: StoredItem[], phase: Phase) =>
  items.filter((i) => i.phase === phase).sort((a, b) => a.position - b.position)

/** Next try question: the first unused one at the level `nextDifficulty` asks for, else the closest level. */
function pickTry(pool: Question[], tried: StoredItem[]): Question | null {
  const level = nextDifficulty(START_LEVEL, tried.map((t) => t.correct)).next
  const used = new Set(tried.map((t) => t.question.prompt))
  const free = pool.filter((q) => !used.has(q.prompt))
  return (
    free.find((q) => q.difficulty === level) ??
    [...free].sort((a, b) => Math.abs(a.difficulty - level) - Math.abs(b.difficulty - level))[0] ??
    null
  )
}

/** The next unanswered question in the whole run, or null when every question has an answer. */
export function nextInSequence(
  warmup: Question[],
  pool: Question[],
  tryCount: number,
  items: StoredItem[],
): { question: Question; phase: Phase; index: number; of: number; position: number } | null {
  const done = sorted(items, 'warmup')
  if (done.length < warmup.length) {
    return { question: warmup[done.length]!, phase: 'warmup', index: done.length + 1, of: warmup.length, position: done.length + 1 }
  }
  const tried = sorted(items, 'try')
  const total = Math.min(tryCount, pool.length)
  if (tried.length >= total) return null
  const question = pickTry(pool, tried)
  if (!question) return null
  return { question, phase: 'try', index: tried.length + 1, of: total, position: warmup.length + tried.length + 1 }
}

/** `easier` or `harder` when the level just changed, else null. Item k carries it when it was chosen after a change. */
export function adaptedOf(results: boolean[]): 'easier' | 'harder' | null {
  if (results.length === 0) return null
  const before = nextDifficulty(START_LEVEL, results.slice(0, -1)).next
  const now = nextDifficulty(START_LEVEL, results).next
  return now < before ? 'easier' : now > before ? 'harder' : null
}

/** What the child is asked to type for one question: it decides the boxes, the line under them and the keyboard. */
export type AnswerShape =
  | { kind: 'choice' }
  /** One number is missing from a fraction in the question ("3/5 = ?/15"): the child types it where it is missing. */
  | { kind: 'missing'; part: MissingPart }
  | { kind: 'fraction' | 'mixed' | 'whole' | 'decimal' | 'money' | 'text' }
  /** The four kinds of a senior class, marked by meaning: a number that may be negative, an expression, an equation, a point. */
  | { kind: 'number' | 'equation' | 'point' }
  | { kind: 'expression'; form: Form }

export function answerShape(q: Pick<Question, 'prompt' | 'answerKind' | 'choices' | 'form'>): AnswerShape {
  if (q.choices?.length) return { kind: 'choice' }
  // A question marked by meaning is never a missing number in a fraction, whatever its prompt holds.
  if (q.answerKind === 'expression') return { kind: 'expression', form: q.form ?? 'any' }
  if (q.answerKind === 'number' || q.answerKind === 'equation' || q.answerKind === 'point') return { kind: q.answerKind }
  const part = missingPart(q.prompt)
  if (part) return { kind: 'missing', part }
  return { kind: q.answerKind === 'choice' ? 'text' : q.answerKind }
}

// One rule for the screen and for paper: the agent's `save_practice_answers` finishes and marks a written answer with the same functions.
export { completeAnswer, fillMissing, finishAnswer, paperQuestions }

/** What the boxes hold. `x` and `y` are the two boxes of a point (a senior class). */
export type AnswerBoxes = { whole: string; top: string; bottom: string; text: string; x?: string; y?: string }

/** A number as the child typed it holds a digit: a minus alone, or a comma alone, is not a number yet. */
const hasDigit = (s: string) => /\d/.test(s)

/**
 * The text sent for what the boxes on screen hold, or '' while a box that is shown is still empty.
 * It is the text `markAnswer` already reads: "top/bottom", "whole top/bottom", "R12,50".
 */
export function answerValue(shape: AnswerShape, boxes: AnswerBoxes): string {
  const [whole, top, bottom] = [boxes.whole.trim(), boxes.top.trim(), boxes.bottom.trim()]
  // "12," is a number the child stopped typing: the comma at the end is not part of it.
  const text =
    shape.kind === 'missing' || shape.kind === 'text' || shape.kind === 'expression' || shape.kind === 'equation'
      ? boxes.text.trim()
      : boxes.text.trim().replace(/[.,]+$/, '')
  switch (shape.kind) {
    case 'missing':
      return text ? fillMissing(shape.part, text) : ''
    case 'fraction':
      return top && bottom ? `${top}/${bottom}` : ''
    case 'mixed':
      return whole && top && bottom ? `${whole} ${top}/${bottom}` : ''
    case 'money':
      return text ? `R${text}` : ''
    case 'number':
      return hasDigit(text) ? text : ''
    case 'point': {
      const [x, y] = [(boxes.x ?? '').trim().replace(/[.,]+$/, ''), (boxes.y ?? '').trim().replace(/[.,]+$/, '')]
      return hasDigit(x) && hasDigit(y) ? `(${x}; ${y})` : ''
    }
    default:
      return text
  }
}

/** The text of an answer: a choice letter becomes the choice itself. */
export function answerText(q: Question, value: string): string {
  const letter = /^\(?([a-d])\)?\.?$/i.exec(value.trim())
  if (q.choices && letter) return q.choices['ABCD'.indexOf(letter[1]!.toUpperCase())] ?? value
  return value
}

export function missedOf(items: StoredItem[]): MissedQuestion[] {
  return sorted(items, 'try')
    .map((item, i) => ({ item, n: i + 1 }))
    .filter(({ item }) => !item.correct)
    .map(({ item, n }) => ({
      n,
      prompt: item.question.prompt,
      render: item.question.render,
      ...(item.question.terms ? { terms: item.question.terms } : {}),
      // An answer saved before the missing number was put back into its fraction is shown completed too.
      wrote: item.unread ? '' : answerText(item.question, finishAnswer(item.question, item.answer).stored),
      ...(item.unread ? { unread: true } : {}),
      right: answerText(item.question, item.question.answer),
      why: item.question.why,
      rightWay: item.question.rightWay,
    }))
}

export type StageMove = { from: Stage; to: Stage }

/** The move `update_learner_profile` will make for this session, shown to the child straight away. */
export function stageAfter(input: { stage: Stage; right: number; firstPractisedAt: Date | null; now: Date }): StageMove {
  return { from: input.stage, to: nextStage({ ...input, fixAfterDays: FIX_AFTER_DAYS }) }
}
