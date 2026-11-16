import { fireEvent, render, screen, within } from '@testing-library/react'
import type { Choice, Question, SeniorDiagramSpec } from '@jemma/profiling/schemas'
import { GEOMETRY_REASONS } from '@jemma/profiling/logic'
import { describe, expect, it, vi } from 'vitest'
import { PaperSheet, writeLine } from '../app/k/session/_parts/Paper'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { PICTURE_GRID, pictureCardWidth } from '../app/k/session/_parts/answers/PictureChoices'
import { answerShape, answerText, stripQuestion, type QuestionForChild } from '../app/k/session/[sessionId]/logic'

// P149: pick the right picture, true or false, and the reason for a step of a geometry proof. react-dom only: no server, no browser. A test here cannot measure
// pixels (there is no layout), so the phone's width is checked as the sum of the classes that decide it (`pictureCardWidth`) and the classes themselves.

const LINE: SeniorDiagramSpec = { kind: 'coordinate_plane', xMin: -5, xMax: 5, yMin: -5, yMax: 5, graphs: [{ type: 'line', m: 1, c: 0 }] }
const PARABOLA: SeniorDiagramSpec = { kind: 'coordinate_plane', xMin: -5, xMax: 5, yMin: -5, yMax: 5, graphs: [{ type: 'parabola', a: 1, q: -4 }] }
const SHIFTED: SeniorDiagramSpec = { kind: 'coordinate_plane', xMin: -5, xMax: 5, yMin: -5, yMax: 5, graphs: [{ type: 'parabola', a: 1, q: 4 }] }
const TRIANGLE: SeniorDiagramSpec = { kind: 'triangle', vertices: ['A', 'B', 'C'], angles: [90, 60, 30] }
const FOUR: Choice[] = [{ diagram: LINE }, { diagram: PARABOLA }, { diagram: SHIFTED }, { diagram: TRIANGLE }]

const ask = (over: Partial<QuestionForChild>): QuestionForChild => ({
  position: 3,
  phase: 'try',
  index: 1,
  of: 5,
  prompt: 'Which graph is y = x² − 4?',
  render: 'text',
  answerKind: 'choice',
  ...over,
})
const show = (q: QuestionForChild) => {
  const onAnswer = vi.fn()
  const utils = render(<QuestionScreen q={q} busy={false} onAnswer={onAnswer} />)
  return { onAnswer, ...utils }
}
const next = () => screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement

