'use client'

import { Spinner } from '@/components/ui/Button'
import { CameraIcon, RetryIcon, WarningIcon } from '@/components/ui/icons'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { retryKey } from '../../actions'
import { sendMemoPhoto } from './memo-photo'

/**
 * The read of the memo ended failed (a model that kept failing, an answer that did not fit, a run that died). The teacher takes the
 * photo again, or asks Jemma to read the same photo once more. After either, the key screen is "Reading the memo" again.
 * The card is the look of `ErrorRetry`, with two controls that show when they are working.
 */
export function MemoReadFailed({ classId, testId }: { classId: string; testId: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [which, setWhich] = useState<'photo' | 'same' | null>(null)
  const [pending, start] = useTransition()

  const finish = (message: string | null) => {
    setError(message)
    if (!message) router.refresh()
  }
  const retake = (file: File | undefined) => {
    if (!file) return
    setWhich('photo')
    start(async () => finish(await sendMemoPhoto(classId, testId, file)))
  }
  const again = () => {
    setWhich('same')
    start(async () => {
      const res = await retryKey(classId, testId)
      finish(res.ok ? null : res.message)
    })
  }

  return (
    <section role="alert" className="flex flex-col gap-3.5 leading-[normal] rounded-[22px] border border-line bg-card px-5 py-[22px]">
      <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-14 bg-[#FFEDE8] text-coral-text">
        <WarningIcon />
      </span>
      <h1 className="m-0 text-[27px] leading-[1.15] font-semibold tracking-[-0.015em] text-pretty">Jemma could not read the memo.</h1>
      <p className="m-0 text-[16px] leading-[1.5] text-body text-pretty">Take the photo again, closer and in good light. Or try the same photo once more.</p>
      {error ? <p className="m-0 text-[14px] text-coral-text">{error}</p> : null}
      <div className="mt-1 flex flex-col gap-2">
        <label
          aria-busy={(pending && which === 'photo') || undefined}
          className={`relative flex h-[52px] items-center justify-center gap-2 rounded-14 bg-ink text-[17px] font-semibold text-white focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink ${pending ? 'cursor-default opacity-60' : 'cursor-pointer'}`}
        >
          <CameraIcon size={20} />
          Take the photo again
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            disabled={pending}
            onChange={(e) => {
              retake(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          {pending && which === 'photo' ? <Spinner /> : null}
        </label>
        <button
          type="button"
          onClick={again}
          disabled={pending}
          aria-busy={(pending && which === 'same') || undefined}
          className="relative flex h-[52px] cursor-pointer items-center justify-center gap-2 rounded-14 border-[1.5px] border-ink bg-card text-[17px] font-semibold text-ink disabled:cursor-default disabled:opacity-60"
        >
          <RetryIcon />
          Try the same photo again
          {pending && which === 'same' ? <Spinner /> : null}
        </button>
      </div>
    </section>
  )
}
