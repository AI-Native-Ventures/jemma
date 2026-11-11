import { describe, expect, test } from 'vitest'
import type { TopicMapDraft } from '@jemma/profiling/schemas'
import { readDraft, termInView, termNumbers, unresolved } from '../app/t/[classId]/curriculum/format'

const topic = (name: string, check?: { reason: string; options: string[] }) => ({ name, family: 'light', prerequisites: [], misconceptions: [], ...(check ? { check } : {}) })
const draft = (terms: [1 | 2 | 3 | 4, ReturnType<typeof topic>[]][], leftOut: TopicMapDraft['leftOut'] = []): TopicMapDraft => ({
  grade: 4,
  terms: terms.map(([term, topics]) => ({ term, topics })),
  leftOut,
})

describe('a three term document gives a three term review screen', () => {
  const three = draft([[1, [topic('Parts of a flowering plant'), topic('Sources of light')]], [2, [topic('Types of soil')]], [3, [topic('Weather and seasons')]]])

  test('three terms are shown, not four', () => {
    expect(termNumbers(three)).toEqual([1, 2, 3])
  })

  test('a fourth term with no topic is not shown, whether it was saved or not', () => {
    expect(termNumbers({ ...three, terms: [...three.terms, { term: 4, topics: [] }] })).toEqual([1, 2, 3])
  })

  test('a four term document shows its four terms, in order, whatever order they were saved in', () => {
    const four = draft([[3, [topic('C')]], [1, [topic('A')]], [4, [topic('D')]], [2, [topic('B')]]])
    expect(termNumbers(four)).toEqual([1, 2, 3, 4])
  })

  test('a draft with no topic at all keeps the four terms, so the screen is not left with nothing', () => {
    expect(termNumbers(draft([]))).toEqual([1, 2, 3, 4])
    expect(termNumbers(draft([[1, []]]))).toEqual([1, 2, 3, 4])
  })

  test('a term that the document does not have (the calendar says term 4) is read as its last term', () => {
    expect(termInView([1, 2, 3], 4)).toBe(3)
    expect(termInView([1, 2, 3], 2)).toBe(2)
    expect(termInView([1, 2, 4], 3)).toBe(4)
    expect(termInView([1, 2, 3, 4], 4)).toBe(4)
  })

  test('the things to check land in a term that is shown', () => {
    const withChecks = draft(
      [[1, [topic('Sources of light', { reason: 'Listed in Terms 1 and 3', options: ['Keep in Term 1', 'Move to Term 3'] })]], [2, []], [3, [topic('Weather and seasons')]]],
      [{ name: 'Electric circuits', reason: 'A Grade 6 topic, shown in Term 4 of the old scheme' }],
    )
    const shown = termNumbers(withChecks)
    expect(shown).toEqual([1, 3])
    const open = unresolved({ draft: withChecks, resolutions: {} }, termInView(shown, 4))
    expect(open.map((o) => [o.name, termInView(shown, o.term)])).toEqual([['Sources of light', 1], ['Electric circuits', 3]])
  })

  test('a saved draft with three terms is read back with three terms, and the draft schema allows it', () => {
    const read = readDraft({ ...three, resolutions: {} })
    expect(read?.draft.terms.map((t) => t.term)).toEqual([1, 2, 3])
  })
})
