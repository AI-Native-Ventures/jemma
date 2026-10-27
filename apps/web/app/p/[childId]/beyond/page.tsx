import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { getBeyond } from '@/lib/data/p23'
import { ComingButton } from './_coming'
import { css, Diamond, Icon, SubHeader } from './_parts'

const CARD = 'display:flex;flex-direction:column;background:#FFFFFF;border:1px solid #E7E6EF;border-radius:20px;padding:16px'
const SR = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap'

export default async function ParentBeyondPage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params
  await requireRole('parent')
  const data = await getBeyond(childId)
  if (!data) notFound()
  const name = data.childName
  const awayText = data.away.length ? ` Away on ${data.away.join(', ').replace(/, ([^,]*)$/, ' and $1')}.` : ''

  return (
    <>
      <SubHeader back={`/p/${childId}`} backLabel={`Back to ${name}'s profile`} eyebrow={name} title="Beyond the tests" />
      <div style={css('display:flex;flex-direction:column;gap:18px;padding:12px 20px 20px;min-height:0;line-height:normal')}>
        <div style={css('display:flex;gap:10px;align-items:flex-start')}>
          <Diamond size={14} style={css('flex:none;margin-top:10px')} />
          <h1 style={{ ...css('margin:0;font-size:25px;line-height:1.18;font-weight:600;letter-spacing:-0.015em'), textWrap: 'pretty' }}>{data.headline}</h1>
        </div>

        <section aria-labelledby="notes" style={css(`${CARD};gap:4px`)}>
          <h2 id="notes" style={css('margin:0;font-size:17px;font-weight:600')}>{`Notes from ${data.teacher}`}</h2>
          <ul style={css('list-style:none;margin:0;padding:0')}>
            {data.notes.map((n) => (
              <li key={n.id} style={css('display:flex;flex-direction:column;gap:4px;padding:12px 0;border-top:1px solid #EFEEF4')}>
                <span style={css('display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:#5D5A73')}>
                  {n.label}
                  {n.fresh ? <span style={css('padding:2px 8px;border-radius:999px;background:#FFE3DA;font-size:12px;font-weight:700;color:#1F1D36')}>New</span> : null}
                </span>
                <span style={css('font-size:16px;line-height:1.45')}>{n.text}</span>
              </li>
            ))}
          </ul>
          <ComingButton style={css('display:flex;align-items:center;justify-content:center;gap:8px;min-height:46px;border-radius:12px;border:1.5px solid #1F1D36;background:transparent;color:#1F1D36;font-size:15px;font-weight:600')}>
            <Icon name="chat" size={18} />
            {`Message ${data.teacher}`}
          </ComingButton>
        </section>

        <section aria-labelledby="att" style={css(`${CARD};gap:10px`)}>
          <h2 id="att" style={css('margin:0;font-size:17px;font-weight:600')}>Attendance</h2>
          <p style={css('margin:0;font-size:15px;color:#5D5A73')}>
            {`Term ${data.term} so far: `}
            <strong style={css('color:#1F1D36;font-weight:600')}>{`${data.present} of ${data.total} days`}</strong>.{awayText}
          </p>
          {data.weeks.map((w) => (
            <ol key={w.label} aria-label={w.label} style={css('list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(5, minmax(0, 1fr));gap:6px')}>
              {w.days.map((d) => (
                <li
                  key={d.iso}
                  style={{
                    ...css(`display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 0 9px;border-radius:12px;${d.status === 'away' ? 'background:#FFEDE8;border:1px solid #FFC9BB' : 'background:#F4F3F8'}`),
                    gridColumnStart: d.dow + 1,
                  }}
                >
                  <span style={css('font-size:12px;color:#5D5A73')}>{d.weekday}</span>
                  <span style={css('font-size:15px;font-weight:600')}>{d.dom}</span>
                  {d.status === 'away' ? (
                    <span style={css('font-size:11px;font-weight:700;color:#B8381F;line-height:16px')}>Away</span>
                  ) : d.status === 'late' ? (
                    <span style={css('font-size:11px;font-weight:700;color:#5D5A73;line-height:16px')}>Late</span>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="m5 12.5 4.5 4.5L19 7.5" />
                      </svg>
                      <span style={css(SR)}>here</span>
                    </>
                  )}
                </li>
              ))}
            </ol>
          ))}
        </section>

        <section aria-labelledby="act" style={css(`${CARD};gap:6px`)}>
          <h2 id="act" style={css('margin:0;font-size:17px;font-weight:600')}>Activities</h2>
          <ul style={css('list-style:none;margin:0;padding:0')}>
            {data.activities.map((a) => (
              <li key={a.id} style={css('display:flex;align-items:center;gap:12px;min-height:56px;border-top:1px solid #EFEEF4')}>
                <span aria-hidden="true" style={css('width:38px;height:38px;flex:none;border-radius:12px;background:#EEEDF5;display:flex;align-items:center;justify-content:center;color:#1F1D36')}>
                  <Icon name={a.kind === 'sport' ? 'sport' : a.kind === 'music' ? 'music' : 'club'} size={20} />
                </span>
                <span style={css('flex:1;display:flex;flex-direction:column;line-height:1.3')}>
                  <span style={css('font-size:16px;font-weight:600')}>{a.name}</span>
                  <span style={css('font-size:14px;color:#5D5A73')}>{a.line}</span>
                </span>
              </li>
            ))}
          </ul>
          <Link href={`/p/${childId}/activities/new`} style={css('display:flex;align-items:center;justify-content:center;gap:6px;min-height:44px;border-radius:12px;border:1.5px solid #1F1D36;background:#FFFFFF;color:#1F1D36;font-size:15px;font-weight:600;text-decoration:none')}>
            <Icon name="plus" size={18} width={2} />
            Add an activity
          </Link>
        </section>

        <section aria-labelledby="how" style={css('display:flex;flex-direction:column;gap:10px;padding:16px;background:#F4F3F8;border-radius:20px')}>
          <h2 id="how" style={css('margin:0;font-size:16px;font-weight:600')}>How Jemma uses this</h2>
          <ul style={css('list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px')}>
            {[
              `${data.teacher}'s notes go into the guidance on ${name}'s profile.`,
              `If ${name} misses a day, Jemma checks what the class covered and adds it to her lessons.`,
              'Activities help pick lesson times and shape the guidance card. None of this changes her marks.',
            ].map((t) => (
              <li key={t} style={css('display:flex;gap:10px;font-size:15px;line-height:1.45')}>
                <Diamond size={11} style={css('flex:none;margin-top:5px')} />
                {t}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  )
}
