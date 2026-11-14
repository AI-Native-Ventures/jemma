import { markAnswer, missingPart, nextDifficulty, nextStage, type MissingPart, type Stage } from '@jemma/profiling/logic'
import type { Question } from '@jemma/profiling/schemas'

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
}

export type MissedQuestion = {
  /** Number among the try questions, as the results screen titles it. */
  n: number
  prompt: string
  render: Question['render']
  terms?: string[]
  wrote: string
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

export function answerShape(q: Pick<Question, 'prompt' | 'answerKind' | 'choices'>): AnswerShape {
  if (q.choices?.length) return { kind: 'choice' }
  const part = missingPart(q.prompt)
  if (part) return { kind: 'missing', part }
  return { kind: q.answerKind === 'choice' ? 'text' : q.answerKind }
}

/** What the child typed for a missing part, put back into its fraction: 9 with a known bottom of 15 is "9/15". */
export const fillMissing = (part: MissingPart, typed: string) => (part.unknown === 'top' ? `${typed}/${part.known}` : `${part.known}/${typed}`)

export type AnswerBoxes = { whole: string; top: string; bottom: string; text: string }

/**
 * The text sent for what the boxes on screen hold, or '' while a box that is shown is still empty.
 * It is the text `markAnswer` already reads: "top/bottom", "whole top/bottom", "R12,50".
 */
export function answerValue(shape: AnswerShape, boxes: AnswerBoxes): string {
  const [whole, top, bottom, text] = [boxes.whole.trim(), boxes.top.trim(), boxes.bottom.trim(), boxes.text.trim()]
  switch (shape.kind) {
    case 'missing':
      return text ? fillMissing(shape.part, text) : ''
    case 'fraction':
      return top && bottom ? `${top}/${bottom}` : ''
    case 'mixed':
      return whole && top && bottom ? `${whole} ${top}/${bottom}` : ''
    case 'money':
      return text ? `R${text}` : ''
    default:
      return text
  }
}

/**
 * Finishes what the child typed from the stored question, and marks it. A number typed for a missing part goes back
 * into its fraction, and counts as right when the fraction OR the bare number matches the key (a key can be "9/15" or "9").
 * A whole fraction, and every other question, is marked as typed. The server does this again whatever the browser sent.
 */
export function completeAnswer(q: Pick<Question, 'prompt' | 'answer' | 'choices'>, typed: string): { stored: string; correct: boolean } {
  const text = typed.trim()
  const part = q.choices?.length ? null : missingPart(q.prompt)
  if (part && /^\d+$/.test(text)) {
    const stored = fillMissing(part, text)
    return { stored, correct: markAnswer(stored, q.answer).correct || markAnswer(text, q.answer).correct }
  }
  return { stored: text, correct: markAnswer(text, q.answer).correct }
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
      wrote: answerText(item.question, completeAnswer(item.question, item.answer).stored),
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
