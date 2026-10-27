'use client'

import { useState } from 'react'
import { ErrorRetry } from '@/components/blocks'
import { Button, Sheet } from '@/components/ui'

export function KitErrorRetry() {
  const [tries, setTries] = useState(0)
  return (
    <ErrorRetry
      title="I couldn't finish reading paper 4"
      body={`The connection dropped halfway. The photo is saved and the other 4 papers are marked.${tries ? ` Tried ${tries} time${tries > 1 ? 's' : ''}.` : ''}`}
      onRetry={() => setTries((n) => n + 1)}
      secondary={{ label: 'Retake the photo', href: '#' }}
    />
  )
}

export function KitSheet() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open sheet
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Coming after the challenge"
        description="This part is not in the first version."
      >
        <Button onClick={() => setOpen(false)}>Got it</Button>
      </Sheet>
    </>
  )
}
