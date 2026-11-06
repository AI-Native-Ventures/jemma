import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { getProfile, type MarkRow } from '@/lib/data/p23'
import { getProfileExtras } from '@/lib/data/p36'
import { Only } from './_only'
import { ProfileLaptop } from './_profile-laptop'
import { Chevron, css, Diamond, Icon } from './beyond/_parts'

type Chip = NonNullable<Awaited<ReturnType<typeof getProfile>>>['notices'][number]['chips'][number]

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
          <Icon name={c.kind} size={15} />
          {c.label}
        </Link>
      ))}
    </span>
  )
}

function Change({ row }: { row: MarkRow }) {
  const pill = 'display:inline-flex;align-items:center;min-width:52px;justify-content:center;padding:2px 8px;border-radius:999px;font-size:13px;font-weight:600'
  if (row.change === null || row.change === 0) {
    return <span style={css(`${pill};background:#F4F3F8;color:#5D5A73`)}>{row.change === 0 ? 'same' : 'new'}</span>
  }
  const down = row.change < 0
  return (
    <span style={css(`${pill};gap:2px;${down ? 'background:#FFEDE8;color:#B8381F' : 'background:#EEEDF5;color:#1F1D36'}`)}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={down ? 'down' : 'up'}>
        <path d={down ? 'M12 5v14M6 13l6 6 6-6' : 'M12 19V5M6 11l6-6 6 6'} />
      </svg>
      {Math.abs(row.change)}
    </span>
  )
}

const CARD = 'display:flex;flex-direction:column;background:#FFFFFF;border:1px solid #E7E6EF;border-radius:20px'

