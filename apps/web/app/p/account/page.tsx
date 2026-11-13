import { PendingButton } from '@/components/ui/Button'
import Link from 'next/link'
import { getAccount } from '@/lib/data/p26'
import { BoardHeader, Chevron, ComingButton, ToggleRow} from './_ui'
import { outlineButton } from './_styles'
import { signOut } from './actions'

export const metadata = { title: 'Your account · Jemma' }

const rowLink = { display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, padding: '6px 0', textDecoration: 'none', color: '#1F1D36' } as const
const rowButton = { display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 56, padding: '6px 0', border: 'none', borderTop: '1px solid #EFEEF4', background: 'transparent', color: '#1F1D36', textAlign: 'left' } as const
const rowText = { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 } as const

export default async function ParentAccountPage() {
  const account = await getAccount()
  const firstChild = account.children[0]
  return (
    <>
      <BoardHeader href="/p" label="Back" title="Your account" />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, padding: '12px 20px 28px', minHeight: 0 }}>
        <section style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: 16, background: '#FFFFFF', border: '1px solid #E7E6EF', borderRadius: 20 }}>
          <span aria-hidden="true" style={{ width: 56, height: 56, flex: 'none', borderRadius: 999, background: '#FFE3DA', fontSize: 19, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {account.initials}
          </span>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 2 }}>
            <h1 style={{ margin: 0, fontSize: 22, lineHeight: 1.2, fontWeight: 700, letterSpacing: '-0.01em' }}>{account.name}</h1>
            <span style={{ fontSize: 14, color: '#5D5A73', lineHeight: 1.4, overflowWrap: 'anywhere' }}>{account.email}</span>
            <ComingButton style={{ alignSelf: 'flex-start', minHeight: 44, marginBottom: -8, padding: 0, border: 'none', background: 'transparent', fontSize: 15, fontWeight: 600, color: '#1F1D36', textDecoration: 'underline', textUnderlineOffset: 3 }}>
              Edit your details
            </ComingButton>
          </div>
        </section>

        <section aria-label="Settings" style={{ display: 'flex', flexDirection: 'column', padding: '6px 16px', background: '#FFFFFF', border: '1px solid #E7E6EF', borderRadius: 20 }}>
          <Link href="/p" style={rowLink}>
            <span style={rowText}>
              <span style={{ fontSize: 16, fontWeight: 500 }}>Your children</span>
              <span style={{ fontSize: 13, lineHeight: 1.35, color: '#5D5A73' }}>{account.children.map((c) => c.firstName).join(', ')}</span>
            </span>
            <Chevron />
          </Link>
          {/* The notifications screen exists: the bell on the home screen opens it for the first child, and so does this row. */}
          {firstChild ? (
            <Link href={`/p/${firstChild.id}/notifications`} style={{ ...rowLink, borderTop: '1px solid #EFEEF4' }}>
              <span style={rowText}>
                <span style={{ fontSize: 16, fontWeight: 500 }}>Notifications</span>
                <span style={{ fontSize: 13, lineHeight: 1.35, color: '#5D5A73' }}>In the app · lesson ready and lesson finished</span>
              </span>
              <Chevron />
            </Link>
          ) : (
            <ComingButton style={rowButton}>
              <span style={rowText}>
                <span style={{ fontSize: 16, fontWeight: 500 }}>Notifications</span>
                <span style={{ fontSize: 13, lineHeight: 1.35, color: '#5D5A73' }}>In the app · lesson ready and lesson finished</span>
              </span>
              <Chevron />
            </ComingButton>
          )}
          <ToggleRow title="Data saver" detail="Download audio lessons on Wi-Fi only" initial={false} divider />
          {/* SLOT: "Where Jemma's AI runs" (cloud or desktop runner, AI runners section of the plan) goes here, between Data saver and Privacy. */}
          <Link href="/p/data" style={{ ...rowLink, borderTop: '1px solid #EFEEF4' }}>
            <span style={rowText}>
              <span style={{ fontSize: 16, fontWeight: 500 }}>Privacy and your data</span>
            </span>
            <Chevron />
          </Link>
          <Link href="/help" style={{ ...rowLink, borderTop: '1px solid #EFEEF4' }}>
            <span style={rowText}>
              <span style={{ fontSize: 16, fontWeight: 500 }}>Help</span>
            </span>
            <Chevron />
          </Link>
        </section>

        <form action={signOut} style={{ display: 'flex', flexDirection: 'column' }}>
          <PendingButton type="submit" style={{ ...outlineButton, fontSize: 17 }}>
            Sign out
          </PendingButton>
        </form>
        <div style={{ flex: 1 }} />
      </main>
    </>
  )
}
