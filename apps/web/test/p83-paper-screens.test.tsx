import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PaperChoice, PaperFailed, PaperReading, PaperSheet, writeLine } from '../app/k/session/_parts/Paper'
import { Results } from '../app/k/session/_parts/Results'
import { answerShape, type MissedQuestion, type QuestionForChild } from '../app/k/session/[sessionId]/logic'

// The screens of a practice answered on paper, drawn from their props alone with react-dom/server: the choice, the sheet of five questions, the
// wait, the card for a photo that could not be read, and the results line. No server, no browser.

const noop = () => undefined
const html = (node: React.ReactElement) => {
  const el = document.createElement('div')
  el.innerHTML = renderToStaticMarkup(node)
  return el
}
/** What is drawn in an element: its text without the words kept for a screen reader. */
const drawn = (el: Element) => {
  const copy = el.cloneNode(true) as HTMLElement
  copy.querySelectorAll('.sr-only').forEach((e) => e.remove())
  return copy.textContent ?? ''
}

const ask = (index: number, over: Partial<QuestionForChild>): QuestionForChild => ({
  position: index,
  phase: 'try',
  index,
  of: 5,
  prompt: 'Work it out',
  render: 'text',
  answerKind: 'whole',
  ...over,
})
/** The five questions of a sheet: a sum, a fraction to write, a missing number, a choice and a decimal. */
const FIVE: QuestionForChild[] = [
  ask(1, { prompt: '1/2 + 1/4', render: 'fraction_sum', terms: ['1/2', '1/4'], answerKind: 'fraction' }),
  ask(2, { prompt: 'Write 2/4 in its simplest form', answerKind: 'fraction' }),
  ask(3, { prompt: 'Complete: 3/5 = ?/15', answerKind: 'fraction' }),
  ask(4, { prompt: 'Which is bigger: 1/2 or 1/4?', answerKind: 'choice', choices: ['1/4', '1/2', 'the same', 'none'] }),
  ask(5, { prompt: '0,5 + 0,25', answerKind: 'decimal' }),
]

describe('the choice', () => {
  const page = html(<PaperChoice onPaper={noop} onScreen={noop} />)
  const buttons = [...page.querySelectorAll('button')]

  it('asks how to answer, in plain words', () => {
    expect(page.querySelector('h1')!.textContent).toBe('How do you want to answer?')
  })

  it('has two buttons: "Answer on paper" first, then "Answer on the screen"', () => {
    expect(buttons.map((b) => b.textContent)).toEqual(['Answer on paper', 'Answer on the screen'])
  })

  it('the paper button has a camera icon, and neither button is bigger than the other', () => {
    expect(buttons[0]!.querySelector('svg circle')).not.toBeNull()
    expect(buttons[0]!.className).toBe(buttons[1]!.className)
    expect(buttons[0]!.getAttribute('type')).toBe('button')
  })
})

