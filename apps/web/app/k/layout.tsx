import { cookies, headers } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { Sidebar, TabBar } from '@/components/blocks'
import { requireRole } from '@/lib/auth'
import { isOwnRecord } from '@jemma/profiling/own-names'
import { myChild } from '@/lib/data/p27'
import { initialsOf } from '@/lib/initials'
import { HANDOVER_COOKIE, handoverAllows, isOwnHandover } from '@/lib/handover'
import { isPublicPath } from '@/lib/public-paths'
import { activeTab } from '@/lib/space'
import { createSupabaseServer } from '@/lib/supabase/server'

/** Screens drawn without the tab bar: the session flow and the hand-back screen. */
const NO_BAR = ['/k/session', '/k/done']
/** Screens drawn without the laptop sidebar: those, and Me (boards child-*). Me has the phone's bar, where it is the third tab. */
const NO_SIDEBAR = [...NO_BAR, '/k/me']
const under = (list: string[], pathname: string) => list.some((p) => pathname === p || pathname.startsWith(`${p}/`))

/**
 * Learner space. The phone has no top bar (each screen greets the child); the laptop gets the sidebar.
 * A parent who handed the phone over for one session sees only that session and the hand-back screen, with no navigation. A parent who handed it
 * over for the learner's own practice ("Practise at home") shows the learner's own screens with the tab bar, and a link that takes the phone back.
 */
export default async function LearnerLayout({ children }: { children: ReactNode }) {
  const pathname = (await headers()).get('x-pathname') ?? '/k'
  const supabase = await createSupabaseServer()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) {
    // The learner sign-in screen is the one page of the space a signed-out child can open.
    if (isPublicPath(pathname)) return <>{children}</>
    redirect('/sign-in')
  }
  const { data: me } = await supabase.from('profiles').select('role').eq('user_id', auth.user.id).maybeSingle()

  if (me?.role === 'parent') {
    const handover = await handoverAllows((await cookies()).get(HANDOVER_COOKIE)?.value, pathname)
    if (!handover) redirect('/p')
    if (isOwnHandover(handover) && !under(NO_SIDEBAR, pathname)) {
      return (
        <div className="flex min-h-dvh flex-col bg-ground">
          <main className="flex-1">{children}</main>
          <Link href={`/p/${handover.childId}`} className="flex min-h-12 items-center justify-center px-5 py-3 text-center text-[15px] font-semibold text-body underline underline-offset-[3px]">
            Grown-up? Take the phone back.
          </Link>
          {/* The account page (Me) is not theirs to open, and My maths is the one page there is besides it (P128): the bar is the one tab, My maths, so
              a screen below it (a part, the learner's own work) is one tap from the page. */}
          <TabBar role="learner" active={await activeTab('learner', '/k')} label="Practise at home" only={['maths']} />
        </div>
      )
    }
    return <main className="min-h-dvh bg-ground">{children}</main>
  }

  const { profile } = await requireRole('learner')
  // The child of the workspace on screen: the school child, or the private twin when the learner chose "My own" (a learner with a private
  // workspace has two children with the one login).
  const { child } = await myChild()

  const active = await activeTab('learner', '/k')
  const name = `${child.first_name}'s Jemma`
  const subtitle = `Grade ${child.grade} · ${isOwnRecord(child) ? 'My own' : (child.schools?.name ?? '')}`
  const noSidebar = under(NO_SIDEBAR, pathname)
  const noBar = under(NO_BAR, pathname)

  return (
    <div className="flex min-h-dvh flex-col bg-ground lg:flex-row">
      {!noSidebar && (
        <Sidebar
          role="learner"
          active={active}
          label={name}
          name={name}
          subtitle={subtitle}
          switchHref="/k"
          user={{ name: profile.display_name, initials: initialsOf(profile.display_name) }}
          settingsHref="/k/me"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1">{children}</main>
        {!noBar && <TabBar role="learner" active={active} label={name} />}
      </div>
    </div>
  )
}
