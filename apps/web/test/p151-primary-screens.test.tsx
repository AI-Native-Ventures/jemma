import { render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Question } from '@jemma/profiling/schemas'
import { writeLine, PaperSheet } from '../app/k/session/_parts/Paper'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { YOUNG_SIZE } from '../app/k/session/_parts/answers/YoungSize'
import { answerShape, isYoungGrade, stripQuestion, type QuestionForChild } from '../app/k/session/[sessionId]/logic'

// P151: Grades 1 to 6 get the list, order and table inputs (P150) sized for young learners (bigger boxes, 56 px targets) with primary wording. A learner of Grades 7 to
// 12 gets them as P150 drew them. react-dom only: no server, no browser. What this cannot see (how it looks at 360 and 390 px) is the handoff's: these tests check
// the classes and numbers that decide it.

const MAX_CONTENT_390 = 390 - 40 - 38 // the screen's side padding (px-5), the card's padding and border
const MAX_CONTENT_360 = 360 - 40 - 38

const base = { prompt: 'p', render: 'text' as const, difficulty: 1 as const, why: 'w', rightWay: 'r' }
const at = { position: 1, phase: 'try' as const, index: 1, of: 5 }
const PATTERN: Question = { ...base, prompt: 'What are the next three numbers? 2, 4, 6, 8, ...', answer: '10; 12; 14', answerKind: 'list', ordered: true }
const FACTORS: Question = { ...base, prompt: 'Write all the factors of 6', answer: '1; 2; 3; 6', answerKind: 'list', ordered: false }
const ORDER: Question = { ...base, prompt: 'Put the numbers in order. Start with the smallest.', answer: '9; 18; 45; 72', answerKind: 'order' }
const TABLE: Question = {
  ...base,
  prompt: 'Fill in the tally table',
  answer: '4; 7',
  answerKind: 'table',
  table: { columns: ['Fruit', 'How many'], rows: [['Apples', '3'], ['Pears', null], ['Plums', null]] },
}
const WIDE: Question = {
  ...base,
  prompt: 'Fill in the table',
  answer: '4; 7; 5; 6',
  answerKind: 'table',
  table: { columns: ['Day', 'Mon', 'Tue', 'Wed'], rows: [['Cats', '3', null, null], ['Dogs', '2', null, null]] },
}
const OLD: Question = { ...base, prompt: 'What is 1/2 + 1/4?', answer: '3/4', answerKind: 'fraction' }

const young = (q: Question): QuestionForChild => stripQuestion(q, { ...at, young: true })
const grown = (q: Question): QuestionForChild => stripQuestion(q, at)
const show = (q: QuestionForChild) => render(<QuestionScreen q={q} busy={false} onAnswer={vi.fn()} />)

describe('isYoungGrade: a learner of Grade 1 to 6', () => {
  it.each([1, 2, 3, 4, 5, 6])('Grade %i is young', (grade) => expect(isYoungGrade(grade)).toBe(true))
  it.each([0, 7, 8, 12, 13, -1, 3.5, null, undefined, '3', Number.NaN])('%s is not', (grade) => expect(isYoungGrade(grade)).toBe(false))
})

describe('what the server sends', () => {
  it('a young learner gets the flag on a question, and it changes nothing else', () => {
    const q = young(PATTERN)
    expect(q.young).toBe(true)
    const { young: _flag, ...rest } = q
    expect(rest).toEqual(grown(PATTERN))
  })
  it('a learner who is not young has no flag at all', () => {
    for (const q of [PATTERN, ORDER, TABLE, OLD]) expect(grown(q)).not.toHaveProperty('young')
    expect(stripQuestion(OLD, { ...at, young: false })).not.toHaveProperty('young')
  })
  it('an old kind of a young learner carries the flag too (the screens use it for the new kinds only)', () => {
    expect(young(OLD).young).toBe(true)
  })
  it('the key never goes to a young learner: no value of a list, a table or an order is in what the browser gets', () => {
    for (const q of [PATTERN, FACTORS, TABLE, WIDE]) {
      const sent = JSON.stringify(young(q))
      expect(sent).not.toContain(q.answer)
    }
    const items = young(ORDER).items!
    expect(items).not.toEqual(['9', '18', '45', '72'])
    expect(young(ORDER)).not.toHaveProperty('answer')
  })
})

describe('answerShape of a young learner', () => {
  it('a list, an order and a table carry the flag; a learner who is not young has none', () => {
    for (const q of [PATTERN, FACTORS, ORDER, TABLE]) {
      expect(answerShape(young(q))).toMatchObject({ young: true })
      expect(answerShape(grown(q))).not.toHaveProperty('young')
    }
  })
  it('the old kinds are as they were, young or not', () => {
    expect(answerShape(young(OLD))).toEqual(answerShape(grown(OLD)))
    expect(answerShape(young({ ...OLD, answerKind: 'money' }))).toEqual({ kind: 'money' })
  })
})

describe('the words a young learner reads', () => {
  it('a list: one number in each box', () => {
    show(young(PATTERN))
    expect(screen.getByText('Type one number in each box, in order.')).toBeTruthy()
  })
  it('a list in any order says so', () => {
    show(young(FACTORS))
    expect(screen.getByText('Type one number in each box. Any order is fine.')).toBeTruthy()
  })
  it('an order: tap the numbers in the order the question asks for', () => {
    show(young(ORDER))
    expect(screen.getByText('Tap the numbers in the order the question asks for. Tap a number again to take it back.')).toBeTruthy()
  })
  it('a table: fill in the empty boxes', () => {
    show(young(TABLE))
    expect(screen.getByText('Fill in the empty boxes.')).toBeTruthy()
  })
  it('a learner who is not young reads the lines of P150, as they were', () => {
    const a = show(grown(PATTERN))
    expect(a.container.textContent).toContain('Type each answer in its box, in order.')
    a.unmount()
    const b = show(grown(ORDER))
    expect(b.container.textContent).toContain('Tap the numbers in order, one place at a time. Tap one again to take it back.')
    b.unmount()
    const c = show(grown(TABLE))
    expect(c.container.textContent).toContain('Fill in the empty boxes of the table.')
  })
  it('no em dash, no word of marking', () => {
    for (const q of [PATTERN, FACTORS, ORDER, TABLE]) {
      const { container, unmount } = show(young(q))
      expect(container.textContent).not.toContain(String.fromCharCode(0x2014))
      expect(container.textContent).not.toMatch(/\b(right|wrong|correct)\b/i)
      unmount()
    }
  })
})

