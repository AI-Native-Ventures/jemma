import { fireEvent, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { answerShape, answerValue, stripQuestion, type QuestionForChild } from '../app/k/session/[sessionId]/logic'

// P86, decision 4: what a learner of a senior class sees and types for the four new kinds of answer. react-dom only: no server, no browser.

const MINUS = '\u2212'
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
const show = (q: QuestionForChild) => {
  const onAnswer = vi.fn()
  const utils = render(<QuestionScreen q={q} busy={false} onAnswer={onAnswer} />)
  return { onAnswer, ...utils }
}
const html = (q: QuestionForChild) => renderToStaticMarkup(<QuestionScreen q={q} busy={false} onAnswer={() => {}} />)
const next = () => screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement
const box = (label: string) => screen.getByLabelText(label) as HTMLInputElement
const type = (label: string, value: string) => fireEvent.change(box(label), { target: { value } })
const key = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement
const keyNames = () => [...document.querySelectorAll<HTMLButtonElement>('[data-keys] button')].map((b) => b.textContent)
const reads = () => document.querySelector('[data-reads]')

const EXPRESSION = ask({ prompt: 'Simplify x + x + 3', answerKind: 'expression' })
const EQUATION = ask({ prompt: 'Solve x^2 - 2x - 3 = 0', answerKind: 'equation' })
const POINT = ask({ prompt: 'Where does the line cut the y-axis?', answerKind: 'point' })
const NUMBER = ask({ prompt: 'What is 3 - 6?', answerKind: 'number' })

describe('answerShape knows the four kinds', () => {
  it('an expression carries its form, and says any when the question did not', () => {
    expect(answerShape({ prompt: 'p', answerKind: 'expression' })).toEqual({ kind: 'expression', form: 'any' })
    expect(answerShape({ prompt: 'p', answerKind: 'expression', form: 'factorised' })).toEqual({ kind: 'expression', form: 'factorised' })
    expect(answerShape({ prompt: 'p', answerKind: 'expression', form: 'expanded' })).toEqual({ kind: 'expression', form: 'expanded' })
  })
  it('an equation, a point and a number', () => {
    expect(answerShape({ prompt: 'p', answerKind: 'equation' })).toEqual({ kind: 'equation' })
    expect(answerShape({ prompt: 'p', answerKind: 'point' })).toEqual({ kind: 'point' })
    expect(answerShape({ prompt: 'p', answerKind: 'number' })).toEqual({ kind: 'number' })
  })
  it('a prompt that looks like a missing fraction is still a question of its kind; choices still win', () => {
    expect(answerShape({ prompt: 'Complete: 3/5 = ?/15', answerKind: 'number' })).toEqual({ kind: 'number' })
    expect(answerShape({ prompt: 'p', answerKind: 'expression', choices: ['a', 'b'] })).toEqual({ kind: 'choice' })
  })
  it('the old kinds are as they were', () => {
    expect(answerShape({ prompt: 'Complete: 3/5 = ?/15', answerKind: 'fraction' }).kind).toBe('missing')
    expect(answerShape({ prompt: 'p', answerKind: 'money' })).toEqual({ kind: 'money' })
    expect(answerShape({ prompt: 'p', answerKind: 'choice' })).toEqual({ kind: 'text' })
  })
  it('stripQuestion carries the form only when there is one', () => {
    const base = { prompt: 'p', render: 'text' as const, answer: 'x', answerKind: 'expression' as const, difficulty: 1 as const, why: 'w', rightWay: 'r' }
    const at = { position: 1, phase: 'try' as const, index: 1, of: 5 }
    expect(stripQuestion({ ...base, form: 'factorised' }, at).form).toBe('factorised')
    expect(stripQuestion(base, at)).not.toHaveProperty('form')
  })
})

describe('answerValue: what is sent for the boxes', () => {
  const boxes = { whole: '', top: '', bottom: '', text: '' }
  it('an expression and an equation are sent as typed, trimmed', () => {
    expect(answerValue({ kind: 'expression', form: 'any' }, { ...boxes, text: ' 3 + 2x ' })).toBe('3 + 2x')
    expect(answerValue({ kind: 'equation' }, { ...boxes, text: 'x = 3 or x = -1' })).toBe('x = 3 or x = -1')
    expect(answerValue({ kind: 'expression', form: 'any' }, { ...boxes, text: '   ' })).toBe('')
  })
  it('an expression keeps a comma or a point at its end (it is not a number the child stopped typing)', () => {
    expect(answerValue({ kind: 'expression', form: 'any' }, { ...boxes, text: 'x + 0,' })).toBe('x + 0,')
  })
  it('a point is (x; y), and nothing while a box is empty or holds no number', () => {
    expect(answerValue({ kind: 'point' }, { ...boxes, x: '2', y: '-3' })).toBe('(2; -3)')
    expect(answerValue({ kind: 'point' }, { ...boxes, x: '2', y: '' })).toBe('')
    expect(answerValue({ kind: 'point' }, { ...boxes, x: '', y: '1' })).toBe('')
    expect(answerValue({ kind: 'point' }, { ...boxes, x: '2', y: '-' })).toBe('')
    expect(answerValue({ kind: 'point' }, { ...boxes })).toBe('')
    expect(answerValue({ kind: 'point' }, { ...boxes, x: '1,5', y: '0,' })).toBe('(1,5; 0)')
  })
  it('a number may be negative; a comma at the end and a lone minus are not an answer', () => {
    expect(answerValue({ kind: 'number' }, { ...boxes, text: '-3' })).toBe('-3')
    expect(answerValue({ kind: 'number' }, { ...boxes, text: '-3,5' })).toBe('-3,5')
    expect(answerValue({ kind: 'number' }, { ...boxes, text: '12,' })).toBe('12')
    expect(answerValue({ kind: 'number' }, { ...boxes, text: '-' })).toBe('')
    expect(answerValue({ kind: 'number' }, { ...boxes, text: '' })).toBe('')
  })
})

describe('an expression', () => {
  it('one text box for letters, with the settings of a box for algebra, and one help line', () => {
    show(EXPRESSION)
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    const input = box('Your answer')
    expect(input.getAttribute('inputmode')).toBe('text')
    expect(input.getAttribute('autocorrect')).toBe('off')
    expect(input.getAttribute('autocapitalize')).toBe('off')
    expect(input.getAttribute('spellcheck')).toBe('false')
    expect(input.getAttribute('autocomplete')).toBe('off')
    expect(input.maxLength).toBe(40)
    expect(screen.getByText('Type an expression, like 2x + 3.')).toBeTruthy()
  })

  it('one row of maths keys: x y, the little 2, the caret, two brackets, the minus and the root', () => {
    show(EXPRESSION)
    expect(keyNames()).toEqual(['x', 'y', '²', '^', '(', ')', MINUS, '√'])
    for (const b of document.querySelectorAll<HTMLButtonElement>('[data-keys] button')) {
      expect(b.type).toBe('button')
      expect(b.getAttribute('aria-label') ?? '').not.toBe('')
    }
  })

  it('the help line says the form when the question asks for one', () => {
    show({ ...EXPRESSION, form: 'factorised' })
    expect(screen.getByText('Type it as a product of brackets, like (x + 2)(x - 2).')).toBeTruthy()
    expect(screen.queryByText('Type an expression, like 2x + 3.')).toBeNull()
  })

  it('expanded: no brackets', () => {
    show({ ...EXPRESSION, form: 'expanded' })
    expect(screen.getByText('Type it with no brackets, like x² + 4x + 4.')).toBeTruthy()
  })

  it('Next waits for something, then sends the text as typed', () => {
    const { onAnswer } = show(EXPRESSION)
    expect(next().disabled).toBe(true)
    type('Your answer', '3 + 2x')
    expect(next().disabled).toBe(false)
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('3 + 2x', expect.any(Number))
  })

  it('under the keys the answer is drawn as it will be read, with a raised power', () => {
    show(EXPRESSION)
    expect(reads()).toBeNull()
    type('Your answer', '2x^2 + 7x')
    const line = reads()!
    expect(line.textContent).toContain('It reads:')
    expect(line.querySelector('sup')!.textContent).toBe('2')
  })

  it('a key puts its sign in the box where the cursor is, and the cursor stays after it', () => {
    show(EXPRESSION)
    const input = box('Your answer')
    type('Your answer', 'x+1')
    input.setSelectionRange(1, 1)
    fireEvent.click(key('squared'))
    expect(input.value).toBe('x²+1')
    expect(input.selectionStart).toBe(2)
    fireEvent.click(key('x'))
    expect(input.value).toBe('x²x+1')
    expect(input.selectionStart).toBe(3)
  })

  it('a key replaces what is selected', () => {
    show(EXPRESSION)
    const input = box('Your answer')
    type('Your answer', 'x+1')
    input.setSelectionRange(1, 2)
    fireEvent.click(key('minus'))
    expect(input.value).toBe(`x${MINUS}1`)
  })

  it('with no cursor yet a key goes at the end, and nothing goes past 40 characters', () => {
    show(EXPRESSION)
    fireEvent.click(key('x'))
    fireEvent.click(key('y'))
    expect(box('Your answer').value).toBe('xy')
    type('Your answer', 'x'.repeat(60))
    expect(box('Your answer').value).toHaveLength(40)
    fireEvent.click(key('y'))
    expect(box('Your answer').value).toHaveLength(40)
  })

  it('the keys do not take the keyboard away from the box', () => {
    show(EXPRESSION)
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    key('x').dispatchEvent(down)
    expect(down.defaultPrevented).toBe(true)
  })
})

describe('an equation', () => {
  it('the same box, the keys x = minus root or, and its help line', () => {
    show(EQUATION)
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(box('Your answer').maxLength).toBe(40)
    expect(keyNames()).toEqual(['x', '=', MINUS, '√', 'or'])
    expect(screen.getByText('Type the answer, like x = 4. Two answers: x = 3 or x = -1.')).toBeTruthy()
  })

  it('the or key puts a word between two answers', () => {
    const { onAnswer } = show(EQUATION)
    type('Your answer', 'x = 3')
    box('Your answer').setSelectionRange(5, 5)
    fireEvent.click(key('or'))
    fireEvent.click(key('x'))
    expect(box('Your answer').value).toBe('x = 3 or x')
    type('Your answer', 'x = 3 or x = -1')
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('x = 3 or x = -1', expect.any(Number))
  })
})

describe('a point', () => {
  it('a bracket, a box, a semicolon, a box and a bracket, with a minus key beside each box', () => {
    show(POINT)
    expect(screen.getAllByRole('textbox')).toHaveLength(2)
    expect(box('x of the point')).toBeTruthy()
    expect(box('y of the point')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /minus/i })).toHaveLength(2)
    const drawn = document.querySelector('[data-point]')!.textContent!.replace(/\s/g, '')
    expect(drawn.startsWith('(')).toBe(true)
    expect(drawn).toContain(';')
    expect(drawn.endsWith(')')).toBe(true)
    expect(screen.getByText('Type the x and the y of the point.')).toBeTruthy()
  })

  it('each box takes a number with a comma or a point, and a minus', () => {
    show(POINT)
    type('x of the point', 'a1,5b')
    expect(box('x of the point').value).toBe('1,5')
    type('y of the point', `${MINUS}2.5`)
    expect(box('y of the point').value).toBe('-2.5')
    type('y of the point', '3-4')
    expect(box('y of the point').value).toBe('34')
  })

  it('the minus key puts a minus in front, and takes it away again', () => {
    show(POINT)
    type('x of the point', '3')
    const [minusX] = screen.getAllByRole('button', { name: /minus/i })
    fireEvent.click(minusX!)
    expect(box('x of the point').value).toBe('-3')
    fireEvent.click(minusX!)
    expect(box('x of the point').value).toBe('3')
  })

  it('Next waits until both boxes have a number, and sends (x; y)', () => {
    const { onAnswer } = show(POINT)
    expect(next().disabled).toBe(true)
    type('x of the point', '2')
    expect(next().disabled).toBe(true)
    fireEvent.click(screen.getAllByRole('button', { name: /minus/i })[1]!)
    expect(next().disabled).toBe(true)
    type('y of the point', '3')
    expect(box('y of the point').value).toBe('3')
    expect(next().disabled).toBe(false)
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('(2; 3)', expect.any(Number))
  })

  it('a minus put in front of an empty box is not a number yet', () => {
    show(POINT)
    type('x of the point', '2')
    fireEvent.click(screen.getAllByRole('button', { name: /minus/i })[1]!)
    expect(box('y of the point').value).toBe('-')
    expect(next().disabled).toBe(true)
    type('y of the point', '-3')
    expect(next().disabled).toBe(false)
  })
})

