'use client'

import { PendingButton } from '@/components/ui/Button'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { EyeIcon, font } from '../_parts'
import { saveNote } from './actions'

const KINDS = [
  ['participation', 'Participation'],
  ['confidence', 'Confidence'],
  ['effort', 'Effort'],
  ['behaviour', 'Behaviour'],
] as const

export function NoteForm({ childId, initialKind, linkedTo, name }: { childId: string; initialKind: (typeof KINDS)[number][0]; linkedTo: string | null; name: string }) {
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>(initialKind)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  function submit() {
    start(async () => {
      const res = await saveNote(childId, kind, text)
      if (res.ok) {
        setText('')
        setError(null)
        router.refresh()
      } else setError(res.reason)
    })
  }

  return (
    <section aria-labelledby="note" style={{ fontFamily: font, display: 'flex', flexDirection: 'column', gap: 12, padding: 16, background: '#FFFFFF', border: '2px solid #1F1D36', borderRadius: 20 }}>
      <h2 id="note" style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Add a quick note</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {KINDS.map(([id, label]) => {
          const on = kind === id
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              onClick={() => setKind(id)}
              style={{ minHeight: 44, padding: '0 16px', borderRadius: 999, border: on ? 'none' : '1px solid #8C89A3', background: on ? '#1F1D36' : '#FFFFFF', color: on ? '#FFFFFF' : '#1F1D36', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
            >
              {label}
            </button>
          )
        })}
      </div>
      <label htmlFor="notetext" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Note</label>
      <textarea
        id="notetext"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{ width: '100%', minHeight: 96, padding: '12px 14px', borderRadius: 14, border: '1px solid #8C89A3', background: '#FFFFFF', color: '#1F1D36', fontSize: 16, lineHeight: 1.45, resize: 'none', font: 'inherit' }}
      />
      <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, lineHeight: 1.4, color: '#5D5A73' }}>
        <EyeIcon />
        {linkedTo ? `${linkedTo} sees this on ${name}'s profile. Jemma uses it in the guidance.` : `Jemma uses this in the guidance for ${name}.`}
      </p>
      {error ? <p role="alert" style={{ margin: 0, fontSize: 14, color: '#B8381F' }}>{error}</p> : null}
      <PendingButton pending={pending}
        type="button"
        onClick={submit}
        disabled={pending || !text.trim()}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 48, borderRadius: 14, border: 'none', background: '#1F1D36', color: '#FFFFFF', fontSize: 16, fontWeight: 600, opacity: pending || !text.trim() ? 0.6 : 1, cursor: 'pointer' }}
      >
        Save note
      </PendingButton>
    </section>
  )
}
