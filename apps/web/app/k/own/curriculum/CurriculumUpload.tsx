'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { PendingButton } from '@/components/ui/Button'
import { IconLabel } from '@/components/ui/IconLabel'
import { notAllowedMessage, sizeProblem, sniffKind } from '@/app/t/[classId]/curriculum/upload-checks'
import { shrinkPhoto } from '@/lib/shrink-photo'
import { postFiles } from '@/lib/upload-client'
import type { UploadOwnCurriculumResult } from '../actions'
import { GRADE_CHOICES, NAME_MAX } from '../format'

const field = 'min-h-[52px] w-full rounded-14 border-[1.5px] border-edge bg-card px-4 py-2 text-[17px] text-ink'
const pick = 'flex min-h-[60px] w-full cursor-pointer items-center justify-center rounded-20 border-2 border-ink bg-card px-5 py-3 text-center text-[18px] font-bold text-balance text-ink disabled:opacity-60'

/**
 * The upload form of an own curriculum: the grade (the school grade is chosen first), a name for it, then a PDF or photos of the pages. The size and the
 * kind of each file are checked here before anything is sent (the teacher's own checks; the server checks again), a photo is made smaller, and the files go
 * through the learner's upload route (`uploadOwnCurriculum`, see lib/upload-route.ts). A name is needed before a picker opens, because choosing the files sends them.
 */
export function CurriculumUpload({ defaultGrade, alone = false }: { defaultGrade: number; alone?: boolean }) {
  const router = useRouter()
  const [grade, setGrade] = useState(defaultGrade)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const photos = useRef<HTMLInputElement>(null)
  const file = useRef<HTMLInputElement>(null)

  const open = (input: HTMLInputElement | null) => {
    if (!name.trim()) return setError('Give your curriculum a name first.')
    setError(null)
    input?.click()
  }

  const send = (list: FileList | null) => {
    const files = list ? Array.from(list) : []
    if (files.length === 0) return
    if (!name.trim()) return setError('Give your curriculum a name first.')
    setError(null)
    start(async () => {
      // Say no here when the size or the kind is wrong, before anything is sent. The server checks again, and counts the pages.
      const big = sizeProblem(files)
      if (big) return setError(big)
      for (const f of files) {
        if (!sniffKind(new Uint8Array(await f.slice(0, 16).arrayBuffer()))) return setError(notAllowedMessage(f.name))
      }
      try {
        const form = new FormData()
        for (const f of files) form.append('file', await shrinkPhoto(f))
        const done = await postFiles<UploadOwnCurriculumResult>('k', 'uploadOwnCurriculum', [String(grade), name.trim()], form)
        if (!done.ok) return setError(done.message)
        router.push(`/k/own/curriculum/${done.mapId}`)
      } catch {
        setError('That did not upload. Check your connection and try again.')
      }
    })
  }

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="own-grade" className="text-[15px] font-semibold">Grade</label>
        <select id="own-grade" value={grade} onChange={(e) => setGrade(Number(e.target.value))} className={field}>
          {GRADE_CHOICES.map((g) => (
            <option key={g} value={g}>{`Grade ${g}`}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="own-name" className="text-[15px] font-semibold">{alone ? 'Name it, like "Term 1 plan"' : 'Name it, like "My school\'s Term 1 plan"'}</label>
        <input id="own-name" type="text" value={name} maxLength={NAME_MAX} autoComplete="off" onChange={(e) => setName(e.target.value)} className={field} />
      </div>
      <input ref={photos} type="file" accept="image/jpeg,image/png" capture="environment" multiple hidden onChange={(e) => { send(e.target.files); e.target.value = '' }} />
      <input ref={file} type="file" accept="application/pdf,image/jpeg,image/png" multiple hidden onChange={(e) => { send(e.target.files); e.target.value = '' }} />
      <div className="flex flex-col gap-3">
        <PendingButton type="button" pending={pending} disabled={pending} onClick={() => open(file.current)} className={pick}>
          <IconLabel
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" />
                <path d="M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15" />
              </svg>
            }
          >
            Add a file
          </IconLabel>
        </PendingButton>
        <PendingButton type="button" pending={pending} disabled={pending} onClick={() => open(photos.current)} className={pick}>
          <IconLabel
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
                <circle cx="12" cy="12.5" r="3.5" />
              </svg>
            }
          >
            Take photos
          </IconLabel>
        </PendingButton>
        {error ? <p role="alert" className="m-0 text-center text-[15px] leading-[1.4] text-coral-text">{error}</p> : null}
      </div>
    </>
  )
}
