import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { Sidebar, TabBar } from '@/components/blocks'
import { requireRole } from '@/lib/auth'
import { activeTab } from '@/lib/space'
import { createSupabaseServer } from '@/lib/supabase/server'

/** Learner space. The phone has no top bar (each screen greets the child); the laptop gets the sidebar. */
export default async function LearnerLayout({ children }: { children: ReactNode }) {
  const { userId, profile } = await requireRole('learner')
  const supabase = await createSupabaseServer()
  const { data: child } = await supabase
    .from('children')
    .select('first_name, grade, schools(name)')
    .eq('user_id', userId)
    .maybeSingle()
  if (!child) notFound()

  const active = await activeTab('learner', '/k')
  const name = `${child.first_name}'s Jemma`
  const subtitle = `Grade ${child.grade} · ${child.schools?.name ?? ''}`

  return (
    <div className="flex min-h-dvh flex-col bg-ground lg:flex-row">
      <Sidebar
        role="learner"
        active={active}
        label={name}
        name={name}
        subtitle={subtitle}
        switchHref="/k"
        user={{ name: profile.display_name, initials: profile.display_name.slice(0, 2).toUpperCase() }}
        settingsHref="/k/me"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1">{children}</main>
        <TabBar role="learner" active={active} label={name} />
      </div>
    </div>
  )
}
