import { describe, expect, test } from 'vitest'
import { markByMeaning, meaningKeyProblem, readMath } from '../../src/logic'
import type { MeaningKind } from '../../src/schemas/lesson'

// P132b: the keys of the maths editor type e, ln, log, the inverse functions, |x|, Greek letters and the relations < > <= >= != . The marking reads all of them by
// meaning (a wrong answer stays wrong). No database, no model.

const ALPHA = 'α'
const BETA = 'β'
const GAMMA = 'γ'
const LE = '≤'
const GE = '≥'
const NE = '≠'
const MINUS = '−'
const mark = (kind: MeaningKind, key: string, answer: string) => markByMeaning(kind, key, answer).correct
type Case = [kind: MeaningKind, key: string, answer: string, right: boolean]

describe('e, ln and log', () => {
  const table: Case[] = [
    ['number', '2,718281828', 'e', true],
    ['number', 'e', '2,71828182846', true],
    ['number', 'e^2', '7,3890560989', true],
    ['number', '1', 'e^0', true],
    ['number', 'e', '3', false],
    ['number', 'e', 'ex', false],
    ['number', '1', 'ln(e)', true],
    ['number', '2', 'ln(e^2)', true],
    ['number', '0', 'ln(1)', true],
    ['number', '2,302585093', 'ln(10)', true],
    ['number', '1', 'ln 0', false],
    ['number', '1', 'ln(-1)', false],
    ['number', '2', 'log(100)', true],
    ['number', '3', 'log(1000)', true],
    ['number', '0', 'log(1)', true],
    ['number', '2', 'log(10)', false],
    ['number', '5', 'five', false],
    ['expression', 'e^x', 'e^x', true],
    ['expression', 'e^x', 'e^(x)', true],
    ['expression', '2e^x', '2*e^x', true],
    ['expression', 'e^(2x)', '(e^x)^2', true],
    ['expression', 'ln(e^x)', 'x', true],
    ['expression', 'ln(x)', 'ln x', true],
    ['expression', 'ln(x)', 'log(x)', false],
    ['expression', 'ln(x)', 'ln(2x)', false],
    ['expression', 'log(x)', 'ln(x)/ln(10)', true],
  ]
  test.each(table)('%s key %j answer %j is right: %s', (kind, key, answer, right) => expect(mark(kind, key, answer)).toBe(right))

  test('the letter e on its own is a number; e and x side by side are two letters', () => {
    expect(readMath('e')).toEqual({ t: 'e' })
    expect(readMath('ex')).toMatchObject({ t: 'mul', a: { t: 'var', name: 'e' }, b: { t: 'var', name: 'x' } })
  })
})

describe('the inverse functions, in degrees for a plain number', () => {
  const table: Case[] = [
    ['number', '30', 'asin(0,5)', true],
    ['number', '60', 'acos(0,5)', true],
    ['number', '45', 'atan(1)', true],
    ['number', '30', 'arcsin(1/2)', true],
    ['number', `30°`, 'asin(0,5)', true],
    ['number', '30', 'atan(1)', false],
    ['number', '30', 'asin(2)', false],
    ['number', '0,5', 'asin(0,5)', false],
    ['number', '0,5', 'sin(asin(0,5))', true],
  ]
  test.each(table)('%s key %j answer %j is right: %s', (kind, key, answer, right) => expect(mark(kind, key, answer)).toBe(right))
})

describe('the absolute value', () => {
  const table: Case[] = [
    ['number', '3', 'abs(-3)', true],
    ['number', '5', 'abs(3-8)', true],
    ['number', '3', 'abs(-4)', false],
    ['expression', 'abs(x)', `abs(${MINUS}x)`, true],
    ['expression', 'abs(x)', 'x', false],
  ]
  test.each(table)('%s key %j answer %j is right: %s', (kind, key, answer, right) => expect(mark(kind, key, answer)).toBe(right))
})

describe('Greek letters name an angle or a length', () => {
  const table: Case[] = [
    ['equation', `${ALPHA} = 30°`, `${ALPHA} = 30`, true],
    ['equation', `${ALPHA} = 30°`, `${BETA} = 30°`, false],
    ['equation', `${ALPHA} = 30`, `${ALPHA} = 31`, false],
    ['expression', `${ALPHA} + ${BETA}`, `${BETA} + ${ALPHA}`, true],
    ['expression', `${ALPHA} + ${BETA}`, `${ALPHA} + ${GAMMA}`, false],
    ['expression', `2${ALPHA}`, `${ALPHA} + ${ALPHA}`, true],
  ]
  test.each(table)('%s key %j answer %j is right: %s', (kind, key, answer, right) => expect(mark(kind, key, answer)).toBe(right))
})

describe('inequalities: the same numbers on the line', () => {
  const table: Case[] = [
    ['equation', 'x < 3', 'x < 3', true],
    ['equation', 'x < 3', '3 > x', true],
    ['equation', `x ${LE} 3`, 'x <= 3', true],
    ['equation', 'x <= 3', 'x < 3', false],
    ['equation', `x ${GE} 2`, `2 ${LE} x`, true],
    ['equation', `x ${GE} 0,5`, `x ${GE} 1/2`, true],
    ['equation', `-2 < x ${LE} 5`, 'x > -2 and x <= 5', true],
    ['equation', `-2 < x ${LE} 5`, `${MINUS}2 < x < 5`, false],
    ['equation', `x ${NE} 0`, 'x != 0', true],
    ['equation', `x ${NE} 0`, 'x = 0', false],
    ['equation', 'x < -1 or x > 4', 'x > 4 or x < -1', true],
    ['equation', 'x < -1 or x > 4', 'x < -1', false],
    ['equation', 'x < 3', 'x < 3 and x < 5', true],
    ['equation', 'x < 3', 'x < 3,5', false],
    ['equation', 'x < 3', 'y < 3', false],
    ['equation', 'x < 3', 'x = 3', false],
    ['equation', 'x < 3', 'x < three', false],
    ['equation', 'x = 3', `x ${LE} 3`, false],
    ['equation', 'x = 3 or x = -1', 'x = -1 or x = 3', true],
  ]
  test.each(table)('%s key %j answer %j is right: %s', (kind, key, answer, right) => expect(mark(kind, key, answer)).toBe(right))

  test('a key that is an inequality can be marked by its kind; a text with two letters cannot', () => {
    expect(meaningKeyProblem('equation', `x ${LE} 3`)).toBeNull()
    expect(meaningKeyProblem('equation', '-2 < x < 5')).toBeNull()
    expect(meaningKeyProblem('equation', 'x < y')).not.toBeNull()
  })
})
