'use client'

import { useState } from 'react'
import { Section, colors } from '../_parts'
import { ComingButton } from '../_coming'

const QUESTIONS = [
  {
    q: 'Why did Jemma mark this wrong?',
    a: 'Tap the mark to see the photo it came from. If Jemma read it wrong, tell the teacher from the paper.',
  },
  {
    q: "Who can see my child's marks?",
    a: 'The teacher of the class, and the parent once the teacher has said yes to the link. Your child sees only their own work.',
  },
  {
    q: 'Why does it say too early to tell?',
    a: "Jemma needs 3 sessions on a topic family before it says what helps. Until then it keeps trying different ways and doesn't guess.",
  },
  {
    q: 'How do I fix a mark? (teachers)',
    a: 'Open the paper, tap the question, and change the mark. Jemma redoes the gaps for that learner straight away.',
  },
  {
    q: 'How do I reset the demo?',
    a: 'Open the demo page and choose Reset. Your sandbox goes back to the start.',
  },
]

const chevron = (up: boolean) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
    <path d={up ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} />
  </svg>
)

const stuckButton = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, width: '100%', borderRadius: 14, border: `1.5px solid ${colors.ink}`, background: '#FFFFFF', color: colors.ink, fontSize: 16, fontWeight: 600, cursor: 'pointer' } as const

export function HelpList() {
  const [open, setOpen] = useState<number | null>(0)
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const shown = QUESTIONS.map((item, i) => ({ ...item, i })).filter((item) => !needle || `${item.q} ${item.a}`.toLowerCase().includes(needle))

  return (
    <>
      <div style={{ position: 'relative' }}>
        <label htmlFor="q" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
          Search help
        </label>
        <span style={{ position: 'absolute', left: 14, top: 15, color: colors.body }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m20 20-4.4-4.4" />
          </svg>
        </span>
        <input
          id="q"
          type="search"
          placeholder="Search help"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: '100%', height: 52, padding: '0 14px 0 46px', borderRadius: 14, border: `1px solid ${colors.grey}`, background: '#FFFFFF', color: colors.ink, fontSize: 17 }}
        />
      </div>

      <Section id="popular" title="Popular questions" gap={4}>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {shown.map((item, n) => {
            const expanded = open === item.i
            return (
              <li key={item.i} style={{ borderTop: n ? '1px solid #EFEEF4' : undefined }}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={`a${item.i}`}
                  onClick={() => setOpen(expanded ? null : item.i)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 56, padding: '6px 0', border: 'none', background: 'transparent', color: colors.ink, textAlign: 'left', fontSize: 16, fontWeight: expanded ? 600 : 500, cursor: 'pointer' }}
                >
                  <span style={{ flex: 1 }}>{item.q}</span>
                  {chevron(expanded)}
                </button>
                {expanded ? (
                  <p id={`a${item.i}`} style={{ margin: '0 0 14px', padding: '12px 14px', borderRadius: 14, background: '#F4F3F8', fontSize: 15, lineHeight: 1.5 }}>
                    {item.a}
                  </p>
                ) : null}
              </li>
            )
          })}
        </ul>
      </Section>

      <Section id="stuck" title="Still stuck?" gap={12}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <ComingButton style={stuckButton}>Report a problem</ComingButton>
          <ComingButton style={stuckButton}>Message the Jemma team</ComingButton>
        </div>
        <p style={{ margin: 0, fontSize: 14, color: colors.body }}>We answer within one school day.</p>
      </Section>
    </>
  )
}
