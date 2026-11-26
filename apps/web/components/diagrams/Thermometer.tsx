import type { ThermometerSpec } from '@jemma/profiling/schemas'
import { thermometerStep } from '@jemma/profiling/logic'
import { BODY, INK, Line, Svg, T, WHITE, type Variant } from './shared'

// P190: a thermometer, from the "Measuring" board ("What temperature does the thermometer show?"). It is marked every degree, every 2 or every 5 (by how far it
// runs), with a number every 10, below zero too, and the red line comes up to the reading.

export type ThermometerProps = ThermometerSpec & { variant?: Variant }

const W = 260
const X = 120
const TOP = 24
const ZERO_Y = 244
const RED = '#E03C31'

/** A temperature in words for a screen reader: minus 5, never a dash it may not read. */
const say = (v: number) => (v < 0 ? `minus ${-v}` : String(v))

export function describeThermometer({ min, max, value, unit = 'C', variant = 'card' }: ThermometerProps): string {
  const scale = `A thermometer from ${say(min)} to ${say(max)} degrees ${unit === 'F' ? 'Fahrenheit' : 'Celsius'}.`
  // While a question is answered the words never say where the red line is: the reading is the answer.
  return variant === 'question' ? scale : `${scale} The red line is at ${say(value)} degrees.`
}

export function Thermometer(props: ThermometerProps) {
  const { min, max, value, unit = 'C' } = props
  const step = thermometerStep(props)
  const y = (v: number) => ZERO_Y - ((v - min) * (ZERO_Y - TOP)) / (max - min)
  const marks = Math.round((max - min) / step)
  return (
    <Svg width={W} height={292} label={describeThermometer(props)}>
      <rect x={X - 14} y={TOP - 10} width={28} height={ZERO_Y - TOP + 26} rx={14} fill={WHITE} stroke={INK} strokeWidth={2.5} />
      <circle cx={X} cy={262} r={24} fill={RED} stroke={INK} strokeWidth={2.5} />
      <rect data-column="" x={X - 6} y={y(value)} width={12} height={262 - y(value)} rx={6} fill={RED} />
      {Array.from({ length: marks + 1 }, (_, k) => {
        const v = min + k * step
        const big = v % 10 === 0
        return (
          <g key={k}>
            <Line x1={X + 16} y1={y(v)} x2={X + (big ? 34 : 24)} y2={y(v)} w={big ? 1.6 : 1} />
            {big ? (
              <T x={X + 42} y={y(v) + 5} size={14} weight={700} anchor="start">
                {v < 0 ? `−${-v}` : String(v)}
              </T>
            ) : null}
          </g>
        )
      })}
      <T x={X - 24} y={TOP + 6} size={14} weight={700} fill={BODY} anchor="end">
        {unit === 'F' ? '°F' : '°C'}
      </T>
    </Svg>
  )
}
