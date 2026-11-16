import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Results } from '../app/k/session/_parts/Results'
import { missedOf, reviewOf, scoreLines, stripQuestion, type MissedQuestion, type StoredItem } from '../app/k/session/[sessionId]/logic'

// P126: after a practice every question gets feedback. A right answer is confirmed and explained ("Yes, you're right." and "Why it works"),
// a wrong one is corrected as before (marked "Not yet."), and the heading says how many were right. react-dom/server only: no server, no database.

const html = (node: React.ReactElement) => {
  const el = document.createElement('div')
  el.innerHTML = renderToStaticMarkup(node)
  return el
}

const right = (n: number, over: Partial<MissedQuestion> = {}): MissedQuestion => ({
  n,
  prompt: `What is ${n} + 4?`,
  render: 'text',
  wrote: `${n + 4}`,
  right: `${n + 4}`,
  why: `the usual mistake ${n}.`,
  rightWay: `Add the ones: ${n} + 4 = ${n + 4}.`,
  correct: true,
  ...over,
})
const wrong = (n: number, over: Partial<MissedQuestion> = {}): MissedQuestion => ({
  n,
  prompt: 'Subtract one third from one half.',
  render: 'text',
  wrote: '1/99',
  right: '1/6',
  why: 'Learners may subtract the bottom numbers separately.',
  rightWay: 'One half is three sixths and one third is two sixths.',
  correct: false,
  ...over,
})
/** Five try questions, in order: all right except the number given. */
const five = (missedN: number | null, wrongOver: Partial<MissedQuestion> = {}) =>
  [1, 2, 3, 4, 5].map((n) => (n === missedN ? wrong(n, wrongOver) : right(n)))

const page = (list: MissedQuestion[]) => html(<Results firstName="Amina" missed={list} />)
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()

describe('results: every question has its card', () => {
  const el = page(five(2))
  const cards = [...el.querySelectorAll('article')]

  it('5 questions with 4 right draw 5 cards in order', () => {
    expect(cards).toHaveLength(5)
    expect(cards.map((c) => c.querySelector('h2')?.textContent)).toEqual(['Question 1', 'Question 2', 'Question 3', 'Question 4', 'Question 5'])
    expect(cards.map((c) => c.getAttribute('data-verdict'))).toEqual(['right', 'missed', 'right', 'right', 'right'])
  })

  it('each right answer is confirmed with the learner answer and why it works', () => {
    const confirmed = cards.filter((c) => c.getAttribute('data-verdict') === 'right')
    expect(confirmed).toHaveLength(4)
    for (const card of confirmed) {
      const n = Number(card.querySelector('h2')?.textContent?.replace('Question ', ''))
      expect(text(card)).toContain("Yes, you're right.")
      expect(text(card)).toContain('You wrote')
      expect(text(card)).toContain(`You wrote${n + 4}`)
      expect(text(card)).toContain('Why it works:')
      expect(text(card)).toContain(`Add the ones: ${n} + 4 = ${n + 4}.`)
      // a right answer has no line about a usual mistake, no correction and no "Not yet."
      expect(text(card)).not.toContain('the usual mistake')
      expect(text(card)).not.toContain('Why:')
      expect(text(card)).not.toContain('The right way')
      expect(text(card)).not.toContain('Right answer')
      expect(text(card)).not.toContain('Not yet.')
    }
  })

  it('the wrong answer is corrected as it always was and marked Not yet.', () => {
    const card = cards[1]!
    expect(text(card)).toContain('Not yet.')
    expect(text(card)).toContain('You wrote')
    expect(text(card)).toContain('Right answer')
    expect(text(card)).toContain('Why: Learners may subtract the bottom numbers separately.')
    expect(text(card)).toContain('The right way')
    expect(text(card)).toContain('One half is three sixths and one third is two sixths.')
    expect(text(card)).not.toContain("Yes, you're right.")
    expect(text(card)).not.toContain('Why it works')
  })

  it('exactly 4 confirmations and 1 correction on the page', () => {
    expect(el.querySelectorAll('[data-verdict="right"]')).toHaveLength(4)
    expect(el.querySelectorAll('[data-verdict="missed"]')).toHaveLength(1)
    expect(text(el).split("Yes, you're right.").length - 1).toBe(4)
    expect(text(el).split('Why it works:').length - 1).toBe(4)
    expect(text(el).split('The right way').length - 1).toBe(1)
  })

  it('a right answer written as a fraction is drawn stacked, like every other answer on the screen', () => {
    const card = page([right(1, { prompt: 'What is 1/2 + 1/4?', wrote: '3/4', right: '3/4', rightWay: '1/2 is the same as 2/4. Then 2/4 + 1/4 = 3/4.' })]).querySelector('article')!
    const stacked = [...card.querySelectorAll('span.inline-flex.flex-col')].map((f) => f.textContent)
    // the learner answer (3 over 4), then each fraction of the sentence under "Why it works"
    expect(stacked).toContain('34')
    expect(stacked.length).toBeGreaterThanOrEqual(4)
    expect(text(card)).toContain("Yes, you're right.")
  })

  it('every card is named by its heading', () => {
    for (const card of cards) {
      const id = card.getAttribute('aria-labelledby')!
      expect(card.querySelector(`#${id}`)?.tagName).toBe('H2')
    }
  })
})

