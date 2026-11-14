'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { PendingButton } from '@/components/ui/Button'
import { IconLabel } from '@/components/ui/IconLabel'
import { shrinkPhoto } from '@/lib/shrink-photo'
import { postFiles } from '@/lib/upload-client'
import type { SnapOwnTestResult } from '../actions'
import { MAX_PAGES } from '../format'

function CameraIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none">
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.2-2h6.2l1.2 2h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
      <circle cx="12" cy="13" r="3.4" />
    </svg>
  )
}

/** A small picture of the page just taken, so the learner can see it is the right one. Nothing is drawn where the browser cannot make one. */
function Thumb({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (typeof URL.createObjectURL !== 'function') return
    const made = URL.createObjectURL(file)
    setUrl(made)
    return () => URL.revokeObjectURL(made)
  }, [file])
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="" className="size-14 flex-none rounded-14 border border-line object-cover" /> : <span aria-hidden="true" className="size-14 flex-none rounded-14 bg-soft-4" />
}

const take =
  'relative flex min-h-[68px] w-full items-center justify-center gap-3 rounded-20 border-2 border-ink bg-card px-5 py-3 text-center text-[20px] font-bold text-balance text-ink focus-within:ring-4 focus-within:ring-ink sm:text-[22px]'
const send = 'flex min-h-[68px] w-full cursor-pointer items-center justify-center rounded-20 border-0 bg-coral px-5 py-3 text-center text-[20px] font-bold text-balance text-ink sm:text-[22px] disabled:opacity-60'
const takeOut = 'flex min-h-11 flex-none cursor-pointer items-center justify-center rounded-14 border-0 bg-transparent px-3 text-[15px] font-semibold text-coral-text'

/**
 * The camera screen of a marked test: a photo of each page (up to 4). On a phone `capture="environment"` opens the back camera for one page at a
 * time, on a laptop it is a file picker that takes several. The pages taken are kept in order and shown, a page can be taken out again, and one tap
 * sends them all through the learner's upload route (`snapOwnTest`, see lib/upload-route.ts): each photo is made smaller in the browser first.
 */
export function SnapTest() {
  const router = useRouter()
  const [pages, setPages] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const full = pages.length >= MAX_PAGES

  const add = (list: FileList | null) => {
    const picked = list ? Array.from(list) : []
    if (picked.length === 0) return
    const images = picked.filter((f) => f.type.startsWith('image/'))
    const room = MAX_PAGES - pages.length
    setPages([...pages, ...images.slice(0, Math.max(0, room))])
    if (images.length < picked.length) setError('Jemma can only read photos.')
    else if (images.length > room) setError(`Jemma can read up to ${MAX_PAGES} pages.`)
    else setError(null)
  }

  const submit = () =>
    start(async () => {
      setError(null)
      try {
        const form = new FormData()
        for (const page of pages) form.append('file', await shrinkPhoto(page))
        const done = await postFiles<SnapOwnTestResult>('k', 'snapOwnTest', [], form)
        if (!done.ok) return setError(done.message)
        router.push(`/k/own/test/${done.paperId}`)
      } catch {
        setError('That did not send. Check your connection and try again.')
      }
    })

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-[28px] leading-[1.18] font-bold tracking-[-0.02em] text-pretty">Take a photo of each page (up to {MAX_PAGES}).</h1>
        <p className="m-0 text-[17px] leading-[1.45] text-body">Take them in order, with the marks on them. Jemma reads the ticks and crosses.</p>
      </div>
      {pages.length > 0 ? (
        <ol aria-label="Your pages" className="m-0 flex list-none flex-col rounded-20 border border-line bg-card px-4 py-1 p-0">
          {pages.map((page, i) => (
            <li key={`${i}-${page.name}-${page.size}`} className="flex items-center gap-3 border-t border-soft py-3 first:border-t-0">
              <Thumb file={page} />
              <span className="min-w-0 flex-1 text-[17px] font-semibold">Page {i + 1}</span>
              <button type="button" disabled={pending} aria-label={`Take out page ${i + 1}`} onClick={() => setPages(pages.filter((_, k) => k !== i))} className={takeOut}>
                Take out
              </button>
            </li>
          ))}
        </ol>
      ) : null}
      <div className="flex flex-col gap-3">
        <label className={`${take} ${pending ? 'cursor-default opacity-60' : full ? 'cursor-pointer opacity-60' : 'cursor-pointer'}`}>
          <IconLabel icon={<CameraIcon />}>{pages.length === 0 ? 'Take a photo' : 'Take another page'}</IconLabel>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            disabled={pending}
            className="sr-only"
            onChange={(e) => {
              add(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
        {pages.length > 0 ? (
          <PendingButton type="button" pending={pending} onClick={submit} className={send}>
            {pending ? 'Sending your photos...' : `Send ${pages.length} ${pages.length === 1 ? 'page' : 'pages'} to Jemma`}
          </PendingButton>
        ) : null}
        {error ? <p role="alert" className="m-0 text-center text-[15px] leading-[1.4] text-coral-text">{error}</p> : null}
      </div>
    </>
  )
}
