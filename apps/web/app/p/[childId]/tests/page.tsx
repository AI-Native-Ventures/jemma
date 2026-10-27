import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { getTestsList } from '@/lib/data/p24'
import { ChevronRight, Diamond } from '../papers/_parts'

const row = { display: 'flex', alignItems: 'center', gap: 14, padding: '14px 12px 14px 14px', background: '#FFFFFF', border: '1px solid #E7E6EF', borderRadius: 18, textDecoration: 'none', color: '#1F1D36' } as const
const cameraPath = 'M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z'

export default async function ParentTestsPage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params
  const { userId } = await requireRole('parent')
  const data = await getTestsList(childId, userId)
  if (!data) notFound()
  const name = data.child.firstName

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '14px 20px 20px', margin: '0 auto', maxWidth: 560 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#5D5A73' }}>Tests</p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Diamond size={14} mt={10} />
          <h1 style={{ margin: 0, fontSize: 27, lineHeight: 1.18, fontWeight: 600, letterSpacing: '-0.015em', textWrap: 'pretty' }}>{data.headline}</h1>
        </div>
      </div>

      {data.needsYou ? (
        <Link href={data.needsYou.href} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 12px 14px 14px', background: '#FFF4F1', border: '1px solid #FFC9BB', borderRadius: 18, textDecoration: 'none', color: '#1F1D36' }}>
          <span aria-hidden="true" style={{ width: 38, height: 38, flex: 'none', borderRadius: 12, background: '#FFE3DA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d={cameraPath} />
              <circle cx="12" cy="12.5" r="3.5" />
            </svg>
          </span>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.3 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#B8381F' }}>Needs you</span>
            <span style={{ fontSize: 16, fontWeight: 600 }}>{data.needsYou.title}</span>
            <span style={{ fontSize: 14, color: '#5D5A73' }}>{data.needsYou.detail}</span>
          </span>
          <ChevronRight />
        </Link>
      ) : null}

      {data.terms.map(({ term, rows }) => (
        <section key={term} aria-labelledby={`t${term}`} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 id={`t${term}`} style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>{`Term ${term}`}</h2>
          {rows.map((r) => {
            const inner = (
              <>
                <span style={{ width: 58, height: 58, flex: 'none', borderRadius: 16, background: '#EEEDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{r.tile}</span>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.3 }}>
                  <span style={{ fontSize: 16, fontWeight: 600 }}>{r.title}</span>
                  {r.lines.map((l) => (
                    <span key={l} style={{ fontSize: 14, color: '#5D5A73' }}>{l}</span>
                  ))}
                </span>
                {r.href ? <ChevronRight /> : null}
              </>
            )
            return r.href ? (
              <Link key={r.key} href={r.href} style={row}>{inner}</Link>
            ) : (
              <div key={r.key} style={row}>{inner}</div>
            )
          })}
        </section>
      ))}

      <section aria-labelledby="snapnew" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16, background: '#FFFFFF', border: '1px solid #E7E6EF', borderRadius: 20 }}>
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <h2 id="snapnew" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Got a new test or homework?</h2>
          <span style={{ fontSize: 14, lineHeight: 1.4, color: '#5D5A73' }}>{`Snap it. Jemma reads it and updates ${name}'s gaps.`}</span>
        </span>
        <Link href={`/p/${childId}/snap`} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 46, padding: '0 16px', borderRadius: 14, background: '#1F1D36', color: '#FFFFFF', fontSize: 15, fontWeight: 600, textDecoration: 'none', flex: 'none' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={cameraPath} />
            <circle cx="12" cy="12.5" r="3.5" />
          </svg>
          Snap
        </Link>
      </section>
    </div>
  )
}
