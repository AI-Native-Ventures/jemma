import type { JemmaDb } from '@jemma/profiling/db'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { APPROVAL_NOT_SAVED, ApprovalNotSaved, isApprovalNotSaved, withApproval, type ApprovalInput } from '@/lib/approvals'

type Row = Record<string, unknown>

/**
 * An admin client double: `profiles` answers the display name, `approvals` keeps what is inserted and what is deleted.
 * `order` lists what happened, in the order it happened: `insert`, `step` and `delete`.
 */
function fakeAdmin(opts: { displayName?: string | null; insertError?: string; insertThrows?: boolean; deleteError?: string; deleteThrows?: boolean } = {}) {
  const inserted: Row[] = []
  const deleted: unknown[] = []
  const order: string[] = []
  const looked: { table: string; column: string; value: unknown }[] = []
  const admin = {
    from(table: string) {
      return {
        select() {
          return {
            eq(column: string, value: unknown) {
              looked.push({ table, column, value })
              return { maybeSingle: async () => ({ data: opts.displayName === undefined ? null : { display_name: opts.displayName }, error: null }) }
            },
          }
        },
        async insert(row: Row) {
          order.push('insert')
          if (opts.insertThrows) throw new Error('network down')
          if (!opts.insertError) inserted.push(row)
          return { error: opts.insertError ? { message: opts.insertError } : null }
        },
        delete() {
          return {
            async eq(column: string, value: unknown) {
              order.push('delete')
              if (opts.deleteThrows) throw new Error('network down')
              if (!opts.deleteError) deleted.push({ table, column, value })
              return { error: opts.deleteError ? { message: opts.deleteError } : null }
            },
          }
        },
      }
    },
  }
  return { admin: admin as unknown as JemmaDb, inserted, deleted, order, looked }
}

const SCHOOL = '11111111-1111-4111-8111-111111111111'
const MAP = '22222222-2222-4222-8222-222222222222'
const USER = '33333333-3333-4333-8333-333333333333'
const CHILD = '44444444-4444-4444-8444-444444444444'

const input = (over: Partial<ApprovalInput> = {}): ApprovalInput => ({ schoolId: SCHOOL, kind: 'topic_map', refId: MAP, decision: 'approved', userId: USER, ...over })

afterEach(() => vi.restoreAllMocks())

describe('withApproval: the row that is saved', () => {
  it('stores the display name of the person who decided, with an id of its own', async () => {
    const f = fakeAdmin({ displayName: 'Ms Banda' })
    await withApproval(f.admin, input(), async () => 'done')
    expect(f.looked).toEqual([{ table: 'profiles', column: 'user_id', value: USER }])
    expect(f.inserted).toEqual([
      { id: expect.stringMatching(/^[0-9a-f-]{36}$/), school_id: SCHOOL, kind: 'topic_map', ref_id: MAP, child_id: null, decision: 'approved', decided_by: USER, decided_by_name: 'Ms Banda', note: null },
    ])
  })

  it('keeps the child and the note when there are any', async () => {
    const f = fakeAdmin({ displayName: 'Thandi M' })
    await withApproval(f.admin, input({ kind: 'homework_scan', childId: CHILD, decision: 'confirmed', note: 'two answers fixed' }), async () => 'done')
    expect(f.inserted[0]).toMatchObject({ child_id: CHILD, decided_by_name: 'Thandi M', note: 'two answers fixed', decision: 'confirmed' })
  })

  it('writes "Someone" when the person has no name on file', async () => {
    const f = fakeAdmin({ displayName: '  ' })
    await withApproval(f.admin, input({ kind: 'reteach', decision: 'confirmed' }), async () => 'done')
    expect(f.inserted[0]).toMatchObject({ decided_by_name: 'Someone' })
    const none = fakeAdmin({})
    await withApproval(none.admin, input({ kind: 'reteach', decision: 'confirmed' }), async () => 'done')
    expect(none.inserted[0]).toMatchObject({ decided_by_name: 'Someone' })
  })

  it('every approval gets its own id', async () => {
    const f = fakeAdmin({ displayName: 'Ms Banda' })
    await withApproval(f.admin, input(), async () => 1)
    await withApproval(f.admin, input(), async () => 2)
    expect(new Set(f.inserted.map((r) => r.id)).size).toBe(2)
  })
})

