import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { PROMPT_JOBS, PROMPT_RULES, renderPrompt, type PromptJob } from '../../src/ai/prompt-variants'
import { makeClassContext } from '../../src/ai/subject-profile'

// Rendering a job's system prompt for a class. No database, no network, no model.
//
// A recorded demo answer is found by a hash of the whole model call, so the system text of the baseline class
// (Mathematics, Grade 6, South Africa) must stay byte for byte the text of the .md file. These tests pin that.

const dir = join(import.meta.dirname, '../../src/jobs')
const md = (job: PromptJob) => readFileSync(join(dir, `${job}.md`), 'utf8')
const klass = (subject: string, grade: number, country: string) => makeClassContext({ classId: 'class-1', subject, grade, country })

/** The sha256 of each prompt file as it is on develop (ba59b93, 11 Nov 2026). A recorded answer depends on every byte. */
const SHA256: Record<PromptJob, string> = {
  draft_map: '54dbb7deef1ecc33b9ea100222eb32cc41922cc74a1c6e8f9711c693f5550092',
  read_key: 'b7b9749f32882277b73553309b1e99e5cdc78804009a1e00a2f2af9aefd980a7',
  read_paper: 'f3de08ed978935906b9fedca766622f88a3e5bff7e54440add4d3777e91192be',
  diagnose: '9ba2f18fce405f512693d1769c245c556fb207daed897e97e2a148b61cea31bf',
  class_report: '95598f7b30f63791f5709db4ff43a1e9bab087fa3fcb8c71509015b3846c9cd4',
  write_lesson: '5e6509ff623e055a9a5cb1f41736690c2c013691ef971a40e0f84b8507b2b315',
  guidance: 'd0c5ad897f670043a53609edd80d845214853170667d14d218df145196161439',
}

describe('the prompt files are the ones the recorded answers were made with', () => {
  test.each(PROMPT_JOBS)('%s.md has the sha256 it has on develop', (job) => {
    expect(createHash('sha256').update(md(job)).digest('hex')).toBe(SHA256[job])
  })

  test('the jobs with a rendered prompt are the cloud jobs that have a prompt file, except the Long view', () => {
    expect([...PROMPT_JOBS].sort()).toEqual(['class_report', 'diagnose', 'draft_map', 'guidance', 'read_key', 'read_paper', 'write_lesson'])
  })
})

describe('every find is a phrase of its file', () => {
  test.each(PROMPT_JOBS)('%s: every find occurs exactly once in the .md text, so a later edit of the file fails here', (job) => {
    const text = md(job)
    expect(PROMPT_RULES[job].length).toBeGreaterThan(0)
    for (const rule of PROMPT_RULES[job]) {
      const at = text.split(rule.find).length - 1
      expect(at, `${job}: ${JSON.stringify(rule.find)} must occur once in ${job}.md, found ${at}`).toBe(1)
    }
  })

  test('no find is empty or only spaces', () => {
    for (const job of PROMPT_JOBS) for (const rule of PROMPT_RULES[job]) expect(rule.find.trim().length).toBeGreaterThan(3)
  })
})

describe('the baseline class gets the file as it is', () => {
  test.each(PROMPT_JOBS)('%s: Mathematics, Grade 6, ZA returns the .md text exactly', (job) => {
    const base = md(job)
    expect(renderPrompt(job, base, klass('Mathematics', 6, 'ZA'))).toBe(base)
  })

  test.each(PROMPT_JOBS)('%s: the same class written another way (Maths, the country spelt out) is the same text', (job) => {
    const base = md(job)
    expect(renderPrompt(job, base, klass('Maths', 6, 'ZA'))).toBe(base)
    expect(renderPrompt(job, base, klass('mathematics', 6, 'South Africa'))).toBe(base)
  })

  test.each(PROMPT_JOBS)('%s: a class that could not be told (null) gets the file as it is', (job) => {
    const base = md(job)
    expect(renderPrompt(job, base, null)).toBe(base)
  })

  test('a prompt that holds none of the phrases (the plain fallback of the lesson job) only gains the top line', () => {
    const fallback = 'Write one home lesson for the planned session as the lesson object.'
    expect(renderPrompt('write_lesson', fallback, klass('Mathematics', 6, 'ZA'))).toBe(fallback)
    expect(renderPrompt('write_lesson', fallback, klass('Natural Sciences', 9, 'KE'))).toBe(`Subject: Natural Sciences. Grade: 9. Country: Kenya.\n\n${fallback}`)
  })
})

