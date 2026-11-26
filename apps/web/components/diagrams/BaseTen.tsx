import type { ReactNode } from 'react'
import type { BaseTenSpec } from '@jemma/profiling/schemas'
import { GOLD, GOLD_TINT, INK, Svg, type Variant } from './shared'

// P188: place value blocks to read, from the "Counting and place value" board ("What number do the blocks show?"): flats of a hundred, rods of ten and single ones,
// from the left. Nothing is written under them: the learner reads the number from the blocks.

export type BaseTenProps = BaseTenSpec & { variant?: Variant }

const U = 10
const FLAT = U * 10
const ROD_GAP = 6

export function describeBaseTen({ hundreds = 0, tens, ones, variant = 'card' }: BaseTenProps): string {
  const kinds = [hundreds > 0 ? 'flats of a hundred' : '', tens > 0 ? 'rods of ten' : '', ones > 0 ? 'single ones' : ''].filter(Boolean)
  const list = kinds.length > 1 ? `${kinds.slice(0, -1).join(', ')} and ${kinds[kinds.length - 1]}` : (kinds[0] ?? '')
  // While a question is answered the words name the blocks, never how many: the number they make is the answer.
  if (variant === 'question') return `Place value blocks: ${list}.`
  const parts = [hundreds > 0 ? `${hundreds} ${hundreds === 1 ? 'flat' : 'flats'} of a hundred` : '', tens > 0 ? `${tens} ${tens === 1 ? 'rod' : 'rods'} of ten` : '', ones > 0 ? `${ones} single ${ones === 1 ? 'one' : 'ones'}` : ''].filter(Boolean)
  return `Place value blocks: ${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]}.`
}

/** A square of `n` by `m` units at (x, y), each unit drawn. */
function Units({ x, y, across, down, fill }: { x: number; y: number; across: number; down: number; fill: string }) {
  return (
    <g>
      <rect x={x} y={y} width={across * U} height={down * U} fill={fill} stroke={INK} strokeWidth={1.4} />
      {Array.from({ length: across - 1 }, (_, i) => (
        <line key={`v${i}`} x1={x + (i + 1) * U} y1={y} x2={x + (i + 1) * U} y2={y + down * U} stroke={INK} strokeWidth={0.6} />
      ))}
      {Array.from({ length: down - 1 }, (_, j) => (
        <line key={`h${j}`} x1={x} y1={y + (j + 1) * U} x2={x + across * U} y2={y + (j + 1) * U} stroke={INK} strokeWidth={0.6} />
      ))}
    </g>
  )
}

export function BaseTen(props: BaseTenProps) {
  const { hundreds = 0, tens, ones } = props
  // Flats in a row (two rows when there are more than 2), rods side by side, ones in columns of 5.
  const flatsAcross = Math.min(hundreds, 2)
  const flatsDown = Math.ceil(hundreds / 2)
  const flatsW = flatsAcross ? flatsAcross * FLAT + (flatsAcross - 1) * ROD_GAP : 0
  const rodsW = tens ? tens * U + (tens - 1) * ROD_GAP : 0
  const onesCols = Math.ceil(ones / 5)
  const onesW = ones ? onesCols * (U * 1.6) + (onesCols - 1) * 4 : 0
  const groupGap = 22
  const widths = [flatsW, rodsW, onesW].filter((w) => w > 0)
  const W = Math.max(260, widths.reduce((a, w) => a + w, 0) + (widths.length - 1) * groupGap + 24)
  const tall = Math.max(flatsDown ? flatsDown * FLAT + (flatsDown - 1) * ROD_GAP : 0, tens ? FLAT : 0, 5 * U * 1.6 + 16)
  const H = tall + 20
  let x = (W - (widths.reduce((a, w) => a + w, 0) + (widths.length - 1) * groupGap)) / 2
  const out: ReactNode[] = []
  for (let i = 0; i < hundreds; i++) out.push(<Units key={`f${i}`} x={x + (i % 2) * (FLAT + ROD_GAP)} y={10 + Math.floor(i / 2) * (FLAT + ROD_GAP)} across={10} down={10} fill={GOLD_TINT} />)
  if (flatsW) x += flatsW + groupGap
  for (let i = 0; i < tens; i++) out.push(<Units key={`t${i}`} x={x + i * (U + ROD_GAP)} y={10} across={1} down={10} fill={GOLD_TINT} />)
  if (rodsW) x += rodsW + groupGap
  const one = U * 1.6
  for (let i = 0; i < ones; i++)
    out.push(<rect key={`o${i}`} x={x + Math.floor(i / 5) * (one + 4)} y={10 + tall - 5 * (one + 3) + (i % 5) * (one + 3)} width={one} height={one} rx={2} fill={GOLD} stroke={INK} strokeWidth={1.4} />)
  return (
    <Svg width={W} height={H} label={describeBaseTen(props)}>
      {out}
    </Svg>
  )
}
