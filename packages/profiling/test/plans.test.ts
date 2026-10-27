import { expect, test } from 'vitest'
import type { JemmaDb } from '../src/db'
import { postconditions } from '../src/plans'

/** Just enough of the query builder for `from(t).select(c).eq(k, v).single()`. */
const dbWithDraft = (draft: unknown) =>
  ({
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { draft }, error: null }) }) }) }),
  }) as unknown as JemmaDb

test('a drafted map meets the curriculum.uploaded postcondition before any topic row exists', async () => {
  const event = { type: 'curriculum.uploaded', mapId: 'm1' } as const
  const drafted = { grade: 6, terms: [{ term: 1, topics: [{ name: 'Fractions' }] }], leftOut: [] }
  expect(await postconditions(event, dbWithDraft(drafted))).toEqual([])
  expect(await postconditions(event, dbWithDraft({}))).toEqual(['no topics drafted for map m1'])
  expect(await postconditions(event, dbWithDraft({ grade: 6, terms: [{ term: 1, topics: [] }], leftOut: [] }))).toHaveLength(1)
})
