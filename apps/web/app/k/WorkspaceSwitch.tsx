'use client'

import { OWN_NOTE, OWN_NOTE_ALONE } from '@/lib/own-grades'
import type { Workspace } from '@/lib/workspace'
import { useEffect, useRef, useState, useTransition } from 'react'
import { setWorkspace } from './own-actions'

// Two equal buttons with room around their words (the P90 rule): the cell sets the width, the words may take a second line.
const base = 'flex min-h-11 w-full cursor-pointer items-center justify-center rounded-14 px-5 py-3 text-center text-[17px] leading-[1.25] font-semibold text-balance'
const filled = `${base} border-[1.5px] border-green bg-green text-white`
const outline = `${base} border-[1.5px] border-ink bg-card text-ink`

const CHOICES: { workspace: Workspace; label: string }[] = [
  { workspace: 'school', label: 'My school' },
  { workspace: 'own', label: 'My own' },
]

/**
 * The switch at the top of the learner's home and of My maths: "My school" or "My own", the current one filled and marked with aria-pressed.
 * In My own, one short line under it says nothing here goes to the school.
 *
 * A tap shows the new state at once: the tapped button is the filled one and the line appears or goes before the server has said anything (the
 * server's draw of the page takes seconds on a phone). Then `setWorkspace` is called, and nothing else: it sets a cookie, and setting a cookie in a
 * server action makes Next draw the page again in the same answer, so the switch asks the router for no refresh of its own. While that draw is on
 * its way a thin gold line under the buttons says so (and a hidden line says it to a screen reader), and no button is blocked. The page that
 * arrives is the truth: its `current` is what is shown from then on. A refusal puts the old state back and says why in the action's own words.
 * A tap on the one that is shown does nothing.
 */
function Switch({ current }: { current: Workspace }) {
  const [shown, setShown] = useState<Workspace>(current)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const taps = useRef(0)

  // The page the server draws is the truth: when it arrives with another workspace, that is the one shown.
  useEffect(() => setShown(current), [current])

  const choose = (next: Workspace) => {
    if (next === shown) return
    const tap = ++taps.current
    setShown(next)
    setMessage(null)
    start(async () => {
      const res = await setWorkspace(next)
      // Only the last tap may undo what is on screen: an older refusal arriving late must not undo a newer tap.
      if (res.ok || tap !== taps.current) return
      setShown(current)
      setMessage(res.message)
    })
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative">
        <div role="group" aria-label="Where you practise" aria-busy={pending || undefined} className="grid grid-cols-2 gap-2.5">
          {CHOICES.map(({ workspace: ws, label }) => (
            <button key={ws} type="button" aria-pressed={shown === ws} onClick={() => choose(ws)} className={shown === ws ? filled : outline}>
              {label}
            </button>
          ))}
        </div>
        {pending ? (
          <>
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-5 -bottom-[7px] h-[3px] rounded-pill bg-gold motion-safe:animate-pulse" />
            <span role="status" className="sr-only">
              Opening {shown === 'own' ? 'My own' : 'My school'}
            </span>
          </>
        ) : null}
      </div>
      {shown === 'own' ? <p className="m-0 px-1 text-[15px] leading-[1.4] text-body">{OWN_NOTE}</p> : null}
      {message ? <p role="alert" className="m-0 px-1 text-[14px] text-red-text">{message}</p> : null}
    </div>
  )
}

/**
 * What the top of the learner's home and of My maths shows: the switch, or, for a child whose school does not use Jemma (`alone`, P99), only the line
 * "Your own practice." That child's record is its own workspace: there is no My school to go to, so nothing is offered to switch.
 */
export function WorkspaceSwitch({ current, alone = false }: { current: Workspace; alone?: boolean }) {
  if (alone) return <p className="m-0 px-1 text-[15px] leading-[1.4] text-body">{OWN_NOTE_ALONE}</p>
  return <Switch current={current} />
}
