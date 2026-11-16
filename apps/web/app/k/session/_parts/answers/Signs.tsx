import { Fragment, type ReactNode } from 'react'
import { katexHtml } from '../katex-html'

/**
 * The signs of geometry in a line of words (P149c): parallel, perpendicular, angle, triangle, congruent, similar. The page font (Outfit, Latin only) has none of
 * them, and the font a phone falls back to draws the parallel sign as a thin "ı". So each sign is drawn by KaTeX (`\parallel`, `\perp` and the rest), whose
 * fonts are on the page already, and the words around it stay words. A line with none of these signs comes back as the same text, so nothing else changes.
 * A screen reader still gets the sign: the KaTeX text holds the character itself.
 */

const LATEX: Record<string, string> = {
  '∥': '\\parallel',
  '⊥': '\\perp',
  '∠': '\\angle',
  '△': '\\triangle',
  '≅': '\\cong',
  '∼': '\\sim',
}

/** One run that is one of the signs. */
const SIGNS = new RegExp(`([${Object.keys(LATEX).join('')}])`)

/** True when the text holds a sign that the page font does not have. */
export const hasSign = (text: string): boolean => SIGNS.test(text)

/** The text with each geometry sign drawn from a font that has it. */
export function SignText({ text }: { text: string }): ReactNode {
  if (!hasSign(text)) return <>{text}</>
  return (
    <>
      {text.split(SIGNS).map((run, i) => {
        const latex = LATEX[run]
        if (!latex) return <Fragment key={i}>{run}</Fragment>
        const html = katexHtml(latex)
        // KaTeX could not draw it (it always can): the character itself, with a maths font first.
        if (html === null) return <span key={i} data-sign={run} style={{ fontFamily: "'STIX Two Math', 'Cambria Math', 'Segoe UI Symbol', 'Noto Sans Math', serif" }}>{run}</span>
        return <span key={i} data-sign={run} className="jemma-math" dangerouslySetInnerHTML={{ __html: html }} />
      })}
    </>
  )
}
