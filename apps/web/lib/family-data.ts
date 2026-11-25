import type { JemmaDb } from '@jemma/profiling/db'
import { payfastEnv, subscriptionCall } from './payfast'

// A family's data (P160): the copy a parent downloads, and what goes when a parent deletes a child's data or their own account. These are a
// parent's rights under POPIA. The copy is read with the parent's own session, so the database's rules decide what is in it: exactly what the
// parent may see in the app (a test the teacher has not shared yet is not in it). Deleting runs with the service role, after the caller has
// checked that this parent may act for the child.

/** The tables with one row or more for a child (by `child_id`) that a parent may read: the copy reads each of them. */
export const CHILD_TABLES = [
  'enrolments',
  'sessions',
  'gaps',
  'lessons',
  'papers',
  'question_results',
  'format_trials',
  'guidance_cards',
  'observations',
  'attendance',
  'activities',
  'activity_log',
  'learner_records',
  'long_view_patterns',
  'topic_lesson_progress',
] as const

/** How long the links to the photos in a copy work: 7 days. */
export const PHOTO_LINK_SECONDS = 7 * 24 * 60 * 60

type Row = Record<string, unknown>

/** The rows of one table for these children that the reader may see. A table the reader may not read gives no rows, never an error. */
async function rowsOf(db: JemmaDb, table: string, childIds: string[]): Promise<Row[]> {
  if (childIds.length === 0) return []
  const { data, error } = await (db.from(table as never) as unknown as { select: (c: string) => { in: (k: string, v: string[]) => Promise<{ data: Row[] | null; error: { message: string } | null }> } })
    .select('*')
    .in('child_id', childIds)
  return error ? [] : (data ?? [])
}

export type FamilyCopy = {
  made_at: string
  about: string
  account: { name: string; email: string | null; role: string; since: string | null }
  children: { child: Row; own_side: Row[]; data: Record<string, Row[]>; practice_answers: Row[]; photos: { paper_id: unknown; page: unknown; link: string | null }[] }[]
}

/**
 * The copy of everything a parent may see about their family: their account, and for each child they are linked to (and the child's own side,
 * "My own"), every row of `CHILD_TABLES`, the answers of each practice, and a link to each photo of a paper (it works for 7 days).
 * `reader` is the parent's own client (the rules apply); `admin` only makes the photo links, for pages the reader could read.
 */
export async function familyCopy(reader: JemmaDb, admin: JemmaDb, user: { id: string; email: string | null; createdAt: string | null }, now = new Date()): Promise<FamilyCopy> {
  const { data: profile } = await reader.from('profiles').select('role, display_name').eq('user_id', user.id).maybeSingle()
  const { data: links } = await reader.from('parent_links').select('child_id, status, consent, created_at, decided_at').eq('parent_id', user.id).eq('status', 'approved')
  const children: FamilyCopy['children'] = []
  for (const link of links ?? []) {
    const { data: child } = await reader.from('children').select('*').eq('id', link.child_id).maybeSingle()
    if (!child) continue
    const { data: twins } = await reader.from('children').select('*').eq('private_of', link.child_id)
    const ids = [link.child_id, ...(twins ?? []).map((t) => t.id)]
    const data: Record<string, Row[]> = {}
    for (const table of CHILD_TABLES) data[table] = await rowsOf(reader, table, ids)
    const sessionIds = (data.sessions ?? []).map((s) => s.id as string)
    const { data: answers } = sessionIds.length ? await reader.from('session_items').select('*').in('session_id', sessionIds) : { data: [] }
    const paperIds = (data.papers ?? []).map((p) => p.id as string)
    const { data: pages } = paperIds.length ? await reader.from('paper_pages').select('paper_id, page_no, storage_path').in('paper_id', paperIds) : { data: [] }
    const paths = (pages ?? []).map((p) => p.storage_path)
    const signed = paths.length ? await admin.storage.from('papers').createSignedUrls(paths, PHOTO_LINK_SECONDS) : { data: [] }
    const linkOf = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]))
    children.push({
      child: { ...child, link: { consent: link.consent, asked_on: link.created_at, approved_on: link.decided_at } },
      own_side: (twins ?? []) as Row[],
      data,
      practice_answers: (answers ?? []) as Row[],
      photos: (pages ?? []).map((p) => ({ paper_id: p.paper_id, page: p.page_no, link: linkOf.get(p.storage_path) ?? null })),
    })
  }
  return {
    made_at: now.toISOString(),
    about: 'Everything Jemma keeps that you may see about your family, as on the day this copy was made. The photo links work for 7 days.',
    account: { name: profile?.display_name ?? '', email: user.email, role: profile?.role ?? 'parent', since: user.createdAt },
    children,
  }
}

/** Removes files from a bucket, 100 at a time. A file that is already gone is not an error. */
async function removeFiles(admin: JemmaDb, bucket: string, paths: string[]): Promise<void> {
  const unique = [...new Set(paths.filter(Boolean))]
  for (let i = 0; i < unique.length; i += 100) {
    const { error } = await admin.storage.from(bucket).remove(unique.slice(i, i + 100))
    if (error) console.error(`could not remove ${bucket} files: ${error.message}`)
  }
}

