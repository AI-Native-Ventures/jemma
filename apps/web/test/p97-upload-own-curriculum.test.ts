// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeAdmin, type FakeAdmin, type Row } from './p97-fake-db'

// `uploadOwnCurriculum`: a learner in My own adds their own curriculum (a PDF or photos), and it becomes a private class with a draft map that Jemma
// reads. The learner, the database, storage and the agent are stand-ins: the point is who may add one, the class and the rows that are written, and
// the event that is sent.

const state = vi.hoisted(() => ({
  who: 'twin' as 'twin' | 'school' | 'nobody',
  admin: null as unknown as FakeAdmin,
  sent: [] as { type: string; payload: Record<string, unknown> }[],
  sendError: null as string | null,
  revalidated: [] as string[],
}))

vi.mock('@/lib/agent', () => ({
  sendEvent: vi.fn(async (type: string, payload: Record<string, unknown>) => {
    if (state.sendError) throw new Error(state.sendError)
    state.sent.push({ type, payload })
    return 'event-1'
  }),
  retryEvent: vi.fn(),
}))
vi.mock('@/lib/approvals', () => ({ recordApproval: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => state.revalidated.push(path) }))
vi.mock('@/lib/data/p27', () => ({
  myChild: async () => {
    if (state.who === 'nobody') throw Object.assign(new Error('NEXT_HTTP_ERROR_FALLBACK;404'), { digest: 'NEXT_HTTP_ERROR_FALLBACK;404' })
    const supabase = { auth: { getUser: async () => ({ data: { user: { id: 'u-amina' } } }) } }
    return { supabase, child: state.who === 'twin' ? { id: 'twin-1', private_of: 'child-1', first_name: 'Amina', grade: 6 } : { id: 'child-1', private_of: null, first_name: 'Amina', grade: 6 } }
  },
}))
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdmin: () => state.admin }))

import { uploadOwnCurriculum } from '../app/k/own/actions'

const world = (extra: Record<string, Row[]> = {}) => ({
  children: [
    { id: 'twin-1', school_id: 'school-own', private_of: 'child-1' },
    { id: 'child-1', school_id: 'school-1', private_of: null },
  ],
  classes: [] as Row[],
  enrolments: [] as Row[],
  curriculum_maps: [] as Row[],
  curriculum_docs: [] as Row[],
  events: [] as Row[],
  ...extra,
})

const pdf = (name = 'plan.pdf', extra = '') => new File([`%PDF-1.4\n1 0 obj << /Type /Page >> endobj\n${extra}`], name, { type: 'application/pdf' })
const png = (name = 'page-1.png') => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])], name, { type: 'image/png' })
const jpg = (name = 'page-2.jpg') => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], name, { type: 'image/jpeg' })

