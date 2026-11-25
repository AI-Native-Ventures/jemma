import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { tidyGraph } from '@jemma/profiling/logic'
import type { DataGraphSpec, Question } from '@jemma/profiling/schemas'
import { PaperSheet, writeLine } from '../app/k/session/_parts/Paper'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { Results } from '../app/k/session/_parts/Results'
import { answerShape, reviewOf, stripQuestion, type StoredItem } from '../app/k/session/[sessionId]/logic'

// The maths editor is stood in for by a fake (see fake-mathlive.ts): CI's browser specs use the real one.
vi.mock('mathlive', async () => (await import('./fake-mathlive')).fakeMathlive())

// P167: the learner draws a graph of data: drags the empty bars of a bar graph up, or adds pictures to the empty rows of a picture graph, or types the numbers
// instead. The answer is sent as the values of the empty bars, and the results draw the right bars beside the learner's. react-dom only: no server, no browser.

const pets: DataGraphSpec = {
  kind: 'bars',
  counts: 'children',
  bars: [{ label: 'Cats', value: 4 }, { label: 'Dogs', value: null }, { label: 'Fish', value: 2 }, { label: 'Birds', value: 5 }],
  yMax: 8,
}
const cars: DataGraphSpec = { kind: 'bars', counts: 'cars', bars: [{ label: 'Mon', value: null }, { label: 'Tue', value: null }, { label: 'Wed', value: 15 }], yMax: 20, step: 5 }
const fruit: DataGraphSpec = { kind: 'pictures', counts: 'children', bars: [{ label: 'Apples', value: null }, { label: 'Bananas', value: 6 }], per: 2 }

const base = { render: 'text' as const, difficulty: 1 as const, why: 'w', rightWay: 'r' }
const one: Question = { ...base, prompt: '6 children chose a dog. Draw the bar for Dogs.', answer: '6', answerKind: 'whole', graph: pets }
const two: Question = tidyGraph({ ...base, prompt: 'On Monday 10 cars passed and on Tuesday 5. Draw the two bars.', answer: '10; 5', answerKind: 'list', graph: cars })
const pics: Question = { ...base, prompt: 'Each picture is 2 children. 8 children chose apples. Add the pictures for Apples.', answer: '8', answerKind: 'whole', graph: fruit }
const at = { position: 1, phase: 'try' as const, index: 1, of: 5, young: true }

const show = (q: Question) => {
  const onAnswer = vi.fn()
  render(<QuestionScreen q={stripQuestion(q, at)} busy={false} onAnswer={onAnswer} />)
  return onAnswer
}
const next = () => screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement
const press = (name: string, key: string, times = 1) => {
  for (let i = 0; i < times; i++) fireEvent.keyDown(screen.getByRole('slider', { name }), { key })
}

describe('what the browser is given', () => {
  it('the graph with its empty bars, and never the key', () => {
    const sent = stripQuestion(two, at)
    expect(sent.graph).toEqual(cars)
    expect(JSON.stringify(sent)).not.toContain('10; 5')
    expect(sent).not.toHaveProperty('answer')
  })

  it('a graph question is drawn; typed instead it is one box, or a box for each bar with its name', () => {
    const a = answerShape(stripQuestion(one, at))
    expect(a.kind).toBe('graph')
    expect(a.kind === 'graph' && a.typed.kind).toBe('whole')
    const b = answerShape(stripQuestion(two, at))
    expect(b.kind === 'graph' && b.typed).toMatchObject({ kind: 'list', count: 2, ordered: true, labels: ['Mon', 'Tue'] })
  })
})

