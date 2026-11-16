import Link from 'next/link'
import { isCodeLoginEmail } from '@/lib/child-login'
import { getChildName } from '@/lib/data/p28'
import { createSupabaseServer } from '@/lib/supabase/server'
import { LinkParent } from './LinkParent'
import { JoinClassCard } from '../join/JoinClassCard'
import { MeForm } from './MeForm'

export default async function ChildAccountPage() {
  const { firstName, initial } = await getChildName()
  // A learner who signed up alone has a real email and a password: no PIN to change.
  const { data: auth } = await (await createSupabaseServer()).auth.getUser()
  return (
    <div style={{ background: '#F7F7FA', color: '#1F1D36', lineHeight: 'normal' }}>
      <header className="lg:hidden" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '10px 12px 6px 8px' }}>
        <Link href="/k" aria-label="Back to Today" style={{ width: 44, height: 44, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, color: '#1F1D36' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 6-6 6 6 6" />
          </svg>
        </Link>
        <span style={{ fontSize: 19, fontWeight: 700 }}>Me</span>
      </header>
      <main className="mx-auto lg:max-w-[560px]" style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '18px 20px 30px' }}>
        <MeForm firstName={firstName} initial={initial} hasPin={isCodeLoginEmail(auth.user?.email)} />
        <LinkParent />
        <JoinClassCard where="me" />
      </main>
    </div>
  )
}
