'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Bullet, body, ink, line, list, primaryButton } from './_parts'

export type FoundCard = { className: string; teacherName: string; grade: number; schoolName: string }

const input = { fontFamily: 'inherit', background: '#FFFFFF', color: ink, borderRadius: 14, padding: '0 16px' } as const

/** Code, class card and the child's name. Leaving the code box looks the class up again. */
export function AddChildForm({ code, child, surname, needsSurname, found, error }: { code: string; child: string; surname: string; needsSurname: boolean; found: FoundCard | null; error: string | null }) {
  const router = useRouter()
  const [name, setName] = useState(child)
  const [last, setLast] = useState(surname)
  const [typed, setTyped] = useState(code)
  const kid = name.trim() || 'your child'
  const possessive = name.trim() ? `${name.trim()}'s` : 'Your child’s'

  const lookUp = () => {
    const clean = typed.replace(/\s+/g, '').toUpperCase()
    if (clean !== code) router.replace(`/p/add?${new URLSearchParams({ code: clean, child: name })}`)
  }

  return (
    <>
      <form id="add" action="/p/add/consent" method="get" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="code" style={{ fontSize: 15, fontWeight: 500 }}>Class code</label>
          <input
            id="code" name="code" type="text" autoComplete="off" value={typed} maxLength={12}
            onChange={(e) => setTyped(e.target.value)} onBlur={lookUp} required
            style={{ ...input, height: 56, border: `2px solid ${ink}`, fontSize: 22, fontWeight: 600, letterSpacing: '0.14em' }}
          />
        </div>
        {found ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: '#FFFFFF', border: `1px solid ${line}` }}>
            <span aria-hidden="true" style={{ width: 36, height: 36, flex: 'none', borderRadius: 999, background: '#EEEDF5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>{found.className}, {found.teacherName}</span>
              <span style={{ fontSize: 14, color: body }}>Grade {found.grade} · {found.schoolName}</span>
            </span>
          </div>
        ) : code ? (
          <p role="alert" style={{ margin: 0, fontSize: 15, color: '#B8381F' }}>No class has that code. Check it with the teacher.</p>
        ) : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="kid" style={{ fontSize: 15, fontWeight: 500 }}>Your child&apos;s name, as the school has it</label>
          <input
            id="kid" name="child" type="text" autoComplete="off" value={name} required
            onChange={(e) => setName(e.target.value)}
            style={{ ...input, height: 52, border: '1px solid #8C89A3', fontSize: 17 }}
          />
        </div>
        {needsSurname || surname ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label htmlFor="surname" style={{ fontSize: 15, fontWeight: 500 }}>Your child&apos;s surname</label>
            <input
              id="surname" name="surname" type="text" autoComplete="off" value={last} required={needsSurname}
              onChange={(e) => setLast(e.target.value)}
              style={{ ...input, height: 52, border: '1px solid #8C89A3', fontSize: 17 }}
            />
            <span style={{ fontSize: 13, color: body }}>More than one child in this class has this first name, so the school needs the surname too.</span>
          </div>
        ) : null}
        {error ? <p role="alert" style={{ margin: 0, fontSize: 15, color: '#B8381F' }}>{error}</p> : null}
      </form>

      <section aria-labelledby="see" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16, background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 18 }}>
        <h2 id="see" style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Once linked, you&apos;ll see</h2>
        <ul style={{ ...list, gap: 8 }}>
          <Bullet size={12} top={5}>{possessive} marks, gaps and the papers behind them</Bullet>
          <Bullet size={12} top={5}>{found ? `${found.teacherName}'s` : 'The teacher’s'} notes and attendance</Bullet>
          <Bullet size={12} top={5}>Tonight&apos;s lesson, ready to hand to {name.trim() || 'your child'}</Bullet>
        </ul>
        <p style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.4, color: body }}>{found ? found.teacherName : 'The teacher'} says yes before you see anything.</p>
      </section>

      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button type="submit" form="add" style={primaryButton}>Link {kid}</button>
        <Link href="/p/add" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, color: ink, fontSize: 15, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 }}>
          No code? Add your child yourself
        </Link>
      </div>
    </>
  )
}
