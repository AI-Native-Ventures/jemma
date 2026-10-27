import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getChildSettings } from '@/lib/data/p26'
import { BoardHeader, BoardHeadline, Chevron, ComingButton, Section, Segmented, ToggleRow } from '../../account/_ui'

export const metadata = { title: 'Settings · Jemma' }

const small = { fontSize: 13, color: '#5D5A73' } as const

export default async function ParentChildSettingsPage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params
  const child = await getChildSettings(childId)
  if (!child) notFound()
  const name = child.firstName
  const loginTitle = child.loginCode ? `Code ${child.loginCode} and her own PIN` : 'Set up her sign-in'

  return (
    <>
      <BoardHeader href={`/p/${childId}/profile`} label={`Back to ${name}'s profile`} small={name} title="Settings" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, padding: '12px 20px 28px', minHeight: 0 }}>
        <BoardHeadline size={25}>{name}&apos;s settings. Most families never need to change these.</BoardHeadline>

        <Section id="about" title={`About ${name}`} gap={2}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 60, padding: '6px 0' }}>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={small}>{name}</span>
              <span style={{ fontSize: 16, fontWeight: 500 }}>
                Grade {child.grade} · {child.schoolName}
              </span>
            </span>
            <ComingButton ariaLabel={`Edit ${name}'s details`} style={{ minHeight: 44, padding: '0 14px', borderRadius: 12, border: '1px solid #8C89A3', background: '#FFFFFF', color: '#1F1D36', fontSize: 14, fontWeight: 600, flex: 'none' }}>
              Edit
            </ComingButton>
          </div>
        </Section>

        <Section id="signin" title={`${name}'s sign-in`} gap={2}>
          <Link href={`/p/${childId}/settings/login`} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, padding: '6px 0', textDecoration: 'none', color: '#1F1D36' }}>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 16, fontWeight: 500 }}>{loginTitle}</span>
              <span style={{ fontSize: 13, lineHeight: 1.35, color: '#5D5A73' }}>She signs in without an email</span>
            </span>
            <Chevron />
          </Link>
        </Section>

        <Section id="teachers" title="Teachers" gap={8}>
          {child.teachers.map((t) => (
            <div key={`${t.name}-${t.className}`} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 60 }}>
              <span aria-hidden="true" style={{ position: 'relative', width: 38, height: 38, flex: 'none', borderRadius: 999, background: '#E9E7F3', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {t.initials}
              </span>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1, lineHeight: 1.35 }}>
                <span style={{ fontSize: 16, fontWeight: 600 }}>{t.name}</span>
                <span style={small}>
                  {t.className} · linked {t.linkedOn}
                </span>
              </span>
            </div>
          ))}
          <ComingButton style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: 12, border: '1px solid #8C89A3', background: '#FFFFFF', color: '#1F1D36', fontSize: 15, fontWeight: 600 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add another teacher&apos;s code
          </ComingButton>
        </Section>

        <Section id="lessons" title="During lessons" gap={14}>
          <Segmented legend="Right or wrong shows" options={['At the end', 'After each question']} initial={0} />
          <Segmented legend={`${name} sees her score`} options={['Hidden', 'Shown']} initial={0} />
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45, color: '#5D5A73' }}>
            {child.teachers[0]?.name ?? 'The teacher'}&apos;s class tests follow her settings.
          </p>
        </Section>

        <Section id="notif" title="Notifications" gap={2}>
          <ToggleRow title="Tonight's lesson is ready" initial />
          <ToggleRow title={`${name} finished a lesson`} initial divider />
        </Section>

        <Link href="/p/data" style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', minHeight: 44, fontSize: 15, fontWeight: 600, color: '#B8381F', textDecoration: 'underline', textUnderlineOffset: 3 }}>
          Remove {name} from Jemma
        </Link>
        <div style={{ flex: 1 }} />
      </div>
    </>
  )
}
