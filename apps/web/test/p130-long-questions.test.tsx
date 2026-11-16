import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { promptLayout, sentencesOf, SHORT_PROMPT, besideNumber } from '../app/k/session/_parts/prompt-layout'
import { Results } from '../app/k/session/_parts/Results'
import type { MissedQuestion, QuestionForChild } from '../app/k/session/[sessionId]/logic'

// P130: a question may be long. A word problem is a few sentences of context in normal text and then the maths line, large and typeset; nothing is
// cut off, the card grows and the page scrolls. A short question is drawn exactly as it always was (the P86 pins prove it). react-dom only: no server,
// no browser. What this cannot see (how it wraps at 360 px) is in the handoff, not in these tests.

const ask = (over: Partial<QuestionForChild>): QuestionForChild => ({ position: 3, phase: 'try', index: 1, of: 5, prompt: 'Work it out', render: 'text', answerKind: 'whole', ...over })
const dom = (node: React.ReactElement) => {
  const el = document.createElement('div')
  el.innerHTML = renderToStaticMarkup(node)
  return el
}
const screen = (q: QuestionForChild) => dom(<QuestionScreen q={q} busy={false} onAnswer={() => {}} />)
const card = (over: Partial<MissedQuestion>): MissedQuestion => ({ n: 2, prompt: 'Complete: 3/5 = ?/15', render: 'text', wrote: '5/15', right: '9/15', why: 'you changed only the top.', rightWay: '3/5 is the same as 9/15.', ...over })
const results = (m: MissedQuestion) => dom(<Results firstName="Amina" missed={[m]} />)

const CONTEXT = 'Thandi had some money. She spent R15 on a book and R20 on a ticket, and she has R65 left.'
const MATHS = 'Solve: x - 15 - 20 = 65'
const WORD_PROBLEM = `${CONTEXT} ${MATHS}`

/** What is drawn in an element: its text without the words kept for a screen reader. */
const drawn = (el: Element) => {
  const copy = el.cloneNode(true) as HTMLElement
  copy.querySelectorAll('.sr-only').forEach((e) => e.remove())
  return copy.textContent ?? ''
}

describe('the sentences of a prompt', () => {
  it('are cut after a full stop, a question mark or an exclamation mark that is followed by a new sentence', () => {
    expect(sentencesOf('Thandi has 5 apples. She buys 3 more! How many now? Solve: x + 3 = 8')).toEqual(['Thandi has 5 apples.', 'She buys 3 more!', 'How many now?', 'Solve: x + 3 = 8'])
  })

  it('are not cut inside a decimal, an amount of money or before a small letter', () => {
    expect(sentencesOf('A rope is 2.5 m and costs R4,50 per metre.')).toEqual(['A rope is 2.5 m and costs R4,50 per metre.'])
    expect(sentencesOf('Use approx. three of them.')).toEqual(['Use approx. three of them.'])
  })

  it('are cut at a colon that ends a line, when the maths is on the next line', () => {
    expect(sentencesOf('Work out the value below:\n2x + 3 = 11')).toEqual(['Work out the value below:', '2x + 3 = 11'])
  })

  it('a prompt without a cut is one sentence, and an empty one is none', () => {
    expect(sentencesOf('Expand: (x + 2)(x + 3)')).toEqual(['Expand: (x + 2)(x + 3)'])
    expect(sentencesOf('   ')).toEqual([])
  })
})

