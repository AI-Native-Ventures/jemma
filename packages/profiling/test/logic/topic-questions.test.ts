import { describe, expect, test } from 'vitest'
import { askAboutRepeatedTopics, repeatedTopicQuestion } from '../../src/logic/topic-questions'
import type { TopicMapDraft } from '../../src/schemas'

const topic = (name: string, check?: { reason: string; options: string[] }) => ({ name, family: 'algebra', prerequisites: [], misconceptions: [], ...(check ? { check } : {}) })
const draftOf = (terms: [1 | 2 | 3 | 4, ReturnType<typeof topic>[]][]): TopicMapDraft => ({ grade: 9, terms: terms.map(([term, topics]) => ({ term, topics })), leftOut: [] })
const entries = (d: TopicMapDraft, name: string) => d.terms.flatMap((t) => t.topics.filter((x) => x.name === name).map((x) => ({ term: t.term, check: x.check })))

describe('a topic listed in two terms gets a question from code when the model asked none', () => {
  test('both entries get "Listed in Term X and Term Y. Which term is it taught in?" and a choice for each term', () => {
    const d = draftOf([[2, [topic('Linear equations'), topic('Ratio, rate and proportion')]], [3, [topic('Ratio, rate and proportion'), topic('Functions')]]])
    const got = askAboutRepeatedTopics(d)
    expect(got.added).toBe(2)
    expect(entries(got.draft, 'Ratio, rate and proportion')).toEqual([
      { term: 2, check: { reason: 'Listed in Term 2 and Term 3. Which term is it taught in?', options: ['Keep in Term 2', 'Move to Term 3'] } },
      { term: 3, check: { reason: 'Listed in Term 2 and Term 3. Which term is it taught in?', options: ['Keep in Term 3', 'Move to Term 2'] } },
    ])
    // the other topics are left alone
    expect(entries(got.draft, 'Linear equations')).toEqual([{ term: 2, check: undefined }])
    expect(entries(got.draft, 'Functions')).toEqual([{ term: 3, check: undefined }])
  })

  test('the draft that came in is not changed', () => {
    const d = draftOf([[2, [topic('Ratio')]], [3, [topic('Ratio')]]])
    const before = JSON.stringify(d)
    askAboutRepeatedTopics(d)
    expect(JSON.stringify(d)).toBe(before)
  })

  test('the same name is found without case and without extra spaces', () => {
    const d = draftOf([[1, [topic('Length in metres and centimetres')]], [3, [topic('  length  IN metres and   centimetres ')]]])
    const got = askAboutRepeatedTopics(d)
    expect(got.added).toBe(2)
    expect(got.draft.terms[1]!.topics[0]!.check?.reason).toBe('Listed in Term 1 and Term 3. Which term is it taught in?')
    // the names themselves are kept as the model wrote them
    expect(got.draft.terms[1]!.topics[0]!.name).toBe('  length  IN metres and   centimetres ')
  })

  test('a topic in three terms is named in all three, and each entry can move to the other two', () => {
    const d = draftOf([[1, [topic('Revision')]], [2, [topic('Revision')]], [4, [topic('Revision')]]])
    const got = askAboutRepeatedTopics(d)
    expect(got.added).toBe(3)
    const e = entries(got.draft, 'Revision')
    expect(e.every((x) => x.check?.reason === 'Listed in Term 1, Term 2 and Term 4. Which term is it taught in?')).toBe(true)
    expect(e[1]!.check!.options).toEqual(['Keep in Term 2', 'Move to Term 1', 'Move to Term 4'])
  })

  test('two different repeated topics are each asked about', () => {
    const d = draftOf([[1, [topic('A'), topic('B')]], [2, [topic('A')]], [3, [topic('B')]]])
    const got = askAboutRepeatedTopics(d)
    expect(got.added).toBe(4)
    expect(entries(got.draft, 'A')[0]!.check!.reason).toBe('Listed in Term 1 and Term 2. Which term is it taught in?')
    expect(entries(got.draft, 'B')[0]!.check!.reason).toBe('Listed in Term 1 and Term 3. Which term is it taught in?')
  })
})

describe('code asks nothing when the model already asked, or when nothing is repeated', () => {
  test('a question from the model is kept as it is and gets no second one', () => {
    const asked = { reason: 'Listed in Terms 2 and 3', options: ['Keep in Term 2', 'Move to Term 3'] }
    const d = draftOf([[2, [topic('Ratio', asked)]], [3, [topic('Ratio')]]])
    const got = askAboutRepeatedTopics(d)
    expect(got.added).toBe(0)
    expect(got.draft).toBe(d)
    expect(entries(got.draft, 'Ratio')).toEqual([{ term: 2, check: asked }, { term: 3, check: undefined }])
  })

  test('a question with no words in it is not a question: code asks', () => {
    const d = draftOf([[2, [topic('Ratio', { reason: '   ', options: ['a', 'b'] })]], [3, [topic('Ratio')]]])
    const got = askAboutRepeatedTopics(d)
    expect(got.added).toBe(2)
    expect(entries(got.draft, 'Ratio').every((x) => x.check?.reason.startsWith('Listed in Term 2 and Term 3'))).toBe(true)
  })

  test('a draft with no repeated topic comes back as it is (the very same object), with nothing added', () => {
    const d = draftOf([[1, [topic('A')]], [2, [topic('B')]], [3, [topic('C')]]])
    const got = askAboutRepeatedTopics(d)
    expect(got.draft).toBe(d)
    expect(got.added).toBe(0)
  })

  test('the same name twice in one term is not a topic in two terms', () => {
    const d = draftOf([[1, [topic('A'), topic('A')]], [2, [topic('B')]]])
    expect(askAboutRepeatedTopics(d)).toEqual({ draft: d, added: 0 })
  })

  test('an empty draft and a left out topic with the same name as a topic are not a problem', () => {
    expect(askAboutRepeatedTopics({ grade: 9, terms: [], leftOut: [] }).added).toBe(0)
    const d: TopicMapDraft = { ...draftOf([[1, [topic('A')]]]), leftOut: [{ name: 'A', reason: 'x' }] }
    expect(askAboutRepeatedTopics(d).added).toBe(0)
  })
})

describe('the words of the question', () => {
  test('the terms are listed in order, with "and" before the last', () => {
    expect(repeatedTopicQuestion([3, 1])).toBe('Listed in Term 1 and Term 3. Which term is it taught in?')
    expect(repeatedTopicQuestion([1, 2, 3, 4])).toBe('Listed in Term 1, Term 2, Term 3 and Term 4. Which term is it taught in?')
  })
  test('no em dash', () => {
    expect(repeatedTopicQuestion([1, 2]).includes(String.fromCharCode(0x2014))).toBe(false)
  })
})
