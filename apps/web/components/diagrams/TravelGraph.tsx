import type { TravelGraphSpec } from '@jemma/profiling/schemas'
import { numberIn, type Notation } from '@jemma/profiling/logic'
import { BODY, INK, Line, Svg, T, type Variant } from './shared'

// P191: a graph of a trip, from the "Patterns, algebra and graphs" board ("For how many minutes does Neo stop?"). Distance from the start goes up the side and time
// along the bottom, on a light grid; the trip is a blue line from one point to the next. A flat part is a stop.

export type TravelGraphProps = TravelGraphSpec & { variant?: Variant; notation?: Notation }

const W = 310
const X0 = 40
const Y0 = 26
const GW = 260
const GH = 176
const BLUE = '#001489'
const GRID = '#ECE9E2'

const T_WORDS: Record<TravelGraphSpec['tUnit'], string> = { s: 'seconds', min: 'minutes', h: 'hours' }
const D_WORDS: Record<TravelGraphSpec['dUnit'], string> = { m: 'metres', km: 'km' }

export function describeTravelGraph({ points, tMax, dMax, tUnit, dUnit, variant = 'card', notation = 'za' }: TravelGraphProps): string {
  const frame = `A distance and time graph of a trip, with time in ${T_WORDS[tUnit]} up to ${numberIn(tMax, notation)} and distance in ${D_WORDS[dUnit]} up to ${numberIn(dMax, notation)}`
  // While a question is answered the words never walk the line: what it shows is the answer.
  if (variant === 'question') return `${frame}.`
  const at = points.map((p) => `${numberIn(p.d, notation)} ${dUnit} at ${numberIn(p.t, notation)} ${tUnit}`)
  return `${frame}. The line goes from ${at[0]} to ${at.slice(1, -1).length ? `${at.slice(1, -1).join(', ')}, then ` : ''}${at[at.length - 1]}.`
}

export function TravelGraph(props: TravelGraphProps) {
  const { points, tMax, dMax, tUnit, dUnit, notation = 'za' } = props
  const tStep = props.tStep ?? tMax / 6
  const dStep = props.dStep ?? dMax / 6
  const tLines = Math.round(tMax / tStep)
  const dLines = Math.round(dMax / dStep)
  const X = (t: number) => X0 + (t / tMax) * GW
  const Y = (d: number) => Y0 + GH - (d / dMax) * GH
  // A number on every line, or on every other line when there are more than 6.
  const tEvery = tLines > 6 ? 2 : 1
  const dEvery = dLines > 6 ? 2 : 1
  return (
    <Svg width={W} height={Y0 + GH + 40} label={describeTravelGraph(props)}>
      {Array.from({ length: tLines + 1 }, (_, i) => (
        <Line key={`v${i}`} x1={X(i * tStep)} y1={Y0} x2={X(i * tStep)} y2={Y0 + GH} stroke={GRID} />
      ))}
      {Array.from({ length: dLines + 1 }, (_, j) => (
        <Line key={`h${j}`} x1={X0} y1={Y(j * dStep)} x2={X0 + GW} y2={Y(j * dStep)} stroke={GRID} />
      ))}
      <Line x1={X0} y1={Y0 + GH} x2={X0 + GW} y2={Y0 + GH} w={1.6} />
      <Line x1={X0} y1={Y0} x2={X0} y2={Y0 + GH} w={1.6} />
      {Array.from({ length: tLines + 1 }, (_, i) =>
        i % tEvery === 0 ? (
          <T key={`tl${i}`} x={X(i * tStep)} y={Y0 + GH + 16} size={11} weight={500} fill={BODY}>
            {numberIn(i * tStep, notation)}
          </T>
        ) : null,
      )}
      {Array.from({ length: dLines + 1 }, (_, j) =>
        j > 0 && j % dEvery === 0 ? (
          <T key={`dl${j}`} x={X0 - 6} y={Y(j * dStep) + 4} size={11} weight={500} fill={BODY} anchor="end">
            {numberIn(j * dStep, notation)}
          </T>
        ) : null,
      )}
      <polyline data-trip="" points={points.map((p) => `${X(p.t).toFixed(1)},${Y(p.d).toFixed(1)}`).join(' ')} fill="none" stroke={BLUE} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <T x={X0 + GW} y={Y0 + GH + 32} size={12} weight={700} fill={BODY} anchor="end">
        {`time (${tUnit})`}
      </T>
      <T x={X0} y={Y0 - 12} size={12} weight={700} fill={BODY}>
        {dUnit}
      </T>
    </Svg>
  )
}
