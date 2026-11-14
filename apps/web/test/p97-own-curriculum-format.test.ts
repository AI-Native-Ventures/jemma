import { describe, expect, it } from 'vitest'
import { readDraft } from '../app/t/[classId]/curriculum/format'
import { GRADE_CHOICES, NAME_MAX, curriculumStateOf, myMathsHref, reviewOf } from '../app/k/own/format'

// The pure parts of "Your own curriculum" (P97): which state a curriculum is in, what the review is drawn from, and where "Done" points. No database,
// no clock, no browser.

const topic = (name: string, family: string, prerequisites: string[] = [], check?: { reason: string; options: string[] }) => ({ name, family, prerequisites, misconceptions: [], ...(check ? { check } : {}) })
const raw = (over: Record<string, unknown> = {}) => ({
  grade: 6,
  terms: [
    { term: 1, topics: [topic('Whole numbers', 'whole_numbers'), topic('Fractions', 'fractions', ['Whole numbers'])] },
    { term: 2, topics: [topic('Decimals', 'fractions', ['Fractions'], { reason: 'The plan lists it in Term 2 and Term 3.', options: ['Keep in Term 2', 'Keep in Term 3'] })] },
    { term: 3, topics: [] },
  ],
  leftOut: [{ name: 'Probability', reason: 'It is not in Grade 6.' }],
  resolutions: {},
  ...over,
})
const read = (over: Record<string, unknown> = {}) => readDraft(raw(over))!

describe('curriculumStateOf: the state of an own curriculum from its map, its documents and its event', () => {
  it('a map Jemma has not drafted yet is being read; a failed event makes it failed', () => {
    expect(curriculumStateOf({ map: { status: 'draft' }, docs: 1, read: false, eventFailed: false })).toBe('reading')
    expect(curriculumStateOf({ map: { status: 'draft' }, docs: 2, read: false, eventFailed: true })).toBe('failed')
  })

  it('a draft that can be read is ready to check, whatever its event says; an approved map is done', () => {
    expect(curriculumStateOf({ map: { status: 'draft' }, docs: 1, read: true, eventFailed: false })).toBe('draft')
    expect(curriculumStateOf({ map: { status: 'draft' }, docs: 1, read: true, eventFailed: true })).toBe('draft')
    expect(curriculumStateOf({ map: { status: 'approved' }, docs: 1, read: true, eventFailed: false })).toBe('approved')
  })

  it('no map, or a map with no document and nothing to read, is not a curriculum that can be read', () => {
    expect(curriculumStateOf({ map: null, docs: 0, read: false, eventFailed: false })).toBe('failed')
    expect(curriculumStateOf({ map: { status: 'draft' }, docs: 0, read: false, eventFailed: false })).toBe('failed')
  })
})

describe('reviewOf: what the review of a draft is drawn from', () => {
  const info = { mapId: 'm1', classId: 'c1', name: "My school's Term 1 plan" }

  it('lists the terms that have topics, in order, each topic with what it needs; a term with no topic is not listed', () => {
    const view = reviewOf(read(), info)
    expect(view.terms.map((t) => t.term)).toEqual([1, 2])
    expect(view.terms[0]!.topics.map((t) => [t.name, t.needs])).toEqual([
      ['Whole numbers', null],
      ['Fractions', 'Needs topic 1'],
    ])
    expect(view.terms[1]!.topics.map((t) => [t.name, t.needs])).toEqual([['Decimals', 'Needs Fractions (T1)']])
    expect(view).toMatchObject({ mapId: 'm1', classId: 'c1', name: "My school's Term 1 plan", grade: 6, topicCount: 3 })
  })

  it('a topic Jemma was not sure about carries its reason; one that was settled does not', () => {
    expect(reviewOf(read(), info).terms[1]!.topics[0]!.note).toBe('The plan lists it in Term 2 and Term 3.')
    expect(reviewOf(read({ resolutions: { Decimals: 'Keep in Term 2' } }), info).terms[1]!.topics[0]!.note).toBeNull()
    expect(reviewOf(read(), info).terms[0]!.topics[0]!.note).toBeNull()
  })

  it('lists what was left out, with the reason, until a choice was made about it', () => {
    expect(reviewOf(read(), info).leftOut).toEqual([{ name: 'Probability', reason: 'It is not in Grade 6.' }])
    expect(reviewOf(read({ resolutions: { Probability: 'Leave it out' } }), info).leftOut).toEqual([])
  })

  it('a draft with every topic taken out has no terms and no topics', () => {
    const view = reviewOf(read({ terms: [{ term: 1, topics: [] }] }), info)
    expect(view.terms).toEqual([])
    expect(view.topicCount).toBe(0)
  })
})

describe('the words and the choices', () => {
  it('the grade can be 1 to 12, the name up to 60 characters', () => {
    expect(GRADE_CHOICES).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(NAME_MAX).toBe(60)
  })

  it('"Done" points to My maths at the class of the own curriculum (P95c: the address names the class, as the chips of My own do, never the grade)', () => {
    expect(myMathsHref('3f6c1a52-0b1e-4c43-9a71-2d8f5e1c9b10')).toBe('/k/maths?class=3f6c1a52-0b1e-4c43-9a71-2d8f5e1c9b10')
    expect(myMathsHref('class-1')).toBe('/k/maths?class=class-1')
  })
})
