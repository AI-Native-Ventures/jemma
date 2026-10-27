import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'

export type FoundClass = {
  classId: string
  className: string
  grade: number
  schoolName: string
  teacherId: string
  teacherName: string
}

export type Consent = { guardian: boolean; teach: boolean; improve: boolean }

/** Class codes are 6 letters and numbers; people type them in any case with stray spaces. */
export const cleanCode = (raw: string | null | undefined): string => (raw ?? '').replace(/\s+/g, '').toUpperCase()

/**
 * Finds a class from its code. Reads with the service role because a parent cannot see a class before the
 * teacher approves them; it returns the class card only, never anything about a child.
 */
export async function findClass(code: string): Promise<FoundClass | null> {
  const clean = cleanCode(code)
  if (clean.length !== 6) return null
  const db = createSupabaseAdmin()
  const { data: cls } = await db
    .from('classes')
    .select('id, name, grade, teacher_id, schools(name)')
    .eq('join_code', clean)
    .maybeSingle()
  if (!cls) return null
  const { data: teacher } = await db.from('profiles').select('display_name').eq('user_id', cls.teacher_id).maybeSingle()
  return {
    classId: cls.id,
    className: cls.name,
    grade: cls.grade,
    schoolName: cls.schools?.name ?? '',
    teacherId: cls.teacher_id,
    teacherName: teacher?.display_name ?? 'the teacher',
  }
}

/** The one child in the class with this first name (any case), or null when none or more than one. */
export async function findChildInClass(classId: string, childName: string): Promise<{ id: string; firstName: string } | null> {
  const name = childName.trim().toLowerCase()
  if (!name) return null
  const db = createSupabaseAdmin()
  const { data } = await db.from('enrolments').select('children(id, first_name)').eq('class_id', classId)
  const hits = (data ?? []).flatMap((e) => (e.children && e.children.first_name.toLowerCase() === name ? [e.children] : []))
  return hits.length === 1 ? { id: hits[0]!.id, firstName: hits[0]!.first_name } : null
}

export type RequestResult = { ok: true; linkId: string } | { ok: false; reason: string }

/**
 * Records the parent's request (pending, with the ticks) and puts an "approve link" item in the teacher's Needs you.
 * The parent sees nothing about the child until the teacher approves: only the pending row exists for them.
 */
export async function createLinkRequest(
  parent: { userId: string; displayName: string },
  input: { code: string; childName: string; consent: Consent },
): Promise<RequestResult> {
  if (!input.consent.guardian || !input.consent.teach) return { ok: false, reason: 'Tick the two boxes marked Needed.' }
  const cls = await findClass(input.code)
  if (!cls) return { ok: false, reason: 'No class has that code. Check it with the teacher.' }
  const child = await findChildInClass(cls.classId, input.childName)
  if (!child) return { ok: false, reason: `${cls.teacherName}'s class has no one called ${input.childName.trim() || 'that'}. Check the spelling.` }

  const db = createSupabaseAdmin()
  const { data: existing } = await db
    .from('parent_links')
    .select('id, status')
    .eq('parent_id', parent.userId)
    .eq('child_id', child.id)
    .maybeSingle()
  if (existing?.status === 'approved' || existing?.status === 'pending') return { ok: true, linkId: existing.id }

  const consent = { guardian: true, teach: true, improve: input.consent.improve }
  let linkId: string
  if (existing) {
    const { error } = await db.from('parent_links').update({ status: 'pending', consent, decided_at: null }).eq('id', existing.id)
    if (error) return { ok: false, reason: 'Could not send the request. Try again.' }
    linkId = existing.id
  } else {
    const { data, error } = await db
      .from('parent_links')
      .insert({ parent_id: parent.userId, child_id: child.id, class_id: cls.classId, status: 'pending', consent })
      .select('id')
      .single()
    if (error) return { ok: false, reason: 'Could not send the request. Try again.' }
    linkId = data.id
  }
  const { data: classRow } = await db.from('classes').select('school_id').eq('id', cls.classId).single()
  if (classRow) {
    await db.from('needs_you_items').insert({
      owner_id: cls.teacherId,
      school_id: classRow.school_id,
      child_id: child.id,
      kind: 'approve_link',
      ref_id: linkId,
      title: `${parent.displayName} wants to see ${child.firstName}'s work`,
      detail: `New parent · code ${cleanCode(input.code)}`,
    })
  }
  return { ok: true, linkId }
}

