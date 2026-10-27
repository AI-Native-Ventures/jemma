import { notFound } from 'next/navigation'
import { getLearnerView } from '@/lib/data/p19'
import { Avatar, BackHeader, Diamond, Page, card, font } from '../_parts'
import { NoteForm } from './NoteForm'

export default async function LearnerPage({ params }: { params: Promise<{ classId: string; childId: string }> }) {
  const { classId, childId } = await params
  const v = await getLearnerView(classId, childId)
  if (!v) notFound()
  const stat = (value: string, label: string) => (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 12px', borderRadius: 12, background: '#F4F3F8' }}>
      <span style={{ fontSize: 20, fontWeight: 700 }}>{value}</span>
      <span style={{ fontSize: 12, color: '#5D5A73' }}>{label}</span>
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
              <span style={{ fontSize: 14, color: '#5D5A73' }}>Grade {v.grade}{v.linkedTo ? ` · linked to ${v.linkedTo}` : ''}</span>
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

        <NoteForm childId={v.id} initialKind="participation" linkedTo={v.linkedTo} name={v.name} />

        <section aria-labelledby="earlier" style={{ ...card(20), gap: 10, padding: 16 }}>
          <h2 id="earlier" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Earlier notes</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {v.notes.length === 0 ? <li style={{ fontSize: 15, color: '#5D5A73' }}>No notes yet.</li> : null}
            {v.notes.map((n, i) => (
              <li key={n.id} style={{ display: 'flex', flexDirection: 'column', gap: 3, ...(i > 0 ? { paddingTop: 12, borderTop: '1px solid #EFEEF4' } : {}) }}>
                <span style={{ fontSize: 13, color: '#5D5A73' }}>{n.label}</span>
                <span style={{ fontSize: 15, lineHeight: 1.45 }}>{n.text}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="att" style={{ ...card(20), gap: 10, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <h2 id="att" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Attendance</h2>
            <span style={{ fontSize: 14, color: '#5D5A73' }}>Term {v.term}: {v.present} of {v.recorded} days</span>
          </div>
          <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(10, minmax(0, 1fr))', gap: 4 }}>
            {v.attendance.map((a, i) => (
              <span
                key={i}
                style={{ height: 22, borderRadius: 6, ...(a.status === 'away' ? { border: '1.5px dashed #B8381F', background: '#FFF4F1' } : { background: '#1F1D36' }) }}
              />
            ))}
          </div>
          <p style={{ margin: 0, fontSize: 14, color: '#5D5A73' }}>
            {v.awayLabel ? `Away on ${v.awayLabel}. ` : ''}Today&apos;s register comes next.
          </p>
        </section>
      </div>
    </Page>
  )
}
