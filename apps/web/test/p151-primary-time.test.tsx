import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Question } from '@jemma/profiling/schemas'
import { writeLine } from '../app/k/session/_parts/Paper'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { YOUNG_TIME_SIZE } from '../app/k/session/_parts/answers/YoungSize'
import { answerShape, stripQuestion, type QuestionForChild } from '../app/k/session/[sessionId]/logic'

// P151 on P148: a time, a unit and a minus key for a learner of Grade 1 to 6. The boxes of P148 are already big (64 px and more); what a young learner gets on top is
// simple words, an example of a clock they know (3:30, not 14:30), and am and pm keys that are a touch target. react-dom only: no server, no browser.

const base = { prompt: 'p', render: 'text' as const, difficulty: 1 as const, why: 'w', rightWay: 'r' }
const at = { position: 1, phase: 'try' as const, index: 1, of: 5 }
const CLOCK: Question = { ...base, prompt: 'The film starts at 2:00 and lasts 1 hour. What time does it end?', answer: '3:00', answerKind: 'time' }
const AFTERNOON: Question = { ...base, prompt: 'School ends at half past two in the afternoon. Write the time.', answer: '2:30 pm', answerKind: 'time' }
const LENGTH: Question = { ...base, prompt: 'School starts at 8:00 and ends at 1:00. How many hours is that?', answer: '5 h', answerKind: 'time' }
const CM: Question = { ...base, prompt: 'How long is the pencil, in cm?', answer: '12', answerKind: 'whole', unit: 'cm' }

const young = (q: Question): QuestionForChild => stripQuestion(q, { ...at, young: true })
const grown = (q: Question): QuestionForChild => stripQuestion(q, at)
const show = (q: QuestionForChild) => render(<QuestionScreen q={q} busy={false} onAnswer={vi.fn()} />)

describe('a time for a young learner', () => {
  it('the flag reaches the shape, the style of the clock comes from the key as before', () => {
    expect(answerShape(young(CLOCK))).toEqual({ kind: 'time', style: 'clock24', young: true })
    expect(answerShape(young(AFTERNOON))).toEqual({ kind: 'time', style: 'clock12', young: true })
    expect(answerShape(young(LENGTH))).toEqual({ kind: 'time', style: 'duration', young: true })
    expect(answerShape(grown(CLOCK))).toEqual({ kind: 'time', style: 'clock24' })
  })

  it('the hint says what goes in the boxes in simple words, with no 24 hour example', () => {
    const a = show(young(CLOCK))
    expect(a.container.textContent).toContain('Type the hours and the minutes.')
    expect(a.container.textContent).not.toContain('14:30')
    a.unmount()
    const b = show(young(AFTERNOON))
    expect(b.container.textContent).toContain('Type the hours and the minutes. Then pick am or pm.')
    b.unmount()
    const c = show(young(LENGTH))
    expect(c.container.textContent).toContain('Type the hours and the minutes. You can leave one empty.')
  })

  it('a learner who is not young reads the line of P148, as it was', () => {
    const { container } = show(grown(CLOCK))
    expect(container.textContent).toContain('Type the hours and the minutes, like 14:30.')
    expect(container.querySelector('[data-young]')).toBeNull()
  })

  it('what is typed is sent as before: the hours and the minutes of a clock', () => {
    const onAnswer = vi.fn()
    render(<QuestionScreen q={young(CLOCK)} busy={false} onAnswer={onAnswer} />)
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onAnswer).toHaveBeenCalledWith('3:00', expect.any(Number))
  })

  it('the am and pm keys of a young learner are a touch target: 48 px high, 64 px wide', () => {
    expect(YOUNG_TIME_SIZE).toContain('[&_[data-time]_button]:h-12')
    expect(YOUNG_TIME_SIZE).toContain('[&_[data-time]_button]:w-16')
    const { container } = show(young(AFTERNOON))
    expect(container.querySelector('[data-young="true"]')!.className).toBe(YOUNG_TIME_SIZE)
    expect(container.querySelectorAll('[data-time] button')).toHaveLength(2)
  })

  it('the box of a clock with no am or pm has no key and the wrapper adds no fixed width', () => {
    const { container } = show(young(CLOCK))
    expect(container.querySelectorAll('[data-time] button')).toHaveLength(0)
    expect(YOUNG_TIME_SIZE).not.toMatch(/(?<![-\w])w-\[|whitespace-nowrap/)
  })

  it('the paper sheet asks for the time in the way a young learner knows it', () => {
    expect(writeLine(answerShape(young(CLOCK)))).toBe('Write the time in hours and minutes, like 3:30.')
    expect(writeLine(answerShape(young(AFTERNOON)))).toBe('Write the time with am or pm, like 2:30 pm.')
    expect(writeLine(answerShape(young(LENGTH)))).toBe('Write the hours and the minutes, like 2 h 15 min.')
    expect(writeLine(answerShape(grown(CLOCK)))).toBe('Write the time in hours and minutes, like 14:30.')
  })

  it('the key never goes to a young learner: only the style of the clock', () => {
    for (const q of [CLOCK, AFTERNOON, LENGTH]) {
      const sent = JSON.stringify(young(q))
      expect(sent).not.toContain(`"${q.answer}"`)
      expect(sent).not.toContain('"answer":')
    }
  })

  it('no em dash and no word of marking in the lines', () => {
    for (const q of [CLOCK, AFTERNOON, LENGTH]) {
      const { container, unmount } = show(young(q))
      expect(container.textContent).not.toContain(String.fromCharCode(0x2014))
      expect(container.textContent).not.toMatch(/\b(right|wrong|correct)\b/i)
      unmount()
    }
  })
})

describe('a unit for a young learner', () => {
  it('shows the unit after the box, outside the field, in the boxes P148 drew (76 px high)', () => {
    const { container } = show(young(CM))
    const unit = container.querySelector('[data-unit="true"]')!
    expect(unit.textContent).toBe('cm')
    const input = container.querySelector('input#answer') as HTMLInputElement
    expect(input.className).toContain('h-[76px]')
    expect(input.compareDocumentPosition(unit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('takes the number alone, and sends it as typed', () => {
    const onAnswer = vi.fn()
    render(<QuestionScreen q={young(CM)} busy={false} onAnswer={onAnswer} />)
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onAnswer).toHaveBeenCalledWith('12', expect.any(Number))
  })

  it('a young learner never gets the minus key, even on a question that counts as senior; a learner of Grade 7 or more still does', () => {
    const senior: Question = { ...CM, steps: ['12 cm', '12'] }
    expect(young(senior)).not.toHaveProperty('signed')
    expect(grown(senior).signed).toBe(true)
    const a = show(young(senior))
    expect(a.container.querySelector('button[aria-label="Minus sign"]')).toBeNull()
    a.unmount()
    const b = show(grown(senior))
    expect(b.container.querySelector('button[aria-label="Minus sign"]')).toBeTruthy()
  })

  it('a unit and the flag do not hide the key either', () => {
    expect(JSON.stringify(young(CM))).not.toContain('"12"')
  })
})
