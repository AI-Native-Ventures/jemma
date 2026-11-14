import { renderToStaticMarkup } from 'react-dom/server'
import type { Question, SeniorDiagramSpec } from '@jemma/profiling/schemas'
import { describe, expect, it } from 'vitest'
import { PaperSheet } from '../app/k/session/_parts/Paper'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { PreviewBars } from '../app/k/session/_parts/PreviewBars'
import { Results } from '../app/k/session/_parts/Results'
import { missedOf, stripQuestion, type MissedQuestion, type QuestionForChild, type StoredItem } from '../app/k/session/[sessionId]/logic'

// P87, decision 2: a picture inside a question (senior classes only). It is drawn between the words and the answer box, under the question on the
// paper sheet, and under the heading on the results screen. A question without one draws exactly what it drew (the pins are in p86-old-kinds-pinned).
// react-dom only: no server, no browser.

const LINE: SeniorDiagramSpec = { kind: 'coordinate_plane', xMin: -5, xMax: 5, yMin: -5, yMax: 5, graphs: [{ type: 'line', m: 2, c: 1 }] }
const TRIANGLE: SeniorDiagramSpec = { kind: 'triangle', vertices: ['A', 'B', 'C'], angles: [90, 60, 30], angleLabels: ['', '', 'x'] }
const LINE_LABEL = 'A grid from -5 to 5 with a straight line'
const TRIANGLE_LABEL = 'Triangle ABC. Right angle at A. Angle C is x.'

const ask = (over: Partial<QuestionForChild>): QuestionForChild => ({
  position: 3,
  phase: 'try',
  index: 1,
  of: 5,
  prompt: 'What is the gradient of this line?',
  render: 'text',
  answerKind: 'number',
  ...over,
})
const screen = (q: QuestionForChild) => renderToStaticMarkup(<QuestionScreen q={q} busy={false} onAnswer={() => {}} />)
const dom = (markup: string) => {
  const el = document.createElement('div')
  el.innerHTML = markup
  return el
}
/** Where the first picture starts in a piece of markup: an svg with the role of an image (the little diamonds and gems are not). */
const picAt = (html: string) => html.search(/<svg[^>]*role="img"/)
const pictures = (el: Element) => [...el.querySelectorAll('svg[role="img"]')].map((s) => s.getAttribute('aria-label'))

describe('the question screen', () => {
  it('draws the picture between the words and the answer box (a try question)', () => {
    const html = screen(ask({ diagram: LINE }))
    const page = dom(html)
    expect(pictures(page)).toEqual([LINE_LABEL])
    const prompt = html.indexOf('data-prompt=')
    const picture = picAt(html)
    const box = html.indexOf('<input')
    expect(prompt).toBeGreaterThan(-1)
    expect(picture).toBeGreaterThan(prompt)
    expect(box).toBeGreaterThan(picture)
  })

  it('draws it between the words and the answer box (a warm-up question) and for a triangle', () => {
    const html = screen(ask({ phase: 'warmup', of: 2, diagram: TRIANGLE, answerKind: 'number' }))
    expect(pictures(dom(html))).toEqual([TRIANGLE_LABEL])
    expect(picAt(html)).toBeGreaterThan(html.indexOf('data-prompt='))
    expect(html.indexOf('<input')).toBeGreaterThan(picAt(html))
  })

  it('is at most 300 px tall on a phone, and as wide as the card', () => {
    const wrapper = dom(screen(ask({ diagram: LINE }))).querySelector('[data-picture]')!
    expect(wrapper.className).toContain('w-full')
    expect(wrapper.className).toContain('[&_svg]:max-h-[300px]')
    expect(wrapper.querySelector('svg')).not.toBeNull()
  })

  it('uses the plain description: the equation of the line is not in it', () => {
    const page = dom(screen(ask({ diagram: LINE })))
    expect(page.querySelector('svg')!.getAttribute('aria-label')).not.toMatch(/y =|2x/)
  })

  it('a picture that makes no sense is "Picture missing", and the question can still be answered', () => {
    const page = dom(screen(ask({ diagram: { ...LINE, xMin: 5, xMax: -5 } as SeniorDiagramSpec })))
    expect(page.textContent).toContain('Picture missing')
    expect(page.querySelector('input')).not.toBeNull()
  })

  it('a question without a picture draws no picture and no wrapper', () => {
    const html = screen(ask({}))
    expect(picAt(html)).toBe(-1)
    expect(html).not.toContain('data-picture')
  })

  it('a choice question with a picture draws it above the choices', () => {
    const html = screen(ask({ answerKind: 'choice', choices: ['1', '2', '3', '4'], diagram: LINE }))
    expect(picAt(html)).toBeGreaterThan(-1)
    expect(picAt(html)).toBeLessThan(html.indexOf('<button'))
    expect(pictures(dom(html))).toContain(LINE_LABEL)
  })
})

