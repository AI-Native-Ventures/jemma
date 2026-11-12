import Link from 'next/link'
import { getChildProfileView, getLearnerView, getLearnersView } from '@/lib/data/p19'
import { getLearnerDetailExtras } from '@/lib/data/p33'
import { Only } from '../Only'
import { Avatar, Chevron, Diamond, Page, card, font } from './_parts'
import { LaptopLearners } from './LaptopLearners'
import { ShareCode } from './ShareCode'

export default async function LearnersPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>
  searchParams: Promise<{ child?: string }>
}) {
  const { classId } = await params
  const { child } = await searchParams
  const v = await getLearnersView(classId)
  const selected = v.learners.find((l) => l.id === child)?.id ?? v.learners[0]?.id ?? ''
  const [view, profile, extras] = selected
    ? await Promise.all([getLearnerView(classId, selected), getChildProfileView(classId, selected), getLearnerDetailExtras(selected)])
    : [null, null, null]
  return (
    <>
      <Only on="phone">
        <Phone classId={classId} v={v} />
      </Only>
      <Only on="laptop">
        <LaptopLearners v={v} classId={classId} selected={selected} detail={view && profile && extras ? { view, profile, extras } : null} />
      </Only>
    </>
  )
}

function Phone({ classId, v }: { classId: string; v: Awaited<ReturnType<typeof getLearnersView>> }) {
  return (
    <Page>
      <div style={{ fontFamily: font, display: 'flex', flexDirection: 'column', gap: 18, padding: '14px 20px 20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#5D5A73' }}>Learners</p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Diamond />
            <h1 style={{ margin: 0, fontSize: 26, lineHeight: 1.2, fontWeight: 600, letterSpacing: '-0.01em', textWrap: 'pretty' }}>{v.headline}</h1>
          </div>
        </div>

        <section aria-label="Today's register" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px 12px 14px', background: '#FFFFFF', border: '1px solid #E7E6EF', borderRadius: 18 }}>
          <span aria-hidden="true" style={{ width: 40, height: 40, flex: 'none', borderRadius: 12, background: '#EEEDF5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="5" width="16" height="15" rx="2" />
              <path d="M4 9.5h16M8.5 3v4M15.5 3v4" />
              <path d="m9 14.5 2 2 4-4" />
            </svg>
          </span>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>Register for today</span>
            <span style={{ fontSize: 14, color: '#5D5A73' }}>{v.todayLabel} · {v.registerTaken ? 'taken' : 'not taken yet'}</span>
          </span>
          <Link href={`/t/${classId}/register`} style={{ display: 'flex', alignItems: 'center', height: 44, padding: '0 16px', borderRadius: 12, background: '#1F1D36', color: '#FFFFFF', fontSize: 15, fontWeight: 600, flex: 'none', textDecoration: 'none' }}>
            {v.registerTaken ? 'Change it' : 'Take it'}
          </Link>
        </section>

        <section aria-label="Add past records" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px 12px 14px', background: '#FFFFFF', border: '1px solid #E7E6EF', borderRadius: 18 }}>
          <span aria-hidden="true" style={{ width: 40, height: 40, flex: 'none', borderRadius: 12, background: '#EEEDF5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
              <path d="M14 3v5h5M12 17v-6M9 14l3-3 3 3" />
            </svg>
          </span>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>Past records</span>
            <span style={{ fontSize: 14, color: '#5D5A73' }}>Bring in old results for the Long view</span>
          </span>
          <Link href={`/t/${classId}/learners/records`} style={{ display: 'flex', alignItems: 'center', height: 44, padding: '0 16px', borderRadius: 12, background: '#1F1D36', color: '#FFFFFF', fontSize: 15, fontWeight: 600, flex: 'none', textDecoration: 'none' }}>
            Add past records
          </Link>
        </section>

        <section aria-labelledby="list" style={{ ...card(20), padding: '6px 6px 6px 14px' }}>
          <h2 id="list" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>All learners</h2>
          <div aria-hidden="true" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 40px 6px 46px', fontSize: 12, fontWeight: 600, color: '#5D5A73' }}>
            <span>Top gap</span>
            <span>Average · days here</span>
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
            {v.learners.map((l, i) => (
              <li key={l.id}>
                <Link href={`/t/${classId}/learners/${l.id}/profile`} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 66, borderTop: '1px solid #EFEEF4', textDecoration: 'none', color: '#1F1D36' }}>
                  <Avatar name={l.name} first={i === 0} />
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1, lineHeight: 1.3 }}>
                    <span style={{ fontSize: 16, fontWeight: 600 }}>{l.name}</span>
                    <span style={{ fontSize: 13, color: '#5D5A73' }}>{l.topGap ?? 'No open gaps'}</span>
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, lineHeight: 1.3 }}>
                    <span style={{ fontSize: 17, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{l.average === null ? '-' : `${l.average}%`}</span>
                    <span style={{ fontSize: 13, color: '#5D5A73', fontVariantNumeric: 'tabular-nums' }}>{l.present} of {l.recorded} days</span>
                  </span>
                  <Chevron />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <ShareCode code={v.joinCode} />
      </div>
    </Page>
  )
}
