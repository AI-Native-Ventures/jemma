import { completeAnswer, fillMissing, finishAnswer, isSeniorQuestion, missingPart, nextDifficulty, nextStage, paperQuestions, ratioPartsOf, showWithUnit, timeStyleOf, type MissingPart, type Stage, type TimeStyle } from '@jemma/profiling/logic'
import type { Form, Question, SeniorDiagramSpec } from '@jemma/profiling/schemas'

/** Every try run starts at the middle level and adapts from there. */
export const START_LEVEL = 2
/** Same default the agent uses when it moves a gap on a finished lesson. */
export const FIX_AFTER_DAYS = 3
export const DEFAULT_TRY_COUNT = 5
/** The longest answer the server takes: the longest the marking reads (60 characters), so a fraction sum from the maths editor fits. */
export const ANSWER_MAX_LENGTH = 60

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
  /** The picture the question needs, drawn between its words and the answer box (a senior class only). It never holds the answer. */
  diagram?: SeniorDiagramSpec
  /** P148: the unit of the answer, shown after the box ("cm²"). A number, a whole or a decimal answer of a senior class. */
  unit?: string
  /** P148: the places the answer is rounded to ("correct to 2 decimal places"): the screen says so under the box. */
  round?: number
  /** P148: how a `time` answer is asked for (a shape hint from the key, never its value): the hours and minutes of a 24 hour clock, of a 12 hour clock with am and pm, or of a length of time. */
  timeStyle?: TimeStyle
  /** P148: how many boxes a `ratio` answer has, from its key: 2 or 3. */
  ratioParts?: 2 | 3
  /** P148: a whole or decimal question of a senior class (Grades 7 to 12): its box gets a minus key. */
  signed?: true
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

/**
 * One try question as its card on the results screen has it. The name is old: since P126 the results list holds EVERY try question (`reviewOf`), a right
 * one confirmed and explained and a missed one corrected, and `correct` tells them apart. A list of misses only (`missedOf`) carries no `correct`.
 */
export type MissedQuestion = {
  /** Number among the try questions, as the results screen titles it. */
  n: number
  /** True when the answer was right (the card confirms it and says why it works), false when it was missed. Absent in a list that only holds misses. */
  correct?: boolean
  prompt: string
  render: Question['render']
  terms?: string[]
  /** The picture of the question, drawn under its heading (a senior class only). */
  diagram?: SeniorDiagramSpec
  wrote: string
  /** The answer on paper could not be read: the screen says so under "You wrote" instead of showing an empty answer. */
  unread?: boolean
  right: string
  why: string
  rightWay: string
  /** The maths from the question to the answer, one line each (a senior lesson, 2 to 6 lines). Absent for a question that has none: the card then shows the right way alone. */
  steps?: string[]
}

