import { describe, expect, test } from 'vitest'
import { finishAnswer, isInequalityKey, isPairKey, markByMeaning, markReadAnswer, meaningKeyProblem } from '../../src/logic'
import type { Question } from '../../src/schemas/lesson'
import { answerProblem } from '../../src/tools/save/save-lesson'

// P147: inequalities, intervals and the harder algebra answers are read and marked. An interval is the same answer as its inequality (both ways), a plus or
// minus with a root or a fraction is two values, two letters are a pair, a circle or a line is an equation compared as a relation, and a domain or a range
// ("y >= -4", "x in R", "all real numbers") is a set of numbers. No database, no model.

const INF = '∞'
const MINUS = '−'
const CUP = '∪'
const ELEMENT = '∈'
const REALS = 'ℝ'
const LE = '≤'
const GE = '≥'
const NE = '≠'
const ROOT = '√'
const SQUARED = '²'
const PM = '±'

/** The answer is marked right (true) or wrong (false) against an equation key. */
const mark = (key: string, answer: string) => markByMeaning('equation', key, answer)
const same = (key: string, answer: string) => mark(key, answer).correct
const asked = (answerKind: Question['answerKind'], answer: string): Question => ({
  prompt: 'Question',
  render: 'text',
  answer,
  answerKind,
  difficulty: 1,
  why: 'why',
  rightWay: 'right way',
})

