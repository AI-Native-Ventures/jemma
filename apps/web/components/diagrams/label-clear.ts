// P134: a label on a number line or a graph never sits on top of the numbers (or of another label). Boxes are rough: the width comes from `labelWidth`
// (the estimate that gives a fraction its box), the height from the size of the letters. Pure functions: no screen here.

export type Box = { l: number; r: number; t: number; b: number }
export type Anchor = 'start' | 'middle' | 'end'

/** The box of a text of `width` px that is drawn at (x, baseline y) with the given anchor, `up` px of it above the baseline and `down` px below. */
export function boxOf(x: number, y: number, anchor: Anchor, width: number, up: number, down: number): Box {
  const l = anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2
  return { l, r: l + width, t: y - up, b: y + down }
}

/** Do the two boxes cover some of the same ground? Boxes that only touch do not. */
export const hits = (a: Box, b: Box): boolean => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t

/** Is `box` inside `frame`? */
export const within = (box: Box, frame: Box): boolean => box.l >= frame.l && box.r <= frame.r && box.t >= frame.t && box.b <= frame.b

/** Does `box` cover ground of any of `others`? */
export const hitsAny = (box: Box, others: Box[]): boolean => others.some((o) => hits(box, o))
