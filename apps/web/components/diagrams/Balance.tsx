import type { ReactNode } from 'react'
import type { BalanceSpec } from '@jemma/profiling/schemas'
import { balanceSolution } from '@jemma/profiling/logic'
import { GOLD, GOLD_TINT, INK, Svg, T, type Variant } from './shared'

// P191: an equation as a balance scale, from the "Patterns, algebra and graphs" board ("The scale balances: 2x + 3 = 11. What is x?"). Each pan holds its bags of
// the unknown and its weights: up to 5 small weights of 1, or one weight with its number on it. The beam is level: the scale balances.

export type BalanceProps = BalanceSpec & { variant?: Variant }

const W = 300
const GREY = '#8F8D88'
const PAN_W = 126
const NUMBERS = ['no', 'one', 'two', 'three', 'four']

type Pan = BalanceSpec['left']

const panWords = (p: Pan, letter: string): string => {
  const bags = p.x === 0 ? '' : p.x === 1 ? `a bag of ${letter}` : `${NUMBERS[p.x]} bags of ${letter}`
  const weights = p.n === 0 ? '' : p.n <= 5 ? `${p.n === 1 ? 'a small weight' : `${p.n} small weights`} of 1` : `a weight of ${p.n}`
  return [bags, weights].filter(Boolean).join(' and ') || 'nothing'
}

export function describeBalance({ left, right, letter = 'x', variant = 'card' }: BalanceProps): string {
  const scale = `A balance scale. The left pan has ${panWords(left, letter)}. The right pan has ${panWords(right, letter)}. The scale balances.`
  // While a question is answered the words never say what a bag weighs: it is the answer.
  return variant === 'question' ? scale : `${scale} Each bag is ${balanceSolution({ left, right })}.`
}

/** The bags and weights of one pan, side by side, standing on the pan at `bottom`, in the middle of `cx`. */
function PanItems({ pan, cx, bottom, letter }: { pan: Pan; cx: number; bottom: number; letter: string }) {
  const blockW = 18 + String(pan.n).length * 10
  const widths = [...Array.from({ length: pan.x }, () => 26), ...(pan.n === 0 ? [] : pan.n <= 5 ? Array.from({ length: pan.n }, () => 15) : [blockW])]
  const gap = 4
  const total = widths.reduce((a, w) => a + w, 0) + Math.max(0, widths.length - 1) * gap
  const k = Math.min(1, (PAN_W - 10) / Math.max(total, 1))
  let x = cx - (total * k) / 2
  const out: ReactNode[] = []
  widths.forEach((w, i) => {
    const bag = i < pan.x
    const small = !bag && pan.n <= 5
    const h = (bag ? 34 : small ? 18 : 30) * k
    out.push(
      bag ? (
        <g key={i} data-bag="">
          <rect x={x} y={bottom - h} width={w * k} height={h} rx={6 * k} fill={GOLD_TINT} stroke={GOLD} strokeWidth={2} />
          <T x={x + (w * k) / 2} y={bottom - h / 2 + 5} size={16 * k} weight={700}>
            {letter}
          </T>
        </g>
      ) : (
        <g key={i} data-weight={small ? 1 : pan.n}>
          <rect x={x} y={bottom - h} width={w * k} height={h} rx={(small ? 3 : 5) * k} fill={GREY} stroke={INK} strokeWidth={small ? 1.2 : 1.6} />
          <T x={x + (w * k) / 2} y={bottom - h / 2 + (small ? 4 : 6) * k} size={(small ? 11 : 17) * k} weight={700} fill="#FFFFFF">
            {small ? '1' : String(pan.n)}
          </T>
        </g>
      ),
    )
    x += (w + gap) * k
  })
  return <g>{out}</g>
}

export function Balance(props: BalanceProps) {
  const { left, right, letter = 'x' } = props
  const leftX = 2 + PAN_W / 2
  const rightX = W - 2 - PAN_W / 2
  return (
    <Svg width={W} height={200} label={describeBalance(props)}>
      <polygon points="150,36 139,178 161,178" fill="#ECE9E2" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      <rect x={100} y={178} width={100} height={14} rx={6} fill="#ECE9E2" stroke={INK} strokeWidth={2} />
      <line x1={leftX - 46} y1={36} x2={rightX + 46} y2={36} stroke={INK} strokeWidth={4} strokeLinecap="round" />
      <circle cx={150} cy={36} r={6} fill={INK} />
      <line x1={leftX} y1={36} x2={leftX} y2={122} stroke={INK} strokeWidth={1.6} />
      <line x1={rightX} y1={36} x2={rightX} y2={122} stroke={INK} strokeWidth={1.6} />
      <path d={`M${leftX - PAN_W / 2},122 L${leftX + PAN_W / 2},122 L${leftX + PAN_W / 2 - 12},140 L${leftX - PAN_W / 2 + 12},140 Z`} fill="#F2E9D8" stroke={INK} strokeWidth={2} />
      <path d={`M${rightX - PAN_W / 2},122 L${rightX + PAN_W / 2},122 L${rightX + PAN_W / 2 - 12},140 L${rightX - PAN_W / 2 + 12},140 Z`} fill="#F2E9D8" stroke={INK} strokeWidth={2} />
      <PanItems pan={left} cx={leftX} bottom={120} letter={letter} />
      <PanItems pan={right} cx={rightX} bottom={120} letter={letter} />
    </Svg>
  )
}
