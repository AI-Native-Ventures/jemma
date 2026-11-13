// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

// A Needs you item of kind confirm_scan (a photo Jemma could not read: `mark_paper` makes one for an unusable page, and a read that
// failed for good makes one too) has no screen of its own. The page of an item sends the teacher to the papers screen of the test, where
// the retake button is, and keeps `notFound()` when the paper or its test is gone. The data helpers and the teacher's session are
// stand-ins; nothing reaches a database.

const state = vi.hoisted(() => ({
  item: { id: 'item-1', kind: 'confirm_scan', status: 'open', title: 'Jemma could not read this photo', detail: '', paperId: 'paper-1' } as Record<string, unknown>,
  paper: { test_id: 'test-1' } as { test_id: string | null } | null,
  test: { id: 'test-1' } as { id: string } | null,
  asked: [] as string[],
}))

class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirect ${to}`)
  }
}
class NotFound extends Error {}
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Redirected(to)
  },
  notFound: () => {
    throw new NotFound('not found')
  },
}))
vi.mock('@/lib/data/p31', () => ({
  getNeedsItem: async () => state.item,
  getPaperView: async () => {
    throw new Error('the heavy paper view must not be read for a confirm_scan item')
  },
  getPile: async () => [],
  getRoster: async () => [],
  hhmm: () => '',
}))
vi.mock('@/lib/data/p34', () => ({ getReviewPile: async () => [] }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServer: async () => ({
    from: (table: string) => {
      const asked: string[] = [table]
      state.asked.push(asked.join(' '))
      const chain = {
        select: () => chain,
        eq: (key: string, value: unknown) => (state.asked.push(`${table}.${key}=${String(value)}`), chain),
        maybeSingle: async () => ({ data: table === 'papers' ? state.paper : table === 'tests' ? state.test : null, error: null }),
      }
      return chain
    },
  }),
}))

import NeedsYouItemPage from '../app/t/[classId]/needs-you/[itemId]/page'

const open = (classId = 'cls-1', itemId = 'item-1') => NeedsYouItemPage({ params: Promise.resolve({ classId, itemId }), searchParams: Promise.resolve({}) })
const outcome = async () => {
  try {
    await open()
  } catch (e) {
    return e instanceof Redirected ? e.to : e instanceof NotFound ? 'notFound' : `other: ${(e as Error).message}`
  }
  return 'rendered'
}

beforeEach(() => {
  state.item = { id: 'item-1', kind: 'confirm_scan', status: 'open', title: 'Jemma could not read this photo', detail: '', paperId: 'paper-1' }
  state.paper = { test_id: 'test-1' }
  state.test = { id: 'test-1' }
  state.asked = []
})

describe('a confirm_scan Needs you item', () => {
  it('sends the teacher to the papers screen of the test, where the retake button is', async () => {
    expect(await outcome()).toBe('/t/cls-1/snap/test-1/papers')
  })

  it('finds the test through the paper of the item, and only a test of this class', async () => {
    await outcome()
    expect(state.asked).toContain('papers.id=paper-1')
    expect(state.asked).toContain('tests.id=test-1')
    expect(state.asked).toContain('tests.class_id=cls-1')
  })

  it('is not found when the paper is gone', async () => {
    state.paper = null
    expect(await outcome()).toBe('notFound')
  })

  it('is not found when the paper has no test (a parent\'s paper)', async () => {
    state.paper = { test_id: null }
    expect(await outcome()).toBe('notFound')
  })

  it('is not found when the test is gone, or is not in this class', async () => {
    state.test = null
    expect(await outcome()).toBe('notFound')
  })
})

describe('the other kinds keep their behaviour', () => {
  it('an item of a kind with no screen at all is still not found, and its paper is not looked up', async () => {
    state.item = { ...state.item, kind: 'desktop_off' }
    expect(await outcome()).toBe('notFound')
    expect(state.asked.filter((a) => a.startsWith('papers'))).toEqual([])
  })

  it('an approve_key item still goes to the key screen', async () => {
    state.item = { ...state.item, kind: 'approve_key', paperId: 'test-9' }
    expect(await outcome()).toBe('/t/cls-1/snap/test-9/key')
  })

  it('a check_records item still goes to the file', async () => {
    state.item = { ...state.item, kind: 'check_records', paperId: 'import-3' }
    expect(await outcome()).toBe('/t/cls-1/learners/records/import-3')
  })
})
