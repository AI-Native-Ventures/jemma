import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { renderPrompt, SENIOR_EQUATION_EXAMPLES } from '../../src/ai/prompt-variants'
import { makeClassContext } from '../../src/ai/subject-profile'
import { markByMeaning, meaningKeyProblem } from '../../src/logic'

// P147: the senior lesson writer is told every form an `equation` answer may take, and when to use each. A kind the AI is not told about is never used, and a
// form it is told about must be one the code reads: every example of the prompt is checked against the save gate and the marking. No database, no model.

const dir = join(import.meta.dirname, '../../src/jobs')
const md = (job: string) => readFileSync(join(dir, `${job}.md`), 'utf8')
const klass = (subject: string, grade: number, country: string) => makeClassContext({ classId: 'class-1', subject, grade, country })
const senior = (grade = 10, country = 'ZA') => renderPrompt('write_lesson', md('write_lesson'), klass('Mathematics', grade, country))

describe('the senior prompt names every form of an equation answer', () => {
  test.each([[7], [9], [10], [12]])('Grade %i: one value, several values, an inequality, an interval, a pair, and the equation of a line or a circle', (grade) => {
    const out = senior(grade)
    // what was there before stays
    expect(out).toContain('`equation` (`x = 3 or x = -1`')
    expect(out).toContain('`point` (`(2; -3)`)')
    // and the forms, each with the words that say when
    expect(out).toContain('one value (`x = 4`)')
    expect(out).toContain('several values joined with `or` (`x = 2 or x = 3`)')
    expect(out).toContain('an inequality')
    expect(out).toContain('an interval')
    expect(out).toContain('a pair')
    expect(out).toContain('the equation of a line or a circle')
    expect(out).toContain('`point` for coordinates')
  })

  test('every example in the list is in the prompt, in backticks', () => {
    const out = senior()
    for (const example of SENIOR_EQUATION_EXAMPLES) expect(out, example).toContain(`\`${example}\``)
  })

  test('the same words for a class outside South Africa (no currency, no comma): the equation forms are not about money', () => {
    const out = senior(10, 'KE')
    for (const example of SENIOR_EQUATION_EXAMPLES) expect(out, example).toContain(`\`${example}\``)
  })

  test('it says that a learner may type the inequality as an interval and the other way round', () => {
    expect(senior()).toMatch(/an interval[^.]*the same answer as its inequality/)
  })

  test('no dash of the long kind, and the Grade 6 baseline and a class below Grade 7 are told nothing about it', () => {
    expect(senior()).not.toContain(String.fromCharCode(0x2014))
    const baseline = renderPrompt('write_lesson', md('write_lesson'), klass('Mathematics', 6, 'ZA'))
    expect(baseline).toBe(md('write_lesson'))
    for (const grade of [4, 5]) {
      const out = renderPrompt('write_lesson', md('write_lesson'), klass('Mathematics', grade, 'ZA'))
      expect(out).not.toMatch(/inequality|interval|`equation`/)
    }
    expect(renderPrompt('write_lesson', md('write_lesson'), klass('Natural Sciences', 10, 'ZA'))).not.toMatch(/inequality|interval|`equation`/)
  })
})

describe('what the prompt shows is what the code reads and marks', () => {
  test.each([...SENIOR_EQUATION_EXAMPLES])('the example %j passes the save gate and is marked right when typed back', (example) => {
    expect(meaningKeyProblem('equation', example)).toBeNull()
    expect(markByMeaning('equation', example, example)).toEqual({ correct: true, comparable: true })
  })
})
