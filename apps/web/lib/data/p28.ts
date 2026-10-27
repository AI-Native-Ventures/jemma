import { createSupabaseServer } from '@/lib/supabase/server'

export type GapRow = {
  id: string
  topic: string
  stage: 'new' | 'practising' | 'fixed'
  /** When the child first practised it (ISO), or null. */
  practisedAt: string | null
  /** When it counted as fixed (ISO), or null. */
  fixedAt: string | null
  /** The child's next planned session on this topic: its day and where to start it. */
  next: { day: string; href: string } | null
  /** Sessions already finished on this topic. */
  sessionsDone: number
}

export type ChildGaps = { firstName: string; initial: string; gaps: GapRow[] }

const dayOnly = (iso: string) => iso.slice(0, 10)

/** The signed-in child's name and gaps, with the next planned session for each unfixed one. Read through RLS. */
export async function getChildGaps(): Promise<ChildGaps> {
  const supabase = await createSupabaseServer()
  const { data: auth } = await supabase.auth.getUser()
  const { data: child, error } = await supabase.from('children').select('id, first_name').eq('user_id', auth.user?.id ?? '').single()
  if (error) throw new Error(`gaps: ${error.message}`)

  const [gaps, sessions] = await Promise.all([
    supabase
      .from('gaps')
      .select('id, topic_name, stage, first_practised_at, fixed_at, created_at')
      .eq('child_id', child.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('sessions')
      .select('id, topic_name, status, planned_for, lesson_id')
      .eq('child_id', child.id)
      .order('planned_for', { ascending: true }),
  ])
  if (gaps.error) throw new Error(`gaps: ${gaps.error.message}`)
  if (sessions.error) throw new Error(`gaps: ${sessions.error.message}`)

  const today = dayOnly(new Date().toISOString())
  const rows: GapRow[] = gaps.data.map((g) => {
    const mine = sessions.data.filter((s) => s.topic_name === g.topic_name)
    const next = mine.find((s) => s.status !== 'done' && s.planned_for >= today)
    return {
      id: g.id,
      topic: g.topic_name,
      stage: g.stage,
      practisedAt: g.first_practised_at,
      fixedAt: g.fixed_at,
      next: next ? { day: next.planned_for, href: next.lesson_id ? `/k/session/${next.id}` : '/k' } : null,
      sessionsDone: mine.filter((s) => s.status === 'done').length,
    }
  })
  return { firstName: child.first_name, initial: child.first_name.slice(0, 1).toUpperCase(), gaps: rows }
}

/** The signed-in child's first name, for the account screen. */
export async function getChildName(): Promise<{ firstName: string; initial: string }> {
  const supabase = await createSupabaseServer()
  const { data: auth } = await supabase.auth.getUser()
  const { data: child, error } = await supabase.from('children').select('first_name').eq('user_id', auth.user?.id ?? '').single()
  if (error) throw new Error(`me: ${error.message}`)
  return { firstName: child.first_name, initial: child.first_name.slice(0, 1).toUpperCase() }
}
