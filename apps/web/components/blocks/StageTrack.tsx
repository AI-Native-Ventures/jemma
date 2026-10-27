export type Stage = 'new' | 'practising' | 'fixed'

export type StageTrackProps = {
  stage: Stage
  /** `cards` is the three-card row on the child screen, `arrows` the connected row on the parent session. */
  variant?: 'cards' | 'arrows'
}

const STAGES: { id: Stage; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'practising', label: 'Practising' },
  { id: 'fixed', label: 'Fixed' },
]

/** The stage glyph: hollow diamond, half-filled diamond, full diamond. */
function Glyph({ id, size, current }: { id: Stage; size: number; current: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      {id === 'practising' ? (
        <>
          <polygon points="1,8 15,8 8,15" fill="#FF6A4D" />
          <polygon points="8,1 15,8 8,15 1,8" fill="none" stroke="#1F1D36" strokeWidth="1.3" />
        </>
      ) : id === 'fixed' && current ? (
        <polygon points="8,1 15,8 8,15 1,8" fill="#FF6A4D" />
      ) : (
        <polygon
          points="8,1.8 14.2,8 8,14.2 1.8,8"
          fill="none"
          stroke={id === 'new' ? '#8C89A3' : '#CFCDDC'}
          strokeWidth="1.4"
        />
      )}
    </svg>
  )
}

export function StageTrack({ stage, variant = 'cards' }: StageTrackProps) {
  const at = STAGES.findIndex((s) => s.id === stage)
  if (variant === 'arrows') {
    return (
      <ol aria-label="Stages" className="m-0 flex list-none items-center leading-[normal] justify-between gap-1.5 p-0">
        {STAGES.map((s, i) => {
          const current = i === at
          return (
            <li key={s.id} className="contents">
              {i > 0 ? (
                <svg width="40" height="16" viewBox="0 0 40 16" aria-hidden="true" className="flex-none">
                  {i <= at ? (
                    <path d="M2 8h34M30 3l6 5-6 5" fill="none" stroke="#1F1D36" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  ) : (
                    <path d="M2 8h34" fill="none" stroke="#CFCDDC" strokeWidth="2" strokeDasharray="3 4" strokeLinecap="round" />
                  )}
                </svg>
              ) : null}
              <span
                aria-current={current ? 'step' : undefined}
                className="flex flex-1 flex-col items-center gap-1.5"
              >
                <Glyph id={s.id} size={current ? 38 : 30} current={current} />
                <span className={current ? 'text-[15px] font-bold' : 'text-[14px] text-body'}>{s.label}</span>
              </span>
            </li>
          )
        })}
      </ol>
    )
  }
  return (
    <ol aria-label="Stages" className="m-0 grid w-full leading-[normal] list-none grid-cols-3 gap-1.5 p-0">
      {STAGES.map((s, i) => {
        const current = i === at
        return (
          <li
            key={s.id}
            aria-current={current ? 'step' : undefined}
            className={`flex flex-col items-center gap-1.5 rounded-[16px] bg-card px-1.5 py-3 ${
              current ? 'border-2 border-ink' : 'border border-line'
            }`}
          >
            <Glyph id={s.id} size={24} current={current} />
            <span className={current ? 'text-[14px] font-bold' : 'text-[14px] text-body'}>{s.label}</span>
          </li>
        )
      })}
    </ol>
  )
}
