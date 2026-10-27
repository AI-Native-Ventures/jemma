import { notFound } from 'next/navigation'
import { asKind, KIND_LABEL } from '@/lib/data/p32'
import { createSupabaseServer } from '@/lib/supabase/server'
import { PhotoScreen } from './PhotoScreen'

/** parent-snap-photo: the camera. Full screen, so it covers the space header and tab bar. */
export default async function SnapPhotoPage({
  params,
  searchParams,
}: {
  params: Promise<{ childId: string }>
  searchParams: Promise<{ kind?: string }>
}) {
  const { childId } = await params
  const kind = asKind((await searchParams).kind)
  const supabase = await createSupabaseServer()
  const { data: child } = await supabase.from('children').select('first_name').eq('id', childId).maybeSingle()
  if (!child) notFound()
  return <PhotoScreen childId={childId} kind={kind} kindLabel={KIND_LABEL[kind]} childName={child.first_name} />
}