describe('results: the heading says how many were right, then one kind line', () => {
  const lines = (list: MissedQuestion[]) => {
    const el = page(list)
    return { score: text(el.querySelector('[data-score]')), cheer: text(el.querySelector('[data-cheer]')), h1: text(el.querySelector('h1')) }
  }
  const score = (rightCount: number) => [1, 2, 3, 4, 5].map((n) => (n <= rightCount ? right(n) : wrong(n)))

  it('5 of 5: every one right, well done', () => {
    expect(lines(score(5))).toEqual({ h1: 'You finished, Amina!', score: 'You got 5 of 5 right.', cheer: 'Every one right. Well done.' })
  })

  it('4 of 5: good work, look at the one to fix', () => {
    expect(lines(score(4))).toMatchObject({ score: 'You got 4 of 5 right.', cheer: 'Good work. Look at the one to fix below.' })
  })

  it('3 of 5: good work, look at the 2 to fix', () => {
    expect(lines(score(3))).toMatchObject({ score: 'You got 3 of 5 right.', cheer: 'Good work. Look at the 2 to fix below.' })
  })

  it.each([2, 1, 0])('%i of 5: go through them together', (n) => {
    expect(lines(score(n))).toMatchObject({ score: `You got ${n} of 5 right.`, cheer: "Let's go through them together." })
  })

  it('scoreLines is the same words by score, for any number of questions', () => {
    expect(scoreLines(5, 5)).toEqual({ score: 'You got 5 of 5 right.', cheer: 'Every one right. Well done.' })
    expect(scoreLines(4, 5).cheer).toBe('Good work. Look at the one to fix below.')
    expect(scoreLines(3, 5).cheer).toBe('Good work. Look at the 2 to fix below.')
    expect(scoreLines(2, 5).cheer).toBe("Let's go through them together.")
    expect(scoreLines(0, 5).cheer).toBe("Let's go through them together.")
    expect(scoreLines(3, 4).cheer).toBe('Good work. Look at the one to fix below.')
    expect(scoreLines(1, 1)).toEqual({ score: 'You got 1 of 1 right.', cheer: 'Every one right. Well done.' })
  })

  it('never ranks the learner against anyone', () => {
    for (const n of [0, 1, 2, 3, 4, 5]) {
      const all = text(page(score(n)))
      expect(all).not.toMatch(/class|rank|best|top of|everyone|other learners|percent|%/i)
    }
  })

  it('no questions at all keeps the short line, with no count', () => {
    const el = page([])
    expect(el.querySelectorAll('article')).toHaveLength(0)
    expect(el.querySelector('[data-score]')).toBeNull()
    expect(text(el)).toContain('Nice work. There is nothing to go over this time.')
  })

  it('a list that only holds misses (no answer says whether it was right) states no count', () => {
    const el = page([wrong(2, { correct: undefined })])
    expect(el.querySelector('[data-score]')).toBeNull()
    expect(text(el)).toContain("Let's look at this 1 together.")
    expect(text(el)).not.toContain('You got')
    expect(el.querySelectorAll('[data-verdict="missed"]')).toHaveLength(1)
  })
})

