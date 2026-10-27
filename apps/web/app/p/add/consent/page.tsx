import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { cleanCode, findChildInClass, findClass } from '@/lib/data/p22'
import { requestLink } from '../actions'
import { BackHeader, Bullet, Gem, Main, Page, body, ink, line, list, primaryButton } from '../_parts'

export const metadata = { title: 'Before you link · Jemma' }

const label = { display: 'flex', alignItems: 'flex-start', gap: 12, minHeight: 48, padding: '13px 14px', borderRadius: 14, background: '#FFFFFF', border: `1px solid ${line}`, cursor: 'pointer' } as const
const box = { width: 22, height: 22, margin: '1px 0 0', flex: 'none', accentColor: ink } as const

function Tick({ name, title, note, checked, required }: { name: string; title: string; note: string; checked: boolean; required?: boolean }) {
  return (
    <label style={label}>
      <input type="checkbox" name={name} defaultChecked={checked} required={required} style={box} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.35 }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>{title}</span>
        <span style={{ fontSize: 13, color: body }}>{note}</span>
      </span>
    </label>
  )
}

export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ code?: string; child?: string; error?: string }> }) {
  await requireRole('parent')
  const q = await searchParams
  const code = cleanCode(q.code)
  const typed = (q.child ?? '').trim()
  const back = (error?: string) => `/p/add?${new URLSearchParams({ code, child: typed, ...(error ? { error } : {}) })}`
  const cls = code ? await findClass(code) : null
  if (!cls) redirect(back())
  const kid = await findChildInClass(cls.classId, typed)
  if (!kid) redirect(back(`${cls.teacherName}'s class has no one called ${typed || 'that'}. Check the spelling.`))
  const name = kid.firstName

  return (
    <Page>
      <BackHeader href={back()} padding="10px 12px 6px 8px">
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, flex: 1, minWidth: 0, color: ink }}>
          <span style={{ fontSize: 13, color: body }}>{name} · {cls.className}</span>
          <span style={{ fontSize: 17, fontWeight: 700 }}>Before you link</span>
        </span>
      </BackHeader>

      <Main gap={16} padding="12px 20px 24px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Gem />
            <h1 style={{ margin: 0, fontSize: 25, lineHeight: 1.18, fontWeight: 600, letterSpacing: '-0.015em', textWrap: 'pretty' }}>
              Jemma keeps {name}&apos;s schoolwork so it can teach her. Is that okay with you?
            </h1>
          </div>
        </div>

        <section aria-labelledby="keeps" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16, background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <h2 id="keeps" style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>What Jemma keeps</h2>
            </div>
          </div>
          <ul style={{ ...list, gap: 9 }}>
            <Bullet size={11} top={5}>Photos of her tests and homework</Bullet>
            <Bullet size={11} top={5}>Her marks, gaps and lessons</Bullet>
            <Bullet size={11} top={5}>{cls.teacherName}&apos;s notes and the class register</Bullet>
          </ul>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45, color: body }}>Only you, {cls.teacherName} and {name} see it.</p>
        </section>

        <form id="consent" action={requestLink} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input type="hidden" name="code" value={code} />
          <input type="hidden" name="child" value={name} />
          <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <legend style={{ padding: 0, marginBottom: 8, fontSize: 16, fontWeight: 600 }}>Your OK</legend>
            <Tick name="guardian" title={`I'm ${name}'s parent or legal guardian`} note="Needed" checked required />
            <Tick name="teach" title={`Jemma can use ${name}'s schoolwork to teach her`} note="Needed" checked required />
            <Tick name="improve" title="Use her work, name removed, to make Jemma better" note="Optional" checked={false} />
          </fieldset>
        </form>

        {q.error ? <p role="alert" style={{ margin: 0, fontSize: 15, color: '#B8381F' }}>{q.error}</p> : null}

        <p style={{ margin: 0, display: 'flex', gap: 10, fontSize: 14, lineHeight: 1.45, color: body }}>
          <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none', marginTop: 4 }}>
            <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" />
          </svg>
          <span>South Africa&apos;s POPIA law treats under-18s as children, so we need your OK. Change this any time in {name}&apos;s settings.</span>
        </p>
        <a href="/privacy" style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', minHeight: 44, fontSize: 15, fontWeight: 600, color: ink, textUnderlineOffset: 3 }}>
          Privacy in plain words
        </a>
        <button type="submit" form="consent" style={{ ...primaryButton, gap: 8 }}>Agree and ask {cls.teacherName}</button>
        <div style={{ flex: 1 }} />
      </Main>
    </Page>
  )
}
