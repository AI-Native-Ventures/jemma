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
