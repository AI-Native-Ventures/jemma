import { levelOfScore, levelWords } from '../../k/maths/format'
import { ProgressDot } from '../../k/maths/ProgressDots'

// The sizes of the five marks, their header and their footer, and of the score column: one place, so the Q1 to Q5 labels sit over the marks. On a phone
// the marks are 20 px circles and the score column is narrow, so the name has room (a card is 310 px wide at 390: the name gets 118 px, "Refilwe" needs
// 64); from the laptop width they are 24 px and the column is wider, as they always were.
export const MARK_GAP = 'gap-1 lg:gap-1.5'
export const MARK = 'size-5 lg:size-6'
export const MARK_COLUMN = 'w-5 lg:w-6'
export const SCORE_COLUMN = 'w-12 lg:w-14'

/** The five results of one learner: a green circle with a tick for a right answer, a red ring with a cross for a wrong one. */
export function Marks({ results, label }: { results: boolean[]; label: string }) {
  return (
    <span role="img" aria-label={label} className={`flex flex-none ${MARK_GAP}`}>
      {results.map((right, i) => (
        <span key={i} className={`flex ${MARK} items-center justify-center rounded-pill ${right ? 'bg-green' : 'border-[1.5px] border-red bg-card'}`}>
          {right ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#B8281E" strokeWidth="3.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
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
        {/* The pill is the second line under the name, so the name has the whole width of the column and is never cut to make room for it. */}
        <span className="flex min-w-0 flex-col items-start gap-0.5">
          <span data-learner-name="true" className="max-w-full truncate text-[17px] leading-[1.25] font-semibold">{name}</span>
          {you ? <span className="rounded-pill bg-gold-tint px-2 py-0.5 text-[12px] leading-[1.2] font-bold">You</span> : null}
        </span>
      </span>
      <Marks results={results} label={`${name}: ${words(results)}`} />
      <span className={`${SCORE_COLUMN} flex-none text-right text-[15px] font-semibold`}>{right} of {results.length}</span>
    </li>
  )
}
