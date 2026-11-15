import type { JemmaDb } from '@jemma/profiling/db'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { approvalText } from '@/lib/data/p50'
import { sendGuidance, type SendGuidanceDeps } from '@/lib/send-guidance'

// "Send to family" (P106): the teacher's tap copies the draft guidance card into `guidance_cards` (what the family reads), removes the draft and
// records an approval of the kind `guidance` with the teacher's name. The database is an in-memory double; the real rules (who may read a draft) are
// checked in supabase/test/guidance-drafts.rls.test.ts. Nothing here talks to an agent or a model.

type Row = Record<string, unknown>
type State = { classes: Row[]; enrolments: Row[]; children: Row[]; guidance_drafts: Row[]; guidance_cards: Row[]; profiles: Row[]; approvals: Row[] }

const CLASS = 'class-1'
const SCHOOL = 'school-1'
const TEACHER = 'teacher-1'
const AMINA = 'amina'
const THABO = 'thabo'
const NOW = '2026-11-15T09:30:00.000Z'

const card = (headline: string) => ({
  headline,
  focus: [{ title: 'Adding fractions', why: 'Tops and bottoms were added', evidence: [{ label: 'Test 1 Q2', resultIds: ['r1'] }] }],
  lookingAhead: 'Next up is subtracting fractions.',
})

function fresh(over: Partial<State> = {}): State {
  return {
    classes: [{ id: CLASS, school_id: SCHOOL }],
    enrolments: [
      { class_id: CLASS, child_id: AMINA },
      { class_id: CLASS, child_id: THABO },
    ],
    children: [
      { id: AMINA, first_name: 'Amina' },
      { id: THABO, first_name: 'Thabo' },
    ],
    guidance_drafts: [{ child_id: AMINA, content: card('Draft headline'), created_at: '2026-11-14T08:00:00.000Z', updated_at: '2026-11-14T08:00:00.000Z' }],
    guidance_cards: [],
    profiles: [{ user_id: TEACHER, display_name: 'Ms Banda' }],
    approvals: [],
    ...over,
  }
}

type Opts = { teaches?: boolean; failUpsert?: boolean; failApproval?: boolean; beforeDelete?: (state: State) => void }

/** The calls `sendGuidance` makes. Filters apply when the query runs, so two taps at once cannot both delete the same row. */
function memoryDb(state: State, opts: Opts = {}) {
  const calls: string[] = []
  const query = (table: keyof State) => {
    const filters: ((r: Row) => boolean)[] = []
    const matching = () => state[table].filter((r) => filters.every((f) => f(r)))
    let verb: 'select' | 'delete' | 'insert' | 'upsert' = 'select'
    let payload: Row = {}
    let conflict = ''
    const run = () => {
      if (verb === 'insert') {
        if (table === 'approvals' && opts.failApproval) return { data: null, error: { message: 'approvals are down' } }
        calls.push(`insert ${table}`)
        state[table].push(payload)
        return { data: null, error: null }
      }
      if (verb === 'upsert') {
        if (opts.failUpsert) return { data: null, error: { message: 'cards are down' } }
        calls.push(`upsert ${table}`)
        const at = state[table].findIndex((r) => r[conflict] === payload[conflict])
        if (at >= 0) Object.assign(state[table][at]!, payload)
        else state[table].push({ ...payload })
        return { data: null, error: null }
      }
      if (verb === 'delete') {
        opts.beforeDelete?.(state)
        const gone = matching()
        calls.push(`delete ${table} x${gone.length}`)
        state[table] = state[table].filter((r) => !gone.includes(r))
        return { data: gone, error: null }
      }
      return { data: matching(), error: null }
    }
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), q),
      in: (k: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[k])), q),
      delete: () => ((verb = 'delete'), q),
      insert: (row: Row) => ((verb = 'insert'), (payload = row), q),
      upsert: (row: Row, o: { onConflict: string }) => ((verb = 'upsert'), (payload = row), (conflict = o.onConflict), q),
      maybeSingle: async () => ({ data: (run().data as Row[] | null)?.[0] ?? null, error: null }),
      single: async () => ({ data: (run().data as Row[] | null)?.[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
    }
    return q
  }
  const db = {
    from: (table: keyof State) => query(table),
    rpc: async (name: string, args: Record<string, unknown>) => ({ data: name === 'teaches_class' && args.cls === CLASS ? (opts.teaches ?? true) : false, error: null }),
  }
  return { db: db as unknown as JemmaDb, calls }
}

