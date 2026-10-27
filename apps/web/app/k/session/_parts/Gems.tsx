export type GemKind = 'full' | 'half' | 'empty'

/** The coral diamonds that count gaps: full = fixed, half = practising, outline = still to do. */
export function Gem({ kind, size = 22, stroke = '#8C89A3' }: { kind: GemKind; size?: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16">
      {kind === 'full' ? <polygon points="8,1 15,8 8,15 1,8" fill="#FF6A4D" /> : null}
      {kind === 'half' ? (
        <>
          <polygon points="1,8 15,8 8,15" fill="#FF6A4D" />
          <polygon points="8,1 15,8 8,15 1,8" fill="none" stroke="#1F1D36" strokeWidth="1.4" />
        </>
      ) : null}
      {kind === 'empty' ? (
        stroke === '#8C89A3' ? (
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
      <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" />
    </svg>
  )
}
