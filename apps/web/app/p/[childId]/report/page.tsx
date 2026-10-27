import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { getReport } from '@/lib/data/p23'
import { Chevron, css, Diamond, Icon, SubHeader } from '../beyond/_parts'
import { ReportActions } from './actions'

const CARD = 'display:flex;flex-direction:column;background:#FFFFFF;border:1px solid #E7E6EF;border-radius:20px;padding:16px'
const ICON = { calendar: 'calendar', note: 'note', camera: 'camera', test: 'test', book: 'book' } as const

export default async function ParentReportPage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params
  await requireRole('parent')
  const data = await getReport(childId)
  if (!data) notFound()
  const stats = [
    { value: data.stats.percent === null ? '' : `${data.stats.percent}%`, label: data.stats.testTitle ?? '' },
    { value: String(data.stats.fixed), label: 'gaps fixed this year' },
    { value: String(data.stats.lessons), label: 'lesson this week' },
  ].filter((s) => s.value)
  const working = data.working
  const gapIcon = (kind: 'new' | 'practising' | 'fixed') =>
    kind === 'fixed' ? (
      <polygon points="8,1 15,8 8,15 1,8" fill="#FF6A4D" />
    ) : kind === 'practising' ? (
      <>
        <polygon points="1,8 15,8 8,15" fill="#FF6A4D" />
        <polygon points="8,1 15,8 8,15 1,8" fill="none" stroke="#1F1D36" strokeWidth="1.6" />
      </>
    ) : (
      <polygon points="8,1.5 14.5,8 8,14.5 1.5,8" fill="none" stroke="#1F1D36" strokeWidth="1.6" />
    )
  const gapMark = (kind: 'new' | 'practising' | 'fixed') => (
    <span style={css('width:22px;flex:none;display:flex;justify-content:center')}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        {gapIcon(kind)}
      </svg>
    </span>
  )

  return (
    <>
      <SubHeader back={`/p/${childId}`} backLabel={`Back to ${data.childName}'s profile`} eyebrow={`${data.childName} · Grade ${data.grade}`} title="Report" />
      <div style={css('display:flex;flex-direction:column;gap:16px;padding:12px 20px 20px;min-height:0;line-height:normal')}>
        <div style={css('display:flex;gap:10px;align-items:flex-start')}>
          <Diamond size={14} style={css('flex:none;margin-top:10px')} />
          <h1 style={{ ...css('margin:0;font-size:26px;line-height:1.18;font-weight:600;letter-spacing:-0.015em'), textWrap: 'pretty' }}>{data.headline}</h1>
        </div>
        <p style={css('margin:0 0 0 24px')}>
          <span style={css('display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:999px;background:#EEEDF5;font-size:14px;font-weight:600')}>
            <Icon name="calendar" size={16} />
            {`Term ${data.term} so far · ${data.period}`}
          </span>
        </p>
        <ReportActions />

        <section aria-labelledby="glance" style={css('display:flex;flex-direction:column;gap:10px')}>
          <h2 id="glance" style={css('margin:0;font-size:17px;font-weight:600')}>At a glance</h2>
          <div style={css('display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:8px')}>
            {stats.map((s) => (
              <div key={s.label} style={css('display:flex;flex-direction:column;gap:2px;padding:12px;border-radius:14px;background:#F4F3F8')}>
                <span style={css('font-size:22px;font-weight:700;font-variant-numeric:tabular-nums')}>{s.value}</span>
                <span style={css('font-size:13px;line-height:1.3;color:#5D5A73')}>{s.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="weeks" style={css(`${CARD};gap:14px`)}>
          <div style={css('display:flex;flex-direction:column;gap:2px')}>
            <h2 id="weeks" style={css('margin:0;font-size:17px;font-weight:600')}>Week by week</h2>
            <p style={css('margin:0;font-size:14px;color:#5D5A73')}>Marks, lessons, notes and attendance together</p>
          </div>
          <ol style={css('list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:14px')}>
            {data.weeks.map((w, wi) => (
              <li key={w.label} style={css('position:relative;display:flex;gap:14px')}>
                {wi < data.weeks.length - 1 ? <span aria-hidden="true" style={css('position:absolute;left:5px;top:20px;bottom:-14px;width:2px;background:#E7E6EF')} /> : null}
                <span aria-hidden="true" style={css('width:12px;height:12px;flex:none;margin-top:5px;border-radius:999px;background:#1F1D36;border:2px solid #FFFFFF;box-shadow:0 0 0 2px #1F1D36')} />
                <div style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
                  <h3 style={css('margin:0;font-size:15px;font-weight:600')}>{w.label}</h3>
                  <ul style={css('list-style:none;margin:0;padding:0')}>
                    {w.items.map((it) => (
                      <li key={it.key}>
                        <Link href={it.href} style={css('display:flex;align-items:center;gap:10px;min-height:48px;padding:4px 0;text-decoration:none;color:#1F1D36')}>
                          <span aria-hidden="true" style={css('width:32px;height:32px;flex:none;border-radius:12px;background:#F4F3F8;display:flex;align-items:center;justify-content:center;color:#1F1D36')}>
                            <Icon name={ICON[it.icon]} size={16} />
                          </span>
                          <span style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;line-height:1.35')}>
                            <span style={css('font-size:15px')}>{it.title}</span>
                            {it.sub ? <span style={css('font-size:13px;color:#5D5A73')}>{it.sub}</span> : null}
                          </span>
                          <Chevron />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="rgaps" style={css(`${CARD};gap:4px`)}>
          <div style={css('display:flex;align-items:flex-start;justify-content:space-between;gap:10px')}>
            <div style={css('display:flex;flex-direction:column;gap:2px')}>
              <h2 id="rgaps" style={css('margin:0;font-size:17px;font-weight:600')}>Gaps</h2>
            </div>
          </div>
          {working.length > 0 ? (
            <>
              <h3 style={css('margin:4px 0 0;font-size:14px;font-weight:600;color:#5D5A73')}>Working on</h3>
              <ul style={css('list-style:none;margin:0;padding:0')}>
                {working.map((g) => {
                  const body = (
                    <>
                      {gapMark(g.stage)}
                      <span style={css('flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.35')}>
                        <span style={css('font-size:15px;font-weight:600')}>{g.name}</span>
                        <span style={css('font-size:13px;color:#5D5A73')}>{g.sub}</span>
                      </span>
                    </>
                  )
                  return (
                    <li key={g.id}>
                      {g.href ? (
                        <Link href={g.href} style={css('display:flex;align-items:center;gap:10px;min-height:48px;text-decoration:none;color:#1F1D36')}>
                          {body}
                          <Chevron />
                        </Link>
                      ) : (
                        <div style={css('display:flex;align-items:center;gap:10px;min-height:48px')}>{body}</div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </>
          ) : null}
          {data.fixed.length > 0 ? (
            <>
              <h3 style={css('margin:6px 0 0;font-size:14px;font-weight:600;color:#5D5A73')}>Fixed this year</h3>
              <ul style={css('list-style:none;margin:0;padding:0')}>
                {data.fixed.map((g) => (
                  <li key={g.id} style={css('display:flex;align-items:center;gap:10px;min-height:48px')}>
                    {gapMark('fixed')}
                    <span style={css('flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.35')}>
                      <span style={css('font-size:15px;font-weight:600')}>{g.name}</span>
                      <span style={css('font-size:13px;color:#5D5A73')}>{g.sub}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>

        {data.activities.length > 0 ? (
          <section aria-labelledby="outside" style={css(`${CARD};gap:10px`)}>
            <div style={css('display:flex;align-items:flex-start;justify-content:space-between;gap:10px')}>
              <div style={css('display:flex;flex-direction:column;gap:2px')}>
                <h2 id="outside" style={css('margin:0;font-size:17px;font-weight:600')}>Outside class</h2>
              </div>
            </div>
            <ul style={css('list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px')}>
              {data.activities.map((a) => (
                <li key={a.id} style={css('display:flex;align-items:center;gap:12px;font-size:15px')}>
                  <span aria-hidden="true" style={css('width:32px;height:32px;flex:none;border-radius:12px;background:#EEEDF5;display:flex;align-items:center;justify-content:center;color:#1F1D36')}>
                    <Icon name={a.kind === 'sport' ? 'sport' : a.kind === 'music' ? 'music' : 'club'} size={16} />
                  </span>
                  <span>
                    <strong style={css('font-weight:600')}>{a.name}</strong>
                    {a.line ? ` · ${a.line}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {data.next.length > 0 ? (
          <section aria-labelledby="next" style={css('display:flex;flex-direction:column;gap:12px;padding:18px;background:#1F1D36;color:#FFFFFF;border-radius:22px')}>
            <div style={css('display:flex;align-items:center;gap:10px')}>
              <Diamond size={14} />
              <h2 id="next" style={css('margin:0;font-size:17px;font-weight:600')}>{"What's next"}</h2>
            </div>
            <ol style={css('list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px')}>
              {data.next.map((t, i) => (
                <li key={t} style={css('display:flex;gap:12px;font-size:15px;line-height:1.45')}>
                  <span style={css(`width:24px;height:24px;flex:none;border-radius:999px;background:${i === 0 ? '#FF6A4D' : '#FFFFFF'};color:#1F1D36;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center`)}>{i + 1}</span>
                  {t}
                </li>
              ))}
            </ol>
            {data.lookingAhead ? (
              <p style={css('margin:0;padding-top:10px;border-top:1px solid #3A3757;font-size:14px;line-height:1.5;color:#DCDAE8')}>{data.lookingAhead}</p>
            ) : null}
          </section>
        ) : null}

        <p style={css('margin:0;display:flex;gap:10px;font-size:14px;line-height:1.45;color:#5D5A73')}>
          <Diamond size={12} style={css('flex:none;margin-top:4px')} />
          <span>{`Made by Jemma on ${data.madeOn} from ${data.sources}. Tap any line to see where it came from.`}</span>
        </p>
      </div>
    </>
  )
}