/** The photos of the papers and the recorded lessons of these children: the files that go with them. */
async function filesOf(admin: JemmaDb, childIds: string[]): Promise<{ papers: string[]; audio: string[] }> {
  const { data: papers } = await admin.from('papers').select('id').in('child_id', childIds)
  const paperIds = (papers ?? []).map((p) => p.id)
  const { data: pages } = paperIds.length ? await admin.from('paper_pages').select('storage_path').in('paper_id', paperIds) : { data: [] }
  const { data: lessons } = await admin.from('lessons').select('audio_path').in('child_id', childIds)
  return { papers: (pages ?? []).map((p) => p.storage_path), audio: (lessons ?? []).map((l) => l.audio_path).filter((p): p is string => Boolean(p)) }
}

export type DeletedChild = { firstName: string; told: number }

/**
 * Deletes everything Jemma keeps about one learner: the learner, their own side ("My own"), their practice, marks, lessons, photos and recorded
 * lessons, and the learner's own login. A learner added by a parent alone lives in a school of their own, which goes with them. A learner in a
 * real school is taken out of it, and each teacher of their classes gets a note in the app saying why. The caller checks the right to do this.
 */
export async function deleteChildData(admin: JemmaDb, childId: string): Promise<DeletedChild | null> {
  const { data: child } = await admin.from('children').select('id, first_name, school_id, user_id').eq('id', childId).maybeSingle()
  if (!child) return null
  const { data: twins } = await admin.from('children').select('id, school_id').eq('private_of', childId)
  const ids = [childId, ...(twins ?? []).map((t) => t.id)]
  const files = await filesOf(admin, ids)
  const { data: school } = await admin.from('schools').select('id, kind').eq('id', child.school_id).maybeSingle()
  // The teachers to tell: those of the learner's classes in a real school (a school of one's own has no other teacher).
  let teachers: { teacher_id: string; id: string; name: string }[] = []
  if (school?.kind === 'school') {
    const { data: enrolled } = await admin.from('enrolments').select('class_id').eq('child_id', childId)
    const classIds = (enrolled ?? []).map((e) => e.class_id)
    const { data: classes } = classIds.length ? await admin.from('classes').select('id, name, teacher_id').in('id', classIds) : { data: [] }
    teachers = (classes ?? []) as typeof teachers
  }
  // The learner's own login first: its profile goes with it, so nothing points at the school of their own any more.
  if (child.user_id) {
    const { error } = await admin.auth.admin.deleteUser(child.user_id)
    if (error && !/not.?found/i.test(error.message)) throw new Error(`could not delete the learner's login: ${error.message}`)
  }
  for (const twin of twins ?? []) await admin.from('schools').delete().eq('id', twin.school_id).eq('kind', 'private')
  const gone = school?.kind === 'private' ? await admin.from('schools').delete().eq('id', school.id) : await admin.from('children').delete().eq('id', childId)
  if (gone.error) throw new Error(`could not delete the learner: ${gone.error.message}`)
  await removeFiles(admin, 'papers', files.papers)
  await removeFiles(admin, 'lesson-audio', files.audio)
  const name = child.first_name
  if (teachers.length) {
    await admin.from('notifications').insert(
      teachers.map((c) => ({
        user_id: c.teacher_id,
        title: `${name} was taken out of ${c.name}`,
        body: `${name}'s parent deleted ${name}'s data in Jemma, so ${name} is no longer in ${c.name}.`,
        href: `/t/${c.id}/learners`,
      })),
    )
  }
  return { firstName: name, told: teachers.length }
}

/**
 * Deletes a parent's account. A child the parent added alone (a school of their own, and no other parent) goes with it. A child in a teacher's
 * class stays there: only the parent's link goes. Then the login goes, and with it the profile, the links and the parent's notes.
 */
export async function deleteParentAccount(admin: JemmaDb, parentId: string): Promise<{ childrenDeleted: number }> {
  await stopPlans(admin, parentId)
  const { data: links } = await admin.from('parent_links').select('child_id').eq('parent_id', parentId).eq('status', 'approved')
  let childrenDeleted = 0
  for (const { child_id } of links ?? []) {
    const { data: child } = await admin.from('children').select('id, school_id, schools(kind)').eq('id', child_id).maybeSingle()
    const kind = (child?.schools as { kind?: string } | null)?.kind
    if (!child || kind !== 'private') continue
    const { data: others } = await admin.from('parent_links').select('parent_id').eq('child_id', child_id).eq('status', 'approved').neq('parent_id', parentId)
    if ((others ?? []).length) continue
    if (await deleteChildData(admin, child_id)) childrenDeleted += 1
  }
  const { error } = await admin.auth.admin.deleteUser(parentId)
  if (error) throw new Error(`could not delete the account: ${error.message}`)
  return { childrenDeleted }
}

/**
 * P161: before an account goes, its family plan is stopped on PayFast, so nothing is charged after it. PayFast must say yes (or that it is already
 * gone): otherwise the account is not deleted and the parent is asked to try again. Nothing to do while plans are not set up.
 */
async function stopPlans(admin: JemmaDb, parentId: string): Promise<void> {
  const env = payfastEnv()
  if (!env) return
  const { data: subs } = await admin.from('subscriptions').select('id, token, status').eq('parent_id', parentId).in('status', ['active', 'failed'])
  for (const sub of subs ?? []) {
    if (!sub.token) continue
    const res = await subscriptionCall(env, sub.token, { kind: 'cancel' })
    if (!res.ok && res.status !== 404) throw new Error(`PayFast did not stop the plan (${res.status})`)
    await admin.from('subscriptions').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', sub.id)
  }
}
