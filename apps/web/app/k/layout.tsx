import { cookies, headers } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { Sidebar, TabBar } from '@/components/blocks'
import { requireRole } from '@/lib/auth'
import { myChild } from '@/lib/data/p27'
import { initialsOf } from '@/lib/initials'
import { HANDOVER_COOKIE, handoverAllows, isOwnHandover } from '@/lib/handover'
import { isPublicPath } from '@/lib/public-paths'
import { activeTab } from '@/lib/space'
import { createSupabaseServer } from '@/lib/supabase/server'

/** Screens drawn without the tab bar: the session flow, the hand-back screen and Me (boards child-*). */
const BARE = ['/k/session', '/k/done', '/k/me']
const isBare = (pathname: string) => BARE.some((p) => pathname === p || pathname.startsWith(`${p}/`))

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
    if (isOwnHandover(handover) && !isBare(pathname)) {
      return (
        <div className="flex min-h-dvh flex-col bg-ground">
          <main className="flex-1">{children}</main>
          <Link href={`/p/${handover.childId}`} className="flex min-h-12 items-center justify-center px-5 py-3 text-center text-[15px] font-semibold text-body underline underline-offset-[3px]">
            Grown-up? Take the phone back.
          </Link>
          <TabBar role="learner" active={await activeTab('learner', '/k')} label="Practise at home" />
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
  const subtitle = `Grade ${child.grade} · ${child.private_of ? 'My own' : (child.schools?.name ?? '')}`
  const bare = isBare(pathname)

  return (
    <div className="flex min-h-dvh flex-col bg-ground lg:flex-row">
      {!bare && (
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
        {!bare && <TabBar role="learner" active={active} label={name} />}
      </div>
    </div>
  )
}
