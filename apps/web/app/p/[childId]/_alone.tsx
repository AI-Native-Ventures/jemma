import { rowScore } from '@/app/k/maths/format'
import type { AloneSummary } from '@/lib/data/own-parent'
import { chipLabel } from '@/lib/own-grades'
import type { LevelCheckSummary } from '@/lib/data/level'
import { startLevelCheckFor } from './learn/handover/own-actions'
import { LevelCheckCard } from './learn/LevelCheckCard'
import { OwnPracticeCard } from './learn/OwnPracticeCard'
import { SignInCard } from './SignInCard'

/**
 * The page of a child whose school does not use Jemma, for the parent who added them (P99). It is the whole of the child's space: the name, "Practising
 * on their own", the button that hands over the phone for the child's own practice, what the child has practised so far, and the sign-in code. There is
 * no school, no class, no teacher and no test a teacher shared, so none of the lines of a school child's profile are here. One column on the phone;
 * the same column in the middle of the page on a laptop.
 */
export function AloneChildPage({ summary, level = null }: { summary: AloneSummary; level?: LevelCheckSummary | null }) {
  const { id, firstName: name, grade, grades, loginCode, ownLogin } = summary
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-5 px-5 pt-3.5 pb-8 leading-[normal] lg:px-10 lg:pt-8">
      <div className="flex flex-col gap-2">
        <p className="m-0 text-[14px] font-semibold text-body">Practising on their own</p>
        <div className="flex items-start gap-2.5">
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="mt-3 flex-none">
            <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FFB81C" />
          </svg>
          <h1 className="m-0 text-[28px] leading-[1.18] font-semibold tracking-[-0.015em] text-pretty">{name}</h1>
        </div>
        <p className="m-0 ml-6 text-[15px] text-body">Grade {grade}</p>
      </div>

      {/* P163: the level check, until the child has practised (then what it found, once it is done). */}
      {level ? <LevelCheckCard childId={id} name={name} summary={level} start={startLevelCheckFor.bind(null, id)} /> : null}

      <OwnPracticeCard childId={id} name={name} alone />

      <section aria-labelledby="alone-grades" className="flex flex-col gap-1 rounded-20 border border-line bg-card px-4 pt-3.5 pb-2">
        <h2 id="alone-grades" className="m-0 mb-1 text-[17px] font-semibold">
          What {name} has practised
        </h2>
        {grades.length === 0 ? (
          <p className="m-0 pb-2 text-[15px] leading-[1.45] text-body">Nothing yet. Practise at home with {name} to start.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {grades.map((g) => (
              <li key={g.classId} className="flex min-h-[54px] items-center justify-between gap-3 border-t border-soft first:border-t-0">
                <span className="min-w-0 text-[16px] font-semibold text-pretty">{chipLabel({ classId: g.classId, grade: g.grade, caps: g.caps, name: g.name })}</span>
                <span className="flex-none text-[15px] text-body">{rowScore(g.score)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {ownLogin ? (
        <section aria-labelledby="alone-own-login" className="flex flex-col gap-1 rounded-20 border border-line bg-card p-4 leading-[normal]">
          <h2 id="alone-own-login" className="m-0 text-[17px] font-semibold">
            {name}&apos;s sign-in
          </h2>
          <p className="m-0 text-[14px] leading-[1.45] text-body">{name} signs in with their own account, so there is no code for you to make.</p>
        </section>
      ) : (
        <SignInCard childId={id} name={name} code={loginCode} />
      )}
    </div>
  )
}