function setup(state = fresh(), opts: Opts = {}, over: Partial<SendGuidanceDeps> = {}) {
  const teacher = memoryDb(state, opts)
  const admin = memoryDb(state, opts)
  const deps: SendGuidanceDeps = { teacher: teacher.db, admin: admin.db, userId: TEACHER, now: () => new Date(NOW), ...over }
  return { state, deps, admin }
}

afterEach(() => vi.restoreAllMocks())

describe('sendGuidance', () => {
  it('copies the draft into guidance_cards and removes the draft', async () => {
    const { state, deps } = setup()
    expect(await sendGuidance(deps, CLASS, AMINA)).toEqual({ ok: true, sent: true })
    expect(state.guidance_cards).toEqual([{ child_id: AMINA, content: card('Draft headline'), created_at: '2026-11-14T08:00:00.000Z', updated_at: NOW }])
    expect(state.guidance_drafts).toEqual([])
  })

  it('records an approval of the kind guidance with the name of the teacher and the learner', async () => {
    const { state, deps } = setup()
    await sendGuidance(deps, CLASS, AMINA)
    expect(state.approvals).toEqual([
      { school_id: SCHOOL, kind: 'guidance', ref_id: AMINA, child_id: AMINA, decision: 'shared', decided_by: TEACHER, decided_by_name: 'Ms Banda', note: 'Amina' },
    ])
  })

  it('says it in the log in plain words', () => {
    expect(approvalText({ kind: 'guidance', decision: 'shared', decided_by_name: 'Ms Banda', note: 'Amina' })).toBe("Ms Banda sent Amina's guidance card to the family")
    expect(approvalText({ kind: 'guidance', decision: 'shared', decided_by_name: 'Ms Banda', note: null })).toBe('Ms Banda sent a guidance card to the family')
  })

  it('replaces the card the family has, keeps when it was first made, and leaves the other learners alone', async () => {
    const state = fresh({
      guidance_cards: [
        { child_id: AMINA, content: card('Old card'), created_at: '2026-11-10T08:00:00.000Z', updated_at: '2026-11-10T08:00:00.000Z' },
        { child_id: THABO, content: card('Thabo card'), created_at: '2026-11-10T08:00:00.000Z', updated_at: '2026-11-10T08:00:00.000Z' },
      ],
    })
    const { deps } = setup(state)
    await sendGuidance(deps, CLASS, AMINA)
    expect(state.guidance_cards).toEqual([
      { child_id: AMINA, content: card('Draft headline'), created_at: '2026-11-10T08:00:00.000Z', updated_at: NOW },
      { child_id: THABO, content: card('Thabo card'), created_at: '2026-11-10T08:00:00.000Z', updated_at: '2026-11-10T08:00:00.000Z' },
    ])
  })

  it('sending twice does it once: the second tap finds nothing waiting, and adds no approval', async () => {
    const { state, deps } = setup()
    await sendGuidance(deps, CLASS, AMINA)
    expect(await sendGuidance(deps, CLASS, AMINA)).toEqual({ ok: true, sent: false })
    expect(state.approvals).toHaveLength(1)
    expect(state.guidance_cards).toHaveLength(1)
  })

  it('two taps at the same moment record one approval', async () => {
    const { state, deps } = setup()
    const [a, b] = await Promise.all([sendGuidance(deps, CLASS, AMINA), sendGuidance(deps, CLASS, AMINA)])
    expect([a, b].filter((r) => r.ok && r.sent)).toHaveLength(1)
    expect(state.approvals).toHaveLength(1)
    expect(state.guidance_cards).toHaveLength(1)
    expect(state.guidance_drafts).toEqual([])
  })

  it('a newer draft that arrives while sending is kept for the teacher, and the family gets the card that was read', async () => {
    const state = fresh()
    const { deps } = setup(state, {
      beforeDelete: (s) => {
        s.guidance_drafts[0] = { child_id: AMINA, content: card('Newer draft'), created_at: '2026-11-14T08:00:00.000Z', updated_at: '2026-11-15T09:29:59.000Z' }
      },
    })
    expect(await sendGuidance(deps, CLASS, AMINA)).toEqual({ ok: true, sent: true })
    expect((state.guidance_cards[0]!.content as { headline: string }).headline).toBe('Draft headline')
    expect((state.guidance_drafts[0]!.content as { headline: string }).headline).toBe('Newer draft')
    expect(state.approvals).toHaveLength(1)
  })

  it('does nothing when no draft is waiting', async () => {
    const { state, deps } = setup(fresh({ guidance_drafts: [] }))
    expect(await sendGuidance(deps, CLASS, AMINA)).toEqual({ ok: true, sent: false })
    expect(state.guidance_cards).toEqual([])
    expect(state.approvals).toEqual([])
  })

  it('sends only the draft of the learner it was asked for', async () => {
    const state = fresh({
      guidance_drafts: [
        { child_id: AMINA, content: card('Amina draft'), created_at: '2026-11-14T08:00:00.000Z', updated_at: '2026-11-14T08:00:00.000Z' },
        { child_id: THABO, content: card('Thabo draft'), created_at: '2026-11-14T08:00:00.000Z', updated_at: '2026-11-14T08:00:00.000Z' },
      ],
    })
    const { deps } = setup(state)
    await sendGuidance(deps, CLASS, THABO)
    expect(state.guidance_cards.map((c) => c.child_id)).toEqual([THABO])
    expect(state.guidance_drafts.map((d) => d.child_id)).toEqual([AMINA])
  })
})

