import Link from 'next/link'

const STEPS = ['Learn', 'Try', 'Results', 'Teach again'] as const

/**
 * The bar of a session screen, drawn as the learner's own session bar is (a close button and the four steps of the tour: Learn, Try, Results and Teach again), with one difference: the close button goes
 * back to the part in the tour and never into the signed-in app. `current` is 0 to 3.
 */
export function TourStepHeader({ current, closeLabel = 'Stop for now', href = '/tour/algebra' }: { current: number; closeLabel?: string; href?: string }) {
  return (
    <header className="flex items-center gap-2 pt-2.5 pr-[18px] pb-1.5 pl-2 leading-[normal]">
      <Link href={href} aria-label={closeLabel} className="flex size-11 flex-none items-center justify-center rounded-12 text-ink">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </Link>
      <ol aria-label="Session steps" className="m-0 grid flex-1 list-none grid-cols-4 gap-1.5 p-0">
        {STEPS.map((label, i) => {
          const state = i < current ? 'past' : i === current ? 'now' : 'next'
          return (
            <li
              key={label}
              aria-current={state === 'now' ? 'step' : undefined}
              className={`flex flex-col gap-[5px] text-[12px] ${state === 'now' ? 'font-bold text-ink' : state === 'past' ? 'font-medium text-body' : 'font-medium text-muted'}`}
            >
              <span aria-hidden="true" className={`h-1.5 rounded-pill ${state === 'now' ? 'bg-coral' : state === 'past' ? 'bg-ink' : 'bg-[#E3E1EE]'}`} />
              {label}
            </li>
          )
        })}
      </ol>
    </header>
  )
}
