import { notFound } from 'next/navigation'
import { newJoinCode } from '../class-writes'
import { createSupabaseAdmin } from '../supabase/admin'
import { createSupabaseServer } from '../supabase/server'

const TZ = 'Africa/Johannesburg'

/**
 * How a class is called in a sentence: "6B Mathematics" is "6B", "Grade 9 Natural Sciences" is "Grade 9". A name with no code in
 * front stays whole when it is short ("Natural Sciences") and is cut at its first word when it is long.
 */
export function shortName(className: string): string {
  const name = className.trim().replace(/\s+/g, ' ')
  const [first = '', second = ''] = name.split(' ')
  if (/^(grade|gr)$/i.test(first) && /^\d+[A-Za-z]?$/.test(second)) return `${first} ${second}`
  if (/\d/.test(first)) return first
  return name.length <= 18 ? name : first
}

/** The short names of a teacher's classes, each in full when two classes would share one ("6B Mathematics" and "6B English" are not both "6B"). */
export function classLabels(names: string[]): string[] {
  const shorts = names.map(shortName)
  return names.map((name, i) => (shorts.filter((s) => s === shorts[i]).length > 1 ? name : shorts[i]!))
}

/**
 * Which class a Needs you item counts for. `order` is the teacher's classes, oldest first. A learner in one class: that class.
 * A learner in more: the class the item is about when it is known, else the teacher's oldest of the learner's classes.
 */
export function needClass(order: string[], item: { childClasses: string[]; itemClass: string | null }): string | undefined {
  const mine = order.filter((id) => item.childClasses.includes(id))
  if (item.itemClass && order.includes(item.itemClass) && (mine.length === 0 || mine.includes(item.itemClass))) return item.itemClass
  return mine[0]
}

export const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('')

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
export const numberWord = (n: number): string => WORDS[n] ?? String(n)
const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many)

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-ZA', { timeZone: TZ, ...opts }).format(new Date(iso))

/** "14:12" in South African time. */
export const clock = (iso: string): string => fmt(iso, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** "Mon 26 Oct". */
export function shortDate(iso: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-ZA', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).formatToParts(new Date(iso)).map((p) => [p.type, p.value]),
  )
  return `${parts.weekday} ${parts.day} ${String(parts.month).replace('.', '')}`
}

const dayKey = (iso: string) => fmt(iso, { year: 'numeric', month: '2-digit', day: '2-digit' })

