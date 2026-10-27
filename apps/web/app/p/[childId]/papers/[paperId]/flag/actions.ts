'use server'

import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'

/**
 * A parent says a mark looks wrong: opens a `check_answer` Needs you item for the class teacher.
 * The result is read through RLS first, so only a parent who can see the child can flag. The insert uses
 * the service client because parents have no insert policy on `needs_you_items`.
 */
export async function flagMark(resultId: string, note: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { userId } = await requireRole('parent')
  const text = note.trim().slice(0, 500)
  if (!text) return { ok: false, reason: 'Tell the teacher what you see first.' }

  const supabase = await createSupabaseServer()
  const { data: result } = await supabase.from('question_results').select('id, n, prompt, child_id, paper_id').eq('id', resultId).maybeSingle()
  if (!result) return { ok: false, reason: 'We could not find that question.' }
  const { data: paper } = await supabase.from('papers').select('id, test_id').eq('id', result.paper_id).maybeSingle()
  const { data: child } = await supabase.from('children').select('first_name, school_id').eq('id', result.child_id).maybeSingle()
  if (!paper?.test_id || !child) return { ok: false, reason: 'We could not find that paper.' }
  const { data: test } = await supabase.from('tests').select('class_id').eq('id', paper.test_id).maybeSingle()
  const { data: klass } = test ? await supabase.from('classes').select('teacher_id').eq('id', test.class_id).maybeSingle() : { data: null }
  if (!klass) return { ok: false, reason: 'We could not find the teacher.' }

  const { error } = await createSupabaseAdmin().from('needs_you_items').insert({
    owner_id: klass.teacher_id,
    school_id: child.school_id,
    child_id: result.child_id,
    kind: 'check_answer',
    ref_id: paper.id,
    title: `Check ${child.first_name}'s question ${result.n}`,
    detail: `A parent thinks this mark is wrong (${result.prompt}): ${text}`,
  })
  if (error) return { ok: false, reason: 'Something went wrong. Try again.' }
  void userId
  return { ok: true }
}

export async function sendFlag(childId: string, paperId: string, resultId: string, formData: FormData): Promise<void> {
  const res = await flagMark(resultId, String(formData.get('what') ?? ''))
  if (!res.ok) redirect(`/p/${childId}/papers/${paperId}/flag?q=${resultId}&error=${encodeURIComponent(res.reason)}`)
  redirect(`/p/${childId}/papers/${paperId}?flagged=1`)
}
