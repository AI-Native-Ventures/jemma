'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button, Field, Sheet } from '@/components/ui'
import { setChildPin } from './settings/actions'

const outline =
  'flex min-h-14 w-full cursor-pointer items-center justify-center rounded-14 border-[1.5px] border-ink bg-card px-5 py-3 text-center text-[17px] leading-[1.25] font-semibold text-balance text-ink'

/**
 * "Make a sign-in code for {name}": the code-and-PIN flow the teacher has for a learner of a class, for a child who has no teacher. The parent picks a
 * 4-digit PIN, the server makes the code (`setChildPin`: only the linked parent may, and an earlier code stops working), and the code is shown on the card.
 * The PIN is never kept, so nothing can show it again: a lost PIN is a new code. {name} then signs in on their own phone with the code and the PIN.
 */
export function SignInCard({ childId, name, code }: { childId: string; name: string; code: string | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string>()
  const [made, setMade] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const shown = made ?? code
  const title = shown ? 'Make a new code' : `Make a sign-in code for ${name}`

  const save = () =>
    start(async () => {
      const result = await setChildPin(childId, pin)
      if (!result.ok) return setError(result.error)
      setMade(result.code)
      setOpen(false)
      setPin('')
      setError(undefined)
      router.refresh()
    })

  return (
    <section aria-labelledby="alone-signin" className="flex flex-col gap-3 rounded-20 border border-line bg-card p-4 leading-[normal]">
      <div className="flex flex-col gap-1">
        <h2 id="alone-signin" className="m-0 text-[17px] font-semibold">
          {name}&apos;s sign-in
        </h2>
        {shown ? (
          <p className="m-0 text-[14px] leading-[1.45] text-body">
            {name} signs in on their own phone with this code and the PIN you chose. Keep them at home.
          </p>
        ) : (
          <p className="m-0 text-[14px] leading-[1.45] text-body">Make a code so {name} can sign in on their own phone. No email is needed.</p>
        )}
      </div>
      {shown ? (
        <div className="flex flex-col gap-1 rounded-14 bg-soft-2 px-4 py-3">
          <span className="text-[13px] text-body">{name}&apos;s code</span>
          <span aria-label={`${name}'s code is ${shown}`} className="text-[34px] leading-[1.1] font-bold tracking-[0.16em]">
            {shown}
          </span>
        </div>
      ) : null}
      <button type="button" onClick={() => setOpen(true)} className={outline}>
        {title}
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description={shown ? `${name} will sign in with the new code. The old code stops working.` : `${name} will sign in with the code and this PIN.`}
      >
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
          <Button type="submit" className="!h-auto min-h-14 !px-5 py-3 text-center text-balance" pending={pending} disabled={pin.length !== 4}>
            {shown ? 'Save new code' : 'Make the code'}
          </Button>
        </form>
      </Sheet>
    </section>
  )
}
