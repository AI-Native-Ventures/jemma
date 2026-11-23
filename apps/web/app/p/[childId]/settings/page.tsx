import Link from 'next/link'
import { EditName } from '../../account/EditName'
import { saveChildName } from './actions'
import { notFound } from 'next/navigation'
import { getChildSettings } from '@/lib/data/p26'
import { BoardHeader, BoardHeadline, Chevron, Section } from '../../account/_ui'

export const metadata = { title: 'Settings · Jemma' }

const small = { fontSize: 13, color: '#5C5A55' } as const

export default async function ParentChildSettingsPage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params
  const child = await getChildSettings(childId)
  if (!child) notFound()
  const name = child.firstName
  const loginTitle = child.loginCode ? `Code ${child.loginCode} and ${name}'s own PIN` : `Set up ${name}'s sign-in`

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
            <EditName button="Edit" ariaLabel={`Edit ${name}'s name`} buttonStyle={{ minHeight: 44, padding: '0 14px', borderRadius: 12, border: '1px solid #8F8D88', background: '#FFFFFF', color: '#161616', fontSize: 14, fontWeight: 600, flex: 'none' }} title={`${name}'s name`} label="First name" initial={name} onSave={saveChildName.bind(null, childId)} />
          </div>
        </Section>

        <Section id="signin" title={`${name}'s sign-in`} gap={2}>
          <Link href={`/p/${childId}/settings/login`} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, padding: '6px 0', textDecoration: 'none', color: '#161616' }}>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 16, fontWeight: 500 }}>{loginTitle}</span>
              <span style={{ fontSize: 13, lineHeight: 1.35, color: '#5C5A55' }}>{name} signs in without an email</span>
            </span>
            <Chevron />
          </Link>
        </Section>

        <Section id="teachers" title="Teachers" gap={8}>
          {child.teachers.map((t) => (
            <div key={`${t.name}-${t.className}`} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 60 }}>
              <span aria-hidden="true" style={{ position: 'relative', width: 38, height: 38, flex: 'none', borderRadius: 999, background: '#ECE9E2', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
        </Section>

        <Link href="/p/data" style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', minHeight: 44, fontSize: 15, fontWeight: 600, color: '#B8281E', textDecoration: 'underline', textUnderlineOffset: 3 }}>
          Remove {name} from Jemma
        </Link>
        <div style={{ flex: 1 }} />
      </div>
    </>
  )
}
