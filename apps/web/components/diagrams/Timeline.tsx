import type { TimelineSpec } from '@jemma/profiling/schemas'
import { BODY, INK, Line, RED_TEXT, Svg, T } from './shared'

// P165: a time line of financial maths. A long time line shows its first and last periods and the ones with a label, with a break between them.

const W = 360
const H = 128
const X0 = 26
const X1 = 334
const Y = 64
const MAX_SHOWN = 9

/** The periods drawn: all of them when there are few, else the first and last ones and every period with a label. */
export function shownPeriods(s: TimelineSpec): number[] {
  const n = s.to - s.from
  if (n <= MAX_SHOWN - 1) return Array.from({ length: n + 1 }, (_, i) => s.from + i)
  const want = new Set<number>([s.from, s.from + 1, s.from + 2, s.to - 1, s.to])
  if (s.every) [s.every.from, s.every.to].forEach((p) => want.add(p))
  ;(s.marks ?? []).forEach((m) => want.add(m.at))
  return [...want].filter((p) => p >= s.from && p <= s.to).sort((a, b) => a - b).slice(0, MAX_SHOWN)
}

const unitWord = (s: TimelineSpec, n: number) => `${s.unit}${n === 1 ? '' : 's'}`

export function describeTimeline(s: TimelineSpec): string {
  const parts = [`Time line from ${s.unit} ${s.from} to ${s.unit} ${s.to}.`]
  if (s.every) parts.push(`${s.every.label.trim()} at the end of ${unitWord(s, 2)} ${s.every.from} to ${s.every.to}.`)
  for (const m of s.marks ?? []) parts.push(`${m.label.trim()} at ${s.unit} ${m.at}.`)
  return parts.join(' ')
}

export function Timeline(s: TimelineSpec) {
  const shown = shownPeriods(s)
  const x = (i: number) => X0 + (i / Math.max(1, shown.length - 1)) * (X1 - X0)
  const paid = (p: number) => !!s.every && p >= s.every.from && p <= s.every.to
  return (
    <Svg width={W} height={H} label={describeTimeline(s)}>
      <Line x1={X0} y1={Y} x2={X1} y2={Y} w={2} />
      {shown.map((p, i) => {
        const broken = i > 0 && p - shown[i - 1]! > 1
        return (
          <g key={p}>
            {broken ? (
              <g data-break="">
                <rect x={(x(i - 1) + x(i)) / 2 - 9} y={Y - 6} width={18} height={12} fill="#FFFFFF" />
                <T x={(x(i - 1) + x(i)) / 2} y={Y + 4} size={14} weight={700} fill={BODY}>
                  …
                </T>
              </g>
            ) : null}
            <Line x1={x(i)} y1={Y - 7} x2={x(i)} y2={Y + 7} w={1.8} />
            <T x={x(i)} y={Y + 24} size={12} weight={500} fill={BODY}>
              {String(p)}
            </T>
            {paid(p) ? (
              <T x={x(i)} y={Y - 16} size={11} weight={700}>
                {s.every!.label.trim()}
              </T>
            ) : null}
          </g>
        )
      })}
      {(s.marks ?? []).map((m) => {
        const i = shown.indexOf(m.at)
        return i < 0 ? null : (
          <T key={`m${m.at}${m.label}`} x={x(i)} y={Y + 46} size={13} weight={700} fill={RED_TEXT}>
            {m.label.trim()}
          </T>
        )
      })}
      <T x={X0} y={H - 6} size={11} weight={500} fill={BODY} anchor="start">
        {unitWord(s, 2)}
      </T>
    </Svg>
  )
}