export function greeting(now = new Date()): string {
  const hour = Number(fmt(now.toISOString(), { hour: '2-digit', hourCycle: 'h23' }))
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

/** The signed-in teacher, read under RLS. */
async function me() {
  const supabase = await createSupabaseServer()
  const { data } = await supabase.auth.getUser()
  const userId = data.user!.id
  const { data: profile } = await supabase.from('profiles').select('display_name, school_id').eq('user_id', userId).single()
  return { supabase, userId, email: data.user!.email ?? '', name: profile!.display_name, schoolId: profile!.school_id }
}

// ---------- teacher-classes ----------

export type ClassCard = {
  id: string
  name: string
  grade: number
  schoolName: string
  learners: number
  tests: number
  needs: number
  /** "marked today at 14:12" style line for the latest marked test. */
  markedLine: string | null
}

export type ClassesView = {
  greeting: string
  name: string
  initials: string
  headline: string
  classes: ClassCard[]
  unread: number
  notificationsHref: string
}

export async function getTeacherClasses(): Promise<ClassesView> {
  const { supabase, userId, name } = await me()
  const { data: classes } = await supabase
    .from('classes')
    .select('id, name, grade, created_at, schools(name)')
    .eq('teacher_id', userId)
    .order('created_at')
  const rows = classes ?? []
  const ids = rows.map((c) => c.id)

  const [enrol, tests, needs, unread] = await Promise.all([
    supabase.from('enrolments').select('class_id, child_id').in('class_id', ids),
    supabase.from('tests').select('id, class_id, title').in('class_id', ids),
    supabase.from('needs_you_items').select('child_id, kind, ref_id').eq('owner_id', userId).eq('status', 'open'),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('read_at', null),
  ])

  const classOfChild = new Map<string, string[]>()
  for (const e of enrol.data ?? []) classOfChild.set(e.child_id, [...(classOfChild.get(e.child_id) ?? []), e.class_id])
  const classOfTest = new Map((tests.data ?? []).map((t) => [t.id, t.class_id]))
  // An item about a paper belongs to the class of the paper's test (a learner may be in several of the teacher's classes).
  const refs = [...new Set((needs.data ?? []).map((n) => n.ref_id))]
  const { data: refPapers } = refs.length ? await supabase.from('papers').select('id, test_id').in('id', refs) : { data: [] }
  const classOfPaper = new Map((refPapers ?? []).flatMap((p) => (p.test_id && classOfTest.get(p.test_id) ? [[p.id, classOfTest.get(p.test_id)!] as const] : [])))

  const needsBy = new Map<string, { n: number; papers: number }>()
  for (const item of needs.data ?? []) {
    const target = needClass(ids, {
      childClasses: (item.child_id && classOfChild.get(item.child_id)) || [],
      itemClass: classOfTest.get(item.ref_id) ?? classOfPaper.get(item.ref_id) ?? null,
    })
    if (!target) continue
    const cur = needsBy.get(target) ?? { n: 0, papers: 0 }
    cur.n += 1
    if (['check_answer', 'unreadable_name', 'confirm_scan'].includes(item.kind)) cur.papers += 1
    needsBy.set(target, cur)
  }

  const testIds = (tests.data ?? []).map((t) => t.id)
  const { data: marked } = await supabase
    .from('papers')
    .select('test_id, created_at')
    .in('test_id', testIds)
    .eq('status', 'marked')
    .order('created_at', { ascending: false })
  const latest = new Map<string, { title: string; at: string }>()
  for (const p of marked ?? []) {
    const classId = classOfTest.get(p.test_id!)
    if (classId && !latest.has(classId)) {
      latest.set(classId, { title: tests.data!.find((t) => t.id === p.test_id)!.title.split(':')[0]!, at: p.created_at })
    }
  }

  const today = dayKey(new Date().toISOString())
  const cards: ClassCard[] = rows.map((c) => {
    const l = latest.get(c.id)
    const when = l ? (dayKey(l.at) === today ? 'today' : `on ${shortDate(l.at)}`) : null
    return {
      id: c.id,
      name: c.name,
      grade: c.grade,
      schoolName: c.schools?.name ?? '',
      learners: (enrol.data ?? []).filter((e) => e.class_id === c.id).length,
      tests: (tests.data ?? []).filter((t) => t.class_id === c.id).length,
      needs: needsBy.get(c.id)?.n ?? 0,
      markedLine: l ? `${l.title} marked ${when} at ${clock(l.at)}` : null,
    }
  })

  const labels = classLabels(cards.map((c) => c.name))
  const sentences = cards.flatMap((c, i) => {
    const n = needsBy.get(c.id)
    if (n && n.n > 0) {
      const noun = n.papers === n.n ? plural(n.n, 'paper') : plural(n.n, 'thing')
      return [`${labels[i]} needs you for ${numberWord(n.n)} ${noun}.`]
    }
    return c.tests === 0 ? [`${labels[i]} is waiting to be set up.`] : []
  })
  const headline = cards.length === 0 ? 'Create your first class to get started.' : sentences.join(' ') || 'Everything is up to date.'

  return {
    greeting: greeting(),
    name,
    initials: initialsOf(name),
    headline,
    classes: cards,
    unread: unread.count ?? 0,
    notificationsHref: cards[0] ? `/t/${cards[0].id}/notifications` : '/t',
  }
}

// ---------- class helpers ----------

export type ClassInfo = { id: string; name: string; grade: number; subject: string; joinCode: string; schoolName: string; teacherId: string }

/** The class, read under RLS. 404 when the signed-in user cannot see it. */
export async function getClassInfo(classId: string): Promise<ClassInfo> {
  const supabase = await createSupabaseServer()
  const { data } = await supabase
    .from('classes')
    .select('id, name, grade, subject, join_code, teacher_id, schools(name)')
    .eq('id', classId)
    .maybeSingle()
  if (!data) notFound()
  return { id: data.id, name: data.name, grade: data.grade, subject: data.subject, joinCode: data.join_code, schoolName: data.schools?.name ?? '', teacherId: data.teacher_id }
}

/** The learners of a class with their ids, by first name. */
export async function learnerList(classId: string): Promise<{ id: string; name: string }[]> {
  const supabase = await createSupabaseServer()
  const { data: enrol } = await supabase.from('enrolments').select('child_id').eq('class_id', classId)
  const { data: kids } = await supabase.from('children').select('id, first_name, last_name').in('id', (enrol ?? []).map((e) => e.child_id))
  return (kids ?? []).map((k) => ({ id: k.id, name: [k.first_name, k.last_name].filter(Boolean).join(' ') })).sort((a, b) => a.name.localeCompare(b.name))
}

export async function learnerNames(classId: string): Promise<string[]> {
  return (await learnerList(classId)).map((l) => l.name)
}

export type CopyOption = { id: string; name: string; learners: number }

/** The classes of the teacher's school that the teacher may see (row level security decides), for "Copy learners from another class". */
export async function getCopyOptions(schoolId: string): Promise<CopyOption[]> {
  const supabase = await createSupabaseServer()
  const { data: classes } = await supabase.from('classes').select('id, name').eq('school_id', schoolId).order('created_at')
  const ids = (classes ?? []).map((c) => c.id)
  const { data: enrol } = ids.length ? await supabase.from('enrolments').select('class_id').in('class_id', ids) : { data: [] }
  return (classes ?? []).map((c) => ({ id: c.id, name: c.name, learners: (enrol ?? []).filter((e) => e.class_id === c.id).length }))
}

// ---------- state-empty-class ----------

export type EmptyClassView = {
  cls: ClassInfo
  learners: number
  steps: { curriculumDone: boolean; learnersDone: boolean; testDone: boolean }
  done: number
  openNeeds: number
}

export async function getEmptyClass(classId: string): Promise<EmptyClassView> {
  const cls = await getClassInfo(classId)
  const supabase = await createSupabaseServer()
  const [names, maps, tests, needs] = await Promise.all([
    learnerNames(classId),
    supabase.from('curriculum_maps').select('id', { count: 'exact', head: true }).eq('class_id', classId).eq('status', 'approved'),
    supabase.from('tests').select('id', { count: 'exact', head: true }).eq('class_id', classId),
    supabase.from('needs_you_items').select('id', { count: 'exact', head: true }).eq('status', 'open'),
  ])
  const steps = { curriculumDone: (maps.count ?? 0) > 0, learnersDone: names.length > 0, testDone: (tests.count ?? 0) > 0 }
  return { cls, learners: names.length, steps, done: Object.values(steps).filter(Boolean).length, openNeeds: needs.count ?? 0 }
}

// ---------- teacher-onboarding ----------

/** Region and grade range line for a school, e.g. "Gauteng · Grade R to 7". Null when the school has neither. */
export const schoolBlurb = (s: { region: string | null; grades: string | null }): string | null =>
  [s.region, s.grades].filter(Boolean).join(' · ') || null

export type OnboardingView = { name: string; school: { id: string; name: string; blurb: string | null } | null }

export async function getOnboarding(): Promise<OnboardingView & { schoolId: string | null }> {
  const { supabase, name, schoolId } = await me()
  if (!schoolId) return { name, school: null, schoolId: null }
  const { data } = await supabase.from('schools').select('id, name, region, grades').eq('id', schoolId).maybeSingle()
  return { name, school: data ? { id: data.id, name: data.name, blurb: schoolBlurb(data) } : null, schoolId }
}

// ---------- teacher-class-settings ----------

export type SettingsView = {
  cls: ClassInfo
  learners: string[]
  /** The same learners with their ids, in the same order, for the row of each one. */
  learnerRows: { id: string; name: string }[]
  parents: { parentId: string; childId: string; name: string; initials: string; relationLine: string; linkedOn: string }[]
}

const RELATION: Record<string, string> = { mum: 'mother', mom: 'mother', mother: 'mother', dad: 'father', father: 'father' }

export async function getSettings(classId: string): Promise<SettingsView> {
  const cls = await getClassInfo(classId)
  const supabase = await createSupabaseServer()
  const learnerRows = await learnerList(classId)
  const learners = learnerRows.map((l) => l.name)
  const { data: links } = await supabase
    .from('parent_links')
    .select('parent_id, child_id, decided_at, created_at')
    .eq('class_id', classId)
    .eq('status', 'approved')
    .order('decided_at')
  const rows = links ?? []
  const admin = createSupabaseAdmin()
  const [{ data: profiles }, { data: kids }] = await Promise.all([
    admin.from('profiles').select('user_id, display_name').in('user_id', rows.map((l) => l.parent_id)),
    supabase.from('children').select('id, first_name, parent_relation').in('id', rows.map((l) => l.child_id)),
  ])
  const parents = rows.map((l) => {
    const name = profiles?.find((p) => p.user_id === l.parent_id)?.display_name ?? 'Parent'
    const kid = kids?.find((k) => k.id === l.child_id)
    const relation = kid?.parent_relation ? (RELATION[kid.parent_relation.toLowerCase()] ?? 'parent') : 'parent'
    return {
      parentId: l.parent_id,
      childId: l.child_id,
      name,
      initials: initialsOf(name),
      relationLine: `${kid?.first_name ?? 'Child'}'s ${relation}`,
      linkedOn: `Linked ${shortDate(l.decided_at ?? l.created_at)}`,
    }
  })
  return { cls, learners, learnerRows, parents }
}

// ---------- teacher-account ----------

export type AccountView = {
  name: string
  initials: string
  email: string
  schoolName: string
  teaches: string
  people: number
  firstClassId: string | null
}

export async function getAccount(): Promise<AccountView> {
  const { supabase, userId, name, email, schoolId } = await me()
  const [{ data: school }, { data: classes }] = await Promise.all([
    schoolId ? supabase.from('schools').select('name').eq('id', schoolId).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('classes').select('id, subject, grade').eq('teacher_id', userId).order('created_at'),
  ])
  const subjects = [...new Set((classes ?? []).map((c) => c.subject))]
  const grades = [...new Set((classes ?? []).map((c) => c.grade))].sort((a, b) => a - b)
  const teaches = subjects.length === 0 ? '' : `${subjects.join(' and ')}, ${grades.length > 1 ? 'Grades' : 'Grade'} ${grades.join(' and ')}`

  // Teacher, linked parents and children, all read under RLS (the teacher sees their own classes).
  const classIds = (classes ?? []).map((c) => c.id)
  const [{ data: enrol }, { data: links }] = await Promise.all([
    supabase.from('enrolments').select('child_id').in('class_id', classIds),
    supabase.from('parent_links').select('parent_id').in('class_id', classIds).eq('status', 'approved'),
  ])
  const people = 1 + new Set((links ?? []).map((l) => l.parent_id)).size + new Set((enrol ?? []).map((e) => e.child_id)).size
  return { name, initials: initialsOf(name), email, schoolName: school?.name ?? '', teaches, people, firstClassId: classes?.[0]?.id ?? null }
}

// ---------- teacher-link-request ----------

/** Sandbox addresses carry a per-sandbox tag (thandi.<tag>@demo.jemma.invalid); show the seeded parent's address. Real emails pass through. */
export const displayEmail = (email: string): string =>
  email.endsWith('@demo.jemma.invalid') ? `${email.split('@')[0]!.split('.')[0]}@example.com` : email

export type LinkRequestView = {
  cls: ClassInfo
  linkId: string
  status: 'pending' | 'approved' | 'declined'
  parentName: string
  parentInitials: string
  parentEmail: string
  childName: string
  enteredAt: string
  otherParents: number
}

export async function getLinkRequest(classId: string, linkId: string): Promise<LinkRequestView> {
  const cls = await getClassInfo(classId)
  const supabase = await createSupabaseServer()
  const { data: link } = await supabase.from('parent_links').select('id, parent_id, child_id, status, created_at').eq('id', linkId).eq('class_id', classId).maybeSingle()
  if (!link) notFound()
  const admin = createSupabaseAdmin()
  const [{ data: kid }, { data: profile }, { data: user }, { count }] = await Promise.all([
    supabase.from('children').select('first_name').eq('id', link.child_id).single(),
    admin.from('profiles').select('display_name').eq('user_id', link.parent_id).maybeSingle(),
    admin.auth.admin.getUserById(link.parent_id),
    supabase.from('parent_links').select('id', { count: 'exact', head: true }).eq('child_id', link.child_id).eq('status', 'approved').neq('id', linkId),
  ])
  const parentName = profile?.display_name ?? 'A parent'
  return {
    cls,
    linkId,
    status: link.status,
    parentName,
    parentInitials: initialsOf(parentName),
    parentEmail: displayEmail(user.user?.email ?? ''),
    childName: kid?.first_name ?? 'the child',
    enteredAt: clock(link.created_at),
    otherParents: count ?? 0,
  }
}

// ---------- teacher-year-end ----------

/** CSV of every marked paper in the class: one row per learner per test. */
export async function marksCsv(classId: string): Promise<string> {
  await getClassInfo(classId)
  const supabase = await createSupabaseServer()
  const { data: tests } = await supabase.from('tests').select('id, title, out_of, written_on').eq('class_id', classId).order('written_on')
  const { data: papers } = await supabase
    .from('papers')
    .select('test_id, child_id, total')
    .in('test_id', (tests ?? []).map((t) => t.id))
    .eq('status', 'marked')
  const { data: kids } = await supabase.from('children').select('id, first_name').in('id', (papers ?? []).map((p) => p.child_id).filter((id): id is string => Boolean(id)))
  const esc = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : String(v))
  const lines = ['Learner,Test,Marks,Out of']
  for (const t of tests ?? []) {
    const rows = (papers ?? [])
      .filter((p) => p.test_id === t.id && p.child_id)
      .map((p) => ({ name: kids?.find((k) => k.id === p.child_id)?.first_name ?? '', total: p.total }))
      .sort((a, b) => a.name.localeCompare(b.name))
    for (const r of rows) lines.push([r.name, t.title, r.total ?? '', t.out_of].map(esc).join(','))
  }
  return `${lines.join('\n')}\n`
}

// ---------- writes: guards and codes ----------

export { newJoinCode }

/** For server actions: the signed-in teacher must teach `classId`. Returns the service client to write with (classes have no write policy). */
export async function requireTeaches(classId: string) {
  const { supabase, userId, schoolId } = await me()
  const { data } = await supabase.from('classes').select('id, school_id').eq('id', classId).eq('teacher_id', userId).maybeSingle()
  if (!data) throw new Error('You do not teach this class')
  return { admin: createSupabaseAdmin(), userId, schoolId: data.school_id }
}

/** For server actions that are not about one class: the signed-in teacher and their school. */
export async function requireTeacher() {
  const { userId, schoolId, name } = await me()
  return { admin: createSupabaseAdmin(), userId, schoolId, name }
}
