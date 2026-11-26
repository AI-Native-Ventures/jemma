import type { FlowDiagramSpec } from '@jemma/profiling/schemas'
import { flowOutput, flowStepText, numberIn, type Notation } from '@jemma/profiling/logic'
import { BODY, GOLD, GOLD_TINT, GREEN, INK, Svg, T, WHITE, type Variant } from './shared'

// P191: a flow diagram, from the "Patterns, algebra and graphs" board ("Find the missing outputs."). The inputs on the left go through the steps of the rule in
// turn, in green boxes, to the outputs on the right. A blank is a gold box with a question mark.

export type FlowDiagramProps = FlowDiagramSpec & { variant?: Variant; notation?: Notation }

const W = 320
const ROW = 52
const TOP = 30
const GREEN_TINT = '#D8EFE3'

const STEP_WORDS: Record<FlowDiagramSpec['rule'][number]['op'], string> = { add: 'plus', subtract: 'minus', multiply: 'times', divide: 'divided by' }
const sayList = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : (items[0] ?? ''))

export function describeFlowDiagram({ rule, inputs, blanks = [], blankInputs = [], variant = 'card', notation = 'za' }: FlowDiagramProps): string {
  const steps = rule.map((r) => `${STEP_WORDS[r.op]} ${numberIn(r.by, notation)}`).join(', then ')
  const outputs = inputs.map((v) => numberIn(flowOutput(rule, v), notation))
  if (variant !== 'question') return `A flow diagram: the inputs ${sayList(inputs.map((v) => numberIn(v, notation)))} go through ${steps}, to the outputs ${sayList(outputs)}.`
  // While a question is answered a blank is said as a blank: it is the answer.
  const ins = inputs.map((v, i) => (blankInputs.includes(i + 1) ? 'a blank' : numberIn(v, notation)))
  const outs = outputs.map((v, i) => (blanks.includes(i + 1) ? 'a blank' : v))
  return `A flow diagram: the inputs ${sayList(ins)} go through ${steps}, to the outputs ${sayList(outs)}.`
}

function Box({ x, y, w, text, blank }: { x: number; y: number; w: number; text: string; blank: boolean }) {
  return (
    <g data-blank={blank ? '' : undefined}>
      <rect x={x} y={y - 20} width={w} height={38} rx={10} fill={blank ? GOLD_TINT : WHITE} stroke={blank ? GOLD : INK} strokeWidth={2} />
      <T x={x + w / 2} y={y + 6} size={text.length > 4 ? 16 : 20} weight={700}>
        {blank ? '?' : text}
      </T>
    </g>
  )
}

/** A line with an arrowhead at its end. */
function Arrow({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const a = Math.atan2(y2 - y1, x2 - x1)
  const head = `${x2},${y2} ${x2 - 9 * Math.cos(a - 0.4)},${y2 - 9 * Math.sin(a - 0.4)} ${x2 - 9 * Math.cos(a + 0.4)},${y2 - 9 * Math.sin(a + 0.4)}`
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={INK} strokeWidth={2} />
      <polygon points={head} fill={INK} />
    </g>
  )
}

export function FlowDiagram(props: FlowDiagramProps) {
  const { rule, inputs, blanks = [], blankInputs = [], notation = 'za' } = props
  const rows = inputs.map((_, k) => TOP + k * ROW)
  const mid = (rows[0]! + rows[rows.length - 1]!) / 2
  const outW = Math.max(52, ...inputs.map((v) => 20 + numberIn(flowOutput(rule, v), notation).length * 11))
  const outX = W - 6 - outW
  const gap = 14
  const left = 84
  const right = outX - 22
  const boxW = Math.min(64, (right - left - (rule.length - 1) * gap) / rule.length)
  const used = rule.length * boxW + (rule.length - 1) * gap
  const first = left + (right - left - used) / 2
  const H = rows[rows.length - 1]! + 52
  return (
    <Svg width={W} height={H} label={describeFlowDiagram(props)}>
      {inputs.map((v, k) => (
        <g key={`in${k}`}>
          <Box x={6} y={rows[k]!} w={50} text={numberIn(v, notation)} blank={blankInputs.includes(k + 1)} />
          <Arrow x1={58} y1={rows[k]!} x2={first - 4} y2={mid} />
        </g>
      ))}
      {rule.map((r, i) => {
        const x = first + i * (boxW + gap)
        return (
          <g key={`step${i}`} data-step={i + 1}>
            <rect x={x} y={mid - 25} width={boxW} height={50} rx={12} fill={GREEN_TINT} stroke={GREEN} strokeWidth={2} />
            <T x={x + boxW / 2} y={mid + 7} size={boxW < 56 ? 17 : 20} weight={700}>
              {flowStepText(r, notation)}
            </T>
            {i > 0 ? <Arrow x1={x - gap} y1={mid} x2={x - 2} y2={mid} /> : null}
          </g>
        )
      })}
      {inputs.map((v, k) => (
        <g key={`out${k}`}>
          <Arrow x1={first + used + 2} y1={mid} x2={outX - 4} y2={rows[k]!} />
          <Box x={outX} y={rows[k]!} w={outW} text={numberIn(flowOutput(rule, v), notation)} blank={blanks.includes(k + 1)} />
        </g>
      ))}
      <T x={31} y={H - 8} size={12} weight={700} fill={BODY}>
        input
      </T>
      <T x={outX + outW / 2} y={H - 8} size={12} weight={700} fill={BODY}>
        output
      </T>
    </Svg>
  )
}
