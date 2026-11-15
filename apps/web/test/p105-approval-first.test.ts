// @vitest-environment node
import { readFileSync } from 'node:fs'
import { globSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeAdmin, type FakeAdmin, type Row } from './p97-fake-db'

// P105: a teacher's approval can never go missing. Every action that records an approval goes through `withApproval`: the approval row is saved
// first; when it cannot be saved the step never happens and the teacher reads one plain line; when the step then fails the row is taken back.
// The database is an in-memory stand-in that keeps its writes in the order they were made. Nothing here talks to a database, an agent or a model.

const state = vi.hoisted(() => ({ db: null as unknown as FakeAdmin, redirected: [] as string[] }))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: (url: string) => void state.redirected.push(url) }))
vi.mock('@/lib/agent', () => ({ sendEvent: vi.fn(async () => 'event-1'), retryEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/auth', () => ({ requireRole: async () => ({ userId: 'teacher-1', profile: {} }) }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: async () => state.db }))
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdmin: () => state.db }))
vi.mock('@/lib/data/p21', () => ({ requireTeaches: async () => ({ admin: state.db, userId: 'teacher-1', schoolId: 's1' }) }))
vi.mock('@/lib/data/p32', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getSnapPaper: async () => ({ id: 'paper1', status: 'needs_you' }),
  getReadAnswers: async () => [{ id: 'qr1', n: 1, answer_read: '3' }],
}))

import { APPROVAL_NOT_SAVED, type ApprovalKind } from '@/lib/approvals'
import { approveDraftMap } from '@/lib/curriculum-map'
import { decidePattern } from '@/lib/long-view'
import { shareResults } from '@/lib/share-results'
import { approveMap } from '../app/t/[classId]/curriculum/actions'
import { decideLink } from '../app/t/[classId]/link-requests/actions'
import { markReteachDone } from '../app/t/[classId]/gaps/actions'
import { approveKey, confirmPaper, fixMark, resolveAnswer, resolveName } from '../app/t/[classId]/snap/actions'
import { confirmScan } from '../app/p/[childId]/snap/actions'

const LINE = 'Could not save your approval. Nothing changed. Try again.'

const topic = (name: string, family: string, prerequisites: string[] = []) => ({ name, family, prerequisites, misconceptions: [] })
const DRAFT = {
  grade: 6,
  terms: [{ term: 1, topics: [topic('Whole numbers', 'whole_numbers'), topic('Fractions', 'fractions', ['Whole numbers'])] }],
  leftOut: [],
  resolutions: {},
}

const world = (over: Record<string, Row[]> = {}) => ({
  classes: [{ id: 'c1', school_id: 's1' }],
  tests: [{ id: 't1', class_id: 'c1', title: 'Class Test 1', out_of: 10, held: true }],
  answer_keys: [{ test_id: 't1', status: 'draft', items: [{ n: 1, prompt: '1 + 1', answer: '2', marks: 1, topicName: 'Whole numbers', confidence: 1 }] }],
  papers: [{ id: 'paper1', test_id: 't1', child_id: 'kid1', status: 'needs_you', total: 0 }],
  needs_you_items: [{ id: 'item1', kind: 'check_answer', status: 'open', ref_id: 'paper1' }],
  question_results: [{ id: 'qr1', paper_id: 'paper1', n: 1, answer_read: '3', read_confidence: 1, previous_answer: null, changed_by: null, mark: 0, correct: false }],
  enrolments: [{ class_id: 'c1', child_id: 'kid1' }],
  children: [{ id: 'kid1', school_id: 's1', first_name: 'Amina' }],
  parent_links: [
    { id: 'link1', class_id: 'c1', child_id: 'kid1', parent_id: 'par1', status: 'pending' },
    { id: 'link2', class_id: 'c1', child_id: 'kid1', parent_id: 'par2', status: 'approved' },
  ],
  reteach_plans: [{ id: 'rt1', class_id: 'c1', done_at: null }],
  curriculum_maps: [{ id: 'map1', class_id: 'c1', status: 'draft', draft: structuredClone(DRAFT) }],
  topics: [] as Row[],
  long_view_patterns: [{ id: 'lv1', child_id: 'kid1', status: 'draft', active: true }],
  profiles: [{ user_id: 'teacher-1', display_name: 'Ms Banda' }],
  approvals: [] as Row[],
  ...Object.fromEntries(Object.entries(over).map(([table, rows]) => [table, structuredClone(rows)])),
})

