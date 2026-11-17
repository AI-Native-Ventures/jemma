import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { buildAnswers, equationCountHint, MULTI_HINT, valueOfBox } from '../app/k/session/_parts/answers/MultiAnswer'
import { PaperSheet, writeLine } from '../app/k/session/_parts/Paper'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { answerShape, answerValue, stripQuestion, type QuestionForChild } from '../app/k/session/[sessionId]/logic'
import { fakeMathlive, theKeyboard } from './fake-mathlive'

// P146: an equation with two answers or more has one box for each ("Answer 1", "Answer 2", up to four), sent as "x = 3 or x = 2". The count comes from the
// key on the server and nothing but the count and the letter reaches the screen. react-dom only: no server, no browser, no database. The maths editor is
// stood in for by a fake (see fake-mathlive.ts).
// Two boxes start the editor in the same moment, so the stand-in is built at once (a synchronous factory): the real editor is one module that both get.
vi.mock('mathlive', () => fakeMathlive())

const ask = (over: Partial<QuestionForChild>): QuestionForChild => ({
  position: 3,
  phase: 'try',
  index: 1,
  of: 5,
  prompt: 'Solve x^2 - 5x + 6 = 0',
  render: 'text',
  answerKind: 'equation',
  ...over,
})
const TWO = ask({ answerCount: 2, answerLetter: 'x' })
const show = (q: QuestionForChild) => {
  const onAnswer = vi.fn()
  const utils = render(<QuestionScreen q={q} busy={false} onAnswer={onAnswer} />)
  return { onAnswer, ...utils }
}
const next = () => screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement
const fields = () => Array.from(document.querySelectorAll('math-field')) as unknown as (HTMLElement & { setValue: (latex: string) => void })[]
/** Every box of the question has its editor started (the keyboard is given once for each). */
const ready = async (boxes: number) => {
  await waitFor(() => expect(fields().filter((f) => f.getAttribute('data-ready') === 'true')).toHaveLength(boxes))
  expect(theKeyboard().layouts.length).toBeGreaterThan(0)
}
/** What the child writes in box n (1 based), as the LaTeX the editor gives back. */
const write = (n: number, latex: string) => act(() => fields()[n - 1]!.setValue(latex))
const html = (q: QuestionForChild) => renderToStaticMarkup(<QuestionScreen q={q} busy={false} onAnswer={() => {}} />)

describe('stripQuestion: the count and the letter go to the screen, the values never do', () => {
  const base = { prompt: 'Solve x^2 - 5x + 6 = 0', render: 'text' as const, answerKind: 'equation' as const, difficulty: 2 as const, why: 'w', rightWay: 'r' }
  const at = { position: 1, phase: 'try' as const, index: 1, of: 5 }
  const strip = (answer: string, over: object = {}) => stripQuestion({ ...base, answer, ...over }, at)

  it('two values: answerCount 2 and the letter', () => {
    const q = strip('x = 2 or x = 3')
    expect(q.answerCount).toBe(2)
    expect(q.answerLetter).toBe('x')
  })

  it('one value is 1, three values are 3, a plus or minus is 2', () => {
    expect(strip('x = 5').answerCount).toBe(1)
    expect(strip('x = 1 or x = 2 or x = 3').answerCount).toBe(3)
    expect(strip('x = ±2').answerCount).toBe(2)
  })

  it('never carries a value of the key, in any field', () => {
    for (const answer of ['x = 7919 or x = 4242', 'x = ±6173', 'x = 1234 or x = 5678 or x = 9012', 'x > 8675']) {
      const sent = JSON.stringify(strip(answer, { why: 'because 7919', rightWay: 'use 4242' }))
      for (const digits of answer.match(/\d+/g)!) expect(sent, answer).not.toContain(digits)
      expect(sent).not.toContain('"answer"')
      expect(sent).not.toContain('"why"')
      expect(sent).not.toContain('"rightWay"')
    }
    // the only new fields are the count and the letter
    expect(Object.keys(strip('x = 2 or x = 3')).sort()).toEqual(['answerCount', 'answerKind', 'answerLetter', 'index', 'of', 'phase', 'position', 'prompt', 'render'])
  })

  it('an inequality, a pair and an interval are ONE answer in one box: no count is sent for them', () => {
    for (const answer of ['x < 4', 'x < -1 or x > 4', '-2 < x <= 5', 'x != 0', 'x = 2 and y = 3', '(-inf; -1) U (4; inf)']) {
      expect(strip(answer), answer).not.toHaveProperty('answerCount')
      expect(strip(answer), answer).not.toHaveProperty('answerLetter')
    }
  })

  it('a question of another kind has no count, and an equation whose key does not read has none either', () => {
    expect(strip('3/4', { answerKind: 'fraction' })).not.toHaveProperty('answerCount')
    expect(strip('(2; 3)', { answerKind: 'point' })).not.toHaveProperty('answerCount')
    expect(strip('hello')).not.toHaveProperty('answerCount')
    expect(strip('2 or 3').answerCount).toBe(2)
    expect(strip('2 or 3')).not.toHaveProperty('answerLetter')
  })
})

