import { fireEvent, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { MathPreview } from '../app/k/session/_parts/MathPreview'
import { keyColumns, keyGrid, QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { keySet, numberChars, pressKey, strandOf, toggleSign, KEYS, type TypedKind } from '../app/k/session/_parts/maths-keys'
import { answerValue, type QuestionForChild } from '../app/k/session/[sessionId]/logic'

// P125: the keys under the answer box fit the question's strand and kind, and the preview draws what the keys type. react-dom only: no server, no
// browser, no database.

const MINUS = '−'
const PI = 'π'
const THETA = 'θ'
const DEG = '°'
const ROOT = '√'
const faces = (set: { text: string }[]) => set.map((k) => k.text)

const ask = (over: Partial<QuestionForChild>): QuestionForChild => ({
  position: 3,
  phase: 'try',
  index: 1,
  of: 5,
  prompt: 'Work it out',
  render: 'text',
  answerKind: 'whole',
  ...over,
})
const show = (q: QuestionForChild, topic?: string) => {
  const onAnswer = vi.fn()
  const utils = render(<QuestionScreen q={q} topic={topic} busy={false} onAnswer={onAnswer} />)
  return { onAnswer, ...utils }
}
const html = (q: QuestionForChild, topic?: string) => {
  const el = document.createElement('div')
  el.innerHTML = renderToStaticMarkup(<QuestionScreen q={q} topic={topic} busy={false} onAnswer={() => {}} />)
  return el
}
const keyNames = (root: ParentNode = document) => [...root.querySelectorAll<HTMLButtonElement>('[data-keys] button')].map((b) => b.textContent)
const box = () => screen.getByLabelText('Your answer') as HTMLInputElement
const type = (value: string) => fireEvent.change(box(), { target: { value } })
const key = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement
const preview = (text: string) => {
  const el = document.createElement('div')
  el.innerHTML = renderToStaticMarkup(<MathPreview text={text} size={22} rule={2} gap={3} side={3} />)
  return el
}

/** What is drawn, without the plain words that are there for a screen reader. */
const hidden = (el: Element) => el.querySelector('[aria-hidden="true"]')!.textContent
const drawn = (text: string) => hidden(preview(text))

const TRIG = ask({ prompt: 'Work out sin(30°)', answerKind: 'number' })
const ALGEBRA = ask({ prompt: 'Simplify x + x + 3', answerKind: 'expression' })

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

describe('the key set of each strand and kind', () => {
  const kinds: TypedKind[] = ['number', 'expression', 'equation']
  const strands = ['algebra', 'trigonometry', 'functions', 'calculus', 'finance', 'data'] as const
  const prompts = {
    algebra: 'Simplify x + x + 3',
    trigonometry: 'Work out sin 30',
    functions: 'Find the gradient of the line',
    calculus: 'Differentiate y = 3x^2',
    finance: 'How much interest is that?',
    data: 'What is the median?',
  }

  it('no set has a key twice, and each panel is at most ten keys: two even rows of five at most', () => {
    for (const kind of kinds) {
      for (const strand of strands) {
        const { keys, more } = keySet({ kind, prompt: prompts[strand] })
        const all = [...keys, ...more].map((k) => k.label)
        expect(new Set(all).size, `${kind} ${strand}`).toBe(all.length)
        expect(keys.length, `${kind} ${strand} keys`).toBeLessThanOrEqual(10)
        expect(more.length, `${kind} ${strand} more`).toBeLessThanOrEqual(10)
        expect(keyColumns(keys.length), `${kind} ${strand} columns`).toMatch(/^grid-cols-[1-5]$/)
        expect(keyColumns(more.length), `${kind} ${strand} more columns`).toMatch(/^grid-cols-[1-5]$/)
        for (const k of [...keys, ...more]) {
          expect(k.label.length, `${kind} ${strand} ${k.text}`).toBeGreaterThan(0)
          expect(k.insert.length).toBeGreaterThan(0)
        }
      }
    }
  })

  it('every set has a way to type a negative, a fraction and a root, in view or behind More', () => {
    for (const kind of kinds) {
      for (const strand of strands) {
        const { keys, more } = keySet({ kind, prompt: prompts[strand] })
        const all = faces([...keys, ...more])
        expect(all, `${kind} ${strand}`).toContain(MINUS)
        expect(all, `${kind} ${strand}`).toContain('a/b')
        expect(all, `${kind} ${strand}`).toContain(ROOT)
      }
    }
  })

  it('algebra: x and y, the little 2, the power, the fraction, brackets, minus, plus and the root in view; times, divide, pi and the comma behind More', () => {
    const { keys, more } = keySet({ kind: 'expression', prompt: prompts.algebra })
    expect(faces(keys)).toEqual(['x', 'y', '²', '^', 'a/b', '(', ')', MINUS, '+', ROOT])
    expect(faces(more)).toEqual(['×', '÷', PI, ','])
  })

  it('trigonometry: sin, cos, tan, theta, the degree sign and pi in view, on an expression', () => {
    const { keys } = keySet({ kind: 'expression', prompt: prompts.trigonometry })
    expect(faces(keys).slice(0, 6)).toEqual(['sin', 'cos', 'tan', THETA, DEG, PI])
  })

  it('trigonometry: a number answer has sin, cos, tan, the degree sign and pi, and no letter of algebra', () => {
    const { keys, more } = keySet({ kind: 'number', prompt: prompts.trigonometry })
    expect(faces(keys).slice(0, 5)).toEqual(['sin', 'cos', 'tan', DEG, PI])
    expect(faces([...keys, ...more])).not.toContain('x')
    expect(faces([...keys, ...more])).not.toContain('y')
  })

  it('trigonometry: an equation has theta, the degree sign and pi, and sin, cos and tan behind More', () => {
    const { keys, more } = keySet({ kind: 'equation', prompt: prompts.trigonometry })
    expect(faces(keys)).toEqual(expect.arrayContaining([THETA, '=', DEG, PI, 'or']))
    expect(faces(more)).toEqual(expect.arrayContaining(['sin', 'cos', 'tan']))
  })

  it('functions: f(x) is a key, and so are the semicolon and the brackets', () => {
    const { keys, more } = keySet({ kind: 'expression', prompt: prompts.functions })
    const all = faces([...keys, ...more])
    expect(all).toEqual(expect.arrayContaining(['f(x)', ';', '(', ')']))
  })

  it('calculus: d/dx and f prime of x, only on a question that asks for a derivative', () => {
    const asked = faces(keySet({ kind: 'expression', prompt: prompts.calculus }).keys)
    expect(asked).toEqual(expect.arrayContaining(['d/dx', 'f′(x)']))
    const notAsked = faces([...keySet({ kind: 'expression', topic: 'Calculus', prompt: 'Work out the limit' }).keys, ...keySet({ kind: 'expression', topic: 'Calculus', prompt: 'Work out the limit' }).more])
    expect(notAsked).not.toContain('d/dx')
    expect(notAsked).not.toContain('f′(x)')
  })

  it('finance and data: the percent sign and the rand sign', () => {
    for (const strand of ['finance', 'data'] as const) {
      const { keys, more } = keySet({ kind: 'number', prompt: prompts[strand] })
      expect(faces([...keys, ...more]), strand).toEqual(expect.arrayContaining(['%', 'R']))
    }
  })

  it('an equation of any strand has the equals key and "or"', () => {
    for (const strand of strands) {
      const all = faces([...keySet({ kind: 'equation', prompt: prompts[strand] }).keys, ...keySet({ kind: 'equation', prompt: prompts[strand] }).more])
      expect(all, strand).toEqual(expect.arrayContaining(['=', 'or']))
    }
  })

  it('a root and a function put their bracket in and leave the cursor between them', () => {
    expect(KEYS.root).toMatchObject({ insert: `${ROOT}()`, back: 1 })
    expect(KEYS.sin).toMatchObject({ insert: 'sin()', back: 1 })
    expect(KEYS.cos).toMatchObject({ insert: 'cos()', back: 1 })
    expect(KEYS.tan).toMatchObject({ insert: 'tan()', back: 1 })
    expect(KEYS.fraction).toMatchObject({ insert: '/' })
  })
})

describe('pressKey: where the sign goes and where the cursor ends', () => {
  it('a root puts its brackets in and the cursor inside', () => {
    expect(pressKey('2', 1, 1, KEYS.root, 40)).toEqual({ text: `2${ROOT}()`, caret: 3 })
  })
  it('the fraction key puts a slash in and the cursor after it', () => {
    expect(pressKey('3', 1, 1, KEYS.fraction, 40)).toEqual({ text: '3/', caret: 2 })
  })
  it('the close bracket steps over the one a root put there', () => {
    expect(pressKey(`${ROOT}(8)`, 3, 3, KEYS.close, 40)).toEqual({ text: `${ROOT}(8)`, caret: 4 })
  })
  it('the close bracket still closes a bracket that was opened inside a root', () => {
    expect(pressKey(`${ROOT}((x+1)`, 8, 8, KEYS.close, 40)).toEqual({ text: `${ROOT}((x+1))`, caret: 9 })
  })
  it('a selection is replaced; nothing goes past the longest answer', () => {
    expect(pressKey('x+1', 1, 2, KEYS.minus, 40)).toEqual({ text: `x${MINUS}1`, caret: 2 })
    expect(pressKey('x'.repeat(40), 40, 40, KEYS.x, 40)).toBeNull()
  })
  it('numberChars keeps what a number may hold, and toggleSign flips a minus of either kind', () => {
    expect(numberChars(`3 ${MINUS} 5`, 40)).toBe(`3 ${MINUS} 5`)
    expect(numberChars('#?3,5!', 40)).toBe('3,5')
    expect(numberChars(`sin(30${DEG})`, 40)).toBe(`sin(30${DEG})`)
    expect(numberChars(`2${PI}`, 40)).toBe(`2${PI}`)
    expect(toggleSign('3', 40)).toBe('-3')
    expect(toggleSign('-3', 40)).toBe('3')
    expect(toggleSign(`${MINUS}3`, 40)).toBe('3')
  })
})

describe('the answer box draws the right keys', () => {
  it('a trigonometry question shows sin, cos and tan, and an algebra question shows x and y (server render)', () => {
    const trig = keyNames(html(TRIG))
    expect(trig).toEqual(expect.arrayContaining(['sin', 'cos', 'tan', DEG, PI]))
    expect(trig).not.toContain('x')
    const algebra = keyNames(html(ALGEBRA))
    expect(algebra).toEqual(expect.arrayContaining(['x', 'y']))
    expect(algebra).not.toContain('sin')
  })

  it('the topic of the lesson counts too: the same words, a trigonometry topic', () => {
    expect(keyNames(html(ALGEBRA, 'Trigonometry'))).toEqual(expect.arrayContaining(['sin', 'cos', 'tan']))
    expect(keyNames(html(ALGEBRA))).not.toContain('sin')
  })

  it('every key has a name for a screen reader and is a button that is not a submit', () => {
    for (const q of [TRIG, ALGEBRA, ask({ answerKind: 'equation', prompt: 'Solve x^2 = 4' })]) {
      for (const b of html(q).querySelectorAll<HTMLButtonElement>('[data-keys] button')) {
        expect(b.type).toBe('button')
        expect(b.getAttribute('aria-label') ?? '').not.toBe('')
      }
    }
  })

  it('each key is at least 48 px wide and tall, has no fixed height, and a long face is smaller', () => {
    const page = html(TRIG)
    for (const b of page.querySelectorAll<HTMLButtonElement>('[data-keys] button')) {
      expect(b.classList.contains('min-h-12'), b.textContent ?? '').toBe(true)
      expect(b.classList.contains('min-w-12')).toBe(true)
      expect([...b.classList].filter((c) => /^h-/.test(c))).toEqual([])
    }
    const sin = [...page.querySelectorAll<HTMLButtonElement>('[data-keys] button')].find((b) => b.textContent === 'sin')!
    expect(sin.classList.contains('text-[18px]')).toBe(true)
  })

  it('the keys are in a grid of five columns, four on a phone under 350 px, so a key is 48 px or more and the page does not slide sideways', () => {
    /** The width of the row: the screen leaves 20 px at each side, the question card 19 px (18 and its border), the row has 8 px between keys. */
    const keyWidth = (phone: number, columns: number) => (Math.min(360, phone - 40 - 38) - 8 * (columns - 1)) / columns
    for (const q of [TRIG, ALGEBRA]) {
      const row = html(q).querySelector('[data-keys]')!
      expect(row.classList.contains('grid-cols-5')).toBe(true)
      expect(row.classList.contains('max-[349px]:grid-cols-4')).toBe(true)
      expect(keyWidth(390, 5)).toBeGreaterThanOrEqual(48)
      expect(keyWidth(360, 5)).toBeGreaterThanOrEqual(44)
      expect(keyWidth(350, 5)).toBeGreaterThanOrEqual(48)
      expect(keyWidth(349, 4)).toBeGreaterThanOrEqual(48)
      expect(keyWidth(320, 4)).toBeGreaterThanOrEqual(48)
    }
  })

  it('keyGrid: up to eight keys keep the grid they had, nine and ten get the narrow phone rule', () => {
    expect([4, 5, 8].map(keyGrid)).toEqual(['grid-cols-4', 'grid-cols-5', 'grid-cols-4'])
    expect([9, 10].map(keyGrid)).toEqual(['grid-cols-5 max-[349px]:grid-cols-4', 'grid-cols-5 max-[349px]:grid-cols-4'])
  })

  it('More keys is a button with room, closed at first, and opens the rest in a second grid of its own', () => {
    show(ALGEBRA)
    const toggle = key('More keys')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(toggle.classList.contains('min-h-12')).toBe(true)
    expect([...toggle.classList].some((c) => /^px-(\d)$/.test(c) && Number(c.slice(3)) >= 5)).toBe(true)
    expect(document.querySelector('[data-keys-more]')).toBeNull()
    fireEvent.click(toggle)
    expect(key('Fewer keys').getAttribute('aria-expanded')).toBe('true')
    const more = [...document.querySelectorAll<HTMLButtonElement>('[data-keys-more] button')].map((b) => b.textContent)
    expect(more).toEqual(['×', '÷', PI, ','])
    // The first grid is the same ten keys as before it opened.
    expect(keyNames()).toHaveLength(10)
    fireEvent.click(key('Fewer keys'))
    expect(document.querySelector('[data-keys-more]')).toBeNull()
  })

  it('a key from behind More types its sign, and the toggle does not take the keyboard away', () => {
    show(ALGEBRA)
    fireEvent.click(key('More keys'))
    fireEvent.click(key('pi'))
    expect(box().value).toBe(PI)
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    key('Fewer keys').dispatchEvent(down)
    expect(down.defaultPrevented).toBe(true)
  })
})

describe('typing with the keys', () => {
  it('sin puts its brackets in, the cursor sits inside, and the close key steps over the bracket (a trigonometry number)', () => {
    const { onAnswer } = show(TRIG)
    fireEvent.click(key('sine'))
    expect(box().value).toBe('sin()')
    expect(box().selectionStart).toBe(4)
    type(`sin(30)`)
    box().setSelectionRange(6, 6)
    fireEvent.click(key('degrees'))
    expect(box().value).toBe(`sin(30${DEG})`)
    fireEvent.click(key('close bracket'))
    expect(box().value).toBe(`sin(30${DEG})`)
    expect(box().selectionStart).toBe(`sin(30${DEG})`.length)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onAnswer).toHaveBeenCalledWith(`sin(30${DEG})`, expect.any(Number))
  })

  it('the root key and the fraction key (an algebra expression)', () => {
    show(ALGEBRA)
    fireEvent.click(key('square root'))
    expect(box().value).toBe(`${ROOT}()`)
    expect(box().selectionStart).toBe(2)
    type('3')
    box().setSelectionRange(1, 1)
    fireEvent.click(key('fraction'))
    expect(box().value).toBe('3/')
    expect(box().selectionStart).toBe(2)
  })

  it('a number box takes the signs of its keys, the number pad stays, and the minus key still flips the sign', () => {
    show(TRIG)
    expect(box().getAttribute('inputmode')).toBe('decimal')
    type(`2${PI}`)
    expect(box().value).toBe(`2${PI}`)
    fireEvent.click(screen.getByRole('button', { name: 'Minus sign' }))
    expect(box().value).toBe(`-2${PI}`)
    fireEvent.click(screen.getByRole('button', { name: 'Minus sign' }))
    expect(box().value).toBe(`2${PI}`)
  })

  it('Next waits for a digit or pi in a number answer; a lone sign or word is not an answer', () => {
    show(TRIG)
    const next = () => screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement
    type(ROOT)
    expect(next().disabled).toBe(true)
    type('sin')
    expect(next().disabled).toBe(true)
    type(PI)
    expect(next().disabled).toBe(false)
    type('1/2')
    expect(next().disabled).toBe(false)
  })

  it('answerValue sends a number answer with its signs as typed', () => {
    const boxes = { whole: '', top: '', bottom: '', text: '' }
    expect(answerValue({ kind: 'number' }, { ...boxes, text: `${ROOT}8` })).toBe(`${ROOT}8`)
    expect(answerValue({ kind: 'number' }, { ...boxes, text: ` 2${PI} ` })).toBe(`2${PI}`)
    expect(answerValue({ kind: 'number' }, { ...boxes, text: 'pi/2' })).toBe('pi/2')
    expect(answerValue({ kind: 'number' }, { ...boxes, text: ROOT })).toBe('')
    expect(answerValue({ kind: 'number' }, { ...boxes, text: '-' })).toBe('')
  })
})

describe('the line "It reads:"', () => {
  it('a fraction is stacked, in a number and in an expression, with or without brackets', () => {
    const plain = preview('3/4')
    expect(plain.querySelectorAll('span.inline-flex')).toHaveLength(1)
    const brackets = preview('(x+1)/(x-1)')
    expect(brackets.querySelectorAll('span.inline-flex')).toHaveLength(1)
    expect(brackets.textContent).not.toContain('((')
    const flex = brackets.querySelector('span.inline-flex')!
    expect(flex.textContent).toBe(`x + 1x ${MINUS} 1`)
  })

  it('a root has the radical with a line over what is under it, and a root of a bracket does not draw the bracket', () => {
    const root = preview(`${ROOT}(x+1)`)
    expect(root.querySelector('[data-root]')).not.toBeNull()
    expect(root.querySelector('[data-radicand]')!.textContent).toBe('x + 1')
    expect(preview('sqrt(8)').querySelector('[data-radicand]')!.textContent).toBe('8')
  })

  it('a power is raised, and sin squared has its 2 after the name', () => {
    expect(preview('x^2').querySelector('sup')!.textContent).toBe('2')
    expect(preview('x³').querySelector('sup')!.textContent).toBe('3')
    const trig = preview('sin^2(x)')
    expect(trig.querySelector('[data-fn="sin"]')).not.toBeNull()
    expect(trig.querySelector('sup')!.textContent).toBe('2')
    expect(hidden(trig)).toBe('sin2(x)')
  })

  it('sin, cos and tan are upright, with their brackets even when the answer had none', () => {
    const sin = preview('sin 30°')
    const name = sin.querySelector('[data-fn="sin"]') as HTMLElement
    expect(name.style.fontStyle).toBe('normal')
    expect(hidden(sin)).toBe(`sin(30${DEG})`)
    expect(drawn('cos x')).toBe('cos(x)')
    expect(preview('tan(45)').querySelector('[data-fn="tan"]')).not.toBeNull()
  })

  it('pi is drawn as the pi sign, a degree sign stays, a minus is a minus sign', () => {
    expect(drawn('2pi r')).toBe(`2${PI}r`)
    expect(drawn(`${PI}r^2`)).toBe(`${PI}r2`)
    expect(drawn('30°')).toBe(`30${DEG}`)
    expect(drawn('-3')).toBe(`${MINUS}3`)
    expect(drawn('x - 1')).toBe(`x ${MINUS} 1`)
  })

  it('a number keeps the digits as they were typed, a product with a sign keeps it, one without a sign has none', () => {
    expect(drawn('0,50')).toBe('0,50')
    expect(drawn('2*3')).toBe('2 × 3')
    expect(drawn('3(x+1)')).toBe('3(x + 1)')
  })

  it('an equation is drawn piece by piece: each side of the equals sign and each answer', () => {
    const line = preview(`x = 1/2 or x = ${ROOT}2`)
    expect(line.querySelectorAll('span.inline-flex')).toHaveLength(1)
    expect(line.querySelectorAll('[data-root]')).toHaveLength(1)
    expect(line.textContent).toContain(' = ')
    expect(line.textContent).toContain(' or ')
    expect(drawn('x = 3; x = 4')).toBe('x = 3; x = 4')
  })

  it('text that does not read yet is drawn the way it always was, and the plain words go to a screen reader', () => {
    const partial = preview('2x^')
    expect(partial.textContent).toContain('2x^')
    const line = preview('3/4')
    expect(line.querySelector('.sr-only')!.textContent).toBe('3/4')
    expect(line.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })

  it('under the box: an expression always has it, a plain number does not, a number with signs does', () => {
    show(TRIG)
    expect(document.querySelector('[data-reads]')).toBeNull()
    type('-3,5')
    expect(document.querySelector('[data-reads]')).toBeNull()
    type(`${ROOT}8`)
    expect(document.querySelector('[data-reads] [data-root]')).not.toBeNull()
    expect(document.querySelector('[data-reads]')!.textContent).toContain('It reads:')
  })
})
