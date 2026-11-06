import Link from 'next/link'
import { getApprovedView, getCurriculum, getDraftLog, type ApprovedTopic } from '@/lib/data/p30'
import { createSupabaseServer } from '@/lib/supabase/server'
import { docNote, currentTerm, plural, TERM_SHORT, unresolved } from './format'
import { AutoRefresh, ComingLink, DraftFailed, SampleButton, UploadButtons } from './parts'

const GEM = (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none', marginTop: 10 }}>
    <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" />
  </svg>
)
const card = { display: 'flex', flexDirection: 'column', background: '#FFFFFF', border: '1px solid #E7E6EF', borderRadius: 20, padding: 16 } as const
const h1 = { margin: 0, fontSize: 26, lineHeight: 1.2, fontWeight: 600, letterSpacing: '-0.01em', textWrap: 'pretty' } as const
const wrap = { lineHeight: 'normal', display: 'flex', flexDirection: 'column', gap: 20, padding: '14px 20px 16px', maxWidth: 720 } as const

export default async function CurriculumPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params
  const state = await getCurriculum(classId)
  const { map, docs, read } = state

  if (map?.status === 'approved' && read) return <Approved classId={classId} state={state} />

  if (!map || docs.length === 0) {
    const supabase = await createSupabaseServer()
    const { data } = await supabase.from('classes').select('schools(sandbox_id)').eq('id', classId).maybeSingle()
    const demo = Boolean(data?.schools?.sandbox_id)
    return (
      <div style={wrap}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#5D5A73' }}>Curriculum</p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            {GEM}
            <h1 style={h1}>Add your curriculum and Jemma will draft your topic map.</h1>
          </div>
          <p style={{ margin: '0 0 0 24px', fontSize: 15, lineHeight: 1.45, color: '#5D5A73' }}>Nothing reaches a learner until you approve the map.</p>
        </div>
        <section aria-labelledby="docs" style={{ ...card, gap: 10 }}>
          <h2 id="docs" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Your documents</h2>
          <UploadButtons classId={classId} />
        </section>
        {demo ? <SampleButton classId={classId} /> : null}
        <ComingLink>Or start from a map another teacher approved</ComingLink>
      </div>
    )
  }

  if (!read) {
    return (
      <div style={wrap}>
        {state.failedEventId ? (
          <DraftFailed mapId={map.id} />
        ) : (
          <>
            <AutoRefresh />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#5D5A73' }}>Curriculum</p>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                {GEM}
                <h1 style={h1}>Jemma is reading your curriculum.</h1>
              </div>
              <p style={{ margin: '0 0 0 24px', fontSize: 15, lineHeight: 1.45, color: '#5D5A73' }}>
                This takes a minute or two. You can leave this page, your documents are saved.
              </p>
            </div>
            <DocsCard docs={docs} />
          </>
        )}
      </div>
    )
  }

  const log = await getDraftLog(classId, map.created_at)
  const open = unresolved(read, currentTerm()).length
  return (
    <div style={wrap}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#5D5A73' }}>Curriculum</p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          {GEM}
          <h1 style={h1}>
            {open > 0 ? `Your draft topic map is ready. ${plural(open, 'thing')} for you to check.` : 'Your draft topic map is ready.'}
          </h1>
        </div>
        <p style={{ margin: '0 0 0 24px', fontSize: 15, lineHeight: 1.45, color: '#5D5A73' }}>Nothing reaches a learner until you approve the map.</p>
      </div>

      <DocsCard docs={docs} read>
        <UploadButtons classId={classId} />
      </DocsCard>

      <section aria-labelledby="did" style={{ ...card, gap: 6 }}>
        <h2 id="did" style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600 }}>What Jemma did</h2>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {log.map((e, i) => (
            <li key={i} style={{ display: 'flex', gap: 12, fontSize: 14, lineHeight: 1.4 }}>
              <span style={{ width: 40, flex: 'none', color: '#5D5A73', fontVariantNumeric: 'tabular-nums' }}>{e.at}</span>
              <span>{e.text}</span>
            </li>
          ))}
        </ol>
      </section>

      <Link href={`/t/${classId}/curriculum/map`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, marginTop: 37, borderRadius: 14, background: '#1F1D36', color: '#FFFFFF', fontSize: 17, fontWeight: 600, textDecoration: 'none' }}>
        Check the draft map
      </Link>
      <ComingLink>Or start from a map another teacher approved</ComingLink>
    </div>
  )
}

function DocsCard({ docs, read, children }: { docs: { id: string; title: string; pages: number }[]; read?: boolean; children?: React.ReactNode }) {
  return (
    <section aria-labelledby="docs" style={{ ...card, gap: 10 }}>
      <h2 id="docs" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Your documents</h2>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
        {docs.map((d, i) => (
          <li key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: i ? '1px solid #EFEEF4' : undefined }}>
            <span aria-hidden="true" style={{ width: 40, height: 48, flex: 'none', borderRadius: 8, background: '#EEEDF5', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 6, fontSize: 10, fontWeight: 700, color: '#1F1D36' }}>PDF</span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3 }}>{d.title}</span>
              <span style={{ fontSize: 13, color: '#5D5A73' }}>{docNote(d.title, d.pages)}</span>
            </span>
            {read ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Read" style={{ flex: 'none' }}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
            ) : null}
          </li>
        ))}
      </ul>
      {children}
    </section>
  )
}