describe('answerShape: two to four answers are boxes, anything else is one field', () => {
  const shape = (answerCount?: number, answerLetter?: string) => answerShape({ prompt: 'p', answerKind: 'equation', answerCount, answerLetter })

  it('2, 3 and 4 answers are the answers shape, with the count and the letter', () => {
    expect(shape(2, 'x')).toEqual({ kind: 'answers', count: 2, letter: 'x' })
    expect(shape(3, 'y')).toEqual({ kind: 'answers', count: 3, letter: 'y' })
    expect(shape(4)).toEqual({ kind: 'answers', count: 4 })
  })

  it('one answer, more than four and a screen that was not told (an inequality has no count) are one field', () => {
    expect(shape(1, 'x')).toEqual({ kind: 'equation', count: 1 })
    expect(shape(5, 'x')).toEqual({ kind: 'equation', count: 5 })
    expect(shape()).toEqual({ kind: 'equation' })
  })

  it('choices still win, and the other kinds are as they were', () => {
    expect(answerShape({ prompt: 'p', answerKind: 'equation', answerCount: 2, choices: ['a', 'b'] })).toEqual({ kind: 'choice' })
    expect(answerShape({ prompt: 'p', answerKind: 'number' })).toEqual({ kind: 'number' })
    expect(answerShape({ prompt: 'p', answerKind: 'point' })).toEqual({ kind: 'point' })
  })

  it('answerValue sends the text of the boxes as it is (trimmed)', () => {
    expect(answerValue({ kind: 'answers', count: 2, letter: 'x' }, { whole: '', top: '', bottom: '', text: ' x = 3 or x = 2 ' })).toBe('x = 3 or x = 2')
    expect(answerValue({ kind: 'answers', count: 2, letter: 'x' }, { whole: '', top: '', bottom: '', text: '' })).toBe('')
  })
})

describe('what the boxes make', () => {
  it('a box holds the value only: "x =" typed too is taken away, a different letter is not', () => {
    expect(valueOfBox('3', 'x')).toBe('3')
    expect(valueOfBox(' x = 3 ', 'x')).toBe('3')
    expect(valueOfBox('x=-1', 'x')).toBe('-1')
    expect(valueOfBox('X = 4', 'x')).toBe('4')
    expect(valueOfBox('y = 3', 'x')).toBe('y = 3')
    expect(valueOfBox('x = 3', undefined)).toBe('x = 3')
  })

  it('"x = a or x = b" once every box holds a value, and nothing before', () => {
    expect(buildAnswers(['3', '2'], 'x')).toEqual({ answer: 'x = 3 or x = 2', tooLong: false })
    expect(buildAnswers(['x = 3', '-1', '1/2'], 'x')).toEqual({ answer: 'x = 3 or x = -1 or x = 1/2', tooLong: false })
    expect(buildAnswers(['3', ''], 'x').answer).toBe('')
    expect(buildAnswers(['', ''], 'x').answer).toBe('')
    // a letter or a sign alone is a step, not a value
    expect(buildAnswers(['3', 'x'], 'x').answer).toBe('')
    expect(buildAnswers(['3', '-'], 'x').answer).toBe('')
    expect(buildAnswers(['3', 'π'], 'x').answer).toBe('x = 3 or x = π')
    // no letter in the key: bare values
    expect(buildAnswers(['2', '3']).answer).toBe('2 or 3')
  })

  it('too long for the server (60 characters): the letter is written once, and when that is too long too nothing is sent', () => {
    const long = ['12345/67890', '12345/67891', '12345/67892', '12345/67893']
    const built = buildAnswers(long, 'x')
    expect(built.answer).toBe('x = 12345/67890 or 12345/67891 or 12345/67892 or 12345/67893')
    expect(built.answer.length).toBeLessThanOrEqual(60)
    expect(buildAnswers(['1234567/7654321', '1234567/7654322', '1234567/7654323', '1234567/7654324'], 'x')).toEqual({ answer: '', tooLong: true })
  })
})