describe('an interval is the same answer as its inequality, both ways', () => {
  test.each([
    [`(-${INF}; 3]`, 'x <= 3'],
    [`(-${INF}; 3]`, `x ${LE} 3`],
    [`(-${INF}; 3]`, '3 >= x'],
    [`(-${INF}; 3)`, 'x < 3'],
    ['(1; 4)', '1 < x < 4'],
    ['[1; 4]', `1 ${LE} x ${LE} 4`],
    ['[1; 4)', '1 <= x < 4'],
    ['(1; 4]', '1 < x <= 4'],
    [`[2; ${INF})`, 'x >= 2'],
    [`[2; ${INF})`, `x ${GE} 2`],
    [`(2; ${INF})`, 'x > 2'],
    [`(-${INF}; -1) ${CUP} (4; ${INF})`, 'x < -1 or x > 4'],
    [`(-${INF}; -1] ${CUP} [4; ${INF})`, `x ${LE} -1 or x ${GE} 4`],
    [`(-${INF}; 2) ${CUP} (2; ${INF})`, `x ${NE} 2`],
    [`(-${INF}; ${INF})`, `x ${ELEMENT} ${REALS}`],
  ])('key %j == answer %j', (interval, inequality) => {
    expect(same(interval, inequality)).toBe(true)
    // and the other way: the inequality is the key, the interval is typed
    expect(same(inequality, interval)).toBe(true)
  })

  test('a semicolon or a comma inside the brackets, inf for the infinity sign, a plus in front of it, U for the union', () => {
    for (const answer of [`(-${INF}, 3]`, `(-${INF} , 3]`, '(-inf; 3]', '(-inf, 3]', '(-infinity; 3]', `(${MINUS}${INF}; 3]`, `(-${INF};3]`, `( -${INF} ; 3 ]`]) {
      expect(same('x <= 3', answer), answer).toBe(true)
    }
    for (const answer of [`[2, ${INF})`, `[2; +${INF})`, '[2; inf)', '[2, inf)', '[2,inf)']) expect(same('x >= 2', answer), answer).toBe(true)
    for (const answer of ['(1, 4)', '(1,4)', '(1 ; 4)']) expect(same('1 < x < 4', answer), answer).toBe(true)
    for (const answer of [`(-${INF}, -1) U (4, ${INF})`, `(-${INF}; -1)U(4; ${INF})`, `(-inf; -1) ${CUP} (4; inf)`, `(-${INF}; -1) union (4; ${INF})`]) {
      expect(same('x < -1 or x > 4', answer), answer).toBe(true)
    }
  })

  test('an infinity inside an inequality is the same as an open end of an interval', () => {
    expect(same('x < 3', `-${INF} < x < 3`)).toBe(true)
    expect(same(`-${INF} < x < 3`, `(-${INF}; 3)`)).toBe(true)
    expect(same(`[2; ${INF})`, `2 <= x < ${INF}`)).toBe(true)
    expect(same(`[2; ${INF})`, `2 < x < ${INF}`)).toBe(false)
    expect(same('x > 2', `2 < x < inf`)).toBe(true)
    expect(same(`(-${INF}; ${INF})`, `-${INF} < x < ${INF}`)).toBe(true)
  })

  test('x in an interval, with the letter in front', () => {
    expect(same('x <= 3', `x ${ELEMENT} (-${INF}; 3]`)).toBe(true)
    expect(same(`x ${ELEMENT} (-${INF}; 3]`, 'x <= 3')).toBe(true)
    expect(same('1 < x < 4', `x ${ELEMENT} (1; 4)`)).toBe(true)
  })

  test('the order and the form of the inequality do not matter', () => {
    expect(same('x < -1 or x > 4', `(4; ${INF}) ${CUP} (-${INF}; -1)`)).toBe(true)
    expect(same('-2 <= x < 3', '[-2; 3)')).toBe(true)
    expect(same('[-2; 3)', 'x < 3 and x >= -2')).toBe(true)
    expect(same(`[1; 2] ${CUP} (2; 3]`, '[1; 3]')).toBe(true)
    expect(same('x >= 0.5', `[1/2; ${INF})`)).toBe(true)
    expect(same(`(-${ROOT}2; ${ROOT}2)`, `-${ROOT}2 < x < ${ROOT}2`)).toBe(true)
  })

  test.each([
    // an open end is not a closed end
    [`(-${INF}; 3]`, 'x < 3'],
    [`(-${INF}; 3)`, 'x <= 3'],
    ['(1; 4)', '1 <= x < 4'],
    ['(1; 4)', '1 < x <= 4'],
    ['(1; 4)', '[1; 4]'],
    ['[1; 4]', '(1; 4)'],
    [`[2; ${INF})`, `(2; ${INF})`],
    ['x >= 2', `(2; ${INF})`],
    // the wrong side
    [`(-${INF}; 3]`, 'x >= 3'],
    [`(-${INF}; 3]`, `[3; ${INF})`],
    [`[2; ${INF})`, 'x <= 2'],
    // other numbers
    ['(1; 4)', '1 < x < 5'],
    ['(1; 4)', '(1; 5)'],
    [`(-${INF}; -1) ${CUP} (4; ${INF})`, 'x < -1 or x > 5'],
    [`(-${INF}; -1) ${CUP} (4; ${INF})`, '-1 < x < 4'],
    [`(-${INF}; -1) ${CUP} (4; ${INF})`, 'x < -1'],
    [`(-${INF}; -1) ${CUP} (4; ${INF})`, `(-${INF}; -1] ${CUP} (4; ${INF})`],
    ['x < -1 or x > 4', `(-${INF}; -1) ${CUP} [4; ${INF})`],
    // an equation is not an inequality
    [`(-${INF}; 3]`, 'x = 3'],
    ['x <= 3', 'x = 3'],
    ['(1; 4)', 'x = 1 or x = 4'],
  ])('key %j is not answer %j', (key, answer) => {
    expect(same(key, answer)).toBe(false)
    expect(mark(key, answer).comparable).toBe(true)
  })

  test('another letter is another answer; an answer that does not read is not comparable', () => {
    expect(same('y >= -4', 'x >= -4')).toBe(false)
    expect(same('x >= -4', `y ${ELEMENT} [-4; ${INF})`)).toBe(false)
    expect(mark('(1; 4)', 'banana')).toEqual({ correct: false, comparable: false })
    expect(mark('(1; 4)', '')).toEqual({ correct: false, comparable: false })
    expect(mark('(1; 4)', '(4; 1)').correct).toBe(false)
    expect(mark('(1; 4)', '(1; 4').correct).toBe(false)
  })

  test('an interval written backwards is not an interval', () => {
    expect(meaningKeyProblem('equation', `(${INF}; 3]`)).not.toBeNull()
    expect(meaningKeyProblem('equation', '[5; 2]')).not.toBeNull()
  })
})

