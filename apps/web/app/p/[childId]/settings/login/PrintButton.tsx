'use client'

import type { ReactNode } from 'react'
import { outlineButton } from '../../../account/_ui'

export function PrintButton({ children }: { children: ReactNode }) {
  return (
    <button type="button" onClick={() => window.print()} style={outlineButton}>
      {children}
    </button>
  )
}
