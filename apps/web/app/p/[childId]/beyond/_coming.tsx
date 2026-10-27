'use client'

import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Button, Sheet } from '@/components/ui'

/** A control the boards draw for an after-the-challenge feature: it opens "Coming after the challenge". */
export function ComingButton({ style, children }: { style: CSSProperties; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={style}>
        {children}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Coming after the challenge" description="This part of Jemma is not in this version yet.">
        <Button variant="primary" onClick={() => setOpen(false)}>
          Got it
        </Button>
      </Sheet>
    </>
  )
}
