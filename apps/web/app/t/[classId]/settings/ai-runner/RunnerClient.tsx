'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Sheet } from '@/components/ui'
import { removeDesktop, setAiRunner } from '@/app/t/desktop-actions'

export function RunnerChoice({ runner, desktopLine }: { runner: 'cloud' | 'desktop'; desktopLine: string | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const pick = (next: 'cloud' | 'desktop') => start(async () => { await setAiRunner(next); router.refresh() })
  const dot = (on: boolean) =>
    on ? (
      <span aria-hidden="true" className="mt-px flex size-6 flex-none items-center justify-center rounded-pill border-2 border-ink">
        <span className="size-3 rounded-pill bg-ink" />
      </span>
    ) : (
      <span aria-hidden="true" className="mt-px size-6 flex-none rounded-pill border-2 border-muted-2" />
    )
  return (
    <section aria-label="Where Jemma's AI runs" className="flex flex-col rounded-20 border border-line bg-card px-4 py-0.5">
      <button type="button" aria-pressed={runner === 'cloud'} disabled={pending} onClick={() => pick('cloud')} className="flex w-full items-start gap-3 border-0 bg-transparent py-3.5 text-left text-ink">
        {dot(runner === 'cloud')}
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="text-[16px] leading-[1.3] font-semibold">Jemma cloud (free models)</span>
          <span className="text-[13px] leading-[1.35] text-body">Works any time, even when your computer is off.</span>
        </span>
      </button>
      <button type="button" aria-pressed={runner === 'desktop'} disabled={pending} onClick={() => pick('desktop')} className="flex w-full items-start gap-3 border-0 border-t border-soft bg-transparent py-3.5 text-left text-ink">
        {dot(runner === 'desktop')}
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="text-[16px] leading-[1.3] font-semibold">My Jemma Desktop (Claude Code or Codex)</span>
          <span className="text-[13px] leading-[1.35] text-body">Uses the plan you already pay for. Nothing extra.</span>
          {runner === 'desktop' && desktopLine ? (
            <span className="mt-1.5 flex items-start gap-1.5 text-[13px] leading-[1.35] font-semibold">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-px flex-none">
                <circle cx="12" cy="12" r="9" />
                <path d="m8 12.5 2.8 2.8L16.5 9.5" />
              </svg>
              <span>{desktopLine}</span>
            </span>
          ) : null}
        </span>
      </button>
    </section>
  )
}

export function RemoveDesktopButton({ runnerId, name }: { runnerId: string; name: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`Remove ${name}`}
      onClick={() => start(async () => { await removeDesktop(runnerId); router.refresh() })}
      className="min-h-11 flex-none rounded-12 border border-muted-2 bg-card px-3.5 text-[14px] font-semibold text-ink"
    >
      Remove
    </button>
  )
}

/** "Pair a desktop": asks the pair route for a code and shows it to type into Jemma Desktop. */
export function PairDesktopRow() {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const show = async () => {
    setOpen(true)
    setCode(null)
    setFailed(false)
    try {
      const res = await fetch('/api/desktop/pair', { method: 'POST' })
      if (!res.ok) throw new Error('no code')
      setCode(((await res.json()) as { code: string }).code)
    } catch {
      setFailed(true)
    }
  }
  return (
    <>
      <button type="button" onClick={show} className="flex min-h-14 w-full items-center gap-3 border-0 border-t border-soft bg-transparent py-1.5 text-left text-ink">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[16px] font-medium">Pair a desktop</span>
          <span className="text-[13px] leading-[1.35] text-body">Shows a code to type in Jemma Desktop</span>
        </span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none">
          <path d="m9 6 6 6-6 6" />
        </svg>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Your pairing code" description="Type this code in Jemma Desktop. It works once and stops working after 10 minutes.">
        <span data-testid="pair-code" className="flex h-[64px] items-center justify-center rounded-14 bg-soft-2 text-[28px] font-bold tracking-[0.3em]">
          {failed ? 'No code' : (code ?? '......')}
        </span>
        <button type="button" onClick={() => setOpen(false)} className="flex h-[52px] items-center justify-center rounded-14 bg-ink text-[17px] font-semibold text-white">
          Done
        </button>
      </Sheet>
    </>
  )
}
