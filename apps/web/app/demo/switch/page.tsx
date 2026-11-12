import { PendingButton } from '@/components/ui/Button'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { GemIcon } from '@/components/ui/icons'
import { getDemoState, type DemoRole } from '@/lib/demo'
import { hillviewPeople } from '../../../../../supabase/seed/fixtures/hillview'
import { createSupabaseServer } from '@/lib/supabase/server'
import { switchRoleAction } from '../actions'
import { Chevron, DimmedClass, ResetIcon } from '../parts'
import { CopyCode } from './CopyCode'

export const metadata: Metadata = { title: 'Demo · Switch who you are' }
export const dynamic = 'force-dynamic'

const PEOPLE: { role: DemoRole; initials: string; avatar: string; name: string; detail: string }[] = [
  { role: 'teacher', initials: 'MB', avatar: 'bg-soft-3', name: 'Ms Banda', detail: 'Teacher · 6B' },
  { role: 'parent', initials: 'TM', avatar: 'bg-coral-tint', name: 'Thandi M', detail: "Parent · Amina's mother" },
  { role: 'learner', initials: 'A', avatar: 'bg-coral-soft', name: 'Amina', detail: 'Learner · Grade 6' },
]

const NEXT: Record<number, string> = {
  1: "Next: sign in as Ms Banda, upload the curriculum and approve Jemma's topic map.",
  2: 'Next: sign in as Ms Banda, snap the memo and 5 papers, then tap Share with parents.',
  3: "Next: sign in as Thandi and link Amina with Ms Banda's class code.",
  4: "Next: sign in as Amina and run tonight's session.",
  5: "Next: see the result and the updated gaps as Ms Banda and as Thandi, then open Amina's Long view as Ms Banda.",
}

const rowBase = 'flex min-h-16 w-full items-center gap-3 rounded-[16px] bg-card py-2 pr-3.5 pl-2.5 text-left font-[inherit] text-ink no-underline'

