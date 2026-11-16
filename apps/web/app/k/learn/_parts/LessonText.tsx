import type { TypesetMode } from '../../session/_parts/typeset'
import { FractionText } from '../../session/_parts/Frac'

/** The maths notation of a lesson: Grade 8 and up has a line typeset whenever it has a sign in it, a lower grade when it has algebra in it (as the sessions do). */
export const typesetFor = (grade: number): TypesetMode => (grade >= 8 ? 'all' : 'algebra')

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
          <FractionText text={p} size={size} rule={2} gap={3} side={3} typeset={typeset} />
        </p>
      ))}
    </div>
  )
}
