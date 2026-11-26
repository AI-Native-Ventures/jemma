'use client'

import { GemRow } from '@/components/sa'
import { Frac, FractionText, hasMath, isFraction, MathText, withFractions } from './Frac'
import { hasTypeset, type TypesetMode } from './typeset'
import { Bar, type Fill } from './Bars'
import { Gem } from './Gems'
import { besideNumber } from './prompt-layout'
import { CardQuestion } from './QuestionPrompt'
import { QuestionPicture } from './QuestionPicture'
import { scoreLines, type MissedQuestion } from '../[sessionId]/logic'
import { CellResults } from './answers/CellResults'
import { DataGraph } from './answers/DataGraph'
import { ColumnsSum } from './answers/ColumnsSum'
import { BuiltMat } from './answers/BlocksMat'
import { GroupsResult } from './answers/GroupsAnswer'
import { PlotGrid } from './answers/PlotGrid'
import { ClockResults } from './answers/ClockFace'
import { MatchBoard } from './answers/MatchPairs'
import { ProofResult } from './answers/ProofLines'
import { LineGrid } from './answers/LineGrid'
import { PinLine } from './answers/PinLine'
import { ShadedResult } from './answers/ShadeShape'
import { TapPicture } from './answers/TapShapes'
import { SignText } from './answers/Signs'

/** A sign (or an equals sign) that stands alone between two terms of an answer. */
const SIGNS = new Set(['+', '-', '\u2212', '\u00d7', '\u00f7', '*', '='])

/**
 * The terms of a written answer, each kept in one piece, or null when the answer is not a line of terms (no sign standing alone between two terms
 * and no bracket with a space inside: a number, a mixed number, an amount of money and every other old kind come back null and are drawn as they always were). A sign goes with the
 * term after it ("+ 12"), an equals sign with the term before it too ("x = 3"), and a bracket is never cut open, so a line can only wrap at a
 * space between two terms, never between a sign and its number.
 */
export function termUnits(value: string): string[] | null {
  const tokens: string[] = []
  let depth = 0
  let word = ''
  for (const c of value.trim()) {
    if (c === '(') depth++
    else if (c === ')') depth = Math.max(0, depth - 1)
    if (c === ' ' && depth === 0) {
      if (word) tokens.push(word)
      word = ''
    } else {
      word += c
    }
  }
  if (word) tokens.push(word)
  if (!tokens.some((t) => SIGNS.has(t) || t.includes(' '))) return null
  const units: string[] = []
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!
    const after = tokens[i + 1]
    if (!SIGNS.has(t) || after === undefined) {
      units.push(t)
    } else if (t === '=' && units.length > 0) {
      units.push(`${units.pop()} = ${after}`)
      i++
    } else {
      units.push(`${t} ${after}`)
      i++
    }
  }
  return units
}

/** A star, a root, a hyphen in front of a number or between two, in a written answer: only a senior class writes them. */
const SENIOR_SIGN = /[*^\u221a\u00b1\u2213]|sqrt|(^|\s)[-\u2212]\s?\d|\d\s[-\u2212]\s\d/

/**
 * A question of a senior class (P135): it has worked steps, or algebra, a power, a root or a senior sign in its question or its answer. Its sentences are
 * typeset as a senior class's are (a bare 2x is maths, a sum of numbers is maths); every other card is drawn as it always was.
 */
const isSenior = (m: MissedQuestion): boolean =>
  (m.steps?.length ?? 0) > 0 || hasTypeset(m.prompt, 'algebra') || hasMath(m.prompt) || hasTypeset(m.right, 'algebra') || hasMath(m.right) || SENIOR_SIGN.test(m.right)
const modeOf = (m: MissedQuestion): TypesetMode => (isSenior(m) ? 'all' : 'algebra')

/** An answer needs the whole width of its box when it is more than a short number: more than 6 characters. */
const isLong = (value: string) => value.trim().length > 6