describe('the size a young learner gets (bigger boxes, 56 px targets)', () => {
  it('the three inputs sit in a box that sizes them, and a learner who is not young has none', () => {
    for (const q of [PATTERN, ORDER, TABLE]) {
      const a = show(young(q))
      expect(a.container.querySelector('[data-young="true"]')).toBeTruthy()
      a.unmount()
      const b = show(grown(q))
      expect(b.container.querySelector('[data-young]')).toBeNull()
      b.unmount()
    }
  })
  it('a box of a list or a table is 56 px high with 24 px figures, a chip is at least 56 px high', () => {
    // h-14 and min-h-14 are 56 px: more than the 44 px of a touch target.
    expect(YOUNG_SIZE).toContain('[&_[data-value-box]]:h-14')
    expect(YOUNG_SIZE).toContain('[&_[data-value-box]]:text-[24px]')
    expect(YOUNG_SIZE).toContain('[&_[data-values=items]_button]:min-h-14')
  })
  it('a box of a list is 64 px wide: four in a row fit at 390 px and at 360 px, and a longer list wraps to a second row', () => {
    expect(YOUNG_SIZE).toContain('[&_[data-values=list]_[data-value-box]]:w-16')
    expect(4 * 64 + 3 * 8).toBeLessThanOrEqual(MAX_CONTENT_360)
    expect(4 * 64 + 3 * 8).toBeLessThanOrEqual(MAX_CONTENT_390)
    const { container } = show(young(PATTERN))
    expect(container.querySelector('[data-values="list"]')!.className).toContain('flex-wrap')
  })
  it('a cell of a table keeps the width it had (a young table is 2 columns wide, an older one scrolls inside its own box)', () => {
    expect(YOUNG_SIZE).not.toMatch(/data-values=table\]_\[data-value-box\]\]:w-/)
    const { container } = show(young(WIDE))
    expect(container.querySelector('[data-values="table"]')!.className).toContain('overflow-x-auto')
    // 4 columns of a 64 px cell and 12 px of spacing: 304 px, inside the 312 px of a 390 px screen.
    expect(4 * (64 + 12)).toBeLessThanOrEqual(MAX_CONTENT_390)
  })
  it('the wrapper adds no fixed width and no nowrap, so nothing can push the page', () => {
    expect(YOUNG_SIZE).not.toMatch(/whitespace-nowrap|min-w-\[(?:[4-9]\d\d|\d{4})|(?<![-\w])w-\[/)
    const { container } = show(young(PATTERN))
    expect(container.querySelector('[data-young="true"]')!.className).toContain('w-full')
  })
  it('a warm-up and a try question both draw it', () => {
    const warm = stripQuestion(PATTERN, { position: 1, phase: 'warmup', index: 1, of: 2, young: true })
    const { container } = show(warm)
    expect(container.querySelector('[data-young="true"]')).toBeTruthy()
  })
})

describe('the paper sheet of a young learner', () => {
  it('asks for the numbers with simple words, and a learner who is not young reads the lines of P150', () => {
    expect(writeLine(answerShape(young(PATTERN)))).toBe('Write the numbers with a semicolon between them, like 3; 5; 7. Keep them in order.')
    expect(writeLine(answerShape(young(FACTORS)))).toBe('Write the numbers with a semicolon between them, like 3; 5; 7. Any order is fine.')
    expect(writeLine(answerShape(young(ORDER)))).toBe('Write the numbers in the order the question asks for, with a semicolon between them, like 3; 5; 7.')
    expect(writeLine(answerShape(young(TABLE)))).toBe('Write the missing numbers one after the other, with a semicolon between them.')
    expect(writeLine(answerShape(grown(PATTERN)))).toContain('Keep them in order.')
    expect(writeLine(answerShape(grown(ORDER)))).toBe('Write the numbers in order, with a semicolon between them, like 1/4; 1/2; 3/4.')
  })
  const sheet = (...qs: QuestionForChild[]) =>
    renderToStaticMarkup(<PaperSheet questions={qs.map((q, i) => ({ ...q, position: i + 1, index: i + 1 }))} busy={false} error={null} onPhoto={() => {}} onScreen={() => {}} />)
  it('prints bigger empty boxes and cells for a young learner, and the same ones as before for the rest', () => {
    for (const q of [PATTERN, ORDER]) {
      expect(sheet(young(q))).toContain('h-12 w-14')
      expect(sheet(grown(q))).toContain('h-10 w-12')
      expect(sheet(grown(q))).not.toContain('h-12 w-14')
    }
    expect(sheet(young(TABLE))).toContain('h-12 w-16')
    expect(sheet(grown(TABLE))).toContain('h-10 w-14')
  })
})

describe('an old kind is drawn as it was', () => {
  it('a fraction question of a young learner has no size box and the old hint', () => {
    const { container } = show(young(OLD))
    expect(container.querySelector('[data-young]')).toBeNull()
    expect(container.textContent).toContain('Type the top number and the bottom number.')
  })
})
