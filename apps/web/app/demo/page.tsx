import type { Metadata } from 'next'
import { hillviewPeople } from '../../../../supabase/seed/fixtures/hillview'
import { getDemoState } from '@/lib/demo'
import { tryDemoAction } from './actions'
import { PersonButton } from './PersonButton'
import { PersonChip } from './PersonChip'
import { Chevron, ResetIcon } from './parts'
import { StartedAt } from './StartedAt'

export const metadata: Metadata = { title: 'Try the demo' }
export const dynamic = 'force-dynamic'

const PEOPLE = [
  { role: 'teacher', initials: 'MB', avatar: 'bg-soft-3', name: 'Ms Banda', detail: 'Teacher · Grade 6 Mathematics', start: true },
  { role: 'parent', initials: 'TM', avatar: 'bg-coral-tint', name: 'Thandi M', detail: "Parent · Amina's mother", start: false },
  { role: 'learner', initials: 'A', avatar: 'bg-coral-soft', name: 'Amina', detail: 'Learner · Grade 6', start: false },
] as const

/** The three people above the fold are not listed again. Amina is one of the five learners of 6B. */
const BIG_THREE = new Set(['Ms Banda', 'Thandi M', 'Amina'])

function MorePeople({ year }: { year: number }) {
  const people = hillviewPeople(year)
  const teachers = people.teachers.filter((t) => !BIG_THREE.has(t.displayName))
  const parents = people.parents.filter((p) => !BIG_THREE.has(p.displayName))
  const heading = 'm-0 text-[14px] font-semibold text-body'
  return (
    <section aria-labelledby="more" className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1">
        <h2 id="more" className="m-0 text-[17px] font-semibold">More people at Hillview</h2>
        <p className="m-0 text-[15px] leading-[1.45] text-body text-pretty">
          Three teachers, four Mathematics classes and 23 learners, across Grades 4 to 7. Tap anyone to sign in as them in your own copy.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className={heading}>Teachers</h3>
        {teachers.map((t) => (
          <form key={t.key} action={tryDemoAction} className="contents">
            <input type="hidden" name="person" value={`teacher:${t.key}`} />
            <PersonChip variant="row" name={t.displayName} detail={`Teacher · ${t.classes.join(', ')}`} />
          </form>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className={heading}>Parents</h3>
        {parents.map((p) => (
          <form key={p.key} action={tryDemoAction} className="contents">
            <input type="hidden" name="person" value={`parent:${p.key}`} />
            <PersonChip variant="row" name={p.displayName} detail={`Parent · ${p.children.map((c) => `${c.name} (Grade ${c.grade})`).join(', ')}`} />
          </form>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <h3 className={heading}>Learners, by class</h3>
        {people.learners.map((g) => {
          const names = g.names.filter((n) => !BIG_THREE.has(n))
          return (
            <div key={g.classKey} className="flex flex-col gap-2">
              <p className="m-0 text-[14px] text-body">{g.classKey === '6b-maths' ? '6B Mathematics: Amina is above, with her four classmates' : g.className}</p>
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {names.map((n) => (
                  <li key={n}>
                    <form action={tryDemoAction} className="contents">
                      <input type="hidden" name="person" value={`learner:${n}`} />
                      <PersonChip variant="chip" name={n} />
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}

const STEPS = [
  ['Teacher:', " upload the curriculum, approve Jemma's topic map."],
  ['Teacher:', ' snap the memo and 5 papers. Use the sample papers if you have none. Then tap Share with parents.'],
  ['Parent:', ' link Amina with '],
  ['Amina:', " run tonight's session."],
  ['Teacher and parent:', " see the result, the updated gaps and Amina's Long view."],
] as const

function Wordmark() {
  return (
    <svg viewBox="4 12 236 92" width="100" height="39" role="img" aria-label="jemma" className="block">
      <path d="M32 46 V80 C32 91 24 95 13 93" fill="none" stroke="#1F1D36" strokeWidth="9.5" strokeLinecap="round" />
      <polygon points="32,19 40,27 32,35 24,27" fill="#FF6A4D" />
      <text x="43" y="80" fill="#1F1D36" fontFamily="inherit" fontSize="66" fontWeight="700">emma</text>
    </svg>
  )
}

export default async function DemoPage() {
  const demo = await getDemoState()
  return (
    <div className="mx-auto flex min-h-dvh max-w-[390px] flex-col bg-ground font-sans leading-[normal] text-ink lg:max-w-[480px]">
      <header className="flex items-center justify-between px-5 pt-5 pb-1">
        <Wordmark />
        <span className="rounded-pill bg-soft-4 px-3 py-1.5 text-[13px] font-semibold text-ink">Demo for judges</span>
      </header>
      <main className="flex flex-col gap-[22px] px-5 pt-[18px] pb-7">
        <div className="flex flex-col gap-2.5">
          <h1 className="m-0 text-[36px] leading-[1.08] font-bold tracking-[-0.02em]">Try the demo</h1>
          <p className="m-0 text-[17px] leading-[1.45] text-body text-pretty">
            You get your own copy of Hillview Primary, a made-up school. It has teachers, parents and learners in several grades. Sign in as any of them. Nothing you do reaches other judges.
          </p>
        </div>

        <section aria-labelledby="signin-as" className="flex flex-col gap-2.5">
          <h2 id="signin-as" className="m-0 text-[15px] font-semibold text-body">Sign in as</h2>
          {PEOPLE.map((p) => (
            <form key={p.role} action={tryDemoAction} className="contents">
              <input type="hidden" name="role" value={p.role} />
              <PersonButton className="flex min-h-[72px] w-full cursor-pointer items-center gap-3.5 rounded-18 border border-line bg-card py-3.5 pr-3.5 pl-4 text-left font-[inherit] text-ink no-underline" chevron={<Chevron />}>
                <span aria-hidden="true" className={`flex size-11 flex-none items-center justify-center rounded-pill text-[15px] font-bold ${p.avatar}`}>{p.initials}</span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[17px] font-semibold">{p.name}</span>
                  <span className="text-[14px] text-body group-aria-busy:hidden">{p.detail}</span>
                  <span role="status" className="hidden text-[14px] text-body group-aria-busy:block">Opening your copy of Hillview Primary</span>
                </span>
                {p.start ? <span className="flex-none rounded-pill bg-coral px-2.5 py-[5px] text-[12px] font-semibold text-ink group-aria-busy:hidden">Start here</span> : null}
              </PersonButton>
            </form>
          ))}
        </section>

        <MorePeople year={new Date().getUTCFullYear()} />

        <section aria-labelledby="empty" className="flex flex-col gap-3 rounded-20 border border-line bg-card p-[18px]">
          <div className="flex flex-col gap-1">
            <h2 id="empty" className="m-0 text-[17px] font-semibold">Start from an empty school</h2>
            <p className="m-0 text-[15px] leading-[1.45] text-body text-pretty">
              A school with no class and one teacher, you. Make a Mathematics class in any grade, then fill it with made-up learners and their history in one tap.
            </p>
          </div>
          <form action={tryDemoAction} className="contents">
            <input type="hidden" name="start" value="empty" />
            <PersonChip variant="row" name="Start from an empty school" detail="You are the teacher" busy="Making your empty school" />
          </form>
        </section>

        <section aria-labelledby="path" className="rounded-20 border border-line bg-card px-[18px] pt-[18px] pb-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="path" className="m-0 text-[17px] font-semibold">The demo path</h2>
            <span className="text-[14px] text-body">About 10 minutes</span>
          </div>
          <ol className="m-0 mt-2.5 flex list-none flex-col p-0">
            {STEPS.map(([who, what], i) => (
              <li key={i} className="flex items-start gap-3 border-t border-soft py-3">
                <span className="flex size-[26px] flex-none items-center justify-center rounded-pill bg-ink text-[13px] font-semibold text-white">{i + 1}</span>
                <span className="pt-0.5 text-[15px] leading-[1.4]">
                  <strong className="font-semibold">{who}</strong>
                  {what}
                  {i === 2 ? (
                    <>
                      {demo ? (
                        <>
                          class code <span className="inline-block rounded-md bg-coral-tint px-1.5 font-bold tracking-[0.08em]">{demo.joinCode}</span>
                        </>
                      ) : (
                        "Ms Banda's class code"
                      )}
                      , then open her profile.
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="reset" className="flex flex-col gap-3 rounded-20 border border-line bg-card p-[18px]">
          <div className="flex flex-col gap-1">
            <h2 id="reset" className="m-0 text-[17px] font-semibold">Start over</h2>
            <p className="m-0 text-[15px] leading-[1.45] text-body text-pretty">
              Reset puts your copy back to step 1 with fresh sample papers. It takes about 10 seconds and only changes your copy.
            </p>
          </div>
          <a href="/demo/reset" className="flex h-12 items-center justify-center gap-2 rounded-14 border-[1.5px] border-ink bg-card text-[16px] font-semibold text-ink no-underline">
            <ResetIcon size={20} />
            Reset demo
          </a>
          {demo ? <p className="m-0 text-[13px] text-body"><StartedAt iso={demo.startedAt} /></p> : null}
        </section>

        <p className="m-0 flex items-center gap-2 text-[14px] text-body">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="flex-none">
            <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" />
          </svg>
          Every person and paper here is made up.
        </p>
      </main>
    </div>
  )
}
