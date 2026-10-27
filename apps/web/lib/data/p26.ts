import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'

/** "Mon 26 Oct", as the boards write dates. */
export function shortDate(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Africa/Johannesburg',
  }).formatToParts(new Date(iso))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('weekday')} ${get('day')} ${get('month')}`
}

/** "Ms Banda" becomes "MB". */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.slice(0, 1).toUpperCase())
    .join('')
}

export type ChildSettings = {
  firstName: string
  grade: number
  schoolName: string
  /** Null until a sign-in code was made. */
  loginCode: string | null
  teachers: { name: string; initials: string; className: string; linkedOn: string }[]
}

/** The child's login code is service-role only, so the child is first proven readable through RLS. */
export async function getLoginCode(childId: string): Promise<string | null> {
  const supabase = await createSupabaseServer()
  const { data: child } = await supabase.from('children').select('id').eq('id', childId).maybeSingle()
  if (!child) return null
  const { data } = await createSupabaseAdmin().from('child_logins').select('code').eq('child_id', childId).maybeSingle()
  return data?.code ?? null
}

export async function getChildSettings(childId: string): Promise<ChildSettings | null> {
  const supabase = await createSupabaseServer()
  const { data: child } = await supabase
    .from('children')
    .select('first_name, grade, schools(name)')
    .eq('id', childId)
    .maybeSingle()
  if (!child) return null
  const { data: links } = await supabase
    .from('parent_links')
    .select('decided_at, created_at, classes(name, teacher_id)')
    .eq('child_id', childId)
    .eq('status', 'approved')
    .order('decided_at')
  const admin = createSupabaseAdmin()
  const teachers = await Promise.all(
    (links ?? []).map(async (l) => {
      const { data: t } = l.classes
        ? await admin.from('profiles').select('display_name').eq('user_id', l.classes.teacher_id).maybeSingle()
        : { data: null }
      const name = t?.display_name ?? 'Teacher'
      return {
        name,
        initials: initialsOf(name),
        className: l.classes?.name ?? '',
        linkedOn: shortDate(l.decided_at ?? l.created_at),
      }
    }),
  )
  return {
    firstName: child.first_name,
    grade: child.grade,
    schoolName: child.schools?.name ?? '',
    loginCode: await getLoginCode(childId),
    teachers,
  }
}

export type AccountData = {
  name: string
  email: string
  initials: string
  children: { id: string; firstName: string }[]
}

export async function getAccount(): Promise<AccountData> {
  const supabase = await createSupabaseServer()
  const { data: auth } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('user_id', auth.user?.id ?? '')
    .maybeSingle()
  const { data: kids } = await supabase.from('children').select('id, first_name').order('first_name')
  const name = profile?.display_name ?? ''
  return {
    name,
    email: auth.user?.email ?? '',
    initials: initialsOf(name),
    children: (kids ?? []).map((k) => ({ id: k.id, firstName: k.first_name })),
  }
}

export type PrivacyData = {
  childId: string
  childName: string
  agreedOn: string
  improve: boolean
}

/** First linked child's consent. Null when the parent has no approved link yet. */
export async function getPrivacy(): Promise<PrivacyData | null> {
  const supabase = await createSupabaseServer()
  const { data: link } = await supabase
    .from('parent_links')
    .select('child_id, decided_at, created_at, consent, children(first_name)')
    .eq('status', 'approved')
    .order('decided_at')
    .limit(1)
    .maybeSingle()
  if (!link) return null
  const consent = (link.consent ?? {}) as { improve?: boolean }
  return {
    childId: link.child_id,
    childName: link.children?.first_name ?? '',
    agreedOn: shortDate(link.decided_at ?? link.created_at),
    improve: Boolean(consent.improve),
  }
}
