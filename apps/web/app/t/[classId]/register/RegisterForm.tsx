'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Avatar, EyeIcon, font } from '../learners/_parts'
import { saveRegister } from './actions'

type Status = 'here' | 'late' | 'away'
type Row = { id: string; name: string; present: number; recorded: number; status: Status }

const OPTIONS: [Status, string][] = [
  ['here', 'Here'],
  ['late', 'Late'],
  ['away', 'Away'],
]

export function RegisterForm({ classId, day, rows }: { classId: string; day: string; rows: Row[] }) {
  const [status, setStatus] = useState<Record<string, Status>>(Object.fromEntries(rows.map((r) => [r.id, r.status])))
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  function save() {
    start(async () => {
      const res = await saveRegister(classId, day, rows.map((r) => ({ childId: r.id, status: status[r.id]! })))
      if (res.ok) router.push(`/t/${classId}/learners`)
      else setError(res.reason)
    })
  }

  return (
    <div style={{ fontFamily: font, display: 'flex', flexDirection: 'column', gap: 16, padding: '10px 20px 20px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none', marginTop: 10 }}>
            <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" />
          </svg>
          <h1 style={{ margin: 0, fontSize: 26, lineHeight: 1.2, fontWeight: 600, letterSpacing: '-0.01em', textWrap: 'pretty' }}>Who&apos;s here today?</h1>
        </div>
        <p style={{ margin: '0 0 0 24px', fontSize: 15, lineHeight: 1.45, color: '#5D5A73' }}>Everyone starts as here. Change anyone who&apos;s late or away.</p>
      </div>

      <button
        type="button"
        onClick={() => setStatus(Object.fromEntries(rows.map((r) => [r.id, 'here' as Status])))}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 14, border: '1.5px solid #1F1D36', background: '#FFFFFF', color: '#1F1D36', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
        Mark everyone here
      </button>

      <section aria-label="Learners" style={{ display: 'flex', flexDirection: 'column', background: '#FFFFFF', border: '1px solid #E7E6EF', borderRadius: 20, padding: '4px 10px 4px 14px' }}>
        {rows.map((r, i) => (
          <fieldset key={r.id} style={{ border: 'none', borderTop: i > 0 ? '1px solid #EFEEF4' : 'none', margin: 0, padding: 0, display: 'flex', alignItems: 'center', gap: 10, minHeight: 70 }}>
            <legend style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{r.name}</legend>
            <Avatar name={r.name} first={i === 0} />
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>{r.name}</span>
              <span style={{ fontSize: 12, color: '#5D5A73' }}>{r.present} of {r.recorded} days</span>
            </span>
            <span style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 4, width: 180, flex: 'none' }}>
              {OPTIONS.map(([id, label]) => {
                const on = status[r.id] === id
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setStatus((s) => ({ ...s, [r.id]: id }))}
                    style={{ height: 44, borderRadius: 10, border: on ? 'none' : '1px solid #CFCDDC', background: on ? '#1F1D36' : '#FFFFFF', color: on ? '#FFFFFF' : '#1F1D36', fontSize: 14, fontWeight: on ? 600 : 500, cursor: 'pointer' }}
                  >
                    {label}
                  </button>
                )
              })}
            </span>
          </fieldset>
        ))}
      </section>

      <p style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, lineHeight: 1.4, color: '#5D5A73' }}>
        <EyeIcon />
        Parents see attendance on their child&apos;s profile. Days count this term.
      </p>

      {error ? <p role="alert" style={{ margin: 0, fontSize: 14, color: '#B8381F' }}>{error}</p> : null}
      <div style={{ flex: 1 }} />
      <button
        type="button"
        onClick={save}
        disabled={pending}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 52, borderRadius: 14, border: 'none', background: '#1F1D36', color: '#FFFFFF', fontSize: 17, fontWeight: 600, opacity: pending ? 0.6 : 1, cursor: 'pointer' }}
      >
        Save register
      </button>
    </div>
  )
}
