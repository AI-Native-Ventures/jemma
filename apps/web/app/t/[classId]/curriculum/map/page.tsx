import { redirect } from 'next/navigation'
import { getCurriculum } from '@/lib/data/p30'
import { createSupabaseServer } from '@/lib/supabase/server'
import { currentTerm, mapHeadline, needsLabel, unresolved } from '../format'
import { MapEditor, type MapView } from './MapEditor'

export default async function CurriculumMapPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params
  const { map, read, docs } = await getCurriculum(classId)
  if (!map || !read) redirect(`/t/${classId}/curriculum`)

  const supabase = await createSupabaseServer()
  const { data: cls } = await supabase.from('classes').select('subject').eq('id', classId).maybeSingle()
  const subject = cls?.subject ?? ''
  const open = unresolved(read, currentTerm())
  const openChecks = new Set(open.filter((o) => o.kind === 'check').map((o) => o.name))
  const terms: MapView['terms'] = ([1, 2, 3, 4] as const).map((term) => {
    const list = read.draft.terms.find((t) => t.term === term)?.topics ?? []
    return {
      term,
      badge: open.filter((o) => o.term === term).length,
      topics: list.map((x) => ({
        name: x.name,
        needs: needsLabel(read.draft, term, x.prerequisites),
        prereqs: x.prerequisites,
        misconceptions: x.misconceptions,
        check: openChecks.has(x.name) && x.check ? x.check : null,
      })),
    }
  })
  const leftOut = open
    .filter((o) => o.kind === 'leftOut')
    .map((o) => ({ name: o.name, term: o.term, reason: read.draft.leftOut.find((l) => l.name === o.name)!.reason }))
  const initialTerm = open[0]?.term ?? currentTerm()

  return (
    <MapEditor
      view={{
        mapId: map.id,
        classId,
        grade: read.draft.grade,
        subject,
        docs: docs.map((d) => d.title),
        headline: mapHeadline(read, currentTerm()),
        draft: map.status === 'draft',
        terms,
        leftOut,
        initialTerm,
      }}
    />
  )
}
