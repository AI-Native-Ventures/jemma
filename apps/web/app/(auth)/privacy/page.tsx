import Link from 'next/link'
import { BackLink, ChevronRight, Gem, Section, colors } from '../_parts'
import { ComingButton } from '../_coming'

export const metadata = { title: 'Privacy · Jemma' }

const KEEPS = ['Paper photos and marks', 'Lessons and the answers to them', 'Teacher notes and attendance', 'Activities you add']

const stroke = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: '#1F1D36', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

const SEES = [
  {
    who: 'Teacher',
    what: 'Learners in their own class',
    icon: (
      <svg {...stroke}>
        <rect x="3.5" y="4.5" width="17" height="11" rx="1.5" />
        <path d="M8 19.5h8M12 15.5v4" />
      </svg>
    ),
  },
  {
    who: 'Parent',
    what: 'Children they are linked to, after the teacher says yes',
    icon: (
      <svg {...stroke}>
        <circle cx="9" cy="7.5" r="3" />
        <path d="M3.5 19c.6-3.4 2.8-5.5 5.5-5.5s4.9 2.1 5.5 5.5" />
        <circle cx="17.5" cy="11" r="2" />
        <path d="M15.5 19c.3-2 1.2-3.3 2.6-3.6" />
      </svg>
    ),
  },
  {
    who: 'Child',
    what: 'Only themselves',
    icon: (
      <svg {...stroke}>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M6 20c.7-3.7 3-6 6-6s5.3 2.3 6 6" />
      </svg>
    ),
  },
  {
    who: 'Jemma team',
    what: 'Nobody, unless you ask us for help',
    icon: (
      <svg {...stroke}>
        <path d="M12 3.5 20.5 12 12 20.5 3.5 12z" />
      </svg>
    ),
  },
]

const para = { margin: 0, fontSize: 15, lineHeight: 1.5 } as const
const pill = { minHeight: 44, padding: '0 10px', borderRadius: 12, border: `1.5px solid ${colors.ink}`, background: '#FFFFFF', color: colors.ink, fontSize: 15, fontWeight: 600, cursor: 'pointer' } as const

export default function PrivacyPage() {
  return (
    <>
      <header style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '10px 12px 6px 8px' }}>
        <BackLink href="/sign-up" label="Back" />
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, flex: 1, minWidth: 0, color: colors.ink }}>
          <span style={{ fontSize: 17, fontWeight: 700 }}>Privacy</span>
        </span>
      </header>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, padding: '12px 20px 28px', minHeight: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Gem marginTop={10} />
            <h1 style={{ margin: 0, fontSize: 25, lineHeight: 1.18, fontWeight: 600, letterSpacing: '-0.015em', textWrap: 'pretty' }}>
              Your child&apos;s work stays yours. Here is what Jemma keeps and who sees it.
            </h1>
          </div>
        </div>

        <Section id="keeps" title="What Jemma keeps" gap={10}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
            {KEEPS.map((k) => (
              <li key={k} style={{ display: 'flex', gap: 10, fontSize: 15, lineHeight: 1.45 }}>
                <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none', marginTop: 5 }}>
                  <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" />
                </svg>
                <span>{k}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="sees" title="Who sees what" gap={4}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {SEES.map((s, i) => (
              <li key={s.who} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, padding: '6px 0', borderTop: i ? '1px solid #EFEEF4' : undefined }}>
                <span aria-hidden="true" style={{ width: 36, height: 36, flex: 'none', borderRadius: 12, background: '#EEEDF5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {s.icon}
                </span>
                <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1, lineHeight: 1.35 }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{s.who}</span>
                  <span style={{ fontSize: 14, color: colors.body }}>{s.what}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="ai" title="AI services" gap={10}>
          <p style={para}>Jemma sends paper photos to an AI service to read them. That service doesn&apos;t keep them or learn from them.</p>
        </Section>

        <Section id="kids" title="Children" gap={10}>
          <p style={para}>South Africa&apos;s POPIA law treats under-18s as children, so a parent or guardian agrees before a child&apos;s work is used.</p>
        </Section>

        <Section id="rights" title="Your rights" gap={6}>
          <p style={para}>You can see, fix, download or delete what Jemma keeps.</p>
          <Link href="/p/data" style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, padding: '6px 0', borderTop: '1px solid #EFEEF4', textDecoration: 'none', color: colors.ink }}>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 16, fontWeight: 500 }}>Privacy and your data</span>
              <span style={{ fontSize: 13, lineHeight: 1.35, color: colors.body }}>Download or delete, any time</span>
            </span>
            <ChevronRight />
          </Link>
        </Section>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          <ComingButton style={pill}>Full privacy policy</ComingButton>
          <ComingButton style={pill}>Terms of use</ComingButton>
        </div>
        <div style={{ flex: 1 }} />
      </main>
    </>
  )
}