describe('a plus or minus with a root or a fraction is two values', () => {
  test.each([
    [`x = 1 ${PM} ${ROOT}3`, `x = 1 + ${ROOT}3 or x = 1 ${MINUS} ${ROOT}3`],
    [`x = 1 ${PM} ${ROOT}3`, 'x = 1 - sqrt(3); x = 1 + sqrt(3)'],
    [`x = 1 ${PM} ${ROOT}3`, `x = 1 ${PM} ${ROOT}3`],
    [`x = 1 ${PM} ${ROOT}3`, 'x = 1 + sqrt(3) and x = 1 - sqrt(3)'],
    [`x = (5 ${PM} ${ROOT}17)/4`, `x = (5 + ${ROOT}17)/4 or x = (5 ${MINUS} ${ROOT}17)/4`],
    [`x = (5 ${PM} ${ROOT}17)/4`, `x = (5 - ${ROOT}17)/4, x = (5 + ${ROOT}17)/4`],
    [`x = (5 ${PM} ${ROOT}17)/4`, `x = (5 ${PM} ${ROOT}17)/4`],
    [`x = -1 ${PM} 2${ROOT}2`, `x = -1 + 2${ROOT}2 or x = -1 - 2${ROOT}2`],
    [`x = ${PM}2`, 'x = 2 or x = -2'],
    [`x = ${PM}${ROOT}3`, `x = ${ROOT}3 or x = -${ROOT}3`],
    [`x = ${PM}1/2`, 'x = 0,5 or x = -0,5'],
    ['x = 1 + √2 or x = 1 − √2', `x = 1 ${PM} ${ROOT}2`],
  ])('key %j == answer %j (both ways)', (key, answer) => {
    expect(same(key, answer)).toBe(true)
    expect(same(answer, key)).toBe(true)
  })

  test.each([
    [`x = 1 ${PM} ${ROOT}3`, `x = 1 + ${ROOT}3`],
    [`x = 1 ${PM} ${ROOT}3`, `x = 1 ${MINUS} ${ROOT}3`],
    [`x = 1 ${PM} ${ROOT}3`, `x = 1 ${PM} ${ROOT}2`],
    [`x = 1 ${PM} ${ROOT}3`, `x = 2 ${PM} ${ROOT}3`],
    [`x = 1 ${PM} ${ROOT}3`, `x = ${PM}${ROOT}3`],
    [`x = (5 ${PM} ${ROOT}17)/4`, `x = (5 + ${ROOT}17)/4`],
    [`x = (5 ${PM} ${ROOT}17)/4`, `x = 5 ${PM} ${ROOT}17/4`],
    [`x = (5 ${PM} ${ROOT}17)/4`, `x = (5 ${PM} ${ROOT}17)/2`],
    [`x = ${PM}2`, 'x = 2'],
  ])('key %j is not answer %j', (key, answer) => {
    expect(same(key, answer)).toBe(false)
  })

  test('the save gate reads such a key', () => {
    expect(meaningKeyProblem('equation', `x = 1 ${PM} ${ROOT}3`)).toBeNull()
    expect(meaningKeyProblem('equation', `x = (5 ${PM} ${ROOT}17)/4`)).toBeNull()
    expect(meaningKeyProblem('equation', `x = 1 ${PM}`)).not.toBeNull()
  })
})

