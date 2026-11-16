import { describe, expect, test } from 'vitest'
import { markByMeaning, readMath } from '../../src/logic'

// P132: the cube root sign and the word cbrt, for the answers the maths editor makes. No database, no model.

const CUBE = '∛'
const ROOT = '√'
const mark = (kind: 'number' | 'expression', key: string, answer: string) => markByMeaning(kind, key, answer).correct

describe('the cube root', () => {
  const table: ['number' | 'expression', string, string, boolean][] = [
    ['number', '2', `${CUBE}8`, true],
    ['number', '3', `${CUBE}(27)`, true],
    ['number', '-2', `${CUBE}(-8)`, true],
    ['number', '-2', `-${CUBE}8`, true],
    ['number', '2', 'cbrt(8)', true],
    ['number', '0,5', `${CUBE}(1/8)`, true],
    ['number', `2${CUBE}2`, `${CUBE}16`, true],
    ['number', '2', `${CUBE}9`, false],
    ['number', '2', `${ROOT}8`, false],
    ['number', '3', `${CUBE}9`, false],
    ['number', '2', `${CUBE}`, false],
    ['number', '2', 'cbrt', false],
    ['expression', `${CUBE}x`, 'cbrt(x)', true],
    ['expression', `${CUBE}(x+1)`, `${CUBE}(1+x)`, true],
    ['expression', `${CUBE}(x+1)`, `${CUBE}x+1`, false],
    ['expression', `${CUBE}(x^3)`, 'x', true],
    ['expression', `${CUBE}x`, `${ROOT}x`, false],
  ]
  test.each(table)('%s key %j answer %j is right: %s', (kind, key, answer, right) => {
    expect(mark(kind, key, answer)).toBe(right)
  })

  test('the reader gives a root node with the cube flag, and a square root has none', () => {
    expect(readMath(`${CUBE}8`)).toMatchObject({ t: 'sqrt', cube: true })
    expect(readMath(`${ROOT}8`)).toEqual({ t: 'sqrt', a: { t: 'num', v: 8, raw: '8' } })
    expect(readMath(`2${CUBE}x`)).toMatchObject({ t: 'mul' })
  })
})
