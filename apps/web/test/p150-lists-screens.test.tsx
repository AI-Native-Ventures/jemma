import { render, screen, fireEvent, within } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Question } from '@jemma/profiling/schemas'
import { PaperSheet, writeLine } from '../app/k/session/_parts/Paper'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { Results } from '../app/k/session/_parts/Results'
import { answerShape, reviewOf, stripQuestion, type QuestionForChild, type StoredItem } from '../app/k/session/[sessionId]/logic'

// P150: what a learner of a senior class sees and does for a list (a row of boxes), an order (chips to put in order) and a table (empty cells to fill), on the
// question screen, on the paper sheet and on the results. react-dom only: no server, no browser. What this cannot see (how it looks at 360 and 390 px) is the
// handoff's, not these tests': they check the classes that decide it (wrapping, fixed widths, scrolling inside a box).

const MAX_CONTENT_390 = 390 - 40 - 38 // the screen's side padding (px-5), the card's padding and border
const MAX_CONTENT_360 = 360 - 40 - 38

const base = { prompt: 'p', render: 'text' as const, difficulty: 1 as const, why: 'w', rightWay: 'r', steps: ['a', 'b'] }
const at = { position: 1, phase: 'try' as const, index: 1, of: 5 }
const FIVE: Question = { ...base, prompt: 'Find the five-number summary of 2, 4, 5, 6, 8, 10', answer: '2; 4; 5,5; 8; 10', answerKind: 'list', ordered: true, labels: ['min', 'Q1', 'median', 'Q3', 'max'] }
const FACTORS: Question = { ...base, prompt: 'Write all the factors of 12', answer: '1; 2; 3; 4; 6; 12', answerKind: 'list', ordered: false }
const TERMS: Question = { ...base, prompt: 'Write the next three terms: 3, 6, 12, ...', answer: '24; 48; 96', answerKind: 'list', ordered: true }
const FRACTIONS: Question = { ...base, prompt: 'Write the next two terms: 1/2, 1/4, ...', answer: '1/8; 1/16', answerKind: 'list', ordered: true }
const ORDER: Question = { ...base, prompt: 'Put these in order, smallest first', answer: '1/4; 0,3; 1/2; 0,6', answerKind: 'order' }
const TABLE: Question = {
  ...base,
  prompt: 'Complete the frequency table',
  answer: '4; 7; 10',
  answerKind: 'table',
  table: { columns: ['Score', 'Frequency'], rows: [['1', '3'], ['2', null], ['3', null], ['4', null]] },
}
const MEAN: Question = { ...base, prompt: 'Find the mean, correct to 1 decimal place', answer: '3,14159; 2,71828', answerKind: 'list', ordered: true, round: 1 }

const forChild = (q: Question): QuestionForChild => stripQuestion(q, at)
const show = (q: Question) => {
  const onAnswer = vi.fn()
  const utils = render(<QuestionScreen q={forChild(q)} busy={false} onAnswer={onAnswer} />)
  return { onAnswer, ...utils }
}
const next = () => screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement
const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const keyValues = (q: Question) => q.answer.split(';').map((v) => v.trim())

describe('what the server sends: counts and shapes, never the key', () => {
  it('a list carries a count, whether order counts, labels and whether a number pad is enough', () => {
    expect(forChild(FIVE).list).toEqual({ count: 5, ordered: true, plain: true, labels: ['min', 'Q1', 'median', 'Q3', 'max'] })
    expect(forChild(FACTORS).list).toEqual({ count: 6, ordered: false, plain: true })
    expect(forChild(FRACTIONS).list?.plain).toBe(false)
  })
  it('no value of the key is in what the browser gets (a list, a table), and an order is shuffled', () => {
    for (const q of [FIVE, FACTORS, TERMS, FRACTIONS, MEAN, TABLE]) {
      const sent = JSON.stringify(forChild(q))
      expect(sent).not.toContain(q.answer)
      for (const v of keyValues(q)) if (v.length > 3) expect(sent).not.toContain(v)
    }
    const items = forChild(ORDER).items!
    expect([...items].sort()).toEqual(keyValues(ORDER).sort())
    expect(items).not.toEqual(keyValues(ORDER))
    expect(forChild(ORDER)).not.toHaveProperty('answer')
  })
  it('the count of decimal places goes (a count), the table goes whole (its given cells are in the question)', () => {
    expect(forChild(MEAN).round).toBe(1)
    expect(forChild(TABLE).table).toEqual({ ...TABLE.table, plain: true })
  })
  it('a question of another kind has none of these fields', () => {
    const old = stripQuestion({ ...base, answer: '3/4', answerKind: 'fraction' }, at)
    for (const key of ['list', 'items', 'table', 'round']) expect(old).not.toHaveProperty(key)
    // P148: a number, a whole or a decimal question sends its round (the screen says "Round it to 2 decimal places"); a question of an old kind that is none of them sends none.
    const senior = stripQuestion({ ...base, answer: '-3', answerKind: 'number', round: 2 }, at)
    expect(senior).toHaveProperty('round', 2)
    expect(stripQuestion({ ...base, answer: '3/4', answerKind: 'fraction', round: 2 }, at)).not.toHaveProperty('round')
  })
})

