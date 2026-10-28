import { PendingButton } from '@/components/ui/Button'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { getFlagTarget } from '@/lib/data/p24'
import { BackHeader, Diamond, PaperSheet } from '../../_parts'
import { sendFlag } from './actions'

export default async function ParentFlagMarkPage({
  params,
  searchParams,
}: {
  params: Promise<{ childId: string; paperId: string }>
  searchParams: Promise<{ q?: string; error?: string }>
}) {
  const { childId, paperId } = await params
  const { q, error } = await searchParams
  await requireRole('parent')
  const target = await getFlagTarget(childId, paperId, q)
  if (!target) notFound()
  const { paper, result } = target
  const back = `/p/${childId}/papers/${paperId}`
  const send = sendFlag.bind(null, childId, paperId, result.id)
  const teacher = paper.child.teacherName
  const btn = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 14, fontSize: 17, fontWeight: 600, textDecoration: 'none' } as const

  return (
    <div data-p24-detail style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#F7F7FA', overflow: 'hidden', lineHeight: 'normal' }}>
      <div style={{ position: 'relative', height: '100%', maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column' }}>
        <BackHeader href={back} label="Back to the paper" line={`${paper.child.firstName} · ${paper.child.subject}`} title={paper.shortTitle} />
        <div aria-hidden="true" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 14, padding: '12px 20px 0', overflow: 'hidden' }}>
          <PaperSheet paper={paper} />
        </div>
        <span aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'rgba(31,29,54,0.5)' }} />
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="flagq"
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', gap: 14, padding: '10px 20px 28px', background: '#FFFFFF', borderRadius: '28px 28px 0 0', boxShadow: '0 -10px 30px rgba(31,29,54,0.18)' }}
        >
          <span aria-hidden="true" style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 999, background: '#CFCDDC' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <h2 id="flagq" style={{ margin: 0, fontSize: 21, fontWeight: 600 }}>{`Question ${result.n} · ${result.prompt}`}</h2>
            <Link href={back} aria-label="Close" style={{ width: 44, height: 44, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, color: '#1F1D36' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </Link>
          </div>
          <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 14, background: '#FBFAF5', border: '1px solid #E3E1D8', fontFamily: 'Arial, Helvetica, sans-serif', color: '#2A2A2A' }}>
            <span style={{ fontSize: 15 }}>{`${result.n}.  ${result.prompt} =`}</span>
            <span style={{ width: 84, height: 44, border: '2px solid #FF6A4D', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "Kalam, 'Comic Sans MS', cursive", color: '#2F3A56', fontSize: 26, lineHeight: 1 }}>{result.answer}</span>
          </div>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.45, color: '#5D5A73' }}>
            {result.correct ? 'Jemma marked it right.' : 'Jemma marked it wrong.'}
            {result.rightAnswer ? (
              <>
                {' '}Right answer <strong style={{ color: '#1F1D36', fontWeight: 600 }}>{result.rightAnswer}</strong>.
              </>
            ) : null}
          </p>
          <form action={send} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label htmlFor="what" style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.35 }}>{`Think this mark is wrong? Tell ${teacher} what you see`}</label>
              <textarea id="what" name="what" rows={3} required placeholder="For example: the photo cuts off her answer" style={{ minHeight: 96, padding: '12px 14px', borderRadius: 14, border: '1px solid #8C89A3', background: '#FFFFFF', color: '#1F1D36', font: 'inherit', fontSize: 16, lineHeight: 1.4, resize: 'none' }} />
              {error ? <span role="alert" style={{ fontSize: 14, color: '#B8381F' }}>{error}</span> : null}
            </div>
            <p style={{ margin: 0, display: 'flex', gap: 10, fontSize: 14, lineHeight: 1.45, color: '#5D5A73' }}>
              <Diamond size={12} mt={4} />
              <span>{`${teacher} decides. If she changes it, you'll see the new mark and her name.`}</span>
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr)', gap: 8 }}>
              <Link href={back} style={{ ...btn, border: '1.5px solid #1F1D36', background: '#FFFFFF', color: '#1F1D36' }}>Cancel</Link>
              <PendingButton type="submit" style={{ ...btn, border: 'none', background: '#1F1D36', color: '#FFFFFF', cursor: 'pointer' }}>{`Send to ${teacher}`}</PendingButton>
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}
