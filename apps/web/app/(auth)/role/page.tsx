import { redirect } from 'next/navigation'
import { Wordmark } from '@/components/install'
import { HOMES } from '@/components/blocks/nav'
import { chooseRole } from '@/lib/auth'
import { createSupabaseServer } from '@/lib/supabase/server'
import { BackLink, ChevronRight, colors } from '../_parts'
import { ComingButton } from '../_coming'
import Link from 'next/link'

export const metadata = { title: 'Pick a role · Jemma' }

const card = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  width: '100%',
  padding: '18px 16px',
  minHeight: 104,
  background: '#FFFFFF',
  border: `1px solid ${colors.line}`,
  borderRadius: 20,
  textDecoration: 'none',
  color: colors.ink,
  textAlign: 'left',
  cursor: 'pointer',
} as const

const stroke = { fill: 'none', stroke: '#1F1D36', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

function Tile({ bg, children }: { bg: string; children: React.ReactNode }) {
  return (
    <span aria-hidden="true" style={{ width: 52, height: 52, flex: 'none', borderRadius: 16, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </span>
  )
}

function Words({ title, line }: { title: string; line: string }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
      <span style={{ fontSize: 19, fontWeight: 600 }}>{title}</span>
      <span style={{ fontSize: 15, lineHeight: 1.4, color: colors.body }}>{line}</span>
    </span>
  )
}

export default async function RolePage() {
  const supabase = await createSupabaseServer()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect('/sign-in')
  const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', data.user.id).maybeSingle()
  if (profile) redirect(HOMES[profile.role])

  return (
    <>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 12px 0 8px' }}>
        <BackLink href="/sign-in" label="Back" />
        <Wordmark width={82} height={32} style={{ marginRight: 8 }} />
      </header>

      <main style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '24px 20px 32px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h1 style={{ margin: 0, fontSize: 30, lineHeight: 1.12, fontWeight: 700, letterSpacing: '-0.02em' }}>How will you use Jemma?</h1>
          <p style={{ margin: 0, fontSize: 17, lineHeight: 1.45, color: colors.body }}>This decides what you see first.</p>
        </div>

        <nav aria-label="Roles" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <form action={chooseRole.bind(null, 'teacher')}>
            <button type="submit" style={card}>
              <Tile bg="#E9E7F3">
                <svg width="26" height="26" viewBox="0 0 24 24" {...stroke}>
                  <rect x="3.5" y="4" width="17" height="11.5" rx="1.5" />
                  <path d="M8 20.5l4-5 4 5" />
                  <path d="M7.5 8.5h6M7.5 11.5h9" />
                </svg>
              </Tile>
              <Words title="Teacher" line="I snap my class's tests and see what they don't get yet." />
              <ChevronRight />
            </button>
          </form>
          <form action={chooseRole.bind(null, 'parent')}>
            <button type="submit" style={card}>
              <Tile bg="#FFE3DA">
                <svg width="26" height="26" viewBox="0 0 24 24" {...stroke}>
                  <circle cx="9" cy="7" r="3" />
                  <path d="M3.5 19.5c.5-3.5 2.6-5.5 5.5-5.5s5 2 5.5 5.5" />
                  <circle cx="17.5" cy="11" r="2.2" />
                  <path d="M15.2 19.5c.3-2.2 1.2-3.6 2.3-3.6s2.1 1.4 2.4 3.6" />
                </svg>
              </Tile>
              <Words title="Parent" line="I support my child at home and want to know they're okay." />
              <ChevronRight />
            </button>
          </form>
          <ComingButton style={card}>
            <Tile bg="#FFD3C7">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="1.8" strokeLinejoin="round">
                <path d="M12 3 21 12 12 21 3 12z" />
                <path d="M7.5 7.5 12 12l4.5-4.5" />
              </svg>
            </Tile>
            <Words title="Learner · Grade 8 to 12" line="I fix my own gaps with my Jemma." />
            <ChevronRight />
          </ComingButton>
        </nav>
        <p style={{ margin: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px 8px', fontSize: 15, color: colors.body }}>
          Grade 7 or younger? A grown-up adds you.
          <Link href="/k/sign-in" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, fontWeight: 600, color: colors.ink, textDecoration: 'underline', textUnderlineOffset: 3 }}>
            Sign in with your code
          </Link>
        </p>
      </main>
    </>
  )
}
