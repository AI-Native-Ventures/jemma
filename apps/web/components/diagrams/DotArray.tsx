import type { DotArraySpec } from '@jemma/profiling/schemas'
import { GOLD, INK, Svg, type Variant } from './shared'

// P188: dots in rows and columns, from the "Counting and place value" board ("Write a multiplication for the dots.").

export type DotArrayProps = DotArraySpec & { variant?: Variant }

const W = 280

export function describeDotArray({ rows, cols, variant = 'card' }: DotArrayProps): string {
  // While a question is answered the words never count the dots: the rows, the dots in a row and all of them are the answer.
  return variant === 'question' ? 'Dots in rows and columns.' : `${rows * cols} dots in ${rows} ${rows === 1 ? 'row' : 'rows'} of ${cols}.`
}

export function DotArray(props: DotArrayProps) {
  const { rows, cols } = props
  const pitch = Math.min(44, (W - 20) / cols)
  const r = Math.min(12, pitch * 0.3)
  const width = Math.max(cols * pitch + 20, 120)
  return (
    <Svg width={width} height={rows * pitch + 20} label={describeDotArray(props)}>
      {Array.from({ length: rows * cols }, (_, k) => (
        <circle key={k} data-dot="" cx={10 + (k % cols) * pitch + pitch / 2} cy={10 + Math.floor(k / cols) * pitch + pitch / 2} r={r} fill={GOLD} stroke={INK} strokeWidth={1.6} />
      ))}
    </Svg>
  )
}
