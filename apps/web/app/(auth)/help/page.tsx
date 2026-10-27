import { BackLink, Gem, colors } from '../_parts'
import { HelpList } from './HelpList'

export const metadata = { title: 'Help · Jemma' }

export default function HelpPage() {
  return (
    <>
      <header style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '10px 12px 6px 8px' }}>
        <BackLink href="/p/account" label="Back to your account" />
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, flex: 1, minWidth: 0, color: colors.ink }}>
          <span style={{ fontSize: 17, fontWeight: 700 }}>Help</span>
        </span>
      </header>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18, padding: '12px 20px 28px', minHeight: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Gem marginTop={10} />
            <h1 style={{ margin: 0, fontSize: 27, lineHeight: 1.18, fontWeight: 600, letterSpacing: '-0.015em', textWrap: 'pretty' }}>How can we help?</h1>
          </div>
        </div>
        <HelpList />
        <div style={{ flex: 1 }} />
      </main>
    </>
  )
}
