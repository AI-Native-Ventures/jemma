'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { shrinkPhoto } from '@/lib/shrink-photo'
import { postFiles } from '@/lib/upload-client'
import type { ActionResult } from '../../actions'

/** Refreshes the server data every 3 s on the laptop layout, so pages snapped with the phone land without a reload. */
export function LaptopPoll() {
  const router = useRouter()
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 1024px)')
    const id = setInterval(() => {
      if (wide.matches) router.refresh()
    }, 3000)
    return () => clearInterval(id)
  }, [router])
  return null
}

/** Board `laptop-teacher-snap`, left card: drop PDFs or images, or choose them. Each file becomes a paper. */
export function UploadZone({ classId, testId }: { classId: string; testId: string }) {
  const router = useRouter()
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const send = (list: FileList | File[] | null) => {
    const files = list ? [...list] : []
    if (files.length === 0) return
    setError(null)
    start(async () => {
      const form = new FormData()
      for (const f of files) form.append('files', await shrinkPhoto(f))
      try {
        const res = await postFiles<ActionResult<{ count: number }>>('t', 'uploadScans', [classId, testId], form)
        if (!res.ok) setError(res.message)
      } catch {
        setError('That did not upload. Check your connection and try again.')
      }
      router.refresh()
    })
  }

  return (
    <>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          send(e.dataTransfer.files)
        }}
        className={`flex min-h-[220px] flex-col items-center justify-center gap-2.5 rounded-18 border-2 border-dashed border-muted-2 p-7 text-center ${over ? 'bg-coral-wash' : 'bg-ground'}`}
      >
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" /><path d="M4.5 14v4a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-4" /></svg>
        <span className="text-[16px] font-medium">{pending ? 'Saving your files' : 'Drop files here or'}</span>
        <label htmlFor="files" className="flex h-11 cursor-pointer items-center rounded-12 border-[1.5px] border-ink bg-card px-[18px] text-[15px] font-semibold focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink">
          Choose files
        </label>
        <input
          id="files"
          type="file"
          multiple
          accept=".pdf,image/*"
          disabled={pending}
          className="sr-only"
          onChange={(e) => {
            send(e.target.files)
            e.target.value = ''
          }}
        />
        <span className="text-[13px] text-body">PDF, JPG or PNG. One pile in one PDF is fine.</span>
      </div>
      {error ? <p role="alert" className="m-0 text-[14px] text-coral-text">{error}</p> : null}
    </>
  )
}