describe('two letters are a pair, each letter once, in any order', () => {
  test.each([
    ['x = 2 and y = 3', 'x = 2 and y = 3'],
    ['x = 2 and y = 3', 'x = 2; y = 3'],
    ['x = 2 and y = 3', 'x = 2, y = 3'],
    ['x = 2 and y = 3', 'x=2,y=3'],
    ['x = 2 and y = 3', 'y = 3 and x = 2'],
    ['x = 2 and y = 3', 'y = 3; x = 2'],
    ['x = 2 and y = 3', '(2; 3)'],
    ['x = 2 and y = 3', '(2, 3)'],
    ['x = 2 and y = 3', '(2,3)'],
    ['x = -1 and y = 4', `x = ${MINUS}1 and y = 4`],
    ['x = -1 and y = 4', `(${MINUS}1; 4)`],
    ['x = 1/2 and y = 0,5', 'x = 0,5; y = 1/2'],
    [`x = ${ROOT}2 and y = 3`, `y = 3; x = ${ROOT}2`],
    ['a = 1 and b = 2', '(1; 2)'],
    ['(2; 3)', 'x = 2 and y = 3'],
    ['(2; 3)', 'y = 3 and x = 2'],
    ['(2; 3)', '(2; 3)'],
  ])('key %j == answer %j', (key, answer) => {
    expect(same(key, answer)).toBe(true)
  })

  test.each([
    ['x = 2 and y = 3', 'x = 3 and y = 2'],
    ['x = 2 and y = 3', '(3; 2)'],
    ['x = 2 and y = 3', 'x = 2'],
    ['x = 2 and y = 3', 'y = 3'],
    ['x = 2 and y = 3', 'x = 2 and y = 4'],
    ['x = 2 and y = 3', 'x = 2 and z = 3'],
    ['x = 2 and y = 3', 'x = 2 or y = 3'],
    ['x = 2 and y = 3', 'x = 2 or x = 3'],
    ['x = 2 and y = 3', '(2; 3; 4)'],
    ['(2; 3)', 'x = 3 and y = 2'],
    ['(2; 3)', '(3; 2)'],
  ])('key %j is not answer %j', (key, answer) => {
    expect(same(key, answer)).toBe(false)
  })

  test('a letter twice is not a pair; an "or" between two letters is not a pair', () => {
    expect(meaningKeyProblem('equation', 'x = 2 and x = 3')).toBeNull() // two values of one letter, as before
    expect(meaningKeyProblem('equation', 'x = 3 or y = 4')).not.toBeNull()
    expect(isPairKey('x = 2 and y = 3')).toBe(true)
    expect(isPairKey('x = 2; y = 3')).toBe(true)
    expect(isPairKey('x = 2 or x = 3')).toBe(false)
    expect(isPairKey('x = 3 or y = 4')).toBe(false)
    expect(isPairKey('x < 3')).toBe(false)
    expect(isPairKey('x = 3')).toBe(false)
  })

  test('the save gate reads a pair key', () => {
    expect(meaningKeyProblem('equation', 'x = 2 and y = 3')).toBeNull()
    expect(meaningKeyProblem('equation', 'x = 2; y = -3')).toBeNull()
    expect(meaningKeyProblem('equation', '(2; -3)')).toBeNull()
  })
})

