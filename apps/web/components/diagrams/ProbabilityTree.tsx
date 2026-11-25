import type { TreeSpec } from '@jemma/profiling/schemas'
import { GOLD, GOLD_TINT, INK, Line, Svg, T } from './shared'

// P165: a probability tree of one or two stages. A probability "?" is a blank: the learner writes it in the boxes of the answer, never on the tree.

const W = 380
const ROW = 46
const blank = (p: string) => p.trim() === '?'

export function describeTree(s: TreeSpec): string {
  const say = (b: { label: string; p: string }) => (blank(b.p) ? `${b.label}, blank` : `${b.label} with probability ${b.p.trim()}`)
  const parts = [`Tree diagram. First branches: ${s.first.map(say).join(' and ')}.`]
  s.second?.forEach((g, i) => parts.push(`After ${s.first[i]?.label ?? ''}: ${g.map(say).join(' and ')}.`))
  return parts.join(' ')
}

function Prob({ x, y, p }: { x: number; y: number; p: string }) {
  if (blank(p))
    return (
      <g data-blank="">
        <rect x={x - 15} y={y - 15} width={30} height={22} rx={6} fill={GOLD_TINT} stroke={GOLD} strokeWidth={1.6} />
        <T x={x} y={y + 1} size={13} weight={700}>
          ?
        </T>
      </g>
    )
  return (
    <T x={x} y={y} size={13} weight={600}>
      {p.trim()}
    </T>
  )
}

export function ProbabilityTree(s: TreeSpec) {
  const two = !!s.second
  const leaves = two ? s.second!.reduce((n, g) => n + g.length, 0) : s.first.length
  const H = Math.max(150, leaves * ROW + 16)
  const root = { x: 18, y: H / 2 }
  const x1 = two ? 128 : 210
  const x2 = 246
  // The leaves are spread evenly; a first branch ends in the middle of its own leaves.
  const leafY = (i: number) => 8 + ROW / 2 + i * ROW
  let at = 0
  const firsts = s.first.map((b, i) => {
    const n = two ? (s.second![i]?.length ?? 0) : 1
    const ys = Array.from({ length: n }, (_, k) => leafY(at + k))
    at += n
    return { b, y: ys.reduce((a, v) => a + v, 0) / ys.length, ys }
  })
  return (
    <Svg width={W} height={H} label={describeTree(s)}>
      <circle cx={root.x} cy={root.y} r={4} fill={INK} />
      {firsts.map(({ b, y, ys }, i) => (
        <g key={i} data-branch="first">
          <Line x1={root.x} y1={root.y} x2={x1} y2={y} w={1.8} cap="round" />
          <Prob x={(root.x + x1) / 2} y={(root.y + y) / 2 - 8} p={b.p} />
          <T x={x1 + 6} y={y + 5} size={14} weight={700} anchor="start">
            {b.label}
          </T>
          {two
            ? s.second![i]!.map((c, k) => (
                <g key={k} data-branch="second">
                  <Line x1={x1 + 8 + b.label.length * 8} y1={y} x2={x2} y2={ys[k]!} w={1.8} cap="round" />
                  <Prob x={(x1 + 8 + b.label.length * 8 + x2) / 2} y={(y + ys[k]!) / 2 - 8} p={c.p} />
                  <T x={x2 + 6} y={ys[k]! + 5} size={14} weight={700} anchor="start">
                    {c.label}
                  </T>
                </g>
              ))
            : null}
        </g>
      ))}
    </Svg>
  )
}
