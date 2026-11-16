import { render, screen, waitFor } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { equationShapeHint, INEQUALITY_HINT, INEQUALITY_WRITE_LINE, PAIR_HINT, PAIR_WRITE_LINE } from '../app/k/session/_parts/answers/hints'
import { PaperSheet, writeLine } from '../app/k/session/_parts/Paper'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { answerShape, stripQuestion, type QuestionForChild } from '../app/k/session/[sessionId]/logic'
import { theField, theKeyboard } from './fake-mathlive'

vi.mock('mathlive', async () => (await import('./fake-mathlive')).fakeMathlive())

// P147: when the key of a question is an inequality or an interval, the server tells the screen its SHAPE (never its values) and the screen says what to type:
// "Type the answer, like x < 4 or -2 ≤ x < 3." The paper sheet says the same for a pencil. No server, no browser: react-dom only.

const LE = '≤'
const INF = '∞'
const at = { position: 1, phase: 'try' as const, index: 1, of: 5 }
const full = (answer: string, over: Record<string, unknown> = {}) => ({
  prompt: 'Solve 2x + 1 <= 7',
  render: 'text' as const,
  answer,
  answerKind: 'equation' as const,
  difficulty: 1 as const,
  why: 'why',
  rightWay: 'right way',
  ...over,
})
const ask = (over: Partial<QuestionForChild>): QuestionForChild => ({ position: 3, phase: 'try', index: 1, of: 5, prompt: 'Solve 2x + 1 <= 7', render: 'text', answerKind: 'equation', ...over })

describe('the server sends the shape of an inequality key, never its values', () => {
  it.each(['x <= 3', `x ${LE} 3`, '-2 <= x < 3', 'x < -1 or x > 4', 'x != 2', 'y >= -4', `(-${INF}; 3]`, '(1; 4)', `[2; ${INF})`, `(-${INF}; -1) ∪ (4; ${INF})`, 'x ∈ ℝ', 'all real numbers'])(
    'key %j: answerShape is inequality and the key text is not in what is sent',
    (answer) => {
      const sent = stripQuestion(full(answer), at)
      expect(sent.answerShape).toBe('inequality')
      expect(JSON.stringify(sent)).not.toContain(answer)
      expect(Object.keys(sent).sort()).toEqual(['answerKind', 'answerShape', 'index', 'of', 'phase', 'position', 'prompt', 'render'])
    },
  )

  it.each(['x = 2 and y = 3', 'x = 2; y = -3', 'a = 1 and b = 2'])('key %j (two letters with a value each): answerShape is pair, and no key text is sent', (answer) => {
    const sent = stripQuestion(full(answer), at)
    expect(sent.answerShape).toBe('pair')
    expect(JSON.stringify(sent)).not.toContain(answer)
  })

  it.each(['x = 4', 'x = 3 or x = -1', 'x = 1 ± √3', 'y = 2x + 3', 'x^2 + y^2 = 25', '3 or -1'])('key %j: no answerShape is sent', (answer) => {
    expect(stripQuestion(full(answer), at)).not.toHaveProperty('answerShape')
  })

  it('only an equation key can have it: an expression or a number that looks like an interval does not', () => {
    expect(stripQuestion(full('(1; 4)', { answerKind: 'point' }), at)).not.toHaveProperty('answerShape')
    expect(stripQuestion(full('x <= 3', { answerKind: 'expression' }), at)).not.toHaveProperty('answerShape')
    expect(stripQuestion(full('3', { answerKind: 'number' }), at)).not.toHaveProperty('answerShape')
  })

  it('answerShape of the screen reads it, and an ordinary equation is as it was', () => {
    expect(answerShape({ prompt: 'p', answerKind: 'equation', answerShape: 'inequality' })).toEqual({ kind: 'equation', inequality: true })
    expect(answerShape({ prompt: 'p', answerKind: 'equation', answerShape: 'pair' })).toEqual({ kind: 'equation', pair: true })
    expect(answerShape({ prompt: 'p', answerKind: 'equation' })).toEqual({ kind: 'equation' })
    expect(answerShape({ prompt: 'p', answerKind: 'number', answerShape: 'inequality' })).toEqual({ kind: 'number' })
    expect(answerShape({ prompt: 'p', answerKind: 'equation', answerShape: 'inequality', choices: ['a', 'b'] })).toEqual({ kind: 'choice' })
  })
})

describe('the line under the box', () => {
  it('is exactly "Type the answer, like x < 4 or -2 ≤ x < 3." for an inequality, and the old line for any other equation', () => {
    expect(INEQUALITY_HINT).toBe('Type the answer, like x < 4 or -2 ≤ x < 3.')
    expect(equationShapeHint({ kind: 'equation', inequality: true }, 'OLD')).toBe(INEQUALITY_HINT)
    expect(PAIR_HINT).toBe('Type both answers, like x = 2, y = 3.')
    expect(equationShapeHint({ kind: 'equation', pair: true }, 'OLD')).toBe(PAIR_HINT)
    expect(equationShapeHint({ kind: 'equation' }, 'OLD')).toBe('OLD')
    expect(equationShapeHint({ kind: 'number' }, 'OLD')).toBe('OLD')
  })

  it('the question screen shows it for an inequality key and keeps the old line for another equation', async () => {
    const shown = render(<QuestionScreen q={ask({ answerShape: 'inequality' })} busy={false} onAnswer={() => {}} />)
    await waitFor(() => expect(theKeyboard().layouts).toHaveLength(1))
    await waitFor(() => expect(theField().mathVirtualKeyboardPolicy).toBe('manual'))
    expect(screen.getByText(INEQUALITY_HINT)).toBeTruthy()
    expect(screen.queryByText('Type the answer, like x = 4. Two answers: x = 3 or x = -1.')).toBeNull()
    shown.unmount()
    render(<QuestionScreen q={ask({})} busy={false} onAnswer={() => {}} />)
    await waitFor(() => expect(screen.getByText('Type the answer, like x = 4. Two answers: x = 3 or x = -1.')).toBeTruthy())
    expect(screen.queryByText(INEQUALITY_HINT)).toBeNull()
  })

  it('the paper sheet says the same for a pencil', () => {
    expect(INEQUALITY_WRITE_LINE).toBe('Write the answer, like x < 4 or -2 ≤ x < 3.')
    expect(writeLine({ kind: 'equation', inequality: true })).toBe(INEQUALITY_WRITE_LINE)
    expect(PAIR_WRITE_LINE).toBe('Write both answers, like x = 2, y = 3.')
    expect(writeLine({ kind: 'equation', pair: true })).toBe(PAIR_WRITE_LINE)
    expect(writeLine({ kind: 'equation' })).toBe('Write the answer, like x = 4. Two answers: x = 3 or x = -1.')
    const sheet = renderToStaticMarkup(<PaperSheet questions={[ask({ answerShape: 'inequality' })]} busy={false} error={null} onPhoto={() => {}} onScreen={() => {}} />)
    expect(sheet).toContain(INEQUALITY_WRITE_LINE.replaceAll('<', '&lt;'))
  })
})