/** The P148 fields of a question for the child. Shape hints only: how many boxes, which clock, which unit. Never the key. */
function quantityHints(q: Question): Pick<QuestionForChild, 'unit' | 'round' | 'timeStyle' | 'ratioParts' | 'signed'> {
  const unit = q.unit?.trim()
  const shown = q.answerKind === 'number' || q.answerKind === 'whole' || q.answerKind === 'decimal'
  const timeStyle = q.answerKind === 'time' ? timeStyleOf(q.answer) : null
  const ratioParts = q.answerKind === 'ratio' ? ratioPartsOf(q.answer) : null
  return {
    ...(shown && unit ? { unit } : {}),
    ...(shown && q.round !== undefined ? { round: q.round } : {}),
    ...(timeStyle ? { timeStyle } : {}),
    ...(ratioParts ? { ratioParts } : {}),
    ...((q.answerKind === 'whole' || q.answerKind === 'decimal') && isSeniorQuestion(q) ? { signed: true as const } : {}),
  }
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
    ...(q.diagram ? { diagram: q.diagram } : {}),
    ...quantityHints(q),
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
  | { kind: 'fraction' | 'mixed' | 'money' | 'text' }
  /** P148: a number, a whole or a decimal answer may carry a unit, a round and (a whole or a decimal of a senior class) a minus key. */
  | ({ kind: 'number' | 'whole' | 'decimal' } & QuantityExtras)
  /** The kinds of a senior class, marked by meaning: a number that may be negative, an expression, an equation, a point. */
  | { kind: 'equation' | 'point' }
  | { kind: 'expression'; form: Form }
  /** P148: a time (the hours and minutes, and am or pm when the key needs it) and a ratio (a box for each part). */
  | { kind: 'time'; style: TimeStyle }
  | { kind: 'ratio'; parts: 2 | 3 }

/** What a unit, a round and a minus key add to the shape of a number, a whole or a decimal answer (P148). Only what the question has is set. */
export type QuantityExtras = { unit?: string; round?: number; signed?: true }
const quantityExtras = (q: QuantityExtras): QuantityExtras => ({
  ...(q.unit ? { unit: q.unit } : {}),
  ...(q.round !== undefined ? { round: q.round } : {}),
  ...(q.signed ? { signed: true as const } : {}),
})

export function answerShape(q: Pick<Question, 'prompt' | 'answerKind' | 'choices' | 'form'> & QuantityExtras & Pick<QuestionForChild, 'timeStyle' | 'ratioParts'>): AnswerShape {
  if (q.choices?.length) return { kind: 'choice' }
  // A question marked by meaning is never a missing number in a fraction, whatever its prompt holds.
  if (q.answerKind === 'time') return { kind: 'time', style: q.timeStyle ?? 'clock24' }
  if (q.answerKind === 'ratio') return { kind: 'ratio', parts: q.ratioParts ?? 2 }
  if (q.answerKind === 'expression') return { kind: 'expression', form: q.form ?? 'any' }
  if (q.answerKind === 'number') return { kind: 'number', ...quantityExtras(q) }
  if (q.answerKind === 'equation' || q.answerKind === 'point') return { kind: q.answerKind }
  const part = missingPart(q.prompt)
  if (part) return { kind: 'missing', part }
  if (q.answerKind === 'whole' || q.answerKind === 'decimal') return { kind: q.answerKind, ...quantityExtras(q) }
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
    case 'whole':
    case 'decimal':
      // A minus key makes a minus alone possible (P148): a number holds a digit.
      return hasDigit(text) ? text : ''
    case 'number':
      // A number answer holds a digit, or pi (the pi key types a whole answer, like 2\u03c0 or \u03c0/2).
      return hasDigit(text) || /\u03c0|\bpi\b/i.test(text) ? text : ''
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

/**
 * The worked steps a question carries, only the lines that are words. Read defensively: the field may be missing, empty or not a list (older lessons,
 * primary classes), and then there are none.
 */
function stepsOf(q: Question): string[] {
  const raw = (q as { steps?: unknown }).steps
  return Array.isArray(raw) ? raw.filter((s): s is string => typeof s === 'string' && s.trim() !== '') : []
}

/** Every try question in order, each marked right or missed: what the results screen draws one card for. */
export function reviewOf(items: StoredItem[]): MissedQuestion[] {
  return sorted(items, 'try')
    .map((item, i) => ({ item, n: i + 1 }))
    .map(({ item, n }) => ({
      n,
      correct: item.correct,
      prompt: item.question.prompt,
      render: item.question.render,
      ...(item.question.terms ? { terms: item.question.terms } : {}),
      ...(item.question.diagram ? { diagram: item.question.diagram } : {}),
      // An answer saved before the missing number was put back into its fraction is shown completed too.
      wrote: item.unread ? '' : showWithUnit(answerText(item.question, finishAnswer(item.question, item.answer).stored), item.question),
      ...(item.unread ? { unread: true } : {}),
      right: showWithUnit(answerText(item.question, item.question.answer), item.question),
      why: item.question.why,
      rightWay: item.question.rightWay,
      ...(stepsOf(item.question).length > 0 ? { steps: stepsOf(item.question) } : {}),
    }))
}

/** The try questions that were missed, numbered as in `reviewOf`. */
export function missedOf(items: StoredItem[]): MissedQuestion[] {
  return reviewOf(items)
    .filter((q) => !q.correct)
    .map(({ correct: _correct, ...q }) => q)
}

/**
 * The two lines at the top of the results: how many were right, then one kind line by the score. No ranking against anyone.
 * Every one right is praised, three fifths or more is "good work" with the number left to fix, anything less is "let's go through them together".
 */
export function scoreLines(right: number, total: number): { score: string; cheer: string } {
  const score = `You got ${right} of ${total} right.`
  if (right >= total) return { score, cheer: 'Every one right. Well done.' }
  if (right * 5 >= total * 3) {
    const left = total - right
    return { score, cheer: `Good work. Look at ${left === 1 ? 'the one' : `the ${left}`} to fix below.` }
  }
  return { score, cheer: "Let's go through them together." }
}

export type StageMove = { from: Stage; to: Stage }

/** The move `update_learner_profile` will make for this session, shown to the child straight away. */
export function stageAfter(input: { stage: Stage; right: number; firstPractisedAt: Date | null; now: Date }): StageMove {
  return { from: input.stage, to: nextStage({ ...input, fixAfterDays: FIX_AFTER_DAYS }) }
}