describe('a circle, a line and other equations with more than one letter are compared as equations', () => {
  test.each([
    [`(x ${MINUS} 1)${SQUARED} + (y + 2)${SQUARED} = 9`, '(x-1)^2 + (y+2)^2 = 9'],
    [`(x ${MINUS} 1)${SQUARED} + (y + 2)${SQUARED} = 9`, `(y + 2)${SQUARED} + (x ${MINUS} 1)${SQUARED} = 9`],
    [`(x ${MINUS} 1)${SQUARED} + (y + 2)${SQUARED} = 9`, '9 = (x - 1)^2 + (y + 2)^2'],
    [`(x ${MINUS} 1)${SQUARED} + (y + 2)${SQUARED} = 9`, `x${SQUARED} ${MINUS} 2x + y${SQUARED} + 4y ${MINUS} 4 = 0`],
    [`(x ${MINUS} 1)${SQUARED} + (y + 2)${SQUARED} = 9`, 'x^2 + y^2 - 2x + 4y = 4'],
    [`(x ${MINUS} 1)${SQUARED} + (y + 2)${SQUARED} = 9`, '2(x-1)^2 + 2(y+2)^2 = 18'],
    [`x${SQUARED} + y${SQUARED} = 25`, 'x^2 + y^2 = 25'],
    [`x${SQUARED} + y${SQUARED} = 25`, `y${SQUARED} + x${SQUARED} = 25`],
    [`x${SQUARED} + y${SQUARED} = 25`, 'x^2 + y^2 - 25 = 0'],
    [`x${SQUARED} + y${SQUARED} = 25`, '25 = x^2 + y^2'],
    [`x${SQUARED} + y${SQUARED} = 25`, '2x^2 + 2y^2 = 50'],
    ['y = 2x + 3', 'y = 2x + 3'],
    ['y = 2x + 3', 'y = 3 + 2x'],
    ['y = 2x + 3', `2x ${MINUS} y + 3 = 0`],
    ['y = 2x + 3', 'y - 2x = 3'],
    ['y = 2x + 3', '2y = 4x + 6'],
    ['y = 2x + 3', '2x + 3 = y'],
    ['y = x', 'x = y'],
    ['y = -x + 5', 'x + y = 5'],
    ['3x + 4y = 12', 'y = -3x/4 + 3'],
    ['y = 1/2x - 1', 'x - 2y = 2'],
  ])('key %j == answer %j', (key, answer) => {
    expect(same(key, answer)).toBe(true)
    expect(same(answer, key)).toBe(true)
  })

  test.each([
    [`(x ${MINUS} 1)${SQUARED} + (y + 2)${SQUARED} = 9`, '(x-1)^2 + (y+2)^2 = 10'],
    [`(x ${MINUS} 1)${SQUARED} + (y + 2)${SQUARED} = 9`, '(x+1)^2 + (y+2)^2 = 9'],
    [`(x ${MINUS} 1)${SQUARED} + (y + 2)${SQUARED} = 9`, '(x-1)^2 + (y-2)^2 = 9'],
    [`(x ${MINUS} 1)${SQUARED} + (y + 2)${SQUARED} = 9`, '(x-1)^2 + (y+2)^2 = 3'],
    [`(x ${MINUS} 1)${SQUARED} + (y + 2)${SQUARED} = 9`, 'x^2 + y^2 = 9'],
    [`x${SQUARED} + y${SQUARED} = 25`, 'x^2 + y^2 = 16'],
    [`x${SQUARED} + y${SQUARED} = 25`, 'x^2 - y^2 = 25'],
    [`x${SQUARED} + y${SQUARED} = 25`, 'x^2 + y^2 < 25'],
    [`x${SQUARED} + y${SQUARED} = 25`, 'x^2 + y^2'],
    [`x${SQUARED} + y${SQUARED} = 25`, 'x = 5'],
    ['y = 2x + 3', 'y = 2x + 4'],
    ['y = 2x + 3', 'y = 3x + 3'],
    ['y = 2x + 3', 'y = -2x + 3'],
    ['y = 2x + 3', 'x = 2y + 3'],
    ['y = 2x + 3', 'y = 2x'],
    ['y = 2x + 3', '2x + 3'],
    ['y = 2x + 3', 'y = 2z + 3'],
    ['y = 2x + 3', 'x = 3'],
    ['x = 3', 'y = 2x + 3'],
    ['y = x', 'y = -x'],
  ])('key %j is not answer %j', (key, answer) => {
    expect(same(key, answer)).toBe(false)
  })

  test('the save gate reads such a key; an equation with one letter and no value is still not a key', () => {
    for (const key of [`(x ${MINUS} 1)${SQUARED} + (y + 2)${SQUARED} = 9`, `x${SQUARED} + y${SQUARED} = 25`, 'y = 2x + 3', 'y = x', '3x + 4y = 12']) {
      expect(meaningKeyProblem('equation', key), key).toBeNull()
    }
    for (const key of ['2x + 3', 'x', 'x + 1 = 3', 'x^2 = 9', 'x = 3 or y = 4', 'x =', '= 3']) expect(meaningKeyProblem('equation', key), key).not.toBeNull()
  })

  test('the expression kind keeps its own rules: a name in front is taken off, an equation of two letters is not an expression', () => {
    expect(markByMeaning('expression', 'y = 2x + 3', '2x + 3').correct).toBe(true)
    expect(markByMeaning('expression', '2x + 3', 'y = 2x + 3').correct).toBe(true)
    expect(markByMeaning('expression', '2x + 3', 'y = 2x + 4').correct).toBe(false)
    expect(markReadAnswer('y = 2x + 3', '2x + 3')).toBe(true)
    expect(markReadAnswer('y = 2x + 3', 'y = 2x + 3')).toBe(true)
  })
})

