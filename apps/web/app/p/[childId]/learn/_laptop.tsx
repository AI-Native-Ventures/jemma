import Link from 'next/link'
import { PAPER_ICON, LaptopShell } from '../_laptop'
import { css } from '../beyond/_parts'
import { dayNumber, decimalComma, FORMAT_LABEL, weekdayShort, type LearnData } from '@/lib/data/p25'

const CHIP = 'display:inline-flex;align-items:center;padding:6px 12px;border-radius:999px;background:#F4F3F8;font-size:14px;font-weight:600'
const CARD = 'display:flex;flex-direction:column;background:#FFFFFF;border:1px solid #E7E6EF;border-radius:20px;padding:18px'

/** Board laptop-parent-learn at 1440: tonight's lesson card beside this week and what helps. */
export function LearnLaptop({ childId, data, tonight }: { childId: string; data: LearnData; tonight: NonNullable<LearnData['tonight']> }) {
  const { childFirstName: name, week, helps } = data
  const topic = tonight.shortName
  const steps = ['Warm-up', 'Learn', tonight.questions ? `${tonight.questions} questions` : 'Questions', 'Results']

  return (
    <LaptopShell eyebrow={`Learn · ${name}`} title={`Tonight: ${tonight.minutes} minutes on ${topic.charAt(0).toLowerCase() + topic.slice(1)}, with ${tonight.withPhrase}.`}>
      <div style={css('display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start')}>
        <section aria-labelledby="ll-tonight" style={css('flex:1.3 1 480px;min-width:0;display:flex;flex-direction:column;gap:18px;padding:24px;background:#FFFFFF;border:2px solid #1F1D36;border-radius:22px')}>
          <div style={css('display:flex;flex-direction:column;gap:6px')}>
            <span style={css('font-size:14px;font-weight:600;color:#B8381F')}>Tonight</span>
            <h2 id="ll-tonight" style={css('margin:0;font-size:26px;line-height:1.2;font-weight:700;letter-spacing:-0.01em')}>{tonight.topicName}</h2>
          </div>
          {tonight.format === 'diagram' ? (
            <div aria-hidden="true" style={css('display:flex;flex-direction:column;gap:8px;padding:16px;border-radius:16px;background:#F7F6FB')}>
              <span style={css('display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));height:28px;border:2px solid #1F1D36;border-radius:6px;overflow:hidden')}>
                <span style={css('background:#FF6A4D;border-right:2px solid #1F1D36')} />
                <span />
              </span>
              <span style={css('display:grid;grid-template-columns:repeat(4, minmax(0, 1fr));height:28px;border:2px solid #1F1D36;border-radius:6px;overflow:hidden')}>
                <span style={css('background:#1F1D36;border-right:2px solid #1F1D36')} />
                <span style={css('border-right:2px solid #1F1D36')} />
                <span style={css('border-right:2px solid #1F1D36')} />
                <span />
              </span>
            </div>
          ) : null}
          <div style={css('display:flex;flex-wrap:wrap;gap:8px')}>
            <span style={css(CHIP)}>{FORMAT_LABEL[tonight.format]}</span>
            <span style={css(CHIP)}>{tonight.minutes} minutes</span>
            {tonight.questions ? <span style={css(CHIP)}>{tonight.questions} questions</span> : null}
          </div>
          {tonight.whyTonight ? (
            <p style={css('margin:0;display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:15px')}>
              <strong style={css('font-weight:600')}>Why tonight:</strong>{' '}
              <Link href={tonight.whyTonight.href} style={css('display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 12px;border-radius:12px;background:#F4F3F8;font-size:14px;font-weight:600;text-decoration:none;color:#1F1D36')}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {PAPER_ICON}
                </svg>
                {tonight.whyTonight.label}
              </Link>
            </p>
          ) : null}
          <ol aria-label="How the lesson goes" style={css('list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(4, minmax(0, 1fr));gap:8px')}>
            {steps.map((label, i) => (
              <li key={label} style={css('display:flex;flex-direction:column;gap:2px;padding:10px 12px;border-radius:12px;background:#F4F3F8')}>
                <span style={css('font-size:12px;color:#5D5A73')}>{`Step ${i + 1}`}</span>
                <span style={css('font-size:14px;font-weight:600')}>{label}</span>
              </li>
            ))}
          </ol>
          <p style={css('margin:0;font-size:14px;line-height:1.45;color:#5D5A73')}>{name} sees how she did at the end, never a score. You see everything.</p>
          <Link href={`/p/${childId}/learn/handover`} style={css('display:flex;align-items:center;justify-content:center;gap:8px;height:52px;padding:0 18px;border-radius:14px;background:#1F1D36;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;flex:none')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true">
              <path d="M7 4.5v15l13-7.5z" />
            </svg>
            {`Start, then hand the phone to ${name}`}
          </Link>
        </section>

        <div style={css('flex:1 1 380px;min-width:0;display:flex;flex-direction:column;gap:20px')}>
          <section aria-labelledby="ll-week" style={css(`${CARD};gap:6px`)}>
            <h2 id="ll-week" style={css('margin:0 0 4px;font-size:18px;font-weight:600')}>This week</h2>
            <ol style={css('list-style:none;margin:0;padding:0;display:flex;flex-direction:column')}>
              {week.map((s, i) => {
                const now = s.id === tonight.id
                const title = s.quickCheck ? `${s.shortName}, quick check` : s.shortName
                const sub = s.quickCheck ? `${s.questions} questions · ${s.minutes} min` : `${FORMAT_LABEL[s.format]} · ${s.minutes} min`
                return (
                  <li
                    key={s.id}
                    style={css(`display:flex;align-items:center;gap:14px;min-height:60px;padding:8px 12px;${now ? 'border-radius:14px;background:#FFF4F1;border:1px solid #FFC9BB' : `border-radius:0px;${i ? 'border-top:1px solid #EFEEF4' : ''}`}`)}
                  >
                    <span style={css('width:44px;flex:none;display:flex;flex-direction:column;align-items:center;line-height:1.1')}>
                      <span style={css('font-size:12px;color:#5D5A73')}>{weekdayShort(s.plannedFor)}</span>
                      <span style={css('font-size:19px;font-weight:700')}>{dayNumber(s.plannedFor)}</span>
                    </span>
                    <span style={css('flex:1;display:flex;flex-direction:column;line-height:1.3')}>
                      <span style={css('font-size:15px;font-weight:600')}>{title}</span>
                      <span style={css('font-size:13px;color:#5D5A73')}>{sub}</span>
                    </span>
                    {now ? <span style={css('padding:2px 10px;border-radius:999px;background:#FF6A4D;font-size:12px;font-weight:700;color:#1F1D36')}>Tonight</span> : null}
                  </li>
                )
              })}
            </ol>
            <p style={css('margin:6px 0 0;font-size:13px;line-height:1.45;color:#5D5A73')}>Rest days in between. Jemma moves things if a new test comes in.</p>
          </section>

          <section aria-labelledby="ll-helps" style={css(`${CARD};gap:2px`)}>
            <h2 id="ll-helps" style={css('margin:0;font-size:18px;font-weight:600')}>{`What helps ${name}`}</h2>
            <p style={css('margin:2px 0 6px;font-size:13px;color:#5D5A73')}>{`On ${helps.family.replace(/s$/, '')} topics so far, average out of 5`}</p>
            <ul style={css('list-style:none;margin:0;padding:0')}>
              {helps.rows.map((r) => (
                <li key={r.format} style={css('display:flex;flex-direction:column;gap:6px;padding:12px 0;border-top:1px solid #EFEEF4')}>
                  <span style={css('display:flex;align-items:baseline;justify-content:space-between;gap:10px')}>
                    <span style={css('font-size:15px;font-weight:600')}>
                      {FORMAT_LABEL[r.format]} <span style={css('font-weight:400;color:#5D5A73;font-size:13px')}>{`· ${r.sessions} ${r.sessions === 1 ? 'session' : 'sessions'}`}</span>
                    </span>
                    {r.status === 'measured' ? (
                      <span style={css('font-size:16px;font-weight:700;font-variant-numeric:tabular-nums')}>{decimalComma(r.average)}</span>
                    ) : (
                      <span style={css('font-size:14px;font-weight:600')}>Too early to tell</span>
                    )}
                  </span>
                  {r.status === 'measured' ? (
                    <span aria-hidden="true" style={css('display:block;width:100%;height:8px;border-radius:999px;background:#EEEDF5;overflow:hidden')}>
                      <span style={css(`display:block;width:${(r.average / 5) * 100}%;height:100%;border-radius:999px;background:#1F1D36`)} />
                    </span>
                  ) : (
                    <span aria-hidden="true" style={css('display:block;height:8px;border-radius:999px;border:1.5px dashed #CFCDDC')} />
                  )}
                </li>
              ))}
            </ul>
            <p style={css('margin:8px 0 0;font-size:13px;line-height:1.45;color:#5D5A73')}>Measured per topic, never a label. Jemma keeps trying all three, so this can change.</p>
          </section>
        </div>
      </div>
    </LaptopShell>
  )
}
