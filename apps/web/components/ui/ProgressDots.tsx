export type ProgressDotsProps = {
  filled: number
  total: number
  /** Accessible text, for example "4 of 5 learners". */
  label?: string
  /** `dot` is the 9 px class dots, `gem` the 22 px coral diamonds on the child screen. */
  shape?: 'dot' | 'gem'
}

export function ProgressDots({ filled, total, label, shape = 'dot' }: ProgressDotsProps) {
  const cells = Array.from({ length: total }, (_, i) => i < filled)
  return (
    <span role="img" aria-label={label ?? `${filled} of ${total}`} className={`flex ${shape === 'dot' ? 'gap-[3px]' : 'items-center gap-1.5'}`}>
      {cells.map((on, i) =>
        shape === 'dot' ? (
          <span
            key={i}
            aria-hidden="true"
            className={`size-[9px] rounded-pill ${on ? 'bg-ink' : 'border-[1.5px] border-muted-2'}`}
          />
        ) : (
          <svg key={i} width="22" height="22" viewBox="0 0 16 16" aria-hidden="true">
            {on ? (
              <polygon points="8,1 15,8 8,15 1,8" fill="#FF6A4D" />
            ) : (
              <polygon points="8,1.8 14.2,8 8,14.2 1.8,8" fill="none" stroke="#8C89A3" strokeWidth="1.4" />
            )}
          </svg>
        ),
      )}
    </span>
  )
}