describe('a class that is not the baseline', () => {
  const MONEY = /\bR5\b|\brand\b|`R`/i

  test.each(PROMPT_JOBS)('%s: Natural Sciences, Grade 9, Kenya names the class on top and keeps no South African or maths wording', (job) => {
    const out = renderPrompt(job, md(job), klass('Natural Sciences', 9, 'KE'))
    expect(out.startsWith('Subject: Natural Sciences. Grade: 9. Country: Kenya.\n\n')).toBe(true)
    expect(out).toContain('Natural Sciences')
    expect(out).toContain('Grade: 9')
    expect(out).not.toContain('Grade 6')
    expect(out).not.toMatch(/fraction/i)
    expect(out).not.toContain('South Africa')
    expect(out).not.toContain('decimal comma')
    expect(out).not.toMatch(MONEY)
    expect(out).not.toMatch(/undefined|\[object/)
  })

  test.each(PROMPT_JOBS)('%s: English, Grade 5, South Africa names the class on top and keeps no maths wording', (job) => {
    const out = renderPrompt(job, md(job), klass('English', 5, 'ZA'))
    expect(out.startsWith('Subject: English. Grade: 5. Country: South Africa.\n\n')).toBe(true)
    expect(out).toContain('English')
    expect(out).toContain('Grade: 5')
    expect(out).not.toContain('Grade 6')
    expect(out).not.toMatch(/fraction/i)
    expect(out).not.toMatch(MONEY)
    expect(out).not.toContain('decimal comma')
    expect(out).not.toMatch(/undefined|\[object/)
  })

  test.each(PROMPT_JOBS)('%s: the rest of the file is kept, only the phrases change', (job) => {
    const base = md(job)
    const out = renderPrompt(job, base, klass('Natural Sciences', 9, 'KE'))
    // Every line that is not touched by a rule is still there, in order.
    const touched = new Set(PROMPT_RULES[job].flatMap((r) => base.split('\n').filter((l) => l.includes(r.find))))
    const kept = base.split('\n').filter((l) => !touched.has(l))
    let from = 0
    for (const line of kept) {
      const at = out.indexOf(line, from)
      expect(at, `${job}: the line ${JSON.stringify(line.slice(0, 60))} must still be there`).toBeGreaterThanOrEqual(from)
      from = at + line.length
    }
  })

  test('the lesson job names the school country when it is not South Africa, and the real grade', () => {
    const out = renderPrompt('write_lesson', md('write_lesson'), klass('Natural Sciences', 9, 'KE'))
    expect(out).toContain('for a school in Kenya')
    expect(out).toContain('for a Grade 9 child')
    expect(out).toContain('`answer` must be one value that a computer can mark')
  })

  test('the curriculum reader suggests the family keys of the subject', () => {
    const science = renderPrompt('draft_map', md('draft_map'), klass('Natural Sciences', 9, 'KE'))
    for (const key of ['life_living', 'matter_materials', 'energy_change', 'earth_beyond']) expect(science).toContain(key)
    const english = renderPrompt('draft_map', md('draft_map'), klass('English', 5, 'ZA'))
    for (const key of ['reading', 'writing', 'language', 'speaking_listening']) expect(english).toContain(key)
    const art = renderPrompt('draft_map', md('draft_map'), klass('Art', 8, 'ZA'))
    expect(art).toContain('short lowercase word of your own')
    expect(art).not.toMatch(/fraction|life_living|reading/)
  })

  test('a grade sentence changes only when the grade is not what the sentence says', () => {
    // Mathematics Grade 5 in South Africa: "Grade 1 to 7" and "primary school" are still true.
    const five = (job: PromptJob) => renderPrompt(job, md(job), klass('Mathematics', 5, 'ZA'))
    expect(five('guidance')).toContain('Grade 1 to 7')
    expect(five('diagnose')).toContain('primary school class')
    expect(five('class_report')).toContain('primary school teacher')
    expect(five('write_lesson')).toContain('for a Grade 5 child')
    expect(five('write_lesson')).not.toContain('Grade 6')
    // Grade 9 is outside them.
    const nine = (job: PromptJob) => renderPrompt(job, md(job), klass('Mathematics', 9, 'ZA'))
    expect(nine('guidance')).not.toContain('Grade 1 to 7')
    expect(nine('guidance')).toContain('The child is in Grade 9')
    expect(nine('diagnose')).not.toContain('primary school')
    expect(nine('class_report')).not.toContain('primary school')
  })

  test('a country sentence changes only when the country is not South Africa, and maths examples only when the subject is not Mathematics', () => {
    // Mathematics Grade 6 in Kenya: no South Africa, no decimal comma, no rand; the maths examples stay.
    const kenya = (job: PromptJob) => renderPrompt(job, md(job), klass('Mathematics', 6, 'KE'))
    for (const job of PROMPT_JOBS) {
      expect(kenya(job)).not.toContain('South Africa')
      expect(kenya(job)).not.toContain('decimal comma')
      expect(kenya(job)).not.toMatch(/\bR5\b|\brand\b|`R`/i)
    }
    expect(kenya('read_paper')).toContain('Keep fractions as')
    expect(kenya('guidance')).toContain('adding fractions')
    // English Grade 6 in South Africa: South Africa stays, the maths examples and number formats go.
    expect(renderPrompt('write_lesson', md('write_lesson'), klass('English', 6, 'ZA'))).toContain('for a school in South Africa')
    expect(renderPrompt('read_paper', md('read_paper'), klass('English', 6, 'ZA'))).not.toContain('Keep fractions as')
  })
})

// P86: a senior class is a Mathematics class of Grade 7 to 12. Its lesson writer is told the four answer kinds that code marks by meaning, and its
// practice reader is told to keep algebra as written. The baseline class and every class below Grade 7 never meet these rules.
describe('a senior class (Mathematics, Grades 7 to 12)', () => {
  const lesson = (grade: number, country = 'ZA', subject = 'Mathematics') => renderPrompt('write_lesson', md('write_lesson'), klass(subject, grade, country))

  test('a Grade 10 South African class: the old kinds and the four new ones with an example each, and the form', () => {
    const out = lesson(10)
    expect(out.startsWith('Subject: Mathematics. Grade: 10. Country: South Africa.\n\n')).toBe(true)
    for (const kind of ['`fraction` (`3/4`)', '`mixed` (`1 1/2`)', '`decimal` (`0,75`)', '`whole` (`12`)', '`money` (`R5`)', '`choice` (a letter A to D)']) expect(out).toContain(kind)
    for (const example of ['`number` (`-3`, `15%` or `30°`', '`expression` (`2x^2 + 7x`', 'powers with `^` and roots with `sqrt()`', '`equation` (`x = 3 or x = -1`', '`point` (`(2; -3)`)']) {
      expect(out).toContain(example)
    }
    expect(out).toContain('set `form` to `factorised` or `expanded`')
    expect(out).toContain('Money is in rand, decimals use a comma.')
    expect(out).toContain('`answer` must be one value that a computer can mark')
  })

  test('a learner, not a child; the grade is the class grade, and no Grade 6 is left', () => {
    const out = lesson(10)
    expect(out).toContain('Warm, plain, for a Grade 10 learner.')
    expect(out).not.toContain('Grade 10 child')
    expect(out).not.toContain('Grade 6')
  })

  test('the senior rule wins over the two other rules on the same sentence, and the old sentence is gone', () => {
    const out = lesson(10)
    expect(out).not.toContain('`3/4`, `1 1/2`, `0,75`, `12`, `R5` or a choice letter')
    const rules = PROMPT_RULES.write_lesson.filter((r) => r.find.startsWith('`answer` must be one value'))
    expect(rules).toHaveLength(3)
    expect(rules[0]!.when(klass('Mathematics', 10, 'ZA'))).toBe(true)
    // The senior rule is the first of the three: it fires for a senior class only.
    expect(rules[1]!.when(klass('Mathematics', 10, 'ZA'))).toBe(false)
    expect(rules[2]!.when(klass('Mathematics', 10, 'ZA'))).toBe(false)
    expect(rules[0]!.when(klass('Mathematics', 6, 'ZA'))).toBe(false)
    expect(rules[0]!.when(klass('Natural Sciences', 10, 'ZA'))).toBe(false)
  })

  test('outside South Africa: no rand, no decimal comma, a decimal as the class writes it', () => {
    const out = lesson(9, 'KE')
    expect(out).toContain('for a school in Kenya')
    expect(out).toContain('for a Grade 9 learner')
    expect(out).toContain('`decimal` (a decimal written the way the class writes it)')
    expect(out).not.toMatch(/decimal comma|decimals use a comma|\bR5\b|\brand\b|`money`/i)
    expect(out).toContain('`expression` (`2x^2 + 7x`')
  })

  test.each([[7], [8], [11], [12]])('Grade %i is senior too', (grade) => {
    expect(lesson(grade)).toContain('`equation` (`x = 3 or x = -1`')
    expect(lesson(grade)).toContain(`for a Grade ${grade} learner`)
  })

  test.each([[1], [4], [5], [13]])('Grade %i gets no senior rule: the old sentence, and a child', (grade) => {
    const out = lesson(grade)
    expect(out).not.toMatch(/`expression`|`equation`|`point`|`form`|for a Grade \d+ learner/)
    expect(out).toContain('`3/4`, `1 1/2`, `0,75`, `12`, `R5` or a choice letter')
    expect(out).toContain(`for a Grade ${grade} child`)
  })

  test('another subject gets no senior rule either', () => {
    expect(lesson(10, 'ZA', 'Natural Sciences')).not.toMatch(/`expression`|`equation`|`point`|`form`|for a Grade \d+ learner/)
  })

  test('the baseline class still gets the file byte for byte, and the senior text is not a way into it', () => {
    expect(lesson(6)).toBe(md('write_lesson'))
  })

  test('the rest of the file is kept: every line that no rule touches is still there, in order', () => {
    const base = md('write_lesson')
    const out = lesson(10)
    const touched = new Set(PROMPT_RULES.write_lesson.flatMap((r) => base.split('\n').filter((l) => l.includes(r.find))))
    let from = 0
    for (const line of base.split('\n').filter((l) => !touched.has(l))) {
      const at = out.indexOf(line, from)
      expect(at, `the line ${JSON.stringify(line.slice(0, 60))} must still be there`).toBeGreaterThanOrEqual(from)
      from = at + line.length
    }
  })
})

// P87: pictures. A senior class's lesson writer is told when a question carries a picture and how to give a graph or a triangle.
describe('pictures, for a senior class', () => {
  const lesson = (grade: number, country = 'ZA', subject = 'Mathematics') => renderPrompt('write_lesson', md('write_lesson'), klass(subject, grade, country))
  const SENTENCE = 'Use only the diagram kinds in the schema.'

  test('a Grade 10 class: the sentence of the file stays and the picture rule follows it, in the Safety section', () => {
    const out = lesson(10)
    expect(out).toContain(`${SENTENCE} A question may carry a \`diagram\` when the picture is needed to answer it`)
    for (const word of [
      'reading a graph, a gradient, an intercept, a turning point, an angle or a side of a triangle',
      'Use `coordinate_plane` for functions, graphs and analytical geometry, and `triangle` for trigonometry and geometry.',
      'never list the points of a curve',
      'A `trig` graph takes x in degrees.',
      'at most 200 wide (720 across for a `trig` graph), at most 3 graphs and 12 points',
      'exactly three `vertices` names',
      'Never put the answer in a label.',
      'A lesson card or a diagram step may use these two pictures too.',
    ]) {
      expect(out).toContain(word)
    }
    expect(out.indexOf(SENTENCE)).toBeGreaterThan(out.indexOf('## Safety'))
    expect(out).toContain('No links, no questions about the child')
    expect(out.split(SENTENCE)).toHaveLength(2)
  })

  test.each([[7], [8], [9], [11], [12]])('Grade %i is told too', (grade) => expect(lesson(grade)).toContain('Use `coordinate_plane` for functions'))

  test('outside South Africa it is the same rule, and it names no rand or decimal comma', () => {
    const out = lesson(9, 'KE')
    expect(out).toContain('Use `coordinate_plane` for functions')
    expect(out).not.toMatch(/decimal comma|decimals use a comma|\bR5\b|\brand\b|`money`/i)
  })

  test('one rule, on the sentence of the file, for a senior class only', () => {
    const rules = PROMPT_RULES.write_lesson.filter((r) => r.find === SENTENCE)
    expect(rules).toHaveLength(1)
    expect(rules[0]!.when(klass('Mathematics', 10, 'ZA'))).toBe(true)
    expect(rules[0]!.when(klass('Mathematics', 6, 'ZA'))).toBe(false)
    expect(rules[0]!.when(klass('Mathematics', 5, 'ZA'))).toBe(false)
    expect(rules[0]!.when(klass('Mathematics', 13, 'ZA'))).toBe(false)
    expect(rules[0]!.when(klass('Natural Sciences', 10, 'ZA'))).toBe(false)
  })

  test.each([[1], [4], [5], [13]])('Grade %i is told nothing about pictures of this kind', (grade) => {
    const out = lesson(grade)
    expect(out).not.toMatch(/coordinate_plane|`triangle`|`diagram` when the picture/)
    expect(out).toContain(`${SENTENCE} No links`)
  })

  test('another subject is told nothing about them either', () => {
    expect(lesson(10, 'ZA', 'Natural Sciences')).not.toMatch(/coordinate_plane|`triangle`/)
  })

  test('the baseline class still gets the file byte for byte', () => {
    expect(lesson(6)).toBe(md('write_lesson'))
    expect(md('write_lesson')).not.toMatch(/coordinate_plane|`triangle`/)
  })

  test('the lesson of a class that is not senior is not a way into the rule: the primary prompt has no picture rule', () => {
    expect(lesson(6, 'KE')).not.toContain('coordinate_plane')
  })
})

describe('the reader of a practice answered on paper, for a senior class', () => {
  const read = (grade: number, country = 'ZA', place?: 'practice') => renderPrompt('read_paper', md('read_paper'), klass('Mathematics', grade, country), place)
  const ALGEBRA = 'Keep algebra as written: letters, powers as `^` or `²`, minus signs, brackets and `√`.'
  const KEEP = 'Keep fractions as `3/4` or `3 3/4`, decimals with the comma or point they used, and money with its `R`.'

  test('a Grade 10 practice: the sentence of the file, then one about algebra', () => {
    const out = read(10, 'ZA', 'practice')
    expect(out).toContain(`${KEEP} ${ALGEBRA}`)
    expect(out.split(ALGEBRA)).toHaveLength(2)
  })

  test('outside South Africa the sentence has the currency sign, and the algebra sentence follows', () => {
    const out = read(10, 'KE', 'practice')
    expect(out).toContain(`money with its currency sign. ${ALGEBRA}`)
    expect(out).not.toContain('with its `R`')
  })

  test('a class test or a homework photo of the same class is read with the prompt it always had (no place)', () => {
    expect(read(10)).not.toContain('Keep algebra')
    expect(read(10)).toContain(KEEP)
    expect(read(10, 'KE')).not.toContain('Keep algebra')
  })

  test('the baseline class, and a class below Grade 7, are not told anything about algebra', () => {
    expect(read(6, 'ZA', 'practice')).toBe(md('read_paper'))
    expect(read(4, 'ZA', 'practice')).not.toContain('Keep algebra')
    expect(read(13, 'ZA', 'practice')).not.toContain('Keep algebra')
  })

  test('another subject is not told anything about algebra', () => {
    expect(renderPrompt('read_paper', md('read_paper'), klass('Natural Sciences', 10, 'ZA'), 'practice')).not.toContain('Keep algebra')
  })

  test('the file read_paper.md and write_lesson.md are not changed (the sha256 test above pins them)', () => {
    expect(createHash('sha256').update(md('write_lesson')).digest('hex')).toBe(SHA256.write_lesson)
    expect(createHash('sha256').update(md('read_paper')).digest('hex')).toBe(SHA256.read_paper)
  })
})
