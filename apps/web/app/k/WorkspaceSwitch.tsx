'use client'

import { PendingButton } from '@/components/ui/Button'
import { OWN_NOTE } from '@/lib/own-grades'
import type { Workspace } from '@/lib/workspace'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { setWorkspace } from './own-actions'

// Two equal buttons with room around their words (the P90 rule): the cell sets the width, the words may take a second line.
const base = 'flex min-h-11 w-full cursor-pointer items-center justify-center rounded-14 px-5 py-3 text-center text-[17px] leading-[1.25] font-semibold text-balance disabled:opacity-60'
const filled = `${base} border-[1.5px] border-ink bg-ink text-white`
const outline = `${base} border-[1.5px] border-ink bg-card text-ink`

const CHOICES: { workspace: Workspace; label: string }[] = [
  { workspace: 'school', label: 'My school' },
  { workspace: 'own', label: 'My own' },
]

/**
 * The switch at the top of the learner's home and of My maths: "My school" or "My own", the current one filled and marked with aria-pressed.
 * In My own, one short line under it says nothing here goes to the school. A tap on the other one calls `setWorkspace` (it writes the cookie that
 * every learner screen reads) and the same screen is drawn again for the new workspace: home stays home, My maths stays My maths. A tap on the one
 * that is on screen does nothing. A refusal is said in the action's own plain words.
 */
export function WorkspaceSwitch({ current }: { current: Workspace }) {
  const router = useRouter()
  const [message, setMessage] = useState<string | null>(null)
  const [wanted, setWanted] = useState<Workspace | null>(null)
  const [pending, start] = useTransition()

  const choose = (next: Workspace) => {
    if (next === current || pending) return
    setWanted(next)
    start(async () => {
      const res = await setWorkspace(next)
      setMessage(res.ok ? null : res.message)
      if (res.ok) router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div role="group" aria-label="Where you practise" className="grid grid-cols-2 gap-2.5">
        {CHOICES.map(({ workspace: ws, label }) => (
          <PendingButton key={ws} type="button" aria-label={label} aria-pressed={current === ws} pending={pending && wanted === ws} disabled={pending} onClick={() => choose(ws)} className={current === ws ? filled : outline}>
            {label}
          </PendingButton>
        ))}
      </div>
      {current === 'own' ? <p className="m-0 px-1 text-[15px] leading-[1.4] text-body">{OWN_NOTE}</p> : null}
      {message ? <p role="alert" className="m-0 px-1 text-[14px] text-coral-text">{message}</p> : null}
    </div>
  )
}
