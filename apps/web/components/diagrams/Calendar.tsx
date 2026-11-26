import type { CalendarSpec } from '@jemma/profiling/schemas'
import { MONTHS, WEEKDAYS, dateWords, daysIn, weekdayOf, type Notation } from '@jemma/profiling/logic'
import { BODY, GOLD, GOLD_TINT, Svg, T, type Variant } from './shared'

// P189: one month of a calendar, from the "Percentages, time and money" board ("Lesedi's party is 2 weeks after 6 November. On which date is it?"). A week starts
// on Monday, as a South African calendar has it, or on Sunday in the US. The days the question is about are circled in gold.

export type CalendarProps = CalendarSpec & { variant?: Variant; notation?: Notation }

const W = 300
const COL = 42
const ROW = 32
const X0 = 24
const Y0 = 78

const sayList = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : (items[0] ?? ''))

export function describeCalendar({ year, month, circled = [], variant = 'card', notation = 'za' }: CalendarProps): string {
  const head = `A calendar of ${MONTHS[month - 1]} ${year}`
  if (!circled.length) return `${head}.`
  // While a question is answered the words never say the day of the week of a circled date: it may be the answer.
  if (variant === 'question') return `${head}, with ${sayList(circled.map((d) => dateWords(d, month, notation)))} circled.`
  const days = circled.map((d) => `${WEEKDAYS[weekdayOf(year, month, d)]}${notation === 'us' ? ', ' : ' '}${dateWords(d, month, notation)}`)
  return `${head}. ${sayList(days)} ${circled.length === 1 ? 'is' : 'are'} circled.`
}

export function Calendar(props: CalendarProps) {
  const { year, month, circled = [], notation = 'za' } = props
  const sundayFirst = notation === 'us'
  const heads = sundayFirst ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  const days = daysIn(year, month)
  const first = weekdayOf(year, month, 1)
  const offset = sundayFirst ? first : (first + 6) % 7
  const rows = Math.ceil((offset + days) / 7)
  const H = Y0 + (rows - 1) * ROW + 20
  return (
    <Svg width={W} height={H} label={describeCalendar(props)}>
      <T x={W / 2} y={20} size={16} weight={700}>
        {`${MONTHS[month - 1]} ${year}`}
      </T>
      {heads.map((d, i) => (
        <T key={i} x={X0 + i * COL} y={48} size={13} weight={700} fill={BODY}>
          {d}
        </T>
      ))}
      {Array.from({ length: days }, (_, i) => {
        const n = i + 1
        const k = offset + i
        const x = X0 + (k % 7) * COL
        const y = Y0 + Math.floor(k / 7) * ROW
        const ring = circled.includes(n)
        return (
          <g key={n} data-day={n} data-circled={ring ? '' : undefined}>
            {ring ? <circle cx={x} cy={y - 5} r={15} fill={GOLD_TINT} stroke={GOLD} strokeWidth={2.5} /> : null}
            <T x={x} y={y} size={14} weight={ring ? 700 : 600}>
              {String(n)}
            </T>
          </g>
        )
      })}
    </Svg>
  )
}