describe('answerShape', () => {
  it('knows the three shapes from what was sent', () => {
    expect(answerShape(forChild(FIVE))).toEqual({ kind: 'list', count: 5, ordered: true, plain: true, labels: ['min', 'Q1', 'median', 'Q3', 'max'] })
    expect(answerShape(forChild(MEAN))).toMatchObject({ kind: 'list', round: 1 })
    expect(answerShape(forChild(ORDER)).kind).toBe('order')
    expect(answerShape(forChild(TABLE)).kind).toBe('table')
  })
  it('a question that came without its parts gets the plain box, not a crash', () => {
    for (const answerKind of ['list', 'order', 'table'] as const) expect(answerShape({ prompt: 'p', answerKind })).toEqual({ kind: 'text' })
  })
  it('a shape with nothing to fill falls to the plain box, so the learner is never stuck on a question that cannot be answered', () => {
    expect(answerShape({ prompt: 'p', answerKind: 'list', list: { count: 0, ordered: false, plain: true } })).toEqual({ kind: 'text' })
    expect(answerShape({ prompt: 'p', answerKind: 'order', items: ['1'] })).toEqual({ kind: 'text' })
    expect(answerShape({ prompt: 'p', answerKind: 'table', table: { columns: ['a'], rows: [['1'], ['2']], plain: true } })).toEqual({ kind: 'text' })
  })
  it('the old kinds are as they were', () => {
    expect(answerShape({ prompt: 'p', answerKind: 'point' })).toEqual({ kind: 'point' })
    expect(answerShape({ prompt: 'p', answerKind: 'money' })).toEqual({ kind: 'money' })
    expect(answerShape({ prompt: 'p', answerKind: 'choice' })).toEqual({ kind: 'text' })
  })
})

describe('a list: a row of boxes', () => {
  it('shows one box for each value, each with its label, and Next waits until every box has a value', () => {
    const { onAnswer } = show(FIVE)
    for (const label of ['min', 'Q1', 'median', 'Q3', 'max']) expect(screen.getByLabelText(label)).toBeTruthy()
    expect(next().disabled).toBe(true)
    type('min', '2')
    type('Q1', '4')
    type('median', '5,5')
    type('Q3', '8')
    expect(next().disabled).toBe(true)
    type('max', '10')
    expect(next().disabled).toBe(false)
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('2; 4; 5,5; 8; 10', expect.any(Number))
  })
  it('a box emptied again takes Next away', () => {
    show(TERMS)
    type('Answer 1', '24')
    type('Answer 2', '48')
    type('Answer 3', '96')
    expect(next().disabled).toBe(false)
    type('Answer 2', '')
    expect(next().disabled).toBe(true)
  })
  it('a list in any order has no numbers under its boxes and says any order is fine', () => {
    const { container } = show(FACTORS)
    expect(container.querySelectorAll('input[data-value-box]')).toHaveLength(6)
    expect(screen.getByText(/Any order is fine/)).toBeTruthy()
  })
  it('a list in order numbers its boxes', () => {
    const { container } = show(TERMS)
    const group = container.querySelector('[data-values="list"]')!
    expect(within(group as HTMLElement).getByText('3')).toBeTruthy()
    expect(screen.getByText(/in order/)).toBeTruthy()
  })
  it('a number pad for plain numbers, the full keyboard for a fraction, a root or a minus', () => {
    const plain = show(FACTORS)
    expect((plain.container.querySelector('input[data-value-box]') as HTMLInputElement).inputMode).toBe('decimal')
    plain.unmount()
    const rich = show(FRACTIONS)
    expect((rich.container.querySelector('input[data-value-box]') as HTMLInputElement).inputMode).toBe('text')
  })
  it('a plain box takes digits, a comma and a point and no letters', () => {
    show(FACTORS)
    type('Answer 1', '1a2,5x')
    expect((screen.getByLabelText('Answer 1') as HTMLInputElement).value).toBe('12,5')
  })
  it('a fraction goes through as typed', () => {
    const { onAnswer } = show(FRACTIONS)
    type('Answer 1', '1/8')
    type('Answer 2', '1/16')
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('1/8; 1/16', expect.any(Number))
  })
  it('a rounded answer says to what', () => {
    show(MEAN)
    expect(screen.getByText(/Round each answer to 1 decimal place/)).toBeTruthy()
  })
  it('Enter moves to the next box', () => {
    show(TERMS)
    const first = screen.getByLabelText('Answer 1')
    first.focus()
    fireEvent.keyDown(first, { key: 'Enter' })
    expect(document.activeElement).toBe(screen.getByLabelText('Answer 2'))
  })
})