/** The line the teacher reads when the action does not succeed, `null` when it succeeded, `threw: ...` when it threw instead of answering. */
async function shown(run: () => Promise<unknown>): Promise<string | null> {
  try {
    const a = (await run()) as { ok?: boolean; message?: string; reason?: string } | undefined
    if (a && a.ok === false) return a.message ?? a.reason ?? 'no words'
    return null
  } catch (e) {
    return `threw: ${e instanceof Error ? e.message : String(e)}`
  }
}

type Case = {
  /** What the approval is for (the kind the row carries). */
  kind: ApprovalKind
  /** Which tap. */
  name: string
  world?: Record<string, Row[]>
  run: () => Promise<unknown>
  /** The first write of the step itself: made to fail in "when the step fails". */
  step: [table: string, verb: 'insert' | 'update' | 'delete']
}

const teacherDeps = () => ({ teacher: { ...state.db, rpc: async () => ({ data: true, error: null }) } as never, admin: state.db as never, userId: 'teacher-1' })

const CASES: Case[] = [
  { kind: 'topic_map', name: 'Approve map (approveMap)', run: () => approveMap('map1'), step: ['curriculum_maps', 'update'] },
  { kind: 'answer_key', name: 'Approve key (approveKey)', run: () => approveKey('c1', 't1'), step: ['answer_keys', 'update'] },
  { kind: 'mark', name: 'Type what a paper says (resolveAnswer)', run: () => resolveAnswer('c1', 'item1', 1, '2'), step: ['question_results', 'update'] },
  { kind: 'mark', name: 'Fix a mark (fixMark)', run: () => fixMark('c1', 'qr1', '2'), step: ['question_results', 'update'] },
  { kind: 'paper_name', name: 'Say whose paper it is (resolveName)', run: () => resolveName('c1', 'item1', 'kid1'), step: ['papers', 'update'] },
  { kind: 'paper', name: 'Confirm a paper (confirmPaper)', run: () => confirmPaper('c1', 'paper1'), step: ['papers', 'update'] },
  { kind: 'guardian_link', name: 'Say yes to a guardian (decideLink)', run: () => decideLink('c1', 'link1', 'approved'), step: ['parent_links', 'update'] },
  { kind: 'reteach', name: 'Mark reteach done (markReteachDone)', run: () => markReteachDone('rt1'), step: ['reteach_plans', 'update'] },
  { kind: 'homework_scan', name: 'Confirm a homework scan (confirmScan)', run: () => confirmScan('kid1', 'paper1', {}, [1]), step: ['papers', 'update'] },
  { kind: 'long_view_pattern', name: 'Looks right (decidePattern approve)', run: () => decidePattern(teacherDeps(), 'approve', 'lv1'), step: ['long_view_patterns', 'update'] },
  { kind: 'long_view_pattern', name: 'Not yet (decidePattern dismiss)', run: () => decidePattern(teacherDeps(), 'dismiss', 'lv1'), step: ['long_view_patterns', 'update'] },
  {
    kind: 'long_view_talk',
    name: 'We have talked (decidePattern discuss)',
    world: { long_view_patterns: [{ id: 'lv1', child_id: 'kid1', status: 'approved', active: true }] },
    run: () => decidePattern(teacherDeps(), 'discuss', 'lv1'),
    step: ['long_view_patterns', 'update'],
  },
  {
    kind: 'share_results',
    name: 'Share with parents (shareResults)',
    world: { papers: [{ id: 'p1', test_id: 't1', child_id: 'kid1', status: 'marked', total: 1, created_at: '2026-11-10T08:00:00Z' }] },
    run: () => shareResults(teacherDeps(), 'c1', 't1'),
    step: ['tests', 'update'],
  },
]