describe('a number', () => {
  it('one box with a number keyboard that may be negative, one minus key beside it, and its help line', () => {
    show(NUMBER)
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    const input = box('Your answer')
    expect(input.getAttribute('inputmode')).toBe('decimal')
    expect(screen.getAllByRole('button', { name: /minus/i })).toHaveLength(1)
    expect(screen.getByText('Type a number. It may be negative, like -3.')).toBeTruthy()
  })

  it('the box takes a minus, a comma or a point, and nothing else', () => {
    show(NUMBER)
    type('Your answer', 'ab-3,5x')
    expect(box('Your answer').value).toBe('-3,5')
    type('Your answer', `${MINUS}3.5`)
    expect(box('Your answer').value).toBe('-3.5')
    type('Your answer', '3-5')
    expect(box('Your answer').value).toBe('35')
  })

  it('the minus key makes the number negative, and Next sends it', () => {
    const { onAnswer } = show(NUMBER)
    expect(next().disabled).toBe(true)
    type('Your answer', '3,5')
    fireEvent.click(screen.getByRole('button', { name: /minus/i }))
    expect(box('Your answer').value).toBe('-3,5')
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('-3,5', expect.any(Number))
  })

  it('a minus alone does not turn Next on', () => {
    show(NUMBER)
    fireEvent.click(screen.getByRole('button', { name: /minus/i }))
    expect(box('Your answer').value).toBe('-')
    expect(next().disabled).toBe(true)
  })
})

