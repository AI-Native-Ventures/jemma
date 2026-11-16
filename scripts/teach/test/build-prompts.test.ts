import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { OutlineSchema, REVIEW_VARIES_FROM, ReviewSchema, WRITE_VARIES_FROM, fill, lessonRange, lessonSchemaText, outlinePrompt, reviewPrompt, writePrompt } from '../build-prompts'
import { capsReference, overview } from '../sources'
import { topicGroups } from '../topics'
import { goodLesson } from './fixtures'

const groups = topicGroups()
const group = (grade: number, name: string) => groups.find((g) => g.grade === grade && g.baseName === name)!
const EM = String.fromCharCode(0x2014)

describe('prompt files', () => {
  test('no em dash in any prompt file', () => {
    const dir = join(import.meta.dirname, '../prompts')
    for (const f of readdirSync(dir)) expect(readFileSync(join(dir, f), 'utf8').includes(EM), f).toBe(false)
  })

  test('fill refuses a hole', () => {
    expect(() => fill('hello {{NAME}}', {})).toThrow(/NAME/)
    expect(fill('hello {{NAME}}', { NAME: 'x' })).toBe('hello x')
  })
})

describe('outline prompt', () => {
  const g = group(6, 'Common fractions')
  const ref = capsReference(g)
  const prompt = outlinePrompt(g, ref, true)

  test('carries the topic, the grade, the neighbours and the reference, with no hole left', () => {
    expect(prompt).not.toMatch(/\{\{/)
    expect(prompt).toContain('Grade: 6')
    expect(prompt).toContain('Topic: Common fractions')
    expect(prompt).toContain(g.after[0])
    expect(prompt).toContain(g.before[g.before.length - 1])
    expect(prompt).toContain('There is no textbook chapter')
  })

  test('the number of lessons follows the grade and the size of the topic', () => {
    const sections = Array.from({ length: 7 }, (_, i) => ({ id: `5.${i + 1}`, title: 't', text: 'x' }))
    const ref7 = { ...capsReference(group(11, 'Functions')), sections, text: overview(sections) }
    expect(lessonRange(group(1, 'Count objects'), capsReference(group(1, 'Count objects')), false)).toMatchObject({ min: 1, max: 3 })
    expect(lessonRange(group(9, 'Theorem of Pythagoras'), capsReference(group(9, 'Theorem of Pythagoras')), false)).toMatchObject({ min: 2, max: 6 })
    expect(lessonRange(group(11, 'Functions'), ref7, true)).toMatchObject({ min: 5, max: 8 })
    expect(lessonRange(groups.find((x) => x.grade === 12)!, ref7, false).min).toBe(5)
  })

  test('the outline reply must be 1 to 8 lessons with 2 to 4 objectives each', () => {
    expect(OutlineSchema.safeParse({ lessons: [{ title: 'A', objectives: ['You will be able to a', 'You will be able to b'], sections: ['5.1'] }] }).success).toBe(true)
    expect(OutlineSchema.safeParse({ lessons: [{ title: 'A', objectives: ['only one'] }] }).success).toBe(false)
    expect(OutlineSchema.safeParse({ lessons: [] }).success).toBe(false)
    expect(OutlineSchema.safeParse({ lessons: [{ title: 'Add \\(x\\)', objectives: ['You will be able to a', 'You will be able to b'] }] }).success).toBe(false)
  })
})

describe('write prompt', () => {
  const input = (grade: number, name: string, extra = {}) => {
    const g = group(grade, name)
    return { group: g, ref: capsReference(g), titles: ['One', 'Two'], position: 2, title: 'Two', objectives: ['You will be able to do a thing.', 'You will be able to do another.'], ...extra }
  }

  test('carries every rule of the lesson, with no hole left', () => {
    const p = writePrompt(input(6, 'Common fractions'))
    expect(p).not.toMatch(/\{\{/)
    for (const rule of ['At least 3 `worked` blocks', 'At least 1 `try` block', 'At least 1 `mistake` block', 'NEVER invent a picture kind', '`speech`', 'NEVER use LaTeX', 'easiest first', 'lesson 2 of 2']) expect(p, rule).toContain(rule)
    expect(p).toContain('"$schema"'.slice(0, 0) + '"type":"object"')
  })

  test('the answer rules a model keeps breaking are said plainly: no unit, no space in a number, a negative is a number, the last line shows the answer', () => {
    const p = writePrompt(input(11, 'Functions'))
    for (const rule of ['never `12 cm`', '`R132000`', 'A negative value is always `number`', 'The last line of the working contains the final answer', 'if the right angle is at B (index 1)']) expect(p, rule).toContain(rule)
  })

  test('Grades 1 to 3 need 2 worked blocks, short sentences, and no graphs or senior answer kinds', () => {
    const p = writePrompt(input(1, 'Count objects'))
    expect(p).toContain('At least 2 `worked` blocks')
    expect(p).toContain('Very short sentences')
    expect(p).not.toContain('"kind": "coordinate_plane"')
    expect(p).not.toContain('"const":"coordinate_plane"')
    expect(p).not.toContain('"const":"triangle"')
    expect(p).not.toContain('"expression"')
    expect(p).not.toContain('- `expression`')
  })

  test('Grades 10 to 12 get graphs, triangles and the four senior answer kinds, and define terms', () => {
    const p = writePrompt(input(11, 'Functions'))
    expect(p).toContain('"kind": "coordinate_plane"')
    expect(p).toContain('"kind": "triangle"')
    for (const kind of ['`number`', '`expression`', '`equation`', '`point`']) expect(p).toContain(kind)
    expect(p).toContain('precise terms of the subject')
  })

  test('a rewrite lists the problems and hands back the lesson', () => {
    const p = writePrompt(input(6, 'Common fractions', { rewrite: { problems: ['block 4 (worked): the last step is wrong'], previous: goodLesson() } }))
    expect(p).toContain('block 4 (worked): the last step is wrong')
    expect(p).toContain('Adding fractions with the same bottom number')
    expect(p).toContain('fix every one')
  })

  test('the JSON schema of the lesson is compact and complete', () => {
    const s = lessonSchemaText()
    expect(() => JSON.parse(s)).not.toThrow()
    expect(s).toContain('"worked"')
    expect(s).toContain('"mistake"')
    expect(s.length).toBeLessThan(40_000)
  })
})

describe('prompt caching: the fixed text first, the changing part last', () => {
  const g = group(11, 'Functions')
  const sections = Array.from({ length: 3 }, (_, i) => ({ id: `5.${i + 1}`, title: `Section ${i + 1}`, text: `facts of section ${i + 1} `.repeat(2000) }))
  const ref = { ...capsReference(g), sections, text: overview(sections) }
  const base = { group: g, ref, titles: ['One', 'Two', 'Three'], objectives: ['You will be able to a.', 'You will be able to b.'] }
  const head = (p: string, marker: string) => p.slice(0, p.indexOf(marker))
  const tail = (p: string, marker: string) => p.slice(p.indexOf(marker))

  test('two lessons of one topic, and a rewrite of one of them, share every character before the lesson part', () => {
    const one = writePrompt({ ...base, position: 1, title: 'One', sections: ['5.1'] })
    const two = writePrompt({ ...base, position: 2, title: 'Two', sections: ['5.2', '5.3'], objectives: ['You will be able to c.', 'You will be able to d.'] })
    const rewrite = writePrompt({ ...base, position: 1, title: 'One', sections: ['5.1'], rewrite: { problems: ['block 2: wrong'], previous: goodLesson() } })
    expect(head(one, WRITE_VARIES_FROM).length).toBeGreaterThan(15_000)
    expect(head(two, WRITE_VARIES_FROM)).toBe(head(one, WRITE_VARIES_FROM))
    expect(head(rewrite, WRITE_VARIES_FROM)).toBe(head(one, WRITE_VARIES_FROM))
    expect(tail(two, WRITE_VARIES_FROM)).not.toBe(tail(one, WRITE_VARIES_FROM))
  })

  test('everything that changes is after the marker: the position, the title, the objectives, the sections in full and the problems', () => {
    const p = writePrompt({ ...base, position: 2, title: 'Hyperbolas', sections: ['5.3'], rewrite: { problems: ['block 9: the answer is 4'], previous: goodLesson() } })
    const fixed = head(p, WRITE_VARIES_FROM)
    const varying = tail(p, WRITE_VARIES_FROM)
    for (const text of ['Hyperbolas', 'You will be able to a.', 'lesson 2 of 3', 'block 9: the answer is 4']) {
      expect(fixed, text).not.toContain(text)
      expect(varying, text).toContain(text)
    }
    // the chosen section is given in full after the marker; the fixed reference only holds the start of each section
    const times = (text: string) => text.split('facts of section 3').length - 1
    expect(times(varying)).toBeGreaterThan(1000)
    expect(times(fixed)).toBeLessThan(times(varying) / 2)
    expect(fixed).not.toMatch(/\{\{/)
    expect(fixed).toContain('Section 3')
  })

  test('two reviews of the same topic share the text before the lesson, which comes last', () => {
    const a = reviewPrompt(g, ref, goodLesson({ position: 1, title: 'One' }), 3)
    const b = reviewPrompt(g, ref, goodLesson({ position: 2, title: 'Two' }), 3)
    expect(head(a, REVIEW_VARIES_FROM)).toBe(head(b, REVIEW_VARIES_FROM))
    expect(head(a, REVIEW_VARIES_FROM).length).toBeGreaterThan(3_000)
    expect(tail(a, REVIEW_VARIES_FROM)).toContain('"n":1')
    expect(head(a, REVIEW_VARIES_FROM)).not.toContain('"n":1')
  })
})

describe('review prompt', () => {
  test('numbers the blocks and asks for ok and problems', () => {
    const g = group(6, 'Common fractions')
    const p = reviewPrompt(g, capsReference(g), goodLesson(), 3)
    expect(p).not.toMatch(/\{\{/)
    expect(p).toContain('"n":1')
    expect(p).toContain('"n":9')
    expect(p).toContain('Lesson 1 of 3')
    expect(ReviewSchema.safeParse({ ok: false, problems: ['x'] }).success).toBe(true)
    expect(ReviewSchema.safeParse({ ok: 'yes' }).success).toBe(false)
  })
})
