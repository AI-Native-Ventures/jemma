import type { JemmaDb } from '@jemma/profiling/db'
import { allowedFamilies } from '@jemma/profiling/imports'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { getRecentFiles, personName } from '@/lib/data/p66'
import { createSupabaseServer } from '@/lib/supabase/server'
import { BackHeader } from '../../tests/back-header'
import { RecordsClient } from './RecordsClient'
import { SAMPLE_RECORDS, type SampleName } from './samples'

/**
 * "Add past records": a teacher brings in old results so the Long view can show a pattern over many terms.
 * Three ways: a .csv file, a pasted table, or one typed result. Nothing is added until the teacher has checked it.
 */
export default async function AddPastRecordsPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params
  const { userId } = await requireRole('teacher')
  const db = (await createSupabaseServer()) as unknown as JemmaDb
  const { data: cls } = await db.from('classes').select('name, subject, grade, year, teacher_id, schools(sandbox_id)').eq('id', classId).maybeSingle()
  // A colleague who shares a learner can see the class, but only its own teacher brings records in.
  if (!cls || cls.teacher_id !== userId) notFound()
  const { data: enrolled } = await db.from('enrolments').select('children(id, first_name, last_name, created_at)').eq('class_id', classId)
  const learners = (enrolled ?? [])
    .flatMap((e) => (e.children ? [e.children] : []))
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .map((k) => ({ id: k.id, name: personName(k) }))
  const [families, recent] = await Promise.all([allowedFamilies(db, classId, cls.subject), getRecentFiles(classId)])
  const demo = Boolean(cls.schools?.sandbox_id)
  const samples = demo ? (Object.keys(SAMPLE_RECORDS) as SampleName[]).map((name) => ({ name, button: SAMPLE_RECORDS[name].button, about: SAMPLE_RECORDS[name].about })) : []

  return (
    <div className="leading-[normal] lg:max-w-[1100px]">
      <BackHeader href={`/t/${classId}/learners`} backLabel="Back to learners" eyebrow={cls.name} title="Add past records" />
      <div className="flex flex-col gap-[18px] px-5 pt-2 pb-6 lg:px-8">
        <h1 className="sr-only">Add past records</h1>
        <RecordsClient
          classId={classId}
          classTitle={cls.name}
          subject={cls.subject}
          grade={cls.grade}
          year={cls.year}
          learners={learners}
          families={families}
          samples={samples}
          recent={recent}
        />
      </div>
    </div>
  )
}
