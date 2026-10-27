import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { getTopicDetail } from '@/lib/data/p24'
import { BackHeader, ChevronRight, Diamond, HideSpaceChrome, QuestionCrop } from '../../papers/_parts'

const card = { display: 'flex', flexDirection: 'column', background: '#FFFFFF', border: '1px solid #E7E6EF' } as const

const STAGE_LABEL = { new: 'New gap', practising: 'Practising', fixed: 'Fixed' } as const

function StageGlyph({ stage }: { stage: 'new' | 'practising' | 'fixed' }) {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      {stage === 'practising' ? <polygon points="1,8 15,8 8,15" fill="#FF6A4D" /> : null}
      {stage === 'fixed' ? <polygon points="8,1 15,8 8,15 1,8" fill="#FF6A4D" /> : null}
      <polygon points="8,1 15,8 8,15 1,8" fill="none" stroke="#1F1D36" strokeWidth="1.8" />
    </svg>
  )
}

export default async function ParentTopicPage({ params }: { params: Promise<{ childId: string; topicKey: string }> }) {
  const { childId, topicKey } = await params
  await requireRole('parent')
  const topic = await getTopicDetail(childId, topicKey)
  if (!topic) notFound()
  const name = topic.child.firstName
  const first = topic.sessions.find((s) => !s.done) ?? topic.sessions[0]
  const doneCount = topic.sessions.filter((s) => s.done).length

  return (
    <div data-p24-detail style={{ display: 'flex', flexDirection: 'column', margin: '0 auto', maxWidth: 560, width: '100%', lineHeight: 'normal' }}>
      <HideSpaceChrome />
      <BackHeader href={`/p/${childId}`} label="Back to profile" line={`${name} · ${topic.child.subject}`} title="Topic" padding="10px 16px 6px 8px" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '8px 20px 20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span
            style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px 5px 9px', borderRadius: 999, background: '#FFFFFF', border: '1px solid #CFCDDC', fontSize: 13, fontWeight: 600 }}
          >
            <StageGlyph stage={topic.stage} />
            {STAGE_LABEL[topic.stage]}
          </span>
          <h1 style={{ margin: 0, fontSize: 26, lineHeight: 1.18, fontWeight: 700, letterSpacing: '-0.015em' }}>{topic.topicName}</h1>
          {topic.slip ? (
            <p style={{ margin: 0, display: 'flex', gap: 10, fontSize: 17, lineHeight: 1.45 }}>
              <Diamond size={12} mt={7} />
              <span>{topic.slip}</span>
            </p>
          ) : null}
        </div>

        {topic.missed.length ? (
          <section aria-labelledby="missed" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <h2 id="missed" style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>
                The questions she missed
              </h2>
              {topic.missedSource ? <span style={{ fontSize: 13, color: '#5D5A73' }}>{topic.missedSource}</span> : null}
            </div>
            {topic.missed.map((q) => (
              <figure key={q.id} style={{ ...card, margin: 0, gap: 10, padding: 12, borderRadius: 18 }}>
                <Link href={`/p/${childId}/papers/${q.paperId}?q=${q.n}#q${q.n}`} aria-label={`Question ${q.n}: open the marked paper`} style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
                  <QuestionCrop row={q} />
                </Link>
                <figcaption style={{ fontSize: 15 }}>
                  <strong style={{ fontWeight: 600 }}>{`Question ${q.n}.`}</strong>
                  {` Wrote ${q.answer}.${q.rightAnswer ? ` Right answer ${q.rightAnswer}.` : ''}`}
                </figcaption>
              </figure>
            ))}
            {topic.firstPaperId ? (
              <Link
                href={`/p/${childId}/papers/${topic.firstPaperId}`}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 12, border: '1.5px solid #1F1D36', background: '#FFFFFF', color: '#1F1D36', fontSize: 15, fontWeight: 600, textDecoration: 'none' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                  <path d="M14 3v5h5M9 13h6M9 17h4" />
                </svg>
                See the whole paper
              </Link>
            ) : null}
          </section>
        ) : null}

        <section aria-labelledby="lessons" style={{ ...card, gap: 10, padding: 16, borderRadius: 20 }}>
          <h2 id="lessons" style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>
            Lessons
          </h2>
          <p style={{ margin: 0, fontSize: 15, color: '#5D5A73' }}>
            {doneCount > 0 ? `${doneCount} done.${first && !first.done ? ' The next one is ready.' : ''}` : first ? 'None done yet. The first one is ready.' : 'None yet. Jemma plans one when she has the time.'}
          </p>
          {first ? (
            <Link
              href={`/p/${childId}/learn`}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, background: '#F4F3F8', textDecoration: 'none', color: '#1F1D36' }}
            >
              <span aria-hidden="true" style={{ width: 40, height: 40, flex: 'none', borderRadius: 12, background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3.5" y="5" width="17" height="5" rx="1" />
                  <rect x="3.5" y="14" width="17" height="5" rx="1" />
                  <path d="M12 5v5M8 14v5M12 14v5M16 14v5" />
                </svg>
              </span>
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{first.label}</span>
                <span style={{ fontSize: 13, color: '#5D5A73' }}>{first.detail}</span>
              </span>
              <ChevronRight />
            </Link>
          ) : null}
        </section>

        <section aria-labelledby="helped" style={{ ...card, gap: 12, padding: 16, borderRadius: 20 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <h2 id="helped" style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>
              Which format helped
            </h2>
            <span style={{ fontSize: 13, fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: '#EEEDF5' }}>
              {topic.tooEarly ? 'Too early to tell' : `${topic.bestFormat} helped most`}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.45, color: '#5D5A73' }}>{`Jemma tries each format 3 times on this topic before saying what helps ${name}.`}</p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {topic.helps.map((h) => (
              <li key={h.format} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 15 }}>
                <span>{h.label}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span aria-hidden="true" style={{ display: 'flex', gap: 4 }}>
                    {Array.from({ length: h.need }, (_, i) => (
                      <span
                        key={i}
                        style={
                          i < h.done
                            ? { width: 12, height: 12, borderRadius: 999, background: '#FF6A4D', border: '1.5px solid #FF6A4D' }
                            : { width: 12, height: 12, borderRadius: 999, border: '1.5px solid #8C89A3' }
                        }
                      />
                    ))}
                  </span>
                  <span style={{ width: 76, textAlign: 'right', fontSize: 13, color: '#5D5A73' }}>{`${Math.min(h.done, h.need)} of ${h.need} done`}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <Link
          href={`/p/${childId}/learn`}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 52, borderRadius: 14, background: '#1F1D36', color: '#FFFFFF', fontSize: 17, fontWeight: 600, textDecoration: 'none' }}
        >
          Practise it now
        </Link>
      </div>
    </div>
  )
}
