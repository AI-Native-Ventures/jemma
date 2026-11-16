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
    for (const latex of ['\\placeholder{}', '\\frac{\\placeholder{}}{2}', '\\frac{1}{', '\\aleph', '\\text{hello}', '\\sqrt', '\\frac{1}{2}}', '\\left(x', '\\left|x\\right)']) {
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

// ---- P132b: the keys of the tabs ----------------------------------------------------------------------------------------------

describe('e, ln, log, the inverse functions, |x| and Greek letters', () => {
  const table: [latex: string, plain: string][] = [
    ['\\mathrm{e}', 'e'],
    ['\\mathrm{e}^{x}', 'e^x'],
    ['2\\mathrm{e}^{x}', '2e^x'],
    ['\\mathrm{e}^{2x}', 'e^(2x)'],
    ['\\mathrm{e}x', 'e × x'],
    ['x\\mathrm{e}', 'x × e'],
    ['\\ln\\left(x\\right)', 'ln(x)'],
    ['\\ln x', 'ln(x)'],
    ['\\ln\\left(\\mathrm{e}^{2}\\right)', 'ln(e^2)'],
    ['\\log\\left(100\\right)', 'log(100)'],
    ['\\log x', 'log(x)'],
    ['\\sin^{-1}\\left(0{,}5\\right)', 'asin(0,5)'],
    ['\\cos^{-1}\\left(\\frac{1}{2}\\right)', 'acos(1/2)'],
    ['\\tan^{-1}\\left(1\\right)', 'atan(1)'],
    ['\\sin^{-1}x', 'asin(x)'],
    ['\\left|x\\right|', 'abs(x)'],
    ['\\left|x-3\\right|', 'abs(x - 3)'],
    ['\\left|-5\\right|', 'abs(-5)'],
    ['\\alpha+\\beta', 'α + β'],
    ['\\alpha=30^\\circ', 'α = 30°'],
    ['\\gamma', 'γ'],
    ['\\delta x', 'δx'],
  ]
  it.each(table)('%s', (latex, plain) => expect(latexToNotation(latex)).toBe(plain))

  it('a little 2 on sin is a square, not the inverse', () => {
    expect(latexToNotation('\\sin^{2}x')).toBe('sin^2(x)')
    expect(latexToNotation('\\ln^{2}x')).toBe('ln^2(x)')
  })
})

describe('the relations', () => {
  const table: [latex: string, plain: string][] = [
    ['x<3', 'x < 3'],
    ['x>3', 'x > 3'],
    ['x\\le3', 'x ≤ 3'],
    ['x\\ge3', 'x ≥ 3'],
    ['x\\leq3', 'x ≤ 3'],
    ['x\\ne0', 'x ≠ 0'],
    ['-2<x\\le5', '-2 < x ≤ 5'],
    ['x<-1\\text{ or }x>4', 'x < -1 or x > 4'],
    ['x>1\\text{ and }x<5', 'x > 1 and x < 5'],
    ['x=\\pm\\sqrt{2}', 'x = ±√2'],
    ['y\\pm3', 'y ± 3'],
  ]
  it.each(table)('%s', (latex, plain) => expect(latexToNotation(latex)).toBe(plain))
})

describe('the signs of geometry and calculus are kept as typed (the marking cannot mark them yet), and thin spaces are left out', () => {
  const table: [latex: string, plain: string][] = [
    ['\\angle ABC=40^\\circ', '∠ABC = 40°'],
    ['\\triangle ABC\\cong\\triangle DEF', '△ABC ≅ △DEF'],
    ['AB\\parallel CD', 'AB ∥ CD'],
    ['AB\\perp CD', 'AB ⊥ CD'],
    ['\\triangle ABC\\sim\\triangle DEF', '△ABC ∼ △DEF'],
    ['\\infty', '∞'],
    ['\\int x\\,dx', '∫xdx'],
    ['\\int_{0}^{1}x', '∫_0^1x'],
    ['\\lim_{x\\to0}\\frac{\\sin x}{x}', 'lim_(x → 0)(sin(x)/x)'],
    ['\\sum_{n=1}^{5}n', 'Σ_(n = 1)^5n'],
    ['x_{1}+x_{2}', 'x_1 + x_2'],
    ['3\\,5', '3 × 5'],
  ]
  it.each(table)('%s', (latex, plain) => expect(latexToNotation(latex)).toBe(plain))
})

describe('what the new keys type is marked by meaning', () => {
  const mark = (kind: 'number' | 'expression' | 'equation', key: string, latex: string) => markByMeaning(kind, key, latexToNotation(latex) ?? '').correct

  it('e, ln, log, the inverse functions and |x|', () => {
    expect(mark('number', '1', '\\ln\\left(\\mathrm{e}\\right)')).toBe(true)
    expect(mark('number', '2', '\\log\\left(100\\right)')).toBe(true)
    expect(mark('number', '30', '\\sin^{-1}\\left(0{,}5\\right)')).toBe(true)
    expect(mark('number', '60', '\\cos^{-1}\\left(\\frac{1}{2}\\right)')).toBe(true)
    expect(mark('number', '45', '\\tan^{-1}\\left(1\\right)')).toBe(true)
    expect(mark('number', '0,5', '\\sin^{-1}\\left(0{,}5\\right)')).toBe(false)
    expect(mark('number', '3', '\\left|-3\\right|')).toBe(true)
    expect(mark('expression', 'e^x', '\\mathrm{e}^{x}')).toBe(true)
    expect(mark('expression', '2e^x', '2\\mathrm{e}^{x}')).toBe(true)
    expect(mark('expression', 'ln(x)', '\\ln x')).toBe(true)
    expect(mark('expression', 'abs(x)', '\\left|-x\\right|')).toBe(true)
    expect(mark('expression', 'abs(x)', 'x')).toBe(false)
  })

  it('the relations and plus or minus', () => {
    expect(mark('equation', 'x <= 3', 'x\\le3')).toBe(true)
    expect(mark('equation', 'x <= 3', 'x<3')).toBe(false)
    expect(mark('equation', '3 > x', 'x<3')).toBe(true)
    expect(mark('equation', '-2 < x <= 5', '-2<x\\le5')).toBe(true)
    expect(mark('equation', 'x != 0', 'x\\ne0')).toBe(true)
    expect(mark('equation', 'x < -1 or x > 4', 'x>4\\text{ or }x<-1')).toBe(true)
    expect(mark('equation', 'x = 2 or x = -2', 'x=\\pm2')).toBe(true)
    expect(mark('equation', 'α = 30', '\\alpha=30^\\circ')).toBe(true)
  })

  it('a sign the marking cannot read is not marked right, whatever it is compared with', () => {
    expect(mark('expression', 'x', '\\int x\\,dx')).toBe(false)
    expect(mark('number', '1', '\\lim_{x\\to0}\\frac{\\sin x}{x}')).toBe(false)
    expect(mark('number', '15', '\\sum_{n=1}^{5}n')).toBe(false)
    expect(mark('equation', 'α = 40', '\\angle ABC=40^\\circ')).toBe(false)
  })
})

// ---- Arguments without braces (a paste, or the editor's ascii-math input): one token, as TeX reads it -------------------------------

describe('an argument without braces is the one token after the command', () => {
  const table: [latex: string, plain: string][] = [
    ['5\\sqrt2', '5√2'],
    ['\\sqrt2', '√2'],
    ['\\sqrt x', '√x'],
    ['\\sqrt\\pi', '√π'],
    ['\\sqrt[3]8', '∛8'],
    ['\\sqrt[3]x', '∛x'],
    ['\\sqrt[4]2', '(2)^(1/4)'],
    ['6\\sqrt2', '6√2'],
    ['\\frac12', '1/2'],
    ['\\frac34', '3/4'],
    ['\\frac{1}2', '1/2'],
    ['\\frac1{x}', '1/x'],
    ['\\frac1{x+1}', '1/(x + 1)'],
    ['\\frac xy', 'x/y'],
    ['\\frac\\pi2', 'π/2'],
    ['\\frac{x+1}2', '(x + 1)/2'],
    ['\\frac12+\\frac13', '1/2 + 1/3'],
    ['x^2', 'x^2'],
    ['x^23', 'x^2 × 3'],
    ['x^n', 'x^n'],
    ['2^\\pi', '2^π'],
    ['x_1', 'x_1'],
    ['\\sin^2x', 'sin^2(x)'],
  ]
  it.each(table)('%s', (latex, plain) => expect(latexToNotation(latex)).toBe(plain))

  it('an argument that is missing is still not readable', () => {
    for (const latex of ['\\frac1', '\\frac', '\\sqrt', '\\sqrt[3]', '\\frac{1}', '\\frac\\int2']) expect(latexToNotation(latex), latex).toBeNull()
  })

  it('and it is marked by meaning', () => {
    const mark = (kind: 'number' | 'expression', key: string, latex: string) => markByMeaning(kind, key, latexToNotation(latex) ?? '').correct
    expect(mark('number', '5√2', '5\\sqrt2')).toBe(true)
    expect(mark('number', '√50', '5\\sqrt2')).toBe(true)
    expect(mark('number', '6√2', '5\\sqrt2')).toBe(false)
    expect(mark('number', '0,5', '\\frac12')).toBe(true)
    expect(mark('number', '2', '\\sqrt[3]8')).toBe(true)
    expect(mark('number', '3', '\\sqrt[3]8')).toBe(false)
    expect(mark('expression', 'x^2', 'x^2')).toBe(true)
  })
})
