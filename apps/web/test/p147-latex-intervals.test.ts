import { isInequalityKey, markByMeaning } from '@jemma/profiling/logic'
import { describe, expect, it } from 'vitest'
import { latexToNotation } from '../app/k/session/_parts/latex-to-notation'

// P147: what the maths editor gives for an interval, a union, a set of numbers, a pair, a circle and a plus or minus with a root becomes the plain text that
// the marking reads, and that text is marked by meaning. Pure functions: no screen, no editor.

const INF = '∞'
const CUP = '∪'
const ELEMENT = '∈'
const REALS = 'ℝ'
const NE = '≠'
const ROOT = '√'
const PM = '±'

describe('brackets, infinity, union, element of and the real numbers', () => {
  const table: [latex: string, plain: string][] = [
    ['\\left(-\\infty;3\\right]', `(-${INF}; 3]`],
    ['\\left(-\\infty,3\\right]', `(-${INF}; 3]`],
    ['(-\\infty{,}3]', `(-${INF}; 3]`],
    ['\\left[2,\\infty\\right)', `[2; ${INF})`],
    ['[2;\\infty)', `[2; ${INF})`],
    ['(1;4)', '(1; 4)'],
    ['\\left(1{,}4\\right)', '(1,4)'],
    ['\\left[-2;3\\right)', '[-2; 3)'],
    ['(-\\infty;-1)\\cup(4;\\infty)', `(-${INF}; -1) ${CUP} (4; ${INF})`],
    ['(-\\infty{,}-1)\\cup(4{,}\\infty)', `(-${INF}; -1) ${CUP} (4; ${INF})`],
    ['\\left(-\\infty,-1\\right)\\cup\\left(4,\\infty\\right)', `(-${INF}; -1) ${CUP} (4; ${INF})`],
    ['x\\in\\mathbb{R}', `x ${ELEMENT} ${REALS}`],
    ['\\mathbb{R}', REALS],
    ['x\\in(-\\infty;3]', `x ${ELEMENT} (-${INF}; 3]`],
    ['x\\ne2,x\\in\\mathbb{R}', `x ${NE} 2; x ${ELEMENT} ${REALS}`],
    ['x\\in\\mathbb{R},x\\ne2', `x ${ELEMENT} ${REALS}; x ${NE} 2`],
    ['y\\ge-4', 'y ≥ -4'],
  ]
  it.each(table)('%s', (latex, plain) => expect(latexToNotation(latex)).toBe(plain))

  it('a square bracket that only groups is still a bracket; a bracket that is not closed is not readable', () => {
    expect(latexToNotation('2\\left[x+1\\right]')).toBe('2(x + 1)')
    for (const latex of ['(1;', '\\left(1;2', '(1;4', '\\mathbb{Q}', '\\mathbb{}']) expect(latexToNotation(latex), latex).toBeNull()
  })
})

describe('a pair, a plus or minus, a circle and a line', () => {
  const table: [latex: string, plain: string][] = [
    ['x=2;y=3', 'x = 2; y = 3'],
    ['x=2,y=3', 'x = 2; y = 3'],
    ['x=2{,}y=3', 'x = 2; y = 3'],
    ['x=2\\text{ and }y=3', 'x = 2 and y = 3'],
    ['(2;3)', '(2; 3)'],
    ['x=1\\pm\\sqrt{3}', `x = 1 ${PM} ${ROOT}3`],
    ['x=\\frac{5\\pm\\sqrt{17}}{4}', `x = (5 ${PM} ${ROOT}17)/4`],
    ['x=\\frac{-1\\pm\\sqrt{5}}{2}', `x = (-1 ${PM} ${ROOT}5)/2`],
    ['\\left(x-1\\right)^2+\\left(y+2\\right)^2=9', '(x - 1)^2 + (y + 2)^2 = 9'],
    ['x^2+y^2=25', 'x^2 + y^2 = 25'],
    ['y=2x+3', 'y = 2x + 3'],
    ['y=\\frac{1}{2}x-1', 'y = 1/2x - 1'],
  ]
  it.each(table)('%s', (latex, plain) => expect(latexToNotation(latex)).toBe(plain))
})

