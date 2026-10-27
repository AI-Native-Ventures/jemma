import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { Sidebar, SpaceHeader, TabBar } from '@/components/blocks'
import { requireRole } from '@/lib/auth'
import { activeTab } from '@/lib/space'
import { createSupabaseServer } from '@/lib/supabase/server'

/** Parent child space: header and tab bar on the phone, sidebar on the laptop. */
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
  const { count: unread } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null)
  const { data: child } = await supabase
    .from('children')
    .select('first_name, grade, schools(name, sandbox_id)')
    .eq('id', childId)
    .maybeSingle()
  if (!child) notFound()

  const base = `/p/${childId}`
  const active = await activeTab('parent', base)
  const subtitle = `Grade ${child.grade} · ${child.schools?.name ?? ''}`
  const settingsHref = `${base}/settings`
  const initials = profile.display_name.slice(0, 2).toUpperCase()

  return (
    <div className="flex min-h-dvh flex-col bg-ground lg:flex-row">
      <Sidebar
        role="parent"
        active={active}
        label={child.first_name}
        name={child.first_name}
        subtitle={subtitle}
        switchHref="/p"
        user={{ name: profile.display_name, initials }}
        settingsHref={settingsHref}
        base={base}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <SpaceHeader
          name={child.first_name}
          subtitle={subtitle}
          switchHref="/p"
          settingsHref={settingsHref}
          avatar={child.first_name.slice(0, 1).toUpperCase()}
          demo={Boolean(child.schools?.sandbox_id)}
          notificationsHref={`${base}/notifications`}
          unread={unread ?? 0}
        />
        <main className="flex-1">{children}</main>
        <TabBar role="parent" active={active} label={child.first_name} base={base} />
      </div>
    </div>
  )
}
