import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { getDemoState } from '@/lib/demo'
import { getParentHome, greeting, initialsOf, type ChildCard } from '@/lib/data/p22'
import { AccountLink, BrandHeader, DemoTag, Gem, Main, Page, body, ink, line, list, Bullet } from './add/_parts'

export const metadata = { title: 'Your children · Jemma' }

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

export default async function ParentHomePage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const { userId, profile } = await requireRole('parent')
  const home = await getParentHome(userId)
  const { all } = await searchParams
  if (home.kind === 'pending') redirect('/p/add/pending')
  if (home.kind === 'children' && home.children.length === 1 && !all) redirect(`/p/${home.children[0]!.id}`)
  const initials = initialsOf(profile.display_name)
  const first = profile.display_name.split(/\s+/)[0] ?? profile.display_name
  if (home.kind === 'none') return <Start first={first} initials={initials} />
  return <Children kids={home.children} first={first} initials={initials} />
}

async function Start({ first, initials }: { first: string; initials: string }) {
  const demo = await getDemoState()
  return (
    <Page>
      <BrandHeader>
        <AccountLink initials={initials} />
      </BrandHeader>
      <Main gap={20} padding="18px 20px 28px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p style={{ margin: 0, fontSize: 15, color: body }}>Welcome, {first}</p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Gem />
            <h1 style={{ margin: 0, fontSize: 27, lineHeight: 1.18, fontWeight: 600, letterSpacing: '-0.01em', textWrap: 'pretty' }}>
              Let&apos;s add your child. It takes about a minute.
            </h1>
          </div>
        </div>

        <form action="/p/add" method="get" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 18, background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 22 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Got a class code from a teacher?</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label htmlFor="code" style={{ fontSize: 15, fontWeight: 500 }}>Class code</label>
            <input id="code" name="code" type="text" placeholder="6 letters and numbers" autoComplete="off" maxLength={12} style={{ height: 56, padding: '0 16px', borderRadius: 14, border: '1px solid #8C89A3', background: '#FFFFFF', color: ink, fontSize: 20, fontWeight: 600, letterSpacing: '0.12em', fontFamily: 'inherit' }} />
          </div>
          {demo ? (
            <p style={{ margin: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, fontSize: 14 }}>
              <DemoTag />
              <span>
                Ms Banda&apos;s class code is <strong style={{ fontWeight: 700, letterSpacing: '0.08em' }}>{demo.joinCode}</strong>
              </span>
            </p>
          ) : null}
          <button type="submit" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 56, padding: '12px 20px', textAlign: 'center', textWrap: 'balance', borderRadius: 14, background: ink, color: '#FFFFFF', fontSize: 17, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
            Find the class
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }} aria-hidden="true">
          <span style={{ flex: 1, height: 1, background: line }} />
          <span style={{ fontSize: 13, color: body }}>No code yet?</span>
          <span style={{ flex: 1, height: 1, background: line }} />
        </div>
        <Link href="/p/add" role="button" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 60, borderRadius: 14, border: `1.5px solid ${ink}`, background: '#FFFFFF', color: ink, textDecoration: 'none' }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>Add your child without a code</span>
          <span style={{ fontSize: 13, color: body }}>You can link their teacher later</span>
        </Link>

        <section aria-labelledby="get" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 2px 0' }}>
          <h2 id="get" style={{ margin: 0, fontSize: 15, fontWeight: 600, color: body }}>What you&apos;ll see</h2>
          <ul style={{ ...list, gap: 9 }}>
            <Bullet size={12} top={5}>Marks and gaps from every test</Bullet>
            <Bullet size={12} top={5}>The paper behind each gap</Bullet>
            <Bullet size={12} top={5}>A short lesson to do together at home</Bullet>
          </ul>
        </section>
      </Main>
    </Page>
  )
}

function Children({ kids, first, initials }: { kids: ChildCard[]; first: string; initials: string }) {
  const needy = kids.find((k) => k.needs > 0)
  const headline = needy
    ? `${needy.firstName} is doing well. One thing needs you tonight.`
    : kids.length === 1
      ? `${kids[0]!.firstName} is doing well.`
      : 'Your children are doing well.'
  return (
    <Page>
      <BrandHeader>
        <span style={{ display: 'flex', alignItems: 'center' }}>
          <Link href={`/p/${kids[0]!.id}/notifications`} aria-label={needy ? 'Notifications, 1 new' : 'Notifications'} style={{ position: 'relative', width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: ink }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" />
              <path d="M10 20.5a2 2 0 0 0 4 0" />
            </svg>
            {needy ? <span aria-hidden="true" style={{ position: 'absolute', top: 9, right: 10, width: 10, height: 10, borderRadius: 999, background: '#FF6A4D', border: '2px solid #F7F7FA' }} /> : null}
          </Link>
          <AccountLink initials={initials} />
        </span>
      </BrandHeader>
      <Main gap={22} padding="18px 20px 28px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p style={{ margin: 0, fontSize: 15, color: body }}>{greeting()}, {first}</p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Gem />
            <h1 style={{ margin: 0, fontSize: 27, lineHeight: 1.18, fontWeight: 600, letterSpacing: '-0.01em', textWrap: 'pretty' }}>{headline}</h1>
          </div>
        </div>

        <section aria-labelledby="kids" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 id="kids" style={{ margin: 0, fontSize: 15, fontWeight: 600, color: body }}>Your children</h2>
          {kids.map((k) => (
            <Link key={k.id} href={`/p/${k.id}`} style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 18, background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 22, textDecoration: 'none', color: ink }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span aria-hidden="true" style={{ width: 64, height: 64, flex: 'none', borderRadius: 999, background: '#FFD3C7', fontSize: 26, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {k.firstName.slice(0, 1).toUpperCase()}
                </span>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 22, fontWeight: 600 }}>{k.firstName}</span>
                  <span style={{ fontSize: 15, color: body }}>Grade {k.grade} · {k.schoolName}</span>
                </span>
                {k.needs > 0 ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px 6px 8px', borderRadius: 999, background: '#FF6A4D', color: ink, fontSize: 13, fontWeight: 600, flex: 'none' }}>
                    <span style={{ minWidth: 20, height: 20, padding: '0 6px', borderRadius: 999, background: ink, color: '#FFFFFF', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{k.needs}</span>
                    Needs you
                  </span>
                ) : null}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 14, borderTop: '1px solid #EFEEF4' }}>
                <span style={{ fontSize: 15, lineHeight: 1.4 }}>
                  {k.tonight
                    ? `Doing well. Tonight: ${k.tonight.minutes ? `${k.tonight.minutes} minutes on ` : ''}${lowerFirst(k.tonight.topic)}.`
                    : 'Doing well.'}
                </span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </span>
            </Link>
          ))}
        </section>

        <Link href="/p/add" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16, borderRadius: 20, border: '1.5px dashed #8C89A3', textDecoration: 'none', color: ink }}>
          <span aria-hidden="true" style={{ width: 44, height: 44, flex: 'none', borderRadius: 999, background: '#EEEDF5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 17, fontWeight: 600 }}>Add a child</span>
            <span style={{ fontSize: 14, lineHeight: 1.4, color: body }}>Got a class code from a teacher? Use it here.</span>
          </span>
        </Link>
      </Main>
    </Page>
  )
}
