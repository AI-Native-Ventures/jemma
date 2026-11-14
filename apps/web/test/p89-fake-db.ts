import type { SupabaseClient } from '@supabase/supabase-js'

// A stand-in for a Supabase client: it keeps rows per table, applies `eq`, `in` and `not(col, 'is', null)` the way the database would,
// ignores everything else (`order`, `limit`, `gt`, ...), and records every query so a test can say what was read and how it was filtered.
// No network, no database.

export type Op = [method: string, ...args: unknown[]]
export type Query = { table: string; ops: Op[] }
export type FakeDb = SupabaseClient & { queries: Query[]; reads: (table: string) => Query[] }

type Row = Record<string, unknown>

export function fakeDb(tables: Record<string, Row[]> = {}, options: { userId?: string } = {}): FakeDb {
  const queries: Query[] = []
  const from = (table: string) => {
    const query: Query = { table, ops: [] }
    queries.push(query)
    const answer = () => {
      let rows = tables[table] ?? []
      for (const [method, ...args] of query.ops) {
        if (method === 'eq') rows = rows.filter((r) => r[args[0] as string] === args[1])
        if (method === 'in') rows = rows.filter((r) => (args[1] as unknown[]).includes(r[args[0] as string]))
        if (method === 'not' && args[1] === 'is' && args[2] === null) rows = rows.filter((r) => r[args[0] as string] != null)
      }
      return rows
    }
    const builder: Record<string, unknown> = new Proxy(
      {},
      {
        get(_target, method: string) {
          if (method === 'then') return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve({ data: answer(), error: null }).then(resolve, reject)
          if (method === 'maybeSingle' || method === 'single') return () => Promise.resolve({ data: answer()[0] ?? null, error: null })
          return (...args: unknown[]) => {
            query.ops.push([method, ...args])
            return builder
          }
        },
      },
    )
    return builder
  }
  const auth = { getUser: async () => ({ data: { user: options.userId ? { id: options.userId } : null }, error: null }) }
  return { from, auth, queries, reads: (table: string) => queries.filter((q) => q.table === table) } as unknown as FakeDb
}

/** The values a query was filtered with by `in(column, ...)`, or null when it has no such filter. */
export const inFilter = (query: Query, column: string): unknown[] | null => {
  const op = query.ops.find(([method, col]) => method === 'in' && col === column)
  return op ? (op[2] as unknown[]) : null
}
