import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { createSupabaseServer } from '@/lib/supabase/server'
import { SubHeader } from '../../beyond/_parts'
import { ActivityForm } from './ActivityForm'

export default async function ParentActivityPage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params
  await requireRole('parent')
  const supabase = await createSupabaseServer()
  const { data: child } = await supabase.from('children').select('first_name').eq('id', childId).maybeSingle()
  if (!child) notFound()
  return (
    <>
      <SubHeader back={`/p/${childId}`} backLabel="Back to profile" eyebrow={child.first_name} title="Add an activity" hideTabs />
      <ActivityForm childId={childId} name={child.first_name} />
    </>
  )
}
