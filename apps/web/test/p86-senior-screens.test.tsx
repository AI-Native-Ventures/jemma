import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { writeLine } from '../app/k/session/_parts/Paper'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { answerShape, answerValue, stripQuestion, type QuestionForChild } from '../app/k/session/[sessionId]/logic'
import { theField, theKeyboard } from './fake-mathlive'

// The maths editor is stood in for by a fake (see fake-mathlive.ts): CI's browser specs use the real one.
vi.mock('mathlive', async () => (await import('./fake-mathlive')).fakeMathlive())

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
/** The editor is there once it has been given its keyboard and the field has been set up (a laptop: the keyboard is shown by the screen, not by the field). */
const ready = async () => {
  await waitFor(() => expect(theKeyboard().layouts).toHaveLength(1))
  await waitFor(() => expect(theField().mathVirtualKeyboardPolicy).toBe('manual'))
}
/** What the child writes in the editor, as the LaTeX it gives back. */
const write = async (latex: string) => {
  await ready()
  act(() => theField().setValue(latex))
}

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
  it('one maths editor with a label for a screen reader, and one help line; no text box and no row of keys on the page', async () => {
    show(EXPRESSION)
    await ready()
    expect(screen.getByLabelText('Your answer')).toBe(theField())
    expect(theField().tagName).toBe('MATH-FIELD')
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
    expect(screen.getByText('Type an expression, like 2x + 3.')).toBeTruthy()
    expect(document.querySelector('[data-keys]')).toBeNull()
    expect(document.querySelector('[data-reads]')).toBeNull()
  })

  it('the help line says the form when the question asks for one', () => {
    show({ ...EXPRESSION, form: 'factorised' })
    expect(screen.getByText('Type it as a product of brackets, like (x + 2)(x - 2).')).toBeTruthy()
    expect(screen.queryByText('Type an expression, like 2x + 3.')).toBeNull()
  })

  it('expanded: no brackets', () => {
    show({ ...EXPRESSION, form: 'expanded' })
    expect(screen.getByText('Type it with no brackets, like x\u00b2 + 4x + 4.')).toBeTruthy()
  })

  it('Next waits for something, then sends what was written in the plain notation', async () => {
    const { onAnswer } = show(EXPRESSION)
    expect(next().disabled).toBe(true)
    await write('3+2x')
    expect(next().disabled).toBe(false)
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('3 + 2x', expect.any(Number))
  })

  it('a fraction with a top and a bottom is sent as (top)/bottom', async () => {
    const { onAnswer } = show(EXPRESSION)
    await write('\\frac{2x-3}{17}+\\frac{18+\\sin30^\\circ}{5}')
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('(2x - 3)/17 + (18 + sin(30\u00b0))/5', expect.any(Number))
  })

  it('an empty box left in the maths, or a sign Jemma cannot read, keeps Next off and a line says why when the child leaves the box', async () => {
    show(EXPRESSION)
    await write('\\frac{\\placeholder{}}{2}')
    expect(next().disabled).toBe(true)
    act(() => theField().dispatchEvent(new Event('focusout')))
    expect(screen.getByRole('status').textContent).toBe('Fill in every box, or take the empty one away.')
    await write('\\alpha')
    act(() => theField().dispatchEvent(new Event('focusout')))
    expect(screen.getByRole('status').textContent).toContain('cannot read that sign')
    expect(next().disabled).toBe(true)
    await write('x+1')
    expect(screen.queryByRole('status')).toBeNull()
    expect(next().disabled).toBe(false)
  })

  it('a step on the way (a minus sign alone) does not flash a message while the child is still writing', async () => {
    show(EXPRESSION)
    await write('x-')
    expect(next().disabled).toBe(true)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('the editor is given its keyboard, with its sound off and its fonts from this app, and the keyboard goes with the question', async () => {
    const { unmount } = show(EXPRESSION)
    await ready()
    expect((theKeyboard().layouts[0] as { id: string }).id).toBe('jemma-expression-algebra')
    expect(theField().menuItems).toEqual([])
    unmount()
    expect(theKeyboard().hide).toHaveBeenCalled()
  })

  it('on a laptop the keyboard is shown when the box is clicked, and the laptop keys still work', async () => {
    show(EXPRESSION)
    await ready()
    act(() => theField().dispatchEvent(new Event('focusin')))
    expect(theKeyboard().show).toHaveBeenCalled()
  })
})

