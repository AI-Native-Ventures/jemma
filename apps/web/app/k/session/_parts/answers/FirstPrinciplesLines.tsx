'use client'

import { definitionText, FIRST_PRINCIPLES_MAX_LINES, FIRST_PRINCIPLES_MIN_LINES, firstPrinciplesAnswer, functionName, holdsH, workedLineOf } from '@jemma/profiling/logic'
import type { FirstPrinciplesSpec } from '@jemma/profiling/schemas'
import { firstPrinciplesNote, type FirstPrinciplesReview } from '../../[sessionId]/logic'
import { FitMath } from '../FitMath'
import { katexHtml, MathText } from '../Frac'
import { Mark, WorkedLines } from './ProofLines'

// P185: a derivative from first principles, line by line, from the "Write steps line by line" board ("Determine f′(x) from first principles if f(x) = 2x² − 3x.").
// Jemma gives the first line, f′(x) = lim h→0 (f(x + h) − f(x))/h, and each line after it is its own maths editor, as the lines of a proof are. In front of a line
// with h in it Jemma writes "= lim h→0", and in front of a line with no h only "=": the learner types only the maths, and the limit goes when h does. "New line"
// opens the next one (up to 7). The results show the lines with the first that does not follow in red pen, why under it, and the line it should have been.

/** "lim h→0", with h → 0 under lim, as a textbook writes it. */
const LIM = '\\lim\\limits_{h\\to 0}'

/** The first line, the one Jemma gives, typeset; a screen reader hears it in words. */
function Start({ name, size, align }: { name: string; size: number; align: 'center' | 'left' }) {
  const latex = `${name}'(x)=${LIM}\\dfrac{${name}(x+h)-${name}(x)}{h}`
  const html = katexHtml(latex)
  return (
    <p data-first-principles="start" className={`m-0 w-full text-ink ${align === 'center' ? 'text-center' : 'text-left'}`}>
      <span className="sr-only">{`${name}′(x) is the limit, as h goes to 0, of ${name}(x + h) minus ${name}(x), all over h.`}</span>
      <span aria-hidden="true">{html ? <FitMath key={latex} html={html} latex={latex} size={size} /> : definitionText(name)}</span>
    </p>
  )
}

/** The words in front of a line: "= lim h→0" while h is in it, "=" once it is gone. */
function Lead({ under, size }: { under: boolean; size: number }) {
  const latex = under ? `=${LIM}` : '='
  const html = katexHtml(latex)
  return html ? (
    <span data-lead={under ? 'limit' : 'equals'} className="jemma-math whitespace-nowrap" style={{ fontSize: size }} dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <span data-lead={under ? 'limit' : 'equals'}>{under ? '= lim h→0' : '='}</span>
  )
}

/** True when line `i` is under the limit: h is in it or, while it is empty, in the last line written before it. The first line always is. */
function underAt(i: number, lines: string[]): boolean {
  let under = true
  for (let k = 0; k <= i; k++) {
    const text = lines[k]?.trim() ?? ''
    if (text) under = holdsH(text, workedLineOf)
  }
  return under
}

export function FirstPrinciplesAnswer({ spec, topic, prompt, onChange }: { spec: FirstPrinciplesSpec; topic?: string; prompt: string; onChange: (answer: string) => void }) {
  const name = functionName(spec)
  return (
    <div data-answer="first-principles" className="flex w-full flex-col gap-3">
      <Start name={name} size={22} align="center" />
      <WorkedLines
        kind="limit"
        topic={topic}
        prompt={prompt}
        max={FIRST_PRINCIPLES_MAX_LINES}
        lead={(i, lines) => (
          <span aria-hidden="true" className="flex w-[76px] flex-none justify-end text-ink">
            <Lead under={underAt(i, lines)} size={21} />
          </span>
        )}
        hint={(written) =>
          written < FIRST_PRINCIPLES_MIN_LINES
            ? `Write one line at a time, down to ${name}′(x): at least ${FIRST_PRINCIPLES_MIN_LINES} lines. Jemma puts lim in front while there is an h.`
            : 'Tap a line to change it.'
        }
        onLines={(lines) => onChange(firstPrinciplesAnswer(lines))}
      />
    </div>
  )
}

/** One line in the results: its number, "= lim h→0" or "=", the maths, and a red cross or a green tick when it is the one marked. */
function ResultLine({ n, under, text, state }: { n: number | null; under: boolean; text: string; state: 'done' | 'wrong' | 'fixed' }) {
  const look = state === 'wrong' ? 'border-[#E03C31] bg-[#FDF1EF]' : state === 'fixed' ? 'border-green bg-green-tint' : 'border-line bg-card'
  return (
    <div data-limit-result={state} className={`flex min-h-[46px] w-full items-center gap-2 rounded-14 border-2 px-3 py-1 ${look}`}>
      <span className="w-[18px] flex-none text-[13px] font-semibold text-body">{n ?? ''}</span>
      <span aria-hidden="true" className="flex-none">
        <Lead under={under} size={17} />
      </span>
      <span className="sr-only">{under ? 'the limit, as h goes to 0, of' : 'equals'}</span>
      <span className="min-w-0 flex-1 text-[17px] font-semibold leading-[1.2]">
        <MathText text={text} size={17} rule={2} gap={2} side={2} className="mx-0.5 align-middle" />
      </span>
      {state === 'wrong' ? <Mark ok={false} /> : state === 'fixed' ? <Mark ok /> : null}
    </div>
  )
}

/** The learner's lines in the results, after the line Jemma gave: the first that does not follow in red pen, why under it, and the line it should have been. */
export function FirstPrinciplesResult({ review }: { review: FirstPrinciplesReview }) {
  const name = functionName(review.spec)
  const note = firstPrinciplesNote(review.why, name)
  return (
    <div data-first-principles="results" className="flex w-full flex-col gap-1.5">
      <Start name={name} size={18} align="left" />
      {review.lines.map((text, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <ResultLine n={i + 1} under={review.under[i] ?? false} text={text} state={i === review.wrong ? 'wrong' : 'done'} />
          {i === review.wrong && note ? (
            <p data-limit-note="true" className="m-0 pl-7 text-[15px] leading-[1.35] font-semibold text-red-text">
              {note}
            </p>
          ) : null}
          {i === review.wrong && review.rightLine ? <ResultLine n={null} under={review.rightUnder} text={review.rightLine} state="fixed" /> : null}
        </div>
      ))}
    </div>
  )
}
