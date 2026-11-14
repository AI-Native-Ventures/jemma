'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { PendingButton } from '@/components/ui/Button'
import type { Workspace } from '@/lib/workspace'
import { setWorkspace } from './own-actions'

const choices: { workspace: Workspace; label: string }[] = [
  { workspace: 'school', label: 'My school' },
  { workspace: 'own', label: 'My own' },
]

const base = 'flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-pill border px-4 py-2 text-center text-[16px] leading-[1.2] font-semibold text-balance disabled:opacity-60'
const on = 'border-ink bg-ink text-white'
const off = 'border-line bg-card text-ink'

/**
 * The switch at the top of the learner's home: "My school" (the child of the school) and "My own" (the learner's private workspace). The one that
 * is on is marked pressed. A tap on the other one asks the server (`setWorkspace`, which opens "My own" the first time), then the screen looks
 * again, so the home, "My maths" and practice all show that workspace. A tap on the one that is on does nothing.
 */
export function WorkspaceSwitch({ current }: { current: Workspace }) {
  const router = useRouter()
  const [message, setMessage] = useState<string | null>(null)
  const [asked, setAsked] = useState<Workspace | null>(null)
  const [pending, start] = useTransition()

  const choose = (workspace: Workspace) => {
    if (workspace === current || pending) return
    setAsked(workspace)
    start(async () => {
      const res = await setWorkspace(workspace)
      setMessage(res.ok ? null : res.message)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label="Where you practise" className="flex gap-2">
        {choices.map(({ workspace, label }) => (
          <PendingButton
            key={workspace}
            type="button"
            aria-pressed={current === workspace}
            pending={pending && asked === workspace}
            disabled={pending}
            onClick={() => choose(workspace)}
            className={`${base} ${current === workspace ? on : off}`}
          >
            {label}
          </PendingButton>
        ))}
      </div>
      {message ? <p role="alert" className="m-0 text-center text-[14px] text-coral-text">{message}</p> : null}
    </div>
  )
}