/** An answer as the child reads it: a fraction stacked, a mixed number as its whole number and a stacked fraction. */
function Stacked({ value, size, rule, gap, side }: { value: string; size: number; rule: number; gap: number; side: number }) {
  if (isFraction(value)) {
    const [n, d] = value.split('/')
    return <Frac top={n!} bottom={d!} size={size} rule={rule} gap={gap} side={side} />
  }
  // A line of terms ("3x + 12 + 0", "x² + 4x + 4", "x = 3 or x = -1") keeps each term in one piece: it wraps only at a space between terms.
  // P135: an answer with a plus-minus sign is one piece of maths ("x = 2 ± √3"), not cut into terms.
  const units = /[\u00b1\u2213]/.test(value) ? null : termUnits(value)
  // P129: an answer with a letter, a star, a root or a minus in it (a senior class) is drawn as a textbook draws it; every other answer is drawn as it always was.
  const textbook = hasMath(value) || hasTypeset(value, 'algebra') || SENIOR_SIGN.test(value)
  if (units && (textbook || withFractions(value, () => null).every((p) => typeof p === 'string'))) {
    return (
      <span data-terms="true" style={{ fontSize: size }} className="min-w-0 text-right font-bold">
        {units.map((unit, i) => (
          <span key={i}>
            {i > 0 ? ' ' : null}
            <span className="whitespace-nowrap">{textbook ? <MathText text={unit} size={size} rule={rule} gap={gap} side={side} className="" /> : <SignText text={unit} />}</span>
          </span>
        ))}
      </span>
    )
  }
  // An answer with a power or a root (a senior class) is drawn with them; every other answer is drawn as it always was.
  if (textbook) {
    return (
      <span style={{ fontSize: size }} className="font-bold">
        <MathText text={value} size={size} rule={rule} gap={gap} side={side} className="" />
      </span>
    )
  }
  const parts = withFractions(value, (n, d, k) => <Frac key={k} top={n} bottom={d} size={size} rule={rule} gap={gap} side={side} />)
  if (parts.every((p) => typeof p === 'string')) return <span style={{ fontSize: size }} className="font-bold"><SignText text={value} /></span>
  return (
    <span className="flex items-center gap-1.5 font-bold" style={{ fontSize: size }}>
      {parts.map((part, i) => (typeof part === 'string' ? (part.trim() ? <span key={`t${i}`}><SignText text={part.trim()} /></span> : null) : part))}
    </span>
  )
}

/** The right answer drawn as bars: the first amount converted in gold, the second added in black. */
function RightBar({ m }: { m: MissedQuestion }) {
  if (!m.terms || m.terms.length !== 2 || !isFraction(m.right)) return null
  const [rn, rd] = m.right.split('/').map(Number) as [number, number]
  const [n1, d1] = m.terms[0]!.split('/').map(Number) as [number, number]
  const gold = Math.min(rn, (n1 * rd) / d1)
  const fills = Array.from({ length: rd }, (_, i): Fill => (i < gold ? 'gold' : i < rn ? 'ink' : 'none'))
  return (
    <span className="flex">
      <Bar fills={fills} height={26} radius={6} white />
    </span>
  )
}

/** "You wrote" and "Right answer" sit side by side, unless one answer is longer than a short number: then they stack, each as wide as the screen. */
const stack = (m: MissedQuestion) => !m.unread && (isLong(m.wrote) || isLong(m.right))

/**
 * A question's card starts the same way, right or missed: its number, the question and its picture. "Question 1" is one line (never "Question" over "1"). A
 * senior question has the whole width of the card under its number, left aligned, short or long (P135); only a primary one that is short stays beside it.
 */
