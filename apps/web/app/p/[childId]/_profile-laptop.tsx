import Link from 'next/link'
import type { ReactNode } from 'react'
import type { MarkRow, ProfileData } from '@/lib/data/p23'
import type { ProfileExtras } from '@/lib/data/p36'
import { ChevronSvg, LaptopShell, PAPER_ICON } from './_laptop'
import { css } from './beyond/_parts'

type Chip = ProfileData['notices'][number]['chips'][number]

const ICONS: Record<Chip['kind'], ReactNode> = {
  paper: PAPER_ICON,
  camera: (
    <>
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </>
  ),
  bulb: (
    <>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.3 1.1 2.2h5c0-.9.5-1.7 1.1-2.2A6 6 0 0 0 12 3z" />
    </>
  ),
}

function Chips({ chips, dark }: { chips: Chip[]; dark?: boolean }) {
  const bg = dark ? 'rgba(255,255,255,0.12)' : '#F4F3F8'
  const color = dark ? '#FFFFFF' : '#1F1D36'
  return (
    <span style={css(`display:flex;flex-wrap:wrap;gap:6px;${dark ? 'margin-top:4px' : ''}`)}>
      {chips.map((c) => (
        <Link
          key={c.href + c.label}
          href={c.href}
          style={css(`display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 12px;border-radius:12px;background:${bg};font-size:14px;font-weight:600;text-decoration:none;color:${color}`)}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {ICONS[c.kind]}
          </svg>
          {c.label}
        </Link>
      ))}
    </span>
  )
}

const PILL = 'display:inline-flex;align-items:center;justify-content:center;padding:2px 8px;border-radius:999px;font-size:13px;font-weight:600'

function Change({ row }: { row: MarkRow }) {
  if (row.change === null || row.change === 0) {
    return <span style={css(`${PILL};background:#F4F3F8;color:#5D5A73`)}>{row.change === 0 ? 'same' : 'new'}</span>
  }
  const down = row.change < 0
  return (
    <span style={css(`${PILL};gap:2px;${down ? 'background:#FFEDE8;color:#B8381F' : 'background:#EEEDF5'}`)}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={down ? 'down' : 'up'}>
        <path d={down ? 'M12 5v14M6 13l6 6 6-6' : 'M12 19V5M6 11l6-6 6 6'} />
      </svg>
      {Math.abs(row.change)}
    </span>
  )
}

const CARD = 'display:flex;flex-direction:column;background:#FFFFFF;border:1px solid #E7E6EF;border-radius:20px'
const COLS = 'display:grid;grid-template-columns:minmax(0, 1.3fr) minmax(0, 1fr) 52px 64px;align-items:center;gap:14px;min-height:48px;text-decoration:none;color:#1F1D36'

const ACTIVITY_ICON: Record<string, ReactNode> = {
  sport: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.6 2.4 2.6 14.6 0 17M12 3.5c-2.6 2.4-2.6 14.6 0 17" />
    </svg>
  ),
  music: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V6l10-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </svg>
  ),
}
const ACTIVITY_DEFAULT = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
  </svg>
)

