import type { GeneralSpec } from '../../schemas/lesson'
import { splitValues } from './lists'

/**
 * P180: every solution of a trig equation, from the "Type every solution" board ("Find the general solution of sin θ = 0,5."). The learner types each family
 * of solutions in a frame: an angle and how often it comes back, θ = 30° + k · 360°, and adds another family for the second angle. The answer is the angle and
 * the period of each family, in degrees, as a `list` (`30; 360; 150; 360`). Two answers are the same when their families give the same angles: 150° + k · 360°
 * is −210° + k · 360°, and 45° + k · 180° is 45° + k · 360° with 225° + k · 360°. The key is checked against the equation in the question when the lesson is
 * saved. Pure.
 */

export const GENERAL_MAX_FAMILIES = 4
/** The longest period, in degrees. */
export const GENERAL_MAX_PERIOD = 720

export type Family = { angle: number; period: number }

/** The letter of the equation: θ when the spec does not say. */
export const generalLetter = (g: GeneralSpec): string => (g.letter ?? '').trim() || 'θ'

/** Why a frame of solutions cannot be used, or null. */
export function generalProblem(g: GeneralSpec): string | null {
  const letter = generalLetter(g)
  return /^[a-zα-ω]$/i.test(letter) ? null : 'the letter of the equation is one letter, like θ or x'
}

/** The families of a key or an answer (an angle and a period for each, in order), or null when they are not numbers in pairs. */
export function familiesOf(text: string, read: (t: string) => number | null): Family[] | null {
  const values = splitValues(text).map((t) => read(t.replace(/°/g, '')))
  if (values.length === 0 || values.length % 2 !== 0 || !values.every((v): v is number => v !== null && Number.isFinite(v))) return null
  return Array.from({ length: values.length / 2 }, (_, i) => ({ angle: values[2 * i]!, period: values[2 * i + 1]! }))
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))

/** The angles of families in one turn of all their periods, in hundredths of a degree, or null when the periods are not whole hundredths or too many. */
function anglesOf(families: Family[], extra: Family[]): Set<number> | null {
  const cents = (v: number) => Math.round(v * 100)
  const periods = [...families, ...extra].map((f) => cents(f.period))
  if (periods.some((p) => p <= 0)) return null
  const turn = periods.reduce((l, p) => (l / gcd(l, p)) * p, periods[0]!)
  if (turn > 360 * 100 * 8) return null
  const out = new Set<number>()
  for (const f of families) {
    const p = cents(f.period)
    for (let j = 0; j < turn / p; j++) out.add((((cents(f.angle) + j * p) % turn) + turn) % turn)
  }
  return out
}

/** Marks every solution (typed in the frame or on paper): right when the families give the same angles as the key's. `comparable` is false when it is not pairs of numbers. */
export function markGeneral(key: string, answer: string, read: (t: string) => number | null): { correct: boolean; comparable: boolean } {
  const k = familiesOf(key, read)
  const a = familiesOf(answer, read)
  if (!k || !a) return { correct: false, comparable: false }
  if (a.some((f) => !(f.period > 0))) return { correct: false, comparable: true }
  const ka = anglesOf(k, a)
  const aa = anglesOf(a, k)
  if (!ka || !aa) return { correct: false, comparable: true }
  return { correct: ka.size === aa.size && [...ka].every((v) => aa.has(v)), comparable: true }
}

/** The solutions of an equation from 0° up to 360°, found by stepping a tenth of a degree and closing in where it crosses 0 (a jump of tan is not one). */
export function solutionsInTurn(f: (degrees: number) => number): number[] {
  const out: number[] = []
  const add = (x: number) => {
    const v = ((x % 360) + 360) % 360
    if (!out.some((r) => Math.abs(r - v) < 0.01 || Math.abs(Math.abs(r - v) - 360) < 0.01)) out.push(v)
  }
  const step = 0.1
  let x0 = 0
  let y0 = f(x0)
  for (let k = 1; k <= 3600; k++) {
    const x1 = k * step
    const y1 = f(x1)
    if (Number.isFinite(y0) && Math.abs(y0) < 1e-9) add(x0)
    else if (Number.isFinite(y0) && Number.isFinite(y1) && y0 * y1 < 0) {
      let lo = x0
      let hi = x1
      for (let n = 0; n < 60; n++) {
        const mid = (lo + hi) / 2
        const ym = f(mid)
        if (!Number.isFinite(ym)) break
        if (Math.sign(ym) === Math.sign(f(lo))) lo = mid
        else hi = mid
      }
      const root = (lo + hi) / 2
      if (Math.abs(f(root)) < 1e-6) add(root)
    }
    x0 = x1
    y0 = y1
  }
  return out.sort((a, b) => a - b)
}