describe('the layout of a prompt', () => {
  it('a short maths line is one block, as it always was', () => {
    const l = promptLayout('Expand: (x + 2)(x + 3)', 'all')
    expect(l).toMatchObject({ split: false, before: '', after: '', line: 'Expand: (x + 2)(x + 3)', step: 0 })
  })

  it('a short prompt of two sentences stays one block (the demo class draws it as before)', () => {
    const prompt = 'A pen costs R4,50. What do 3 pens cost?'
    expect(prompt.length).toBeLessThanOrEqual(SHORT_PROMPT)
    expect(promptLayout(prompt, 'algebra')).toMatchObject({ split: false, line: prompt, step: 0 })
  })

  it('a word problem is its context and then the maths line', () => {
    expect(promptLayout(WORD_PROBLEM, 'all')).toEqual({ split: true, before: CONTEXT, line: MATHS, after: '', step: 0 })
  })

  it('the maths line is the last sentence that holds maths: a sentence after it is context too', () => {
    const prompt = 'Thandi had some money and spent some of it at the shop. Solve: x - 15 = 65. Then write down what you found.'
    expect(promptLayout(prompt, 'all')).toEqual({
      split: true,
      before: 'Thandi had some money and spent some of it at the shop.',
      line: 'Solve: x - 15 = 65.',
      after: 'Then write down what you found.',
      step: 0,
    })
  })

  it('a word problem with no maths in it has its question, the last sentence, as the large line', () => {
    const prompt = 'Thabo has two thirds of a chocolate bar and gives one quarter to a friend. How much does he have left?'
    expect(promptLayout(prompt, 'algebra')).toEqual({
      split: true,
      before: 'Thabo has two thirds of a chocolate bar and gives one quarter to a friend.',
      line: 'How much does he have left?',
      after: '',
      step: 0,
    })
  })

  it('a stacked fraction in a sentence counts as maths', () => {
    const prompt = 'You have a bar of chocolate and you eat some of it today. Complete: 3/5 = ?/15'
    expect(promptLayout(prompt, 'algebra')).toMatchObject({ before: 'You have a bar of chocolate and you eat some of it today.', line: 'Complete: 3/5 = ?/15' })
  })

  it('the size steps down with the length of the line: short, then 60 to 110 letters, then longer', () => {
    const line = (n: number) => 'W'.repeat(n)
    expect(promptLayout(line(10), 'all').step).toBe(0)
    expect(promptLayout(line(SHORT_PROMPT), 'all').step).toBe(0)
    expect(promptLayout(line(SHORT_PROMPT + 1), 'all').step).toBe(1)
    expect(promptLayout(line(110), 'all').step).toBe(1)
    expect(promptLayout(line(111), 'all').step).toBe(2)
    // the context does not count: a long context with a short line keeps the big size
    expect(promptLayout(WORD_PROBLEM, 'all').step).toBe(0)
  })

  it('a long maths line takes a smaller step', () => {
    const prompt = `${CONTEXT} Solve: 3x + 5 = 2x + 17, and then work it out again when x is 4 and x is 9 and x is 12`
    const l = promptLayout(prompt, 'all')
    expect(l.split).toBe(true)
    expect(l.step).toBeGreaterThan(0)
  })

  it('beside the number of a results card only a very short question fits', () => {
    expect(besideNumber('Complete: 3/5 = ?/15')).toBe(true)
    expect(besideNumber('Write 7/2 as a mixed number')).toBe(true)
    expect(besideNumber('Thabo has two thirds of a chocolate bar and gives one quarter to a friend.')).toBe(false)
    expect(besideNumber('A pen costs R4,50. What do 3 pens cost?')).toBe(false)
  })
})

