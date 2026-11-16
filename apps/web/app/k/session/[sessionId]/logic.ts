import {
  answerCountOf,
  completeAnswer,
  fillMissing,
  finishAnswer,
  isListKind,
  listAnswerParts,
  LIST_MAX_LENGTH,
  missingPart,
  nextDifficulty,
  nextStage,
  paperQuestions,
  readNumber,
  resultCells,
  rightValues,
  type ListParts,
  type MissingPart,
  type Stage,
} from '@jemma/profiling/logic'
import type { Form, Question, SeniorDiagramSpec } from '@jemma/profiling/schemas'

/** Every try run starts at the middle level and adapts from there. */
export const START_LEVEL = 2
/** Same default the agent uses when it moves a gap on a finished lesson. */
export const FIX_AFTER_DAYS = 3
export const DEFAULT_TRY_COUNT = 5
/** The longest answer the server takes: the longest the marking reads (60 characters), so a fraction sum from the maths editor fits. */
export const ANSWER_MAX_LENGTH = 60
/** A list, an order or a table is several values in one answer (P150): its answer may be this long. */
export const LIST_ANSWER_MAX_LENGTH = LIST_MAX_LENGTH

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
  /**
   * An equation question only (P146): how many values its key has (2 for "x = 2 or x = 3", 1 for one value). The screen shows that many boxes. An inequality
   * ("x < -1 or x > 4") is one answer, not a list, so it has none. Only the count goes to the browser, never the values.
   */
  answerCount?: number
  /** An equation question only: the letter of the key ("x"), so a box can start with "x =". */
  answerLetter?: string
  /** P150, a list: how many boxes, whether the place of a value matters, whether a number pad is enough, and a label over each box. Never a value. */
  list?: ListParts['list']
  /** P150, an order: the items to put in order, shuffled (never in the right order). */
  items?: ListParts['items']
  /** P150, a table: its columns and rows with each blank cell as null. The given cells are in the question anyway. */
  table?: ListParts['table']
  /** P150: the places the answer is rounded to, when the question asks for it ("correct to 1 decimal place"). A count, so it may be sent. */
  round?: number
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
  /** P150, a list, an order or a table: each place of the answer with what was written, the right value (a fixed order) and whether it was right. */
  cells?: { wrote: string; right: string; ok: boolean }[]
  /** P150, a table: its columns and rows (a blank is null), so the results can draw it with the answers in. */
  table?: NonNullable<ListParts['table']>
  /** P150, a list or an order: the right answer is drawn in the same places as the answer (a fixed order), or as one list (any order). */
  ordered?: boolean
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
    ...answerFactsOf(q),
    // P150: a count, the labels, the items to put in order (shuffled), the table with its blanks: never the key's values or order.
    ...listAnswerParts(q),
    ...(isListKind(q.answerKind) && q.round !== undefined ? { round: q.round } : {}),
  }
}

/**
 * The count and the letter of an equation question's key (P146), the only facts about the key the browser gets. A key that is an inequality (count 0) or does
 * not read (a pair, an interval) has none: it is one answer, in one box.
 */
