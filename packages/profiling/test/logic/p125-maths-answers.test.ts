import { describe, expect, test } from 'vitest'
import { markByMeaning, markQuestion, meaningKeyProblem, readMath } from '../../src/logic'
import type { Form, MeaningKind } from '../../src/schemas/lesson'

// P125: the keys of the answer box can type fractions, roots, pi, theta, degrees, sin, cos, tan, a derivative's name and a rand sign, and the marking
// reads all of it by meaning. Every wrong answer below must stay wrong. No database, no model.

const MINUS = '−'
const TIMES = '×'
const DIVIDE = '÷'
const PI = 'π'
const THETA = 'θ'
const DEG = '°'
const ROOT = '√'
const PRIME = '′'
const PLUS_MINUS = '±'
const SQUARED = '²'

type Case = [kind: MeaningKind, key: string, answer: string, right: boolean, form?: Form]
const mark = (kind: MeaningKind, key: string, answer: string, form?: Form) => markByMeaning(kind, key, answer, form).correct

describe('number: trigonometry, pi, roots and fractions typed with the keys', () => {
  const table: Case[] = [
    // sin, cos and tan of an angle: degrees when the angle is a plain number, with or without the degree sign
    ['number', '0,5', `sin(30${DEG})`, true],
    ['number', '0,5', 'sin(30)', true],
    ['number', '0,5', `sin 30${DEG}`, true],
    ['number', '0,5', `sin30${DEG}`, true],
    ['number', '0,5', `cos(60${DEG})`, true],
    ['number', '1', `tan(45${DEG})`, true],
    ['number', '0,5', `sin(150${DEG})`, true],
    ['number', '0,5', `sin(45${DEG})`, false],
    ['number', '0,5', `cos(30${DEG})`, false],
    ['number', '0,5', `tan(30${DEG})`, false],
    ['number', `${ROOT}3/2`, `sin(60${DEG})`, true],
    ['number', `sin(30${DEG})`, '1/2', true],
    ['number', '1', `sin${SQUARED}(30${DEG}) + cos${SQUARED}(30${DEG})`, true],
    ['number', '1', `sin^2(30) + cos^2(30)`, true],
    ['number', '0,5', `sin(${PI}/6)`, true],
    // an angle answer: with the degree sign or without it is the same angle
    ['number', `36,9${DEG}`, '36,9', true],
    ['number', `${MINUS}30${DEG}`, `-30`, true],
    ['number', `30${DEG}`, `31${DEG}`, false],
    // pi
    ['number', `2${PI}`, `2${PI}`, true],
    ['number', `2${PI}`, '2pi', true],
    ['number', `2${PI}`, '2*pi', true],
    ['number', `2${PI}`, `2 ${TIMES} ${PI}`, true],
    ['number', `${PI}/2`, 'pi/2', true],
    ['number', PI, '3,14159265358979', true],
    ['number', PI, '3,14', false],
    ['number', `2${PI}`, '6,28', false],
    ['number', `2${PI}`, `3${PI}`, false],
    // roots
    ['number', `2${ROOT}2`, `${ROOT}8`, true],
    ['number', `3${ROOT}2`, `${ROOT}18`, true],
    ['number', `${ROOT}6`, `${ROOT}2${TIMES}${ROOT}3`, true],
    ['number', `2${ROOT}2`, `${ROOT}9`, false],
    ['number', `2${ROOT}2`, `2${ROOT}3`, false],
    ['number', '3', `${ROOT}(9)`, true],
    // fractions, mixed numbers, signs
    ['number', '0,75', '(3)/(4)', true],
    ['number', '3/4', '(3)/(4)', true],
    ['number', '1 1/2', '3/2', true],
    ['number', '-3/4', `${MINUS}3/4`, true],
    ['number', '-3/4', '-0,75', true],
    ['number', '-3/4', '3/4', false],
    ['number', '6', `2${TIMES}3`, true],
    ['number', '3', `9${DIVIDE}3`, true],
    ['number', '-8', '(-2)^3', true],
    // a rand sign and a space between the thousands
    ['number', '12,5', 'R12,50', true],
    ['number', '12,5', 'R 12,50', true],
    ['number', '12,5', 'R13,50', false],
    ['number', '1250', '1 250', true],
    ['number', '1250', 'R1 250', true],
    ['number', '1250', '1 251', false],
    ['number', '5', '5 5', false],
    // words and letters that are not an answer to a number question stay wrong
    ['number', '0,5', 'sin', false],
    ['number', '0,5', 'sin(x)', false],
    ['number', '5', 'five', false],
    ['number', '1', `tan(90${DEG})`, false],
  ]
  test.each(table)('%s key %j, answer %j is right: %s', (kind, key, answer, right, form) => {
    expect(mark(kind, key, answer, form)).toBe(right)
  })
})

