import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import type { PaperDetail, ResultRow } from '@/lib/data/p24'

/** Pieces shared by the parent evidence screens (topic, paper, flag, notifications). Ported from the boards' inline styles. */

const HAND = "Kalam, 'Comic Sans MS', cursive"
const ARIAL = 'Arial, Helvetica, sans-serif'
const OUTFIT = "Outfit, system-ui, -apple-system, 'Segoe UI', sans-serif"

const srOnly: CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }

/**
 * Hides the shared space header (and, with `ownTabs`, the shared tab bar) that the child layout draws, because
 * these boards carry their own back header. Pure CSS keyed on a marker inside `main`.
 */
export function HideSpaceChrome({ ownTabs = false }: { ownTabs?: boolean }) {
  return (
    <style>{`div:has(> main [data-p24-detail]) > header{display:none}${ownTabs ? 'div:has(> main [data-p24-own-tabs]) > nav{display:none}' : ''}`}</style>
  )
}

/** Back arrow, small line and title, as at the top of topic, paper, flag and notifications. */
export function BackHeader({
  href,
  label,
  line,
  title,
  right,
  padding = '10px 12px 6px 8px',
}: {
  href: string
  label: string
  line: string
  title: string
  right?: ReactNode
  padding?: string
}) {
  return (
    <header style={{ display: 'flex', alignItems: 'center', gap: 4, padding }}>
      <Link
        href={href}
        aria-label={label}
        style={{ width: 44, height: 44, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, color: '#1F1D36' }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m15 6-6 6 6 6" />
        </svg>
      </Link>
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, flex: 1, minWidth: 0, color: '#1F1D36' }}>
        <span style={{ fontSize: 13, color: '#5D5A73' }}>{line}</span>
        <span style={{ fontSize: 17, fontWeight: 700 }}>{title}</span>
      </span>
      {right}
    </header>
  )
}

/** Coral diamond used as a bullet. */
export function Diamond({ size, mt }: { size: number; mt: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none', marginTop: mt }}>
      <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" />
    </svg>
  )
}

export const ChevronRight = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
    <path d="m9 6 6 6-6 6" />
  </svg>
)

const displayPrompt = (p: string) => {
  const text = p.replace(/ - /g, ' − ')
  return /^[\d\s/,+−\-×÷().]+$/.test(text) ? `${text} =` : text
}

const circled = (r: ResultRow) => /^[A-D]$/.test(r.answer) || / or /.test(r.prompt)

function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  )
}

function PaperRow({ row, highlight }: { row: ResultRow; highlight: boolean }) {
  const miss = !row.correct
  const box: CSSProperties = {
    width: 58, height: 32, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: HAND, color: '#2F3A56', fontSize: 18, lineHeight: 1, borderRadius: 3,
    border: miss ? '2px solid #FF6A4D' : '1px solid #8F8F8F',
  }
  return (
    <li
      id={`q${row.n}`}
      data-q={row.n}
      data-highlight={highlight ? 'true' : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, minHeight: 40, borderTop: '1px solid #ECEAE2',
        ...(highlight ? { background: '#FFF4F1', outline: '2px solid #FF6A4D', outlineOffset: -2 } : null),
      }}
    >
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.3 }}>{`${row.n}.  ${displayPrompt(row.prompt)}`}</span>
      {circled(row) ? (
        <span style={{ width: 58, height: 32, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: HAND, color: '#2F3A56', fontSize: 17, lineHeight: 1, border: '1.5px solid #2F3A56', borderRadius: '50%', padding: '3px 7px' }}>{row.answer}</span>
        </span>
      ) : (
        <span style={box}>{row.answer}</span>
      )}
      {miss ? (
        <span style={{ width: 68, flex: 'none', display: 'flex' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px 3px 6px', borderRadius: 999, background: '#FFE3DA', fontFamily: OUTFIT, fontSize: 13, fontWeight: 700, color: '#1F1D36', whiteSpace: 'nowrap' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="3.2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
            <span style={srOnly}>Missed. Right answer </span>
            {row.rightAnswer}
          </span>
        </span>
      ) : (
        <span style={{ width: 68, flex: 'none', display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 4 }}>
          <CheckIcon />
          <span style={srOnly}>Right</span>
        </span>
      )}
    </li>
  )
}

