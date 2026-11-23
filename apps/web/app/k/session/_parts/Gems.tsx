export type GemKind = 'full' | 'half' | 'empty'

/** The gold diamonds that count gaps: full = fixed, half = practising, outline = still to do. */
export function Gem({ kind, size = 22, stroke = '#8F8D88' }: { kind: GemKind; size?: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16">
      {kind === 'full' ? <polygon points="8,1 15,8 8,15 1,8" fill="#FFB81C" /> : null}
      {kind === 'half' ? (
        <>
          <polygon points="1,8 15,8 8,15" fill="#FFB81C" />
          <polygon points="8,1 15,8 8,15 1,8" fill="none" stroke="#161616" strokeWidth="1.4" />
        </>
      ) : null}
      {kind === 'empty' ? (
        stroke === '#8F8D88' ? (
          <polygon points="8,1.8 14.2,8 8,14.2 1.8,8" fill="none" stroke={stroke} strokeWidth="1.4" />
        ) : (
          <polygon points="8,1.5 14.5,8 8,14.5 1.5,8" fill="none" stroke={stroke} strokeWidth="1.4" />
        )
      ) : null}
    </svg>
  )
}

export function Diamond({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className={className}>
      <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FFB81C" />
    </svg>
  )
}
