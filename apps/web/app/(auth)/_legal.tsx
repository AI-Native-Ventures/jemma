import type { ReactNode } from 'react'
import { BackLink, Gem, Section, colors } from './_parts'

export type LegalSection = { id: string; title: string; body: ReactNode[] }

const para = { margin: 0, fontSize: 15, lineHeight: 1.55, color: colors.ink } as const

/** One legal page (the privacy policy, the terms of use): a title, the day it was last changed, and short sections of plain sentences. */
export function LegalPage({ title, updated, intro, sections }: { title: string; updated: string; intro: string; sections: LegalSection[] }) {
  return (
    <>
      <header style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '10px 12px 6px 8px' }}>
        <BackLink href="/privacy" label="Back to privacy" />
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, flex: 1, minWidth: 0, color: colors.ink }}>
          <span style={{ fontSize: 17, fontWeight: 700 }}>{title}</span>
        </span>
      </header>
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, padding: '12px 20px 28px', minHeight: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Gem marginTop={10} />
            <h1 style={{ margin: 0, fontSize: 27, lineHeight: 1.18, fontWeight: 600, letterSpacing: '-0.015em' }}>{title}</h1>
          </div>
          <p style={{ margin: '0 0 0 24px', fontSize: 14, color: colors.body }}>Last changed {updated}</p>
          <p style={{ ...para, margin: '4px 0 0 24px', color: colors.body }}>{intro}</p>
        </div>
        {sections.map((s) => (
          <Section key={s.id} id={s.id} title={s.title} gap={10}>
            {s.body.map((b, i) => (
              <p key={i} style={para}>
                {b}
              </p>
            ))}
          </Section>
        ))}
        <div style={{ flex: 1 }} />
      </main>
    </>
  )
}