// ---- teacher-curriculum-approved ------------------------------------------------------------

const rowCard = { display: 'flex', flexDirection: 'column', gap: 2, padding: 16, background: '#FFFFFF', border: '1px solid #E7E6EF', borderRadius: 20 } as const

function Bar({ pct }: { pct: number | null }) {
  if (pct === null) return <span aria-hidden="true" style={{ display: 'block', height: 8, borderRadius: 999, border: '1.5px dashed #CFCDDC' }} />
  return (
    <span aria-hidden="true" style={{ display: 'block', height: 8, borderRadius: 999, background: '#EEEDF5', overflow: 'hidden' }}>
      <span style={{ display: 'block', width: `${pct}%`, height: '100%', borderRadius: 999, background: pct < 50 ? '#FF6A4D' : '#1F1D36' }} />
    </span>
  )
}

function TopicRow({ t, sub, href }: { t: ApprovedTopic; sub?: string; href?: string }) {
  const inner = (
    <>
      <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 1, lineHeight: 1.3 }}>
          <span style={{ fontSize: 15, fontWeight: 500 }}>{t.name}</span>
          {sub ? <span style={{ fontSize: 13, color: '#5D5A73' }}>{sub}</span> : null}
        </span>
        {t.pct === null ? (
          <span style={{ fontSize: 14, color: '#5D5A73' }}>Not tested yet</span>
        ) : (
          <span style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{t.pct}%</span>
        )}
      </span>
      <Bar pct={t.pct} />
    </>
  )
  if (href)
    return (
      <li style={{ borderTop: '1px solid #EFEEF4' }}>
        <Link href={href} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', textDecoration: 'none', color: '#1F1D36' }}>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>{inner}</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8C89A3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}><path d="m9 6 6 6-6 6" /></svg>
        </Link>
      </li>
    )
  return <li style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: '12px 30px 12px 0', borderTop: '1px solid #EFEEF4' }}>{inner}</li>
}

async function Approved({ classId, state }: { classId: string; state: Awaited<ReturnType<typeof getCurriculum>> }) {
  const v = await getApprovedView(classId, state)
  const sectionHead = (id: string, title: string, sub: string) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <h2 id={id} style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>{title}</h2>
        {sub ? <p style={{ margin: 0, fontSize: 14, color: '#5D5A73' }}>{sub}</p> : null}
      </div>
    </div>
  )
  return (
    <div style={{ ...wrap, gap: 18, padding: '14px 20px 20px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600, color: '#5D5A73' }}>
          Curriculum
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px 4px 7px', borderRadius: 999, background: '#EEEDF5', fontSize: 13, fontWeight: 600, color: '#1F1D36' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
            Approved {v.approvedOn}
          </span>
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          {GEM}
          <h1 style={{ ...h1, letterSpacing: '-0.015em' }}>{v.headline}</h1>
        </div>
      </div>

      <section aria-labelledby="now" style={rowCard}>
        {sectionHead('now', `Term ${v.current} · now`, `${TERM_SHORT[v.current]} · ${plural(v.currentTopics.length, 'topic')}`)}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {v.currentTopics.map((t) => <TopicRow key={t.id} t={t} />)}
        </ul>
      </section>

      {v.testName && v.earlier.length > 0 ? (
        <section aria-labelledby="earlier" style={rowCard}>
          {sectionHead('earlier', `Earlier topics in ${v.testName}`, 'Revised in this test, taught before')}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {v.earlier.map((t) => (
              <TopicRow key={t.id} t={t} sub={`Term ${t.term}${t.reteach ? ' · reteach plan ready' : ''}`} href={t.reteach ? `/t/${classId}/gaps/${t.id}` : undefined} />
            ))}
          </ul>
        </section>
      ) : null}

      {v.testName ? (
        <p style={{ margin: 0, display: 'flex', gap: 10, fontSize: 14, lineHeight: 1.45, color: '#5D5A73' }}>
          <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none', marginTop: 4 }}><polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" /></svg>
          Each % is the share of answers the class got right on that topic in {v.testName}. Coral bars are under half.
        </p>
      ) : null}

      <section aria-labelledby="did" style={{ ...rowCard, gap: 10 }}>
        {sectionHead('did', 'What Jemma did', '')}
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
          {v.log.map((e, i) => (
            <li key={i} style={{ display: 'flex', gap: 12, fontSize: 14, lineHeight: 1.4 }}>
              <span style={{ width: 40, flex: 'none', color: '#5D5A73', fontVariantNumeric: 'tabular-nums' }}>{e.at}</span>
              <span>{e.text}</span>
            </li>
          ))}
        </ol>
      </section>

      <Link href={`/t/${classId}/curriculum/map`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: 14, border: '1.5px solid #1F1D36', background: '#FFFFFF', color: '#1F1D36', fontSize: 17, fontWeight: 600, textDecoration: 'none' }}>
        See or edit the whole map
      </Link>
    </div>
  )
}