export type ChildCard = {
  id: string
  firstName: string
  grade: number
  schoolName: string
  needs: number
  /** Tonight's planned session, for the card's second line. */
  tonight: { topic: string; minutes: number | null } | null
}

export type ParentHome =
  | { kind: 'children'; children: ChildCard[] }
  | { kind: 'pending' }
  | { kind: 'none' }

/** What `/p` shows for this parent, read through RLS (children appear only once a link is approved). */
export async function getParentHome(userId: string): Promise<ParentHome> {
  const supabase = await createSupabaseServer()
  const { data: kids } = await supabase
    .from('children')
    .select('id, first_name, grade, schools(name)')
    .order('first_name')
  if (kids && kids.length > 0) {
    const ids = kids.map((k) => k.id)
    const today = new Date().toISOString().slice(0, 10)
    const [{ data: needs }, { data: sessions }] = await Promise.all([
      supabase.from('needs_you_items').select('child_id').eq('owner_id', userId).eq('status', 'open').in('child_id', ids),
      supabase
        .from('sessions')
        .select('child_id, topic_name, planned_minutes, status')
        .in('child_id', ids)
        .eq('planned_for', today)
        .eq('status', 'planned'),
    ])
    return {
      kind: 'children',
      children: kids.map((k) => {
        const s = sessions?.find((x) => x.child_id === k.id)
        return {
          id: k.id,
          firstName: k.first_name,
          grade: k.grade,
          schoolName: k.schools?.name ?? '',
          needs: needs?.filter((n) => n.child_id === k.id).length ?? 0,
          tonight: s?.topic_name ? { topic: s.topic_name, minutes: s.planned_minutes } : null,
        }
      }),
    }
  }
  const { count } = await supabase
    .from('parent_links')
    .select('id', { count: 'exact', head: true })
    .eq('parent_id', userId)
    .eq('status', 'pending')
  return count ? { kind: 'pending' } : { kind: 'none' }
}

export type PendingLink = {
  childId: string
  childName: string
  className: string
  schoolName: string
  teacherName: string
  askedAt: string
}

/** The parent's newest waiting request. Class and name come from the parent's own request, not from the child's data. */
export async function getPendingLink(userId: string): Promise<PendingLink | null> {
  const supabase = await createSupabaseServer()
  const { data: link } = await supabase
    .from('parent_links')
    .select('child_id, class_id, created_at')
    .eq('parent_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!link) return null
  const db = createSupabaseAdmin()
  const [{ data: cls }, { data: child }] = await Promise.all([
    db.from('classes').select('name, teacher_id, schools(name)').eq('id', link.class_id).single(),
    db.from('children').select('first_name').eq('id', link.child_id).single(),
  ])
  if (!cls || !child) return null
  const { data: teacher } = await db.from('profiles').select('display_name').eq('user_id', cls.teacher_id).maybeSingle()
  const askedAt = new Intl.DateTimeFormat('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Johannesburg' })
    .format(new Date(link.created_at))
    .replace('.', ':')
  return {
    childId: link.child_id,
    childName: child.first_name,
    className: cls.name,
    schoolName: cls.schools?.name ?? '',
    teacherName: teacher?.display_name ?? 'the teacher',
    askedAt,
  }
}

export { initialsOf } from '../initials'

export function greeting(now = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Africa/Johannesburg' }).format(now))
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}
