'use client'

import { PendingButton } from '@/components/ui/Button'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { ErrorRetry } from '@/components/blocks'
import { Button, Sheet } from '@/components/ui'
import { retryDraft, uploadCurriculum, useSampleCurriculum } from './actions'
import { notAllowedMessage, sizeProblem, sniffKind } from './upload-checks'

const outlined = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 12,
  border: '1.5px solid #1F1D36', background: '#FFFFFF', color: '#1F1D36', fontSize: 15, fontWeight: 600,
} as const

/** Reloads the page's data every few seconds while the agent drafts the map. */
export function AutoRefresh({ everyMs = 4000 }: { everyMs?: number }) {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => router.refresh(), everyMs)
    return () => clearInterval(id)
  }, [router, everyMs])
  return null
}

/** "Take photos" and "Add a file", as drawn on teacher-curriculum-upload. */
export function UploadButtons({ classId }: { classId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const photos = useRef<HTMLInputElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const send = (list: FileList | null) => {
    const files = list ? Array.from(list) : []
    if (files.length === 0) return
    setError(null)
    start(async () => {
      // Say no here when the size or the kind is wrong, before anything is sent. The server checks again, and counts the pages.
      const big = sizeProblem(files)
      if (big) return setError(big)
      for (const f of files) {
        if (!sniffKind(new Uint8Array(await f.slice(0, 16).arrayBuffer()))) return setError(notAllowedMessage(f.name))
      }
      try {
        const done = await uploadCurriculum(classId, files)
        if (!done.ok) return setError(done.message)
        router.refresh()
      } catch {
        setError('That did not upload. Check your connection and try again.')
      }
    })
  }
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        <input ref={photos} type="file" accept="image/jpeg,image/png" capture="environment" multiple hidden onChange={(e) => { send(e.target.files); e.target.value = '' }} />
        <input ref={file} type="file" accept="application/pdf,image/jpeg,image/png" multiple hidden onChange={(e) => { send(e.target.files); e.target.value = '' }} />
        <PendingButton pending={pending} type="button" disabled={pending} onClick={() => photos.current?.click()} style={outlined}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.5"/></svg>
          Take photos
        </PendingButton>
        <PendingButton pending={pending} type="button" disabled={pending} onClick={() => file.current?.click()} style={outlined}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15"/></svg>
          Add a file
        </PendingButton>
      </div>
      {error ? <p role="alert" style={{ margin: 0, fontSize: 14, color: '#B8381F' }}>{error}</p> : null}
    </>
  )
}

/** Demo schools only: the two documents from the board, no file needed. */
export function SampleButton({ classId }: { classId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <Button
      variant="primary"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await useSampleCurriculum(classId)
          router.refresh()
        })
      }
    >
      Use the sample curriculum
    </Button>
  )
}

/** "Or start from a map another teacher approved": drawn on the board, after the challenge. */
export function ComingLink({ children }: { children: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, color: '#1F1D36', fontSize: 15, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3, background: 'none', border: 'none' }}
      >
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

/** The draft job failed: say what is saved and offer one retry. */
export function DraftFailed({ mapId }: { mapId: string }) {
  const router = useRouter()
  return (
    <ErrorRetry
      title="Jemma could not read your documents."
      body="Your documents are saved. Try again and Jemma will draft the map from them."
      onRetry={() => retryDraft(mapId).then(() => router.refresh())}
    />
  )
}
