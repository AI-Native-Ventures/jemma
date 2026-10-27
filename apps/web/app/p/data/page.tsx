import Link from 'next/link'
import { getPrivacy } from '@/lib/data/p26'
import { BoardHeader, BoardHeadline, Chevron, ComingButton, Gem, Section, dangerButton, outlineButton } from '../account/_ui'
import { ImproveToggle } from './Improve'

export const metadata = { title: 'Privacy and your data · Jemma' }

export default async function ParentDataPage() {
  const privacy = await getPrivacy()
  const name = privacy?.childName ?? 'your child'
  const rowText = { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 } as const
  return (
    <>
      <BoardHeader href="/p/account" label="Back to your account" title="Privacy and your data" />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, padding: '12px 20px 28px', minHeight: 0 }}>
        <BoardHeadline size={25}>See, fix, download or delete what Jemma keeps about your family.</BoardHeadline>

        <Section id="dl" title="Download everything" gap={10}>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.45, color: '#5D5A73' }}>A ZIP file with marks, photos, lessons and notes.</p>
          <ComingButton style={outlineButton}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
              <path d="M5 19.5h14" />
            </svg>
            Get a copy
          </ComingButton>
        </Section>

        <Section id="consents" title="Your consents" gap={2}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minHeight: 64, padding: '8px 0' }}>
            <span style={{ ...rowText, lineHeight: 1.35 }}>
              <span style={{ fontSize: 16, fontWeight: 500 }}>{name}&apos;s schoolwork is used to teach her</span>
              <span style={{ fontSize: 13, color: '#5D5A73' }}>Agreed {privacy?.agreedOn} · needed for Jemma to work</span>
            </span>
            <span style={{ flex: 'none', padding: '3px 10px', borderRadius: 999, background: '#EEEDF5', fontSize: 12, fontWeight: 700 }}>Required</span>
          </div>
          {privacy ? <ImproveToggle childId={privacy.childId} childName={privacy.childName} initial={privacy.improve} /> : null}
        </Section>

        <Section id="fix" title="Fix something" gap={2}>
          <Link href="/help" style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, padding: '6px 0', textDecoration: 'none', color: '#1F1D36' }}>
            <span style={rowText}>
              <span style={{ fontSize: 16, fontWeight: 500 }}>Something looks wrong</span>
              <span style={{ fontSize: 13, lineHeight: 1.35, color: '#5D5A73' }}>Ask the teacher or the Jemma team</span>
            </span>
            <Chevron />
          </Link>
        </Section>

        <Section id="del" title="Delete" gap={10}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <ComingButton style={dangerButton}>Delete {name}&apos;s data</ComingButton>
            <p style={{ margin: '0 0 8px', fontSize: 14, lineHeight: 1.45, color: '#5D5A73' }}>Her photos, marks and lessons leave Jemma within 30 days.</p>
            <ComingButton style={dangerButton}>Delete my account</ComingButton>
          </div>
        </Section>

        <p style={{ margin: 0, display: 'flex', gap: 10, fontSize: 14, lineHeight: 1.45, color: '#5D5A73' }}>
          <Gem size={12} marginTop={4} />
          <span>These are your rights under POPIA.</span>
        </p>
        <div style={{ flex: 1 }} />
      </main>
    </>
  )
}
