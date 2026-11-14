// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeAdmin, type FakeAdmin, type Row } from './p97-fake-db'

// What a learner does with the draft of their own curriculum: take a topic out, and approve it ("These look right"). The learner, the database and
// the agent are stand-ins: the point is that only the learner's own maps can be changed, what approving writes (the class's topics, the retag, the
// log and the approval that names the person), and that the teacher's approval and this one are the same code (`approveDraftMap`).

const state = vi.hoisted(() => ({
  who: 'twin' as 'twin' | 'school' | 'nobody',
  admin: null as unknown as FakeAdmin,
  revalidated: [] as string[],
}))

vi.mock('@/lib/agent', () => ({ sendEvent: vi.fn(), retryEvent: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => state.revalidated.push(path) }))
vi.mock('@/lib/data/p27', () => ({
  myChild: async () => {
    if (state.who === 'nobody') throw Object.assign(new Error('NEXT_HTTP_ERROR_FALLBACK;404'), { digest: 'NEXT_HTTP_ERROR_FALLBACK;404' })
    const supabase = { auth: { getUser: async () => ({ data: { user: { id: 'u-amina' } } }) } }
    return { supabase, child: state.who === 'twin' ? { id: 'twin-1', private_of: 'child-1', first_name: 'Amina', grade: 6 } : { id: 'child-1', private_of: null, first_name: 'Amina', grade: 6 } }
  },
}))
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdmin: () => state.admin }))

import { approveOwnCurriculum, removeOwnTopic } from '../app/k/own/actions'

const topic = (name: string, family: string, prerequisites: string[] = []) => ({ name, family, prerequisites, misconceptions: [] })
const DRAFT = {
  grade: 6,
  terms: [
    { term: 1, topics: [topic('Whole numbers', 'whole_numbers'), topic('Fractions', 'fractions', ['Whole numbers'])] },
    { term: 2, topics: [topic('Decimals', 'fractions', ['Fractions'])] },
  ],
  leftOut: [{ name: 'Probability', reason: 'It is not in Grade 6.' }],
  resolutions: {},
}

const world = (over: Record<string, Row[]> = {}) => ({
  children: [
    { id: 'twin-1', school_id: 'school-own', private_of: 'child-1' },
    { id: 'twin-2', school_id: 'school-other', private_of: 'child-9' },
  ],
  classes: [
    { id: 'c-own', school_id: 'school-own', grade: 6, name: 'My plan' },
    { id: 'c-other', school_id: 'school-other', grade: 6, name: 'Their plan' },
  ],
  enrolments: [
    { class_id: 'c-own', child_id: 'twin-1' },
    { class_id: 'c-other', child_id: 'twin-2' },
  ],
  curriculum_maps: [
    { id: 'm-own', class_id: 'c-own', status: 'draft', draft: structuredClone(DRAFT) },
    { id: 'm-other', class_id: 'c-other', status: 'draft', draft: structuredClone(DRAFT) },
    { id: 'm-done', class_id: 'c-own', status: 'approved', draft: structuredClone(DRAFT) },
    { id: 'm-empty', class_id: 'c-own', status: 'draft', draft: {} },
  ],
  topics: [] as Row[],
  needs_you_items: [{ id: 'n1', kind: 'approve_map', ref_id: 'm-own', status: 'open' }],
  activity_log: [] as Row[],
  profiles: [{ user_id: 'u-amina', display_name: 'Amina' }],
  approvals: [] as Row[],
  ...over,
})

