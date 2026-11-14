// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeAdmin, photo, type FakeAdmin, type Row } from './p97-fake-db'

// `snapOwnTest` and `retryOwnTest`: a learner adds the photos of a test they got back marked, in "My own". The learner, the database, storage and
// the agent are stand-ins: the point is who may add one, what is stored where, the rows that are written and the event that is sent.

const state = vi.hoisted(() => ({
  who: 'twin' as 'twin' | 'school' | 'nobody',
  admin: null as unknown as FakeAdmin,
  sent: [] as { type: string; payload: Record<string, unknown> }[],
  retried: [] as string[],
  sendFails: false,
  retryFails: false,
  revalidated: [] as string[],
}))

vi.mock('@/lib/agent', () => ({
  sendEvent: vi.fn(async (type: string, payload: Record<string, unknown>) => {
    if (state.sendFails) throw new Error('agent /events answered 502')
    state.sent.push({ type, payload })
    // the real function saves the event row first
    state.admin.tables.events!.push({ id: `event-${state.sent.length}`, type, status: 'queued', payload, created_at: new Date(1_800_000_000_000 + state.sent.length).toISOString() })
    return `event-${state.sent.length}`
  }),
  retryEvent: vi.fn(async (id: string) => {
    // the real function puts the event back to queued, then posts it: when the post fails the event is left queued
    const row = state.admin.tables.events!.find((e) => e.id === id)
    if (row) row.status = 'queued'
    if (state.retryFails) throw new Error('agent /events answered 502')
    state.retried.push(id)
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => state.revalidated.push(path) }))
vi.mock('@/lib/data/p27', () => ({
  myChild: async () => {
    if (state.who === 'nobody') throw Object.assign(new Error('NEXT_HTTP_ERROR_FALLBACK;404'), { digest: 'NEXT_HTTP_ERROR_FALLBACK;404' })
    return { supabase: {}, child: state.who === 'twin' ? { id: 'twin-1', private_of: 'child-1', first_name: 'Amina' } : { id: 'child-1', private_of: null, first_name: 'Amina' } }
  },
}))
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdmin: () => state.admin }))

import { retryOwnTest, snapOwnTest } from '../app/k/own/actions'

const world = (extra: Record<string, Row[]> = {}) => ({
  children: [
    { id: 'twin-1', school_id: 'school-own', private_of: 'child-1' },
    { id: 'child-1', school_id: 'school-1', private_of: null },
    { id: 'child-2', school_id: 'school-1', private_of: null },
  ],
  papers: [] as Row[],
  paper_pages: [] as Row[],
  events: [] as Row[],
  ...extra,
})