/** The marked paper as a photographed sheet: lavender mat, cream paper, handwriting in navy, missed answers boxed in coral. */
export function PaperSheet({ paper, highlightN }: { paper: PaperDetail; highlightN?: number }) {
  return (
    <div style={{ padding: 12, borderRadius: 20, background: '#E9E7F3' }}>
      <div style={{ background: '#FBFAF5', borderRadius: 6, boxShadow: '0 4px 14px rgba(31,29,54,0.12)', padding: '16px 14px 10px', color: '#2A2A2A', fontFamily: ARIAL }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{paper.child.schoolName}</span>
            <span style={{ fontSize: 11, color: '#444444' }}>{`Grade ${paper.child.grade} ${paper.child.subject} · ${paper.shortTitle}`}</span>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px 4px 8px', borderRadius: 999, background: '#1F1D36', color: '#FFFFFF', fontFamily: OUTFIT, fontSize: 14, fontWeight: 700 }}>
            <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none', marginTop: 0 }}>
              <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" />
            </svg>
            {`${paper.total}/${paper.outOf}`}
          </span>
        </div>
        <span style={{ display: 'flex', alignItems: 'flex-end', gap: 8, margin: '10px 0 6px', fontSize: 11 }}>
          Name{' '}
          <span style={{ flex: 1, borderBottom: '1px solid #777777', paddingLeft: 6 }}>
            <span style={{ fontFamily: HAND, color: '#2F3A56', fontSize: 20, lineHeight: 1 }}>{paper.child.firstName}</span>
          </span>
        </span>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {paper.sections.map((section, i) => (
            <SectionRows key={section.heading || i} heading={section.heading} first={i === 0} rows={section.rows} highlightN={highlightN} />
          ))}
        </ol>
      </div>
    </div>
  )
}

function SectionRows({ heading, first, rows, highlightN }: { heading: string; first: boolean; rows: ResultRow[]; highlightN?: number }) {
  return (
    <>
      {heading ? (
        <li style={first ? { fontSize: 11, fontWeight: 700, padding: '6px 0 4px' } : { fontSize: 11, fontWeight: 700, padding: '10px 0 4px', borderTop: '1px solid #ECEAE2' }}>{heading}</li>
      ) : null}
      {rows.map((row) => (
        <PaperRow key={row.id} row={row} highlight={row.n === highlightN} />
      ))}
    </>
  )
}

const fractionBox: CSSProperties = { display: 'inline-flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }

/** "1 1/2 + 2 1/4" with the fractions stacked, as printed on the paper. */
export function PrintedSum({ prompt }: { prompt: string }) {
  const tokens = displayPrompt(prompt).split(' ')
  return (
    <>
      {tokens.map((t, i) => {
        const m = /^(\d+)\/(\d+)$/.exec(t)
        if (!m) return <span key={i}>{t}</span>
        return (
          <span key={i} style={fractionBox}>
            <span style={{ padding: '0 2px 2px' }}>{m[1]}</span>
            <span style={{ borderTop: '1.5px solid #2A2A2A', padding: '2px 2px 0' }}>{m[2]}</span>
          </span>
        )
      })}
    </>
  )
}

/** One missed question cut out of the paper: dark mat, cream sheet, the sum and the child's boxed answer. */
export function QuestionCrop({ row }: { row: ResultRow }) {
  const tokens = row.prompt.split(' ')
  const mixed = tokens.some((t) => /^\d+$/.test(t))
  return (
    <div style={{ height: 84, borderRadius: 10, background: '#6E665D', overflow: 'hidden', position: 'relative' }}>
      <div
        style={{
          position: 'absolute', left: -10, top: -6, right: -10, bottom: -6, background: '#FBFAF5', transform: 'rotate(-1deg)',
          display: 'flex', alignItems: 'center', gap: mixed ? 8 : 10, padding: '0 24px', fontFamily: ARIAL, fontSize: 15, color: '#2A2A2A',
        }}
      >
        <span style={{ fontWeight: 700 }}>{`${row.n}.`}</span>
        <PrintedSum prompt={row.prompt} />
        <span
          style={{
            width: row.answer.length > 4 ? 76 : 66, height: 44, border: '1.5px solid #888888', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontFamily: HAND, fontSize: 24, color: '#2F3A56',
          }}
        >
          {row.answer}
        </span>
      </div>
    </div>
  )
}