describe('picture choices', () => {
  it('draws four picture cards, each a button with its letter and one picture, and nothing else to tap but Next', () => {
    show(ask({ choices: FOUR }))
    const group = screen.getByRole('group', { name: 'Choices' })
    const cards = within(group).getAllByRole('button')
    expect(cards).toHaveLength(4)
    cards.forEach((card, i) => {
      expect(card.textContent).toContain('ABCD'[i]!)
      expect(card.querySelectorAll('svg[role="img"]')).toHaveLength(1)
      expect(card.getAttribute('aria-pressed')).toBe('false')
      expect(card.textContent).toContain(`Choice ${'ABCD'[i]}.`)
    })
    expect(screen.getAllByRole('button')).toHaveLength(5)
    expect(screen.getByText('Tap the picture that matches.')).toBeTruthy()
  })

  it('on a phone it is two cards across, 160 px wide each at 390 px (and never overflowing at 360), and on a laptop four across', () => {
    show(ask({ choices: FOUR }))
    const group = screen.getByRole('group', { name: 'Choices' })
    const grid = [...group.classList]
    expect(grid).toContain('grid-cols-2')
    expect(grid).toContain('md:grid-cols-4')
    expect(grid.find((c) => c.startsWith('max-w-'))).toBeTruthy()
    // At least 150 px at 390 in a Try question (the card of the question around it) and in a warm-up (no card).
    expect(pictureCardWidth(390, true)).toBeGreaterThanOrEqual(150)
    expect(pictureCardWidth(390, false)).toBeGreaterThanOrEqual(150)
    // At 360 the grid still fits its box (two cards and the gap), and a card is wide enough to read a graph.
    expect(pictureCardWidth(360, true)).toBeGreaterThanOrEqual(130)
    expect(PICTURE_GRID.gap).toBeLessThanOrEqual(8)
    // A Try question's grid is 1rem wider than the card's inside (it takes back the 8 px at each side), and goes back to the box on a laptop.
    expect(grid).toContain('w-[calc(100%+1rem)]')
    expect(grid).toContain('md:w-full')
    // No card has a fixed width or height: a card is as wide as its cell, and may grow.
    for (const card of within(group).getAllByRole('button')) {
      const classes = [...card.classList]
      expect(classes).toContain('min-w-0')
      expect(classes.some((c) => c.startsWith('min-h-'))).toBe(true)
      expect(classes.filter((c) => /^(w|h)-(\[|\d)/.test(c))).toEqual([])
    }
  })

  it('a warm-up question has the same cards, without taking room back from a card that is not there', () => {
    show(ask({ phase: 'warmup', of: 2, choices: FOUR }))
    const group = screen.getByRole('group', { name: 'Choices' })
    expect([...group.classList]).toContain('w-full')
    expect([...group.classList]).not.toContain('w-[calc(100%+1rem)]')
    expect(within(group).getAllByRole('button')).toHaveLength(4)
  })

  it('five pictures get the letters A to E, five across on a laptop, and E is sent when it is picked', () => {
    const five: Choice[] = [...FOUR, { diagram: LINE }]
    const { onAnswer } = show(ask({ choices: five }))
    const group = screen.getByRole('group', { name: 'Choices' })
    expect([...group.classList]).toContain('md:grid-cols-5')
    const cards = within(group).getAllByRole('button')
    expect(cards).toHaveLength(5)
    expect(cards[4]!.textContent).toContain('E')
    fireEvent.click(cards[4]!)
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('E', expect.any(Number))
  })

  it('the picked card is outlined, only one is picked, Next waits for a pick and sends the letter', () => {
    const { onAnswer } = show(ask({ choices: FOUR }))
    expect(next().disabled).toBe(true)
    const cards = within(screen.getByRole('group', { name: 'Choices' })).getAllByRole('button')
    fireEvent.click(cards[1]!)
    expect(cards[1]!.getAttribute('aria-pressed')).toBe('true')
    expect([...cards[1]!.classList]).toContain('border-[3px]')
    expect([...cards[1]!.classList]).toContain('border-ink')
    expect(cards.filter((c) => c.getAttribute('aria-pressed') === 'true')).toHaveLength(1)
    fireEvent.click(cards[2]!)
    expect(cards[1]!.getAttribute('aria-pressed')).toBe('false')
    expect(cards[2]!.getAttribute('aria-pressed')).toBe('true')
    expect(next().disabled).toBe(false)
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('C', expect.any(Number))
  })

  it('an option may have words under its picture, and a mix of words and pictures is drawn as cards', () => {
    show(ask({ choices: [{ diagram: LINE, text: 'the line' }, { text: 'neither' }, 'a plain string'] }))
    const cards = within(screen.getByRole('group', { name: 'Choices' })).getAllByRole('button')
    expect(cards).toHaveLength(3)
    expect(cards[0]!.textContent).toContain('the line')
    expect(cards[1]!.textContent).toContain('neither')
    expect(cards[2]!.textContent).toContain('a plain string')
    expect(cards[0]!.querySelectorAll('svg[role="img"]')).toHaveLength(1)
    expect(cards[1]!.querySelectorAll('svg[role="img"]')).toHaveLength(0)
  })

  it('old string choices still draw as the text buttons, now up to E', () => {
    const { onAnswer } = show(ask({ choices: ['1', '2', '3', '4', '5'] }))
    expect(screen.queryByRole('group', { name: 'Choices' })).toBeNull()
    const buttons = screen.getAllByRole('button').filter((b) => b.textContent !== 'Next')
    expect(buttons.map((b) => b.textContent)).toEqual(['1', '2', '3', '4', '5'])
    fireEvent.click(buttons[4]!)
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('E', expect.any(Number))
  })

  it('a picture of a choice that makes no sense draws "Picture missing" in its card and breaks nothing', () => {
    show(ask({ choices: [{ diagram: { kind: 'coordinate_plane', xMin: 5, xMax: -5, yMin: -5, yMax: 5 } }, { diagram: LINE }] }))
    const cards = within(screen.getByRole('group', { name: 'Choices' })).getAllByRole('button')
    expect(cards[0]!.textContent).toContain('Picture missing')
    expect(cards[1]!.querySelectorAll('svg[role="img"]')).toHaveLength(1)
  })

  it('the spoken description of a card never gives an equation or a coordinate', () => {
    show(ask({ choices: FOUR }))
    const labels = [...screen.getByRole('group', { name: 'Choices' }).querySelectorAll('svg[role="img"]')].map((s) => s.getAttribute('aria-label') ?? '')
    for (const label of labels) expect(label).not.toMatch(/y\s*=|x²|\(\s*-?\d/)
  })
})

describe('true or false', () => {
  const tf = ask({ prompt: 'The graph of y = 2x + 1 crosses the y-axis at 1.', answerKind: 'truefalse' })

  it('two big buttons, True and False, the same size, and no box to type in', () => {
    show(tf)
    const group = screen.getByRole('group', { name: 'True or false' })
    const [yes, no] = within(group).getAllByRole('button')
    expect([yes!.textContent, no!.textContent]).toEqual(['True', 'False'])
    expect(yes!.className).toBe(no!.className.replace('border-[3px] border-ink bg-ink text-white', 'border-2 border-edge bg-card text-ink'))
    expect([...yes!.classList].some((c) => c.startsWith('min-h-'))).toBe(true)
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
    expect(screen.getByText('Tap True or False.')).toBeTruthy()
  })

  it('Next waits for a pick, and sends the word on the button', () => {
    const { onAnswer } = show(tf)
    expect(next().disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'False' }))
    expect(screen.getByRole('button', { name: 'False' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'True' }).getAttribute('aria-pressed')).toBe('false')
    expect(next().disabled).toBe(false)
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('False', expect.any(Number))
  })

  it('a warm-up true or false question has the same buttons', () => {
    show({ ...tf, phase: 'warmup', of: 2 })
    expect(within(screen.getByRole('group', { name: 'True or false' })).getAllByRole('button')).toHaveLength(2)
  })

  it('choices that a true or false question carries are ignored', () => {
    show({ ...tf, choices: ['x', 'y'] })
    expect(screen.queryByRole('group', { name: 'Choices' })).toBeNull()
    expect(screen.getByRole('group', { name: 'True or false' })).toBeTruthy()
  })
})

