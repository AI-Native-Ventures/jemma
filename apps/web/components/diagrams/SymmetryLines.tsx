import type { ReactNode } from 'react'
import type { SymmetryLinesSpec } from '@jemma/profiling/schemas'
import { isSymmetryLine } from '@jemma/profiling/logic'
import { GOLD, INK, Svg, T, WHITE, type Variant } from './shared'

// P192: a shape with dashed lines across it, from the "Shapes and position" board ("Tap the line of symmetry."). The lines are named A, B, C and D, and all of them
// look the same, so their look gives nothing away: the learner picks the letter of the line that cuts the shape into mirror halves.

export type SymmetryLinesProps = SymmetryLinesSpec & { variant?: Variant }

const W = 300
const H = 214
const CX = 150
const CY = 108
const BLUE = '#001489'
const LETTERS = ['A', 'B', 'C', 'D']

const SHAPE_NAMES: Record<SymmetryLinesSpec['shape'], string> = {
  heart: 'A heart',
  star: 'A star',
  rectangle: 'A rectangle',
  square: 'A square',
  triangle: 'A triangle',
  circle: 'A circle',
  house: 'A house',
  arrow: 'An arrow',
  kite: 'A kite',
}

const LINE_WORDS: Record<SymmetryLinesSpec['lines'][number], string> = {
  vertical: 'goes straight down the middle',
  horizontal: 'goes straight across the middle',
  diagonal: 'slants down from the top left',
  other_diagonal: 'slants down from the top right',
}

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four']

export function describeSymmetryLines({ shape, lines, variant = 'card' }: SymmetryLinesProps): string {
  const each = lines.map((l, i) => `${LETTERS[i]} ${LINE_WORDS[l]}`)
  const said = `${SHAPE_NAMES[shape]} with ${NUMBER_WORDS[lines.length]} dashed lines across it: ${each.slice(0, -1).join(', ')} and ${each[each.length - 1]}.`
  // While a question is answered the words never say which line is a line of symmetry: it is the answer.
  if (variant === 'question') return said
  const mirror = lines.flatMap((l, i) => (isSymmetryLine(shape, l) ? [LETTERS[i]!] : []))
  return `${said} ${mirror.length === 0 ? 'None of them is a line of symmetry.' : mirror.length === 1 ? `Line ${mirror[0]} is a line of symmetry.` : `Lines ${mirror.slice(0, -1).join(', ')} and ${mirror[mirror.length - 1]} are lines of symmetry.`}`
}

function shapeOf(shape: SymmetryLinesSpec['shape']): ReactNode {
  const p = { fill: GOLD, stroke: INK, strokeWidth: 2.5, strokeLinejoin: 'round' as const }
  switch (shape) {
    case 'heart':
      return <path d={`M${CX},48 C190,8 250,38 230,88 C215,128 170,158 ${CX},188 C130,158 85,128 70,88 C50,38 110,8 ${CX},48 Z`} {...p} />
    case 'star': {
      const at = Array.from({ length: 10 }, (_, i) => {
        const a = (Math.PI / 5) * i - Math.PI / 2
        const r = i % 2 === 0 ? 92 : 38
        return `${(CX + r * Math.cos(a)).toFixed(1)},${(CY + 6 + r * Math.sin(a)).toFixed(1)}`
      })
      return <polygon points={at.join(' ')} {...p} />
    }
    case 'rectangle':
      return <rect x={60} y={63} width={180} height={90} {...p} />
    case 'square':
      return <rect x={75} y={33} width={150} height={150} {...p} />
    case 'triangle':
      return <polygon points={`${CX},22 62,186 238,186`} {...p} />
    case 'circle':
      return <circle cx={CX} cy={CY} r={82} {...p} />
    case 'house':
      return <polygon points={`${CX},24 228,96 210,96 210,190 90,190 90,96 72,96`} {...p} />
    case 'arrow':
      return <polygon points={`52,84 168,84 168,46 252,${CY} 168,170 168,132 52,132`} {...p} />
    case 'kite':
      return <polygon points={`${CX},18 216,82 ${CX},200 84,82`} {...p} />
  }
}

const ENDS: Record<SymmetryLinesSpec['lines'][number], { from: [number, number]; to: [number, number]; label: [number, number] }> = {
  vertical: { from: [CX, 22], to: [CX, H - 6], label: [CX, 11] },
  horizontal: { from: [34, CY], to: [W - 10, CY], label: [18, CY] },
  diagonal: { from: [56, 22], to: [250, 206], label: [42, 12] },
  other_diagonal: { from: [244, 22], to: [50, 206], label: [258, 12] },
}

export function SymmetryLines(props: SymmetryLinesProps) {
  const { shape, lines } = props
  return (
    <Svg width={W} height={H} label={describeSymmetryLines(props)}>
      {shapeOf(shape)}
      {lines.map((l, i) => {
        const e = ENDS[l]
        return (
          <g key={l} data-line={LETTERS[i]}>
            <line x1={e.from[0]} y1={e.from[1]} x2={e.to[0]} y2={e.to[1]} stroke={BLUE} strokeWidth={3} strokeDasharray="8 6" />
            <circle cx={e.label[0]} cy={e.label[1]} r={10} fill={WHITE} stroke={INK} strokeWidth={1.6} />
            <T x={e.label[0]} y={e.label[1] + 4.5} size={13} weight={700}>
              {LETTERS[i]!}
            </T>
          </g>
        )
      })}
    </Svg>
  )
}
