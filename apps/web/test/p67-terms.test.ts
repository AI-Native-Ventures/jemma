import { describe, expect, test } from 'vitest'
import type { TopicMapDraft } from '@jemma/profiling/schemas'
import { readDraft, resolveIn, termInView, termNumbers, unresolved } from '../app/t/[classId]/curriculum/format'
import { askAboutRepeatedTopics } from '@jemma/profiling/logic'

const topic = (name: string, check?: { reason: string; options: string[] }) => ({ name, family: 'light', prerequisites: [], misconceptions: [], ...(check ? { check } : {}) })
const draft = (terms: [1 | 2 | 3 | 4, ReturnType<typeof topic>[]][], leftOut: TopicMapDraft['leftOut'] = []): TopicMapDraft => ({
  grade: 4,
  terms: terms.map(([term, topics]) => ({ term, topics })),
  leftOut,
})

describe('a three term document gives a three term review screen', () => {
  const three = draft([[1, [topic('Whole numbers up to 10 000'), topic('Length in metres and centimetres')]], [2, [topic('Division')]], [3, [topic('Shapes: triangles, squares and circles')]]])

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
      [[1, [topic('Length in metres and centimetres', { reason: 'Listed in Terms 1 and 3', options: ['Keep in Term 1', 'Move to Term 3'] })]], [2, []], [3, [topic('Shapes: triangles, squares and circles')]]],
      [{ name: 'Decimals: tenths and hundredths', reason: 'A Grade 6 topic, shown in Term 4 of the old scheme' }],
    )
    const shown = termNumbers(withChecks)
    expect(shown).toEqual([1, 3])
    const open = unresolved({ draft: withChecks, resolutions: {} }, termInView(shown, 4))
    expect(open.map((o) => [o.name, termInView(shown, o.term)])).toEqual([['Length in metres and centimetres', 1], ['Decimals: tenths and hundredths', 3]])
  })

  test('a saved draft with three terms is read back with three terms, and the draft schema allows it', () => {
    const read = readDraft({ ...three, resolutions: {} })
    expect(read?.draft.terms.map((t) => t.term)).toEqual([1, 2, 3])
  })
})

describe('answering the question about a topic that the plan lists in two terms', () => {
  // what the model made (the topic in both terms, no question), after the save tool let code ask
  const asked = () => askAboutRepeatedTopics(draft([[2, [topic('Linear equations'), topic('Ratio, rate and proportion')]], [3, [topic('Ratio, rate and proportion'), topic('Functions')]]])).draft
  const read = (d: TopicMapDraft) => ({ draft: d, resolutions: {} })
  const where = (d: TopicMapDraft, name: string) => d.terms.flatMap((t) => t.topics.filter((x) => x.name === name).map(() => t.term))

  test('both entries are open until the teacher answers, and one answer settles both', () => {
    const r = read(asked())
    expect(unresolved(r, 1).map((u) => [u.name, u.term])).toEqual([['Ratio, rate and proportion', 2], ['Ratio, rate and proportion', 3]])
    const after = resolveIn(r, 'Ratio, rate and proportion', 'Keep in Term 2')
    expect(unresolved(after, 1)).toEqual([])
  })

  test('"Keep in Term 2" leaves the topic in Term 2 only', () => {
    const after = resolveIn(read(asked()), 'Ratio, rate and proportion', 'Keep in Term 2')
    expect(where(after.draft, 'Ratio, rate and proportion')).toEqual([2])
    // nothing else moved
    expect(where(after.draft, 'Linear equations')).toEqual([2])
    expect(where(after.draft, 'Functions')).toEqual([3])
    expect(after.resolutions['Ratio, rate and proportion']).toBe('Keep in Term 2')
  })

  test('"Keep in Term 3" leaves it in Term 3 only, and "Move to Term 3" does the same', () => {
    expect(where(resolveIn(read(asked()), 'Ratio, rate and proportion', 'Keep in Term 3').draft, 'Ratio, rate and proportion')).toEqual([3])
    expect(where(resolveIn(read(asked()), 'Ratio, rate and proportion', 'Move to Term 3').draft, 'Ratio, rate and proportion')).toEqual([3])
  })

  test('a topic listed once keeps working as it did: "Keep" changes nothing and "Move" moves it', () => {
    const one = read(draft([[1, [topic('A', { reason: 'Listed in Terms 1 and 2', options: ['Keep in Term 1', 'Move to Term 2'] })]], [2, [topic('B')]]]))
    expect(resolveIn(one, 'A', 'Keep in Term 1').draft).toEqual(one.draft)
    expect(where(resolveIn(one, 'A', 'Move to Term 2').draft, 'A')).toEqual([2])
  })
})
