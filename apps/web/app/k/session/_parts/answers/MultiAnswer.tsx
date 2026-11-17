'use client'

import { useRef, useState } from 'react'
import { ANSWER_MAX_LENGTH } from '../../[sessionId]/logic'
import { MathAnswerField } from '../MathAnswerField'

// P146: an equation that has two answers or more ("Solve x^2 - 5x + 6 = 0": x = 2 or x = 3) has one box for each answer, "Answer 1", "Answer 2" (up to
// four). Each box is the same maths editor as every senior answer, with "x =" written in front of it, so the learner types only the value. What goes up to
// the screen is "x = 3 or x = 2" once every box holds a value, and '' until then, so Next waits. Marking already takes the answers in any order.
// The "x =" takes room from each box, so the numbered boxes say "Tap to write" in the empty box: the longer "Tap here to write" was cut off at 390 px wide, and no word may be cut off.

/** The hint under the boxes. */
export const MULTI_HINT = 'Type each answer in its own box.'

/** The line under a single maths field for an equation, by how many answers the key has (P146). A key the screen was not told about has one. */
export function equationCountHint(count?: number): string {
  if (count !== undefined && count > 4) return 'Type every answer, with the word or between them.'
  return 'Type the answer, like x = 4.'
}

/** A box holds a value when it has a digit or pi in it: a letter or a sign alone is a step, not an answer (the same rule a number answer has). */
const hasValue = (text: string) => /\d|π|\bpi\b/i.test(text)

/** What a box holds, without the "x =" that is already written in front of it: if the learner types it too, it still reads. */
export function valueOfBox(typed: string, letter?: string): string {
  const text = typed.trim()
  if (!letter) return text
  return text.replace(new RegExp(`^${letter}\\s*=\\s*`, 'i'), '').trim()
}

/**
 * The answer the boxes make: "x = 3 or x = 2". '' while a box is empty or holds no value. When the whole is longer than the server takes (60 characters),
 * the letter is written once, "x = 3 or 2 or 5", which the marking reads the same way; and when that is too long too, the answer is '' and `tooLong` says why.
 */
export function buildAnswers(typed: string[], letter?: string): { answer: string; tooLong: boolean } {
  const values = typed.map((t) => valueOfBox(t, letter))
  if (values.length === 0 || !values.every(hasValue)) return { answer: '', tooLong: false }
  const full = values.map((v) => (letter ? `${letter} = ${v}` : v)).join(' or ')
  if (full.length <= ANSWER_MAX_LENGTH) return { answer: full, tooLong: false }
  const short = letter ? `${letter} = ${values.join(' or ')}` : full
  return short.length <= ANSWER_MAX_LENGTH ? { answer: short, tooLong: false } : { answer: '', tooLong: true }
}

export type MultiAnswerProps = {
  /** How many boxes: 2 to 4. */
  count: number
  /** The letter of the key, written in front of each box ("x =") and in front of each value of the answer. */
  letter?: string
  topic?: string
  prompt: string
  /** Called with the whole answer ("x = 3 or x = 2"), or '' while a box is not ready. */
  onChange: (answer: string) => void
}

export function MultiAnswer({ count, letter, topic, prompt, onChange }: MultiAnswerProps) {
  const [typed, setTyped] = useState<string[]>(() => Array.from({ length: count }, () => ''))
  const [tooLong, setTooLong] = useState(false)
  // The editor of one box tells the screen from outside React's own events, and two boxes can tell in the same moment: each change starts from the latest.
  const latest = useRef(typed)
  const set = (i: number, value: string) => {
    const next = latest.current.slice()
    next[i] = value
    latest.current = next
    setTyped(next)
    const built = buildAnswers(next, letter)
    setTooLong(built.tooLong)
    onChange(built.answer)
  }
  return (
    <div data-answers={count} className="flex w-full flex-col gap-[18px]">
      {typed.map((value, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <span data-answer-label="true" aria-hidden="true" className="text-[15px] font-semibold text-body">Answer {i + 1}</span>
          <div className="flex items-center gap-2.5">
            {letter ? (
              <span data-letter={letter} aria-hidden="true" className="flex-none text-[28px] leading-[1] font-bold text-ink">
                <i>{letter}</i> =
              </span>
            ) : null}
            <div className="min-w-0 flex-1">
              <MathAnswerField id={`answer-${i + 1}`} label={`Answer ${i + 1}`} kind="equation" topic={topic} prompt={prompt} value={value} onChange={(v) => set(i, v)} placeholder="Tap to write" />
            </div>
          </div>
        </div>
      ))}
      {tooLong ? (
        <p role="status" data-problem="long" className="m-0 text-center text-[16px] leading-[1.4] font-semibold text-ink">
          That is too long. Write it a shorter way.
        </p>
      ) : null}
    </div>
  )
}