beforeEach(() => {
  state.who = 'twin'
  state.admin = fakeAdmin(world())
  state.sent = []
  state.sendError = null
  state.revalidated = []
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

const nothingHappened = () => {
  expect(state.admin.tables.classes).toEqual([])
  expect(state.admin.tables.enrolments).toEqual([])
  expect(state.admin.tables.curriculum_docs).toEqual([])
  expect(state.admin.tables.curriculum_maps).toEqual([])
  expect(state.admin.uploads).toEqual([])
  expect(state.sent).toEqual([])
}

describe('uploadOwnCurriculum: a learner in My own adds their own curriculum', () => {
  it('makes a private class for it (the learner\'s name for it, the grade, Mathematics, the person acting as its teacher) in the personal school, and enrols the twin', async () => {
    const res = await uploadOwnCurriculum(6, "My school's Term 1 plan", [pdf()])
    expect(res.ok).toBe(true)
    const [cls] = state.admin.tables.classes!
    expect(cls).toMatchObject({ school_id: 'school-own', teacher_id: 'u-amina', name: "My school's Term 1 plan", grade: 6, subject: 'Mathematics', year: new Date().getUTCFullYear() })
    expect(cls!.join_code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
    expect(state.admin.tables.enrolments).toEqual([expect.objectContaining({ class_id: cls!.id, child_id: 'twin-1' })])
  })

  it('stores each document in the curriculum bucket under the class and writes one row for it, as the teacher\'s upload does', async () => {
    const res = await uploadOwnCurriculum(7, 'Maths book', [pdf('contents.pdf'), png(), jpg()])
    expect(res.ok).toBe(true)
    const cls = state.admin.tables.classes![0]!
    expect(state.admin.uploads.map((u) => [u.bucket, u.type])).toEqual([['curriculum', 'application/pdf'], ['curriculum', 'image/png'], ['curriculum', 'image/jpeg']])
    for (const u of state.admin.uploads) expect(u.path).toMatch(new RegExp(`^school-own/${cls.id}/\\d+-\\d-`))
    expect(state.admin.tables.curriculum_docs!.map((d) => [d.class_id, d.title, d.pages])).toEqual([
      [cls.id, 'contents', 1],
      [cls.id, 'page-1', 1],
      [cls.id, 'page-2', 1],
    ])
    expect(state.admin.tables.curriculum_docs!.map((d) => d.storage_path)).toEqual(state.admin.uploads.map((u) => u.path))
  })

  it('writes the draft map the way the teacher\'s upload does and sends curriculum.uploaded with its id, then answers with that id', async () => {
    const res = await uploadOwnCurriculum(6, 'Plan', [pdf()])
    const map = state.admin.tables.curriculum_maps![0]!
    expect(map).toMatchObject({ class_id: state.admin.tables.classes![0]!.id, status: 'draft' })
    expect(state.sent).toEqual([{ type: 'curriculum.uploaded', payload: { mapId: map.id } }])
    expect(res).toEqual({ ok: true, mapId: map.id })
    expect(state.revalidated).toContain('/k/own')
  })

  it('a name with extra spaces is kept tidy', async () => {
    await uploadOwnCurriculum(6, '  My   school plan  ', [pdf()])
    expect(state.admin.tables.classes![0]!.name).toBe('My school plan')
  })

  it('refuses a learner who is in My school, and a request from nobody does not get an answer', async () => {
    state.who = 'school'
    expect(await uploadOwnCurriculum(6, 'Plan', [pdf()])).toEqual({ ok: false, message: 'Switch to My own to add your own work.' })
    nothingHappened()
    state.who = 'nobody'
    await expect(uploadOwnCurriculum(6, 'Plan', [pdf()])).rejects.toThrow(/404/)
    nothingHappened()
  })

  it('refuses a grade outside 1 to 12, a name that is empty or too long and no file, each in plain words, and makes nothing', async () => {
    for (const bad of [0, 13, -1, 6.5, Number.NaN, '6', null]) expect(await uploadOwnCurriculum(bad as number, 'Plan', [pdf()]), String(bad)).toEqual({ ok: false, message: 'Pick a grade from 1 to 12.' })
    expect(await uploadOwnCurriculum(6, '   ', [pdf()])).toEqual({ ok: false, message: 'Give your curriculum a name.' })
    expect(await uploadOwnCurriculum(6, 'x'.repeat(61), [pdf()])).toEqual({ ok: false, message: 'Use a shorter name.' })
    expect(await uploadOwnCurriculum(6, 'Plan', [])).toEqual({ ok: false, message: 'Add a file, or take photos of the pages.' })
    nothingHappened()
  })

  it('takes only what the teacher\'s upload takes: a PDF, a JPG or a PNG read from its first bytes, and no document over its size', async () => {
    const text = new File(['hello'], 'notes.txt', { type: 'text/plain' })
    expect(await uploadOwnCurriculum(6, 'Plan', [pdf(), text])).toEqual({ ok: false, message: '"notes.txt" is not a PDF, JPG or PNG file. Jemma can only read those three kinds.' })
    // a PDF in name only
    expect((await uploadOwnCurriculum(6, 'Plan', [new File(['not a pdf'], 'fake.pdf', { type: 'application/pdf' })])).ok).toBe(false)
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.pdf', { type: 'application/pdf' })
    const tooBig = await uploadOwnCurriculum(6, 'Plan', [big])
    expect(tooBig.ok).toBe(false)
    expect(tooBig.ok === false && tooBig.message).toMatch(/The limit is 10 MB for one document/)
    nothingHappened()
  })

  it('when a document cannot be stored the class and the files stored so far are taken away and the words are plain', async () => {
    state.admin = fakeAdmin(world(), { uploadError: (path) => (path.endsWith('-1-page-1.png') ? 'bucket offline' : null) })
    expect(await uploadOwnCurriculum(6, 'Plan', [pdf(), png()])).toEqual({ ok: false, message: 'Could not save your files. Try again.' })
    expect(state.admin.tables.classes).toEqual([])
    expect(state.admin.tables.curriculum_docs).toEqual([])
    expect(state.admin.removed[0]!.bucket).toBe('curriculum')
    expect(state.admin.removed[0]!.paths).toHaveLength(1)
    expect(state.sent).toEqual([])
  })

  it('an agent that cannot be reached leaves the event queued and the screen shows Jemma reading, as the teacher\'s screen does', async () => {
    state.sendError = 'AGENT_URL is not set'
    const res = await uploadOwnCurriculum(6, 'Plan', [pdf()])
    expect(res.ok).toBe(true)
    expect(state.admin.tables.curriculum_docs).toHaveLength(1)
  })

  it('any other failure of the event takes the class away again, so a second try does not leave a first class behind', async () => {
    state.sendError = 'sendEvent: permission denied for table events'
    expect(await uploadOwnCurriculum(6, 'Plan', [pdf()])).toEqual({ ok: false, message: 'Could not send your curriculum. Try again.' })
    expect(state.admin.tables.classes).toEqual([])
    expect(state.admin.tables.curriculum_docs).toEqual([])
    expect(state.admin.tables.curriculum_maps).toEqual([])
  })
})