describe('who may send', () => {
  it('only the class teacher: another person changes nothing', async () => {
    const { state, deps } = setup(fresh(), { teaches: false })
    expect(await sendGuidance(deps, CLASS, AMINA)).toEqual({ ok: false, message: 'Only the class teacher can send this.' })
    expect(state.guidance_cards).toEqual([])
    expect(state.guidance_drafts).toHaveLength(1)
    expect(state.approvals).toEqual([])
  })

  it('a learner who is not in this class is refused', async () => {
    const { state, deps } = setup(fresh({ enrolments: [{ class_id: CLASS, child_id: THABO }] }))
    expect(await sendGuidance(deps, CLASS, AMINA)).toEqual({ ok: false, message: 'That learner is not in this class.' })
    expect(state.guidance_cards).toEqual([])
    expect(state.guidance_drafts).toHaveLength(1)
  })
})

describe('when something is wrong', () => {
  it('a draft that cannot be read as a card is not sent, and stays', async () => {
    const state = fresh({ guidance_drafts: [{ child_id: AMINA, content: { headline: 'No focus and no looking ahead' }, created_at: '2026-11-14T08:00:00.000Z', updated_at: '2026-11-14T08:00:00.000Z' }] })
    const { deps } = setup(state)
    expect(await sendGuidance(deps, CLASS, AMINA)).toEqual({ ok: false, message: 'This card could not be read, so it was not sent.' })
    expect(state.guidance_cards).toEqual([])
    expect(state.guidance_drafts).toHaveLength(1)
    expect(state.approvals).toEqual([])
  })

  it('a card that cannot be saved leaves the draft waiting and records nothing', async () => {
    const { state, deps } = setup(fresh(), { failUpsert: true })
    expect(await sendGuidance(deps, CLASS, AMINA)).toEqual({ ok: false, message: 'Could not send the card. Try again.' })
    expect(state.guidance_drafts).toHaveLength(1)
    expect(state.approvals).toEqual([])
  })

  it('an approval that cannot be saved does not undo the send: the card is sent and the failure is only logged', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { state, deps } = setup(fresh(), { failApproval: true })
    expect(await sendGuidance(deps, CLASS, AMINA)).toEqual({ ok: true, sent: true })
    expect(state.guidance_cards).toHaveLength(1)
    expect(state.guidance_drafts).toEqual([])
    expect(error).toHaveBeenCalled()
  })
})