describe('a reason for a step of a geometry proof', () => {
  const reason = ask({ prompt: 'Why is ∠B = ∠D?', answerKind: 'reason', diagram: TRIANGLE })
  const withValue = ask({ prompt: 'Find ∠B, and say why.', answerKind: 'reason', withValue: true })

  it('lists every reason of the fixed list, in a list the learner can search', () => {
    show(reason)
    const list = screen.getByRole('list', { name: 'Reasons' })
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual([...GEOMETRY_REASONS])
    expect(screen.getByLabelText('Type a word to find a reason')).toBeTruthy()
    expect(screen.queryByLabelText('1. The value')).toBeNull()
  })

  it('typing cuts the list down, and a word nothing has says so', () => {
    show(reason)
    const search = screen.getByLabelText('Type a word to find a reason')
    fireEvent.change(search, { target: { value: 'same segment' } })
    expect(within(screen.getByRole('list', { name: 'Reasons' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['angles in the same segment'])
    fireEvent.change(search, { target: { value: 'TANGENT' } })
    expect(within(screen.getByRole('list', { name: 'Reasons' })).getAllByRole('button').map((b) => b.textContent)).toEqual(
      GEOMETRY_REASONS.filter((r) => r.toLowerCase().includes('tangent')),
    )
    fireEvent.change(search, { target: { value: 'zebra' } })
    expect(screen.getByText('No reason has that word. Try another word.')).toBeTruthy()
    expect(within(screen.getByRole('list', { name: 'Reasons' })).queryAllByRole('button')).toHaveLength(0)
  })

  it('a picked reason is shown as a chip with a button to change it, and Next sends it', () => {
    const { onAnswer } = show(reason)
    expect(next().disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'angles in the same segment' }))
    const chip = document.querySelector('[data-reason-chip="true"]')!
    expect(chip.textContent).toContain('angles in the same segment')
    expect(screen.queryByRole('list', { name: 'Reasons' })).toBeNull()
    expect(next().disabled).toBe(false)
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('angles in the same segment', expect.any(Number))
  })

  it('Change puts the list back, and the next pick replaces the first', () => {
    const { onAnswer } = show(reason)
    fireEvent.click(screen.getByRole('button', { name: 'Pythagoras' }))
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    expect(next().disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'isosceles triangle' }))
    expect(next().disabled).toBe(false)
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('isosceles triangle', expect.any(Number))
  })

  it('with a value: a number box above the list, and Next needs the number and the reason', () => {
    const { onAnswer } = show(withValue)
    const box = screen.getByLabelText('1. The value') as HTMLInputElement
    expect(box.getAttribute('inputmode')).toBe('decimal')
    fireEvent.click(screen.getByRole('button', { name: 'angles in the same segment' }))
    expect(next().disabled, 'a reason and no number').toBe(true)
    fireEvent.change(box, { target: { value: '40°' } })
    expect(box.value, 'only digits, comma and point go in').toBe('40')
    expect(next().disabled).toBe(false)
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('40; angles in the same segment', expect.any(Number))
  })

  it('with a value: a number and no reason is not enough either, and the box takes at most 10 characters', () => {
    show(withValue)
    const box = screen.getByLabelText('1. The value') as HTMLInputElement
    fireEvent.change(box, { target: { value: '123456789012345' } })
    expect(box.value).toHaveLength(10)
    expect(next().disabled).toBe(true)
  })

  it('the longest answer it can send fits the 60 characters the server takes', () => {
    const longest = Math.max(...GEOMETRY_REASONS.map((r) => r.length))
    expect(longest + '; '.length + 10).toBeLessThanOrEqual(60)
  })
})