describe('an equation', () => {
  it('the same editor, with its own help line', async () => {
    show(EQUATION)
    await ready()
    expect(screen.getByLabelText('Your answer')).toBe(theField())
    expect((theKeyboard().layouts[0] as { id: string }).id).toBe('jemma-equation-algebra')
    expect(screen.getByText('Type the answer, like x = 4. Two answers: x = 3 or x = -1.')).toBeTruthy()
  })

  it('two answers with the word between them are sent as typed: x = 3 or x = -1', async () => {
    const { onAnswer } = show(EQUATION)
    await write('x=3\\text{ or }x=-1')
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
  it('the editor too, with the help line that says it may be negative', async () => {
    show(NUMBER)
    await ready()
    expect(screen.getByLabelText('Your answer')).toBe(theField())
    expect((theKeyboard().layouts[0] as { id: string }).id).toBe('jemma-number-algebra')
    expect(screen.getByText('Type a number. It may be negative, like -3.')).toBeTruthy()
  })

  it('a negative number, a decimal comma, a fraction, a root and pi are sent in the plain notation', async () => {
    const { onAnswer } = show(NUMBER)
    expect(next().disabled).toBe(true)
    for (const [latex, plain] of [
      ['-3{,}5', '-3,5'],
      ['\\frac{3}{4}', '3/4'],
      ['2\\sqrt{2}', '2\u221a2'],
      ['\\pi', '\u03c0'],
      ['\\sqrt[3]{8}', '\u221b8'],
    ] as const) {
      await write(latex)
      expect(next().disabled, plain).toBe(false)
      fireEvent.click(next())
      expect(onAnswer).toHaveBeenLastCalledWith(plain, expect.any(Number))
    }
  })

  it('a minus alone, or a sign with no number, does not turn Next on', async () => {
    show(NUMBER)
    await write('-')
    expect(next().disabled).toBe(true)
    await write('\\sqrt{x}')
    expect(next().disabled).toBe(true)
  })
})

describe('the question itself is drawn with the notation', () => {
  it('a power in the prompt is raised, and the heading keeps the words for a screen reader', () => {
    const { container } = show(ask({ prompt: 'Simplify x^2 * x^3', answerKind: 'expression' }))
    const h1 = container.querySelector('h1[data-prompt]')!
    expect(h1.getAttribute('data-prompt')).toBe('Simplify x^2 * x^3')
    expect([...h1.querySelectorAll('.msupsub')].map((s) => s.textContent)).toEqual(['2', '3'])
    expect(container.querySelectorAll('h1[data-prompt]')).toHaveLength(1)
  })

  it('a warm-up of a senior class is a choice, as always', () => {
    const { container } = show(ask({ phase: 'warmup', of: 2, prompt: 'What is x^2 when x = 3?', answerKind: 'choice', choices: ['6', '9', '8', '5'] }))
    expect(container.querySelectorAll('button[aria-pressed]')).toHaveLength(4)
    expect(container.querySelector('h1 .msupsub')!.textContent).toBe('2')
  })
})

describe('rendering on the server', () => {
  it('each new kind draws its box and its help line without a browser: the editor is an element, the point has its two boxes', () => {
    for (const q of [EXPRESSION, EQUATION, NUMBER]) {
      const out = html(q)
      expect(out).toContain('<math-field')
      expect(out).toContain('aria-label="Your answer"')
    }
    expect(html(EXPRESSION)).toContain('Type an expression, like 2x + 3.')
    expect(html(EQUATION)).toContain('Type the answer, like x = 4. Two answers: x = 3 or x = -1.')
    expect(html(POINT)).toContain('>x of the point</label>')
    expect(html(POINT)).toContain('>y of the point</label>')
    expect(html(POINT)).not.toContain('<math-field')
    expect(html(NUMBER)).toContain('Type a number. It may be negative, like -3.')
  })

  it('the old kinds have no editor, no keys and no new line', () => {
    for (const answerKind of ['fraction', 'mixed', 'whole', 'decimal', 'money'] as const) {
      const out = html(ask({ answerKind, prompt: 'Work it out' }))
      expect(out).not.toContain('math-field')
      expect(out).not.toContain('data-keys')
      expect(out).not.toContain('data-point')
      expect(out).not.toContain('data-reads')
      expect(out).not.toContain('Type an expression')
    }
  })
})

describe('the paper sheet writes the same lines, for a pencil', () => {
  it('each new kind has its own line, and the old ones keep theirs', () => {
    expect(writeLine({ kind: 'expression', form: 'any' })).toBe('Write an expression, like 2x + 3.')
    expect(writeLine({ kind: 'expression', form: 'factorised' })).toBe('Write it as a product of brackets, like (x + 2)(x - 2).')
    expect(writeLine({ kind: 'expression', form: 'expanded' })).toBe('Write it with no brackets, like x\u00b2 + 4x + 4.')
    expect(writeLine({ kind: 'equation' })).toBe('Write the answer, like x = 4. Two answers: x = 3 or x = -1.')
    expect(writeLine({ kind: 'point' })).toBe('Write the x and the y of the point, like (2; 3).')
    expect(writeLine({ kind: 'number' })).toBe('Write a number. It may be negative, like -3.')
    expect(writeLine({ kind: 'whole' })).toBe('Write a whole number.')
    expect(writeLine({ kind: 'text' })).toBe('Write your answer.')
  })
})