describe('what comes out is marked by meaning, against the key written either way', () => {
  const mark = (key: string, latex: string) => markByMeaning('equation', key, latexToNotation(latex) ?? '').correct

  it('an interval for an inequality key, and the other way round', () => {
    expect(mark('x <= 3', '\\left(-\\infty;3\\right]')).toBe(true)
    expect(mark('x <= 3', '(-\\infty{,}3]')).toBe(true)
    expect(mark('x < 3', '\\left(-\\infty;3\\right]')).toBe(false)
    expect(mark('x >= 2', '[2;\\infty)')).toBe(true)
    expect(mark('x > 2', '[2;\\infty)')).toBe(false)
    expect(mark('1 < x < 4', '\\left(1{,}4\\right)')).toBe(true)
    expect(mark('1 < x < 4', '(1;4)')).toBe(true)
    expect(mark('1 <= x < 4', '(1;4)')).toBe(false)
    expect(mark('x < -1 or x > 4', '(-\\infty{,}-1)\\cup(4{,}\\infty)')).toBe(true)
    expect(mark('x < -1 or x > 4', '(-\\infty;-1)\\cup[4;\\infty)')).toBe(false)
    expect(mark(`(-${INF}; 3]`, 'x\\le3')).toBe(true)
    expect(mark(`(-${INF}; 3]`, 'x<3')).toBe(false)
    expect(mark(`(-${INF}; -1) ${CUP} (4; ${INF})`, 'x<-1\\text{ or }x>4')).toBe(true)
  })

  it('a domain and a range', () => {
    expect(mark('y >= -4', 'y\\ge-4')).toBe(true)
    expect(mark('y >= -4', 'y\\in[-4;\\infty)')).toBe(true)
    expect(mark('y >= -4', 'y>-4')).toBe(false)
    expect(mark(`x ${ELEMENT} ${REALS}`, 'x\\in\\mathbb{R}')).toBe(true)
    expect(mark(`x ${ELEMENT} ${REALS}`, '\\mathbb{R}')).toBe(true)
    expect(mark('all real numbers', 'x\\in\\mathbb{R}')).toBe(true)
    expect(mark(`x ${NE} 2`, 'x\\in\\mathbb{R},x\\ne2')).toBe(true)
    expect(mark(`x ${NE} 2`, 'x\\in\\mathbb{R}')).toBe(false)
  })

  it('a pair', () => {
    expect(mark('x = 2 and y = 3', 'x=2;y=3')).toBe(true)
    expect(mark('x = 2 and y = 3', 'y=3,x=2')).toBe(true)
    expect(mark('x = 2 and y = 3', 'x=2{,}y=3')).toBe(true)
    expect(mark('x = 2 and y = 3', '(2;3)')).toBe(true)
    expect(mark('x = 2 and y = 3', 'x=3;y=2')).toBe(false)
    expect(mark('x = 2 and y = 3', '(3;2)')).toBe(false)
  })

  it('a plus or minus with a root or a fraction', () => {
    expect(mark('x = 1 + √3 or x = 1 - √3', 'x=1\\pm\\sqrt{3}')).toBe(true)
    expect(mark(`x = 1 ${PM} ${ROOT}3`, 'x=1+\\sqrt{3}\\text{ or }x=1-\\sqrt{3}')).toBe(true)
    expect(mark(`x = (5 ${PM} ${ROOT}17)/4`, 'x=\\frac{5\\pm\\sqrt{17}}{4}')).toBe(true)
    expect(mark(`x = (5 ${PM} ${ROOT}17)/4`, 'x=\\frac{5\\pm\\sqrt{17}}{2}')).toBe(false)
    expect(mark(`x = 1 ${PM} ${ROOT}3`, 'x=1+\\sqrt{3}')).toBe(false)
  })

  it('a circle and a line, written another way', () => {
    expect(mark('(x - 1)^2 + (y + 2)^2 = 9', '\\left(x-1\\right)^2+\\left(y+2\\right)^2=9')).toBe(true)
    expect(mark('(x - 1)^2 + (y + 2)^2 = 9', 'x^2-2x+y^2+4y-4=0')).toBe(true)
    expect(mark('(x - 1)^2 + (y + 2)^2 = 9', '\\left(x-1\\right)^2+\\left(y+2\\right)^2=10')).toBe(false)
    expect(mark('x^2 + y^2 = 25', 'y^2+x^2=25')).toBe(true)
    expect(mark('x^2 + y^2 = 25', 'x^2+y^2=16')).toBe(false)
    expect(mark('y = 2x + 3', '2x-y+3=0')).toBe(true)
    expect(mark('y = 2x + 3', 'y=2x+4')).toBe(false)
  })

  it('the notation of an interval is one the marking knows as an inequality key (what the screen is told)', () => {
    expect(isInequalityKey(latexToNotation('\\left(-\\infty;3\\right]')!)).toBe(true)
    expect(isInequalityKey(latexToNotation('x=\\pm2')!)).toBe(false)
  })
})