describe('a domain or a range is a set of numbers', () => {
  test.each([
    ['y >= -4', 'y >= -4'],
    ['y >= -4', `y ${GE} ${MINUS}4`],
    ['y >= -4', `[-4; ${INF})`],
    ['y >= -4', `y ${ELEMENT} [-4; ${INF})`],
    [`y ${ELEMENT} [-4; ${INF})`, 'y >= -4'],
    ['x > 0', `(0; ${INF})`],
    ['x > 0', `x ${ELEMENT} (0; ${INF})`],
    ['x > 0', `x ${ELEMENT} ${REALS}, x > 0`],
    [`x ${NE} 2`, `x ${ELEMENT} ${REALS}, x ${NE} 2`],
    [`x ${NE} 2`, `x ${ELEMENT} ${REALS} and x ${NE} 2`],
    [`x ${NE} 2`, `x ${NE} 2, x ${ELEMENT} ${REALS}`],
    [`x ${NE} 2`, `(-${INF}; 2) ${CUP} (2; ${INF})`],
    [`x ${ELEMENT} ${REALS}`, `x ${ELEMENT} ${REALS}`],
    [`x ${ELEMENT} ${REALS}`, 'x in R'],
    [`x ${ELEMENT} ${REALS}`, REALS],
    [`x ${ELEMENT} ${REALS}`, 'R'],
    [`x ${ELEMENT} ${REALS}`, 'all real numbers'],
    [`x ${ELEMENT} ${REALS}`, 'All real numbers'],
    [`x ${ELEMENT} ${REALS}`, `x ${ELEMENT} (-${INF}; ${INF})`],
    [`x ${ELEMENT} ${REALS}`, `(-${INF}; ${INF})`],
    [REALS, 'all real numbers'],
    ['all real numbers', `x ${ELEMENT} ${REALS}`],
    ['x >= 2 and x <= 7', '[2; 7]'],
  ])('key %j == answer %j', (key, answer) => {
    expect(same(key, answer)).toBe(true)
  })

  test.each([
    ['y >= -4', 'y > -4'],
    ['y >= -4', 'y <= -4'],
    ['y >= -4', `(-4; ${INF})`],
    ['x > 0', `x ${ELEMENT} ${REALS}`],
    ['x > 0', 'x >= 0'],
    [`x ${NE} 2`, `x ${ELEMENT} ${REALS}`],
    [`x ${NE} 2`, 'x > 2'],
    [`x ${ELEMENT} ${REALS}`, 'x > 0'],
    [`x ${ELEMENT} ${REALS}`, `x ${ELEMENT} (0; ${INF})`],
    [`x ${ELEMENT} ${REALS}`, `x ${NE} 0`],
    [`x ${ELEMENT} ${REALS}`, 'y in R'],
    ['all real numbers', 'x > 0'],
    ['all real numbers', 'x = 0'],
  ])('key %j is not answer %j', (key, answer) => {
    expect(same(key, answer)).toBe(false)
  })

  test('the save gate reads these keys', () => {
    for (const key of ['y >= -4', `x ${ELEMENT} ${REALS}`, `x ${ELEMENT} ${REALS}, x ${NE} 2`, 'all real numbers', REALS, 'R', `y ${ELEMENT} [-4; ${INF})`, `(-${INF}; -1) ${CUP} (4; ${INF})`, `[2; ${INF})`]) {
      expect(meaningKeyProblem('equation', key), key).toBeNull()
      expect(answerProblem(asked('equation', key)), key).toBeNull()
    }
  })
})

