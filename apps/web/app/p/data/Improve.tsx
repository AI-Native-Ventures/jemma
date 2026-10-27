'use client'

import { ToggleRow } from '../account/_ui'
import { setImproveConsent } from './actions'

export function ImproveToggle({ childId, childName, initial }: { childId: string; childName: string; initial: boolean }) {
  return (
    <ToggleRow
      title={`Use ${childName}'s work, name removed, to improve Jemma`}
      detail="Off unless you turn it on"
      initial={initial}
      divider
      onToggle={(on) => setImproveConsent(childId, on)}
    />
  )
}
