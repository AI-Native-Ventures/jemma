import { numberIn, type Notation } from './notation'

/**
 * P198: angles in radians, for a class in the US, from the "Radians" board ("Sketch y = sin x for 0 ≤ x ≤ 2π.", "Find all solutions of sin x = 1/2."). Jemma keeps
 * the angles of a trig grid in degrees and writes them in π; the general solution of a trig equation is typed and kept in radians, and turned into degrees to
 * be marked by the same rules as one in degrees. Pure.
 */

/** The longest bottom of a fraction of π that is written as one (π/12); an angle that is no such fraction is written as a decimal. */
const MOST_PARTS = 12

/** An angle in degrees written in radians: 0, π/2, 3π/4, 2π, −π/6 (a true minus sign); a decimal to 3 places when it is not a fraction of π up to π/12. */
export function piText(degrees: number, notation: Notation = 'us'): string {
  if (Math.abs(degrees) < 1e-9) return '0'
  for (let b = 1; b <= MOST_PARTS; b++) {
    const a = (degrees * b) / 180
    if (Math.abs(a - Math.round(a)) < 1e-9) {
      const top = Math.abs(Math.round(a))
      const sign = a < 0 ? '−' : ''
      const pi = top === 1 ? 'π' : `${top}π`
      return `${sign}${b === 1 ? pi : `${pi}/${b}`}`
    }
  }
  const r = Math.round(((degrees * Math.PI) / 180) * 1000) / 1000
  return r < 0 ? `−${numberIn(-r, notation)}` : numberIn(r, notation)
}

/** How often a family comes back, as k times it: kπ, 2kπ, 2kπ/3; k · 1.047 when the period is no fraction of π. */
export function periodText(degrees: number, notation: Notation = 'us'): string {
  const text = piText(degrees, notation)
  if (!text.includes('π')) return `k · ${text}`
  const [top, bottom] = text.split('/')
  const times = top === 'π' ? '' : top!.replace('π', '')
  return `${times}kπ${bottom ? `/${bottom}` : ''}`
}

/** A reader of a value in radians (π/6, 2π, 0.524) that gives it in degrees, or null. */
export const inDegreesFrom =
  (read: (t: string) => number | null) =>
  (t: string): number | null => {
    const v = read(t)
    return v === null ? null : (v * 180) / Math.PI
  }

/** Does a value say π (typed with the key, or as pi)? */
export const saysPi = (t: string): boolean => /π|pi/i.test(t)

/**
 * The reader of an x of a trig grid marked in π: an x written with π (`π/2`) is radians, given in degrees (90); any other value is read as it is (`90`, and every
 * y). So the key of a sketch in radians may give its x in either.
 */
export const gridReader =
  (read: (t: string) => number | null) =>
  (t: string): number | null =>
    saysPi(t) ? inDegreesFrom(read)(t) : read(t)