beforeEach(() => {
  state.who = 'twin'
  state.admin = fakeAdmin(world())
  state.sent = []
  state.retried = []
  state.sendFails = false
  state.retryFails = false
  state.revalidated = []
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

const nothingHappened = () => {
  expect(state.admin.uploads).toEqual([])
  expect(state.admin.tables.papers).toEqual([])
  expect(state.admin.tables.paper_pages).toEqual([])
  expect(state.sent).toEqual([])
}

describe('snapOwnTest: a learner in My own adds a marked test', () => {
  it('stores each page in the private papers bucket under the twin, writes the paper and its pages as the reader expects, and sends own_test.snapped', async () => {
    const res = await snapOwnTest([photo({ name: 'a.jpg' }), photo({ name: 'b.png', type: 'image/png', bytes: 3000 })])
    expect(res.ok).toBe(true)
    const paper = state.admin.tables.papers![0]!
    expect(res).toEqual({ ok: true, paperId: paper.id })
    // the paper: no test, the twin's own, a parent's kind of owner, a test, queued, nothing read yet
    expect(paper).toMatchObject({ test_id: null, child_id: 'twin-1', owner: 'parent', kind: 'test', status: 'queued', name_read: null, total: null, error: null })
    // the pages: the private bucket, {schoolId}/{twinId}/own-test/{paperId}-{n}.jpg, in the order they were taken. The ending follows the photo's own
    // kind (the reader tells the model what a file is from its ending), so a png is stored as .png.
    expect(state.admin.uploads.map((u) => [u.bucket, u.path, u.type])).toEqual([
      ['papers', `school-own/twin-1/own-test/${paper.id}-1.jpg`, 'image/jpeg'],
      ['papers', `school-own/twin-1/own-test/${paper.id}-2.png`, 'image/png'],
    ])
    expect(state.admin.tables.paper_pages!.map((p) => ({ paper_id: p.paper_id, page_no: p.page_no, storage_path: p.storage_path }))).toEqual([
      { paper_id: paper.id, page_no: 1, storage_path: `school-own/twin-1/own-test/${paper.id}-1.jpg` },
      { paper_id: paper.id, page_no: 2, storage_path: `school-own/twin-1/own-test/${paper.id}-2.png` },
    ])
    // the event: the twin and the paper, nothing else
    expect(state.sent).toEqual([{ type: 'own_test.snapped', payload: { childId: 'twin-1', paperId: paper.id } }])
  })

  it('takes one photo and takes four, nothing in between is special', async () => {
    expect((await snapOwnTest([photo()])).ok).toBe(true)
    expect(state.admin.tables.paper_pages).toHaveLength(1)
    expect((await snapOwnTest([photo(), photo(), photo(), photo()])).ok).toBe(true)
    expect(state.admin.tables.paper_pages).toHaveLength(5)
    expect(state.admin.tables.papers).toHaveLength(2)
  })

  it('refuses no photo and five photos in plain words, and stores nothing', async () => {
    expect(await snapOwnTest([])).toEqual({ ok: false, message: 'Take a photo of each page of the test.' })
    expect(await snapOwnTest([photo(), photo(), photo(), photo(), photo()])).toEqual({ ok: false, message: 'Jemma can read up to 4 pages. Send the first 4.' })
    // an empty file is not a photo
    expect(await snapOwnTest([photo({ bytes: 0 })])).toEqual({ ok: false, message: 'Take a photo of each page of the test.' })
    nothingHappened()
  })

  it('refuses a file that is not an image, and a photo that is too big', async () => {
    expect(await snapOwnTest([photo(), photo({ name: 'x.pdf', type: 'application/pdf' })])).toEqual({ ok: false, message: 'Jemma can only read photos. Take the pages again.' })
    expect(await snapOwnTest([photo({ bytes: 9_000_000 })])).toEqual({ ok: false, message: 'A photo is too big. Take it again.' })
    nothingHappened()
  })

  it('refuses a learner who is in My school: only the private twin may add its own work', async () => {
    state.who = 'school'
    expect(await snapOwnTest([photo()])).toEqual({ ok: false, message: 'Switch to My own to add your own work.' })
    nothingHappened()
  })

  it('a request from nobody (not a learner, not a hand-over) is not answered: the sign-in check stops it', async () => {
    state.who = 'nobody'
    await expect(snapOwnTest([photo()])).rejects.toThrow(/404/)
    nothingHappened()
  })

  it('when a page cannot be stored the pages already stored and the paper are taken away, nothing is sent, and the words are plain', async () => {
    state.admin = fakeAdmin(world(), { uploadError: (path) => (path.includes('-2.') ? 'bucket offline' : null) })
    expect(await snapOwnTest([photo(), photo()])).toEqual({ ok: false, message: 'Could not save your photos. Try again.' })
    expect(state.admin.tables.papers).toEqual([])
    expect(state.admin.tables.paper_pages).toEqual([])
    expect(state.admin.removed).toHaveLength(1)
    expect(state.admin.removed[0]!.bucket).toBe('papers')
    expect(state.admin.removed[0]!.paths).toHaveLength(1)
    expect(state.sent).toEqual([])
  })

  it('when Jemma cannot be reached the paper is marked failed and the queued event is closed, so the screen offers the retry (no photo is lost)', async () => {
    state.sendFails = true
    // an event the agent was told nothing about stays queued in the table (the fake has the first paper id, "papers-1")
    state.admin.tables.events!.push({ id: 'e-queued', type: 'own_test.snapped', status: 'queued', payload: { paperId: 'papers-1' }, created_at: new Date(2_000_000_000_000).toISOString() })
    const res = await snapOwnTest([photo()])
    const paper = state.admin.tables.papers![0]!
    expect(res).toEqual({ ok: true, paperId: paper.id })
    expect(paper.id).toBe('papers-1')
    expect(paper).toMatchObject({ status: 'failed', error: 'read_failed' })
    expect(state.admin.tables.paper_pages).toHaveLength(1)
    expect(state.admin.tables.events![0]).toMatchObject({ id: 'e-queued', status: 'failed' })
  })
})

describe('retryOwnTest: the same photos are read again', () => {
  const failedWorld = (over: Row = {}, events: Row[] = []) => {
    state.admin = fakeAdmin(
      world({
        papers: [{ id: 'paper-1', test_id: null, child_id: 'twin-1', owner: 'parent', kind: 'test', status: 'failed', error: 'read_failed', total: null, ...over }],
        paper_pages: [{ id: 'pp-1', paper_id: 'paper-1', page_no: 1, storage_path: 'school-own/twin-1/own-test/paper-1-1.jpg' }],
        events,
      }),
    )
  }

  it('puts a failed paper back to queued with no error, and re-queues its failed event', async () => {
    failedWorld({}, [{ id: 'e1', type: 'own_test.snapped', status: 'failed', payload: { childId: 'twin-1', paperId: 'paper-1' }, created_at: new Date(1).toISOString() }])
    expect(await retryOwnTest('paper-1')).toEqual({ ok: true })
    expect(state.admin.tables.papers![0]).toMatchObject({ status: 'queued', error: null })
    expect(state.retried).toEqual(['e1'])
    expect(state.sent).toEqual([])
    expect(state.revalidated).toContain('/k/own/test/paper-1')
  })

  it('sends a new event when the paper has none to put back', async () => {
    failedWorld()
    expect(await retryOwnTest('paper-1')).toEqual({ ok: true })
    expect(state.admin.tables.papers![0]).toMatchObject({ status: 'queued', error: null })
    expect(state.retried).toEqual([])
    expect(state.sent).toEqual([{ type: 'own_test.snapped', payload: { childId: 'twin-1', paperId: 'paper-1' } }])
  })

  it('does nothing to a paper that is being read or is already marked', async () => {
    for (const status of ['queued', 'reading', 'marked']) {
      failedWorld({ status, error: null }, [{ id: 'e1', type: 'own_test.snapped', status: status === 'marked' ? 'done' : 'running', payload: { paperId: 'paper-1' }, created_at: new Date(1).toISOString() }])
      expect(await retryOwnTest('paper-1')).toEqual({ ok: true })
      expect(state.admin.tables.papers![0]!.status).toBe(status)
    }
    expect(state.retried).toEqual([])
    expect(state.sent).toEqual([])
  })

  it('a queued paper whose newest event failed (the agent was never reached) is retried too', async () => {
    failedWorld({ status: 'queued', error: null }, [{ id: 'e1', type: 'own_test.snapped', status: 'failed', payload: { paperId: 'paper-1' }, created_at: new Date(1).toISOString() }])
    expect(await retryOwnTest('paper-1')).toEqual({ ok: true })
    expect(state.retried).toEqual(['e1'])
  })

  it('refuses a paper that is not this learner\'s, a school child and a paper of a class test, and changes nothing', async () => {
    failedWorld({ child_id: 'child-2' })
    expect(await retryOwnTest('paper-1')).toEqual({ ok: false, message: 'That test was not found.' })
    failedWorld({ test_id: 'test-1' })
    expect(await retryOwnTest('paper-1')).toEqual({ ok: false, message: 'That test was not found.' })
    expect(await retryOwnTest('no-such-paper')).toEqual({ ok: false, message: 'That test was not found.' })
    failedWorld()
    state.who = 'school'
    expect(await retryOwnTest('paper-1')).toEqual({ ok: false, message: 'Switch to My own to add your own work.' })
    expect(state.admin.tables.papers![0]).toMatchObject({ status: 'failed', error: 'read_failed' })
    expect(state.retried).toEqual([])
    expect(state.sent).toEqual([])
  })

  it('when Jemma cannot be reached the event is closed again and the words are plain', async () => {
    failedWorld({}, [{ id: 'e1', type: 'own_test.snapped', status: 'failed', payload: { paperId: 'paper-1' }, created_at: new Date(1).toISOString() }])
    state.retryFails = true
    expect(await retryOwnTest('paper-1')).toEqual({ ok: false, message: 'Jemma could not be reached. Try again in a minute.' })
    expect(state.admin.tables.events![0]!.status).toBe('failed')
  })
})
