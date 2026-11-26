import { describe, expect, test } from 'vitest'
import { decimalWords, inNotation, notationOf, numberIn, pointIn } from '../src/logic/notation'
import { finishAnswer } from '../src/logic/meaning'
import { curveThrough, curveWords, sketchName } from '../src/logic/answers/plot'
import { generalText } from '../src/logic/answers/general'

// P187: Jemma writes the numbers and points it makes itself the way the learner's country does: 2,5 and (2; 3) in South Africa, 2.5 and (2, 3) in the US.
// What a learner types is read either way. No database, no network, no model.

describe('the notation of a space', () => {
  test('the US writes the US way; every other country the South African way', () => {
    expect(notationOf('US')).toBe('us')
    expect(notationOf(' us ')).toBe('us')
    expect(notationOf('ZA')).toBe('za')
    expect(notationOf('KE')).toBe('za')
    expect(notationOf(null)).toBe('za')
  })

  test('a text Jemma wrote the South African way, in the US way: decimal points, and a comma in a point', () => {
    expect(inNotation('(1,5 ; −2)', 'us')).toBe('(1.5, −2)')
    expect(inNotation('(2; 3)', 'us')).toBe('(2, 3)')
    expect(inNotation('A (2; 3), B (1; 1)', 'us')).toBe('A (2, 3), B (1, 1)')
    expect(inNotation('θ = 22,5° + k · 180°', 'us')).toBe('θ = 22.5° + k · 180°')
    expect(inNotation('turns at (0,5 ; −4)', 'us')).toBe('turns at (0.5, −4)')
    // Values of a list keep their semicolons; a comma that is not between two digits stays.
    expect(inNotation('2; 3; 5', 'us')).toBe('2; 3; 5')
    expect(inNotation('Graph 1, Graph 2', 'us')).toBe('Graph 1, Graph 2')
    // South Africa: the very same text.
    expect(inNotation('(1,5 ; −2)', 'za')).toBe('(1,5 ; −2)')
  })

  test('numbers, points and the words of a hint', () => {
    expect(numberIn(2.5, 'za')).toBe('2,5')
    expect(numberIn(2.5, 'us')).toBe('2.5')
    expect(numberIn(1 / 3, 'us')).toBe('0.333333')
    expect(pointIn('2', '3', 'za')).toBe('(2; 3)')
    expect(pointIn('2', '3', 'us')).toBe('(2, 3)')
    expect(decimalWords('za')).toBe('with a comma, like 0,5')
    expect(decimalWords('us')).toBe('with a decimal point, like 0.5')
  })

  test('what Jemma says of a sketch and of every solution reads the US way in the US', () => {
    expect(inNotation(sketchName({ x: -1.5, y: 2 }), 'us')).toBe('(−1.5, 2)')
    const smile = curveThrough('parabola', [{ x: -1.5, y: 0 }, { x: 2.5, y: 0 }, { x: 0.5, y: -4 }])!
    expect(curveWords(smile)).toContain('(0,5 ; −4)')
    expect(inNotation(curveWords(smile), 'us')).toContain('(0.5, −4)')
    expect(inNotation(generalText([{ angle: 22.5, period: 180 }], 'θ'), 'us')).toBe('θ = 22.5° + k · 180°')
  })

  test('a point typed the US way is read and marked as one typed the South African way', () => {
    const q = { prompt: 'Where do the lines meet?', answer: '(2.5; -3)', answerKind: 'point' }
    expect(finishAnswer(q, '(2.5, -3)').correct).toBe(true)
    expect(finishAnswer(q, '(2,5; -3)').correct).toBe(true)
    expect(finishAnswer(q, '(2.5, 3)').correct).toBe(false)
  })
})
