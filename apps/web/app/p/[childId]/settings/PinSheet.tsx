'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { ReactNode } from 'react'
import { Button, Field, Sheet } from '@/components/ui'
import { setChildPin } from './actions'

/** "Make a new code": the new code needs a PIN, so the parent chooses it here. */
export function NewCodeButton({
  childId,
  childName,
  style,
  children,
}: {
  childId: string
  childName: string
  style: React.CSSProperties
  children: ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string>()
  const [pending, start] = useTransition()

  const save = () =>
    start(async () => {
      const result = await setChildPin(childId, pin)
      if (!result.ok) return setError(result.error)
      setOpen(false)
      setPin('')
      setError(undefined)
      router.refresh()
    })

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={style}>
        {children}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Make a new code" description={`${childName} will sign in with the new code. The old code stops working.`}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
          className="flex flex-col gap-3.5"
        >
          <Field
            label="Choose a 4-digit PIN"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            error={error}
          />
          <Button type="submit" pending={pending} disabled={pin.length !== 4}>
            Save new code
          </Button>
        </form>
      </Sheet>
    </>
  )
}
