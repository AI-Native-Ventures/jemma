import { levelHeadline, type LevelTopicResult } from '@jemma/profiling/logic'

// P163: what a level check found, for the parent (board "Level check result"): the one-line answer, each topic with its verdict, the learner's answers,
// and the first lesson. Words name the learner and never say he or she.

export type LevelAnswerRow = { n: number; topicName: string; prompt: string; answer: string; correct: boolean; skipped: boolean }

const VERDICT = { solid: 'Solid', start: 'New gap', unsure: 'Too early to tell' } as const

function Mark({ verdict }: { verdict: LevelTopicResult['verdict'] }) {
  if (verdict === 'solid')
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <polygon points="8,1 15,8 8,15 1,8" fill="#FFB81C" />
      </svg>
    )
  if (verdict === 'start')
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <polygon points="8,1.5 14.5,8 8,14.5 1.5,8" fill="none" stroke="#161616" strokeWidth="1.6" />
      </svg>
    )
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <polygon points="8,1.5 14.5,8 8,14.5 1.5,8" fill="none" stroke="#5C5A55" strokeWidth="1.6" strokeDasharray="2.4 2" />
    </svg>
  )
}

export function LevelResult({
  name,
  dateText,
  minutes,
  results,
  answers,
  next,
}: {
  name: string
  /** "Tue 24 Nov" */
  dateText: string
  minutes: number | null
  results: LevelTopicResult[]
  answers: LevelAnswerRow[]
  /** The first lesson Jemma is writing or has written, or null. */
  next: { topicName: string; ready: boolean } | null
}) {
  const unsure = results.filter((r) => r.verdict === 'unsure')
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-[18px] px-5 pt-3.5 pb-8 leading-[normal] lg:px-10 lg:pt-8">
      <div className="flex flex-col gap-2">
        <p className="m-0 text-[14px] font-semibold text-body">Level check &middot; {dateText}</p>
        <div className="flex items-start gap-2.5">
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="mt-2.5 flex-none">
            <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FFB81C" />
          </svg>
          <h1 className="m-0 text-[26px] leading-[1.18] font-semibold tracking-[-0.015em] text-pretty">{levelHeadline(name, results)}</h1>
        </div>
      </div>

      <section aria-labelledby="level-found" className="flex flex-col gap-1 rounded-20 border border-line bg-card p-4">
        <h2 id="level-found" className="m-0 text-[17px] font-semibold">
          What the check found
        </h2>
        <ul className="m-0 flex list-none flex-col p-0">
          {results.map((r) => (
            <li key={r.topicName} className="flex min-h-14 items-center gap-3 border-t border-soft first:border-t-0">
              <span className="flex w-7 flex-none justify-center">
                <Mark verdict={r.verdict} />
              </span>
              <span className="min-w-0 flex-1 text-[16px] leading-[1.35] font-medium text-pretty">{r.topicName}</span>
              <span className="flex-none text-right text-[14px] font-semibold text-body">{VERDICT[r.verdict]}</span>
            </li>
          ))}
        </ul>
        {unsure.length > 0 ? (
          <p className="m-0 text-[14px] leading-[1.45] text-body">
            {unsure.length === 1 ? `${unsure[0]!.topicName} had` : 'Some topics had'} 1 of 2 right, so Jemma checks again in the lessons.
          </p>
        ) : null}
      </section>

      <details className="group rounded-18 border border-line bg-card">
        <summary className="flex min-h-[60px] cursor-pointer list-none items-center gap-3 py-2.5 pr-3 pl-3.5 [&::-webkit-details-marker]:hidden">
          <span aria-hidden="true" className="flex size-10 flex-none items-center justify-center rounded-12 bg-soft">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#161616" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
              <path d="M14 3v5h5M9 13h6M9 17h4" />
            </svg>
          </span>
          <span className="flex min-w-0 flex-1 flex-col leading-[1.35]">
            <span className="text-[16px] font-semibold">See {name}&apos;s answers</span>
            <span className="text-[14px] text-body">
              {answers.length} questions, {dateText}
              {minutes ? `, ${minutes} minutes` : ''}
            </span>
          </span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#161616" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none group-open:rotate-90">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </summary>
        <ol className="m-0 flex list-none flex-col border-t border-soft px-4 py-1">
          {answers.map((a) => (
            <li key={a.n} className="flex flex-col gap-0.5 border-t border-soft py-3 first:border-t-0">
              <span className="text-[13px] font-semibold text-body">
                {a.n}. {a.topicName}
              </span>
              <span className="text-[16px] leading-[1.4] text-pretty">{a.prompt}</span>
              <span className={`text-[15px] font-semibold ${a.correct ? 'text-green-deep' : 'text-red-text'}`}>
                {a.skipped ? "Didn't know yet" : `${a.answer} · ${a.correct ? 'right' : 'not yet'}`}
              </span>
            </li>
          ))}
        </ol>
      </details>

      <section aria-labelledby="level-helps" className="flex flex-col gap-1.5 rounded-20 border border-line bg-card p-4">
        <h2 id="level-helps" className="m-0 text-[17px] font-semibold">
          What helps {name}
        </h2>
        <p className="m-0 text-[16px] leading-[1.45]">
          <strong className="font-semibold">Too early to tell.</strong> Jemma tries reading, pictures and listening.
        </p>
        <p className="m-0 text-[14px] text-body">Measured per topic, never a label.</p>
      </section>

      {next ? (
        <div className="flex items-center gap-3.5 rounded-18 border border-line bg-card py-4 pr-3 pl-4">
          <span aria-hidden="true" className="flex size-11 flex-none items-center justify-center rounded-12 bg-gold-tint">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#161616" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="5" width="16" height="15" rx="2" />
              <path d="M8 3v4M16 3v4M4 10h16" />
            </svg>
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 leading-[1.3]">
            <span className="text-[13px] font-bold text-red-text">First lesson</span>
            <span className="text-[17px] font-semibold text-pretty">{next.topicName}</span>
            <span className="text-[14px] leading-[1.4] text-body">{next.ready ? `Ready when ${name} is.` : 'Jemma is writing it.'}</span>
          </span>
        </div>
      ) : null}
    </div>
  )
}