describe('what the browser gets', () => {
  const q = (over: Partial<Question>): Question => ({ prompt: 'p', render: 'text', answer: 'B', answerKind: 'choice', difficulty: 1, why: 'w', rightWay: 'r', ...over })
  const at = { position: 1, phase: 'try' as const, index: 1, of: 5 }

  it('the key never goes to the browser: not for a picture, a true or false or a reason', () => {
    for (const question of [
      q({ choices: [{ diagram: LINE }, { diagram: PARABOLA }], answer: 'B' }),
      q({ answerKind: 'truefalse', answer: 'true' }),
      q({ answerKind: 'reason', answer: '40; angles in the same segment' }),
      q({ answerKind: 'reason', answer: 'angles on a straight line' }),
    ]) {
      const sent = JSON.stringify(stripQuestion(question, at))
      expect(sent).not.toContain('"answer"')
      expect(sent).not.toContain('"why"')
      expect(sent).not.toContain('in the same segment')
      expect(sent).not.toContain('"true"')
    }
  })

  it('a reason that asks for a value sends only that there is one, and a true or false sends no choices', () => {
    expect(stripQuestion(q({ answerKind: 'reason', answer: '40; angles in the same segment' }), at).withValue).toBe(true)
    expect(stripQuestion(q({ answerKind: 'reason', answer: 'angles on a straight line' }), at).withValue).toBeUndefined()
    expect(stripQuestion(q({ answerKind: 'truefalse', answer: 'false', choices: ['True', 'False'] }), at).choices).toBeUndefined()
    expect(stripQuestion(q({ choices: ['1', '2'] }), at).choices).toEqual(['1', '2'])
  })

  it('the shape of the screen follows the kind: a choice, true or false, a reason', () => {
    expect(answerShape({ prompt: 'p', answerKind: 'number', choices: ['1', '2'] })).toEqual({ kind: 'choice' })
    expect(answerShape({ prompt: 'p', answerKind: 'truefalse' })).toEqual({ kind: 'truefalse' })
    expect(answerShape({ prompt: 'p', answerKind: 'reason' })).toEqual({ kind: 'reason', withValue: false })
    expect(answerShape({ prompt: 'p', answerKind: 'reason', withValue: true })).toEqual({ kind: 'reason', withValue: true })
  })

  it('the results screen names a picture choice by its letter, and writes True and False', () => {
    const question = q({ choices: [{ diagram: LINE }, { diagram: PARABOLA, text: 'the parabola' }, 'plain'] })
    expect(answerText(question, 'A')).toBe('Picture A')
    expect(answerText(question, 'B')).toBe('the parabola')
    expect(answerText(question, 'c')).toBe('plain')
    expect(answerText(q({ choices: ['1', '2', '3', '4', '5'] }), 'E')).toBe('5')
    expect(answerText(q({ answerKind: 'truefalse', answer: 'true' }), 'true')).toBe('True')
    expect(answerText(q({ answerKind: 'truefalse', answer: 'false' }), 'F')).toBe('False')
    expect(answerText(q({ answerKind: 'reason' }), '40; angles in the same segment')).toBe('40; angles in the same segment')
  })
})

