'use client'

import { Frac, FractionText, hasMath, isFraction, MathText, withFractions } from './Frac'
import { Bar, type Fill } from './Bars'
import { Gem } from './Gems'
import { QuestionPicture } from './QuestionPicture'
import type { MissedQuestion } from '../[sessionId]/logic'

/** An answer as the child reads it: a fraction stacked, a mixed number as its whole number and a stacked fraction. */
function Stacked({ value, size, rule, gap, side }: { value: string; size: number; rule: number; gap: number; side: number }) {
  if (isFraction(value)) {
    const [n, d] = value.split('/')
    return <Frac top={n!} bottom={d!} size={size} rule={rule} gap={gap} side={side} />
  }
  // An answer with a power or a root (a senior class) is drawn with them; every other answer is drawn as it always was.
  if (hasMath(value)) {
    return (
      <span style={{ fontSize: size }} className="font-bold">
        <MathText text={value} size={size} rule={rule} gap={gap} side={side} className="" />
      </span>
    )
  }
  const parts = withFractions(value, (n, d, k) => <Frac key={k} top={n} bottom={d} size={size} rule={rule} gap={gap} side={side} />)
  if (parts.every((p) => typeof p === 'string')) return <span style={{ fontSize: size }} className="font-bold">{value}</span>
  return (
    <span className="flex items-center gap-1.5 font-bold" style={{ fontSize: size }}>
      {parts.map((part, i) => (typeof part === 'string' ? (part.trim() ? <span key={`t${i}`}>{part.trim()}</span> : null) : part))}
    </span>
  )
}

/** The right answer drawn as bars: the first amount converted in coral, the second added in ink. */
function RightBar({ m }: { m: MissedQuestion }) {
  if (!m.terms || m.terms.length !== 2 || !isFraction(m.right)) return null
  const [rn, rd] = m.right.split('/').map(Number) as [number, number]
  const [n1, d1] = m.terms[0]!.split('/').map(Number) as [number, number]
  const coral = Math.min(rn, (n1 * rd) / d1)
  const fills = Array.from({ length: rd }, (_, i): Fill => (i < coral ? 'coral' : i < rn ? 'ink' : 'none'))
  return (
    <span className="flex">
      <Bar fills={fills} height={26} radius={6} white />
    </span>
  )
}

export function Results({ firstName, missed }: { firstName: string; missed: MissedQuestion[] }) {
  const lead =
    missed.length === 0
      ? 'Nice work. There is nothing to go over this time.'
      : missed.length * 2 <= 5
        ? `Most of your answers were right. Let's look at ${missed.length === 1 ? 'this 1' : `these ${missed.length}`} together.`
        : `Some of these were tricky. Let's look at ${missed.length === 1 ? 'this 1' : `these ${missed.length}`} together.`
  return (
    <main className="flex flex-1 flex-col gap-[18px] px-5 pt-5 pb-[26px]">
      <div className="flex flex-col gap-2.5">
        <span aria-hidden="true" className="flex gap-1.5">
          <Gem kind="full" size={18} />
          <svg width="18" height="18" viewBox="0 0 16 16"><polygon points="8,1 15,8 8,15 1,8" fill="#1F1D36" /></svg>
          <Gem kind="full" size={18} />
        </span>
        <h1 className="m-0 text-[32px] leading-[1.1] font-bold tracking-[-0.02em]">You finished, {firstName}!</h1>
        <p className="m-0 text-[18px] leading-[1.45]">{lead}</p>
      </div>
      {missed.map((m) => (
        <article key={m.n} aria-labelledby={`r${m.n}`} className="flex flex-col gap-3.5 rounded-[24px] border border-line bg-card p-[18px]">
          <div className="flex items-center justify-between gap-3">
            <h2 id={`r${m.n}`} className="m-0 text-[14px] font-semibold text-body">Question {m.n}</h2>
            <span data-question="true" className="flex items-center justify-end gap-2 text-right text-[24px] font-bold">
              {m.terms && m.terms.length === 2 ? (
                <>
                  <Stacked value={m.terms[0]!} size={24} rule={2.5} gap={3} side={3} />+<Stacked value={m.terms[1]!} size={24} rule={2.5} gap={3} side={3} />
                </>
              ) : (
                <FractionText text={m.prompt} size={26} rule={2.5} gap={3} side={3} />
              )}
            </span>
          </div>
          <QuestionPicture spec={m.diagram} variant="card" />
          <div className="grid grid-cols-2 gap-2">
            {/* A paper answer that could not be read says so, in words, in the place of an empty answer (a long line gets the whole row). */}
            <span className={`flex items-center justify-between rounded-14 bg-soft-2 px-3.5 py-2.5 ${m.unread ? 'col-span-2 gap-3' : ''}`}>
              <span className="text-[14px] text-body">You wrote</span>
              {m.unread ? (
                <span data-unread="true" className="text-right text-[15px] leading-[1.3] font-semibold">Jemma could not read this one</span>
              ) : (
                <Stacked value={m.wrote} size={20} rule={2} gap={2} side={3} />
              )}
            </span>
            <span className={`flex items-center justify-between rounded-14 border-[1.5px] border-coral bg-[#FFF1ED] px-3.5 py-2.5 ${m.unread ? 'col-span-2' : ''}`}>
              <span className="text-[14px] font-semibold">Right answer</span>
              <Stacked value={m.right} size={20} rule={2} gap={2} side={3} />
            </span>
          </div>
          <p className="m-0 text-[16px] leading-[1.5]"><strong className="font-bold">Why:</strong> <FractionText text={m.why} size={22} rule={2} gap={3} side={3} /></p>
          <div className="flex flex-col gap-2 rounded-[16px] bg-[#F7F6FB] p-3.5">
            <span className="text-[15px] font-bold">The right way</span>
            <span className="text-[16px] leading-[1.5]"><FractionText text={m.rightWay} size={22} rule={2} gap={3} side={3} /></span>
            <RightBar m={m} />
          </div>
        </article>
      ))}
      <div className="flex-1" />
    </main>
  )
}
