import { createSupabaseServer } from '@/lib/supabase/server'

/** The signed-in child's first name, for the account screen. */
export async function getChildName(): Promise<{ firstName: string; initial: string }> {
  const supabase = await createSupabaseServer()
  const { data: auth } = await supabase.auth.getUser()
  const { data: child, error } = await supabase.from('children').select('first_name').eq('user_id', auth.user?.id ?? '').single()
  if (error) throw new Error(`me: ${error.message}`)
  return { firstName: child.first_name, initial: child.first_name.slice(0, 1).toUpperCase() }
}