describe('expression: trigonometry, pi, fractions and the names of a function and a derivative', () => {
  const table: Case[] = [
    ['expression', 'sin(x)', 'sin x', true],
    ['expression', 'sin(x)', 'sin(x)', true],
    ['expression', 'sin(x)', 'cos(x)', false],
    ['expression', 'sin(x)', 'sin(2x)', false],
    ['expression', 'sin(2x)', 'sin 2x', true],
    ['expression', '2sin(x)cos(x)', '2 sin x cos x', true],
    ['expression', 'sin^2(x)', `sin${SQUARED}(x)`, true],
    ['expression', `sin(x)^2`, `sin${SQUARED}x`, true],
    ['expression', '1 - cos^2(x)', `sin${SQUARED}(x)`, true],
    ['expression', 'tan(x)', 'sin(x)/cos(x)', true],
    ['expression', 'tan(x)', 'sin(x)/sin(x)', false],
    ['expression', `sin(${THETA})`, `sin ${THETA}`, true],
    ['expression', `sin(${THETA})`, 'sin(x)', false],
    ['expression', `2${PI}r`, `2 ${PI} r`, true],
    ['expression', `2${PI}r`, '2*pi*r', true],
    ['expression', `${PI}r${SQUARED}`, 'pi r^2', true],
    ['expression', `${PI}r${SQUARED}`, `${PI}r^2`, true],
    ['expression', `${PI}r${SQUARED}`, `${PI}r`, false],
    ['expression', 'x/2', `x${DIVIDE}2`, true],
    ['expression', 'x/2', '(1/2)x', true],
    ['expression', 'x/2', 'x/3', false],
    ['expression', '(x+1)/(x-1)', `(x+1)${DIVIDE}(x${MINUS}1)`, true],
    ['expression', '(x+1)/(x-1)', '(x+1)/x-1', false],
    ['expression', `${ROOT}(x+1)`, 'sqrt(x+1)', true],
    ['expression', `${ROOT}(x+1)`, `${ROOT}x+1`, false],
    ['expression', `x${SQUARED}${MINUS}4`, `(x+2)(x${MINUS}2)`, true],
    ['expression', 'x^2', 'x^3', false],
    // the name of a function or a derivative in front of the answer
    ['expression', '6x', `f${PRIME}(x) = 6x`, true],
    ['expression', '6x', "f'(x)=6x", true],
    ['expression', '6x', 'dy/dx = 6x', true],
    ['expression', '6x', 'd/dx = 6x', true],
    ['expression', '6x', 'y = 6x', true],
    ['expression', '2x+1', 'f(x) = 2x + 1', true],
    ['expression', `f${PRIME}(x) = 6x`, '6x', true],
    ['expression', '6x', `f${PRIME}(x) = 6`, false],
    ['expression', '6x', `f${PRIME}(x) = 7x`, false],
    ['expression', '2x+3', '2x+3 = 0', false],
    ['expression', '3', 'x = 3', false],
    ['expression', '2x', 'x = 2x', false],
  ]
  test.each(table)('%s key %j, answer %j is right: %s', (kind, key, answer, right, form) => {
    expect(mark(kind, key, answer, form)).toBe(right)
  })

  test('the form of an expression still counts when a function name stands in front', () => {
    expect(mark('expression', '(x+2)(x-2)', 'f(x) = (x+2)(x-2)', 'factorised')).toBe(true)
    expect(mark('expression', '(x+2)(x-2)', `f(x) = x${SQUARED} - 4`, 'factorised')).toBe(false)
  })
})

