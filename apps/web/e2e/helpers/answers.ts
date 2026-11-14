import type { Question } from '@jemma/profiling/schemas'
import { answerShape } from '../../app/k/session/[sessionId]/logic'

/** The part of a stored lesson question that decides what the child's screen asks for. */
export type LessonQuestion = Pick<Question, 'prompt' | 'answer'> & Partial<Pick<Question, 'render' | 'terms' | 'choices' | 'answerKind'>>

/** One box on the question screen (found by its label) and what is typed in it. */
export type TypedBox = { label: string; value: string }

const parts = (key: string): { whole: string | null; top: string; bottom: string } | null => {
  const m = /^(?:(\d+)\s+)?(\d+)\/(\d+)$/.exec(key.trim())
  return m ? { whole: m[1] ?? null, top: m[2]!, bottom: m[3]! } : null
}

/** The number a child types in the box of a missing part so that the fraction equals the key (a key can be "9/15", "3/5" or "9"). */
function missingNumber(key: string, part: { unknown: 'top' | 'bottom'; known: string }): string {
  const k = parts(key)
  if (!k) return key.trim()
  const known = Number(part.known)
  const typed = part.unknown === 'top' ? (Number(k.top) * known) / Number(k.bottom) : (known * Number(k.bottom)) / Number(k.top)
  return Number.isInteger(typed) ? String(typed) : part.unknown === 'top' ? k.top : k.bottom
}

/**
 * The boxes the question screen shows for a typed question (the same rule the screen uses) and what goes in each,
 * to give the right answer, or something that is not. A choice question has no box: the caller taps a button.
 */
export function boxesFor(q: LessonQuestion, right: boolean): TypedBox[] {
  const shape = answerShape({ prompt: q.prompt, answerKind: q.answerKind ?? 'fraction', choices: q.choices })
  const key = parts(q.answer)
  switch (shape.kind) {
    case 'missing':
      return [{ label: 'Missing number', value: right ? missingNumber(q.answer, shape.part) : '0' }]
    case 'fraction':
      return [
        { label: 'Top number', value: right && key ? key.top : '1' },
        { label: 'Bottom number', value: right && key ? key.bottom : '99' },
      ]
    case 'mixed':
      return right
        ? [
            { label: 'Whole number', value: key ? (key.whole ?? '0') : q.answer.trim() },
            { label: 'Top number', value: key ? key.top : '0' },
            { label: 'Bottom number', value: key ? key.bottom : '1' },
          ]
        : [
            { label: 'Whole number', value: '0' },
            { label: 'Top number', value: '1' },
            { label: 'Bottom number', value: '99' },
          ]
    case 'money': {
      const amount = q.answer.trim().replace(/^r\s*/i, '')
      return [{ label: 'Your answer', value: right ? amount : amount === '0' ? '1' : '0' }]
    }
    default: {
      const typed = q.answer.trim()
      return [{ label: 'Your answer', value: right ? typed : typed === '0' ? '1' : '0' }]
    }
  }
}
