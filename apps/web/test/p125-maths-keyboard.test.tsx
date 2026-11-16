import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MathPreview } from '../app/k/session/_parts/MathPreview'
import { strandOf } from '../app/k/session/_parts/maths-keys'

// P125: what a senior question is about decides its topic keys (since P132 on the maths editor's keyboard, see p132-math-editor.test.tsx), and the line
// "It reads:" draws what was written. react-dom only: no server, no browser, no database.

const MINUS = '\u2212'
const PI = '\u03c0'
const ROOT = '\u221a'

const preview = (text: string) => {
  const el = document.createElement('div')
  el.innerHTML = renderToStaticMarkup(<MathPreview text={text} size={22} rule={2} gap={3} side={3} />)
  return el
}
/** What is drawn, without the plain words that are there for a screen reader. */
const hidden = (el: Element) => (el.querySelector('[aria-hidden="true"]')!.textContent ?? '').replace(/\u200b/g, '')
const drawn = (text: string) => hidden(preview(text))

describe('the strand of a question', () => {
  const table: [topic: string | undefined, prompt: string, strand: ReturnType<typeof strandOf>][] = [
    ['Trigonometry', 'Work out the length of the side', 'trigonometry'],
    [undefined, 'Work out sin(30°)', 'trigonometry'],
    [undefined, 'Solve cos x = 0,5 for x between 0 and 90 degrees', 'trigonometry'],
    [undefined, 'What is tan 45?', 'trigonometry'],
    ['Functions and graphs', 'Where does the line cut the y-axis?', 'functions'],
    [undefined, 'Find the gradient of the line through (1; 2) and (3; 6)', 'functions'],
    [undefined, 'Write f(x) = 2x + 1 for x = 3', 'functions'],
    [undefined, 'Differentiate y = 3x^2', 'calculus'],
    [undefined, 'Find the derivative of x^3', 'calculus'],
    [undefined, "Find f′(x) if f(x) = x^2", 'calculus'],
    ['Calculus', 'Work out the limit of 1/x', 'algebra'],
    ['Finance and growth', 'How much interest in one year?', 'finance'],
    [undefined, 'A shirt costs R200. After a 15% discount, what is the price?', 'finance'],
    ['Statistics', 'What is the median of 3, 5, 9?', 'data'],
    [undefined, 'What is the probability of a head?', 'data'],
    [undefined, 'Find the size of angle x.', 'geometry'],
    ['Geometry', 'Prove that the two triangles are congruent', 'geometry'],
    [undefined, 'Find the area of a circle with radius 5 cm', 'geometry'],
    [undefined, 'Find the size of angle x if sin x = 0,5', 'trigonometry'],
    ['Algebra', 'Simplify x + x + 3', 'algebra'],
    [undefined, 'Factorise x^2 - 4', 'algebra'],
    ['Equivalent fractions', 'What is 3 - 6?', 'algebra'],
  ]
  it.each(table)('%s | %s is %s', (topic, prompt, strand) => {
    expect(strandOf(topic, prompt)).toBe(strand)
  })

  it('a derivative wins over trigonometry (differentiate sin x), trigonometry over graphs', () => {
    expect(strandOf(undefined, 'Differentiate y = sin x')).toBe('calculus')
    expect(strandOf('Functions and graphs', 'Draw y = sin x')).toBe('trigonometry')
  })
})

describe('the line "It reads:" (KaTeX, P125b)', () => {
  it('a fraction is stacked, in a number and in an expression, with or without brackets', () => {
    expect(preview('3/4').querySelectorAll('.mfrac')).toHaveLength(1)
    const brackets = preview('(x+1)/(x-1)')
    expect(brackets.querySelectorAll('.mfrac')).toHaveLength(1)
    expect(hidden(brackets)).not.toContain('(')
    // KaTeX writes the bottom of a fraction first in its markup.
    expect(hidden(brackets)).toBe(`x${MINUS}1x+1`)
  })

  it('a root has the radical with a line over what is under it, and a root of a bracket does not draw the bracket', () => {
    const root = preview(`${ROOT}(x+1)`)
    expect(root.querySelector('.sqrt')).not.toBeNull()
    expect(hidden(root)).not.toContain('(')
    expect(preview('sqrt(8)').querySelector('.sqrt')).not.toBeNull()
  })

  it('a power is raised, and sin squared has its 2 after the name', () => {
    expect(preview('x^2').querySelector('.msupsub')!.textContent).toBe('2')
    expect(preview('x³').querySelector('.msupsub')!.textContent).toBe('3')
    const trig = preview('sin^2(x)')
    expect(trig.querySelector('.mop')!.textContent).toContain('sin')
    expect(trig.querySelector('.msupsub')!.textContent).toBe('2')
  })

  it('sin, cos and tan are upright names, with their brackets even when the answer had none', () => {
    const sin = preview('sin 30°')
    expect(sin.querySelector('.mop')!.textContent).toBe('sin')
    expect(hidden(sin)).toBe(`sin(30∘)`)
    expect(hidden(preview('cos x'))).toBe('cos(x)')
    expect(preview('tan(45)').querySelector('.mop')!.textContent).toBe('tan')
  })

  it('pi is drawn as the pi sign, a degree sign stays, a minus is a minus sign', () => {
    expect(hidden(preview('2pi r'))).toBe(`2${PI}r`)
    expect(hidden(preview(`${PI}r^2`))).toBe(`${PI}r2`)
    expect(hidden(preview('30°'))).toBe('30∘')
    expect(hidden(preview('-3'))).toBe(`${MINUS}3`)
    expect(hidden(preview('x - 1'))).toBe(`x${MINUS}1`)
    expect(hidden(preview('x = 3'))).toBe('x=3')
  })

  it('a number keeps its decimal comma, a product with a sign keeps it, a division sign is not made a fraction', () => {
    expect(hidden(preview('0,50'))).toBe('0,50')
    expect(hidden(preview('2*3'))).toBe('2×3')
    expect(hidden(preview('3(x+1)'))).toBe('3(x+1)')
    const divide = preview('6÷3')
    expect(divide.querySelectorAll('.mfrac')).toHaveLength(0)
    expect(hidden(divide)).toBe('6÷3')
  })

  it('an equation is drawn piece by piece: each side of the equals sign and each answer, and the word between them stays a word', () => {
    const line = preview(`x = 1/2 or x = ${ROOT}2`)
    expect(line.querySelectorAll('.mfrac')).toHaveLength(1)
    expect(line.querySelectorAll('.sqrt')).toHaveLength(1)
    expect(hidden(line)).toContain(' or ')
    expect(hidden(preview('x = 3; x = 4'))).toBe('x=3; x=4')
  })

  it('text that does not read yet is drawn the way it was typed, and the plain words go to a screen reader', () => {
    const partial = preview('2x^')
    expect(partial.querySelector('.katex')).toBeNull()
    expect(partial.textContent).toContain('2x^')
    const line = preview('3/4')
    expect(line.querySelector('.sr-only')!.textContent).toBe('3/4')
    expect(line.querySelector('[aria-hidden="true"]')).not.toBeNull()
    expect(line.querySelector('.katex')).not.toBeNull()
  })
})
