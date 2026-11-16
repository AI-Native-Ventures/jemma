import { levelOfScore, levelWords } from '../../k/maths/format'
import { ProgressDot } from '../../k/maths/ProgressDots'

/** The five results of one learner: a dark circle with a tick for a right answer, a coral one with a cross for a wrong one. */
export function Marks({ results, label }: { results: boolean[]; label: string }) {
  return (
    <span role="img" aria-label={label} className="flex flex-none gap-1.5">
      {results.map((right, i) => (
        <span key={i} className={`flex size-6 items-center justify-center rounded-pill ${right ? 'bg-ink' : 'border-[1.5px] border-coral bg-coral-wash'}`}>
          {right ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#B8381F" strokeWidth="3.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          )}
        </span>
      ))}
    </span>
  )
}

const words = (results: boolean[]) => results.map((r, i) => `question ${i + 1} ${r ? 'right' : 'wrong'}`).join(', ')

/** One learner in the class list: the circle of their score, their name, their five results and the count. */
export function LearnerRow({ name, results, you = false }: { name: string; results: boolean[]; you?: boolean }) {
  const right = results.filter(Boolean).length
  const level = levelOfScore({ right, asked: results.length })
  return (
    <li data-learner={name} className="flex items-center gap-3 border-t border-soft py-3 first:border-t-0">
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <ProgressDot level={level} label={levelWords(level)} />
        <span className="truncate text-[17px] font-semibold">{name}</span>
        {you ? <span className="flex-none rounded-pill bg-coral-tint px-2 py-0.5 text-[12px] font-bold">You</span> : null}
      </span>
      <Marks results={results} label={`${name}: ${words(results)}`} />
      <span className="w-14 flex-none text-right text-[15px] font-semibold">{right} of {results.length}</span>
    </li>
  )
}