beforeEach(() => {
  state.who = 'twin'
  state.admin = fakeAdmin(world())
  state.revalidated = []
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

const map = (id: string) => state.admin.tables.curriculum_maps!.find((m) => m.id === id)!
const draftNames = (id: string) => (map(id).draft as typeof DRAFT).terms.map((t) => t.topics.map((x) => x.name))

describe('approveOwnCurriculum: "These look right"', () => {
  it('saves the draft as the topics of the learner\'s own class, in order, with what each needs, and marks the map approved', async () => {
    expect(await approveOwnCurriculum('m-own')).toEqual({ ok: true })
    const topics = state.admin.tables.topics!
    expect(topics.map((t) => [t.map_id, t.term, t.position, t.name])).toEqual([
      ['m-own', 1, 1, 'Whole numbers'],
      ['m-own', 1, 2, 'Fractions'],
      ['m-own', 2, 1, 'Decimals'],
    ])
    const idOf = (name: string) => topics.find((t) => t.name === name)!.id
    expect(topics.find((t) => t.name === 'Fractions')!.prerequisite_ids).toEqual([idOf('Whole numbers')])
    expect(topics.find((t) => t.name === 'Decimals')!.prerequisite_ids).toEqual([idOf('Fractions')])
    expect(map('m-own')).toMatchObject({ status: 'approved' })
    expect(map('m-own').approved_at).toBeTruthy()
    // the other maps are not touched
    expect(map('m-other').status).toBe('draft')
  })

  it('tags past results to the new topics, closes the Needs you item, and writes the line of "What Jemma did"', async () => {
    await approveOwnCurriculum('m-own')
    expect(state.admin.rpcs).toEqual([{ name: 'retag_results', args: { map: 'm-own' } }])
    expect(state.admin.tables.needs_you_items![0]).toMatchObject({ status: 'done' })
    expect(state.admin.tables.activity_log).toEqual([expect.objectContaining({ school_id: 'school-own', class_id: 'c-own', tool: 'approve_map', text: 'Saved the map you approved: 3 topics' })])
  })

  it('writes an approval that names the person who tapped (the learner, or the parent who acts for them), in the personal school', async () => {
    await approveOwnCurriculum('m-own')
    expect(state.admin.tables.approvals).toEqual([
      expect.objectContaining({ school_id: 'school-own', kind: 'topic_map', ref_id: 'm-own', decision: 'approved', decided_by: 'u-amina', decided_by_name: 'Amina' }),
    ])
    expect(state.revalidated).toContain('/k/own/curriculum/m-own')
    expect(state.revalidated).toContain('/k/own')
  })

  it('refuses a learner who is in My school, and nothing is saved', async () => {
    state.who = 'school'
    expect(await approveOwnCurriculum('m-own')).toEqual({ ok: false, message: 'Switch to My own to add your own work.' })
    expect(map('m-own').status).toBe('draft')
    expect(state.admin.tables.topics).toEqual([])
  })

  it('refuses another learner\'s map, and a map that does not exist, in plain words', async () => {
    expect(await approveOwnCurriculum('m-other')).toEqual({ ok: false, message: 'That curriculum was not found.' })
    expect(await approveOwnCurriculum('no-such-map')).toEqual({ ok: false, message: 'That curriculum was not found.' })
    expect(map('m-other').status).toBe('draft')
    expect(state.admin.tables.approvals).toEqual([])
  })

  it('a map that is already approved is left alone (a second tap writes no second approval)', async () => {
    expect(await approveOwnCurriculum('m-done')).toEqual({ ok: true })
    expect(state.admin.tables.approvals).toEqual([])
    expect(state.admin.tables.topics).toEqual([])
  })

  it('a draft Jemma has not written yet cannot be approved', async () => {
    expect(await approveOwnCurriculum('m-empty')).toEqual({ ok: false, message: 'Jemma is still reading your curriculum.' })
    expect(map('m-empty').status).toBe('draft')
  })

  it('a draft with every topic taken out cannot be approved', async () => {
    await removeOwnTopic('m-own', 'Whole numbers')
    await removeOwnTopic('m-own', 'Fractions')
    await removeOwnTopic('m-own', 'Decimals')
    expect(await approveOwnCurriculum('m-own')).toEqual({ ok: false, message: 'Keep at least one topic.' })
    expect(map('m-own').status).toBe('draft')
    expect(state.admin.tables.topics).toEqual([])
  })

  it('a failure while saving is said in plain words and never thrown', async () => {
    state.admin = fakeAdmin(world(), { rpcError: 'timeout' })
    expect(await approveOwnCurriculum('m-own')).toEqual({ ok: false, message: 'Could not save your curriculum. Try again.' })
  })
})

describe('removeOwnTopic', () => {
  it('takes the topic out of the draft, and every "needs" that pointed at it, and keeps the rest as it was', async () => {
    expect(await removeOwnTopic('m-own', 'Fractions')).toEqual({ ok: true })
    expect(draftNames('m-own')).toEqual([['Whole numbers'], ['Decimals']])
    const decimals = (map('m-own').draft as typeof DRAFT).terms[1]!.topics[0]!
    expect(decimals.prerequisites).toEqual([])
    expect((map('m-own').draft as typeof DRAFT).leftOut).toEqual(DRAFT.leftOut)
    expect(map('m-own').status).toBe('draft')
    expect(state.revalidated).toContain('/k/own/curriculum/m-own')
  })

  it('a topic that is not in the draft changes nothing', async () => {
    expect(await removeOwnTopic('m-own', 'Algebra')).toEqual({ ok: true })
    expect(draftNames('m-own')).toEqual([['Whole numbers', 'Fractions'], ['Decimals']])
  })

  it('refuses a learner in My school, another learner\'s map, an approved map and a draft not written yet', async () => {
    expect(await removeOwnTopic('m-other', 'Fractions')).toEqual({ ok: false, message: 'That curriculum was not found.' })
    expect(draftNames('m-other')).toEqual([['Whole numbers', 'Fractions'], ['Decimals']])
    expect(await removeOwnTopic('m-done', 'Fractions')).toEqual({ ok: false, message: 'This curriculum is already done.' })
    expect(draftNames('m-done')).toEqual([['Whole numbers', 'Fractions'], ['Decimals']])
    expect(await removeOwnTopic('m-empty', 'Fractions')).toEqual({ ok: false, message: 'Jemma is still reading your curriculum.' })
    state.who = 'school'
    expect(await removeOwnTopic('m-own', 'Fractions')).toEqual({ ok: false, message: 'Switch to My own to add your own work.' })
    expect(draftNames('m-own')).toEqual([['Whole numbers', 'Fractions'], ['Decimals']])
  })
})
