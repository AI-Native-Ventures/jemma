import { describe, expect, test } from 'vitest'
import { fractionsIn, missingPart } from '../../src/logic'

describe('missingPart', () => {
  test('the top is missing: "Complete: 3/5 = ?/15"', () => {
    expect(missingPart('Complete: 3/5 = ?/15')).toEqual({ unknown: 'top', known: '15' })
  })

  test('the bottom is missing: "1/2 = 2/?"', () => {
    expect(missingPart('1/2 = 2/?')).toEqual({ unknown: 'bottom', known: '2' })
  })

  test('spaces around the slash, in either order', () => {
    expect(missingPart('Complete: 3/5 = ? / 15')).toEqual({ unknown: 'top', known: '15' })
    expect(missingPart('Complete: 3/5 = 6 / ?')).toEqual({ unknown: 'bottom', known: '6' })
    expect(missingPart('Complete: 3/5 = ?/ 15')).toEqual({ unknown: 'top', known: '15' })
  })

  test('underscores, an empty box character and three dots count as the missing part', () => {
    expect(missingPart('Fill in: 1/4 = __/8')).toEqual({ unknown: 'top', known: '8' })
    expect(missingPart('Fill in: 1/4 = 2/___')).toEqual({ unknown: 'bottom', known: '2' })
    expect(missingPart('Fill in: 1/4 = □/8')).toEqual({ unknown: 'top', known: '8' })
    expect(missingPart('Fill in: 1/4 = 2/☐')).toEqual({ unknown: 'bottom', known: '2' })
    expect(missingPart('Fill in: 1/4 = .../8')).toEqual({ unknown: 'top', known: '8' })
    expect(missingPart('Fill in: 1/4 = 2/…')).toEqual({ unknown: 'bottom', known: '2' })
  })

  test('a sentence mark after the fraction is not part of it', () => {
    expect(missingPart('Is 2/3 the same as ?/6?')).toEqual({ unknown: 'top', known: '6' })
  })

  test('two unknown parts: no single missing number', () => {
    expect(missingPart('Fill in ?/?')).toBeNull()
    expect(missingPart('Complete: ?/5 = 6/?')).toBeNull()
    expect(missingPart('Complete: 1/? = ?/4')).toBeNull()
  })

  test('two fractions where only one has an unknown part: that one', () => {
    expect(missingPart('2/3 = 4/6 = ?/12')).toEqual({ unknown: 'top', known: '12' })
  })

  test('no fraction with an unknown part', () => {
    expect(missingPart('What is 3/5 of 20?')).toBeNull()
    expect(missingPart('1/2 + 1/4')).toBeNull()
    expect(missingPart('Which fraction is bigger: 1/2 or 1/4?')).toBeNull()
    expect(missingPart('')).toBeNull()
  })

  test('a missing number that is not in a fraction is not a missing part', () => {
    expect(missingPart('5 + ? = 12')).toBeNull()
    expect(missingPart('Fill in ___ + 3 = 8')).toBeNull()
  })

  test('km/h, other letters over letters and dates are not fractions', () => {
    expect(missingPart('A car goes 60 km/h. How far in ? hours')).toBeNull()
    expect(missingPart('Speed is ?/h')).toBeNull()
    expect(missingPart('On 12/11/2026 it was ?')).toBeNull()
    expect(missingPart('On 2026/11/14 it was ?/')).toBeNull()
  })
})

describe('fractionsIn', () => {
  const show = (text: string) => fractionsIn(text).map((f) => [f.top, f.bottom])

  test('digits over digits, as before', () => {
    expect(show('What is 1/2 plus 1/4?')).toEqual([['1', '2'], ['1', '4']])
    expect(show('Write 3/4.')).toEqual([['3', '4']])
    expect(show('(3/4)')).toEqual([['3', '4']])
  })

  test('an unknown part is null, wherever it is written', () => {
    expect(show('3/5 = ?/15')).toEqual([['3', '5'], [null, '15']])
    expect(show('3 / ?')).toEqual([['3', null]])
    expect(show('__/8')).toEqual([[null, '8']])
    expect(show('?/?')).toEqual([[null, null]])
  })

  test('says where each fraction sits in the text', () => {
    const text = 'Complete: 3/5 = ?/15'
    const [a, b] = fractionsIn(text)
    expect(text.slice(a!.index, a!.index + a!.length)).toBe('3/5')
    expect(text.slice(b!.index, b!.index + b!.length)).toBe('?/15')
  })

  test('digits with spaces around the slash are a sum, not a fraction', () => {
    expect(show('Work out 12 / 4')).toEqual([])
  })

  test('km/h, a date and words over words stay text', () => {
    expect(show('60 km/h')).toEqual([])
    expect(show('12/11/2026')).toEqual([])
    expect(show('2026/11/14')).toEqual([])
    expect(show('and/or')).toEqual([])
  })
})
