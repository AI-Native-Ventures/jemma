import { fireEvent, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { writeLine } from '../app/k/session/_parts/Paper'
import { ratioAnswer } from '../app/k/session/_parts/answers/RatioBoxes'
import { quantityText } from '../app/k/session/_parts/answers/QuantityBox'
import { timeAnswer } from '../app/k/session/_parts/answers/TimeBoxes'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { answerShape, answerValue, reviewOf, stripQuestion, type QuestionForChild, type StoredItem } from '../app/k/session/[sessionId]/logic'
import type { Question } from '@jemma/profiling/schemas'

// The maths editor is stood in for by a fake (see fake-mathlive.ts): CI's browser specs use the real one.
vi.mock('mathlive', async () => (await import('./fake-mathlive')).fakeMathlive())

// P148: what a learner sees and types for a unit, a rounded answer, a time, a ratio and a negative whole or decimal answer. react-dom only: no server, no
// browser, no database.

const ask = (over: Partial<QuestionForChild>): QuestionForChild => ({
  position: 3,
  phase: 'try',
  index: 1,
  of: 5,
  prompt: 'Work it out',
  render: 'text',
  answerKind: 'whole',
  ...over,
})
const show = (q: QuestionForChild) => {
  const onAnswer = vi.fn()
  const utils = render(<QuestionScreen q={q} busy={false} onAnswer={onAnswer} />)
  return { onAnswer, ...utils }
}
const html = (q: QuestionForChild) => renderToStaticMarkup(<QuestionScreen q={q} busy={false} onAnswer={() => {}} />)
const next = () => screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

const base = { prompt: 'Find the area', render: 'text' as const, answer: '24', answerKind: 'number' as const, difficulty: 1 as const, why: 'w', rightWay: 'r' }
const at = { position: 1, phase: 'try' as const, index: 1, of: 5 }
const question = (over: Partial<Question>): Question => ({ ...base, ...over })

describe('what the browser is given: shapes and the unit, never the key', () => {
  it('a unit, a round, a time style and a number of ratio parts are sent', () => {
    expect(stripQuestion(question({ unit: 'cm²', round: 2 }), at)).toMatchObject({ unit: 'cm²', round: 2 })
    expect(stripQuestion(question({ answerKind: 'time', answer: '14:30' }), at).timeStyle).toBe('clock24')
    expect(stripQuestion(question({ answerKind: 'time', answer: '2:30 pm' }), at).timeStyle).toBe('clock12')
    expect(stripQuestion(question({ answerKind: 'time', answer: '2 h 15 min' }), at).timeStyle).toBe('duration')
    expect(stripQuestion(question({ answerKind: 'ratio', answer: '3 : 4' }), at).ratioParts).toBe(2)
    expect(stripQuestion(question({ answerKind: 'ratio', answer: '2 : 3 : 5' }), at).ratioParts).toBe(3)
  })

  it('none of the values of the key is in what is sent', () => {
    for (const q of [
      question({ answerKind: 'time', answer: '14:30' }),
      question({ answerKind: 'time', answer: '2:30 pm' }),
      question({ answerKind: 'ratio', answer: '3 : 4' }),
      question({ answerKind: 'ratio', answer: '2 : 3 : 5' }),
      question({ answer: '24', unit: 'cm²', round: 2 }),
      question({ answerKind: 'whole', answer: '-5', steps: ['3 - 8', '-5'] }),
    ]) {
      const sent = JSON.stringify(stripQuestion(q, at))
      expect(sent).not.toContain(`"answer"`)
      expect(sent).not.toContain(q.answer)
      expect(sent).not.toContain('"why"')
    }
  })

  it('nothing is added to a question that has none of it: the old kinds are sent as they were', () => {
    for (const answerKind of ['fraction', 'mixed', 'decimal', 'whole', 'money', 'choice'] as const) {
      const sent = stripQuestion(question({ answerKind, answer: '3/4' }), at)
      for (const key of ['unit', 'round', 'timeStyle', 'ratioParts', 'signed']) expect(sent, `${answerKind} ${key}`).not.toHaveProperty(key)
    }
    expect(stripQuestion(question({}), at)).not.toHaveProperty('unit')
  })

  it('a unit is sent for a number, a whole and a decimal only (the others do not show it)', () => {
    expect(stripQuestion(question({ answerKind: 'whole', unit: 'kg' }), at).unit).toBe('kg')
    expect(stripQuestion(question({ answerKind: 'decimal', unit: 'kg' }), at).unit).toBe('kg')
    expect(stripQuestion(question({ answerKind: 'money', unit: 'kg' }), at)).not.toHaveProperty('unit')
    expect(stripQuestion(question({ unit: '  ' }), at)).not.toHaveProperty('unit')
  })

  it('a minus key is for a whole or a decimal question of a senior class only: worked steps, a picture, a form, a unit or a round tell them apart', () => {
    const primary = stripQuestion(question({ answerKind: 'whole', answer: '12' }), at)
    expect(primary).not.toHaveProperty('signed')
    expect(stripQuestion(question({ answerKind: 'whole', answer: '12', steps: ['5 + 7', '12'] }), at).signed).toBe(true)
    expect(stripQuestion(question({ answerKind: 'decimal', answer: '0,5', steps: ['1/2', '0,5'] }), at).signed).toBe(true)
    expect(stripQuestion(question({ answerKind: 'whole', answer: '12', unit: 'kg' }), at).signed).toBe(true)
    expect(stripQuestion(question({ answerKind: 'whole', answer: '12', steps: ['', '  '] }), at)).not.toHaveProperty('signed')
    expect(stripQuestion(question({ answerKind: 'fraction', answer: '3/4', steps: ['a', 'b'] }), at)).not.toHaveProperty('signed')
    expect(stripQuestion(question({ answerKind: 'money', answer: 'R5', steps: ['a', 'b'] }), at)).not.toHaveProperty('signed')
  })
})

describe('answerShape', () => {
  it('a number, a whole and a decimal carry what the question has', () => {
    expect(answerShape({ prompt: 'p', answerKind: 'number', unit: 'cm²', round: 2 })).toEqual({ kind: 'number', unit: 'cm²', round: 2 })
    expect(answerShape({ prompt: 'p', answerKind: 'whole', unit: 'kg', signed: true })).toEqual({ kind: 'whole', unit: 'kg', signed: true })
    expect(answerShape({ prompt: 'p', answerKind: 'decimal', round: 1 })).toEqual({ kind: 'decimal', round: 1 })
  })

  it('and nothing when it has nothing: the shapes of the old kinds are as they were', () => {
    expect(answerShape({ prompt: 'p', answerKind: 'number' })).toEqual({ kind: 'number' })
    expect(answerShape({ prompt: 'p', answerKind: 'whole' })).toEqual({ kind: 'whole' })
    expect(answerShape({ prompt: 'p', answerKind: 'decimal' })).toEqual({ kind: 'decimal' })
    expect(answerShape({ prompt: 'p', answerKind: 'money' })).toEqual({ kind: 'money' })
    expect(answerShape({ prompt: 'Complete: 3/5 = ?/15', answerKind: 'fraction' }).kind).toBe('missing')
  })

  it('a time and a ratio', () => {
    expect(answerShape({ prompt: 'p', answerKind: 'time', timeStyle: 'clock12' })).toEqual({ kind: 'time', style: 'clock12' })
    expect(answerShape({ prompt: 'p', answerKind: 'time' })).toEqual({ kind: 'time', style: 'clock24' })
    expect(answerShape({ prompt: 'p', answerKind: 'ratio', ratioParts: 3 })).toEqual({ kind: 'ratio', parts: 3 })
    expect(answerShape({ prompt: 'p', answerKind: 'ratio' })).toEqual({ kind: 'ratio', parts: 2 })
    expect(answerShape({ prompt: 'p', answerKind: 'time', choices: ['a', 'b'] })).toEqual({ kind: 'choice' })
  })
})

describe('answerValue and the small pure pieces', () => {
  const boxes = { whole: '', top: '', bottom: '', text: '' }
  it('a minus alone is not an answer in a whole or a decimal box; a negative number is', () => {
    expect(answerValue({ kind: 'whole', signed: true }, { ...boxes, text: '-' })).toBe('')
    expect(answerValue({ kind: 'whole', signed: true }, { ...boxes, text: '-5' })).toBe('-5')
    expect(answerValue({ kind: 'decimal', signed: true }, { ...boxes, text: '-0,5' })).toBe('-0,5')
    expect(answerValue({ kind: 'decimal', signed: true }, { ...boxes, text: '-2,' })).toBe('-2')
    expect(answerValue({ kind: 'whole' }, { ...boxes, text: '12' })).toBe('12')
    expect(answerValue({ kind: 'whole' }, { ...boxes, text: '' })).toBe('')
    expect(answerValue({ kind: 'decimal' }, { ...boxes, text: ',' })).toBe('')
  })

  it('what is typed in a box with a minus key: digits, a comma or a point, and a minus in front only', () => {
    expect(quantityText('-5', 10, true)).toBe('-5')
    expect(quantityText('5-3', 10, true)).toBe('53')
    expect(quantityText('−5,5', 10, true)).toBe('-5,5')
    expect(quantityText('-5', 10, false)).toBe('5')
    expect(quantityText('12 kg', 10, false)).toBe('12')
    expect(quantityText('123456789012', 10, true)).toBe('1234567890')
  })

  it('the text of a time: a clock needs both boxes (and am or pm on a 12 hour clock), a length of time needs one', () => {
    expect(timeAnswer('clock24', '14', '30', null)).toBe('14:30')
    expect(timeAnswer('clock24', '7', '5', null)).toBe('7:05')
    expect(timeAnswer('clock24', '14', '', null)).toBe('')
    expect(timeAnswer('clock24', '24', '00', null)).toBe('')
    expect(timeAnswer('clock24', '14', '60', null)).toBe('')
    expect(timeAnswer('clock12', '2', '30', null)).toBe('')
    expect(timeAnswer('clock12', '2', '30', 'pm')).toBe('2:30 pm')
    expect(timeAnswer('clock12', '0', '30', 'am')).toBe('')
    expect(timeAnswer('clock12', '13', '30', 'am')).toBe('')
    expect(timeAnswer('duration', '2', '15', null)).toBe('2 h 15 min')
    expect(timeAnswer('duration', '', '135', null)).toBe('135 min')
    expect(timeAnswer('duration', '3', '', null)).toBe('3 h')
    expect(timeAnswer('duration', '', '', null)).toBe('')
  })

  it('the text of a ratio: every box needs a number', () => {
    expect(ratioAnswer(['3', '4'])).toBe('3 : 4')
    expect(ratioAnswer(['2', '3', '5'])).toBe('2 : 3 : 5')
    expect(ratioAnswer(['1,5', '2'])).toBe('1,5 : 2')
    expect(ratioAnswer(['3', ''])).toBe('')
    expect(ratioAnswer(['3', ',', '4'])).toBe('')
  })
})

describe('a unit is shown after the box, outside the field', () => {
  it('a number answer: the unit comes after the maths box, and the hint says to type the number only', () => {
    const out = html(ask({ answerKind: 'number', unit: 'cm²' }))
    expect(out).toContain('data-unit="true"')
    expect(out.indexOf('<math-field')).toBeGreaterThan(-1)
    expect(out.indexOf('cm²')).toBeGreaterThan(out.indexOf('<math-field'))
    expect(out).toContain('Type only the number. The unit is already there.')
  })

  it('a number in rand: the R comes before the box', () => {
    const out = html(ask({ answerKind: 'number', unit: 'R' }))
    expect(out.indexOf('>R<')).toBeGreaterThan(-1)
    expect(out.indexOf('>R<')).toBeLessThan(out.indexOf('<math-field'))
    expect(out).toContain('Type the amount in rand, like 15386,42.')
  })

  it('a number answer with no unit is drawn as it was: no unit, the old line', () => {
    const out = html(ask({ answerKind: 'number' }))
    expect(out).not.toContain('data-unit')
    expect(out).toContain('Type a number. It may be negative, like -3.')
  })

  it('a rounded answer says so under the box', () => {
    expect(html(ask({ answerKind: 'number', round: 2 }))).toContain('Type a number. It may be negative, like -3. Round it to 2 decimal places.')
    expect(html(ask({ answerKind: 'number', round: 1, unit: 'cm' }))).toContain('Type only the number. The unit is already there. Round it to 1 decimal place.')
    expect(html(ask({ answerKind: 'number', round: 0 }))).toContain('Round it to the nearest whole number.')
  })

  it('a whole answer with a unit: the box, then the unit, and the line', () => {
    const out = html(ask({ answerKind: 'whole', unit: 'kg' }))
    expect(out).toContain('data-unit="true"')
    expect(out.indexOf('kg')).toBeGreaterThan(out.indexOf('<input'))
    expect(out).toContain('Type a whole number. The unit is already there.')
  })

  it('what the child types in a whole box with a unit is sent without the unit', () => {
    const { onAnswer } = show(ask({ answerKind: 'whole', unit: 'kg' }))
    type('Your answer', '12 kg')
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('12', expect.any(Number))
  })
})

describe('a minus key for a whole or a decimal answer of a senior class', () => {
  it('there is one when the question says it is senior, and none on a primary question', () => {
    expect(html(ask({ answerKind: 'whole', signed: true }))).toContain('aria-label="Minus sign"')
    expect(html(ask({ answerKind: 'decimal', signed: true }))).toContain('aria-label="Minus sign"')
    expect(html(ask({ answerKind: 'whole' }))).not.toContain('Minus sign')
    expect(html(ask({ answerKind: 'decimal' }))).not.toContain('Minus sign')
    expect(html(ask({ answerKind: 'money' }))).not.toContain('Minus sign')
  })

  it('the minus key puts a minus in front and takes it away again; the number is sent with its minus', () => {
    const { onAnswer } = show(ask({ answerKind: 'whole', signed: true }))
    expect(next().disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Minus sign' }))
    expect(next().disabled).toBe(true)
    type('Your answer', '-5')
    expect(next().disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Minus sign' }))
    expect((screen.getByLabelText('Your answer') as HTMLInputElement).value).toBe('5')
    fireEvent.click(screen.getByRole('button', { name: 'Minus sign' }))
    expect((screen.getByLabelText('Your answer') as HTMLInputElement).value).toBe('-5')
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('-5', expect.any(Number))
  })

  it('a decimal may be negative with a comma', () => {
    const { onAnswer } = show(ask({ answerKind: 'decimal', signed: true }))
    type('Your answer', '-0,75')
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('-0,75', expect.any(Number))
  })

  it('a box without a minus key takes no minus: a primary answer is as it was', () => {
    const { onAnswer } = show(ask({ answerKind: 'whole' }))
    type('Your answer', '-5')
    expect((screen.getByLabelText('Your answer') as HTMLInputElement).value).toBe('5')
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('5', expect.any(Number))
  })
})

describe('a time', () => {
  it('a 24 hour clock: hours and minutes, no am or pm', () => {
    const { onAnswer } = show(ask({ answerKind: 'time', timeStyle: 'clock24' }))
    expect(screen.queryByRole('button', { name: 'am' })).toBeNull()
    expect(screen.getByText('Type the hours and the minutes, like 14:30.')).toBeTruthy()
    expect(next().disabled).toBe(true)
    type('Hours', '14')
    expect(next().disabled).toBe(true)
    type('Minutes', '30')
    expect(next().disabled).toBe(false)
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('14:30', expect.any(Number))
  })

  it('a 12 hour clock asks for am or pm, and Next waits for it', () => {
    const { onAnswer } = show(ask({ answerKind: 'time', timeStyle: 'clock12' }))
    type('Hours', '2')
    type('Minutes', '30')
    expect(next().disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'pm' }))
    expect(screen.getByRole('button', { name: 'pm' }).getAttribute('aria-pressed')).toBe('true')
    expect(next().disabled).toBe(false)
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('2:30 pm', expect.any(Number))
  })

  it('digits only, two of each, and a minute of 60 or more is not an answer', () => {
    show(ask({ answerKind: 'time', timeStyle: 'clock24' }))
    type('Hours', '1a45')
    type('Minutes', '99')
    expect((screen.getByLabelText('Hours') as HTMLInputElement).value).toBe('14')
    expect(next().disabled).toBe(true)
  })

  it('a length of time: hours and minutes with the words h and min, and either may be empty', () => {
    const { onAnswer } = show(ask({ answerKind: 'time', timeStyle: 'duration' }))
    expect(screen.getByText('Type the hours and the minutes. You can leave one empty.')).toBeTruthy()
    type('Minutes', '135')
    expect(next().disabled).toBe(false)
    type('Hours', '2')
    type('Minutes', '15')
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('2 h 15 min', expect.any(Number))
  })
})

describe('a ratio', () => {
  it('two boxes with a colon between them', () => {
    const { onAnswer } = show(ask({ answerKind: 'ratio', ratioParts: 2 }))
    expect(screen.queryByLabelText('The third number of the ratio')).toBeNull()
    expect(screen.getByText('Type the two numbers of the ratio, like 3 : 4.')).toBeTruthy()
    type('The first number of the ratio', '3')
    expect(next().disabled).toBe(true)
    type('The second number of the ratio', '4')
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('3 : 4', expect.any(Number))
  })

  it('three boxes when the key has three parts', () => {
    const { onAnswer } = show(ask({ answerKind: 'ratio', ratioParts: 3 }))
    type('The first number of the ratio', '2')
    type('The second number of the ratio', '3')
    expect(next().disabled).toBe(true)
    type('The third number of the ratio', '5')
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('2 : 3 : 5', expect.any(Number))
  })

  it('a part may have a decimal comma, and nothing else but digits', () => {
    show(ask({ answerKind: 'ratio', ratioParts: 2 }))
    type('The first number of the ratio', '1,5x')
    expect((screen.getByLabelText('The first number of the ratio') as HTMLInputElement).value).toBe('1,5')
  })
})

describe('the paper sheet says how to write each one', () => {
  it('a time, a ratio, a unit, a round and a minus', () => {
    expect(writeLine(answerShape({ prompt: 'p', answerKind: 'time', timeStyle: 'clock24' }))).toBe('Write the time in hours and minutes, like 14:30.')
    expect(writeLine(answerShape({ prompt: 'p', answerKind: 'time', timeStyle: 'clock12' }))).toBe('Write the time with am or pm, like 2:30 pm.')
    expect(writeLine(answerShape({ prompt: 'p', answerKind: 'time', timeStyle: 'duration' }))).toBe('Write the hours and the minutes, like 2 h 15 min.')
    expect(writeLine(answerShape({ prompt: 'p', answerKind: 'ratio', ratioParts: 2 }))).toBe('Write the ratio with a colon, like 3 : 4.')
    expect(writeLine(answerShape({ prompt: 'p', answerKind: 'ratio', ratioParts: 3 }))).toBe('Write the ratio with a colon, like 2 : 3 : 5.')
    expect(writeLine(answerShape({ prompt: 'p', answerKind: 'number', unit: 'cm²' }))).toBe('Write the number, then the unit (cm²).')
    expect(writeLine(answerShape({ prompt: 'p', answerKind: 'number', round: 2 }))).toBe('Write a number. It may be negative, like -3. Round it to 2 decimal places.')
    expect(writeLine(answerShape({ prompt: 'p', answerKind: 'whole', signed: true }))).toBe('Write a whole number. It may be negative.')
  })

  it('the old lines are the old lines', () => {
    expect(writeLine({ kind: 'number' })).toBe('Write a number. It may be negative, like -3.')
    expect(writeLine({ kind: 'whole' })).toBe('Write a whole number.')
    expect(writeLine({ kind: 'decimal' })).toBe('Write a number with a comma, like 0,5.')
    expect(writeLine({ kind: 'money' })).toBe('Write the amount, like 12,50.')
  })
})

describe('no em dash in what the screens say', () => {
  it('every hint and line is plain', () => {
    const all = [
      html(ask({ answerKind: 'number', unit: 'km/h', round: 1 })),
      html(ask({ answerKind: 'time', timeStyle: 'clock12' })),
      html(ask({ answerKind: 'ratio', ratioParts: 3 })),
      html(ask({ answerKind: 'whole', signed: true, unit: 'R' })),
    ].join(' ')
    expect(all).not.toContain(String.fromCharCode(0x2014))
  })
})

describe('the results show the unit', () => {
  const item = (q: Question, answer: string, correct = false): StoredItem => ({ phase: 'try', position: 1, question: q, answer, correct, difficulty: 1, seconds: 3 })

  it('what the child wrote and the right answer both carry the unit of the question', () => {
    const [card] = reviewOf([item(question({ unit: 'cm\u00b2' }), '25')])
    expect(card).toMatchObject({ wrote: '25 cm\u00b2', right: '24 cm\u00b2', correct: false })
  })

  it('a number in rand gets its R, a percent its sign, and a question with no unit is as it was', () => {
    expect(reviewOf([item(question({ answer: '15386.42', unit: 'R' }), '15386.4'), item(question({ answer: '15', unit: '%' }), '16'), item(question({}), '25')]).map((c) => [c.wrote, c.right])).toEqual([
      ['R15386.4', 'R15386.42'],
      ['16%', '15%'],
      ['25', '24'],
    ])
  })

  it('an answer written with its own unit on paper is shown once', () => {
    expect(reviewOf([item(question({ unit: 'cm\u00b2' }), '24 cm\u00b2', true)])[0]).toMatchObject({ wrote: '24 cm\u00b2', right: '24 cm\u00b2' })
  })
})
