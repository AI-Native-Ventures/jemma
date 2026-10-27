import { cookies, headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { Sidebar, TabBar } from '@/components/blocks'
import { requireRole } from '@/lib/auth'
import { initialsOf } from '@/lib/initials'
import { HANDOVER_COOKIE, handoverAllows } from '@/lib/handover'
import { activeTab } from '@/lib/space'
import { createSupabaseServer } from '@/lib/supabase/server'

/** Screens drawn without the tab bar: the session flow, the hand-back screen and Me (boards child-*). */
const BARE = ['/k/session', '/k/done', '/k/me']
const isBare = (pathname: string) => BARE.some((p) => pathname === p || pathname.startsWith(`${p}/`))

/**
 * Learner space. The phone has no top bar (each screen greets the child); the laptop gets the sidebar.
 * A parent who handed the phone over sees only that session and the hand-back screen, with no navigation.
 */
export default async function LearnerLayout({ children }: { children: ReactNode }) {
  const pathname = (await headers()).get('x-pathname') ?? '/k'
  const supabase = await createSupabaseServer()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) redirect('/sign-in')
  const { data: me } = await supabase.from('profiles').select('role').eq('user_id', auth.user.id).maybeSingle()

  if (me?.role === 'parent') {
    const handover = await handoverAllows((await cookies()).get(HANDOVER_COOKIE)?.value, pathname)
    if (!handover) redirect('/p')
    return <main className="min-h-dvh bg-ground">{children}</main>
  }

  const { userId, profile } = await requireRole('learner')
  const { data: child } = await supabase
    .from('children')
    .select('first_name, grade, schools(name)')
    .eq('user_id', userId)
    .maybeSingle()
  if (!child) notFound()

  const active = await activeTab('learner', '/k')
  const name = `${child.first_name}'s Jemma`
  const subtitle = `Grade ${child.grade} · ${child.schools?.name ?? ''}`
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