export default async function DemoSwitchPage() {
  const demo = await getDemoState()
  if (!demo) redirect('/demo')
  const supabase = await createSupabaseServer()
  const { data: auth } = await supabase.auth.getUser()
  const { data: profile } = auth.user
    ? await supabase.from('profiles').select('role, display_name').eq('user_id', auth.user.id).maybeSingle()
    : { data: null }
  const here = profile?.role ?? null
  const hereName = profile?.display_name ?? null
  const homes = { teacher: demo.classId ? `/t/${demo.classId}` : '/demo/first-class', parent: '/p', learner: '/k' }
  const home = here ? homes[here] : '/demo'
  const empty = demo.kind === 'empty'
  const people = hillviewPeople(new Date().getUTCFullYear())
  // The three people the demo page puts first are listed first here too, then everyone else.
  const more: { person: string; initials: string; name: string; detail: string; avatar: string }[] = [
    ...people.teachers.filter((t) => t.key !== 'banda').map((t) => ({ person: `teacher:${t.key}`, initials: t.displayName.split(' ').map((w) => w.charAt(0)).join(''), name: t.displayName, detail: `Teacher · ${t.classes.join(', ')}`, avatar: 'bg-soft-3' })),
    ...people.parents.filter((p) => p.key !== 'thandi').map((p) => ({ person: `parent:${p.key}`, initials: p.displayName.split(' ').map((w) => w.charAt(0)).join(''), name: p.displayName, detail: `Parent · ${p.children.map((c) => c.name).join(' and ')}`, avatar: 'bg-coral-tint' })),
    ...people.learners.flatMap((g) => (g.classKey.startsWith('6b') && g.classKey !== '6b-maths' ? [] : g.names.filter((n) => n !== 'Amina').map((n) => ({ person: `learner:${n}`, initials: n.charAt(0), name: n, detail: `Learner · ${g.classKey.startsWith('6b') ? '6B' : g.className.split(' ')[0]}`, avatar: 'bg-coral-soft' })))),
  ]

  return (
    <DimmedClass className={demo.className} grade={demo.grade} schoolName={demo.schoolName}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="switch"
        className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[92dvh] max-w-[390px] flex-col gap-4 overflow-y-auto rounded-t-[28px] bg-ground px-5 pt-2.5 pb-[30px] shadow-[0_-10px_30px_rgba(31,29,54,0.18)]"
      >
        <span aria-hidden="true" className="h-[5px] w-11 self-center rounded-pill bg-edge" />
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-coral-tint py-[5px] pr-3 pl-[9px] text-[13px] font-bold">
            <GemIcon size={11} />
            Demo · your own copy
          </span>
          <a href={home} aria-label="Close" className="flex size-11 items-center justify-center rounded-12 text-ink">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </a>
        </div>
        <div className="flex flex-col gap-1">
          <h2 id="switch" className="m-0 text-[24px] leading-[1.2] font-semibold tracking-[-0.01em]">Switch who you are</h2>
          <p className="m-0 text-[15px] leading-[1.45] text-body">Same made-up school. What you do as one person shows up for the others.</p>
        </div>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {(empty ? [{ role: 'teacher' as DemoRole, initials: 'Y', avatar: 'bg-soft-3', name: 'You', detail: 'Teacher · your empty school' }] : PEOPLE).map((p) => {
            const current = p.role === here && p.name === hereName
            const body = (
              <>
                <span aria-hidden="true" className={`relative flex size-[42px] flex-none items-center justify-center rounded-pill text-[14px] font-bold ${p.avatar}`}>{p.initials}</span>
                <span className="flex min-w-0 flex-1 flex-col leading-[1.3]">
                  <span className="text-[17px] font-semibold">{p.name}</span>
                  <span className="text-[14px] text-body">{p.detail}</span>
                </span>
                {current ? (
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m5 12.5 4.5 4.5L19 7.5" />
                    </svg>
                    You&apos;re here
                  </span>
                ) : (
                  <Chevron />
                )}
              </>
            )
            return (
              <li key={p.role}>
                {current ? (
                  <a href={home} aria-current="true" className={`${rowBase} border-2 border-ink`}>{body}</a>
                ) : (
                  <form action={switchRoleAction}>
                    <input type="hidden" name="role" value={p.role} />
                    <PendingButton type="submit" className={`${rowBase} cursor-pointer border border-line`}>{body}</PendingButton>
                  </form>
                )}
              </li>
            )
          })}
        </ul>
        {empty || more.length === 0 ? null : (
          <section aria-labelledby="more-people" className="flex flex-col gap-2">
            <h3 id="more-people" className="m-0 text-[15px] font-semibold">More people at Hillview</h3>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {more.map((p) => {
                const current = p.name === hereName
                const body = (
                  <>
                    <span aria-hidden="true" className={`relative flex size-[42px] flex-none items-center justify-center rounded-pill text-[14px] font-bold ${p.avatar}`}>{p.initials}</span>
                    <span className="flex min-w-0 flex-1 flex-col leading-[1.3]">
                      <span className="text-[17px] font-semibold">{p.name}</span>
                      <span className="text-[14px] text-body">{p.detail}</span>
                    </span>
                    {current ? <span className="text-[13px] font-semibold">You&apos;re here</span> : <Chevron />}
                  </>
                )
                return (
                  <li key={p.person}>
                    {current ? (
                      <a href={home} aria-current="true" className={`${rowBase} border-2 border-ink`}>{body}</a>
                    ) : (
                      <form action={switchRoleAction}>
                        <input type="hidden" name="person" value={p.person} />
                        <PendingButton type="submit" className={`${rowBase} cursor-pointer border border-line`}>{body}</PendingButton>
                      </form>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )}
        {empty ? (
          <p className="m-0 rounded-18 border border-line bg-card p-4 text-[15px] leading-[1.45]">
            This is an empty school. Make a class, then tap Add made-up learners on its learners screen.
          </p>
        ) : (
        <section aria-labelledby="path" className="flex flex-col gap-2.5 rounded-18 border border-line bg-card p-4">
          <div className="flex items-baseline justify-between">
            <h3 id="path" className="m-0 text-[15px] font-semibold">Demo path</h3>
            <span className="text-[14px] text-body">{`Step ${demo.step} of 5`}</span>
          </div>
          <span aria-hidden="true" className="grid grid-cols-5 gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <span key={n} className={`h-1.5 rounded-pill ${n < demo.step ? 'bg-ink' : n === demo.step ? 'bg-coral' : 'bg-soft-3'}`} />
            ))}
          </span>
          <p className="m-0 text-[15px] leading-[1.45]">{NEXT[demo.step]}</p>
          <div className="flex items-center gap-2.5">
            <span className="flex h-12 flex-1 items-center rounded-12 bg-soft-2 px-3.5 text-[20px] font-bold tracking-[0.14em]">{demo.joinCode}</span>
            <CopyCode code={demo.joinCode} />
          </div>
        </section>
        )}
        <div className="grid grid-cols-2 gap-2">
          <a href="/demo" className="flex h-12 items-center justify-center rounded-14 border-[1.5px] border-ink bg-card text-[16px] font-semibold text-ink no-underline">Demo page</a>
          <a href="/demo/reset" className="flex h-12 items-center justify-center gap-1.5 rounded-14 border-[1.5px] border-ink bg-card text-[16px] font-semibold text-ink no-underline">
            <ResetIcon size={18} />
            Reset demo
          </a>
        </div>
      </section>
    </DimmedClass>
  )
}
