import Link from 'next/link'
import type { CSSProperties } from 'react'
import type { PaperDetail, ResultRow } from '@/lib/data/p24'
import type { TestsLaptop as TestsLaptopData } from '@/lib/data/p36'
import { CAMERA_ICON, ChevronSvg, LaptopShell } from '../_laptop'
import { css } from '../beyond/_parts'

const HAND = "Kalam, 'Comic Sans MS', cursive"
const OUTFIT = "Outfit, system-ui, -apple-system, 'Segoe UI', sans-serif"
const SR = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap'

const displayPrompt = (p: string) => {
  const text = p.replace(/ - /g, ' − ')
  return /^[\d\s/,+−\-×÷().]+$/.test(text) ? `${text} =` : text
}
const circled = (r: ResultRow) => /^[A-D]$/.test(r.answer) || / or /.test(r.prompt)

function SheetRow({ row, highlight }: { row: ResultRow; highlight: boolean }) {
  const miss = !row.correct
  const box = `width:66px;height:36px;flex:none;border:${miss ? '2px solid #FF6A4D' : '1px solid #8F8F8F'};border-radius:3px;display:flex;align-items:center;justify-content:center;font-family:${HAND};color:#2F3A56;font-size:20px;line-height:1`
  const rowStyle: CSSProperties = {
    ...css('display:flex;align-items:center;gap:10px;min-height:46px;border-top:1px solid #ECEAE2'),
    ...(highlight ? { background: '#FFF4F1', outline: '2px solid #FF6A4D', outlineOffset: -2 } : null),
  }
  return (
    <li data-q={row.n} data-highlight={highlight ? 'true' : undefined} style={rowStyle}>
      <span style={css('flex:1;min-width:0;font-size:14px;line-height:1.3')}>{`${row.n}.  ${displayPrompt(row.prompt)}`}</span>
      {circled(row) ? (
        <span style={css('width:66px;height:36px;flex:none;display:flex;align-items:center;justify-content:center')}>
          <span style={css(`font-family:${HAND};color:#2F3A56;font-size:19px;line-height:1;border:1.5px solid #2F3A56;border-radius:50%;padding:3px 8px`)}>{row.answer}</span>
        </span>
      ) : (
        <span style={css(box)}>{row.answer}</span>
      )}
      {miss ? (
        <span style={css('width:76px;flex:none;display:flex')}>
          <span style={css(`display:inline-flex;align-items:center;gap:4px;padding:3px 8px 3px 6px;border-radius:999px;background:#FFE3DA;font-family:${OUTFIT};font-size:13px;font-weight:700;color:#1F1D36;white-space:nowrap`)}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="3.2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
            <span style={css(SR)}>Missed. Right answer </span>
            {row.rightAnswer}
          </span>
        </span>
      ) : (
        <span style={css('width:76px;flex:none;display:flex;align-items:center;gap:4px;padding-left:4px')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
          <span style={css(SR)}>Right</span>
        </span>
      )}
    </li>
  )
}

function PaperFigure({ paper, highlightN }: { paper: PaperDetail; highlightN?: number }) {
  const name = paper.child.firstName
  return (
    <section aria-label={`${name}'s marked paper`} style={css('flex:1.2 1 440px;min-width:0')}>
      <figure style={css('margin:0;display:flex;flex-direction:column;gap:10px')}>
        <div style={css('padding:14px;border-radius:20px;background:#E9E7F3')}>
          <div style={css('background:#FBFAF5;border-radius:6px;box-shadow:0 4px 14px rgba(31,29,54,0.12);padding:20px 18px 12px;color:#2A2A2A;font-family:Arial, Helvetica, sans-serif')}>
            <div style={css('display:flex;align-items:flex-start;justify-content:space-between;gap:10px')}>
              <span style={css('display:flex;flex-direction:column;gap:3px')}>
                <span style={css('font-size:14px;font-weight:700')}>{paper.child.schoolName}</span>
                <span style={css('font-size:12px;color:#444444')}>{`Grade ${paper.child.grade} ${paper.child.subject} · ${paper.shortTitle}`}</span>
              </span>
              <span style={css(`display:inline-flex;align-items:center;gap:5px;padding:4px 10px 4px 8px;border-radius:999px;background:#1F1D36;color:#FFFFFF;font-family:${OUTFIT};font-size:14px;font-weight:700`)}>
                <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true" style={css('flex:none;margin-top:0px')}>
                  <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" />
                </svg>
                {`${paper.total}/${paper.outOf}`}
              </span>
            </div>
            <span style={css('display:flex;align-items:flex-end;gap:8px;margin:12px 0 6px;font-size:12px')}>
              Name{' '}
              <span style={css('flex:1;border-bottom:1px solid #777777;padding-left:6px')}>
                <span style={css(`font-family:${HAND};color:#2F3A56;font-size:21px;line-height:1`)}>{name}</span>
              </span>
            </span>
            <ol style={css('list-style:none;margin:0;padding:0')}>
              {paper.sections.map((section, i) => (
                <SectionRows key={section.heading || i} heading={section.heading} first={i === 0} rows={section.rows} highlightN={highlightN} />
              ))}
            </ol>
          </div>
        </div>
        <figcaption style={css('font-size:14px;line-height:1.45;color:#5D5A73')}>
          {`${paper.child.teacherName} snapped ${name}'s paper at ${paper.snappedAt}. Jemma marked it against her memo at ${paper.markedAt}. Coral marks are the ones ${name} missed.`}
        </figcaption>
      </figure>
    </section>
  )
}

function SectionRows({ heading, first, rows, highlightN }: { heading: string; first: boolean; rows: ResultRow[]; highlightN?: number }) {
  return (
    <>
      {heading ? (
        <li style={css(first ? 'font-size:12px;font-weight:700;padding:6px 0 4px' : 'font-size:12px;font-weight:700;padding:10px 0 4px;border-top:1px solid #ECEAE2')}>{heading}</li>
      ) : null}
      {rows.map((row) => (
        <SheetRow key={row.id} row={row} highlight={row.n === highlightN} />
      ))}
    </>
  )
}

function Missed({ childId, paper, highlightN }: { childId: string; paper: PaperDetail; highlightN?: number }) {
  const flag = (id?: string) => `/p/${childId}/papers/${paper.paperId}/flag${id ? `?q=${id}` : ''}`
  return (
    <section aria-labelledby="lt-missed" style={css('flex:1 1 300px;min-width:0;display:flex;flex-direction:column;gap:6px;padding:18px;background:#FFFFFF;border:1px solid #E7E6EF;border-radius:20px')}>
      <h2 id="lt-missed" style={css('margin:0;font-size:18px;font-weight:600')}>{`The ${paper.missed.length} she missed`}</h2>
      <ul style={css('list-style:none;margin:0;padding:0')}>
        {paper.missed.map((r) => (
          <li key={r.id} style={css('border-top:1px solid #EFEEF4')}>
            <Link href={flag(r.id)} style={css('display:flex;align-items:flex-start;gap:12px;padding:12px 0;color:inherit;text-decoration:none')}>
              <span style={css('width:36px;height:36px;flex:none;border-radius:10px;background:#FFE3DA;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center')}>{`Q${r.n}`}</span>
              <span style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;line-height:1.35')}>
                <span style={css('font-size:16px;font-weight:600')}>{r.prompt}</span>
                <span style={css('font-size:14px;color:#5D5A73')}>{`Wrote ${r.answer}${r.rightAnswer ? `, right is ${r.rightAnswer}` : ''}`}</span>
                <span style={css('font-size:13px;font-weight:600;color:#5D5A73')}>{r.topicName}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {paper.slipLine ? (
        <p style={css('margin:4px 0 6px;display:flex;gap:10px;padding:12px 14px;border-radius:14px;background:#F4F3F8;font-size:15px;line-height:1.45')}>
          <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" style={css('flex:none;margin-top:5px')}>
            <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" />
          </svg>
          <span>{paper.slipLine}</span>
        </p>
      ) : null}
      {paper.topGap ? (
        <Link href={`/p/${childId}/topics/${paper.topGap.id}`} style={css('display:flex;align-items:center;gap:12px;min-height:56px;padding:10px 12px;border-radius:14px;border:1px solid #E7E6EF;text-decoration:none;color:#1F1D36')}>
          <span style={css('flex:1;display:flex;flex-direction:column;line-height:1.3')}>
            <span style={css('font-size:15px;font-weight:600')}>{`${paper.topGap.topicName.split(' with ')[0]}: how to help`}</span>
            <span style={css('font-size:13px;color:#5D5A73')}>{`Her biggest gap, and tonight's lesson`}</span>
          </span>
          <ChevronSvg />
        </Link>
      ) : null}
      <Link href={flag(highlightN ? paper.missed.find((r) => r.n === highlightN)?.id : undefined)} style={css('display:flex;align-items:center;min-height:44px;font-size:15px;font-weight:600;color:#1F1D36;text-underline-offset:3px')}>
        Think a mark is wrong?
      </Link>
    </section>
  )
}

/** Boards laptop-parent-tests: the list on the left, the marked paper in the middle, the missed questions on the right. */
export function TestsLaptop({ childId, data, highlightN }: { childId: string; data: TestsLaptopData; highlightN?: number }) {
  const { paper } = data
  return (
    <LaptopShell eyebrow={`Tests · ${data.childName}`} title={data.headline}>
      <div style={css('display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start')}>
        <section aria-labelledby="lt-list" style={css('flex:0 1 270px;min-width:0;display:flex;flex-direction:column;gap:10px')}>
          <h2 id="lt-list" style={css(SR)}>{`${data.childName}'s tests`}</h2>
          {data.needsYou ? (
            <Link href={data.needsYou.href} style={css('display:flex;align-items:center;gap:12px;padding:12px;border-radius:16px;background:#FFF4F1;border:1px solid #FFC9BB;text-decoration:none;color:#1F1D36')}>
              <span style={css('flex:1;display:flex;flex-direction:column;gap:2px;line-height:1.3')}>
                <span style={css('font-size:13px;font-weight:700;color:#B8381F')}>Needs you</span>
                <span style={css('font-size:15px;font-weight:600')}>{data.needsYou.title}</span>
                <span style={css('font-size:13px;color:#5D5A73')}>{data.needsYou.detail}</span>
              </span>
              <ChevronSvg />
            </Link>
          ) : null}
          {data.terms.map(({ term, rows }) => (
            <div key={term} style={css('display:contents')}>
              <h3 style={css('margin:8px 4px 0;font-size:14px;font-weight:600;color:#5D5A73')}>{`Term ${term}`}</h3>
              {rows.map((r) => {
                const style = css(
                  `display:flex;align-items:center;gap:12px;padding:12px;border-radius:16px;text-decoration:none;color:#1F1D36;${r.selected ? 'background:#EEEDF5;border:2px solid #1F1D36' : 'background:#FFFFFF;border:1px solid #E7E6EF'}`,
                )
                const inner = (
                  <>
                    <span style={css(`width:52px;height:52px;flex:none;border-radius:14px;background:${r.selected ? '#FFFFFF' : '#EEEDF5'};display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700`)}>{r.tile}</span>
                    <span style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;line-height:1.3')}>
                      <span style={css('font-size:15px;font-weight:600')}>{r.title}</span>
                      <span style={css('font-size:13px;color:#5D5A73')}>{r.line}</span>
                    </span>
                  </>
                )
                return r.href ? (
                  <Link key={r.key} href={r.href} aria-current={r.selected ? 'true' : undefined} style={style}>{inner}</Link>
                ) : (
                  <div key={r.key} style={style}>{inner}</div>
                )
              })}
            </div>
          ))}
          <Link href={`/p/${childId}/snap`} style={css('display:flex;align-items:center;justify-content:center;gap:8px;height:46px;padding:0 18px;border-radius:14px;border:1.5px solid #1F1D36;background:#FFFFFF;color:#1F1D36;font-size:15px;font-weight:600;text-decoration:none;flex:none')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {CAMERA_ICON}
            </svg>
            Snap a test
          </Link>
        </section>

        {paper ? (
          <>
            <PaperFigure paper={paper} highlightN={highlightN} />
            {paper.missed.length ? <Missed childId={childId} paper={paper} highlightN={highlightN} /> : null}
          </>
        ) : null}
      </div>
    </LaptopShell>
  )
}