function CardHead({ m }: { m: MissedQuestion }) {
  const fractionSum = m.terms && m.terms.length === 2
  const beside = fractionSum || (besideNumber(m.prompt) && !isSenior(m))
  return (
    <>
      {beside ? (
        <div className="flex items-center justify-between gap-3">
          <h2 id={`r${m.n}`} className="m-0 text-[14px] font-semibold text-body">Question {m.n}</h2>
          <span data-question="true" className="flex items-center justify-end gap-2 text-right text-[24px] font-bold">
            {fractionSum ? (
              <>
                <Stacked value={m.terms![0]!} size={24} rule={2.5} gap={3} side={3} />+<Stacked value={m.terms![1]!} size={24} rule={2.5} gap={3} side={3} />
              </>
            ) : (
              <FractionText text={m.prompt} size={26} rule={2.5} gap={3} side={3} />
            )}
          </span>
        </div>
      ) : (
        // A long question (P130) has the whole width of the card under its number, its context in normal text and its maths line large.
        <div className="flex flex-col gap-2">
          <h2 id={`r${m.n}`} className="m-0 text-[14px] font-semibold whitespace-nowrap text-body">Question {m.n}</h2>
          <CardQuestion prompt={m.prompt} typeset={modeOf(m)} />
        </div>
      )}
      <QuestionPicture spec={m.diagram} face={m.clockFace} variant="card" />
      {/* P167: a graph the learner drew: the right bars in green, and theirs dashed beside them when they were not right. */}
      {m.graph ? <DataGraph graph={m.graph} values={m.graphWrote ?? []} right={m.graphRight ?? []} mode="results" /> : null}
      {/* P168: a sum worked in columns: the learner's digits, a wrong one circled in red pen with the right digit beside it. */}
      {m.columns ? <ColumnsSum columns={m.columns} mode="results" places={m.columnsPlaces ?? []} /> : null}
      {/* P169: the blocks the learner built. */}
      {m.blocks && !m.unread ? <BuiltMat blocks={m.blocks} wrote={m.wrote} /> : null}
      {/* P170: the groups as the learner left them, a card in the wrong group circled in red pen. */}
      {m.groups && !m.unread ? <GroupsResult groups={m.groups} wrote={m.groupsWrote ?? []} right={m.groupsRight ?? []} /> : null}
      {/* P171: the right points in green, a point the learner placed somewhere else dashed beside it. */}
      {m.plot ? <PlotGrid plot={m.plot} mode="results" points={m.plotWrote ?? []} right={m.plotRight ?? []} /> : null}
      {/* P174: the right line in green, the learner's dashed when it is another line. */}
      {m.line ? <LineGrid line={m.line} mode="results" a={m.lineWrote?.[0] ?? null} b={m.lineWrote?.[1] ?? null} right={m.lineRight ?? null} /> : null}
      {/* P179: the learner's proof, the first line that does not follow in red pen with the line it should have been under it. */}
      {m.proof && !m.unread && (m.proofLines?.length ?? 0) > 0 ? <ProofResult lines={m.proofLines!} wrong={m.proofWrong ?? null} rightLine={m.proofRight ?? null} /> : null}
      {/* P178: the learner's pairs: a right one in green, a wrong one in red pen. */}
      {m.match && !m.unread ? <MatchBoard match={m.match} joined={m.matchWrote ?? []} right={m.matchRight ?? []} mode="results" /> : null}
      {/* P177: the learner's clock beside the right one (alone, in green, when it is right). */}
      {m.clock ? <ClockResults wrote={m.clockWrote ?? null} right={m.clockRight ?? null} /> : null}
      {/* P175: the right pin in green, the learner's dashed beside it. */}
      {m.pin ? <PinLine pin={m.pin} at={m.pinWrote ?? null} right={m.pinRight ?? null} mode="results" /> : null}
      {/* P172: the shape as the learner shaded it. */}
      {m.shade && !m.unread ? <ShadedResult shade={m.shade} wrote={m.wrote} /> : null}
      {/* P173: the learner's picks, a shape missed or picked by mistake circled in red pen. */}
      {m.tap && !m.unread ? (
        <TapPicture tap={m.tap} picked={m.tap.shapes.map((_, i) => (m.tapWrote ?? []).includes(i + 1))} right={m.tapRight ?? []} label={`Your picks: ${(m.tapWrote ?? []).length} shapes.`} />
      ) : null}
    </>
  )
}

/**
 * One line of worked maths ("x/2 + 6 = 10"), drawn by the same maths text as every answer on this screen (powers raised, fractions stacked). The line is ONE
 * piece of maths (P135), so the spaces around its signs are even and a line never breaks inside itself: if it is wider than the card it is scaled to fit.
 */
function StepLine({ line }: { line: string }) {
  return <MathText text={line} size={20} rule={2} gap={2} side={3} className="mx-0.5 align-middle" />
}

/** "How to get there": the maths from the question to the answer, one line each, on a card of a question that has worked steps. Nothing is drawn without steps. */
function Steps({ steps }: { steps?: string[] }) {
  if (!steps || steps.length === 0) return null
  return (
    <div data-steps="true" className="flex flex-col gap-2 rounded-[16px] border border-line px-3.5 py-3">
      <span className="text-[15px] font-bold">How to get there</span>
      <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
        {steps.map((line, i) => (
          <li key={i} className="text-[18px] leading-[1.6]"><StepLine line={line} /></li>
        ))}
      </ol>
    </div>
  )
}

/** A right answer: confirmed, with what the learner wrote and why that way works. No line about a usual mistake, nothing to correct. */
function RightCard({ m }: { m: MissedQuestion }) {
  return (
    <article data-verdict="right" aria-labelledby={`r${m.n}`} className="flex flex-col gap-3.5 rounded-[24px] border border-line bg-card p-[18px]">
      <CardHead m={m} />
      <p data-verdict-line="true" className="m-0 flex items-center gap-2 text-[17px] leading-[1.3] font-bold">
        <span aria-hidden="true" className="flex size-6 flex-none items-center justify-center rounded-pill bg-green">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
        </span>
        Yes, you&apos;re right.
      </p>
      {m.cells ? (
        <CellResults m={m} showRight={false} />
      ) : (
        <span className={`flex items-center justify-between rounded-14 border-[1.5px] border-green bg-green-tint px-3.5 py-2.5 ${isLong(m.wrote) ? 'gap-3' : ''}`}>
          <span className={isLong(m.wrote) ? 'flex-none text-[14px] font-semibold' : 'text-[14px] font-semibold'}>You wrote</span>
          <Stacked value={m.wrote} size={20} rule={2} gap={2} side={3} />
        </span>
      )}
      <Steps steps={m.steps} />
      <p className="m-0 text-[16px] leading-[1.5]"><strong className="font-bold">Why it works:</strong> <FractionText text={m.rightWay} size={22} rule={2} gap={3} side={3} typeset={modeOf(m)} /></p>
    </article>
  )
}