const stepWrites = () => state.db.calls.filter((c) => c.table !== 'approvals')
const approvalCalls = (verb: 'insert' | 'delete') => state.db.calls.filter((c) => c.table === 'approvals' && c.verb === verb)

beforeEach(() => {
  state.redirected = []
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

function setup(c: Case, writeError?: (table: string, verb: 'insert' | 'update' | 'delete') => string | null) {
  state.db = fakeAdmin(world(c.world), { writeError })
}

describe('every action that records an approval saves it first', () => {
  it.each(CASES)('$kind: $name saves one approval row, and only then does its step', async (c) => {
    setup(c)
    expect(await shown(c.run)).toBeNull()
    const firstWrite = state.db.calls[0]!
    expect(firstWrite).toMatchObject({ table: 'approvals', verb: 'insert' })
    expect(approvalCalls('insert')).toHaveLength(1)
    expect(approvalCalls('delete')).toHaveLength(0)
    expect(state.db.tables.approvals).toEqual([expect.objectContaining({ kind: c.kind, school_id: 's1', decided_by: 'teacher-1', decided_by_name: 'Ms Banda' })])
    // the step wrote after the approval, not before
    expect(stepWrites().length).toBeGreaterThan(0)
    const at = (table: string, verb: string) => state.db.calls.findIndex((x) => x.table === table && x.verb === verb)
    expect(at(c.step[0], c.step[1])).toBeGreaterThan(at('approvals', 'insert'))
  })
})

describe('when the approval cannot be saved', () => {
  it.each(CASES)('$kind: $name does nothing and shows the one plain line', async (c) => {
    setup(c, (table, verb) => (table === 'approvals' && verb === 'insert' ? 'approvals are down' : null))
    expect(await shown(c.run)).toBe(LINE)
    expect(stepWrites()).toEqual([]) // not one write of the step: no row changed, nothing told, nothing queued
    expect(approvalCalls('delete')).toEqual([]) // there is nothing to take back
    expect(state.db.tables.approvals).toEqual([])
    expect(state.redirected).toEqual([]) // the teacher stays on the screen to read the line
  })

  it('the line is the same one everywhere', () => {
    expect(APPROVAL_NOT_SAVED).toBe(LINE)
  })
})

describe('when the step fails after the approval was saved', () => {
  it.each(CASES)('$kind: $name takes the approval row back', async (c) => {
    setup(c, (table, verb) => (table === c.step[0] && verb === c.step[1] ? 'the pool is full' : null))
    const line = await shown(c.run)
    expect(line).not.toBeNull()
    expect(line).not.toContain(LINE)
    const saved = approvalCalls('insert')[0]!.values as Row
    expect(approvalCalls('delete')).toEqual([expect.objectContaining({ table: 'approvals', filters: [`id=${String(saved.id)}`] })])
    expect(state.db.tables.approvals).toEqual([])
  })
})

describe('the approval goes with the step it is for', () => {
  it('a delete that fails too leaves the row, logs it, and the teacher still reads the failure of the step', async () => {
    const c = CASES.find((x) => x.kind === 'answer_key')!
    setup(c, (table, verb) => (table === 'answer_keys' && verb === 'update' ? 'the pool is full' : table === 'approvals' && verb === 'delete' ? 'also down' : null))
    expect(await shown(c.run)).toBe('the pool is full')
    expect(state.db.tables.approvals).toHaveLength(1)
    expect(vi.mocked(console.error).mock.calls.some((args) => String(args[0]).includes('could not take back'))).toBe(true)
  })

  it('Share with parents tapped twice at once: the one that finds the test already shared takes its approval back', async () => {
    const c = CASES.find((x) => x.kind === 'share_results')!
    setup(c)
    const [a, b] = await Promise.all([c.run(), c.run()])
    expect([a, b].filter((r) => (r as { shared?: boolean }).shared)).toHaveLength(1)
    expect(state.db.tables.approvals).toHaveLength(1)
    expect(approvalCalls('insert')).toHaveLength(2)
    expect(approvalCalls('delete')).toHaveLength(1)
  })

  it('a pattern someone else already decided (the write matches no row) leaves no approval behind', async () => {
    const c = CASES.find((x) => x.kind === 'long_view_pattern' && x.name.includes('approve'))!
    // the teacher's own read says draft, the service client finds it already approved
    setup(c, undefined)
    state.db.tables.long_view_patterns![0]!.status = 'approved'
    const deps = teacherDeps()
    const seen = { id: 'lv1', child_id: 'kid1', status: 'draft', active: true }
    const teacher = { ...state.db, from: (t: string) => (t === 'long_view_patterns' ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: seen, error: null }) }) }) } : state.db.from(t)), rpc: async () => ({ data: true, error: null }) }
    expect(await shown(() => decidePattern({ ...deps, teacher: teacher as never }, 'approve', 'lv1'))).toBe('This pattern was already decided.')
    expect(state.db.tables.approvals).toEqual([])
    expect(approvalCalls('insert')).toHaveLength(1)
    expect(approvalCalls('delete')).toHaveLength(1)
  })

  it('approveDraftMap (the topic map, the teacher or a learner) throws the plain line and writes nothing when the approval is not saved', async () => {
    state.db = fakeAdmin(world(), { writeError: (table, verb) => (table === 'approvals' && verb === 'insert' ? 'approvals are down' : null) })
    const map = state.db.tables.curriculum_maps![0] as { id: string; class_id: string; draft: unknown }
    await expect(approveDraftMap(state.db as never, map, 'teacher-1')).rejects.toThrow(LINE)
    expect(stepWrites()).toEqual([])
    expect(state.db.rpcs).toEqual([])
  })

  it('a refused step (nothing to approve yet) saves no approval at all', async () => {
    state.db = fakeAdmin(world({ answer_keys: [{ test_id: 't1', status: 'draft', items: [] }], question_results: [{ id: 'qr1', paper_id: 'paper1', n: 1, answer_read: '3', read_confidence: 0.2, changed_by: null }] }))
    expect(await shown(() => approveKey('c1', 't1'))).toBe('There are no answers to approve yet.')
    expect(await shown(() => confirmPaper('c1', 'paper1'))).toBe('Question 1 still needs you.')
    expect(state.db.calls).toEqual([])
  })
})

