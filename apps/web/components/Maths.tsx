import { FractionText, hasMath } from '@/app/k/session/_parts/Frac'
import { hasTypeset } from '@/app/k/session/_parts/typeset'

/** True when the text has real maths in it (a power, a root, algebra, or from Grade 8 a sign): the screens that draw a sum their own way keep that for the rest. */
export const isMaths = (text: string, grade?: number | null): boolean => hasMath(text) || hasTypeset(text, typeof grade === 'number' && grade >= 8 ? 'all' : 'algebra')

/**
 * P136: a question, an answer or an explanation as a teacher or a parent reads it, drawn as real maths ("x^2 - 5x + 6 = 0" with its power raised,
 * "(x + 1)/2" stacked). It is the learner screens' FractionText with the sizes the teacher and parent rows use. A text with no maths in it comes back as
 * the words it was, so a row that clamps or truncates its text keeps doing so. A primary line ("3/4 of 12") keeps its drawn fraction.
 *
 * `grade` is the grade of the class or the learner when the page knows it: from Grade 8 every line with a sign in it is typeset ("all"); when it is not
 * known, or lower, a line is typeset when it has algebra in it, the way a learner's own question screen decides.
 */
export function Maths({
  text,
  grade,
  size = 16,
  color = 'currentColor',
  className = 'mx-0.5 align-middle',
}: {
  text: string
  grade?: number | null
  size?: number
  /** The colour of the stacked line and the maths; it follows the text around it unless a screen says otherwise (a white answer on a dark button). */
  color?: string
  className?: string
}) {
  const senior = typeof grade === 'number' && grade >= 8
  return <FractionText text={text} size={size} rule={2} gap={size >= 20 ? 3 : 2} side={3} color={color} className={className} typeset={senior ? 'all' : 'algebra'} />
}

/**
 * Like `Maths`, but a line with no real maths in it (no power, no root, no algebra) is handed back untouched, its sums of numbers as plain as they were. It is for
 * the rows that are sized and pinned around one unbroken line of words, like the example of a class mistake.
 */
export function MathsOnly({ text, grade, size = 16, className }: { text: string; grade?: number | null; size?: number; className?: string }) {
  return isMaths(text, grade) ? <Maths text={text} grade={grade} size={size} className={className} /> : <>{text}</>
}
