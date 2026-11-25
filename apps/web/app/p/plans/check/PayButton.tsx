'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { pickSmaller, startCheckout } from '../actions'
import { gold } from '../_ui'

/** "Pay on PayFast" (P161): asks the server for the signed form, then posts it to PayFast, which shows its own payment page. */
export function PayButton({ plan, label }: { plan: string; label: string }) {
  const [form, setForm] = useState<{ action: string; fields: [string, string][] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const ref = useRef<HTMLFormElement>(null)
  const go = () =>
    start(async () => {
      setError(null)
      const res = await startCheckout({ plan })
      if (!res.ok) return setError(res.message)
      setForm({ action: res.action, fields: res.fields })
      // The form is drawn with the fields first, then sent.
      requestAnimationFrame(() => ref.current?.submit())
    })
  return (
    <>
      <button type="button" onClick={go} disabled={pending || form !== null} style={{ ...gold, opacity: pending || form ? 0.7 : 1 }}>
        {pending || form ? 'Opening PayFast' : label}
      </button>
      {error ? (
        <p role="alert" style={{ margin: 0, fontSize: 15, color: '#B8281E', textAlign: 'center' }}>
          {error}
        </p>
      ) : null}
      {form ? (
        <form ref={ref} method="post" action={form.action} style={{ display: 'none' }}>
          {form.fields.map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        </form>
      ) : null}
    </>
  )
}

/** "Change to Light": a smaller plan from the next payment, then back to Plans and payments. */
export function SmallerButton({ plan, label }: { plan: string; label: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await pickSmaller({ plan })
            if (!res.ok) return setError(res.message)
            router.push('/p/account/plan')
          })
        }
        style={{ ...gold, opacity: pending ? 0.7 : 1 }}
      >
        {label}
      </button>
      {error ? (
        <p role="alert" style={{ margin: 0, fontSize: 15, color: '#B8281E', textAlign: 'center' }}>
          {error}
        </p>
      ) : null}
    </>
  )
}
