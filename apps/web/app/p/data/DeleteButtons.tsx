'use client'

import { useState, useTransition, type CSSProperties } from 'react'
import { Sheet } from '@/components/ui'
import { dangerButton, outlineButton } from '../account/_styles'
import { deleteChild, deleteMyAccount } from './actions'

const red: CSSProperties = { ...dangerButton, border: 'none', background: '#B8281E', color: '#FFFFFF' }
const note: CSSProperties = { margin: 0, fontSize: 15, lineHeight: 1.5, color: '#3D3B37' }

function Confirm({ label, title, lines, yes, act }: { label: string; title: string; lines: string[]; yes: string; act: () => Promise<{ ok: false; message: string } | undefined | void> }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={dangerButton}>
        {label}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        {lines.map((l) => (
          <p key={l} style={note}>
            {l}
          </p>
        ))}
        {error ? (
          <p role="alert" style={{ margin: 0, fontSize: 14, color: '#B8281E' }}>
            {error}
          </p>
        ) : null}
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null)
              const res = await act()
              if (res && !res.ok) setError(res.message)
            })
          }
          style={{ ...red, opacity: pending ? 0.6 : 1 }}
        >
          {pending ? 'Deleting' : yes}
        </button>
        <button type="button" onClick={() => setOpen(false)} style={outlineButton}>
          Keep it
        </button>
      </Sheet>
    </>
  )
}

/** "Delete {name}'s data", with a second tap that says exactly what goes. */
export function DeleteChildButton({ childId, name }: { childId: string; name: string }) {
  return (
    <Confirm
      label={`Delete ${name}'s data`}
      title={`Delete ${name}'s data?`}
      lines={[
        `${name}'s marks, practice, lessons, photos and sign-in are deleted from Jemma now.`,
        `If ${name} is in a teacher's class, ${name} leaves the class and the teacher is told.`,
        'This cannot be undone.',
      ]}
      yes={`Delete ${name}'s data`}
      act={() => deleteChild(childId)}
    />
  )
}

/** "Delete my account", with a second tap that says exactly what goes. */
export function DeleteAccountButton() {
  return (
    <Confirm
      label="Delete my account"
      title="Delete your account?"
      lines={[
        'Your account is deleted now, and you are signed out.',
        "A child you added yourself is deleted with it. A child in a teacher's class stays in that class, without your link.",
        'This cannot be undone.',
      ]}
      yes="Delete my account"
      act={() => deleteMyAccount()}
    />
  )
}
