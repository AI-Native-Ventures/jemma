import { nextDifficulty, nextStage, type Stage } from '@jemma/profiling/logic'
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
      wrote: answerText(item.question, item.answer),
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
