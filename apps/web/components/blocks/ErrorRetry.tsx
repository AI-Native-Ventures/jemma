'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { RetryIcon, WarningIcon } from '../ui/icons'

export type ErrorRetryProps = {
  title: string
  body: string
  onRetry: () => void
  retryLabel?: string
  /** Optional second way out, for example "Retake the photo". */
  secondary?: { label: string; href: string }
  children?: ReactNode
}

/** Plain-words failure card: what happened, what is saved, one clear retry. */
export function ErrorRetry({ title, body, onRetry, retryLabel = 'Try again', secondary, children }: ErrorRetryProps) {
  return (
    <section role="alert" className="flex flex-col gap-3.5 leading-[normal] rounded-[22px] border border-line bg-card px-5 py-[22px]">
      <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-14 bg-[#FFEDE8] text-coral-text">
        <WarningIcon />
      </span>
      <h1 className="m-0 text-[27px] leading-[1.15] font-semibold tracking-[-0.015em] text-pretty">{title}</h1>
      <p className="m-0 text-[16px] leading-[1.5] text-body text-pretty">{body}</p>
      {children}
      <div className="mt-1 flex flex-col gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="flex h-[52px] cursor-pointer items-center justify-center gap-2 rounded-14 border-0 bg-ink text-[17px] font-semibold text-white"
        >
          <RetryIcon />
          {retryLabel}
        </button>
        {secondary ? (
          <Link
            href={secondary.href}
            className="flex h-[52px] items-center justify-center rounded-14 border-[1.5px] border-ink bg-card text-[17px] font-semibold text-ink no-underline"
          >
            {secondary.label}
          </Link>
        ) : null}
      </div>
    </section>
  )
}
