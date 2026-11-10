import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getChildProfileView, dayLabel } from '@/lib/data/p19'
import { getLongViewSummary } from '@/lib/data/p52'
import { BackHeader, Chevron, Diamond, EyeIcon, Page, card, font } from '../../_parts'

const docIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </svg>
)

const chip = { display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 12px', borderRadius: 12, background: '#F4F3F8', fontSize: 14, fontWeight: 600, textDecoration: 'none', color: '#1F1D36' } as const

function Change({ change }: { change: number | null }) {
  if (change === null) return null
  const base = { display: 'inline-flex', alignItems: 'center', minWidth: 52, justifyContent: 'center', padding: '2px 8px', borderRadius: 999, fontSize: 13, fontWeight: 600 } as const
  if (change === 0) return <span style={{ ...base, background: '#F4F3F8', color: '#5D5A73' }}>same</span>
  const down = change < 0
  return (
    <span style={{ ...base, gap: 2, background: down ? '#FFEDE8' : '#EEEDF5', color: down ? '#B8381F' : '#1F1D36' }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={down ? 'down' : 'up'}>
        <path d={down ? 'M12 5v14M6 13l6 6 6-6' : 'M12 19V5M6 11l6-6 6 6'} />
      </svg>
      {Math.abs(change)}
    </span>
  )
}

export default async function ChildProfilePage({ params }: { params: Promise<{ classId: string; childId: string }> }) {
  const { classId, childId } = await params
  const v = await getChildProfileView(classId, childId)
  if (!v) notFound()
  const longView = await getLongViewSummary(childId)
  const base = `/t/${classId}`
  const heading =
    v.average === null
      ? `${v.name} has no marked test yet.`
      : `${v.name} is at ${v.average}%.${v.topGap ? ` Their gap is ${v.topGap.charAt(0).toLowerCase()}${v.topGap.slice(1)}${v.misconception ? `: ${v.misconception.charAt(0).toLowerCase()}${v.misconception.slice(1)}` : ''}.` : ''}`
  return (
    <Page>
      <BackHeader href={`${base}/learners`} kicker={`${v.className} · Learners`} title={v.name} pad="10px 12px 6px 8px" />
      <div style={{ fontFamily: font, display: 'flex', flexDirection: 'column', gap: 18, padding: '10px 20px 20px' }}>
        {v.linkedTo ? (
          <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 12, background: '#EEEDF5', fontSize: 14, lineHeight: 1.4 }}>
            <EyeIcon size={18} stroke={1.9} />
            <span>Same profile {v.linkedTo} sees. You can also fix marks.</span>
          </p>
        ) : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Diamond />
            <h1 style={{ margin: 0, fontSize: 25, lineHeight: 1.18, fontWeight: 600, letterSpacing: '-0.015em', textWrap: 'pretty' }}>{heading}</h1>
          </div>
        </div>

        <section aria-labelledby="needs" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: '#FFFFFF', border: '1px solid #E7E6EF', borderRadius: 18 }}>
          <span aria-hidden="true" style={{ width: 36, height: 36, flex: 'none', borderRadius: 999, background: '#EEEDF5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <h2 id="needs" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Needs you</h2>
            {v.needsYou.length === 0 ? (
              <p style={{ margin: 0, fontSize: 14, color: '#5D5A73' }}>Nothing for {v.name} right now.</p>
            ) : (
              v.needsYou.map((n) => (
                <p key={n.id} style={{ margin: 0, fontSize: 14, color: '#5D5A73' }}>{n.title}</p>
              ))
            )}
          </div>
        </section>

        <section aria-labelledby="marks" style={{ ...card(20), gap: 2, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
            <h2 id="marks" style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Marks by topic</h2>
            <span style={{ fontSize: 13, color: '#5D5A73' }}>Maths · change since Term {Math.max(v.term - 1, 1)}</span>
          </div>
          {v.marks.map((m, i) => (
            <Link
              key={m.name}
              href={m.gapKey ? `${base}/gaps/${m.gapKey}` : v.testId ? `${base}/tests/${v.testId}` : `${base}/tests`}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', ...(i > 0 ? { borderTop: '1px solid #EFEEF4' } : {}), textDecoration: 'none', color: '#1F1D36' }}
            >
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{m.name}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{m.pct}%</span>
                    <Change change={m.change} />
                  </span>
                </span>
                <span aria-hidden="true" style={{ height: 8, borderRadius: 999, background: '#EEEDF5', display: 'flex', overflow: 'hidden' }}>
                  <span style={{ width: `${m.pct}%`, background: '#1F1D36', borderRadius: 999 }} />
                </span>
              </span>
              <Chevron />
            </Link>
          ))}
        </section>

        {v.paper ? (
          <Link
            href={`${base}/tests/${v.paper.testId}`}
            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 12px 14px 14px', background: '#FFFFFF', border: '1px solid #E7E6EF', borderRadius: 18, textDecoration: 'none', color: '#1F1D36' }}
          >
            <span style={{ width: 58, height: 58, flex: 'none', borderRadius: 16, background: '#EEEDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {v.paper.right}/{v.paper.outOf}
            </span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.3 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#5D5A73' }}>Papers</span>
              <span style={{ fontSize: 16, fontWeight: 600 }}>{v.paper.title} · {dayLabel(v.paper.writtenOn)}</span>
              <span style={{ fontSize: 14, color: '#5D5A73' }}>See her paper or fix a mark</span>
            </span>
            <Chevron />
          </Link>
        ) : null}

        {v.noticed.length > 0 ? (
          <section aria-labelledby="noticed" style={{ ...card(20), padding: '16px 16px 4px' }}>
            <h2 id="noticed" style={{ margin: '0 0 2px', fontSize: 17, fontWeight: 600 }}>What Jemma has noticed</h2>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {v.noticed.map((n, i) => (
                <li key={i} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 0', ...(i > 0 ? { borderTop: '1px solid #EFEEF4' } : {}) }}>
                  <span style={{ fontSize: 16, lineHeight: 1.45, fontWeight: 500 }}>{n.text}</span>
                  <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {n.chips.map((c) => (
                      <Link key={c} href={v.testId ? `${base}/tests/${v.testId}` : `${base}/tests`} style={chip}>{docIcon}{c}</Link>
                    ))}
                    {i === 0 && v.topGap ? (
                      <Link href={`${base}/gaps`} style={chip}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M9 18h6M10 21h4" />
                          <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.3 1.1 2.2h5c0-.9.5-1.7 1.1-2.2A6 6 0 0 0 12 3z" />
                        </svg>
                        How to reteach
                      </Link>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <Link
          href={`${base}/learners/${v.id}/long-view`}
          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 12px 14px 14px', background: '#FFFFFF', border: '1px solid #E7E6EF', borderRadius: 18, textDecoration: 'none', color: '#1F1D36' }}
        >
          <span aria-hidden="true" style={{ width: 38, height: 38, flex: 'none', borderRadius: 12, background: '#EEEDF5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="7" r="1.6" /><circle cx="12" cy="7" r="1.6" /><circle cx="18" cy="7" r="1.6" /><circle cx="6" cy="17" r="1.6" /><circle cx="12" cy="17" r="1.6" /><circle cx="18" cy="17" r="1.6" /></svg>
          </span>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.3 }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>Long view</span>
            <span style={{ fontSize: 14, color: '#5D5A73' }}>{longView}</span>
          </span>
          <Chevron />
        </Link>

        <section aria-labelledby="tnotes" style={{ ...card(20), gap: 12, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <h2 id="tnotes" style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Your notes</h2>
            </div>
          </div>
          {v.latestNote ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#5D5A73' }}>{v.latestNote.label}</span>
              <span style={{ fontSize: 15, lineHeight: 1.45 }}>{v.latestNote.text}</span>
            </div>
          ) : null}
          <Link href={`${base}/learners/${v.id}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 46, borderRadius: 12, border: '1.5px solid #1F1D36', color: '#1F1D36', fontSize: 15, fontWeight: 600, textDecoration: 'none' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            Add a note
          </Link>
          {v.linkedTo ? <p style={{ margin: 0, fontSize: 13, color: '#5D5A73' }}>{v.linkedTo} sees your notes on {v.name}&apos;s profile.</p> : null}
        </section>

        <section aria-label="Attendance and tonight" style={{ ...card(20), padding: '4px 16px' }}>
          <Link href={`${base}/register`} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 60, padding: '8px 0', textDecoration: 'none', color: '#1F1D36' }}>
            <span aria-hidden="true" style={{ width: 38, height: 38, flex: 'none', borderRadius: 12, background: '#EEEDF5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></svg>
            </span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.3 }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>Attendance</span>
              <span style={{ fontSize: 14, color: '#5D5A73' }}>{v.attendanceLine}</span>
            </span>
            <Chevron />
          </Link>
          {v.tonight ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 60, padding: '8px 0', borderTop: '1px solid #EFEEF4' }}>
              <span aria-hidden="true" style={{ width: 38, height: 38, flex: 'none', borderRadius: 12, background: '#FFE3DA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="5" width="17" height="5" rx="1" /><rect x="3.5" y="14" width="17" height="5" rx="1" /><path d="M12 5v5M8 14v5M12 14v5M16 14v5" /></svg>
              </span>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.3 }}>
                <span style={{ fontSize: 16, fontWeight: 600 }}>Tonight at home</span>
                <span style={{ fontSize: 14, color: '#5D5A73' }}>{v.tonight.topic} · {v.tonight.format} · {v.tonight.minutes} minutes</span>
              </span>
            </div>
          ) : null}
        </section>
      </div>
    </Page>
  )
}
