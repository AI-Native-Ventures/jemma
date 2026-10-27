import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { getChildGaps, type GapRow } from '@/lib/data/p28'
import { isSameDay, shortDate, weekdayName } from '@/lib/data/p28-format'

const h2: CSSProperties = { margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 17, fontWeight: 700 }
const section: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 }
const sub: CSSProperties = { fontSize: 14, color: '#5D5A73' }

function Heading({ id, icon, children }: { id: string; icon: ReactNode; children: string }) {
  return (
    <h2 id={id} style={h2}>
      {icon}
      {children}
    </h2>
  )
}

const FixedGem = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={size === 22 ? { flex: 'none' } : undefined}>
    <polygon points="8,1 15,8 8,15 1,8" fill="#FF6A4D" />
  </svg>
)

function headline(fixing: number, fixed: number): string {
  if (fixing === 0 && fixed === 0) return 'No gaps yet. Jemma will tell you when it finds one.'
  const gaps = `${fixing} ${fixing === 1 ? 'gap' : 'gaps'}`
  if (fixing === 0) return `Nothing to fix right now. ${fixed} ${fixed === 1 ? 'is' : 'are'} already fixed.`
  return `You're fixing ${gaps}. ${fixed} ${fixed === 1 ? 'is' : 'are'} already fixed.`
}

function NewCard({ gap }: { gap: GapRow }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16, background: '#FFFFFF', border: '1px solid #E7E6EF', borderRadius: 20 }}>
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 18, fontWeight: 600 }}>{gap.topic}</span>
        <span style={sub}>
          {gap.next
            ? isSameDay(gap.next.day)
              ? 'Your lesson is tonight'
              : `Your lesson is on ${weekdayName(gap.next.day)}`
            : 'Jemma is planning your lesson'}
        </span>
      </span>
      <Link
        href={gap.next?.href ?? '/k'}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 46, padding: '0 16px', borderRadius: 14, background: '#1F1D36', color: '#FFFFFF', fontSize: 15, fontWeight: 600, textDecoration: 'none', flex: 'none' }}
      >
        Practise
      </Link>
    </div>
  )
}

function PractisingCard({ gap }: { gap: GapRow }) {
  const moved = gap.practisedAt ? (isSameDay(gap.practisedAt) ? 'Moved here tonight.' : `Moved here on ${shortDate(gap.practisedAt)}.`) : ''
  const check = gap.next ? `Quick check on ${weekdayName(gap.next.day)}.` : ''
  // Three steps: finished sessions in ink, the next one in coral, the rest grey.
  const done = Math.min(gap.sessionsDone, 2)
  const colour = (i: number) => (i < done ? '#1F1D36' : i === done ? '#FF6A4D' : '#E3E1EE')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, background: '#FFFFFF', border: '2px solid #1F1D36', borderRadius: 20 }}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.3 }}>{gap.topic}</span>
        <span style={sub}>{[moved, check].filter(Boolean).join(' ')}</span>
      </span>
      <span aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 4 }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ height: 8, borderRadius: 999, background: colour(i) }} />
        ))}
      </span>
    </div>
  )
}

export default async function ChildGapsPage() {
  const { firstName, initial, gaps } = await getChildGaps()
  const fresh = gaps.filter((g) => g.stage === 'new')
  const practising = gaps.filter((g) => g.stage === 'practising')
  const fixed = gaps.filter((g) => g.stage === 'fixed').sort((a, b) => (b.fixedAt ?? '').localeCompare(a.fixedAt ?? ''))

  return (
    <div style={{ background: '#F7F7FA', color: '#1F1D36', lineHeight: 'normal' }}>
      <header className="lg:hidden" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 12px 4px 18px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/jemma-app-icon.svg" alt="" style={{ width: 34, height: 34, display: 'block' }} />
          <span style={{ fontSize: 19, fontWeight: 700 }}>{firstName}&apos;s Jemma</span>
        </span>
        <Link href="/k/me" aria-label={`${firstName}'s account`} style={{ width: 44, height: 44, borderRadius: 999, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, textDecoration: 'none', color: '#1F1D36' }}>
          <span style={{ width: 36, height: 36, borderRadius: 999, background: '#FFD3C7', color: '#1F1D36', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initial}</span>
        </Link>
      </header>

      <main className="mx-auto lg:max-w-[560px]" style={{ display: 'flex', flexDirection: 'column', gap: 22, padding: '18px 20px 22px' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none', marginTop: 11 }}>
            <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" />
          </svg>
          <h1 style={{ margin: 0, fontSize: 29, lineHeight: 1.15, fontWeight: 700, letterSpacing: '-0.02em', textWrap: 'pretty' }}>
            {headline(fresh.length + practising.length, fixed.length)}
          </h1>
        </div>

        {fresh.length > 0 && (
          <section aria-labelledby="new" style={section}>
            <Heading
              id="new"
              icon={
                <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
                  <polygon points="8,1.8 14.2,8 8,14.2 1.8,8" fill="none" stroke="#1F1D36" strokeWidth="1.5" />
                </svg>
              }
            >
              New
            </Heading>
            {fresh.map((g) => (
              <NewCard key={g.id} gap={g} />
            ))}
          </section>
        )}

        {practising.length > 0 && (
          <section aria-labelledby="prac" style={section}>
            <Heading
              id="prac"
              icon={
                <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
                  <polygon points="1,8 15,8 8,15" fill="#FF6A4D" />
                  <polygon points="8,1 15,8 8,15 1,8" fill="none" stroke="#1F1D36" strokeWidth="1.4" />
                </svg>
              }
            >
              Practising
            </Heading>
            {practising.map((g) => (
              <PractisingCard key={g.id} gap={g} />
            ))}
          </section>
        )}

        {fixed.length > 0 && (
          <section aria-labelledby="fixed" style={section}>
            <Heading id="fixed" icon={<FixedGem size={18} />}>
              Fixed
            </Heading>
            <ul style={{ listStyle: 'none', margin: 0, padding: '4px 16px', display: 'flex', flexDirection: 'column', background: '#FFFFFF', border: '1px solid #E7E6EF', borderRadius: 20 }}>
              {fixed.map((g, i) => (
                <li key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, ...(i > 0 ? { borderTop: '1px solid #EFEEF4' } : {}) }}>
                  <FixedGem size={22} />
                  <span style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>{g.topic}</span>
                  {g.fixedAt && <span style={{ fontSize: 13, color: '#5D5A73' }}>{shortDate(g.fixedAt)}</span>}
                </li>
              ))}
            </ul>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45, color: '#5D5A73' }}>Fixed means you got it right again days later, so it stuck.</p>
          </section>
        )}
      </main>
    </div>
  )
}
