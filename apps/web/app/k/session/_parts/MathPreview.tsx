import { readMath, type MathNode } from '@jemma/profiling/logic'
import type { ReactNode } from 'react'
import { Frac, MathText } from './Frac'

// P125: the "It reads:" line under the answer box. What was typed is read the way the marking reads it, and drawn: fractions stacked, a root with its
// line, powers raised, sin cos tan upright, pi as the pi sign, a degree sign after its number. Text that does not read yet (the child is still typing)
// is drawn by `MathText`, as it always was.

type Look = { size: number; rule: number; gap: number; side: number; className?: string }

const raised = (content: ReactNode) => (
  <sup style={{ fontSize: '0.62em', lineHeight: 0, position: 'relative', top: '-0.55em', verticalAlign: 'baseline', fontWeight: 'inherit' }}>{content}</sup>
)

const rooted = (content: ReactNode) => (
  <span data-root="true" style={{ whiteSpace: 'nowrap' }}>
    {'√'}
    <span data-radicand="true" style={{ display: 'inline-block', lineHeight: 1.05, borderTop: '0.08em solid currentColor', padding: '0 0.12em' }}>
      {content}
    </span>
  </span>
)

/** The name of a trig function, upright, as it is printed in a book. */
const named = (name: string) => (
  <span data-fn={name} style={{ fontStyle: 'normal', letterSpacing: '0.02em' }}>
    {name}
  </span>
)

/** What a fraction line, a root or a power takes as its own: a bracket that is all of it is not drawn. */
const inner = (n: MathNode): MathNode => (n.t === 'group' ? inner(n.a) : n)

function draw(n: MathNode, look: Look): ReactNode {
  switch (n.t) {
    case 'num':
      return n.raw ?? String(n.v)
    case 'var':
      return n.name
    case 'pi':
      return 'π'
    case 'deg':
      return (
        <>
          {draw(n.a, look)}
          {'°'}
        </>
      )
    case 'neg':
      return (
        <>
          {'−'}
          {draw(n.a, look)}
        </>
      )
    case 'group':
      return (
        <>
          {'('}
          {draw(n.a, look)}
          {')'}
        </>
      )
    case 'sqrt':
      return rooted(draw(inner(n.a), look))
    case 'fn':
      return (
        <>
          {named(n.name)}
          {'('}
          {draw(inner(n.a), look)}
          {')'}
        </>
      )
    case 'pow': {
      const base = n.a
      // sin squared of x: the little 2 sits after the name, as it is written.
      if (base.t === 'fn') {
        return (
          <>
            {named(base.name)}
            {raised(draw(inner(n.b), look))}
            {'('}
            {draw(inner(base.a), look)}
            {')'}
          </>
        )
      }
      return (
        <>
          {draw(base, look)}
          {raised(draw(inner(n.b), look))}
        </>
      )
    }
    case 'add':
      return (
        <>
          {draw(n.a, look)}
          {' + '}
          {draw(n.b, look)}
        </>
      )
    case 'sub':
      return (
        <>
          {draw(n.a, look)}
          {' − '}
          {draw(n.b, look)}
        </>
      )
    case 'mul':
      return (
        <>
          {draw(n.a, look)}
          {n.explicit ? ' × ' : null}
          {draw(n.b, look)}
        </>
      )
    case 'div':
      return <Frac top={draw(inner(n.a), look)} bottom={draw(inner(n.b), look)} size={look.size} rule={look.rule} gap={look.gap} side={look.side} className={look.className} />
  }
}

/** The signs between the parts of an answer that holds more than one (x = 3 or x = -1; two coordinates), kept as they were typed. */
const BETWEEN = /(\s*(?:=|;|\bor\b|\band\b)\s*)/

/** The answer, drawn as it will be read. The plain words go to a screen reader and the drawing is hidden from it. */
export function MathPreview({ text, size, rule, gap, side, className = 'mx-1 align-middle' }: { text: string } & Look) {
  const look: Look = { size, rule, gap, side, className }
  const parts = text.split(BETWEEN).map((piece, i) => {
    if (i % 2 === 1) return <span key={i}>{piece.includes('=') ? ' = ' : piece.includes(';') ? '; ' : ` ${piece.trim()} `}</span>
    const tree = piece.trim() ? readMath(piece) : null
    return tree ? <span key={i}>{draw(tree, look)}</span> : <MathText key={i} text={piece} size={size} rule={rule} gap={gap} side={side} className={className} />
  })
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">{parts}</span>
    </>
  )
}
