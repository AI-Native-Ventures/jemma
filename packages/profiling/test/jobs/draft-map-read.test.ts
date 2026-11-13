import { describe, expect, test } from 'vitest'
import { readWithFallback, topicsIn, withoutEmptyTerms, type DraftResult } from '../../src/jobs/cloud/draft-map'
import type { TopicMapDraft } from '../../src/schemas'

const topic = (name: string) => ({ name, family: 'fractions', prerequisites: [], misconceptions: [] })
const draftOf = (terms: [1 | 2 | 3 | 4, string[]][]): TopicMapDraft => ({ grade: 9, terms: terms.map(([term, names]) => ({ term, topics: names.map(topic) })), leftOut: [] })
const good = (id = 'm'): DraftResult => ({ draft: draftOf([[1, ['A', 'B']], [2, ['C']]]), modelId: id })
const empty = (): DraftResult => ({ draft: draftOf([[1, []]]), modelId: 'm' })

/** The two ways, as fakes that count how often they are asked. */
const ways = (v: () => Promise<DraftResult>, t: () => Promise<DraftResult | null>) => {
  const asked = { vision: 0, text: 0 }
  return {
    asked,
    vision: async () => (asked.vision++, v()),
    text: async () => (asked.text++, t()),
  }
}

describe('vision first, text only when vision gave nothing', () => {
  test('when the vision call works, the text model is never asked', async () => {
    const w = ways(async () => good('vision-model'), async () => good('text-model'))
    const got = await readWithFallback(w)
    expect(got).toMatchObject({ way: 'vision', modelId: 'vision-model', visionProblem: null })
    expect(w.asked).toEqual({ vision: 1, text: 0 })
  })

  test('vision fails and the document has a text layer: the text model is asked and its draft is used', async () => {
    const w = ways(
      async () => {
        throw new Error('Provider returned error')
      },
      async () => good('text-model'),
    )
    const got = await readWithFallback(w)
    expect(got).toMatchObject({ way: 'text', modelId: 'text-model', visionProblem: 'Provider returned error' })
    expect(topicsIn(got.draft)).toBe(3)
    expect(w.asked).toEqual({ vision: 1, text: 1 })
  })

  test('vision answers but with no topic: the text model is asked, and the problem is kept', async () => {
    const w = ways(async () => empty(), async () => good('text-model'))
    const got = await readWithFallback(w)
    expect(got.way).toBe('text')
    expect(got.visionProblem).toBe('the vision model returned no topic')
  })

  test('vision fails and the document has no text layer: the first error stays and the text model is not asked', async () => {
    const boom = new Error('This model is currently experiencing high demand')
    const w = ways(
      async () => {
        throw boom
      },
      async () => null,
    )
    await expect(readWithFallback(w)).rejects.toBe(boom)
    expect(w.asked).toEqual({ vision: 1, text: 1 })
  })

  test('no topic from vision and no text layer: the same plain error as before, "draft has no topics"', async () => {
    const w = ways(async () => empty(), async () => null)
    await expect(readWithFallback(w)).rejects.toThrow('draft has no topics')
  })

  test('the text model fails too: its error is the one the job fails with', async () => {
    const w = ways(
      async () => {
        throw new Error('vision down')
      },
      async () => {
        throw new Error('text down')
      },
    )
    await expect(readWithFallback(w)).rejects.toThrow('text down')
  })

  test('the text model gives no topic either: the job fails with "draft has no topics"', async () => {
    const w = ways(
      async () => {
        throw new Error('vision down')
      },
      async () => empty(),
    )
    await expect(readWithFallback(w)).rejects.toThrow('draft has no topics')
  })
})

describe('a map has the terms of the document, no empty one', () => {
  test('an empty fourth term is dropped, so a three term document gives a three term map', () => {
    const d = draftOf([[1, ['A']], [2, ['B']], [3, ['C']], [4, []]])
    const out = withoutEmptyTerms(d)
    expect(out.terms.map((t) => t.term)).toEqual([1, 2, 3])
    expect(topicsIn(out)).toBe(3)
  })

  test('no topic is moved: the terms that have topics keep them, in order, under their own number', () => {
    const d = draftOf([[3, ['C']], [1, ['A1', 'A2']], [2, []]])
    const out = withoutEmptyTerms(d)
    expect(out.terms).toEqual([
      { term: 1, topics: [topic('A1'), topic('A2')] },
      { term: 3, topics: [topic('C')] },
    ])
  })

  test('a draft whose four terms all have topics comes out the same, and left out topics are kept', () => {
    const d = { ...draftOf([[1, ['A']], [2, ['B']], [3, ['C']], [4, ['D']]]), leftOut: [{ name: 'Z', reason: 'Grade 5 page' }] }
    expect(withoutEmptyTerms(d)).toEqual(d)
  })
})
