import { PendingButton } from '@/components/ui/Button'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { getDemoState } from '@/lib/demo'
import { getPendingLink, initialsOf } from '@/lib/data/p22'
import { AccountLink, BrandHeader, DemoTag, Gem, Main, Page, body, ink, line } from '../_parts'
import { switchToTeacher } from './actions'

export const metadata = { title: 'Waiting for the teacher · Jemma' }

export default async function LinkPendingPage() {
  const { userId, profile } = await requireRole('parent')
  const pending = await getPendingLink(userId)
  if (!pending) redirect('/p')
  const demo = await getDemoState()
  const { childName, teacherName } = pending

  return (
    <Page>
      <BrandHeader>
        <AccountLink initials={initialsOf(profile.display_name)} />
      </BrandHeader>
      <Main gap={18} padding="18px 20px 28px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: body }}>Linking {childName}</p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Gem marginTop={11} />
            <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.18, fontWeight: 600, letterSpacing: '-0.015em', textWrap: 'pretty' }}>
              Waiting for {teacherName} to say yes.
            </h1>
          </div>
        </div>

        <section aria-label="Your request" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 18, background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span aria-hidden="true" style={{ width: 44, height: 44, flex: 'none', borderRadius: 12, background: '#EEEDF5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="8.5" />
                <path d="M12 7.5V12l3 2" />
              </svg>
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.3 }}>
              <span style={{ fontSize: 17, fontWeight: 600 }}>{pending.className} · {pending.schoolName}</span>
              <span style={{ fontSize: 14, color: body }}>Asked at {pending.askedAt} · {teacherName}</span>
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>
            {teacherName} checks that you&apos;re {childName}&apos;s parent. Most teachers answer within a school day.
          </p>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45, color: body }}>Her answer shows up in Needs you on {childName}&apos;s profile.</p>
        </section>

        <a href={`/p/${pending.childId}/snap`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 56, padding: '12px 20px', textAlign: 'center', textWrap: 'balance', borderRadius: 14, border: `1.5px solid ${ink}`, background: '#FFFFFF', color: ink, fontSize: 17, fontWeight: 600, textDecoration: 'none' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
            <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
            <circle cx="12" cy="12.5" r="3.5" />
          </svg>
          Snap {childName}&apos;s homework meanwhile
        </a>

        {demo ? (
          <section aria-labelledby="demo" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, background: '#FFF4F1', border: '1px solid #FFC9BB', borderRadius: 20 }}>
            <p style={{ margin: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <DemoTag />
              <span id="demo" style={{ fontSize: 15, fontWeight: 600 }}>In the demo you are {teacherName} too.</span>
            </p>
            <form action={switchToTeacher}>
              <PendingButton type="submit" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 56, padding: '12px 20px', textAlign: 'center', textWrap: 'balance', width: '100%', borderRadius: 14, background: ink, color: '#FFFFFF', fontSize: 17, fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                Switch to {teacherName} to approve
              </PendingButton>
            </form>
            <a href={`/p/${pending.childId}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, fontSize: 15, fontWeight: 600, color: ink, textDecoration: 'underline', textUnderlineOffset: 3 }}>
              Approved already? Open {childName}&apos;s profile
            </a>
          </section>
        ) : null}
        <div style={{ flex: 1 }} />
      </Main>
    </Page>
  )
}