describe('what the screen is told about a key, without its values', () => {
  test.each([
    'x < 4',
    '-2 <= x < 3',
    `-2 ${LE} x < 3`,
    'x < -1 or x > 4',
    `x ${NE} 2`,
    'y >= -4',
    `(-${INF}; 3]`,
    '(1; 4)',
    `[2; ${INF})`,
    `(-${INF}; -1) ${CUP} (4; ${INF})`,
    `x ${ELEMENT} ${REALS}`,
    'all real numbers',
  ])('%j is an inequality key', (key) => {
    expect(isInequalityKey(key)).toBe(true)
  })

  test.each(['x = 4', 'x = 3 or x = -1', `x = 1 ${PM} ${ROOT}3`, 'x = 2 and y = 3', 'y = 2x + 3', `x${SQUARED} + y${SQUARED} = 25`, '3 or -1', '', 'banana', 'x'])(
    '%j is not an inequality key',
    (key) => {
      expect(isInequalityKey(key)).toBe(false)
    },
  )
})

describe('the save gate and the screen mark these through the same function', () => {
  test('finishAnswer (the server action and the paper path) marks an interval typed for an inequality key', () => {
    const q = { prompt: 'Solve 2x + 1 <= 7', answer: 'x <= 3', answerKind: 'equation' as const }
    expect(finishAnswer(q, `(-${INF}; 3]`)).toEqual({ stored: `(-${INF}; 3]`, correct: true })
    expect(finishAnswer(q, `(-${INF}; 3)`).correct).toBe(false)
    const pair = { prompt: 'Solve the pair', answer: 'x = 2 and y = 3', answerKind: 'equation' as const }
    expect(finishAnswer(pair, '(2; 3)').correct).toBe(true)
    expect(finishAnswer(pair, 'x = 2; y = 3').correct).toBe(true)
    const circle = { prompt: 'Write the equation of the circle', answer: 'x^2 + y^2 = 25', answerKind: 'equation' as const }
    expect(finishAnswer(circle, `x${SQUARED} + y${SQUARED} = 25`).correct).toBe(true)
  })

  test('old equation answers are marked exactly as before', () => {
    const table: [string, string, boolean][] = [
      ['x = 3', 'x = 3', true],
      ['x = 3 or x = -1', 'x = -1 and x = 3', true],
      ['x = 3 or x = -1', 'x = 3', false],
      ['x = 3', 'y = 3', false],
      ['x <= 3', 'x = 3', false],
      ['x <= 3', '3 >= x', true],
      ['x < -1 or x > 4', 'x > 4 or x < -1', true],
      ['x < -1 or x > 4', 'x < -1 or x >= 4', false],
      ['x = 0,5', 'x = 1/2', true],
      ['x = 1 + √2', 'x = 1 + sqrt(2)', true],
    ]
    for (const [key, answer, right] of table) expect(same(key, answer), `${key} / ${answer}`).toBe(right)
    expect(mark('x = 3', '')).toEqual({ correct: false, comparable: false })
    expect(mark('x = 3 or x = -1', 'x = y').correct).toBe(false)
  })
})
