import Link from 'next/link'
import { notFound } from 'next/navigation'
import { TabBar } from '@/components/blocks'
import { requireRole } from '@/lib/auth'
import { getPaperDetail, sharedTopicWord } from '@/lib/data/p24'
import { BackHeader, ChevronRight, Diamond, HideSpaceChrome, PaperSheet } from '../_parts'

export default async function ParentPaperPage({
  params,
  searchParams,
}: {
  params: Promise<{ childId: string; paperId: string }>
  searchParams: Promise<{ q?: string }>
}) {
  const { childId, paperId } = await params
  const { q } = await searchParams
  await requireRole('parent')
  const paper = await getPaperDetail(childId, paperId)
  if (!paper) notFound()
  const name = paper.child.firstName
  const word = sharedTopicWord(paper.missed)
  const highlightN = q ? Number(q) : undefined
  const flagHref = (resultId?: string) => `/p/${childId}/papers/${paperId}/flag${resultId ? `?q=${resultId}` : ''}`

  return (
    <div data-p24-detail data-p24-own-tabs style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', lineHeight: 'normal' }}>
      <HideSpaceChrome ownTabs />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, margin: '0 auto', maxWidth: 560, width: '100%' }}>
        <BackHeader href={`/p/${childId}/tests`} label="Back to tests" line={`${name} · ${paper.child.subject}`} title={paper.shortTitle} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18, padding: '12px 20px 20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#5D5A73' }}>{`${paper.dayLabel} · marked by Jemma at ${paper.markedAt}`}</p>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <Diamond size={14} mt={10} />
              <h1 style={{ margin: 0, fontSize: 27, lineHeight: 1.18, fontWeight: 600, letterSpacing: '-0.015em', textWrap: 'pretty' }}>
                {`${paper.total} out of ${paper.outOf}.${word ? ` Every mark she lost was on ${word}.` : paper.missed.length ? ` She lost marks on ${paper.missed.length} questions.` : ' She got every mark.'}`}
              </h1>
            </div>
          </div>

          <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <PaperSheet paper={paper} highlightN={highlightN} />
            <figcaption style={{ fontSize: 14, lineHeight: 1.45, color: '#5D5A73' }}>
              {`${paper.child.teacherName} snapped ${name}'s paper at ${paper.snappedAt}. Jemma marked it against her memo. Coral marks are the ones ${name} missed.`}
            </figcaption>
          </figure>

          <Link
            href={flagHref(highlightN ? paper.missed.find((r) => r.n === highlightN)?.id : undefined)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 52, padding: '0 14px', borderRadius: 14, background: '#FFFFFF', border: '1px solid #E7E6EF', textDecoration: 'none', color: '#1F1D36', fontSize: 15, fontWeight: 600 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 21V4h11l-1.5 4L16 12H5" />
            </svg>
            {`Think a mark is wrong? Tell ${paper.child.teacherName}`}
          </Link>

          {paper.missed.length ? (
            <section aria-labelledby="missed" style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 16, background: '#FFFFFF', border: '1px solid #E7E6EF', borderRadius: 20 }}>
              <h2 id="missed" style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>{`The ${paper.missed.length} she missed`}</h2>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {paper.missed.map((r) => (
                  <li key={r.id} style={{ borderTop: '1px solid #EFEEF4' }}>
                    <Link href={flagHref(r.id)} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0', color: 'inherit', textDecoration: 'none' }}>
                      <span style={{ width: 34, height: 34, flex: 'none', borderRadius: 10, background: '#FFE3DA', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{`Q${r.n}`}</span>
                      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.35 }}>
                        <span style={{ fontSize: 16, fontWeight: 600 }}>{r.prompt}</span>
                        <span style={{ fontSize: 14, color: '#5D5A73' }}>{`Wrote ${r.answer}${r.rightAnswer ? `, right is ${r.rightAnswer}` : ''}`}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#5D5A73' }}>{r.topicName}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {paper.slipLine ? (
                <p style={{ margin: 0, display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 14, background: '#F4F3F8', fontSize: 15, lineHeight: 1.45 }}>
                  <Diamond size={12} mt={5} />
                  {paper.slipLine}
                </p>
              ) : null}
            </section>
          ) : null}

          {paper.topGap ? (
            <Link
              href={`/p/${childId}/topics/${paper.topGap.id}`}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 12px 16px 16px', background: '#FFFFFF', border: '1px solid #E7E6EF', borderRadius: 18, textDecoration: 'none', color: '#1F1D36' }}
            >
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 16, fontWeight: 600 }}>{`${paper.topGap.topicName.split(' with ')[0]}: how to help`}</span>
                <span style={{ fontSize: 14, color: '#5D5A73' }}>{`Her biggest gap, and tonight's lesson`}</span>
              </span>
              <ChevronRight />
            </Link>
          ) : null}
        </div>
        <TabBar role="parent" active="tests" label={name} base={`/p/${childId}`} />
      </div>
    </div>
  )
}
