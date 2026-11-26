import type { PercentBarSpec } from '@jemma/profiling/schemas'
import { amountIn, percentIn, percentPart, type Notation } from '@jemma/profiling/logic'
import { BODY, GOLD, INK, Line, RED_TEXT, Svg, T, WHITE, type Variant } from './shared'

// P189: a percentage bar, from the "Percentages, time and money" board ("Zanele saves 25% of R240. How much is that?"). The bar runs from 0% to 100%, the whole is
// written under its end, and the shaded part has its percent over it and its amount under it. The one the question asks for is a red question mark.

export type PercentBarProps = PercentBarSpec & { variant?: Variant; notation?: Notation }

const W = 320
const X0 = 10
const BW = 300
const Y = 40
const BH = 56
/** About how wide a label is, for keeping two labels apart. */
const wide = (text: string, size: number) => text.length * size * 0.56

export function describePercentBar({ whole, percent, money = false, ask = 'part', variant = 'card', notation = 'za' }: PercentBarProps): string {
  const w = amountIn(whole, notation, money)
  const p = percentIn(percent, notation)
  const part = amountIn(percentPart({ whole, percent }), notation, money)
  if (variant !== 'question') return `A bar from 0% to 100%. 100% is ${w}, and the first ${p}, shaded, is ${part}.`
  if (ask === 'whole') return `A bar from 0% to 100%. The first ${p} is shaded and is ${part}. 100% is a question mark.`
  if (ask === 'percent') return `A bar from 0% to 100%. 100% is ${w}. The shaded part is ${part}, and its percent is a question mark.`
  return `A bar from 0% to 100%. 100% is ${w}. The first ${p} is shaded, with a question mark under it.`
}

export function PercentBar(props: PercentBarProps) {
  const { whole, percent, parts, money = false, ask = 'part', notation = 'za' } = props
  const end = X0 + (BW * percent) / 100
  const pctText = ask === 'percent' ? '?%' : percentIn(percent, notation)
  const partText = ask === 'part' ? '?' : amountIn(percentPart({ whole, percent }), notation, money)
  const wholeText = ask === 'whole' ? '?' : amountIn(whole, notation, money)
  // Over the bar: 0% at the start, 100% at the end and the percent of the shaded part at its end, leaving out an end label it would run into.
  const pw = wide(pctText, 14)
  const pctAnchor = end - pw / 2 < X0 ? 'start' : end + pw / 2 > X0 + BW ? 'end' : 'middle'
  const pctX = pctAnchor === 'start' ? X0 : pctAnchor === 'end' ? X0 + BW : end
  const pctLeft = pctAnchor === 'start' ? X0 : pctAnchor === 'end' ? X0 + BW - pw : end - pw / 2
  const show0 = pctLeft > X0 + wide('0%', 13) + 6
  const show100 = percent < 100 && pctLeft + pw < X0 + BW - wide('100%', 13) - 6
  // Under the bar: the amount of the shaded part under its middle, the whole under the end (a line lower if the two would meet).
  const mid = (X0 + end) / 2
  const partW = wide(partText, partText === '?' ? 20 : 16)
  const partAnchor = mid - partW / 2 < X0 ? 'start' : 'middle'
  const partRight = partAnchor === 'start' ? X0 + partW : mid + partW / 2
  const wholeW = wide(wholeText, wholeText === '?' ? 20 : 16)
  const lower = partRight > X0 + BW - wholeW - 8
  const H = lower ? 160 : 138
  return (
    <Svg width={W} height={H} label={describePercentBar(props)}>
      <rect x={X0} y={Y} width={BW} height={BH} rx={8} fill={WHITE} stroke={INK} strokeWidth={2.2} />
      <rect data-shaded="" x={X0} y={Y} width={end - X0} height={BH} rx={percent >= 100 ? 8 : 0} fill={GOLD} />
      {percent < 100 ? <Line x1={end} y1={Y} x2={end} y2={Y + BH} w={2.2} /> : null}
      {parts
        ? Array.from({ length: parts - 1 }, (_, k) => {
            const x = X0 + ((k + 1) * BW) / parts
            return Math.abs(x - end) < 1 ? null : <Line key={k} x1={x} y1={Y} x2={x} y2={Y + BH} w={1.6} />
          })
        : null}
      <rect x={X0} y={Y} width={BW} height={BH} rx={8} fill="none" stroke={INK} strokeWidth={2.2} />
      {show0 ? (
        <T x={X0} y={28} size={13} weight={600} fill={BODY} anchor="start">
          0%
        </T>
      ) : null}
      {show100 ? (
        <T x={X0 + BW} y={28} size={13} weight={600} fill={BODY} anchor="end">
          100%
        </T>
      ) : null}
      <T x={pctX} y={28} size={14} weight={700} fill={ask === 'percent' ? RED_TEXT : INK} anchor={pctAnchor}>
        {pctText}
      </T>
      <T x={partAnchor === 'start' ? X0 : mid} y={Y + BH + 28} size={partText === '?' ? 20 : 16} weight={700} fill={partText === '?' ? RED_TEXT : INK} anchor={partAnchor}>
        {partText}
      </T>
      <T x={X0 + BW} y={Y + BH + (lower ? 50 : 28)} size={wholeText === '?' ? 20 : 16} weight={700} fill={wholeText === '?' ? RED_TEXT : INK} anchor="end">
        {wholeText}
      </T>
    </Svg>
  )
}