function answerFactsOf(q: Question): Pick<QuestionForChild, 'answerCount' | 'answerLetter'> {
  const facts = q.answerKind === 'equation' ? answerCountOf(q.answer) : null
  return facts && facts.count > 0 ? { answerCount: facts.count, ...(facts.letter ? { answerLetter: facts.letter } : {}) } : {}
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
  | { kind: 'number' | 'point' }
  /** An equation with one answer, or with more than the screen has boxes for, or an inequality or a key the screen was not told about (no count): one maths field. */
  | { kind: 'equation'; count?: number }
  /** An equation with 2 to 4 answers (P146): one box for each, "Answer 1", "Answer 2", sent as "x = a or x = b". */
  | { kind: 'answers'; count: number; letter?: string }
  | { kind: 'expression'; form: Form }
  /** P150: several values. A row of boxes (a list), the chips of an order, or the empty cells of a table. */
  | { kind: 'list'; count: number; ordered: boolean; plain: boolean; labels?: string[]; round?: number }
  | { kind: 'order'; items: string[] }
  | { kind: 'table'; table: NonNullable<ListParts['table']>; round?: number }

/** The most boxes the screen gives an equation (P146). An equation with more values than this is typed in one field, with the word or between them. */
export const MAX_ANSWER_BOXES = 4

/** What `answerShape` reads besides the old four fields: the parts the server sent (a whole `Question` fits too: its table has no `plain`, so its boxes are the full keyboard). */
type ShapeParts = { list?: ListParts['list']; items?: string[]; table?: { columns: string[]; rows: (string | null)[][]; plain?: boolean }; round?: number }

export function answerShape(q: Pick<Question, 'prompt' | 'answerKind' | 'choices' | 'form'> & ShapeParts & Pick<QuestionForChild, 'answerCount' | 'answerLetter'>): AnswerShape {
  if (q.choices?.length) return { kind: 'choice' }
  // P150: a list, an order and a table are drawn from the parts the server sent (a question that came without them gets the plain box below).
  const places = q.round !== undefined ? { round: q.round } : {}
  // A shape with nothing to fill (no box, one chip, no empty cell) could never be answered, so it falls to the plain box rather than leave the learner stuck.
  if (q.answerKind === 'list' && q.list && q.list.count > 0) return { kind: 'list', ...q.list, ...places }
  if (q.answerKind === 'order' && q.items && q.items.length > 1) return { kind: 'order', items: q.items }
  if (q.answerKind === 'table' && q.table && q.table.rows.some((row) => row.includes(null))) return { kind: 'table', table: { ...q.table, plain: q.table.plain ?? false }, ...places }
  // A question marked by meaning is never a missing number in a fraction, whatever its prompt holds.
  if (q.answerKind === 'expression') return { kind: 'expression', form: q.form ?? 'any' }
  if (q.answerKind === 'equation') {
    const count = q.answerCount
    if (count !== undefined && count >= 2 && count <= MAX_ANSWER_BOXES) return { kind: 'answers', count, ...(q.answerLetter ? { letter: q.answerLetter } : {}) }
    return { kind: 'equation', ...(count !== undefined ? { count } : {}) }
  }
  if (q.answerKind === 'number' || q.answerKind === 'point') return { kind: q.answerKind }
  const part = missingPart(q.prompt)
  if (part) return { kind: 'missing', part }
  return { kind: q.answerKind === 'choice' || q.answerKind === 'list' || q.answerKind === 'order' || q.answerKind === 'table' ? 'text' : q.answerKind }
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
    shape.kind === 'missing' || shape.kind === 'text' || shape.kind === 'expression' || shape.kind === 'equation' || shape.kind === 'answers'
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
      wrote: item.unread ? '' : answerText(item.question, finishAnswer(item.question, item.answer).stored),
      ...(item.unread ? { unread: true } : {}),
      right: answerText(item.question, item.question.answer),
      why: item.question.why,
      rightWay: item.question.rightWay,
      ...(stepsOf(item.question).length > 0 ? { steps: stepsOf(item.question) } : {}),
      ...cellsOf(item),
    }))
}

/** P150: for a list, an order or a table, each place of the answer marked right or wrong (and the table to draw them in). Nothing for any other question. */
function cellsOf(item: StoredItem): Partial<Pick<MissedQuestion, 'cells' | 'table' | 'ordered' | 'right'>> {
  const q = item.question
  if (!isListKind(q.answerKind) || item.unread) return {}
  const parts = listAnswerParts(q)
  return {
    // The right answer as the question asks for it (rounded, when it says "correct to 1 decimal place").
    right: rightValues(q, readNumber).join('; '),
    cells: resultCells(q, item.answer, readNumber),
    ordered: q.answerKind !== 'list' || parts.list?.ordered === true,
    ...(parts.table ? { table: parts.table } : {}),
  }
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