describe('equation: values with roots, pi, fractions, degrees and a plus or minus', () => {
  const table: Case[] = [
    ['equation', `x = ${ROOT}2`, 'x = 1,4142135623', true],
    ['equation', 'x = 1/2', 'x = 0,5', true],
    ['equation', 'x = 1/2', 'x = (1)/(2)', true],
    ['equation', `x = ${PI}`, 'x = pi', true],
    ['equation', 'x = 3 or x = -1', `x = ${MINUS}1 or x = 3`, true],
    ['equation', 'x = 3 or x = -1', 'x = 3', false],
    ['equation', 'x = 2 or x = -2', `x = ${PLUS_MINUS}2`, true],
    ['equation', `x = ${PLUS_MINUS}2`, 'x = 2 or x = -2', true],
    ['equation', `x = ${PLUS_MINUS}2`, 'x = 2', false],
    ['equation', `x = ${PLUS_MINUS}${ROOT}2`, `x = ${ROOT}2 or x = ${MINUS}${ROOT}2`, true],
    ['equation', `${THETA} = 30${DEG}`, `${THETA} = 30`, true],
    ['equation', `${THETA} = 30${DEG} or ${THETA} = 150${DEG}`, `${THETA} = 150${DEG}; ${THETA} = 30${DEG}`, true],
    ['equation', `${THETA} = 30${DEG}`, `${THETA} = 31${DEG}`, false],
    ['equation', `${THETA} = 30${DEG}`, `x = 30${DEG}`, false],
    ['equation', 'x = 0,5', `x = sin(30${DEG})`, true],
    ['equation', 'x = 3', 'y = 3', false],
  ]
  test.each(table)('%s key %j, answer %j is right: %s', (kind, key, answer, right, form) => {
    expect(mark(kind, key, answer, form)).toBe(right)
  })
})

describe('point: coordinates read the same symbols', () => {
  const table: Case[] = [
    ['point', '(1/2; -3)', `(0,5; ${MINUS}3)`, true],
    ['point', `(${ROOT}2; 1)`, '(1,4142135623; 1)', true],
    ['point', `(${PI}; 0)`, '(pi; 0)', true],
    ['point', '(2; -3)', '(2; 3)', false],
  ]
  test.each(table)('%s key %j, answer %j is right: %s', (kind, key, answer, right, form) => {
    expect(mark(kind, key, answer, form)).toBe(right)
  })
})

describe('the reader', () => {
  test('sin, cos and tan are functions, pi and theta are one thing each, and a word that is not one of them is still letters', () => {
    expect(readMath('sin x')).toMatchObject({ t: 'fn', name: 'sin' })
    expect(readMath('cos(x)')).toMatchObject({ t: 'fn', name: 'cos' })
    expect(readMath('tan x')).toMatchObject({ t: 'fn', name: 'tan' })
    expect(readMath('pi')).toEqual({ t: 'pi' })
    expect(readMath(PI)).toEqual({ t: 'pi' })
    expect(readMath(THETA)).toEqual({ t: 'var', name: THETA })
    expect(readMath('sin')).toBeNull()
    expect(readMath('sin()')).toBeNull()
    expect(readMath('x(')).toBeNull()
  })

  test('a text of more than 60 characters is not read', () => {
    expect(readMath(`sin(x)+`.repeat(10) + 'x')).toBeNull()
  })

  test('a number question needs a key that reads as a number: a letter is not one', () => {
    expect(meaningKeyProblem('number', `sin(30${DEG})`)).toBeNull()
    expect(meaningKeyProblem('number', `2${PI}`)).toBeNull()
    expect(meaningKeyProblem('number', 'sin(x)')).not.toBeNull()
    expect(meaningKeyProblem('expression', `f${PRIME}(x) = 6x`)).toBeNull()
    expect(meaningKeyProblem('expression', `sin(${THETA})`)).toBeNull()
    expect(meaningKeyProblem('expression', `2${PI}`)).not.toBeNull()
  })

  test('markQuestion sends the new answers through the same door', () => {
    expect(markQuestion({ answer: '0,5', answerKind: 'number' }, `sin(30${DEG})`).correct).toBe(true)
    expect(markQuestion({ answer: '1/2', answerKind: 'fraction' }, '1/2').correct).toBe(true)
    expect(markQuestion({ answer: 'R12,50', answerKind: 'money' }, 'R12,50').correct).toBe(true)
  })
})
