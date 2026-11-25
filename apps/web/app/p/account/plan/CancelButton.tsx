'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Sheet } from '@/components/ui'
import { cancelPlan } from '../../plans/actions'
import { danger, note, outline, red } from '../../plans/_ui'

/** "Cancel plan" (P161), with a second tap that says what happens: the plan runs to the end of the paid year, then the family is back on Free. */
export function CancelButton({ planName, until }: { planName: string; until: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={{ ...danger, flex: 1, minHeight: 50, padding: '10px 12px' }}>
        Cancel plan
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Cancel your plan?">
        <p style={note}>
          Your family keeps {planName} until {until}. You pay nothing more.
        </p>
        <p style={note}>Then your children go back to Free: 2 practices a day each. Every lesson stays free.</p>
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
              const res = await cancelPlan()
              if (!res.ok) return setError(res.message)
              setOpen(false)
              router.refresh()
            })
          }
          style={{ ...red, opacity: pending ? 0.6 : 1 }}
        >
          {pending ? 'Cancelling' : 'Cancel the plan'}
        </button>
        <button type="button" onClick={() => setOpen(false)} style={outline}>
          Keep the plan
        </button>
      </Sheet>
    </>
  )
}
