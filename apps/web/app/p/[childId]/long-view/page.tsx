import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { getSharedLongView } from '@/lib/data/p52'
import { css, Diamond, SubHeader } from '../beyond/_parts'
import { namesList } from './_card'

const CARD = 'display:flex;flex-direction:column;background:#FFFFFF;border:1px solid #E7E6EF;border-radius:20px;padding:16px'

/**
 * What the teacher has talked through with this parent, and nothing else: the title, the words, where it comes from as plain
 * labels (no links, no records) and the day it was shared. A parent with nothing shared gets "not found", as if the page did not exist.
 */
export default async function ParentLongViewPage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params
  await requireRole('parent')
  const data = await getSharedLongView(childId)
  if (!data) notFound()

  return (
    <>
      <SubHeader back={`/p/${childId}`} backLabel={`Back to ${data.childName}'s profile`} eyebrow={data.childName} title="Long view" />
      <div style={css('display:flex;flex-direction:column;gap:18px;padding:12px 20px 24px;min-height:0;line-height:normal;width:100%;max-width:720px;margin:0 auto')}>
        <div style={css('display:flex;gap:10px;align-items:flex-start')}>
          <Diamond size={14} style={css('flex:none;margin-top:10px')} />
          <h1 style={{ ...css('margin:0;font-size:25px;line-height:1.18;font-weight:600;letter-spacing:-0.015em'), textWrap: 'pretty' }}>
            {`From your ${data.teacherNames.length > 1 ? 'talks' : 'talk'} with ${namesList(data.teacherNames)}`}
          </h1>
        </div>

        <ul style={css('list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:14px')}>
          {data.patterns.map((p) => (
            <li key={p.id}>
              <article aria-labelledby={`shared-${p.id}`} style={css(`${CARD};gap:10px`)}>
                <p style={css('margin:0;font-size:13px;line-height:1.3;color:#5D5A73')}>{p.subject}</p>
                <h2 id={`shared-${p.id}`} style={css('margin:0;font-size:18px;line-height:1.3;font-weight:600')}>
                  {p.title}
                </h2>
                <p style={css('margin:0;font-size:16px;line-height:1.5')}>{p.statement}</p>
                {p.labels.length > 0 ? (
                  <section aria-label={`Where this comes from, ${p.title}`} style={css('display:flex;flex-direction:column;gap:6px')}>
                    <h3 style={css('margin:0;font-size:13px;font-weight:600;color:#5D5A73')}>Where this comes from</h3>
                    <ul style={css('margin:0;padding:0 0 0 18px;display:flex;flex-direction:column;gap:3px;font-size:14px;line-height:1.4;color:#5D5A73')}>
                      {p.labels.map((label, i) => (
                        <li key={`${i}-${label}`}>{label}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {p.sharedOn ? <p style={css('margin:0;font-size:14px;color:#5D5A73')}>{`Shared on ${p.sharedOn}`}</p> : null}
              </article>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}
