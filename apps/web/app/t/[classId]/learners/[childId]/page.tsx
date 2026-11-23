import { AiTokens } from '@/components/AiTokens'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Maths } from '@/components/Maths'
import { getLearnerView } from '@/lib/data/p19'
import { twinOfChild } from '@/lib/own-workspace'
import { Avatar, BackHeader, Chevron, Diamond, Page, card, font } from '../_parts'
import { NoteForm } from './NoteForm'

export default async function LearnerPage({ params }: { params: Promise<{ classId: string; childId: string }> }) {
  const { classId, childId } = await params
  const v = await getLearnerView(classId, childId)
  if (!v) notFound()
  // Only a learner who opened "My own" has a page of their own practice (a link to look, read only).
  const hasOwn = (await twinOfChild(v.id)) !== null
  const stat = (value: string, label: string) => (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 12px', borderRadius: 12, background: '#F4F2EE' }}>
      <span style={{ fontSize: 20, fontWeight: 700 }}>{value}</span>
      <span style={{ fontSize: 12, color: '#5C5A55' }}>{label}</span>
    </span>
  )
  return (
    <Page>
      <BackHeader href={`/t/${classId}/learners`} kicker={v.className} title="Learners" />
      <div style={{ fontFamily: font, display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 20px 20px' }}>
        <section aria-label={v.name} style={{ ...card(20), gap: 14, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar name={v.name} size={52} first fontSize={20} />
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, lineHeight: 1.15 }}>{v.name}</h1>
              <span style={{ fontSize: 14, color: '#5C5A55' }}>Grade {v.grade}{v.linkedTo ? ` · linked to ${v.linkedTo}` : ''}</span>
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            {stat(v.average === null ? '-' : `${v.average}%`, 'Average')}
            {stat(`${v.present} of ${v.recorded}`, 'Days this term')}
            {stat(String(v.openGaps), 'Open gaps')}
          </div>
          <p style={{ margin: 0, display: 'flex', gap: 10, fontSize: 15, lineHeight: 1.45 }}>
            <Diamond size={12} top={5} />
            <span>{v.summary}</span>
          </p>
        </section>

        <Link href={`/t/${classId}/learners/${v.id}/long-view`} style={{ ...card(20), flexDirection: 'row', alignItems: 'center', gap: 12, padding: '14px 12px 14px 16px', textDecoration: 'none', color: '#161616' }}>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.3 }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>Long view</span>
            <span style={{ fontSize: 14, color: '#5C5A55' }}>{v.name} across the terms and years</span>
          </span>
          <Chevron />
        </Link>

        {hasOwn ? (
          <Link href={`/t/${classId}/learners/${v.id}/own`} style={{ ...card(20), flexDirection: 'row', alignItems: 'center', gap: 12, padding: '14px 12px 14px 16px', textDecoration: 'none', color: '#161616' }}>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.3 }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>{v.name}&apos;s own practice</span>
              <span style={{ fontSize: 14, color: '#5C5A55' }}>What {v.name} practises on their own. Read only.</span>
            </span>
            <Chevron />
          </Link>
        ) : null}

        <NoteForm childId={v.id} initialKind="participation" linkedTo={v.linkedTo} name={v.name} />

        <section aria-labelledby="earlier" style={{ ...card(20), gap: 10, padding: 16 }}>
          <h2 id="earlier" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Earlier notes</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {v.notes.length === 0 ? <li style={{ fontSize: 15, color: '#5C5A55' }}>No notes yet.</li> : null}
            {v.notes.map((n, i) => (
              <li key={n.id} style={{ display: 'flex', flexDirection: 'column', gap: 3, ...(i > 0 ? { paddingTop: 12, borderTop: '1px solid #F0EEE8' } : {}) }}>
                <span style={{ fontSize: 13, color: '#5C5A55' }}>{n.label}</span>
                <span style={{ fontSize: 15, lineHeight: 1.45 }}><Maths text={n.text} size={16} /></span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="att" style={{ ...card(20), gap: 10, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <h2 id="att" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Attendance</h2>
            <span style={{ fontSize: 14, color: '#5C5A55' }}>Term {v.term}: {v.present} of {v.recorded} days</span>
          </div>
          <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(10, minmax(0, 1fr))', gap: 4 }}>
            {v.attendance.map((a, i) => (
              <span
                key={i}
                style={{ height: 22, borderRadius: 6, ...(a.status === 'away' ? { border: '1.5px dashed #B8281E', background: '#FFF8E8' } : { background: '#161616' }) }}
              />
            ))}
          </div>
          <p style={{ margin: 0, fontSize: 14, color: '#5C5A55' }}>
            {v.awayLabel ? `Away on ${v.awayLabel}. ` : ''}Today&apos;s register comes next.
          </p>
        </section>
        <AiTokens childId={v.id} />
      </div>
    </Page>
  )
}