describe('the paper sheet', () => {
  const sheet = (questions: QuestionForChild[]) => dom(renderToStaticMarkup(<PaperSheet questions={questions} busy={false} error={null} onPhoto={() => {}} onScreen={() => {}} />))
  const five = (over: Record<number, Partial<QuestionForChild>> = {}) =>
    [1, 2, 3, 4, 5].map((i) => ask({ index: i, position: i, prompt: `Question number ${i}`, ...over[i] }))

  it('draws the picture under its question, before the line that says how to write the answer', () => {
    const page = sheet(five({ 2: { diagram: LINE }, 4: { diagram: TRIANGLE } }))
    expect(pictures(page)).toEqual([LINE_LABEL, TRIANGLE_LABEL])
    const second = page.querySelector('li[data-n="2"]')!
    const html = second.innerHTML
    expect(picAt(html)).toBeGreaterThan(html.indexOf('Question number 2'))
    expect(html.indexOf('Write a number')).toBeGreaterThan(picAt(html))
  })

  it('a sheet with no picture is what it was', () => {
    const page = sheet(five())
    expect(pictures(page)).toEqual([])
    expect(page.innerHTML).not.toContain('data-picture')
  })
})

describe('the results screen', () => {
  const missed = (over: Partial<MissedQuestion>): MissedQuestion => ({
    n: 2,
    prompt: 'What is the gradient of this line?',
    render: 'text',
    wrote: '3',
    right: '2',
    why: 'the line goes up 2 for each 1 across.',
    rightWay: 'Rise over run: 2 / 1 = 2.',
    ...over,
  })
  const results = (list: MissedQuestion[]) => dom(renderToStaticMarkup(<Results firstName="Sam" missed={list} />))

  it('draws the picture under the question heading, above the answers', () => {
    const page = results([missed({ diagram: LINE })])
    const html = page.querySelector('article')!.innerHTML
    expect(pictures(page)).toHaveLength(1)
    expect(picAt(html)).toBeGreaterThan(html.indexOf('Question 2'))
    expect(html.indexOf('You wrote')).toBeGreaterThan(picAt(html))
  })

  it('a missed question without a picture is what it was', () => {
    const page = results([missed({})])
    expect(pictures(page)).toEqual([])
    expect(page.innerHTML).not.toContain('data-picture')
  })
})

describe('the picture travels with the question', () => {
  const question = (over: Partial<Question>): Question => ({
    prompt: 'What is the gradient of this line?',
    render: 'text',
    answer: '2',
    answerKind: 'number',
    difficulty: 1,
    why: 'why',
    rightWay: 'right way',
    ...over,
  })
  const at = { position: 1, phase: 'try' as const, index: 1, of: 5 }

  it('stripQuestion carries the picture, and still no answer, no why, no right way', () => {
    const stripped = stripQuestion(question({ diagram: LINE }), at)
    expect(stripped.diagram).toEqual(LINE)
    expect(stripped).not.toHaveProperty('answer')
    expect(stripped).not.toHaveProperty('why')
    expect(stripped).not.toHaveProperty('rightWay')
  })

  it('a question without a picture gives the same keys as before: no "diagram" key at all', () => {
    expect(stripQuestion(question({}), at)).not.toHaveProperty('diagram')
    expect(Object.keys(stripQuestion(question({}), at))).toEqual(['position', 'phase', 'index', 'of', 'prompt', 'render', 'answerKind'])
  })

  it('missedOf carries the picture of a missed question; one without a picture has no key', () => {
    const items: StoredItem[] = [
      { phase: 'try', position: 1, question: question({ diagram: TRIANGLE }), answer: '5', correct: false, difficulty: 1, seconds: 4 },
      { phase: 'try', position: 2, question: question({ prompt: 'No picture' }), answer: '5', correct: false, difficulty: 1, seconds: 4 },
    ]
    const [a, b] = missedOf(items)
    expect(a!.diagram).toEqual(TRIANGLE)
    expect(b).not.toHaveProperty('diagram')
  })
})

describe('the small picture on the Today card', () => {
  const preview = (spec: SeniorDiagramSpec) => renderToStaticMarkup(<PreviewBars spec={spec} />)

  it('a graph or a triangle is kept small, and drawn', () => {
    for (const spec of [LINE, TRIANGLE]) {
      const html = preview(spec)
      expect(html).toContain('[&amp;_svg]:max-h-[180px]')
      expect(picAt(html)).toBeGreaterThan(-1)
    }
  })

  it('the other kinds keep the classes they had', () => {
    const html = preview({ kind: 'area_model', rows: 3, cols: 4, shaded: 12 })
    expect(html).toContain('class="rounded-[16px] bg-[#F7F6FB] p-3.5 [border-radius:16px]"')
    expect(html).not.toContain('max-h-')
  })
})