describe('on paper', () => {
  const sheet = (questions: QuestionForChild[]) => render(<PaperSheet questions={questions} busy={false} error={null} onPhoto={() => {}} onScreen={() => {}} />)

  it('the lines under a true or false and a reason say how to write them', () => {
    expect(writeLine({ kind: 'truefalse' })).toBe('Write True or False.')
    expect(writeLine({ kind: 'reason', withValue: false })).toBe('Write the reason in words, like angles on a straight line.')
    expect(writeLine({ kind: 'reason', withValue: true })).toContain('Write the value, then the reason in words')
    expect(writeLine({ kind: 'choice' })).toBe('Write the letter of your answer.')
  })

  it('a picture choice is drawn as cards with their letters, nothing to tap', () => {
    sheet([ask({ choices: FOUR })])
    const list = screen.getByRole('list', { name: 'Choices' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(4)
    expect(items.map((li) => li.querySelector('span[aria-hidden="true"]')!.textContent)).toEqual(['A', 'B', 'C', 'D'])
    expect(within(list).queryAllByRole('button')).toHaveLength(0)
    expect(screen.getByText('Write the letter of your answer.')).toBeTruthy()
  })

  it('a reason question shows the list of reasons, closed, under the question', () => {
    sheet([ask({ answerKind: 'reason' })])
    const details = document.querySelector('details')!
    expect(details.open).toBe(false)
    expect(within(details).getAllByRole('listitem').map((li) => li.textContent)).toEqual([...GEOMETRY_REASONS])
    expect(screen.getByText('Write the reason in words, like angles on a straight line.')).toBeTruthy()
  })

  it('a true or false question has only its line', () => {
    sheet([ask({ answerKind: 'truefalse', prompt: 'A statement.' })])
    expect(screen.getByText('Write True or False.')).toBeTruthy()
    expect(document.querySelector('details')).toBeNull()
  })
})
