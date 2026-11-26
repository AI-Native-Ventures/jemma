import type { FactorTreeSpec } from '@jemma/profiling/schemas'
import { factorTreeOf, isPrime, readingOrder, type FactorNode } from '@jemma/profiling/logic'
import { BODY, GOLD, GOLD_TINT, GREEN, INK, Line, Svg, T, WHITE, type Variant } from './shared'

// P189: a factor tree, from the "Calculating and fractions" board ("Finish the factor tree. Which number goes in the gold circle?"). The number at the top splits
// into two factors, and so on down. A number that still splits is in a box; a prime number is in a green circle; the number the question asks for is a gold blank.

export type FactorTreeProps = FactorTreeSpec & { variant?: Variant }

const W = 320
const ROW = 66
const TOP = 28
const GREEN_TINT = '#D8EFE3'

export function describeFactorTree({ root, splits, gold, variant = 'card' }: FactorTreeProps): string {
  const tree = factorTreeOf({ root, splits, gold })
  // While a question is answered the gold number is said as a blank: it is the answer.
  const said = (n: FactorNode) => (n.gold && variant === 'question' ? 'a blank' : String(n.value))
  const parts = readingOrder(tree.root)
    .filter((n) => n.kids.length === 2)
    .map((n, i) => `${said(n)} ${i === 0 ? 'splits ' : ''}into ${said(n.kids[0]!)} and ${said(n.kids[1]!)}`)
  const after = gold !== undefined && variant !== 'question' ? ` The gold number is ${gold}.` : ''
  return `A factor tree of ${root}: ${parts.join('; ')}.${after}`
}

type Placed = { node: FactorNode; x: number; y: number }

/** Each number at the bottom gets a place of its own from the left; a number that splits sits over the middle of its two factors. */
function place(root: FactorNode, leaves: number): Placed[] {
  const slot = Math.min(64, (W - 20) / leaves)
  const left = (W - slot * leaves) / 2
  const out: Placed[] = []
  let next = 0
  const walk = (n: FactorNode): number => {
    const x = n.kids.length ? n.kids.map(walk).reduce((a, b) => a + b, 0) / n.kids.length : left + (next++ + 0.5) * slot
    out.push({ node: n, x, y: TOP + n.depth * ROW })
    return x
  }
  walk(root)
  return out
}

function Node({ node, x, y }: Placed) {
  const prime = isPrime(node.value)
  const text = node.gold ? '?' : String(node.value)
  const stroke = node.gold ? GOLD : prime ? GREEN : INK
  const fill = node.gold ? GOLD_TINT : prime ? GREEN_TINT : WHITE
  const boxW = Math.max(46, 18 + String(node.value).length * 12)
  return (
    <g data-node={node.value} data-gold={node.gold ? '' : undefined} data-prime={prime ? '' : undefined}>
      {prime ? (
        <circle cx={x} cy={y} r={20} fill={fill} stroke={stroke} strokeWidth={node.gold ? 2.5 : 2} />
      ) : (
        <rect x={x - boxW / 2} y={y - 17} width={boxW} height={34} rx={10} fill={fill} stroke={stroke} strokeWidth={node.gold ? 2.5 : 2} />
      )}
      <T x={x} y={y + 6.5} size={18} weight={700}>
        {text}
      </T>
    </g>
  )
}

export function FactorTree(props: FactorTreeProps) {
  const tree = factorTreeOf(props)
  const placed = place(tree.root, tree.leaves.length)
  const at = new Map(placed.map((p) => [p.node, p]))
  // The words under the tree say what a green circle is, when one is drawn.
  const anyPrime = placed.some((p) => !p.node.gold && isPrime(p.node.value))
  const bottom = TOP + (tree.rows - 1) * ROW + 22
  const H = bottom + (anyPrime ? 34 : 8)
  return (
    <Svg width={W} height={H} label={describeFactorTree(props)}>
      {placed.flatMap((p) =>
        p.node.kids.map((k, i) => {
          const c = at.get(k)!
          return <Line key={`${p.x}.${p.y}.${i}`} x1={p.x} y1={p.y + 17} x2={c.x} y2={c.y - 18} w={2} />
        }),
      )}
      {placed.map((p, i) => (
        <Node key={i} {...p} />
      ))}
      {anyPrime ? (
        <T x={W / 2} y={bottom + 24} size={13} weight={600} fill={BODY}>
          Green circles are prime numbers.
        </T>
      ) : null}
    </Svg>
  )
}
