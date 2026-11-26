import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { tidyPlot, type Notation } from '@jemma/profiling/logic'
import type { Question } from '@jemma/profiling/schemas'
import { DiagramView } from '../components/diagrams'
import { NotationProvider } from '../lib/notation'
import { CAPS, keyboardLayout, keyName } from '../app/k/session/_parts/math-keyboard'
import { writeLine } from '../app/k/session/_parts/Paper'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { Results } from '../app/k/session/_parts/Results'
import { plotHint } from '../app/k/session/_parts/answers/PlotGrid'
import { answerShape, reviewOf, stripQuestion, type StoredItem } from '../app/k/session/[sessionId]/logic'

// The maths editor is stood in for by a fake (see fake-mathlive.ts): CI's browser specs use the real one.
vi.mock('mathlive', async () => (await import('./fake-mathlive')).fakeMathlive())

// P187: the numbers and points Jemma writes itself follow the country of the space: 2,5 and (2; 3) in South Africa, 2.5 and (2, 3) in the US. The space's layout
// sets the notation; here a NotationProvider stands in for it. react-dom only: no server, no browser.

const at = { position: 1, phase: 'try' as const, index: 1, of: 5 }
const question = (over: Partial<Question>): Question => ({ prompt: 'q', render: 'text', answer: '0,5', answerKind: 'decimal', difficulty: 1, why: 'w', rightWay: 'r', ...over })
const decimal = question({})
const point = question({ prompt: 'Where do the two lines meet?', answer: '(2; -3)', answerKind: 'point', steps: ['a', 'b'] })
const reflect: Question = tidyPlot({
  ...question({ prompt: "Reflect A and B in the y-axis. Tap where A' and B' go.", answer: '4; 1; 1; 4', answerKind: 'list', steps: ['a', 'b'] }),
  plot: { xMin: -5, xMax: 5, yMin: -1, yMax: 5, given: [{ x: -4, y: 1, label: 'A' }, { x: -1, y: 4, label: 'B' }], place: ["A'", "B'"] },
})
const inSpace = (notation: Notation, children: ReactNode) => render(<NotationProvider notation={notation}>{children}</NotationProvider>)
/** The signs drawn around the two boxes of a point. */
const signs = () => Array.from(document.querySelectorAll('[data-point] > span[aria-hidden]')).map((el) => el.textContent)

describe('a space in the US', () => {
  it('asks for a decimal with a decimal point, and a point with a comma', () => {
    inSpace('us', <QuestionScreen q={stripQuestion(decimal, at)} busy={false} onAnswer={() => {}} />)
    expect(screen.getByText('Type a number with a decimal point, like 0.5.')).toBeTruthy()
    document.body.innerHTML = ''
    inSpace('us', <QuestionScreen q={stripQuestion(point, at)} busy={false} onAnswer={() => {}} />)
    expect(signs()).toEqual(['(', ',', ')'])
    expect(writeLine(answerShape(stripQuestion(point, at)), 'us')).toBe('Write the x and the y of the point, like (2, 3).')
    expect(writeLine(answerShape(stripQuestion(decimal, at)), 'us')).toBe('Write a number with a decimal point, like 0.5.')
  })

  it('a South African space is as it was', () => {
    inSpace('za', <QuestionScreen q={stripQuestion(decimal, at)} busy={false} onAnswer={() => {}} />)
    expect(screen.getByText('Type a number with a comma, like 0,5.')).toBeTruthy()
    document.body.innerHTML = ''
    render(<QuestionScreen q={stripQuestion(point, at)} busy={false} onAnswer={() => {}} />)
    expect(signs()).toEqual(['(', ';', ')'])
    expect(writeLine(answerShape(stripQuestion(point, at)))).toBe('Write the x and the y of the point, like (2; 3).')
  })

  it('the maths keyboard has a decimal point', () => {
    const row = (n: Notation) => keyboardLayout({ kind: 'number', prompt: 'x', notation: n }).layers[0]!.rows[1]!.map((k) => keyName(k as never))
    expect(row('us')).toContain(keyName(CAPS.point as never))
    expect(row('us')).not.toContain(keyName(CAPS.comma as never))
    expect(row('za')).toContain(keyName(CAPS.comma as never))
  })

  it('the points Jemma says and the numbers on a picture are written the US way', () => {
    render(<p>{plotHint(reflect.plot!, [{ x: 4, y: 1 }, null], 0, 'us')}</p>)
    expect(document.body.textContent).toBe("You placed A' at (4, 1). Now B'.")
    document.body.innerHTML = ''
    render(<p>{plotHint(reflect.plot!, [{ x: 4, y: 1 }, null], 0)}</p>)
    expect(document.body.textContent).toBe("You placed A' at (4; 1). Now B'.")
    document.body.innerHTML = ''
    const line = { kind: 'number_line', min: 0, max: 2, step: 0.5, marks: [{ value: 1.5, label: 'A' }] }
    render(<DiagramView spec={line} notation="us" />)
    expect(document.querySelector('svg')!.getAttribute('aria-label')).toContain('in steps of 0.5')
    expect(document.querySelector('svg')!.textContent).toContain('0.5')
    document.body.innerHTML = ''
    render(<DiagramView spec={line} />)
    expect(document.querySelector('svg')!.getAttribute('aria-label')).toContain('in steps of 0,5')
    expect(document.querySelector('svg')!.textContent).toContain('0,5')
  })

  it('the results show a point the US way, and keep what the lesson wrote as it was', () => {
    const item: StoredItem = { phase: 'try', position: 1, question: point, answer: '(2.5; -3)', correct: false, difficulty: 1, seconds: 20 }
    const [m] = reviewOf([item])
    expect(m).toMatchObject({ notated: true, wrote: '(2.5; -3)', right: '(2; -3)' })
    inSpace('us', <Results firstName="Maya" missed={[m!]} />)
    expect(document.body.textContent).toContain('(2.5, -3)')
    expect(document.body.textContent).toContain('(2, -3)')
    expect(document.body.textContent).not.toContain('(2; -3)')
    // A list the lesson wrote is no point: it is shown as it was written.
    expect(reviewOf([{ ...item, question: question({ answer: '1,000; 2', answerKind: 'list' }), answer: '1; 2' }])[0]!.notated).toBeUndefined()
  })
})
