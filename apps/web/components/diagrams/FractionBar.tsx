import type { DiagramSpec } from '@jemma/profiling/schemas'
import { useId } from 'react'
import { CORAL, INK, Svg, T, type Variant, WHITE } from './shared'

export type FractionBarProps = Extract<DiagramSpec, { kind: 'fraction_bar' }> & {
  /** card: the diagram-kit drawing. learn: the stacked-fraction bars of the child's learn screen. */
  variant?: Variant | 'learn'
}

const X = 62
const W = 200

const rowLabel = (parts: number, shaded: number, label?: string) =>
  label ?? (parts <= 1 ? '1' : `${shaded > 0 ? shaded : 1}/${parts}`)

export function describeFractionBar({ rows }: FractionBarProps) {
  const bits = rows.map((r) => `a bar split into ${r.parts} ${r.parts === 1 ? 'part' : 'equal parts'} with ${r.shaded} of ${r.parts} shaded`)
  return `Fraction bars: ${bits.join(', and ') || 'no bars'}.`
}

/** Child learn screen: stacked fraction at the left, 34 high rounded bar with 2px dividers, fills the card width. */
function LearnBars(props: FractionBarProps) {
  const { rows } = props
  const id = useId()
  const firstShaded = rows.findIndex((r) => r.shaded > 0)
  const PITCH = 48
  const BAR_X = 44
  const BAR_W = 272
  return (
    <Svg width={316} height={Math.max(1, rows.length) * PITCH - 8} label={describeFractionBar(props)} maxWidth={316}>
      <defs>
        <clipPath id={`${id}-clip`}>
          <rect x={BAR_X} y={0} width={BAR_W} height={34} rx={7} />
        </clipPath>
      </defs>
      {rows.map((r, i) => {
        const top = i * PITCH
        const y = top + 3
        const parts = Math.max(1, Math.round(r.parts))
        const inner = BAR_W - 4
        const cw = inner / parts
        const shade = i === firstShaded ? CORAL : INK
        const den = String(parts)
        const lw = den.length * 10 + 6
        const num = String(r.shaded > 0 ? r.shaded : 1)
        return (
          <g key={i}>
            <T x={17} y={top + 14.5} size={17} weight={700}>
              {parts <= 1 ? '1' : num}
            </T>
            {parts > 1 && (
              <>
                <line x1={17 - lw / 2} y1={top + 20} x2={17 + lw / 2} y2={top + 20} stroke={INK} strokeWidth={2} />
                <T x={17} y={top + 37.8} size={17} weight={700}>
                  {den}
                </T>
              </>
            )}
            <g transform={`translate(0 ${y})`}>
              <g clipPath={`url(#${id}-clip)`}>
                <rect x={BAR_X} y={0} width={BAR_W} height={34} fill={WHITE} />
                {Array.from({ length: parts }, (_, k) => (
                  <g key={k}>
                    <rect x={BAR_X + 2 + k * cw} y={2} width={cw} height={30} fill={k < r.shaded ? shade : WHITE} />
                    {k < parts - 1 && <rect x={BAR_X + 2 + (k + 1) * cw - 2} y={2} width={2} height={30} fill={INK} />}
                  </g>
                ))}
              </g>
              <rect x={BAR_X + 1} y={1} width={BAR_W - 2} height={32} rx={6} fill="none" stroke={INK} strokeWidth={2} />
            </g>
          </g>
        )
      })}
    </Svg>
  )
}

export function FractionBar(props: FractionBarProps) {
  if (props.variant === 'learn') return <LearnBars {...props} />
  const { rows } = props
  const firstShaded = rows.findIndex((r) => r.shaded > 0)
  const height = Math.max(190, 26 + rows.length * 50 + 14)
  return (
    <Svg width={285} height={height} label={describeFractionBar(props)}>
      {rows.map((r, i) => {
        const y = 26 + i * 50
        const parts = Math.max(1, Math.round(r.parts))
        const w = W / parts
        // The first row with shading is the coral one; later shaded rows are ink so the two read apart.
        const shade = i === firstShaded ? CORAL : INK
        return (
          <g key={i}>
            {Array.from({ length: parts }, (_, k) => (
              <rect
                key={k}
                x={X + k * w}
                y={y}
                width={w}
                height={28}
                rx={0}
                fill={k < r.shaded ? shade : WHITE}
                stroke={INK}
                strokeWidth={1.5}
              />
            ))}
            <T x={50} y={y + 19} size={14} weight={600} anchor="end">
              {rowLabel(parts, r.shaded, r.label)}
            </T>
          </g>
        )
      })}
    </Svg>
  )
}
