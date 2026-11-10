import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { JemmaDb } from '@jemma/profiling/db'
import { createSandbox, resetSandbox } from '../../../supabase/seed/demo'
import { createSupabaseAdmin } from './supabase/admin'
import { createSupabaseServer } from './supabase/server'

export type DemoRole = 'teacher' | 'parent' | 'learner'

/** Http-only cookie holding the judge's sandbox id. */
export const DEMO_COOKIE = 'jemma_demo'

const ROLES: readonly DemoRole[] = ['teacher', 'parent', 'learner']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export const isDemoRole = (v: unknown): v is DemoRole => ROLES.includes(v as DemoRole)

type StoredLogins = Record<DemoRole, { email: string; password: string }>

export type DemoState = {
  sandboxId: string
  schoolId: string
  schoolName: string
  classId: string
  className: string
  grade: number
  joinCode: string
  startedAt: string
  /** Where the judge is on the 5-step demo path, worked out from what exists in their copy. */
  step: 1 | 2 | 3 | 4 | 5
}

export async function demoCookie(): Promise<string | null> {
  const value = (await cookies()).get(DEMO_COOKIE)?.value
  return value && UUID.test(value) ? value : null
}

async function setDemoCookie(sandboxId: string): Promise<void> {
  ;(await cookies()).set(DEMO_COOKIE, sandboxId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30,
  })
}

async function count(q: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  const { count: n, error } = await q
  if (error) throw new Error(`demo: ${error.message}`)
  return n ?? 0
}

/** What exists in the judge's copy, as far as the demo path cares. */
export type StepFacts = {
  mapApproved: boolean
  /** Marked papers of the class's tests. */
  markedPapers: number
  /** Of those, the marked papers of tests the teacher has not shared with parents yet. */
  markedPapersHeld: number
  hasChild: boolean
  linked: boolean
  sessionsDone: number
}

/**
 * Where the judge is on the 5-step path. Step 2 (snap the memo and 5 papers, then tap Share with parents) lasts until
 * 5 papers are marked and no test of the class with a marked paper is still held.
 */
export function stepFrom(f: StepFacts): DemoState['step'] {
  if (!f.mapApproved) return 1
  if (f.markedPapers < 5 || f.markedPapersHeld > 0) return 2
  if (!f.hasChild || !f.linked) return 3
  return f.sessionsDone ? 5 : 4
}

async function stepOf(db: JemmaDb, classId: string, childId: string | null): Promise<DemoState['step']> {
  const head = { count: 'exact', head: true } as const
  const mapApproved = await count(db.from('curriculum_maps').select('id', head).eq('class_id', classId).eq('status', 'approved'))
  if (!mapApproved) return 1
  const { data: tests } = await db.from('tests').select('id, held').eq('class_id', classId)
  const marked = (ids: string[]) => count(db.from('papers').select('id', head).in('test_id', ids).eq('status', 'marked'))
  const markedPapers = await marked((tests ?? []).map((t) => t.id))
  const markedPapersHeld = markedPapers < 5 ? 0 : await marked((tests ?? []).filter((t) => t.held).map((t) => t.id))
  const linked = childId ? await count(db.from('parent_links').select('parent_id', head).eq('child_id', childId).eq('status', 'approved')) : 0
  const sessionsDone = childId && linked ? await count(db.from('sessions').select('id', head).eq('child_id', childId).eq('status', 'done')) : 0
  return stepFrom({ mapApproved: true, markedPapers, markedPapersHeld, hasChild: Boolean(childId), linked: linked > 0, sessionsDone })
}

/** The judge's sandbox, read with the service role (the page may be open while signed out). Null when there is none. */
export async function getDemoState(): Promise<DemoState | null> {
  const sandboxId = await demoCookie()
  if (!sandboxId) return null
  const db = createSupabaseAdmin()
  const { data: box } = await db.from('demo_sandboxes').select('school_id, created_at').eq('id', sandboxId).maybeSingle()
  if (!box) return null
  const { data: cls } = await db
    .from('classes')
    .select('id, name, grade, join_code, schools(name)')
    .eq('school_id', box.school_id)
    .maybeSingle()
  if (!cls) return null
  const { data: amina } = await db.from('children').select('id').eq('school_id', box.school_id).eq('first_name', 'Amina').maybeSingle()
  return {
    sandboxId,
    schoolId: box.school_id,
    schoolName: cls.schools?.name ?? '',
    classId: cls.id,
    className: cls.name,
    grade: cls.grade,
    joinCode: cls.join_code,
    startedAt: box.created_at,
    step: await stepOf(db, cls.id, amina?.id ?? null),
  }
}

/** Where each role lands after signing in. The teacher starts on the curriculum step. */
export function demoHome(role: DemoRole, classId: string): string {
  return role === 'teacher' ? `/t/${classId}/curriculum` : role === 'parent' ? '/p' : '/k'
}

/** Signs the browser in as `role` in sandbox `sandboxId` and returns where they should land. */
export async function signInAs(sandboxId: string, role: DemoRole): Promise<string> {
  if (!isDemoRole(role)) throw new Error('demo: unknown role')
  const db = createSupabaseAdmin()
  const { data: box, error } = await db.from('demo_sandboxes').select('school_id, logins').eq('id', sandboxId).single()
  if (error) throw new Error(`demo: no sandbox: ${error.message}`)
  const login = (box.logins as StoredLogins)[role]
  const supabase = await createSupabaseServer()
  const { error: authError } = await supabase.auth.signInWithPassword({ email: login.email, password: login.password })
  if (authError) throw new Error(`demo: sign in failed: ${authError.message}`)
  const { data: cls } = await db.from('classes').select('id').eq('school_id', box.school_id).single()
  await setDemoCookie(sandboxId)
  return demoHome(role, cls?.id ?? '')
}

/** "Try the demo": makes a fresh sandbox unless the judge already has one, then signs in as `role`. */
export async function tryDemo(role: DemoRole = 'teacher'): Promise<never> {
  let sandboxId = (await getDemoState())?.sandboxId ?? null
  if (!sandboxId) sandboxId = (await createSandbox(createSupabaseAdmin(), { stage: 'start' })).sandboxId
  redirect(await signInAs(sandboxId, role))
}

/** Signs in as another demo person in the same sandbox. */
export async function switchRole(role: DemoRole): Promise<never> {
  const sandboxId = await demoCookie()
  if (!sandboxId) redirect('/demo')
  redirect(await signInAs(sandboxId, role))
}

/** Throws the judge's copy away and builds it again, then leaves them on /demo signed out (their old users are gone). */
export async function resetDemo(): Promise<never> {
  const sandboxId = await demoCookie()
  if (!sandboxId) redirect('/demo')
  await resetSandbox(createSupabaseAdmin(), sandboxId)
  const supabase = await createSupabaseServer()
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
  redirect('/demo')
}
