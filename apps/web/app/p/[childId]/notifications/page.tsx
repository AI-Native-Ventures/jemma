import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { getNotifications, type NotificationRow } from '@/lib/data/p24'
import { BackHeader, Diamond, HideSpaceChrome } from '../papers/_parts'
import { markAllRead } from './actions'

const ICONS: Record<string, string[]> = {
  learn: ['M4 5.5C4 4.7 4.7 4 5.5 4H10c1.1 0 2 .9 2 2v14c0-1.1-.9-2-2-2H4z', 'M20 5.5c0-.8-.7-1.5-1.5-1.5H14c-1.1 0-2 .9-2 2v14c0-1.1.9-2 2-2h6z'],
  paper: ['M8.5 8h7M8.5 11.5h7M8.5 15h4'],
  snap: ['M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z'],
  note: ['M5 4.5h10l4 4V19.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-14a1 1 0 0 1 1-1z', 'M14.5 4.5V9h4.5', 'M8 13h8M8 16.5h5'],
}

function iconOf(href: string) {
  const kind = /\/learn/.test(href) ? 'learn' : /\/(papers|tests)/.test(href) ? 'paper' : /\/snap/.test(href) ? 'snap' : 'note'
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      {kind === 'paper' ? <rect x="5" y="3.5" width="14" height="17" rx="2" /> : null}
      {kind === 'snap' ? <circle cx="12" cy="12.5" r="3.5" /> : null}
      {ICONS[kind]!.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}

function Item({ n, initial }: { n: NotificationRow; initial: string }) {
  const base = { display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 12px 14px 14px', borderRadius: 18, textDecoration: 'none', color: '#1F1D36' } as const
  return (
    <li>
      <Link href={n.href} style={n.unread ? { ...base, background: '#FFF4F1', border: '1px solid #FFC9BB' } : { ...base, background: '#FFFFFF', border: '1px solid #E7E6EF' }}>
        {n.unread ? (
          <span aria-hidden="true" style={{ position: 'relative', width: 38, height: 38, flex: 'none', borderRadius: 999, background: '#FFD3C7', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {initial}
            <svg width="18" height="18" viewBox="0 0 16 16" style={{ position: 'absolute', right: -4, bottom: -4, background: '#FFFFFF', borderRadius: 999, padding: 1 }}>
              <polygon points="1,8 15,8 8,15" fill="#FF6A4D" />
              <polygon points="8,1 15,8 8,15 1,8" fill="none" stroke="#1F1D36" strokeWidth="1.4" />
            </svg>
          </span>
        ) : (
          <span aria-hidden="true" style={{ width: 38, height: 38, flex: 'none', borderRadius: 12, background: '#EEEDF5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{iconOf(n.href)}</span>
        )}
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}>{n.title}</span>
          <span style={{ fontSize: 14, color: '#5D5A73', lineHeight: 1.4 }}>{n.body}</span>
        </span>
        <span style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, paddingTop: 2 }}>
          <span style={{ fontSize: 13, color: '#5D5A73', fontVariantNumeric: 'tabular-nums' }}>{n.time}</span>
          {n.unread ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#B8381F' }}>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: '#FF6A4D' }} />
              New
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  )
}

export default async function ParentNotificationsPage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params
  const { userId } = await requireRole('parent')
  const page = await getNotifications(childId, userId)
  if (!page) notFound()
  const name = page.child.firstName
  const markAll = markAllRead.bind(null, childId)

  return (
    <div data-p24-detail style={{ display: 'flex', flexDirection: 'column', margin: '0 auto', maxWidth: 560, lineHeight: 'normal' }}>
      <HideSpaceChrome />
      <BackHeader
        href={`/p/${childId}`}
        label={`Back to ${name}'s profile`}
        line={name}
        title="Notifications"
        right={
          <form action={markAll}>
            <button type="submit" style={{ minHeight: 44, padding: '0 8px', border: 'none', background: 'transparent', font: 'inherit', fontSize: 14, fontWeight: 600, color: '#1F1D36', textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer' }}>
              Mark all read
            </button>
          </form>
        }
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '14px 20px 20px' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Diamond size={14} mt={10} />
          <h1 style={{ margin: 0, fontSize: 26, lineHeight: 1.18, fontWeight: 600, letterSpacing: '-0.015em', textWrap: 'pretty' }}>{page.headline}</h1>
        </div>
        {page.groups.map((g, i) => (
          <section key={g.label} aria-labelledby={`g${i}`} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h2 id={`g${i}`} style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#5D5A73' }}>{g.label}</h2>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {g.items.map((n) => (
                <Item key={n.id} n={n} initial={name.slice(0, 1).toUpperCase()} />
              ))}
            </ul>
          </section>
        ))}
        <p style={{ margin: 0, display: 'flex', gap: 10, fontSize: 14, lineHeight: 1.45, color: '#5D5A73' }}>
          <Diamond size={12} mt={4} />
          {`You hear from Jemma when a lesson is ready and when ${name} finishes one. Change this in ${name}'s settings.`}
        </p>
      </div>
    </div>
  )
}
