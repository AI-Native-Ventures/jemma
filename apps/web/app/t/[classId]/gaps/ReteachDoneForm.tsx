'use client'

import { useActionState, type ReactNode } from 'react'
import { markReteachDone, type ReteachResult } from './actions'

/**
 * The "Mark reteach done" form of the class screen and of the gap screen. The approval is saved before the reteach is marked: when it cannot be
 * saved nothing changed, and the one plain line shows above the button. `errorClassName` places the line in each screen's own row or grid.
 */
export function ReteachDoneForm({ reteachId, errorClassName, children }: { reteachId: string; errorClassName: string; children: ReactNode }) {
  const [result, action] = useActionState<ReteachResult | null>(() => markReteachDone(reteachId), null)
  return (
    <>
      {result && !result.ok ? (
        <p role="alert" className={errorClassName}>
          {result.message}
        </p>
      ) : null}
      <form action={action} className="contents">
        {children}
      </form>
    </>
  )
}
