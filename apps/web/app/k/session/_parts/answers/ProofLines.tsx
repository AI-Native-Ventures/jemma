'use client'

import { useRef, useState, type ReactNode } from 'react'
import { PROOF_MAX_LINES, PROOF_MIN_LINES, proofAnswer } from '@jemma/profiling/logic'
import { MathText } from '../Frac'
import { MathAnswerField } from '../MathAnswerField'

// P179: an identity proved line by line, from the "Write steps line by line" board ("Prove that sin²x/(1 − cos x) = 1 + cos x."). Each line is its own maths
// editor, with "LHS =" in front of the first and "=" in front of the others, so the learner types only the maths. "New line" opens the next one (up to 6), and a
// line can be tapped to change it. What goes up to the screen is the lines with a semicolon between them once 3 hold something. Each line is checked at the end;
// the results mark the first line that does not follow in red pen, with the line it should have been under it. P185: the lines of first principles are
// written the same way (`WorkedLines`, FirstPrinciplesLines.tsx).

const PEN = '#E03C31'

/** The words in front of a line: "LHS =" for the first, "=" for the others. */
const lead = (i: number) => (i === 0 ? 'LHS =' : '=')

/**
 * Lines of worked maths, each its own maths editor with words in front of it (`lead`, given the line and all the lines so far), and "New line" under them, up
 * to `max` lines. `onLines` is told every line as it is now; `hint` is the line under them, from how many lines hold something.
 */
export function WorkedLines({
  kind,
  topic,
  prompt,
  max,
  lead: leadOf,
  hint,
  onLines,
}: {
  kind: 'proof' | 'limit'
  topic?: string
  prompt: string
  max: number
  lead: (i: number, lines: string[]) => ReactNode
  hint: (written: number) => string
  onLines: (lines: string[]) => void
}) {
  const [lines, setLines] = useState<string[]>([''])
  // The editor of a line tells the screen from outside React's own events, and two lines can tell in the same moment: each change starts from the latest.
  const latest = useRef(lines)
  const write = (next: string[]) => {
    latest.current = next
    setLines(next)
    onLines(next)
  }
  const set = (i: number, value: string) => write(latest.current.map((l, k) => (k === i ? value : l)))
  const add = () => {
    if (latest.current.length < max) write([...latest.current, ''])
  }
  const written = lines.filter((l) => l.trim()).length
  return (
    <>
      {lines.map((value, i) => (
        <div key={i} {...{ [`data-${kind}-line`]: i + 1 }} className="mx-auto flex w-full max-w-[460px] flex-col gap-1">
          <span aria-hidden="true" className="text-[14px] font-semibold text-body">Line {i + 1}</span>
          <div className="flex items-center gap-2.5">
            {leadOf(i, lines)}
            <div className="min-w-0 flex-1">
              <MathAnswerField id={`line-${i + 1}`} label={`Line ${i + 1}`} kind="expression" topic={topic} prompt={prompt} value={value} onChange={(v) => set(i, v)} placeholder="Tap to write" line />
            </div>
          </div>
        </div>
      ))}
      {lines.length < max ? (
        <button
          type="button"
          onClick={add}
          className="flex min-h-11 cursor-pointer items-center gap-1.5 self-start rounded-12 border-2 border-dashed border-green bg-transparent px-3.5 text-[16px] font-bold text-green"
        >
          <span aria-hidden="true" className="text-[20px] leading-none">+</span> New line
        </button>
      ) : null}
      <p aria-live="polite" className="m-0 text-center text-[16px] leading-[1.4] text-body">
        {hint(written)}
      </p>
    </>
  )
}

export function ProofAnswer({ topic, prompt, onChange }: { topic?: string; prompt: string; onChange: (answer: string) => void }) {
  return (
    <div data-answer="proof" className="flex w-full flex-col gap-3">
      <WorkedLines
        kind="proof"
        topic={topic}
        prompt={prompt}
        max={PROOF_MAX_LINES}
        lead={(i) => (
          <span aria-hidden="true" className={`flex-none text-right text-[22px] leading-[1] font-bold text-ink ${i === 0 ? '' : 'w-[52px]'}`}>
            {lead(i)}
          </span>
        )}
        hint={(written) => (written < PROOF_MIN_LINES ? `Write one line at a time, from the left side to the right side: at least ${PROOF_MIN_LINES} lines.` : 'Tap a line to change it.')}
        onLines={(lines) => onChange(proofAnswer(lines))}
      />
    </div>
  )
}

/** The mark beside a line in the results: a green tick, or a cross in red pen. */
export function Mark({ ok }: { ok: boolean }) {
  return ok ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#007749" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={PEN} strokeWidth="3" strokeLinecap="round" aria-hidden="true" className="flex-none">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

/** One line of a proof in the results: its number, "LHS =" or "=", the maths, and a red cross or a green tick when it is the one marked. */
function ResultLine({ n, first, text, state }: { n: number | null; first: boolean; text: string; state: 'done' | 'wrong' | 'fixed' }) {
  const look = state === 'wrong' ? 'border-[#E03C31] bg-[#FDF1EF]' : state === 'fixed' ? 'border-green bg-green-tint' : 'border-line bg-card'
  return (
    <div data-proof-result={state} className={`flex min-h-[46px] w-full items-center gap-2 rounded-14 border-2 px-3 py-1 ${look}`}>
      <span className="w-[18px] flex-none text-[13px] font-semibold text-body">{n ?? ''}</span>
      <span className="min-w-0 flex-1 text-[17px] font-semibold leading-[1.2]">
        {first ? 'LHS = ' : '= '}
        <MathText text={text} size={17} rule={2} gap={2} side={2} className="mx-0.5 align-middle" />
      </span>
      {state === 'wrong' ? <Mark ok={false} /> : state === 'fixed' ? <Mark ok /> : null}
    </div>
  )
}

/** The learner's proof in the results: each line, the first that does not follow in red pen, and under it the line it should have been. */
export function ProofResult({ lines, wrong, rightLine }: { lines: string[]; wrong: number | null; rightLine: string | null }) {
  return (
    <div data-proof="results" className="flex w-full flex-col gap-1.5">
      {lines.map((text, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <ResultLine n={i + 1} first={i === 0} text={text} state={i === wrong ? 'wrong' : 'done'} />
          {i === wrong && rightLine ? <ResultLine n={null} first={i === 0} text={rightLine} state="fixed" /> : null}
        </div>
      ))}
    </div>
  )
}
