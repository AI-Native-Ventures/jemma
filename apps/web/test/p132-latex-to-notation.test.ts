import { markByMeaning, readMath } from '@jemma/profiling/logic'
import { describe, expect, it } from 'vitest'
import { latexToNotation } from '../app/k/session/_parts/latex-to-notation'

// P132: the LaTeX of the maths editor becomes the plain notation that is marked and stored. Pure function: no screen, no editor.

const D = '°'
const TIMES = '×'
const DIVIDE = '÷'
const ROOT = '√'
const CUBE = '∛'
const PI = 'π'
const THETA = 'θ'

describe('fractions: the fewest brackets that keep the meaning', () => {
  const table: [latex: string, plain: string][] = [
    ['\\frac{x}{2}', 'x/2'],
    ['\\frac{3}{4}', '3/4'],
    ['\\frac{2x}{3}', '2x/3'],
    ['\\frac{x}{2}+6=10', 'x/2 + 6 = 10'],
    ['\\frac{x+1}{2}', '(x + 1)/2'],
    ['\\frac{1}{x+1}', '1/(x + 1)'],
    ['\\frac{a}{2b}', 'a/(2b)'],
    ['\\frac{2x-3}{17}+\\frac{18+\\sin30^\\circ}{5}', `(2x - 3)/17 + (18 + sin(30${D}))/5`],
    ['\\frac{\\frac{1}{2}}{3}', '1/2/3'],
    ['\\frac{1}{2}\\div\\frac{1}{3}', `1/2 ${DIVIDE} (1/3)`],
    ['-\\frac{3}{4}', '-3/4'],
    ['\\dfrac{x}{2}', 'x/2'],
  ]
  it.each(table)('%s', (latex, plain) => expect(latexToNotation(latex)).toBe(plain))
})

describe('powers and roots', () => {
  const table: [latex: string, plain: string][] = [
    ['x^2', 'x^2'],
    ['x^{2}', 'x^2'],
    ['x^{10}', 'x^10'],
    ['2^{x}', '2^x'],
    ['x^{n+1}', 'x^(n + 1)'],
    ['x^{-1}', 'x^(-1)'],
    ['x^{\\frac{1}{2}}', 'x^(1/2)'],
    ['\\left(x+1\\right)^{2}', '(x + 1)^2'],
    ['\\sqrt{x}', `${ROOT}x`],
    ['\\sqrt{48}', `${ROOT}48`],
    ['\\sqrt{x+1}', `${ROOT}(x + 1)`],
    ['2\\sqrt{2}', `2${ROOT}2`],
    ['\\sqrt{x^{2}+1}', `${ROOT}(x^2 + 1)`],
    ['\\sqrt[3]{8}', `${CUBE}8`],
    ['\\sqrt[3]{x+1}', `${CUBE}(x + 1)`],
    ['\\sqrt[2]{9}', `${ROOT}9`],
    ['\\sqrt[4]{x}', '(x)^(1/4)'],
  ]
  it.each(table)('%s', (latex, plain) => expect(latexToNotation(latex)).toBe(plain))
})

describe('trigonometry, pi, theta and degrees', () => {
  const table: [latex: string, plain: string][] = [
    ['\\sin\\left(30^\\circ\\right)', `sin(30${D})`],
    ['\\sin30^\\circ', `sin(30${D})`],
    ['\\sin 30^{\\circ}', `sin(30${D})`],
    ['\\cos x', 'cos(x)'],
    ['\\tan\\left(\\theta\\right)', `tan(${THETA})`],
    ['\\sin^{2}x', 'sin^2(x)'],
    ['\\sin^2\\left(x\\right)+\\cos^2\\left(x\\right)', 'sin^2(x) + cos^2(x)'],
    ['2\\sin x\\cos x', '2sin(x)cos(x)'],
    ['\\sin2x', 'sin(2x)'],
    ['\\pi r^2', `${PI}r^2`],
    ['2\\pi r', `2${PI}r`],
    ['\\theta=30^\\circ', `${THETA} = 30${D}`],
    ['\\pi', PI],
  ]
  it.each(table)('%s', (latex, plain) => expect(latexToNotation(latex)).toBe(plain))
})