/**
 * Why the key of every solution is not the solutions of the equation in the question, or null: 1 to 4 families with periods up to 720°, every angle of them a
 * solution, and every solution from 0° to 360° in one of them. `equationOf` reads the equation (meaning.ts), so this file has no cycle with it.
 */
export function generalKeyProblem(
  q: { prompt: string; answer: string; answerKind: string; general: GeneralSpec },
  read: (t: string) => number | null,
  equationOf: (text: string, letter: string) => ((degrees: number) => number) | null,
): string | null {
  if (q.answerKind !== 'list') return 'every solution has a list answer: the angle and the period of each family, in degrees'
  const families = familiesOf(q.answer, read)
  if (!families) return 'the answer is the angle and the period of each family, in degrees, with a semicolon between them'
  if (families.length > GENERAL_MAX_FAMILIES) return `the answer has 1 to ${GENERAL_MAX_FAMILIES} families`
  if (families.some((f) => !(f.period > 0) || f.period > GENERAL_MAX_PERIOD)) return `each period is more than 0° and at most ${GENERAL_MAX_PERIOD}°`
  const letter = generalLetter(q.general)
  const f = equationOf(q.prompt, letter)
  if (!f) return `the question says the equation, like sin ${letter} = 0,5`
  const roots = solutionsInTurn(f)
  if (roots.length === 0) return 'the equation has no solution'
  const on = (x: number) => roots.some((r) => Math.abs(r - (((x % 360) + 360) % 360)) < 0.01 || Math.abs(Math.abs(r - (((x % 360) + 360) % 360)) - 360) < 0.01)
  for (const fam of families) {
    for (let j = 0; j * fam.period < 360; j++) {
      const angle = fam.angle + j * fam.period
      if (!on(angle)) return `${Math.round(angle * 100) / 100}° is not a solution of the equation`
    }
  }
  const covered = (r: number) => families.some((fam) => {
    const k = (r - fam.angle) / fam.period
    return Math.abs(k - Math.round(k)) * fam.period < 0.01
  })
  const missed = roots.find((r) => !covered(r))
  if (missed !== undefined) return `the solution ${Math.round(missed * 100) / 100}° is in no family of the answer`
  return null
}

/** A question of every solution as it is saved: its list is ordered (an angle, then its period). */
export function tidyGeneral<Q extends { answerKind: string; general?: GeneralSpec; ordered?: boolean }>(q: Q): Q {
  if (!q.general || q.answerKind !== 'list') return q
  return { ...q, ordered: true }
}

/** The answer the frame makes (`30; 360; 150; 360`): every row with both boxes filled, or '' while a row has one box filled or none is. */
export function generalAnswer(rows: { angle: string; period: string }[]): string {
  const clean = (t: string) => t.replace(/°/g, '').trim()
  const used = rows.filter((r) => clean(r.angle) || clean(r.period))
  if (used.length === 0 || used.some((r) => !clean(r.angle) || !clean(r.period))) return ''
  return used.map((r) => `${clean(r.angle)}; ${clean(r.period)}`).join('; ')
}

/** Families as they are said: "θ = 30° + k · 360° or θ = 150° + k · 360°", with a decimal comma. */
export function generalText(families: Family[], letter: string): string {
  const n = (v: number) => {
    const r = Math.round(v * 100) / 100
    return (r < 0 ? `−${String(-r)}` : String(r)).replace('.', ',')
  }
  return families.map((f) => `${letter} = ${n(f.angle)}° + k · ${n(f.period)}°`).join(' or ')
}
