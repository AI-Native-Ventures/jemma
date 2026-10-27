export type Rational = { n: bigint; d: bigint }

export type Parsed =
  | { kind: 'number'; value: Rational }
  | { kind: 'money'; value: Rational }
  | { kind: 'choice'; letter: string }
  | { kind: 'text'; text: string }

const VULGAR: Record<string, string> = {
  '½': '1/2',
  '⅓': '1/3',
  '⅔': '2/3',
  '¼': '1/4',
  '¾': '3/4',
  '⅕': '1/5',
  '⅖': '2/5',
  '⅗': '3/5',
  '⅘': '4/5',
  '⅙': '1/6',
  '⅚': '5/6',
  '⅛': '1/8',
  '⅜': '3/8',
  '⅝': '5/8',
  '⅞': '7/8',
}

const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? a : gcd(b, a % b))

function rational(n: bigint, d: bigint): Rational | null {
  if (d === 0n) return null
  const g = gcd(n < 0n ? -n : n, d < 0n ? -d : d) || 1n
  return { n: n / g, d: d / g }
}

function parseNumber(s: string): Rational | null {
  let m = /^(\d+)\s+(\d+)\/(\d+)$/.exec(s)
  if (m) {
    const d = BigInt(m[3]!)
    return rational(BigInt(m[1]!) * d + BigInt(m[2]!), d)
  }
  m = /^(\d+)\/(\d+)$/.exec(s)
  if (m) return rational(BigInt(m[1]!), BigInt(m[2]!))
  m = /^(\d*)[.,](\d+)$/.exec(s)
  if (m) return rational(BigInt((m[1] || '0') + m[2]!), 10n ** BigInt(m[2]!.length))
  if (/^\d+$/.test(s)) return rational(BigInt(s), 1n)
  return null
}

const squash = (s: string) => s.trim().replace(/\s+/g, ' ')

export function parseAnswer(raw: string): Parsed {
  let s = raw.replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, (c, i: number, all: string) => {
    const before = all.slice(0, i)
    return (/\d$/.test(before) ? ' ' : '') + VULGAR[c]!
  })
  s = squash(s)
  const choice = /^\(?([a-d])\)?\.?$/i.exec(s)
  if (choice) return { kind: 'choice', letter: choice[1]!.toUpperCase() }
  const money = /^r\s*(.+)$/i.exec(s)
  if (money) {
    const v = parseNumber(squash(money[1]!))
    if (v) return { kind: 'money', value: v }
  }
  const v = parseNumber(s)
  if (v) return { kind: 'number', value: v }
  return { kind: 'text', text: squash(raw) }
}

const normText = (s: string) => squash(s).toLowerCase()

export function markAnswer(read: string, key: string): { correct: boolean; comparable: boolean } {
  const a = parseAnswer(read)
  const b = parseAnswer(key)
  if (a.kind === 'text' || b.kind === 'text') {
    const same = normText(read) === normText(key)
    return { correct: same, comparable: same }
  }
  if (a.kind === 'choice' || b.kind === 'choice') {
    return { correct: a.kind === 'choice' && b.kind === 'choice' && a.letter === b.letter, comparable: true }
  }
  return { correct: a.value.n === b.value.n && a.value.d === b.value.d, comparable: true }
}

/** Pairs of handwritten characters that are easy to misread for each other. */
const CONFUSABLE: Record<string, string[]> = {
  '0': ['6', '8'], '6': ['0', '8', '5', 'b'], '8': ['0', '6', '3', 'B'], '3': ['8'], '1': ['7'], '7': ['1'],
  '5': ['6', 'S'], 'S': ['5'], '4': ['9'], '9': ['4'], 'b': ['6'], 'B': ['8'],
}

/**
 * True when a wrong answer would be right if one easily misread character were read the other way
 * ("0,8" for a key of "0,6"). Such answers go to Needs you instead of being marked wrong with confidence.
 */
export function oneConfusableAway(read: string, key: string): boolean {
  if (markAnswer(read, key).correct) return false
  for (let i = 0; i < read.length; i++) {
    for (const alt of CONFUSABLE[read[i]!] ?? []) {
      const candidate = read.slice(0, i) + alt + read.slice(i + 1)
      if (markAnswer(candidate, key).correct) return true
    }
  }
  return false
}
