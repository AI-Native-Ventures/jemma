import { describe, expect, it } from 'vitest'
import { CAPS, keyboardLayout, keyName, layerId, ROW_WIDTH, rowUnits, type Keycap, type KeyboardLayer } from '../app/k/session/_parts/math-keyboard'
import type { TypedKind } from '../app/k/session/_parts/maths-keys'

// P147: the Compare tab has the keys an interval, a set of numbers and a domain need: [ ] ∞ ∪ ∈ ℝ, in the row that used to be blank. Pure functions.

const BLANK = '[separator]'
const kinds: TypedKind[] = ['number', 'expression', 'equation']
const compare = (kind: TypedKind): KeyboardLayer => keyboardLayout({ kind, prompt: 'Solve 2x + 1 <= 7' }).layers.find((l) => l.id === layerId('compare'))!
const names = (row: (string | Keycap)[]) => row.map((k) => keyName(k as never))

describe('the Compare tab', () => {
  it('row 5 has the square brackets, the semicolon, infinity, union, element of and the real numbers, then blanks', () => {
    for (const kind of kinds) {
      const row = compare(kind).rows[4]!
      expect(names(row), kind).toEqual(['open square bracket', 'close square bracket', 'semicolon', 'infinity', 'union', 'element of', 'the real numbers', BLANK, BLANK, BLANK])
    }
  })

  it('each key types its sign: the editor draws it and the reader of the marking knows it', () => {
    expect(CAPS.openSquare.latex).toBe('[')
    expect(CAPS.closeSquare.latex).toBe(']')
    expect(CAPS.semicolon.latex).toBe(';')
    expect(CAPS.infinity.latex).toBe('\\infty')
    expect(CAPS.union.latex).toBe('\\cup')
    expect(CAPS.element.latex).toBe('\\in')
    expect(CAPS.reals.latex).toBe('\\mathbb{R}')
  })

  it('the tab is still six rows of ten units, so it is as tall and as wide as every other tab (the P140 size rules)', () => {
    for (const kind of kinds) {
      const layer = compare(kind)
      expect(layer.rows).toHaveLength(6)
      expect(ROW_WIDTH).toBe(10)
      layer.rows.forEach((row, i) => expect(rowUnits(row), `${kind} row ${i + 1}`).toBe(10))
    }
  })

  it('row 4 is as it was, and no key is on the tab twice', () => {
    const row4 = names(compare('equation').rows[3]!)
    expect(row4).toEqual(['less than', 'greater than', 'less than or equal to', 'greater than or equal to', 'not equal to', 'plus or minus', 'absolute value', 'percent', 'rand', BLANK])
    for (const kind of kinds) {
      const found = compare(kind).rows.flatMap(names).filter((n) => n !== BLANK && n !== 'backspace')
      expect(new Set(found).size, kind).toBe(found.length)
    }
  })

  it('a number answer sees the same keys; none of them is a letter', () => {
    expect(names(compare('number').rows[4]!)).toEqual(names(compare('equation').rows[4]!))
    for (const kind of kinds) expect(compare(kind).rows.flatMap(names).filter((n) => n.startsWith('the letter'))).toEqual([])
  })
})