/** Board laptop-parent-profile at 1440: headline and tonight button, needs you bar, then marks / noticed / did beside focus / notes / attendance / activities. */
export function ProfileLaptop({ data, extras, base }: { data: ProfileData; extras: ProfileExtras; base: string }) {
  const { child } = data
  return (
    <LaptopShell
      eyebrow={`Profile · ${extras.today}`}
      title={data.headline ?? `${child.firstName}'s profile fills in once a test or homework has been marked.`}
      below={
        <>
          {data.updated ? <p style={css('margin:0 0 0 28px;font-size:14px;color:#5D5A73')}>{data.updated}{data.afterTest ? `, after ${data.afterTest}` : ''}</p> : null}
          <Link
            href={`${base}/report`}
            style={css('display:inline-flex;align-items:center;gap:6px;align-self:flex-start;min-height:44px;margin-left:28px;font-size:15px;font-weight:600;color:#1F1D36;text-underline-offset:3px')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {PAPER_ICON}
            </svg>
            {`See ${child.firstName}'s report`}
          </Link>
        </>
      }
      right={
        extras.tonight ? (
          <Link href={`${base}/learn`} style={css('display:flex;align-items:center;gap:10px;height:48px;padding:0 18px;border-radius:14px;background:#FF6A4D;color:#1F1D36;font-size:15px;font-weight:700;text-decoration:none')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#1F1D36" aria-hidden="true">
              <path d="M7 4.5v15l13-7.5z" />
            </svg>
            {extras.tonight}
          </Link>
        ) : null
      }
    >
      {data.needs.length > 0 ? (
        <section aria-label="Needs you" style={css('display:flex;flex-wrap:wrap;align-items:center;gap:14px;padding:14px 16px;background:#FFF4F1;border:1px solid #FFC9BB;border-radius:20px')}>
          <div style={css('display:flex;align-items:center;gap:8px')}>
            <h2 style={css('margin:0;font-size:16px;font-weight:600')}>Needs you</h2>
            <span style={css('min-width:22px;height:22px;padding:0 7px;border-radius:999px;background:#FF6A4D;color:#1F1D36;font-size:13px;font-weight:700;display:inline-flex;align-items:center;justify-content:center')}>{data.needs.length}</span>
          </div>
          {data.needs.map((n) => (
            <Link key={n.id} href={n.href} style={css('flex:1 1 420px;display:flex;align-items:center;gap:12px;min-height:56px;padding:8px 10px;background:#FFFFFF;border-radius:14px;text-decoration:none;color:#1F1D36')}>
              <span aria-hidden="true" style={css('width:38px;height:38px;flex:none;border-radius:12px;background:#FFE3DA;display:flex;align-items:center;justify-content:center')}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                  <path d="M14 3v5h5" />
                  <path d="m9 14 2 2 4-4" />
                </svg>
              </span>
              <span style={css('flex:1;min-width:0;display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px')}>
                <span style={css('font-size:16px;font-weight:600')}>{n.title}</span>
                <span style={css('font-size:14px;color:#5D5A73')}>{n.detail}</span>
              </span>
              <span style={css('font-size:14px;font-weight:600;flex:none')}>Check</span>
              <ChevronSvg />
            </Link>
          ))}
        </section>
      ) : null}

      <div style={css('display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start')}>
        <div style={css('flex:1.35 1 460px;min-width:0;display:flex;flex-direction:column;gap:20px')}>
          {data.marks.length > 0 ? (
            <section aria-labelledby="lp-marks" style={css(`${CARD};gap:4px;padding:18px 20px`)}>
              <div style={css('display:flex;align-items:baseline;justify-content:space-between;margin-bottom:6px')}>
                <h2 id="lp-marks" style={css('margin:0;font-size:18px;font-weight:600')}>Marks by topic</h2>
                <span style={css('font-size:13px;color:#5D5A73')}>Maths · change since Term 3</span>
              </div>
              {data.marks.map((m, i) => (
                <Link key={m.key} href={`${base}/topics/${m.key}`} style={css(`${COLS};${i ? 'border-top:1px solid #EFEEF4' : ''}`)}>
                  <span style={css('font-size:15px;font-weight:600')}>{m.topicName}</span>
                  <span aria-hidden="true" style={css('height:8px;border-radius:999px;background:#EEEDF5;display:flex;overflow:hidden')}>
                    <span style={css(`width:${m.percent}%;background:#1F1D36;border-radius:999px`)} />
                  </span>
                  <span style={css('font-size:16px;font-weight:700;text-align:right')}>{m.percent}%</span>
                  <Change row={m} />
                </Link>
              ))}
              <Link href={`${base}/tests`} style={css('align-self:flex-start;display:flex;align-items:center;min-height:44px;padding:0;font-size:15px;font-weight:600;color:#1F1D36;text-decoration:underline;text-underline-offset:3px')}>
                See all tests and topics
              </Link>
            </section>
          ) : null}

          {data.notices.length > 0 ? (
            <section aria-label="What Jemma has noticed" style={css('display:flex;flex-direction:column;gap:10px')}>
              <h2 style={css('margin:0;font-size:18px;font-weight:600')}>What Jemma has noticed</h2>
              {data.notices.map((n) => (
                <div key={n.text} style={css('display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 16px;padding:16px 18px;background:#FFFFFF;border:1px solid #E7E6EF;border-radius:18px')}>
                  <span style={css('flex:1 1 300px;font-size:16px;line-height:1.45;font-weight:500')}>{n.text}</span>
                  <Chips chips={n.chips} />
                </div>
              ))}
            </section>
          ) : null}

          <section aria-label="What Jemma did" style={css(`${CARD};gap:12px;padding:18px 20px`)}>
            <div style={css('display:flex;align-items:center;justify-content:space-between')}>
              <h2 style={css('margin:0;font-size:17px;font-weight:600')}>What Jemma did</h2>
              <Link href={`${base}/notifications`} style={css('display:flex;align-items:center;min-height:44px;font-size:14px;font-weight:600;color:#1F1D36;text-underline-offset:3px')}>
                See all
              </Link>
            </div>
            <ol style={css('list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px')}>
              {data.did.map((d) => (
                <li key={d.time + d.text} style={css('display:flex;gap:12px;font-size:14px;line-height:1.4')}>
                  <span style={css('width:66px;flex:none;color:#5D5A73;font-variant-numeric:tabular-nums')}>{d.time}</span>
                  <span>{d.text}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div style={css('flex:1 1 340px;min-width:0;display:flex;flex-direction:column;gap:20px')}>
          {data.focus.length > 0 ? (
            <section aria-label="What to focus on next, and why" style={css('display:flex;flex-direction:column;gap:14px;padding:22px;background:#1F1D36;color:#FFFFFF;border-radius:22px')}>
              <div style={css('display:flex;align-items:center;gap:10px')}>
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                  <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" />
                </svg>
                <h2 style={css('margin:0;font-size:18px;font-weight:600')}>What to focus on next, and why</h2>
              </div>
              <ol style={css('list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:14px')}>
                {data.focus.map((f, i) => (
                  <li key={f.title} style={css('display:flex;gap:12px')}>
                    <span style={css(`width:26px;height:26px;flex:none;border-radius:999px;background:${i === 0 ? '#FF6A4D' : '#FFFFFF'};color:#1F1D36;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center`)}>{i + 1}</span>
                    <span style={css('display:flex;flex-direction:column;gap:4px')}>
                      <span style={css('font-size:16px;font-weight:600')}>{f.title}</span>
                      <span style={css('font-size:15px;line-height:1.5;color:#DCDAE8')}>{f.why}</span>
                      <Chips chips={f.chips} dark />
                    </span>
                  </li>
                ))}
              </ol>
              {data.lookingAhead ? (
                <p style={css('margin:0;padding-top:12px;border-top:1px solid #3A3757;font-size:14px;line-height:1.5;color:#DCDAE8')}>{data.lookingAhead}</p>
              ) : null}
            </section>
          ) : null}

          {extras.notes.length > 0 ? (
            <section aria-label={`Notes from ${extras.teacher}`} style={css(`${CARD};gap:12px;padding:18px 20px`)}>
              <div style={css('display:flex;align-items:center;justify-content:space-between')}>
                <h2 style={css('margin:0;font-size:17px;font-weight:600')}>{`Notes from ${extras.teacher}`}</h2>
                <Link href={`${base}/beyond`} style={css('display:flex;align-items:center;min-height:44px;font-size:14px;font-weight:600;color:#1F1D36;text-underline-offset:3px')}>
                  All notes
                </Link>
              </div>
              {extras.notes.map((n, i) => (
                <div key={n.id} style={css(`display:flex;flex-direction:column;gap:3px;${i ? 'padding-top:12px;border-top:1px solid #EFEEF4' : ''}`)}>
                  <span style={css('font-size:13px;color:#5D5A73')}>{n.label}</span>
                  <span style={css('font-size:15px;line-height:1.45')}>{n.text}</span>
                </div>
              ))}
            </section>
          ) : null}

          {extras.attendance ? (
            <section aria-label="Attendance" style={css(`${CARD};gap:10px;padding:18px 20px`)}>
              <div style={css('display:flex;align-items:baseline;justify-content:space-between')}>
                <h2 style={css('margin:0;font-size:17px;font-weight:600')}>Attendance</h2>
                <span style={css('font-size:14px;font-weight:600')}>{`${extras.attendance.present} of ${extras.attendance.total} days`}</span>
              </div>
              <div aria-hidden="true" style={css('display:grid;grid-template-columns:repeat(10, minmax(0, 1fr));gap:4px')}>
                {extras.attendance.days.map((d, i) => (
                  <span key={i} style={css(`height:22px;border-radius:6px;${d === 'away' ? 'border:1.5px dashed #B8381F;background:#FFF4F1' : 'background:#1F1D36'}`)} />
                ))}
              </div>
              <p style={css('margin:0;font-size:14px;color:#5D5A73')}>{extras.attendance.line}</p>
            </section>
          ) : null}

          <section aria-label="Activities" style={css(`${CARD};gap:12px;padding:18px 20px`)}>
            <div style={css('display:flex;align-items:center;justify-content:space-between')}>
              <h2 style={css('margin:0;font-size:17px;font-weight:600')}>Activities</h2>
              <Link href={`${base}/activities/new`} style={css('display:inline-flex;align-items:center;gap:6px;min-height:44px;font-size:14px;font-weight:600;color:#1F1D36;text-decoration:none')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add
              </Link>
            </div>
            {extras.activities.map((a) => (
              <div key={a.id} style={css('display:flex;align-items:center;gap:12px')}>
                <span aria-hidden="true" style={css('width:38px;height:38px;flex:none;border-radius:12px;background:#EEEDF5;display:flex;align-items:center;justify-content:center')}>
                  {ACTIVITY_ICON[a.kind] ?? ACTIVITY_DEFAULT}
                </span>
                <span style={css('display:flex;flex-direction:column;gap:1px')}>
                  <span style={css('font-size:15px;font-weight:600')}>{a.name}</span>
                  <span style={css('font-size:13px;color:#5D5A73')}>{a.line}</span>
                </span>
              </div>
            ))}
          </section>
        </div>
      </div>
    </LaptopShell>
  )
}