describe('the question itself is drawn with the notation', () => {
  it('a power in the prompt is raised, and the heading keeps the words for a screen reader', () => {
    const { container } = show(ask({ prompt: 'Simplify x^2 * x^3', answerKind: 'expression' }))
    const h1 = container.querySelector('h1[data-prompt]')!
    expect(h1.getAttribute('data-prompt')).toBe('Simplify x^2 * x^3')
    expect([...h1.querySelectorAll('sup')].map((s) => s.textContent)).toEqual(['2', '3'])
    expect(container.querySelectorAll('h1[data-prompt]')).toHaveLength(1)
  })

  it('a warm-up of a senior class is a choice, as always', () => {
    const { container } = show(ask({ phase: 'warmup', of: 2, prompt: 'What is x^2 when x = 3?', answerKind: 'choice', choices: ['6', '9', '8', '5'] }))
    expect(container.querySelectorAll('button[aria-pressed]')).toHaveLength(4)
    expect(container.querySelector('h1 sup')!.textContent).toBe('2')
  })
})

describe('rendering on the server', () => {
  it('each new kind draws its box, its keys and its help line without a browser', () => {
    expect(html(EXPRESSION)).toContain('>Your answer</label>')
    expect(html(EXPRESSION)).toContain('data-keys')
    expect(html(EXPRESSION)).toContain('Type an expression, like 2x + 3.')
    expect(html(EQUATION)).toContain('Type the answer, like x = 4. Two answers: x = 3 or x = -1.')
    expect(html(POINT)).toContain('>x of the point</label>')
    expect(html(POINT)).toContain('>y of the point</label>')
    expect(html(NUMBER)).toContain('Type a number. It may be negative, like -3.')
  })

  it('the old kinds have no keys and no new line', () => {
    for (const answerKind of ['fraction', 'mixed', 'whole', 'decimal', 'money'] as const) {
      const out = html(ask({ answerKind, prompt: 'Work it out' }))
      expect(out).not.toContain('data-keys')
      expect(out).not.toContain('data-point')
      expect(out).not.toContain('data-reads')
      expect(out).not.toContain('Type an expression')
    }
  })
})