export default async function ParentProfilePage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params
  await requireRole('parent')
  const [data, extras] = await Promise.all([getProfile(childId), getProfileExtras(childId)])
  if (!data) notFound()
  const { child } = data
  const base = `/p/${childId}`

  return (
    <>
    <div className="lg:hidden">
    <Only at="phone">
    <div style={css('display:flex;flex-direction:column;gap:20px;padding:14px 20px 20px;min-height:0;line-height:normal')}>
      <div style={css('display:flex;flex-direction:column;gap:8px')}>
        <div style={css('display:flex;gap:10px;align-items:flex-start')}>
          <Diamond size={14} style={css('flex:none;margin-top:11px')} />
          <h1 style={{ ...css('margin:0;font-size:28px;line-height:1.18;font-weight:600;letter-spacing:-0.015em'), textWrap: 'pretty' }}>
            {data.headline ?? `${child.firstName}'s profile fills in once a test or homework has been marked.`}
          </h1>
        </div>
        {data.updated ? <p style={css('margin:0 0 0 24px;font-size:14px;color:#5D5A73')}>{data.updated}{data.afterTest ? `, after ${data.afterTest}` : ''}</p> : null}
        <Link
          href={`${base}/report`}
          style={css('display:inline-flex;align-items:center;gap:6px;align-self:flex-start;min-height:44px;margin-left:24px;font-size:15px;font-weight:600;color:#1F1D36;text-underline-offset:3px')}
        >
          <Icon name="paper" size={18} />
          {`See ${child.firstName}'s report`}
        </Link>
      </div>

      {data.needs.length > 0 ? (
        <section aria-labelledby="needs" style={css('display:flex;flex-direction:column;gap:8px;padding:14px 14px 8px;background:#FFF4F1;border:1px solid #FFC9BB;border-radius:20px')}>
          <div style={css('display:flex;align-items:center;gap:8px;padding-left:2px')}>
            <h2 id="needs" style={css('margin:0;font-size:16px;font-weight:600')}>Needs you</h2>
            <span style={css('min-width:22px;height:22px;padding:0 7px;border-radius:999px;background:#FF6A4D;color:#1F1D36;font-size:13px;font-weight:700;display:inline-flex;align-items:center;justify-content:center')}>
              {data.needs.length}
            </span>
          </div>
          {data.needs.map((n) => (
            <Link key={n.id} href={n.href} style={css('display:flex;align-items:center;gap:12px;min-height:64px;padding:10px 6px 10px 10px;background:#FFFFFF;border-radius:14px;text-decoration:none;color:#1F1D36')}>
              <span aria-hidden="true" style={css('width:40px;height:40px;flex:none;border-radius:12px;background:#FFE3DA;display:flex;align-items:center;justify-content:center')}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                  <path d="M14 3v5h5" />
                  <path d="m9 14 2 2 4-4" />
                </svg>
              </span>
              <span style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
                <span style={css('font-size:16px;font-weight:600')}>{n.title}</span>
                <span style={css('font-size:14px;color:#5D5A73')}>{n.detail}</span>
              </span>
              <Chevron />
            </Link>
          ))}
        </section>
      ) : null}

      {data.marks.length > 0 ? (
        <section aria-labelledby="marks" style={css(`${CARD};gap:2px;padding:16px`)}>
          <div style={css('display:flex;align-items:baseline;justify-content:space-between;margin-bottom:6px')}>
            <h2 id="marks" style={css('margin:0;font-size:17px;font-weight:600')}>Marks by topic</h2>
            <span style={css('font-size:13px;color:#5D5A73')}>Maths · change since Term 3</span>
          </div>
          {data.marks.map((m, i) => (
            <Link
              key={m.key}
              href={`${base}/topics/${m.key}`}
              style={css(`display:flex;align-items:center;gap:8px;padding:10px 0;${i ? 'border-top:1px solid #EFEEF4;' : ''}text-decoration:none;color:#1F1D36`)}
            >
              <span style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:6px')}>
                <span style={css('display:flex;align-items:center;justify-content:space-between;gap:10px')}>
                  <span style={css('font-size:15px;font-weight:600')}>{m.shortName}</span>
                  <span style={css('display:flex;align-items:center;gap:8px')}>
                    <span style={css('font-size:16px;font-weight:700;font-variant-numeric:tabular-nums')}>{m.percent}%</span>
                    <Change row={m} />
                  </span>
                </span>
                <span aria-hidden="true" style={css('height:8px;border-radius:999px;background:#EEEDF5;display:flex;overflow:hidden')}>
                  <span style={css(`width:${m.percent}%;background:#1F1D36;border-radius:999px`)} />
                </span>
              </span>
              <Chevron />
            </Link>
          ))}
          <Link href={`${base}/tests`} style={css('align-self:flex-start;display:flex;align-items:center;min-height:44px;padding:0;font-size:15px;font-weight:600;color:#1F1D36;text-decoration:underline;text-underline-offset:3px')}>
            See all tests and topics
          </Link>
        </section>
      ) : null}

      {data.notices.length > 0 ? (
        <section aria-labelledby="noticed" style={css(`${CARD};gap:0;padding:16px 16px 4px`)}>
          <h2 id="noticed" style={css('margin:0 0 2px;font-size:17px;font-weight:600')}>What Jemma has noticed</h2>
          <ul style={css('list-style:none;margin:0;padding:0')}>
            {data.notices.map((n, i) => (
              <li key={`${i}-${n.text}`} style={css(`display:flex;flex-direction:column;gap:10px;padding:14px 0;${i ? 'border-top:1px solid #EFEEF4' : ''}`)}>
                <span style={css('font-size:16px;line-height:1.45;font-weight:500')}>{n.text}</span>
                <Chips chips={n.chips} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.focus.length > 0 ? (
        <section aria-labelledby="next" style={css('display:flex;flex-direction:column;gap:14px;padding:20px;background:#1F1D36;color:#FFFFFF;border-radius:22px')}>
          <div style={css('display:flex;align-items:center;gap:10px')}>
            <Diamond size={16} />
            <h2 id="next" style={css('margin:0;font-size:18px;font-weight:600')}>What to focus on next, and why</h2>
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

      <Link href={`${base}/beyond`} style={css(`${CARD};flex-direction:row;align-items:center;gap:14px;padding:16px 12px 16px 16px;text-decoration:none;color:#1F1D36`)}>
        <span style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:8px')}>
          <span style={css('font-size:17px;font-weight:600')}>Beyond the tests</span>
          <span style={css('display:flex;flex-direction:column;gap:6px;font-size:14px;line-height:1.4;color:#5D5A73')}>
            {data.beyond.note ? (
              <Row icon="note">
                <span>
                  {data.beyond.note.label} <strong style={css('color:#1F1D36;font-weight:600')}>{data.beyond.note.strong}</strong>
                  {data.beyond.note.rest}
                </span>
              </Row>
            ) : null}
            {data.beyond.attendance ? (
              <Row icon="calendar">
                <span>
                  <strong style={css('color:#1F1D36;font-weight:600')}>{`${data.beyond.attendance.present} of ${data.beyond.attendance.total} days`}</strong> at school this term
                </span>
              </Row>
            ) : null}
            {data.beyond.activities ? (
              <Row icon="globe">
                <span>{data.beyond.activities}</span>
              </Row>
            ) : null}
          </span>
        </span>
        <Chevron />
      </Link>

      <section aria-labelledby="did" style={css(`${CARD};gap:10px;padding:16px`)}>
        <div style={css('display:flex;align-items:center;justify-content:space-between')}>
          <h2 id="did" style={css('margin:0;font-size:17px;font-weight:600')}>What Jemma did</h2>
          <Link href={`${base}/notifications`} style={css('display:flex;align-items:center;min-height:44px;font-size:14px;font-weight:600;color:#1F1D36;text-underline-offset:3px')}>
            See all
          </Link>
        </div>
        <ol style={css('list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px')}>
          {data.did.map((d, i) => (
            <li key={`${i}-${d.time}-${d.text}`} style={css('display:flex;gap:12px;font-size:14px;line-height:1.4')}>
              <span style={css('width:66px;flex:none;color:#5D5A73;font-variant-numeric:tabular-nums')}>{d.time}</span>
              <span>{d.text}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
    </Only>
    </div>
    <Only at="laptop">
    <ProfileLaptop data={data} extras={extras} base={base} />
    </Only>
    </>
  )
}

function Row({ icon, children }: { icon: 'note' | 'calendar' | 'globe'; children: React.ReactNode }) {
  return (
    <span style={css('display:flex;gap:8px')}>
      <span aria-hidden="true" style={css('width:24px;height:24px;flex:none;border-radius:12px;background:#EEEDF5;display:flex;align-items:center;justify-content:center;color:#1F1D36')}>
        <Icon name={icon} size={14} />
      </span>
      {children}
    </span>
  )
}
