import type { JemmaDb } from '@jemma/profiling/db'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { recordApproval } from '@/lib/approvals'

type Row = Record<string, unknown>

/** An admin client double: `profiles` answers the display name, `approvals` keeps what is inserted. */
function fakeAdmin(opts: { displayName?: string | null; insertError?: string; insertThrows?: boolean } = {}) {
  const inserted: Row[] = []
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
          if (opts.insertThrows) throw new Error('network down')
          inserted.push(row)
          return { error: opts.insertError ? { message: opts.insertError } : null }
        },
      }
    },
  }
  return { admin: admin as unknown as JemmaDb, inserted, looked }
}

const SCHOOL = '11111111-1111-4111-8111-111111111111'
const MAP = '22222222-2222-4222-8222-222222222222'
const USER = '33333333-3333-4333-8333-333333333333'
const CHILD = '44444444-4444-4444-8444-444444444444'

afterEach(() => vi.restoreAllMocks())

describe('recordApproval', () => {
  it('stores the display name of the person who decided', async () => {
    const f = fakeAdmin({ displayName: 'Ms Banda' })
    await recordApproval(f.admin, { schoolId: SCHOOL, kind: 'topic_map', refId: MAP, decision: 'approved', userId: USER })
    expect(f.looked).toEqual([{ table: 'profiles', column: 'user_id', value: USER }])
    expect(f.inserted).toEqual([
      { school_id: SCHOOL, kind: 'topic_map', ref_id: MAP, child_id: null, decision: 'approved', decided_by: USER, decided_by_name: 'Ms Banda', note: null },
    ])
  })

  it('keeps the child and the note when there are any', async () => {
    const f = fakeAdmin({ displayName: 'Thandi M' })
    await recordApproval(f.admin, { schoolId: SCHOOL, kind: 'homework_scan', refId: MAP, childId: CHILD, decision: 'confirmed', userId: USER, note: 'two answers fixed' })
    expect(f.inserted[0]).toMatchObject({ child_id: CHILD, decided_by_name: 'Thandi M', note: 'two answers fixed', decision: 'confirmed' })
  })

  it('writes "Someone" when the person has no name on file', async () => {
    const f = fakeAdmin({ displayName: '  ' })
    await recordApproval(f.admin, { schoolId: SCHOOL, kind: 'reteach', refId: MAP, decision: 'confirmed', userId: USER })
    expect(f.inserted[0]).toMatchObject({ decided_by_name: 'Someone' })
    const none = fakeAdmin({})
    await recordApproval(none.admin, { schoolId: SCHOOL, kind: 'reteach', refId: MAP, decision: 'confirmed', userId: USER })
    expect(none.inserted[0]).toMatchObject({ decided_by_name: 'Someone' })
  })

  it('does not throw when the save fails: it logs one line and carries on', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      recordApproval(fakeAdmin({ displayName: 'Ms Banda', insertError: 'table missing' }).admin, { schoolId: SCHOOL, kind: 'topic_map', refId: MAP, decision: 'approved', userId: USER }),
    ).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalledTimes(1)
    await expect(
      recordApproval(fakeAdmin({ displayName: 'Ms Banda', insertThrows: true }).admin, { schoolId: SCHOOL, kind: 'topic_map', refId: MAP, decision: 'approved', userId: USER }),
    ).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalledTimes(2)
  })
})