describe('the question screen of an equation with two answers', () => {
  it('shows two boxes, Answer 1 and Answer 2, each with "x =" in front of it, and the hint says so', async () => {
    show(TWO)
    await ready(2)
    expect(fields().map((f) => f.getAttribute('aria-label'))).toEqual(['Answer 1', 'Answer 2'])
    expect(fields().map((f) => f.id)).toEqual(['answer-1', 'answer-2'])
    expect(screen.getByLabelText('Answer 1')).toBe(fields()[0])
    expect(Array.from(document.querySelectorAll('[data-answer-label]')).map((e) => e.textContent)).toEqual(['Answer 1', 'Answer 2'])
    expect(Array.from(document.querySelectorAll('[data-letter]')).map((e) => e.textContent)).toEqual(['x =', 'x ='])
    expect(screen.getAllByText(MULTI_HINT)).toHaveLength(1)
    expect(screen.queryByText(/Two answers/)).toBeNull()
    expect(screen.queryByLabelText('Your answer')).toBeNull()
  })

  it('three and four answers have that many boxes, and there is no fifth', async () => {
    const three = show(ask({ answerCount: 3, answerLetter: 'x' }))
    await ready(3)
    expect(fields()).toHaveLength(3)
    three.unmount()
    show(ask({ answerCount: 4, answerLetter: 'x' }))
    await ready(4)
    expect(fields().map((f) => f.getAttribute('aria-label'))).toEqual(['Answer 1', 'Answer 2', 'Answer 3', 'Answer 4'])
  })

  it('Next waits until every box holds a value, and sends "x = 3 or x = 2"', async () => {
    const { onAnswer } = show(TWO)
    await ready(2)
    expect(next().disabled).toBe(true)
    write(1, '3')
    expect(next().disabled).toBe(true)
    write(2, '2')
    expect(next().disabled).toBe(false)
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('x = 3 or x = 2', expect.any(Number))
  })

  it('a value with a minus, a fraction or a root is a value; emptying a box makes Next wait again', async () => {
    const { onAnswer } = show(TWO)
    await ready(2)
    write(2, '-1')
    write(1, '\\frac{1}{2}')
    expect(next().disabled).toBe(false)
    write(2, '')
    expect(next().disabled).toBe(true)
    write(2, '\\sqrt{2}')
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('x = 1/2 or x = √2', expect.any(Number))
  })

  it('if the learner types "x =" too, it still reads', async () => {
    const { onAnswer } = show(TWO)
    await ready(2)
    write(1, 'x=3')
    write(2, 'x=-2')
    expect(next().disabled).toBe(false)
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('x = 3 or x = -2', expect.any(Number))
  })

  it('a box with only a letter or an unfinished sign does not count, and a sign Jemma cannot read says so under its box', async () => {
    show(TWO)
    await ready(2)
    write(1, '3')
    write(2, '-')
    expect(next().disabled).toBe(true)
    write(2, 'x')
    expect(next().disabled).toBe(true)
    write(2, '\\aleph')
    act(() => fields()[1]!.dispatchEvent(new Event('focusout')))
    expect(screen.getByRole('status').textContent).toContain('cannot read that sign')
    expect(next().disabled).toBe(true)
    write(2, '2')
    expect(screen.queryByRole('status')).toBeNull()
    expect(next().disabled).toBe(false)
  })

  it('both boxes answer in the same moment without losing each other', async () => {
    const { onAnswer } = show(TWO)
    await ready(2)
    act(() => {
      fields()[0]!.setValue('4')
      fields()[1]!.setValue('5')
    })
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('x = 4 or x = 5', expect.any(Number))
  })

  it('every box has the equation keyboard, with the word or on it', async () => {
    show(TWO)
    await ready(2)
    const layout = theKeyboard().layouts[0] as { id: string }
    expect(layout.id).toBe('jemma-equation-algebra')
  })

  it('draws on the server with its boxes, labels and hint, and no old "Two answers" line', () => {
    const out = html(TWO)
    expect(out.match(/<math-field/g)).toHaveLength(2)
    expect(out).toContain('aria-label="Answer 1"')
    expect(out).toContain('aria-label="Answer 2"')
    expect(out).toContain(MULTI_HINT)
    expect(out).not.toContain('Two answers')
    expect(out).not.toContain('aria-label="Your answer"')
  })

  it('the boxes fit a phone: each box sits next to its "x =" in a row that may shrink, and nothing has a fixed width', () => {
    const out = html(TWO)
    expect(out).toContain('min-w-0 flex-1')
    expect(out).not.toMatch(/data-answers="2"[^>]*style=/)
  })

  it('P146b: each numbered box says the short "Tap to write", so the words are not cut off beside "x =" on a phone', async () => {
    show(TWO)
    await ready(2)
    expect(fields().map((f) => f.getAttribute('placeholder'))).toEqual(['\\text{Tap to write}', '\\text{Tap to write}'])
    // and on the server, in the markup, for every box of three
    const out = html(ask({ answerCount: 3, answerLetter: 'x' }))
    expect(out.match(/placeholder="\\text\{Tap to write\}"/g)).toHaveLength(3)
    expect(out).not.toContain('Tap here to write')
  })
})