describe('an order: chips put in order by tapping', () => {
  const chips = () => screen.getByRole('group', { name: 'Numbers to put in order' })
  it('shows every item as a chip and Next waits until every place has one', () => {
    show(ORDER)
    expect(within(chips()).getAllByRole('button')).toHaveLength(4)
    expect(next().disabled).toBe(true)
  })
  it('a tap puts the item in the next place; the sent text is the order of the taps', () => {
    const { onAnswer } = show(ORDER)
    for (const item of ['1/4', '0,3', '1/2', '0,6']) fireEvent.click(within(chips()).getByRole('button', { name: new RegExp(`^${item.replace('/', '\\/')}\\.`) }))
    expect(next().disabled).toBe(false)
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('1/4; 0,3; 1/2; 0,6', expect.any(Number))
  })
  it('a tap on a placed chip takes it back, and Start again takes them all back', () => {
    show(ORDER)
    const order = () => screen.getByRole('list', { name: 'Your order' })
    fireEvent.click(within(chips()).getAllByRole('button')[0]!)
    fireEvent.click(within(chips()).getAllByRole('button')[0]!)
    expect(within(chips()).getAllByRole('button')).toHaveLength(2)
    fireEvent.click(within(order()).getByRole('button', { name: /^Place 1:/ }))
    expect(within(chips()).getAllByRole('button')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Start again' }))
    expect(within(chips()).getAllByRole('button')).toHaveLength(4)
    expect(screen.queryByRole('button', { name: 'Start again' })).toBeNull()
  })
  it('the right order is never in the page', () => {
    const { container } = show(ORDER)
    expect(container.innerHTML).not.toContain('1/4; 0,3; 1/2; 0,6')
  })
})

describe('a table: the empty cells are boxes', () => {
  it('draws the given cells as text and each empty cell as a box named by its row and column', () => {
    const { container } = show(TABLE)
    expect(container.querySelectorAll('input[data-value-box]')).toHaveLength(3)
    expect(screen.getByLabelText('Row 2, Frequency')).toBeTruthy()
    expect(screen.getByLabelText('Row 4, Frequency')).toBeTruthy()
    expect(screen.getByText('Frequency')).toBeTruthy()
  })
  it('sends the empty cells left to right and top to bottom, once every one has a value', () => {
    const { onAnswer } = show(TABLE)
    type('Row 2, Frequency', '4')
    type('Row 3, Frequency', '7')
    expect(next().disabled).toBe(true)
    type('Row 4, Frequency', '10')
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('4; 7; 10', expect.any(Number))
  })
})

describe('at 360 and 390 px: nothing is wider than the screen', () => {
  const boxWidth = (el: Element) => Number(/w-\[(\d+)px\]/.exec(el.className)?.[1])
  it('the boxes of a list wrap, and a box is narrow enough for three in a row at 360 px', () => {
    for (const q of [FIVE, FACTORS, FRACTIONS]) {
      const { container, unmount } = show(q)
      const group = container.querySelector('[data-values="list"]')!
      expect(group.className).toContain('flex-wrap')
      for (const input of Array.from(group.querySelectorAll('input'))) {
        const w = boxWidth(input)
        expect(w).toBeLessThanOrEqual(68)
        expect(3 * w + 2 * 8).toBeLessThanOrEqual(MAX_CONTENT_360)
        expect(input.className).toContain('min-w-0')
      }
      unmount()
    }
  })
  it('plain numbers: five in a row fit at 390 px', () => {
    const { container } = show(FIVE)
    const w = boxWidth(container.querySelector('input')!)
    expect(5 * w + 4 * 8).toBeLessThanOrEqual(MAX_CONTENT_390)
  })
  it('the chips of an order wrap, and its places wrap', () => {
    const { container } = show(ORDER)
    expect(container.querySelector('[data-values="order"]')!.className).toContain('flex-wrap')
    expect(container.querySelector('[data-values="items"]')!.className).toContain('flex-wrap')
  })
  it('a table scrolls sideways inside its own box when it is wider than the screen', () => {
    const { container } = show(TABLE)
    expect(container.querySelector('[data-values="table"]')!.className).toContain('overflow-x-auto')
  })
  it('no fixed width or nowrap that would push the page: only the narrow boxes have a width', () => {
    const { container } = show(TABLE)
    expect(container.innerHTML).not.toMatch(/whitespace-nowrap|min-w-\[(?:[4-9]\d\d|\d{4})/)
  })
})

describe('a warm-up and the new kinds', () => {
  it('a list on the screen of a warm-up still draws', () => {
    const onAnswer = vi.fn()
    render(<QuestionScreen q={stripQuestion(FACTORS, { position: 1, phase: 'warmup', index: 1, of: 2 })} busy={false} onAnswer={onAnswer} />)
    expect(screen.getByLabelText('Answer 1')).toBeTruthy()
  })
})

describe('the paper sheet', () => {
  it('asks for a semicolon between the values and names the order', () => {
    expect(writeLine(answerShape(forChild(FIVE)))).toContain('semicolon')
    expect(writeLine(answerShape(forChild(FIVE)))).toContain('labels')
    expect(writeLine(answerShape(forChild(FACTORS)))).toContain('Any order')
    expect(writeLine(answerShape(forChild(ORDER)))).toContain('in order')
    expect(writeLine(answerShape(forChild(TABLE)))).toContain('left to right')
    expect(writeLine(answerShape(forChild(MEAN)))).toContain('1 decimal place')
  })
  const sheet = (...qs: Question[]) =>
    renderToStaticMarkup(<PaperSheet questions={qs.map((q, i) => stripQuestion(q, { ...at, position: i + 1, index: i + 1 }))} busy={false} error={null} onPhoto={() => {}} onScreen={() => {}} />)
  it('prints one empty box for each value of a list, with its label', () => {
    const html = sheet(FIVE)
    expect(html).toContain('data-paper-blanks="5"')
    for (const label of ['min', 'Q1', 'median', 'Q3', 'max']) expect(html).toContain(label)
  })
  it('prints the items of an order with an empty place for each', () => {
    const html = sheet(ORDER)
    expect(html).toContain('data-paper-blanks="4"')
    for (const item of keyValues(ORDER)) expect(html).toContain(item)
    // The items are in the shuffled order, so the right order is not printed as one line.
    expect(html).not.toContain('1/4; 0,3; 1/2; 0,6')
  })
  it('prints a table with its given cells and an empty cell where the learner writes', () => {
    const html = sheet(TABLE)
    expect(html).toContain('data-paper-table="true"')
    expect((html.match(/Empty cell/g) ?? []).length).toBe(3)
    expect(html).toContain('Frequency')
  })
  it('a list with no labels and any order prints boxes with no numbers', () => {
    const html = sheet(FACTORS)
    expect(html).toContain('data-paper-blanks="6"')
  })
})

describe('the results: each value or cell right or not right', () => {
  const item = (question: Question, answer: string, correct: boolean): StoredItem => ({ phase: 'try', position: 1, question, answer, correct, difficulty: 1, seconds: 1 })
  const missed = (q: Question, typed: string) => reviewOf([item(q, typed, false)])

  it('reviewOf gives each place of a list, marked, and says whether the order counts', () => {
    const [m] = missed(FIVE, '2; 5; 5,5; 8; 9')
    expect(m!.ordered).toBe(true)
    expect(m!.cells).toEqual([
      { wrote: '2', right: '2', ok: true },
      { wrote: '5', right: '4', ok: false },
      { wrote: '5,5', right: '5,5', ok: true },
      { wrote: '8', right: '8', ok: true },
      { wrote: '9', right: '10', ok: false },
    ])
  })
  it('a list in any order is marked value by value and keeps its right answer as one list', () => {
    const [m] = missed(FACTORS, '1; 2; 3; 4; 5; 12')
    expect(m!.ordered).toBe(false)
    expect(m!.cells!.map((c) => c.ok)).toEqual([true, true, true, true, false, true, false].slice(0, 6))
    expect(m!.right).toBe('1; 2; 3; 4; 6; 12')
  })
  it('a table: the cells and the table', () => {
    const [m] = missed(TABLE, '4; 8; 10')
    expect(m!.cells!.map((c) => c.ok)).toEqual([true, false, true])
    expect(m!.table!.columns).toEqual(['Score', 'Frequency'])
  })
  it('a rounded answer is marked against the rounded key', () => {
    const [m] = reviewOf([item(MEAN, '3,1; 2,7', true)])
    expect(m!.cells!.every((c) => c.ok)).toBe(true)
  })
  it('the right answer of a rounded question is the key rounded as the question asks', () => {
    const [m] = missed(MEAN, '3,1; 2,7')
    expect(m!.right).toBe('3,1; 2,7')
    const [again] = missed({ ...MEAN, round: 2 }, '3,1; 2,7')
    expect(again!.right).toBe('3,14; 2,72')
    expect(again!.cells!.map((c) => c.right)).toEqual(['3,14', '2,72'])
  })
  it('an answer that could not be read on paper has no cells (the card says so)', () => {
    const [m] = reviewOf([{ ...item(FIVE, '', false), unread: true }])
    expect(m!.cells).toBeUndefined()
    expect(m!.unread).toBe(true)
  })
  it('another kind of question has no cells', () => {
    const [m] = reviewOf([item({ ...base, answer: '3/4', answerKind: 'fraction' }, '1/2', false)])
    for (const key of ['cells', 'table', 'ordered']) expect(m).not.toHaveProperty(key)
  })

  const results = (...m: ReturnType<typeof reviewOf>) => render(<Results firstName="Sam" missed={m} />)
  it('a missed list draws each box as right or not right with the right value under a wrong one', () => {
    const { container } = results(...missed(FIVE, '2; 5; 5,5; 8; 9'))
    expect(container.querySelectorAll('[data-cell="right"]')).toHaveLength(3)
    expect(container.querySelectorAll('[data-cell="wrong"]')).toHaveLength(2)
    expect(container.querySelectorAll('[data-right-value="true"]')).toHaveLength(2)
    expect(container.textContent).toContain('Not right.')
    expect(container.textContent).toContain('Right.')
  })
  it('a missed list in any order shows the right answer once, as a list', () => {
    const { container } = results(...missed(FACTORS, '1; 2; 3; 4; 5; 12'))
    expect(container.querySelector('[data-right-list="true"]')!.textContent).toContain('1; 2; 3; 4; 6; 12')
  })
  it('a missed table draws the table with a mark in each empty cell', () => {
    const { container } = results(...missed(TABLE, '4; 8; 10'))
    expect(container.querySelector('table')).toBeTruthy()
    expect(container.querySelectorAll('[data-cell="right"]')).toHaveLength(2)
    expect(container.querySelectorAll('[data-cell="wrong"]')).toHaveLength(1)
    expect(container.textContent).toContain('Right: 7')
  })
  it('a right list is confirmed with every box right', () => {
    const { container } = results(...reviewOf([item(TERMS, '24; 48; 96', true)]))
    expect(container.querySelector('[data-verdict="right"]')).toBeTruthy()
    expect(container.querySelectorAll('[data-cell="right"]')).toHaveLength(3)
  })
  it('a question of an old kind is drawn as it always was (no cells box)', () => {
    const { container } = results(...reviewOf([item({ ...base, answer: '3/4', answerKind: 'fraction' }, '1/2', false)]))
    expect(container.querySelector('[data-cells="true"]')).toBeNull()
    expect(container.textContent).toContain('Right answer')
  })
})

describe('no em dash', () => {
  it('none in the words of the new screens', () => {
    const { container } = show(FIVE)
    expect(container.textContent).not.toContain(String.fromCharCode(0x2014))
  })
})
