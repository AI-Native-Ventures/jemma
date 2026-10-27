import type { DiagramSpec } from '@jemma/profiling/schemas'
import { CORAL_TINT, INK, SOFT, Svg, T, WHITE } from './shared'

export type PlaceValueProps = Extract<DiagramSpec, { kind: 'place_value' }>

const WHOLE = 38
const DEC = 44
const COMMA = 14
const HEAD_Y = 38
const HEAD_H = 30
const BODY_H = 42
const WHOLE_COLS = new Set(['Th', 'H', 'T', 'U', 'TTh', 'HTh', 'M'])

type Col = { head: string; digit: string; w: number; sep: boolean; decimal: boolean }

function layout({ columns, digits }: PlaceValueProps): Col[] {
  const cols: Col[] = []
  let decimal = false
  columns.forEach((head, i) => {
    const digit = digits[i] ?? ''
    if (head === ',') {
      decimal = true
      cols.push({ head: '', digit: ',', w: COMMA, sep: true, decimal: false })
      return
    }
    if (!decimal && i > 0 && !WHOLE_COLS.has(head) && WHOLE_COLS.has(columns[i - 1] ?? '')) {
      decimal = true
      cols.push({ head: '', digit: ',', w: COMMA, sep: true, decimal: false })
    }
    cols.push({ head, digit, w: decimal ? DEC : WHOLE, sep: false, decimal })
  })
  return cols
}

export function describePlaceValue(p: PlaceValueProps) {
  const filled = p.columns.map((c, i) => ({ c, d: p.digits[i] ?? '' })).filter((x) => x.c !== ',' && x.d !== '')
  return `Place value chart with columns ${p.columns.filter((c) => c !== ',').join(', ')}. ${filled.map((x) => `${x.c} ${x.d}`).join(', ')}.`
}

export function PlaceValue(props: PlaceValueProps) {
  const cols = layout(props)
  const total = cols.reduce((s, c) => s + c.w, 0)
  const width = Math.max(285, total + 31)
  let x = (width - total) / 2 + 0.5
  const hot = cols.findIndex((c) => c.decimal && c.digit !== '' && c.digit !== '0')
  return (
    <Svg width={width} height={120} label={describePlaceValue(props)}>
      {cols.map((c, i) => {
        const cx = x
        x += c.w
        return (
          <g key={i}>
            {!c.sep && <rect x={cx} y={HEAD_Y} width={c.w} height={HEAD_H} rx={0} fill={SOFT} stroke={INK} strokeWidth={1} />}
            <rect x={cx} y={HEAD_Y + HEAD_H} width={c.w} height={BODY_H} rx={0} fill={i === hot ? CORAL_TINT : WHITE} stroke={INK} strokeWidth={1} />
            {!c.sep && (
              <T x={cx + c.w / 2} y={58} size={13} weight={600}>
                {c.head}
              </T>
            )}
            <T x={cx + c.w / 2} y={97} size={20} weight={700}>
              {c.digit}
            </T>
          </g>
        )
      })}
    </Svg>
  )
}
