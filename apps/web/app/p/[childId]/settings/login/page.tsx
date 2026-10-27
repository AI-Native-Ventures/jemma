import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getChildSettings } from '@/lib/data/p26'
import { Wordmark } from '@/components/install'
import { BoardHeader, BoardHeadline, Gem, } from '../../../account/_ui'
import { outlineButton } from '../../../account/_styles'
import { NewCodeButton } from '../PinSheet'
import { PrintButton } from './PrintButton'

export const metadata = { title: 'Sign-in · Jemma' }

export default async function ParentChildLoginPage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params
  const child = await getChildSettings(childId)
  if (!child) notFound()
  const name = child.firstName
  const teacher = child.teachers[0]?.name ?? 'The teacher'

  return (
    <>
      <BoardHeader href={`/p/${childId}/settings`} label={`Back to ${name}'s settings`} small={name} title={`${name}'s sign-in`} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18, padding: '12px 20px 28px', minHeight: 0 }}>
        <BoardHeadline size={26}>{name} signs in with her own code and PIN. No email needed.</BoardHeadline>

        <section aria-labelledby="card" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 20, background: '#FFFFFF', border: '2px dashed #CFCDDC', borderRadius: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Wordmark width={72} height={28} />
            <h2 id="card" style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#5D5A73' }}>
              {name}&apos;s sign-in
            </h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 14, color: '#5D5A73' }}>{name}&apos;s code</span>
            <span style={{ fontSize: 38, lineHeight: 1.1, fontWeight: 700, letterSpacing: '0.16em' }}>{child.loginCode ?? 'Not made yet'}</span>
          </div>
          <p style={{ margin: 0, display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 14, background: '#FFF4F1', fontSize: 15, lineHeight: 1.45 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="5" y="10.5" width="14" height="10" rx="2" />
              <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
            </svg>
            <span>
              <strong style={{ fontWeight: 600 }}>PIN:</strong> {name} picks it the first time she signs in.
            </span>
          </p>
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <PrintButton>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M7 8V3.5h10V8" />
              <rect x="3.5" y="8" width="17" height="9" rx="2" />
              <path d="M7 14h10v6.5H7z" />
            </svg>
            Print the card
          </PrintButton>
          <NewCodeButton childId={childId} childName={name} style={outlineButton}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 12a8 8 0 1 1-2.34-5.66" />
              <path d="M20 4v4.5h-4.5" />
            </svg>
            Make a new code
          </NewCodeButton>
          <p style={{ margin: 0, fontSize: 14, color: '#5D5A73' }}>The old code stops working.</p>
        </div>

        <p style={{ margin: 0, display: 'flex', gap: 10, fontSize: 14, lineHeight: 1.45, color: '#5D5A73' }}>
          <Gem size={12} marginTop={4} />
          <span>Keep the code at home. {teacher} can&apos;t see it.</span>
        </p>

        <Link href={`/p/${childId}/settings`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 14, background: '#1F1D36', color: '#FFFFFF', fontSize: 17, fontWeight: 600, textDecoration: 'none' }}>
          Done
        </Link>
        <div style={{ flex: 1 }} />
      </div>
    </>
  )
}