/** A missed answer, as it always was (what was written, the right answer, why, the right way), marked with a calm "Not yet.". */
function MissedCard({ m }: { m: MissedQuestion }) {
  return (
    <article data-verdict="missed" aria-labelledby={`r${m.n}`} className="flex flex-col gap-3.5 rounded-[24px] border border-line bg-card p-[18px]">
      <CardHead m={m} />
      <p data-verdict-line="true" className="m-0">
        <span className="inline-flex rounded-pill bg-soft-4 px-3 py-1 text-[14px] leading-[1.3] font-bold text-red-text">Not yet.</span>
      </p>
      {m.cells ? (
        <CellResults m={m} showRight />
      ) : (
        <div className={`grid ${stack(m) ? 'grid-cols-1' : 'grid-cols-2'} gap-2`}>
          {/* A paper answer that could not be read says so, in words, in the place of an empty answer (a long line gets the whole row). */}
          <span className={`flex items-center justify-between rounded-14 bg-soft-2 px-3.5 py-2.5 ${m.unread ? 'col-span-2 gap-3' : stack(m) ? 'gap-3' : ''}`}>
            <span className={stack(m) ? 'flex-none text-[14px] text-body' : 'text-[14px] text-body'}>You wrote</span>
            {m.unread ? (
              <span data-unread="true" className="text-right text-[15px] leading-[1.3] font-semibold">Jemma could not read this one</span>
            ) : (
              <Stacked value={m.wrote} size={20} rule={2} gap={2} side={3} />
            )}
          </span>
          <span className={`flex items-center justify-between rounded-14 border-[1.5px] border-green bg-green-tint px-3.5 py-2.5 ${m.unread ? 'col-span-2' : stack(m) ? 'gap-3' : ''}`}>
            <span className={stack(m) ? 'flex-none text-[14px] font-semibold' : 'text-[14px] font-semibold'}>Right answer</span>
            <Stacked value={m.right} size={20} rule={2} gap={2} side={3} />
          </span>
        </div>
      )}
      <p className="m-0 text-[16px] leading-[1.5]"><strong className="font-bold">Why:</strong> <FractionText text={m.why} size={22} rule={2} gap={3} side={3} typeset={modeOf(m)} /></p>
      <Steps steps={m.steps} />
      <div className="flex flex-col gap-2 rounded-[16px] bg-[#F8F6F1] p-3.5">
        <span className="text-[15px] font-bold">The right way</span>
        <span className="text-[16px] leading-[1.5]"><FractionText text={m.rightWay} size={22} rule={2} gap={3} side={3} typeset={modeOf(m)} /></span>
        <RightBar m={m} />
      </div>
    </article>
  )
}

/**
 * The results of a practice: every try question in order. A right answer is confirmed and explained, a missed one is corrected (what was written, the
 * right answer, why, the right way). Under the greeting: how many were right and one kind line by the score. A list that does not say which answers
 * were right (only misses, no `correct`) states no count and just says what it holds. Answers on paper come through the same view. After a practice it
 * greets the learner; opened again later (P120) the page passes `heading` (the topic) and `note` (the day and the count) in place of the greeting.
 */
export function Results({ firstName, missed, heading, note }: { firstName: string; missed: MissedQuestion[]; heading?: string; note?: string }) {
  const graded = missed.some((m) => m.correct !== undefined)
  const lines = missed.length > 0 && graded ? scoreLines(missed.filter((m) => m.correct).length, missed.length) : null
  const lead =
    missed.length === 0
      ? 'Nice work. There is nothing to go over this time.'
      : `Let's look at ${missed.length === 1 ? 'this 1' : `these ${missed.length}`} together.`
  return (
    <main className="flex flex-1 flex-col gap-[18px] px-5 pt-5 pb-[26px]">
      <div className="flex flex-col gap-2.5">
        <GemRow size={18} />
        <h1 className="m-0 text-[32px] leading-[1.1] font-bold tracking-[-0.02em]">{heading ?? `You finished, ${firstName}!`}</h1>
        {note ? <p data-note="true" className="m-0 text-[16px] leading-[1.45] font-semibold text-body">{note}</p> : null}
        {lines ? (
          <>
            <p data-score="true" className="m-0 text-[22px] leading-[1.3] font-bold">{lines.score}</p>
            <p data-cheer="true" className="m-0 text-[18px] leading-[1.45]">{lines.cheer}</p>
          </>
        ) : (
          <p className="m-0 text-[18px] leading-[1.45]">{lead}</p>
        )}
      </div>
      {missed.map((m) => (m.correct ? <RightCard key={m.n} m={m} /> : <MissedCard key={m.n} m={m} />))}
      <div className="flex-1" />
    </main>
  )
}
