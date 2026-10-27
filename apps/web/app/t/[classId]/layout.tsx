import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { Sidebar, SpaceHeader, TabBar } from '@/components/blocks'
import { requireRole } from '@/lib/auth'
import { activeTab } from '@/lib/space'
import { createSupabaseServer } from '@/lib/supabase/server'

/** Teacher class space: header and tab bar on the phone, sidebar on the laptop. */
export default async function TeacherClassLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ classId: string }>
}) {
  const { classId } = await params
  const { profile } = await requireRole('teacher')
  const supabase = await createSupabaseServer()
  const { data: cls } = await supabase
    .from('classes')
    .select('name, grade, schools(name, sandbox_id)')
    .eq('id', classId)
    .maybeSingle()
  if (!cls) notFound()

  const base = `/t/${classId}`
  const active = await activeTab('teacher', base)
  const subtitle = `Grade ${cls.grade} · ${cls.schools?.name ?? ''}`
  const settingsHref = `${base}/settings`
  const initials = profile.display_name.slice(0, 2).toUpperCase()

  return (
    <div className="flex min-h-dvh flex-col bg-ground lg:flex-row">
      <Sidebar
        role="teacher"
        active={active}
        label={cls.name}
        name={cls.name}
        subtitle={subtitle}
        switchHref="/t"
        user={{ name: profile.display_name, initials }}
        settingsHref={settingsHref}
        base={base}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <SpaceHeader
          name={cls.name}
          subtitle={subtitle}
          switchHref="/t"
          settingsHref={settingsHref}
          demo={Boolean(cls.schools?.sandbox_id)}
        />
        <main className="flex-1">{children}</main>
        <TabBar role="teacher" active={active} label={cls.name} base={base} />
      </div>
    </div>
  )
}