describe('withApproval: the order', () => {
  it('saves the approval first, then runs the step, and hands back what the step returned', async () => {
    const f = fakeAdmin({ displayName: 'Ms Banda' })
    const step = vi.fn(async () => {
      f.order.push('step')
      return { shared: true }
    })
    await expect(withApproval(f.admin, input(), step)).resolves.toEqual({ shared: true })
    expect(f.order).toEqual(['insert', 'step'])
    expect(f.inserted).toHaveLength(1)
    expect(f.deleted).toEqual([])
    expect(step).toHaveBeenCalledTimes(1)
  })

  it('when the approval cannot be saved the step never runs, and the teacher gets one plain line', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const f = fakeAdmin({ displayName: 'Ms Banda', insertError: 'table missing' })
    const step = vi.fn(async () => 'done')
    const caught = await withApproval(f.admin, input(), step).catch((e: unknown) => e)
    expect(step).not.toHaveBeenCalled()
    expect(caught).toBeInstanceOf(ApprovalNotSaved)
    expect(isApprovalNotSaved(caught)).toBe(true)
    expect((caught as Error).message).toBe('Could not save your approval. Nothing changed. Try again.')
    expect(APPROVAL_NOT_SAVED).toBe('Could not save your approval. Nothing changed. Try again.')
    expect(f.order).toEqual(['insert']) // nothing to take back: no delete
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('an approval that throws (the network is down) is the same: no step, one plain line', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const f = fakeAdmin({ displayName: 'Ms Banda', insertThrows: true })
    const step = vi.fn(async () => 'done')
    await expect(withApproval(f.admin, input(), step)).rejects.toMatchObject({ message: APPROVAL_NOT_SAVED })
    expect(step).not.toHaveBeenCalled()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('when the step fails the approval just written is deleted, and the failure of the step is passed on', async () => {
    const f = fakeAdmin({ displayName: 'Ms Banda' })
    const boom = new Error('could not save: the pool is full')
    const caught = await withApproval(f.admin, input(), async () => {
      f.order.push('step')
      throw boom
    }).catch((e: unknown) => e)
    expect(caught).toBe(boom)
    expect(isApprovalNotSaved(caught)).toBe(false)
    expect(f.order).toEqual(['insert', 'step', 'delete'])
    expect(f.deleted).toEqual([{ table: 'approvals', column: 'id', value: f.inserted[0]!.id }])
  })

  it('when the step answers that it did nothing (the happened check says no) the approval is deleted and the answer is handed back', async () => {
    const f = fakeAdmin({ displayName: 'Ms Banda' })
    const answer = await withApproval(f.admin, input(), async () => ({ moved: false }), { happened: (r) => r.moved })
    expect(answer).toEqual({ moved: false })
    expect(f.order).toEqual(['insert', 'delete'])
    expect(f.deleted).toEqual([{ table: 'approvals', column: 'id', value: f.inserted[0]!.id }])
  })

  it('when the happened check says yes the approval stays', async () => {
    const f = fakeAdmin({ displayName: 'Ms Banda' })
    await withApproval(f.admin, input(), async () => ({ moved: true }), { happened: (r) => r.moved })
    expect(f.order).toEqual(['insert'])
    expect(f.deleted).toEqual([])
  })

  it('when the delete fails too, it logs one line and still passes on the failure of the step', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const opts of [{ deleteError: 'table missing' }, { deleteThrows: true }]) {
      spy.mockClear()
      const f = fakeAdmin({ displayName: 'Ms Banda', ...opts })
      const boom = new Error('the step failed')
      await expect(
        withApproval(f.admin, input(), async () => {
          throw boom
        }),
      ).rejects.toBe(boom)
      expect(spy).toHaveBeenCalledTimes(1)
      expect(String(spy.mock.calls[0]![0])).toContain(MAP)
    }
  })
})

describe('ApprovalNotSaved', () => {
  it('is told apart from any other error', () => {
    expect(isApprovalNotSaved(new ApprovalNotSaved())).toBe(true)
    expect(isApprovalNotSaved(new Error(APPROVAL_NOT_SAVED))).toBe(false)
    expect(isApprovalNotSaved('Could not save your approval')).toBe(false)
    expect(isApprovalNotSaved(null)).toBe(false)
  })
})