describe('the sheet', () => {
  const page = () => html(<PaperSheet questions={FIVE} busy={false} error={null} onPhoto={noop} onScreen={noop} />)

  it('tells the child to write the answers on paper and number them 1 to 5', () => {
    expect(page().querySelector('h1')!.textContent).toBe('Write your answers on paper. Number them 1 to 5.')
  })

  it('lists the five questions numbered 1 to 5', () => {
    const items = [...page().querySelectorAll('li[data-n]')]
    expect(items.map((li) => li.getAttribute('data-n'))).toEqual(['1', '2', '3', '4', '5'])
    expect(items.map((li) => li.querySelector('[aria-hidden="true"]')!.textContent)).toEqual(['1', '2', '3', '4', '5'])
  })

  it('draws a fraction sum with its two terms stacked', () => {
    const q = page().querySelector('li[data-n="1"] h2')!
    expect(drawn(q)).toBe('12+14=')
  })

  it('draws a fraction in the words stacked, never as a slash', () => {
    const q = page().querySelector('li[data-n="2"] h2')!
    expect(drawn(q)).toBe('Write 24 in its simplest form')
    expect(q.querySelector('.sr-only')!.textContent).toBe('Write 2/4 in its simplest form')
  })

  it('draws the missing part of a fraction as an empty box, and the rest stacked', () => {
    const q = page().querySelector('li[data-n="3"] h2')!
    expect(drawn(q)).toBe('Complete: 35 = 15')
    expect(q.querySelectorAll('[data-blank]')).toHaveLength(1)
    expect(q.getAttribute('data-prompt')).toBe('Complete: 3/5 = ?/15')
  })

  it('draws a multiple choice with its choices as A, B, C, D, a fraction in a choice stacked', () => {
    const choices = [...page().querySelectorAll('li[data-n="4"] ol[aria-label="Choices"] > li')]
    expect(choices.map((c) => drawn(c))).toEqual(['A14', 'B12', 'Cthe same', 'Dnone'])
    expect(page().querySelectorAll('li[data-n="4"] ol[aria-label="Choices"] [data-blank]')).toHaveLength(0)
  })

  it('puts the line of how to write the answer under each question', () => {
    const lines = [...page().querySelectorAll('li[data-n]')].map((li) => li.querySelector('p:last-child')!.textContent)
    expect(lines).toEqual([
      'Write the top number and the bottom number.',
      'Write the top number and the bottom number.',
      'Write the missing number.',
      'Write the letter of your answer.',
      'Write a number with a comma, like 0,5.',
    ])
  })

  it('has one button that takes a photo with the camera, and a small link to answer on the screen instead', () => {
    const input = page().querySelector('input[type=file]')!
    expect(page().querySelectorAll('input[type=file]')).toHaveLength(1)
    expect(input.getAttribute('capture')).toBe('environment')
    expect(input.getAttribute('accept')).toBe('image/*')
    expect(input.closest('label')!.textContent).toBe('Take a photo of your answers')
    expect([...page().querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Answer on the screen instead'])
  })

  it('shows nothing of the key', () => {
    const text = page().textContent!
    for (const word of ['Right answer', 'The right way', 'Why:']) expect(text).not.toContain(word)
  })

  it('while the photo is being sent the button waits and says so', () => {
    const sending = html(<PaperSheet questions={FIVE} busy error={null} onPhoto={noop} onScreen={noop} />)
    expect(sending.querySelector('label')!.textContent).toBe('Sending your photo...')
    expect(sending.querySelector('input[type=file]')!.hasAttribute('disabled')).toBe(true)
    expect(sending.querySelector('button')!.hasAttribute('disabled')).toBe(true)
  })

  it('a photo that did not go shows why, in an alert', () => {
    const failed = html(<PaperSheet questions={FIVE} busy={false} error="That did not upload. Check your connection and try again." onPhoto={noop} onScreen={noop} />)
    expect(failed.querySelector('[role=alert]')!.textContent).toBe('That did not upload. Check your connection and try again.')
  })
})

describe('writeLine', () => {
  it('has a line for every kind of answer, each in words a child can follow', () => {
    const shapes = [
      { kind: 'choice' },
      { kind: 'missing', part: { unknown: 'top', known: '15' } },
      { kind: 'fraction' },
      { kind: 'mixed' },
      { kind: 'whole' },
      { kind: 'decimal' },
      { kind: 'money' },
      { kind: 'text' },
    ] as const
    for (const shape of shapes) expect(writeLine(shape), shape.kind).toMatch(/^Write [^.]+\.$/)
    expect(new Set(shapes.map((s) => writeLine(s))).size).toBe(shapes.length)
  })

  it('follows the shape the question screen uses', () => {
    expect(writeLine(answerShape(FIVE[2]!))).toBe('Write the missing number.')
    expect(writeLine(answerShape(FIVE[3]!))).toBe('Write the letter of your answer.')
  })
})

describe('while Jemma reads the photo', () => {
  const page = html(<PaperReading />)

  it('says so, and that it takes about a minute', () => {
    expect(page.querySelector('h1')!.textContent).toBe('Jemma is reading your answers.')
    expect(page.textContent).toContain('About a minute. You can wait here.')
  })

  it('is a status a screen reader announces, and has no button to press', () => {
    expect(page.querySelector('[role=status]')!.getAttribute('aria-live')).toBe('polite')
    expect(page.querySelectorAll('button, input, a')).toHaveLength(0)
  })
})

describe('when the photo could not be read', () => {
  const page = html(<PaperFailed busy={false} error={null} onPhoto={noop} onScreen={noop} />)

  it('says so in an alert', () => {
    expect(page.querySelector('[role=alert] h1')!.textContent).toBe('Jemma could not read your photo.')
  })

  it('offers "Take the photo again" (the camera) and "Answer on the screen instead"', () => {
    const input = page.querySelector('input[type=file]')!
    expect(input.getAttribute('capture')).toBe('environment')
    expect(input.closest('label')!.textContent).toBe('Take the photo again')
    expect([...page.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Answer on the screen instead'])
  })
})

describe('the results of a paper answer that could not be read', () => {
  const missed = (over: Partial<MissedQuestion>): MissedQuestion => ({
    n: 3,
    prompt: 'Complete: 3/5 = ?/15',
    render: 'text',
    wrote: '5/15',
    right: '9/15',
    why: 'you changed only the top.',
    rightWay: '3/5 is the same as 9/15.',
    ...over,
  })

  it('says "Jemma could not read this one" under "You wrote", in place of an empty answer', () => {
    const page = html(<Results firstName="Amina" missed={[missed({ wrote: '', unread: true })]} />)
    const tile = page.querySelector('[data-unread]')!.parentElement!
    expect(tile.textContent).toBe('You wroteJemma could not read this one')
    // no stacked answer is drawn in its place
    expect(tile.querySelectorAll('.inline-flex')).toHaveLength(0)
    // the right answer is still shown
    expect(page.textContent).toContain('Right answer')
  })

  it('an answer that was read is shown as it always was, with no such line', () => {
    const page = html(<Results firstName="Amina" missed={[missed({})]} />)
    expect(page.querySelector('[data-unread]')).toBeNull()
    expect(page.textContent).not.toContain('could not read')
    // its tiles keep the half width they had
    expect(page.innerHTML).not.toContain('col-span-2')
  })
})
