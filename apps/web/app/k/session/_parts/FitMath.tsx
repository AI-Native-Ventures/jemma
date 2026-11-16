'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { katexHtml } from './katex-html'
import { fitPlan, FIT_MIN, splitAtRelation, type FitPlan } from './typeset'

// P135: one piece of typeset maths in its box. It never breaks inside itself (KaTeX would cut a line after an equals sign or a plus, leaving "x² − 5x + 6 =" and a
// lone "0" on the next line): the piece is one unbreakable block, so a whole equation moves to the next line instead of splitting. When it is wider than its box it
// is scaled down to fit, to about 70 percent at the least. Only when that is still too wide is it cut, after its first equals sign, the right side on a line of
// its own. The first draw is always the full piece (what the server drew), so nothing differs at hydration; the measuring runs before the browser paints.
// The caller gives each piece a `key` of its text and size, so a new text starts again from the full piece.

const FULL: FitPlan = { kind: 'full', scale: 1, wrap: false }
const same = (a: FitPlan, b: FitPlan) => a.kind === b.kind && a.scale === b.scale && a.wrap === b.wrap

/** The box of a piece: the content width of the nearest ancestor that is not inline (the text line the piece sits in has that width at most). */
function boxOf(el: HTMLElement): HTMLElement | null {
  let box = el.parentElement
  while (box && getComputedStyle(box).display === 'inline') box = box.parentElement
  return box
}

const contentWidth = (box: HTMLElement): number => {
  const cs = getComputedStyle(box)
  return box.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0)
}

export type FitMathProps = { html: string; latex: string; size: number; color?: string }

export function FitMath({ html, latex, size, color }: FitMathProps) {
  const outer = useRef<HTMLSpanElement>(null)
  const [plan, setPlan] = useState<FitPlan>(FULL)
  const [tick, setTick] = useState(0)
  const split = useMemo(() => splitAtRelation(latex), [latex])
  const halves = useMemo(() => (plan.kind === 'broken' && split ? ([katexHtml(split.left), katexHtml(split.right)] as const) : null), [plan.kind, split])
  const broken = halves !== null && halves[0] !== null && halves[1] !== null
  // The widths the piece wants at its full size, kept from the last time they could be measured (a piece that wraps shows a narrower width than it wants).
  const whole = useRef(0)
  const pieces = useRef<number[] | null>(null)

  // Measured before paint: what the piece measures now, divided by the scale it has, is what it wants at its full size; against the width of its box.
  useLayoutEffect(() => {
    const el = outer.current
    if (!el) return
    const box = boxOf(el)
    const room = box ? contentWidth(box) : 0
    if (room <= 0) return
    // The widths are taken once, from the piece at its full size (or the two halves the first time they are drawn), and kept: measuring a scaled piece again would
    // only add the rounding of a pixel, and a piece that wraps shows a width narrower than it wants.
    if (!plan.wrap) {
      const wants = Array.from(el.querySelectorAll<HTMLElement>('[data-fit-inner]')).map((p) => p.offsetWidth / plan.scale)
      if (wants.length === 0) return
      if (broken) {
        if (!pieces.current) pieces.current = wants
        if (!(whole.current > 0)) whole.current = wants[0]! + wants[1]!
      } else if (plan.kind === 'full' || !(whole.current > 0)) {
        whole.current = wants[0]!
      }
    }
    if (!(whole.current > 0)) return
    const canBreak = whole.current > room + 0.5 && split !== null && katexHtml(split.left) !== null && katexHtml(split.right) !== null
    const all = fitPlan(whole.current, room, canBreak)
    let next: FitPlan = all
    if (all.kind === 'broken') {
      // Each half is scaled on its own: at full size if both fit, else down to fit, 70 percent at the least. The halves are measured the first time they are drawn.
      const known = pieces.current
      if (!known) next = { kind: 'broken', scale: FIT_MIN, wrap: false }
      else {
        const fit = fitPlan(Math.max(...known), room, false)
        next = { kind: 'broken', scale: fit.kind === 'full' ? 1 : fit.scale, wrap: fit.wrap }
      }
    }
    if (!same(next, plan)) setPlan(next)
  }, [plan, tick, broken, split])

  // The box can change (a turned phone, a resized window) and the fonts of KaTeX can arrive after the first measuring: measure again.
  useEffect(() => {
    const el = outer.current
    if (!el) return
    const box = boxOf(el)
    let watcher: ResizeObserver | undefined
    if (box && typeof ResizeObserver !== 'undefined') {
      watcher = new ResizeObserver(() => setTick((t) => t + 1))
      watcher.observe(box)
    }
    void document.fonts?.ready.then(() => {
      whole.current = 0
      pieces.current = null
      setPlan(FULL)
      setTick((t) => t + 1)
    })
    return () => watcher?.disconnect()
  }, [])

  const fontSize = plan.scale === 1 ? size : Math.round(size * plan.scale * 100) / 100
  const style = { fontSize, color, whiteSpace: 'nowrap', maxWidth: '100%', display: 'inline-block' } as const
  const inner = { whiteSpace: plan.wrap ? 'normal' : 'nowrap', display: 'inline-block' } as const
  if (broken) {
    return (
      <span ref={outer} data-math="true" data-fit="true" data-plan="broken" className="jemma-math" style={{ ...style, textAlign: 'left' }}>
        <span data-fit-inner="true" data-piece="left" style={{ ...inner, display: 'block', width: 'max-content' }} dangerouslySetInnerHTML={{ __html: halves[0]! }} />
        <span data-fit-inner="true" data-piece="right" style={{ ...inner, display: 'block', width: 'max-content' }} dangerouslySetInnerHTML={{ __html: halves[1]! }} />
      </span>
    )
  }
  return (
    <span ref={outer} data-math="true" data-fit="true" data-plan={plan.kind} className="jemma-math" style={style}>
      <span data-fit-inner="true" style={inner} dangerouslySetInnerHTML={{ __html: html }} />
    </span>
  )
}