describe('P146b: the keyboard opens on the tab that fits the question', () => {
  // MathLive remembers the layer the learner last used and the layer ids are the same for every question, so a question after one left on Calculus opened on
  // Calculus. The stand-in keyboard keeps no memory of its own: `currentLayer` is set by hand to what the last question left, and what the box does with it is
  // what is checked. The real editor is not run here (see the report).
  const keyboard = () => theKeyboard() as unknown as { currentLayer?: string; show: ReturnType<typeof vi.fn> }
  const CALCULUS = ask({ prompt: 'Differentiate y = 3x^2', answerKind: 'expression' })

  it('the reported case: Calculus on question 1, then the equation with two answers opens on Letters', async () => {
    const first = show(CALCULUS)
    await waitFor(() => expect(fields()[0]!.getAttribute('data-ready')).toBe('true'))
    expect(keyboard().currentLayer).toBe('jemma-calculus')
    first.unmount()
    // the learner left the keyboard on Calculus, and the next question is a new field (the screen is keyed by the question)
    keyboard().currentLayer = 'jemma-calculus'
    show(TWO)
    await ready(2)
    expect(keyboard().currentLayer).toBe('jemma-letters')
  })

  it('a question on another tab than the last one is set to its own tab, in both directions', async () => {
    keyboard().currentLayer = 'jemma-letters'
    const calculus = show(CALCULUS)
    await waitFor(() => expect(fields()[0]!.getAttribute('data-ready')).toBe('true'))
    expect(keyboard().currentLayer).toBe('jemma-calculus')
    calculus.unmount()
    keyboard().currentLayer = 'jemma-compare'
    show(ask({ prompt: 'Work out sin 30', answerKind: 'expression' }))
    await waitFor(() => expect(fields()[0]!.getAttribute('data-ready')).toBe('true'))
    expect(keyboard().currentLayer).toBe('jemma-trig')
  })

  it('the tab the learner picks stays while they are on the question: typing, and a tap on either box, do not reset it', async () => {
    keyboard().currentLayer = 'jemma-calculus'
    show(TWO)
    await ready(2)
    expect(keyboard().currentLayer).toBe('jemma-letters')
    keyboard().currentLayer = 'jemma-compare'
    write(1, '3')
    act(() => fields()[0]!.dispatchEvent(new Event('focusin')))
    act(() => fields()[1]!.dispatchEvent(new Event('focusin')))
    write(2, '2')
    act(() => fields()[0]!.dispatchEvent(new Event('focusout')))
    expect(keyboard().currentLayer).toBe('jemma-compare')
  })

  it('both boxes of a question start on the same tab, and neither undoes the other', async () => {
    keyboard().currentLayer = 'jemma-trig'
    show(ask({ answerCount: 3, answerLetter: 'x' }))
    await ready(3)
    expect(keyboard().currentLayer).toBe('jemma-letters')
  })
})

