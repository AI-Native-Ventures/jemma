import { Fragment } from 'react'
import { readableMaths, rootSigns, takeNthRoots, type NthRoot } from '@/lib/lesson-maths'
import { FitMath } from '../../session/_parts/FitMath'
import { FractionText, katexHtml } from '../../session/_parts/Frac'
import { segments, toLatexRun, type TypesetMode } from '../../session/_parts/typeset'

/** The maths notation of a lesson: Grade 8 and up has a line typeset whenever it has a sign in it, a lower grade when it has algebra in it (as the sessions do). */
export const typesetFor = (grade: number): TypesetMode => (grade >= 8 ? 'all' : 'algebra')

/** What a letter that stands in for a root is in the LaTeX the typesetter makes (it writes a Greek letter with a space after it). */
const MARK_LATEX: Record<string, string> = { ω: '\\omega ', λ: '\\lambda ', φ: '\\phi ' }

/** The LaTeX of `sqrt[n](radicand)`: the radicand read by the typesetter, drawn under a root with its index. Null when the radicand does not read. */
function nthRootLatex(root: NthRoot): string | null {
  const inner = toLatexRun(root.radicand)
  return inner === null ? null : `\\sqrt[${root.index}]{${inner.replace(/^\\displaystyle\s*(\{\})?/, '')}}`
}

/**
 * A line with the nth root in it ("a^(1/n) = sqrt[n](a)"). The typesetter has no nth root, so each root is a letter while it reads the line, and the LaTeX of
 * the root takes that letter's place in each piece of maths it makes. A line that cannot be done this way (a radicand that does not read, a root that
 * ended up in the words) writes the roots as signs ("ⁿ√(a)") and is drawn as any other line.
 */
function NthRootText({ text, typeset, size, color }: { text: string; typeset: TypesetMode; size: number; color?: string }) {
  const taken = takeNthRoots(text)
  const tex = taken.roots.map(nthRootLatex)
  const parts = segments(taken.text, typeset)
  const tokens = taken.roots.map((r) => MARK_LATEX[r.mark]!)
  const swap = (latex: string) => taken.roots.reduce((l, _r, i) => l.split(tokens[i]!).join(tex[i]!), latex)
  const placed = taken.roots.every((_r, i) => parts.some((p) => p.kind === 'math' && p.latex.includes(tokens[i]!)))
  const strayed = parts.some((p) => p.kind === 'text' && taken.roots.some((r) => p.text.includes(r.mark)))
  const html = parts.map((p) => (p.kind === 'math' ? katexHtml(swap(p.latex)) : null))
  if (taken.left || taken.roots.length === 0 || tex.includes(null) || !placed || strayed || parts.some((p, i) => p.kind === 'math' && html[i] === null)) {
    return <FractionText text={rootSigns(text)} size={size} rule={2} gap={3} side={3} typeset={typeset} {...(color ? { color } : {})} />
  }
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" data-typeset="true">
        {parts.map((p, i) =>
          p.kind === 'math' ? (
            <FitMath key={`${i}|${p.latex}|${size}`} html={html[i]!} latex={swap(p.latex)} size={size} color={color} />
          ) : (
            <Fragment key={i}>
              <FractionText text={p.text} size={size} rule={2} gap={3} side={3} typeset="off" {...(color ? { color } : {})} />
            </Fragment>
          ),
        )}
      </span>
    </>
  )
}

/**
 * A line of a lesson in line with the words around it (a title in a heading or a link, a row of a list, a key word): its maths drawn as the practice screens
 * draw it. Every text of a lesson goes through here or `LessonText`, so a power with letters touching it ("ax^2") is drawn everywhere or nowhere
 * (`readableMaths` writes it so the shared typesetter reads it).
 */
export function LessonInline({ text, typeset, size = 21, color }: { text: string; typeset: TypesetMode; size?: number; color?: string }) {
  const prepared = readableMaths(text)
  if (prepared.includes('sqrt[')) return <NthRootText text={prepared} typeset={typeset} size={size} color={color} />
  return <FractionText text={prepared} size={size} rule={2} gap={3} side={3} typeset={typeset} {...(color ? { color } : {})} />
}

/**
 * The words of a lesson with their maths drawn as the practice screens draw it (stacked fractions, raised powers, roots, KaTeX for algebra): the same
 * renderer as a question, so a lesson and a practice never write one thing two ways. Paragraphs are separated by a blank line. A screen reader gets the
 * plain text (`FractionText` keeps it for them).
 */
export function LessonText({ text, typeset, size = 21, className = '' }: { text: string; typeset: TypesetMode; size?: number; className?: string }) {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  return (
    <div className={`flex min-w-0 flex-col gap-2.5 [overflow-wrap:anywhere] ${className}`}>
      {paragraphs.map((p, i) => (
        <p key={i} className="m-0 whitespace-pre-line">
          <LessonInline text={p} typeset={typeset} size={size} />
        </p>
      ))}
    </div>
  )
}
