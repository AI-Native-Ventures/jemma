import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ShadeSpec } from '@jemma/profiling/schemas'
import { ShadeAnswer, ShadedResult } from '../app/k/session/_parts/answers/ShadeShape'
import { answerShape, answerValue } from '../app/k/session/[sessionId]/logic'

// P194: a shape to finish so a dashed line is a line of symmetry. The squares shaded already cannot be tapped, the answer is the squares the learner shades, and the
// results number the squares and draw the finished shape when the learner's is not it. react-dom only: no server, no browser.

const SHAPE: ShadeSpec = { shape: 'grid', rows: 6, cols: 8, mirror: 'vertical', given: [3, 10, 11, 17, 18, 19, 21, 25, 33] }

describe('the answer of a shape to finish', () => {
  it('draws the mirror line and the shaded squares, which cannot be tapped', () => {
    const onChange = vi.fn()
    render(<ShadeAnswer shade={SHAPE} onChange={onChange} />)
    expect(document.querySelector('[data-mirror]')).not.toBeNull()
    expect(document.querySelectorAll('[data-given]')).toHaveLength(9)
    fireEvent.pointerDown(document.querySelector('[data-part="2"]')!)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('sends the squares shaded, smallest first, and nothing once they are all cleared', () => {
    const onChange = vi.fn()
    render(<ShadeAnswer shade={SHAPE} onChange={onChange} />)
    fireEvent.pointerDown(document.querySelector('[data-part="13"]')!)
    fireEvent.pointerDown(document.querySelector('[data-part="5"]')!)
    expect(onChange).toHaveBeenLastCalledWith('6; 14')
    fireEvent.pointerDown(document.querySelector('[data-part="5"]')!)
    fireEvent.pointerDown(document.querySelector('[data-part="13"]')!)
    expect(onChange).toHaveBeenLastCalledWith('')
  })

  it('is the answer of a list question with a mirror, and its text is sent as it is', () => {
    const shape = answerShape({ answerKind: 'list', shade: SHAPE } as never)
    expect(shape.kind).toBe('shade')
    const boxes = { whole: '', top: '', bottom: '', text: '6; 14; 15' }
    expect(answerValue(shape, boxes)).toBe('6; 14; 15')
    expect(answerValue(shape, { ...boxes, text: 'six' })).toBe('')
  })
})

describe('the results of a shape to finish', () => {
  it('numbers the squares, and draws the finished shape only when the learner’s is not it', () => {
    const key = '6; 14; 15; 20; 22; 23; 24; 32; 40'
    const { container, unmount } = render(<ShadedResult shade={SHAPE} wrote="6; 14; 20" right={key} />)
    expect(container.querySelector('[data-finished]')).not.toBeNull()
    expect(container.textContent).toContain('48')
    unmount()
    const right = render(<ShadedResult shade={SHAPE} wrote={key} right={key} />)
    expect(right.container.querySelector('[data-finished]')).toBeNull()
  })
})
