'use client'

import { useId, useState, useTransition } from 'react'
import { linkChildWithCode } from './link-actions'

const field = 'min-h-[52px] w-full rounded-14 border border-muted-2 bg-card px-3.5 py-2 text-[22px] font-semibold tracking-[0.14em] text-ink uppercase'
const label = 'text-[15px] font-medium'
const outline =
  'flex min-h-14 w-full cursor-pointer items-center justify-center rounded-14 border-[1.5px] border-ink bg-card px-5 py-3 text-center text-[17px] leading-[1.25] font-semibold text-balance text-ink'
const filled =
  'flex min-h-14 w-full cursor-pointer items-center justify-center rounded-14 border-0 bg-ink px-5 py-3 text-center text-[17px] leading-[1.25] font-semibold text-balance text-white disabled:opacity-60'

export const LINK_LABEL = 'My child has a code from their own Jemma'
const NO_CODE = 'Type the code your child gave you.'

/**
 * "My child has a code from their own Jemma" (P114): under "My child's school doesn't use Jemma", a third way to add a child. One button opens a short form
 * with one box for the code a child who signed up on their own made on their screen. "Link my child" asks the server, which links the parent to the child
 * at once and sends the parent to the child's page; a code that is wrong, has run out or was used already comes back in words and the box keeps what was typed.
 */
export function LinkChildCode() {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const submit = () => {
    if (!code.trim()) return setError(NO_CODE)
    setError(null)
    start(async () => {
      // On success the action sends the parent to the child's page, so only a refusal comes back.
      const res = await linkChildWithCode({ code })
      if (res && !res.ok) setError(res.message)
    })
  }

  return (
    <div id="child-code" className="flex scroll-mt-4 flex-col gap-3.5">
      <button type="button" aria-expanded={open} aria-controls={`${id}-form`} onClick={() => setOpen((o) => !o)} className={outline}>
        {LINK_LABEL}
      </button>
      {open ? (
        <form
          id={`${id}-form`}
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          className="flex flex-col gap-4 rounded-20 border border-line bg-card p-4"
        >
          <p className="m-0 text-[15px] leading-[1.45] text-body">Your child makes the code on their Me screen, under Link a parent. It works for 7 days and works once.</p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-code`} className={label}>
              Your child&apos;s code
            </label>
            <input
              id={`${id}-code`}
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              value={code}
              maxLength={12}
              onChange={(e) => {
                setCode(e.target.value)
                setError(null)
              }}
              className={field}
            />
          </div>
          {error ? (
            <p role="alert" className="m-0 text-[15px] leading-[1.4] font-semibold text-coral-text">
              {error}
            </p>
          ) : null}
          <button type="submit" disabled={pending} className={filled}>
            {pending ? 'Linking' : 'Link my child'}
          </button>
        </form>
      ) : null}
    </div>
  )
}