describe('an equation with one answer, an inequality, or too many answers keeps one field', () => {
  it('one answer: one box, "Type the answer, like x = 4." and no mention of two answers', async () => {
    show(ask({ answerCount: 1, answerLetter: 'x' }))
    await waitFor(() => expect(fields()).toHaveLength(1))
    expect(fields()[0]!.getAttribute('aria-label')).toBe('Your answer')
    expect(screen.getByText('Type the answer, like x = 4.')).toBeTruthy()
    expect(document.body.textContent).not.toContain('Two answers')
    expect(document.body.textContent).not.toContain('Answer 1')
  })

  it('P146b: the one box keeps "Tap here to write" (it has the room), on the screen and in the markup', async () => {
    show(ask({ answerCount: 1, answerLetter: 'x' }))
    await waitFor(() => expect(fields()).toHaveLength(1))
    expect(fields()[0]!.getAttribute('placeholder')).toBe('\\text{Tap here to write}')
    const out = html(ask({}))
    expect(out).toContain('placeholder="\\text{Tap here to write}"')
    expect(out).not.toContain('Tap to write')
  })

  it('a screen that was not told (an older session) is the one box too', () => {
    const out = html(ask({}))
    expect(out.match(/<math-field/g)).toHaveLength(1)
    expect(out).toContain('Type the answer, like x = 4.')
  })

  it('five answers or more: one box, with the word or between them', () => {
    const out = html(ask({ answerCount: 5, answerLetter: 'x' }))
    expect(out.match(/<math-field/g)).toHaveLength(1)
    expect(out).toContain('Type every answer, with the word or between them.')
    expect(equationCountHint(5)).toBe('Type every answer, with the word or between them.')
    expect(equationCountHint(1)).toBe('Type the answer, like x = 4.')
    expect(equationCountHint()).toBe('Type the answer, like x = 4.')
  })

  it('one field sends what was typed, as before', async () => {
    const { onAnswer } = show(ask({ answerCount: 1, answerLetter: 'x' }))
    await waitFor(() => expect(fields()).toHaveLength(1))
    await waitFor(() => expect(fields()[0]!.getAttribute('data-ready')).toBe('true'))
    write(1, 'x=4')
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('x = 4', expect.any(Number))
  })
})

describe('the paper sheet', () => {
  it('an equation with two answers prints "Answer 1: ____  Answer 2: ____"', () => {
    expect(writeLine(answerShape({ prompt: 'p', answerKind: 'equation', answerCount: 2, answerLetter: 'x' }))).toBe('Answer 1: ____  Answer 2: ____')
    expect(writeLine({ kind: 'answers', count: 3 })).toBe('Answer 1: ____  Answer 2: ____  Answer 3: ____')
    expect(writeLine({ kind: 'answers', count: 4 })).toBe('Answer 1: ____  Answer 2: ____  Answer 3: ____  Answer 4: ____')
  })

  it('one answer and a question that was not counted keep a line of their own, with no "Two answers" text', () => {
    expect(writeLine({ kind: 'equation', count: 1 })).toBe('Write the answer, like x = 4.')
    expect(writeLine({ kind: 'equation' })).toBe('Write the answer, like x = 4.')
    expect(writeLine({ kind: 'equation', count: 6 })).toBe('Write every answer, with the word or between them.')
  })

  it('the sheet draws it under the question, keeping the two spaces', () => {
    const five = Array.from({ length: 5 }, (_, i) => ask({ index: i + 1, position: i + 1, prompt: `Solve ${i + 1}x = 6`, answerCount: i === 0 ? 2 : 1, answerLetter: 'x' }))
    const el = document.createElement('div')
    el.innerHTML = renderToStaticMarkup(<PaperSheet questions={five} busy={false} error={null} onPhoto={() => undefined} onScreen={() => undefined} />)
    const lines = Array.from(el.querySelectorAll('li[data-n] p')).map((p) => p.textContent)
    expect(lines).toContain('Answer 1: ____  Answer 2: ____')
    expect(lines.filter((l) => l === 'Write the answer, like x = 4.')).toHaveLength(4)
    expect(el.innerHTML).toContain('whitespace-pre-wrap')
    expect(el.textContent).not.toContain('Two answers')
  })
})
