import { redirect } from 'next/navigation'
import { Wordmark } from '@/components/install'
import { HOMES } from '@/components/blocks/nav'
import { createSupabaseServer } from '@/lib/supabase/server'
import { BackLink, colors } from '../../_parts'
import { LearnerStartForm } from './LearnerStartForm'

export const metadata = { title: 'Pick your grade · Jemma' }

/**
 * The one short screen after "Learner" on the role screen (P111): the grade (1 to 12) and the country, then "Start practising". A person who is not
 * signed in goes to sign in; a person who already has a role goes home (a learner who already started goes to /k), so nobody starts twice.
 */
export default async function LearnerStartPage() {
  const supabase = await createSupabaseServer()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect('/sign-in')
  const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', data.user.id).maybeSingle()
  if (profile) redirect(HOMES[profile.role])

  return (
    <>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 12px 0 8px' }}>
        <BackLink href="/role" label="Back" />
        <Wordmark width={82} height={32} style={{ marginRight: 8 }} />
      </header>

      <main style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '24px 20px 32px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h1 style={{ margin: 0, fontSize: 30, lineHeight: 1.12, fontWeight: 700, letterSpacing: '-0.02em' }}>Which grade are you in?</h1>
          <p style={{ margin: 0, fontSize: 17, lineHeight: 1.45, color: colors.body }}>Jemma opens the maths for your grade. You can add other grades later.</p>
        </div>
        <LearnerStartForm />
      </main>
    </>
  )
}
