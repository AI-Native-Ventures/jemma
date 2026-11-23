import { redirect, notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { headers } from 'next/headers'
import { Sidebar, SpaceHeader, TabBar } from '@/components/blocks'
import { requireRole } from '@/lib/auth'
import { aloneOf } from '@/lib/data/own-parent'
import { initialsOf } from '@/lib/initials'
import { activeTab } from '@/lib/space'
import { createSupabaseServer } from '@/lib/supabase/server'
import { demoOn } from '@/lib/demo-switch'

/**
 * Parent child space: header and tab bar on the phone, sidebar on the laptop.
 * A child whose school does not use Jemma (P99) has one page and nothing else to go to: no tab bar, no navigation, no bell, no school in the subtitle, and a
 * path under the child that belongs to a school (tests, snap, reports, notes) goes back to that page. The way to the children list and to the account stay.
 */
export default async function ParentChildLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ childId: string }>
}) {
  const { childId } = await params
  const { userId, profile } = await requireRole('parent')
  const supabase = await createSupabaseServer()
  const [{ count: unread }, { data: child }, alone] = await Promise.all([
    supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('read_at', null),
    supabase.from('children').select('first_name, grade, schools(name, sandbox_id)').eq('id', childId).maybeSingle(),
    aloneOf(childId),
  ])
  if (!child) notFound()

  const base = `/p/${childId}`
  if (alone && ((await headers()).get('x-pathname') ?? base).replace(/\/+$/, '') !== base) redirect(base)
  const active = await activeTab('parent', base)
  const subtitle = alone ? `Grade ${child.grade} · On their own` : `Grade ${child.grade} · ${child.schools?.name ?? ''}`
  const settingsHref = alone ? '/p/account' : `${base}/settings`
  // The list of children has a way to add another child; a parent with one child is sent straight past it, so the switch asks for the whole list.
  const switchHref = alone ? '/p?all=1' : '/p'
  const initials = initialsOf(profile.display_name)
  const only = alone ? [] : undefined

  return (
    <div className="flex min-h-dvh flex-col bg-ground lg:flex-row">
      <Sidebar
        role="parent"
        active={active}
        label={child.first_name}
        name={child.first_name}
        subtitle={subtitle}
        switchHref={switchHref}
        user={{ name: profile.display_name, initials }}
        settingsHref={settingsHref}
        base={base}
        only={only}
        notificationsHref={alone ? null : undefined}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <SpaceHeader
          name={child.first_name}
          subtitle={subtitle}
          switchHref={switchHref}
          settingsHref={settingsHref}
          avatar={child.first_name.slice(0, 1).toUpperCase()}
          demo={demoOn() && Boolean(child.schools?.sandbox_id)}
          notificationsHref={alone ? null : `${base}/notifications`}
          unread={alone ? 0 : (unread ?? 0)}
        />
        <main className="flex-1">{children}</main>
        <TabBar role="parent" active={active} label={child.first_name} base={base} only={only} />
      </div>
    </div>
  )
}