describe('the four operations, equals, brackets, signs, decimals', () => {
  const table: [latex: string, plain: string][] = [
    ['2x-3', '2x - 3'],
    ['3\\times4', `3 ${TIMES} 4`],
    ['3\\cdot4', `3 ${TIMES} 4`],
    ['6\\div3', `6 ${DIVIDE} 3`],
    ['2x\\times3', `2x ${TIMES} 3`],
    ['(x+2)(x+3)', '(x + 2)(x + 3)'],
    ['\\left(x+2\\right)\\left(x-2\\right)', '(x + 2)(x - 2)'],
    ['3\\left(x+1\\right)', '3(x + 1)'],
    ['-3', '-3'],
    ['3.5', '3.5'],
    ['3{,}5', '3,5'],
    ['0{,}25+1{,}5', '0,25 + 1,5'],
    ['15\\%', '15%'],
    ['x=3\\text{ or }x=-1', 'x = 3 or x = -1'],
    ['x=\\pm2', 'x = ±2'],
    ['x\\leq3', 'x ≤ 3'],
    ['x\\neq0', 'x ≠ 0'],
    ['f\\left(x\\right)=2x+1', 'f(x) = 2x + 1'],
    ['f^{\\prime}\\left(x\\right)=6x', 'f′(x) = 6x'],
    ['\\frac{dy}{dx}=6x', 'dy/dx = 6x'],
    ['\\frac{d}{dx}=2', 'd/dx = 2'],
    ['R12{,}50', 'R12,50'],
  ]
  it.each(table)('%s', (latex, plain) => expect(latexToNotation(latex)).toBe(plain))
})

describe('what cannot be read', () => {
  it('an empty field is the empty answer', () => {
    expect(latexToNotation('')).toBe('')
    expect(latexToNotation('   ')).toBe('')
  })

  it('an empty box left in the maths, or a sign Jemma has no use for, is null: the answer is not finished or not readable', () => {
    for (const latex of ['\\placeholder{}', '\\frac{\\placeholder{}}{2}', '\\frac{1}{', '\\alpha', 'x_1', '\\int x', '\\left|x\\right|', '\\sqrt', '\\frac{1}{2}}']) {
      expect(latexToNotation(latex), latex).toBeNull()
    }
  })
})

describe('what comes out is read by the marking, by meaning', () => {
  const mark = (kind: 'number' | 'expression' | 'equation', key: string, latex: string) => markByMeaning(kind, key, latexToNotation(latex) ?? '').correct

  it('the owner\'s example: (2x - 3)/17 + (18 + sin 30)/5', () => {
    const plain = latexToNotation('\\frac{2x-3}{17}+\\frac{18+\\sin30^\\circ}{5}')!
    expect(readMath(plain)).not.toBeNull()
    expect(mark('expression', `(2x-3)/17 + (18+0,5)/5`, '\\frac{2x-3}{17}+\\frac{18+\\sin30^\\circ}{5}')).toBe(true)
    expect(mark('expression', `(2x-3)/17 + (18+0,5)/5`, '\\frac{2x-3}{17}+\\frac{18+\\sin40^\\circ}{5}')).toBe(false)
    expect(plain.length).toBeLessThanOrEqual(60)
  })

  it('fractions, roots, powers, trigonometry and equations', () => {
    expect(mark('expression', 'x/2 + 3', '3+\\frac{x}{2}')).toBe(true)
    expect(mark('expression', '(x+1)/(x-1)', '\\frac{x+1}{x-1}')).toBe(true)
    expect(mark('expression', '(x+1)/(x-1)', '\\frac{x+1}{x}-1')).toBe(false)
    expect(mark('expression', 'x^2', 'x^{2}')).toBe(true)
    expect(mark('expression', 'sin(x)^2 + cos(x)^2', '\\sin^2x+\\cos^2x')).toBe(true)
    expect(mark('number', '2', '\\sqrt[3]{8}')).toBe(true)
    expect(mark('number', '-2', '\\sqrt[3]{-8}')).toBe(true)
    expect(mark('number', '2', '\\sqrt[3]{9}')).toBe(false)
    expect(mark('number', '2', '\\sqrt[4]{16}')).toBe(true)
    expect(mark('number', '0,5', '\\sin\\left(30^\\circ\\right)')).toBe(true)
    expect(mark('number', '3,75', '3\\frac{3}{4}')).toBe(false)
    expect(mark('number', `2${ROOT}2`, '\\sqrt{8}')).toBe(true)
    expect(mark('number', '1/6', '\\frac{1}{2}\\div3')).toBe(true)
    expect(mark('number', '3/2', '\\frac{1}{2}\\div\\frac{1}{3}')).toBe(true)
    expect(mark('number', '1/6', '\\frac{1}{2}\\div\\frac{1}{3}')).toBe(false)
    expect(mark('number', '-3,5', '-3{,}5')).toBe(true)
    expect(mark('equation', 'x = 3 or x = -1', 'x=-1\\text{ or }x=3')).toBe(true)
    expect(mark('equation', 'x = 2 or x = -2', 'x=\\pm2')).toBe(true)
    expect(mark('expression', '6x', 'f^{\\prime}\\left(x\\right)=6x')).toBe(true)
    expect(mark('expression', '6x', '\\frac{dy}{dx}=6x')).toBe(true)
  })
})
