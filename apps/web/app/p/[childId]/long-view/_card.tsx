import Link from 'next/link'
import { Chevron, css } from '../beyond/_parts'

/** The card on the parent's profile page. The page draws it only when at least one pattern was shared. */
export function LongViewCard({ base, teacherName, count }: { base: string; teacherName: string; count: number }) {
  return (
    <Link
      href={`${base}/long-view`}
      style={css('display:flex;flex-direction:row;align-items:center;gap:14px;padding:16px 12px 16px 16px;background:#FFFFFF;border:1px solid #E7E6EF;border-radius:20px;text-decoration:none;color:#1F1D36')}
    >
      <span style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:4px')}>
        <span style={css('font-size:17px;font-weight:600')}>{`From your talk with ${teacherName}`}</span>
        <span style={css('font-size:14px;line-height:1.4;color:#5D5A73')}>{count === 1 ? '1 thing your teacher shared with you' : `${count} things your teacher shared with you`}</span>
      </span>
      <Chevron />
    </Link>
  )
}