describe('no caller keeps the old order', () => {
  const root = resolve(import.meta.dirname, '..')
  const sources = globSync('{app,lib,components}/**/*.{ts,tsx}', { cwd: root }).sort()

  it('nothing in the web app calls recordApproval any more: every approval goes through withApproval', () => {
    const offenders = sources.filter((f) => /\brecordApproval\b/.test(readFileSync(resolve(root, f), 'utf8')))
    expect(offenders).toEqual([])
  })

  it('every file that records an approval imports withApproval', () => {
    const callers = sources.filter((f) => /\bwithApproval\(/.test(readFileSync(resolve(root, f), 'utf8')) && f !== 'lib/approvals.ts')
    expect(callers.sort()).toEqual([
      'app/p/[childId]/snap/actions.ts',
      'app/t/[classId]/gaps/actions.ts',
      'app/t/[classId]/link-requests/actions.ts',
      'app/t/[classId]/snap/actions.ts',
      'lib/curriculum-map.ts',
      'lib/long-view.ts',
      'lib/share-results.ts',
    ])
    for (const f of callers) expect(readFileSync(resolve(root, f), 'utf8'), f).toMatch(/import \{[^}]*\bwithApproval\b[^}]*\} from '(@\/lib|\.)\/approvals'/)
  })
})
