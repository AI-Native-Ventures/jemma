'use client'

import { useEffect, useState } from 'react'
import { savedTourResult } from '../outcome'
import { DEFAULT_RETEACH, LEARNS_BY, learnsBest, learnsBestLine, savedReteach, type ReteachOutcome } from '../reteach'

const card = 'flex flex-col gap-3 rounded-[22px] border border-line bg-card p-5'

/** What the tab holds: what Jemma found when the learner was taught again, or the result of a lesson that was not taught again, or nothing. */
type Shown = { kind: 'outcome'; outcome: ReteachOutcome } | { kind: 'not-yet' }

/**
 * What happened when Jemma taught the tour learner again: each part taught again, the way that worked for it, and the way the learner learns best. It shows what
 * was found a moment ago in this browser tab; with nothing saved (the teacher's page opened first) it shows the default that goes with the default result
 * (DEFAULT_YOU: two parts, both learned by listening). A lesson done in this tab and not taught again says so. The server draws the default, the browser then reads the tab.
 */
export function ReteachCard({ name }: { name: string }) {
  const [shown, setShown] = useState<Shown>({ kind: 'outcome', outcome: DEFAULT_RETEACH })
  useEffect(() => {
    const saved = savedReteach(sessionStorage)
    if (saved) setShown({ kind: 'outcome', outcome: saved })
    else if (savedTourResult(sessionStorage) !== null) setShown({ kind: 'not-yet' })
  }, [])
  return (
    <section aria-labelledby="reteach" className={card}>
      <h2 id="reteach" className="m-0 text-[20px] leading-[1.2] font-bold">Taught again: {name}</h2>
      {shown.kind === 'not-yet' ? (
        <p data-reteach="none" className="m-0 text-[15px] leading-[1.45] text-body">{name} has not been taught the missed parts again yet.</p>
      ) : shown.outcome.parts.length === 0 ? (
        <p data-reteach="none" className="m-0 text-[15px] leading-[1.45] text-body">No part needed teaching again.</p>
      ) : (
        <>
          <p className="m-0 text-[15px] leading-[1.45] text-body">
            Jemma taught the parts {name} missed again. {name} picked how to learn each one, and a question checked it.
          </p>
          <ul aria-label="Parts taught again" className="m-0 flex list-none flex-col gap-2 p-0">
            {shown.outcome.parts.map((p) => (
              <li key={p.lesson} data-reteach-part={p.lesson} data-worked={p.worked ?? 'none'} className="flex flex-col gap-0.5 rounded-14 bg-soft-2 px-3.5 py-3">
                <span className="text-[16px] font-bold">{p.label}</span>
                <span className="text-[15px]">{p.worked ? `Worked: ${LEARNS_BY[p.worked]}` : 'Not yet'}</span>
                {p.tried.length > 1 || !p.worked ? <span className="text-[13px] text-body">Tried: {p.tried.map((d) => LEARNS_BY[d]).join(', ')}</span> : null}
              </li>
            ))}
          </ul>
          <p data-learns-best="true" className="m-0 rounded-14 border border-line px-3.5 py-3 text-[17px] font-bold">{learnsBestLine(learnsBest(shown.outcome.parts))}</p>
        </>
      )}
    </section>
  )
}