describe('drawing a bar graph', () => {
  it('starts with the empty bar not drawn, and Next waits', () => {
    show(one)
    expect(screen.getByRole('slider', { name: 'Bar for Dogs' }).getAttribute('aria-valuetext')).toBe('not drawn yet')
    expect(screen.getByText('Drag the handle of the Dogs bar up.')).toBeTruthy()
    expect(next().disabled).toBe(true)
  })

  it('the arrow keys move the bar one line at a time, and the answer is the number it stands on', () => {
    const onAnswer = show(one)
    press('Bar for Dogs', 'ArrowUp', 7)
    press('Bar for Dogs', 'ArrowDown')
    expect(screen.getByRole('slider', { name: 'Bar for Dogs' }).getAttribute('aria-valuenow')).toBe('6')
    expect(next().disabled).toBe(false)
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('6', expect.any(Number))
  })

  it('a bar stops at the top of the scale and at 0', () => {
    show(one)
    press('Bar for Dogs', 'End')
    expect(screen.getByRole('slider', { name: 'Bar for Dogs' }).getAttribute('aria-valuenow')).toBe('8')
    press('Bar for Dogs', 'ArrowUp')
    expect(screen.getByRole('slider', { name: 'Bar for Dogs' }).getAttribute('aria-valuenow')).toBe('8')
    press('Bar for Dogs', 'Home')
    expect(screen.getByRole('slider', { name: 'Bar for Dogs' }).getAttribute('aria-valuenow')).toBe('0')
  })

  it('two bars on a scale of fives: each moves by 5, and the answer is both, in order', () => {
    const onAnswer = show(two)
    expect(screen.getByText('Drag each empty bar up to its number.')).toBeTruthy()
    press('Bar for Mon', 'ArrowUp', 2)
    expect(next().disabled).toBe(true)
    press('Bar for Tue', 'ArrowUp')
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('10; 5', expect.any(Number))
  })

  it('the numbers can be typed instead, and switching back starts again', () => {
    const onAnswer = show(one)
    press('Bar for Dogs', 'ArrowUp', 3)
    fireEvent.click(screen.getByRole('button', { name: 'Or type the number instead' }))
    expect(next().disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: '6' } })
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('6', expect.any(Number))
    fireEvent.click(screen.getByRole('button', { name: 'Or draw it on the graph instead' }))
    expect(screen.getByRole('slider', { name: 'Bar for Dogs' }).getAttribute('aria-valuetext')).toBe('not drawn yet')
  })

  it('two bars typed instead are two boxes, each with the name of its bar', () => {
    const onAnswer = show(two)
    fireEvent.click(screen.getByRole('button', { name: 'Or type the numbers instead' }))
    fireEvent.change(screen.getByLabelText('Mon'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('Tue'), { target: { value: '5' } })
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('10; 5', expect.any(Number))
  })

  it('a screen reader hears the given bars with their numbers, and which bar is empty', () => {
    show(one)
    expect(screen.getByRole('group', { name: /^Bar graph of children: Cats 4, Dogs not drawn yet, Fish 2, Birds 5\.$/ })).toBeTruthy()
  })
})

describe('drawing a picture graph', () => {
  it('+ adds a picture and a tap on one takes it off; each picture is 2', () => {
    const onAnswer = show(pics)
    expect(next().disabled).toBe(true)
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByRole('button', { name: 'Add a picture to Apples' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Take a picture off Apples' })[0]!)
    expect(screen.getAllByRole('button', { name: 'Take a picture off Apples' })).toHaveLength(4)
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('8', expect.any(Number))
  })

  it('the key says what one picture stands for', () => {
    show(pics)
    expect(screen.getByText(/= 2 children/)).toBeTruthy()
  })
})

describe('on paper', () => {
  it('the graph is drawn with a "?" in each empty bar, and the learner writes the numbers', () => {
    const shape = answerShape(stripQuestion(one, at))
    expect(writeLine(shape)).toBe('Write the number for Dogs.')
    render(<PaperSheet questions={[stripQuestion(two, at)]} busy={false} error={null} onPhoto={() => {}} onScreen={() => {}} />)
    expect(document.querySelectorAll('[data-bar="blank"]')).toHaveLength(2)
    expect(document.querySelectorAll('[data-paper-blanks="2"]')).toHaveLength(1)
  })
})

describe('the results', () => {
  const item = (q: Question, answer: string, correct: boolean): StoredItem => ({ phase: 'try', position: 1, question: q, answer, correct, difficulty: 1, seconds: 9 })

  it('carry the graph, what was drawn and the right values', () => {
    const [m] = reviewOf([item(two, '10; 10', false)])
    expect(m).toMatchObject({ graph: cars, graphWrote: [10, 10], graphRight: [10, 5] })
  })

  it('draw the right bar in green, and the learner’s dashed beside it when it was not right', () => {
    render(<Results firstName="Lindiwe" missed={reviewOf([item(one, '5', false)])} />)
    expect(document.querySelectorAll('[data-right]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-yours]')).toHaveLength(1)
  })

  it('a right bar is drawn alone', () => {
    render(<Results firstName="Lindiwe" missed={reviewOf([item(one, '6', true)])} />)
    expect(document.querySelectorAll('[data-right]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-yours]')).toHaveLength(0)
  })
})
