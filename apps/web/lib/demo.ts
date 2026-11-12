import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { JemmaDb } from '@jemma/profiling/db'
import { createSandbox, resetSandbox, type Logins, type SandboxKind } from '../../../supabase/seed/demo'
import { CHILD_PIN } from '../../../supabase/seed/fixtures/cast'
import { loadSheet } from './sample-sheets'
import { childEmail, childPassword, createChildLogin } from './child-login'
import { createSupabaseAdmin } from './supabase/admin'
import { createSupabaseServer } from './supabase/server'

export type DemoRole = 'teacher' | 'parent' | 'learner'

/** Http-only cookie holding the judge's sandbox id. */
export const DEMO_COOKIE = 'jemma_demo'

const ROLES: readonly DemoRole[] = ['teacher', 'parent', 'learner']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export const isDemoRole = (v: unknown): v is DemoRole => ROLES.includes(v as DemoRole)

/** A person on the demo page that is not one of the first three: a teacher, a parent (by key) or a learner (by first name). Written `teacher:dlamini`. */
export type DemoPerson = { kind: DemoRole; key: string }

const PERSON = /^(teacher|parent|learner):([A-Za-z][A-Za-z .'-]{0,30})$/

export function parsePerson(value: unknown): DemoPerson | null {
  const m = typeof value === 'string' ? PERSON.exec(value) : null
  return m ? { kind: m[1] as DemoRole, key: m[2]! } : null
}

export type DemoState = {
  sandboxId: string
  /** `hillview`, or `empty`: a school with no class that the visitor fills. */
  kind: SandboxKind
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

/** Forgets the demo cookie of a browser whose sandbox is gone. Only works where cookies can be written (a server action). */
async function clearDemoCookie(): Promise<void> {
  ;(await cookies()).delete(DEMO_COOKIE)
}

/**
 * The cookie names a sandbox that is gone (the hourly sweep removed an old copy, or it was reset elsewhere): forget it and send
 * the browser to /demo for a fresh start, never to an error page.
 */
async function startOver(): Promise<never> {
  await clearDemoCookie()
  redirect('/demo')
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

/** The sandbox's home class: its oldest. A teacher may add more classes to the sandbox school, and the demo must not lose its way. */
export function oldestClass<T extends { created_at: string }>(classes: T[]): T | null {
  return [...classes].sort((a, b) => a.created_at.localeCompare(b.created_at))[0] ?? null
}

/** The judge's sandbox, read with the service role (the page may be open while signed out). Null when there is none. */
export async function getDemoState(): Promise<DemoState | null> {
  const sandboxId = await demoCookie()
  if (!sandboxId) return null
  const db = createSupabaseAdmin()
  const { data: box } = await db.from('demo_sandboxes').select('school_id, created_at, kind').eq('id', sandboxId).maybeSingle()
  if (!box) return null
  const kind: SandboxKind = box.kind === 'empty' ? 'empty' : 'hillview'
  const { data: classes } = await db.from('classes').select('id, name, grade, join_code, created_at, schools(name)').eq('school_id', box.school_id)
  const cls = oldestClass(classes ?? [])
  if (!cls) {
    // An empty school before its first class: there is a school and a teacher, and nothing else yet.
    if (kind !== 'empty') return null
    const { data: school } = await db.from('schools').select('name').eq('id', box.school_id).maybeSingle()
    return { sandboxId, kind, schoolId: box.school_id, schoolName: school?.name ?? '', classId: '', className: 'Your school', grade: 0, joinCode: '', startedAt: box.created_at, step: 1 }
  }
  const { data: amina } = await db
    .from('children')
    .select('id')
    .eq('school_id', box.school_id)
    .eq('first_name', 'Amina')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return {
    sandboxId,
    kind,
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

/** Where each role lands after signing in. The teacher starts on the curriculum step. A teacher with no class yet makes the first one. */
export function demoHome(role: DemoRole, classId: string): string {
  if (role === 'teacher') return classId ? `/t/${classId}/curriculum` : '/demo/first-class'
  return role === 'parent' ? '/p' : '/k'
}

type Box = { school_id: string; logins: Logins; kind: string | null }

async function readBox(db: JemmaDb, sandboxId: string): Promise<Box | null> {
  const { data: box, error } = await db.from('demo_sandboxes').select('school_id, logins, kind').eq('id', sandboxId).maybeSingle()
  if (error) throw new Error(`demo: ${error.message}`)
  return box ? { school_id: box.school_id, logins: box.logins as unknown as Logins, kind: box.kind } : null
}

async function signInWith(login: { email: string; password: string }): Promise<void> {
  const supabase = await createSupabaseServer()
  const { error } = await supabase.auth.signInWithPassword({ email: login.email, password: login.password })
  if (error) throw new Error(`demo: sign in failed: ${error.message}`)
}

/** Signs the browser in as `role` in sandbox `sandboxId` and returns where they should land. */
export async function signInAs(sandboxId: string, role: DemoRole): Promise<string> {
  if (!isDemoRole(role)) throw new Error('demo: unknown role')
  const db = createSupabaseAdmin()
  const box = await readBox(db, sandboxId)
  if (!box) return startOver()
  // An empty school has one login, the teacher's: a parent or a learner cannot be picked there.
  const login = box.logins[role] ?? (box.kind === 'empty' ? box.logins.teacher : undefined)
  if (!login) throw new Error(`demo: no ${role} login in this copy`)
  await signInWith(login)
  const { data: classes } = await db.from('classes').select('id, created_at').eq('school_id', box.school_id)
  const cls = oldestClass(classes ?? [])
  await setDemoCookie(sandboxId)
  return demoHome(box.kind === 'empty' ? 'teacher' : role, cls?.id ?? '')
}

/**
 * Makes the learner's login the first time someone picks them (Amina has hers from the start). Keeps the sign-in in the sandbox row,
 * so a second tap signs in again. Teardown finds the user through the school, so nothing is left behind.
 */
async function learnerLogin(db: JemmaDb, sandboxId: string, box: Box, firstName: string): Promise<{ email: string; password: string } | null> {
  if (firstName === 'Amina' && box.logins.learner) return box.logins.learner
  const known = box.logins.learners?.[firstName]
  if (known) return known
  const { data: child } = await db.from('children').select('id, user_id').eq('school_id', box.school_id).eq('first_name', firstName).order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!child || child.user_id) return null
  const { code } = await createChildLogin(db, child.id, CHILD_PIN)
  const { data: after } = await db.from('children').select('user_id').eq('id', child.id).single()
  const made = { userId: after!.user_id!, email: childEmail(code), password: await childPassword(code, CHILD_PIN), code, pin: CHILD_PIN }
  const { data: fresh } = await db.from('demo_sandboxes').select('logins').eq('id', sandboxId).maybeSingle()
  const logins = (fresh?.logins ?? box.logins) as unknown as Logins
  await db.from('demo_sandboxes').update({ logins: { ...logins, learners: { ...(logins.learners ?? {}), [firstName]: made } } as never }).eq('id', sandboxId)
  return made
}

/** Signs in as any made-up person of the school (a teacher, a parent or a learner) and returns where they land. */
export async function signInAsPerson(sandboxId: string, person: DemoPerson): Promise<string> {
  const db = createSupabaseAdmin()
  const box = await readBox(db, sandboxId)
  if (!box) return startOver()
  const { data: classes } = await db.from('classes').select('id, teacher_id, created_at').eq('school_id', box.school_id)
  let login: { email: string; password: string } | null | undefined
  let userId: string | null = null
  if (person.kind === 'teacher') {
    login = person.key === 'banda' ? box.logins.teacher : box.logins.teachers?.[person.key]
    userId = (login as { userId?: string } | undefined)?.userId ?? null
  } else if (person.kind === 'parent') {
    login = person.key === 'thandi' ? box.logins.parent : box.logins.parents?.[person.key]
  } else {
    login = await learnerLogin(db, sandboxId, box, person.key)
  }
  if (!login) throw new Error(`demo: ${person.key} is not in this copy`)
  await signInWith(login)
  await setDemoCookie(sandboxId)
  if (person.kind === 'teacher') {
    // Ms Banda starts on the curriculum step as ever. Another teacher lands on the learners of their oldest class.
    if (person.key === 'banda') return demoHome('teacher', oldestClass(classes ?? [])?.id ?? '')
    const mine = oldestClass((classes ?? []).filter((c) => c.teacher_id === userId))
    return mine ? `/t/${mine.id}/learners` : '/t'
  }
  return person.kind === 'parent' ? '/p' : '/k'
}

/** "Try the demo": makes a fresh sandbox unless the judge already has one of this kind, then signs in as `role` (or as `opts.person`). */
export async function tryDemo(role: DemoRole = 'teacher', opts: { kind?: SandboxKind; person?: DemoPerson | null } = {}): Promise<never> {
  const kind = opts.kind ?? 'hillview'
  const existing = await getDemoState()
  let sandboxId = existing && existing.kind === kind ? existing.sandboxId : null
  if (!sandboxId) sandboxId = (await createSandbox(createSupabaseAdmin(), { stage: 'start', kind, loadSheet })).sandboxId
  redirect(opts.person && kind === 'hillview' ? await signInAsPerson(sandboxId, opts.person) : await signInAs(sandboxId, role))
}

/** Signs in as another demo person in the same sandbox. */
export async function switchRole(role: DemoRole, person?: DemoPerson | null): Promise<never> {
  const sandboxId = await demoCookie()
  if (!sandboxId) redirect('/demo')
  redirect(person ? await signInAsPerson(sandboxId, person) : await signInAs(sandboxId, role))
}

/** Throws the judge's copy away and builds it again, then leaves them on /demo signed out (their old users are gone). */
export async function resetDemo(): Promise<never> {
  const sandboxId = await demoCookie()
  if (!sandboxId) redirect('/demo')
  const admin = createSupabaseAdmin()
  const { data: box } = await admin.from('demo_sandboxes').select('id').eq('id', sandboxId).maybeSingle()
  if (!box) return startOver()
  await resetSandbox(admin, sandboxId, { loadSheet })
  const supabase = await createSupabaseServer()
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
  redirect('/demo')
}