describe('results: an answer on paper gets the same feedback', () => {
  const paper = [right(1), wrong(2, { wrote: '', unread: true }), right(3), right(4), right(5)]

  it('4 right and 1 that could not be read: 5 cards, the unread one says so, the count is 4 of 5', () => {
    const el = page(paper)
    expect(el.querySelectorAll('article')).toHaveLength(5)
    expect(text(el.querySelector('[data-score]'))).toBe('You got 4 of 5 right.')
    expect(el.querySelectorAll('[data-verdict="right"]')).toHaveLength(4)
    const missed = el.querySelector('[data-verdict="missed"]')!
    expect(text(missed)).toContain('Not yet.')
    expect(text(missed)).toContain('Jemma could not read this one')
    expect(text(missed)).toContain('Right answer')
    expect(text(missed)).toContain('The right way')
  })

  it('the answers read from the paper are confirmed too', () => {
    const el = page(paper)
    const card = el.querySelector('[data-verdict="right"]')!
    expect(text(card)).toContain("Yes, you're right.")
    expect(text(card)).toContain('Why it works:')
  })
})

describe('reviewOf: every try question, in order, as the results card needs it', () => {
  const stored = (phase: 'warmup' | 'try', position: number, correct: boolean, answer: string): StoredItem => ({
    phase,
    position,
    question: {
      prompt: `Question text ${phase} ${position}`,
      render: 'text',
      answerKind: 'fraction',
      answer: '3/4',
      why: `why ${position}`,
      rightWay: `way ${position}`,
      difficulty: 2,
    } as StoredItem['question'],
    answer,
    correct,
    difficulty: 2,
    seconds: 10,
  })
  const items = [
    stored('warmup', 1, true, '3/4'),
    stored('try', 2, false, '1/2'),
    stored('try', 1, true, '3/4'),
    stored('try', 3, true, '3/4'),
  ]

  it('lists the try questions only, ordered, each marked right or missed', () => {
    const all = reviewOf(items)
    expect(all.map((q) => [q.n, q.correct, q.wrote, q.why, q.rightWay])).toEqual([
      [1, true, '3/4', 'why 1', 'way 1'],
      [2, false, '1/2', 'why 2', 'way 2'],
      [3, true, '3/4', 'why 3', 'way 3'],
    ])
    expect(all.every((q) => q.right === '3/4')).toBe(true)
  })

  it('missedOf is still the missed ones only', () => {
    expect(missedOf(items).map((q) => q.n)).toEqual([2])
  })

  it('an unread paper answer is missed, empty and flagged', () => {
    const unread = { ...stored('try', 4, false, ''), unread: true }
    const q = reviewOf([...items, unread]).find((x) => x.n === 4)!
    expect(q).toMatchObject({ correct: false, wrote: '', unread: true })
  })
})