describe('the question screen, a long question', () => {
  const q = ask({ prompt: WORD_PROBLEM, answerKind: 'equation' })

  it('the context is body text and the maths line is large and typeset', () => {
    const page = screen(q)
    const context = page.querySelector('[data-context]')!
    expect(drawn(context)).toBe(CONTEXT)
    const cls = [...context.classList]
    expect(cls).toContain('text-[18px]')
    expect(cls).toContain('font-normal')
    expect(cls).not.toContain('font-bold')
    expect(cls).not.toContain('text-center')
    expect(context.querySelector('.katex')).toBeNull()
    const line = page.querySelector('[data-maths-line]')!
    expect(line.querySelector('.katex')).toBeTruthy()
    expect([...line.classList]).toContain('font-bold')
    expect([...line.classList]).toContain('text-[30px]')
    // the maths line comes after the context
    expect(context.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('data-prompt and the plain words for a screen reader are the whole prompt, as they were', () => {
    const page = screen(q)
    const h1 = page.querySelector('h1[data-prompt]')!
    expect(h1.getAttribute('data-prompt')).toBe(WORD_PROBLEM)
    expect(page.querySelectorAll('h1[data-prompt]')).toHaveLength(1)
    expect(h1.querySelector('.sr-only')!.textContent).toBe(WORD_PROBLEM)
    // the drawing is hidden from a screen reader: the words are read once
    for (const part of h1.querySelectorAll('[data-context], [data-maths-line]')) expect(part.getAttribute('aria-hidden')).toBe('true')
    // the heading holds all of it, so the picture and the box sit below the whole question
    expect(h1.contains(page.querySelector('[data-context]'))).toBe(true)
    expect(h1.contains(page.querySelector('[data-maths-line]'))).toBe(true)
  })

  it('the answer box comes after the question and nothing in the question has a fixed height or is cut off', () => {
    const html = renderToStaticMarkup(<QuestionScreen q={q} busy={false} onAnswer={() => {}} />)
    // The answer box is the maths editor since P132.
    expect(html.indexOf('<math-field')).toBeGreaterThan(html.indexOf('data-maths-line'))
    const page = dom(<QuestionScreen q={q} busy={false} onAnswer={() => {}} />)
    const h1 = page.querySelector('h1[data-prompt]')!
    for (const el of [h1, ...h1.querySelectorAll('*')]) {
      for (const c of el.classList) expect(c, `${el.tagName}.${c}`).not.toMatch(/^(h-|max-h-|overflow-hidden|truncate|line-clamp|text-nowrap|whitespace-nowrap)/)
    }
  })

  it('a long word wraps instead of pushing the page sideways (a 360 px phone)', () => {
    const h1 = screen(q).querySelector('h1[data-prompt]')!
    expect([...h1.classList]).toEqual(expect.arrayContaining(['w-full', 'min-w-0']))
    for (const part of h1.querySelectorAll('[data-context], [data-maths-line]')) expect([...part.classList]).toContain('[overflow-wrap:anywhere]')
  })

  it('a prompt of three sentences of words has its first two as context and the question as the large line', () => {
    const prompt = 'Thabo has two thirds of a chocolate bar. He gives one quarter of the whole bar to a friend. How much does he have left?'
    const page = screen(ask({ prompt, answerKind: 'fraction' }))
    expect(drawn(page.querySelector('[data-context]')!)).toBe('Thabo has two thirds of a chocolate bar. He gives one quarter of the whole bar to a friend.')
    expect(drawn(page.querySelector('[data-maths-line]')!)).toBe('How much does he have left?')
    expect(page.querySelector('h1')!.getAttribute('data-prompt')).toBe(prompt)
  })

  it('the maths of the context is typeset too, at the size of the words', () => {
    const page = screen(ask({ prompt: 'Let x = 3 and then think about it for a while before you go on. Find 2x + 1', answerKind: 'expression' }))
    expect(page.querySelector('[data-context] .katex')).toBeTruthy()
    expect(page.querySelector('[data-maths-line] .katex')).toBeTruthy()
  })

  it('a warm-up question has the same split, left aligned', () => {
    const page = screen(ask({ prompt: WORD_PROBLEM, answerKind: 'equation', phase: 'warmup', of: 2 }))
    expect(drawn(page.querySelector('[data-context]')!)).toBe(CONTEXT)
    const line = page.querySelector('[data-maths-line]')!
    expect(line.querySelector('.katex')).toBeTruthy()
    expect([...line.classList]).toContain('text-[28px]')
    expect([...line.classList]).not.toContain('text-center')
    expect(page.querySelector('h1[data-prompt]')!.getAttribute('data-prompt')).toBe(WORD_PROBLEM)
  })

  it('a missing number in a long question still has its one box, in the fraction', () => {
    const prompt = 'You have a bar of chocolate and you eat some of it today. Complete: 3/5 = ?/15'
    const page = screen(ask({ prompt, answerKind: 'fraction' }))
    expect(page.querySelectorAll('input[type="text"]')).toHaveLength(1)
    expect(page.querySelector('h1[data-prompt]')!.getAttribute('data-prompt')).toBe(prompt)
    // the context is body text above, and only the line with the fraction is drawn big
    expect(drawn(page.querySelector('[data-context]')!)).toBe('You have a bar of chocolate and you eat some of it today.')
    expect(page.querySelector('[data-context]')!.className).toContain('text-[18px]')
    expect(page.querySelector('input#missing')!.closest('span.inline-flex')!.textContent).toContain('15')
  })
})

describe('the question screen, a short question is what it was', () => {
  it('"Expand: (x + 2)(x + 3)" is one heading with its words and its maths, no context and no maths line', () => {
    const page = screen(ask({ prompt: 'Expand: (x + 2)(x + 3)', answerKind: 'expression' }))
    const h1 = page.querySelector('h1[data-prompt]')!
    expect(h1.className).toBe('m-0 text-center text-[30px] leading-[1.2] font-bold')
    expect(h1.getAttribute('data-prompt')).toBe('Expand: (x + 2)(x + 3)')
    expect(page.querySelector('[data-context]')).toBeNull()
    expect(page.querySelector('[data-maths-line]')).toBeNull()
    expect([...h1.children].map((c) => c.className)).toEqual(['sr-only', ''])
    expect(h1.querySelector('.sr-only')!.textContent).toBe('Expand: (x + 2)(x + 3)')
    expect(h1.querySelector('.katex')).toBeTruthy()
  })

  it('a warm-up question keeps its own heading', () => {
    const h1 = screen(ask({ prompt: 'Which is bigger?', phase: 'warmup', of: 2, answerKind: 'choice', choices: ['1/4', '1/2', 'the same', 'none'] })).querySelector('h1[data-prompt]')!
    expect(h1.className).toBe('m-0 text-[28px] leading-[1.2] font-semibold')
  })

  it('one long sentence is one block that steps down in size and wraps', () => {
    const sentence = (n: number) => `${'Work out the total cost of everything '.repeat(Math.ceil(n / 38))}`.slice(0, n).trim()
    const classOf = (n: number) => screen(ask({ prompt: sentence(n), answerKind: 'whole' })).querySelector('h1[data-prompt]')!.className
    expect(classOf(40)).toContain('text-[30px]')
    expect(classOf(80)).toContain('text-[26px]')
    expect(classOf(130)).toContain('text-[22px]')
    expect(classOf(130)).toContain('[overflow-wrap:anywhere]')
    const page = screen(ask({ prompt: sentence(130), answerKind: 'whole' }))
    expect(page.querySelector('[data-context]')).toBeNull()
    expect(page.querySelector('h1[data-prompt]')!.getAttribute('data-prompt')).toBe(sentence(130))
  })
})

describe('the results card', () => {
  it('a long question sits under "Question N", full width, with the same split', () => {
    const page = results(card({ prompt: WORD_PROBLEM, wrote: 'x = 90', right: 'x = 100' }))
    const heading = page.querySelector('h2')!
    expect(heading.textContent).toBe('Question 2')
    const question = page.querySelector('[data-question]')!
    // the number and the question are one above the other, not in one row
    expect(heading.parentElement).toBe(question.parentElement)
    expect([...heading.parentElement!.classList]).toContain('flex-col')
    expect([...heading.parentElement!.classList]).not.toContain('justify-between')
    expect([...question.classList]).toEqual(expect.arrayContaining(['w-full', 'min-w-0']))
    expect([...question.classList]).not.toContain('text-right')
    expect(drawn(question.querySelector('[data-context]')!)).toBe(CONTEXT)
    expect(question.querySelector('[data-context] .katex')).toBeNull()
    expect(question.querySelector('[data-maths-line] .katex')).toBeTruthy()
    expect([...question.querySelector('[data-maths-line]')!.classList]).toContain('font-bold')
    // the screen reader still gets the whole prompt, once
    expect(question.querySelector('.sr-only')!.textContent).toBe(WORD_PROBLEM)
  })

  it('a long question of one sentence also goes full width and steps down', () => {
    const prompt = 'Write zero comma seven five as a fraction in simplest form, and then give the answer.'
    const page = results(card({ prompt }))
    const question = page.querySelector('[data-question]')!
    expect([...question.classList]).toContain('w-full')
    expect(page.querySelector('h2')!.parentElement).toBe(question.parentElement)
    expect(question.textContent).toBe(prompt)
  })

  it('a short question stays beside the number, as it was', () => {
    const page = results(card({}))
    const heading = page.querySelector('h2')!
    expect([...heading.parentElement!.classList]).toContain('justify-between')
    const question = page.querySelector('[data-question]')!
    expect(question.parentElement).toBe(heading.parentElement)
    expect(question.className).toBe('flex items-center justify-end gap-2 text-right text-[24px] font-bold')
    expect(page.querySelector('[data-context]')).toBeNull()
  })
})