describe('results: worked steps, "How to get there", on every card that has them', () => {
  const STEPS = ['x/2 + 6 = 10', 'x/2 = 4', 'x = 8']
  const heading = (card: Element) => [...card.querySelectorAll('span')].find((x) => x.textContent === 'How to get there')

  it('a right card with steps shows the heading and each line, before the explanation', () => {
    const card = page([right(1, { steps: STEPS })]).querySelector('article')!
    expect(heading(card)).toBeDefined()
    expect(card.querySelectorAll('[data-steps] li')).toHaveLength(3)
    const srLines = [...card.querySelectorAll('[data-steps] li')].map((li) => [...li.querySelectorAll('.sr-only')].map((x) => x.textContent).join(' '))
    expect(srLines).toEqual(['x/2 + 6 = 10', 'x/2 = 4', 'x = 8'])
    // steps first, then the "Why it works:" sentence
    const all = text(card)
    expect(all.indexOf('How to get there')).toBeGreaterThan(all.indexOf("Yes, you're right."))
    expect(all.indexOf('How to get there')).toBeLessThan(all.indexOf('Why it works:'))
  })

  it('a missed card with steps shows them too, after the usual mistake and before the right way', () => {
    const card = page([wrong(2, { steps: STEPS })]).querySelector('article')!
    expect(heading(card)).toBeDefined()
    expect(card.querySelectorAll('[data-steps] li')).toHaveLength(3)
    const all = text(card)
    expect(all.indexOf('Why: Learners')).toBeLessThan(all.indexOf('How to get there'))
    expect(all.indexOf('How to get there')).toBeLessThan(all.indexOf('The right way'))
    expect(all).toContain('One half is three sixths and one third is two sixths.')
    expect(all).toContain('Not yet.')
  })

  it('every card of a practice with steps shows its own steps', () => {
    const list = [1, 2, 3, 4, 5].map((n) => (n === 2 ? wrong(n, { steps: ['a = 1', 'a + a = 2'] }) : right(n, { steps: ['b = 3', 'b + 1 = 4', 'b + 1 + 1 = 5'] })))
    const el = page(list)
    expect(el.querySelectorAll('[data-steps]')).toHaveLength(5)
    expect(el.querySelectorAll('[data-steps] li')).toHaveLength(4 * 3 + 2)
  })

  it('a card without steps (primary and older lessons) is as it was: no heading, the right way as today', () => {
    const el = page(five(2))
    expect(el.querySelectorAll('[data-steps]')).toHaveLength(0)
    expect(text(el)).not.toContain('How to get there')
    expect(text(el)).toContain('Why it works:')
    expect(text(el)).toContain('The right way')
    // and an empty list of steps is the same as none
    const empty = page([right(1, { steps: [] }), wrong(2, { steps: [] })])
    expect(empty.querySelectorAll('[data-steps]')).toHaveLength(0)
    expect(text(empty)).not.toContain('How to get there')
  })

  it('the lines go through the shared maths text: a power is raised, a fraction is stacked, the plain words stay for a screen reader', () => {
    const card = page([right(1, { steps: ['x^2 + 4x + 4', '1/2 = 3/6'] })]).querySelector('[data-steps]')!
    const [power, fraction] = [...card.querySelectorAll('li')]
    // Typeset by KaTeX since P125b: the power is raised, each fraction is stacked.
    expect(power!.querySelector('.msupsub')?.textContent).toBe('2')
    expect(power!.querySelector('.sr-only')?.textContent).toContain('x^2')
    expect(fraction!.querySelectorAll('.mfrac').length).toBe(2)
  })

  it('a long line of terms is never cut between a sign and its number: the whole line is one piece of maths that does not break inside itself', () => {
    const card = page([wrong(2, { steps: ['3x + 12 + 0 = 3x + 12'] })]).querySelector('[data-steps]')!
    const pieces = [...card.querySelectorAll('[data-math]')]
    // P135: one piece (it was one piece per term), drawn as one unbreakable block that is scaled to its box when it is wider.
    expect(pieces).toHaveLength(1)
    const piece = pieces[0] as HTMLElement
    expect(piece.style.whiteSpace).toBe('nowrap')
    expect((piece.textContent ?? '').replace(/\s+/g, '')).toContain('3x+12+0=3x+12')
  })

  it('reviewOf carries the steps a question has, only the lines that are words, and no key when there are none', () => {
    const q = (extra: Record<string, unknown>, position: number): StoredItem => ({
      phase: 'try',
      position,
      question: { prompt: 'Solve', render: 'text', answerKind: 'whole', answer: '8', why: 'w', rightWay: 'r', difficulty: 2, ...extra } as StoredItem['question'],
      answer: '8',
      correct: true,
      difficulty: 2,
      seconds: 5,
    })
    const [withSteps, odd, none, emptyOnes] = reviewOf([q({ steps: STEPS }, 1), q({ steps: ['ok', 3, '', '  ', null, 'fine'] }, 2), q({}, 3), q({ steps: [] }, 4)])
    expect(withSteps!.steps).toEqual(STEPS)
    expect(odd!.steps).toEqual(['ok', 'fine'])
    expect(none).not.toHaveProperty('steps')
    expect(emptyOnes).not.toHaveProperty('steps')
    // a steps field that is not a list is ignored
    expect(reviewOf([q({ steps: 'x = 8' }, 1)])[0]).not.toHaveProperty('steps')
  })

  it('the question the learner sees while answering never carries the steps', () => {
    const asked = stripQuestion({ prompt: 'Solve x/2 + 6 = 10', render: 'text', answerKind: 'whole', answer: '8', why: 'w', rightWay: 'r', difficulty: 2, steps: STEPS } as unknown as Parameters<typeof stripQuestion>[0], { position: 3, phase: 'try', index: 1, of: 5 })
    expect(asked).not.toHaveProperty('steps')
    expect(JSON.stringify(asked)).not.toContain('x/2 = 4')
  })
})
