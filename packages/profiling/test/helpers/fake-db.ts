import type { JemmaDb } from '../../src/db'

type Row = Record<string, unknown>

/**
 * A database double for plan tests: tables are arrays of rows, and the query builder understands the few calls the plans make
 * (`select`, `eq`, `neq`, `in`, `order`, `limit`, `single`, `maybeSingle`, and awaiting the query itself).
 * Every column of a row comes back whatever the select list says. No network.
 */
export function fakeDb(tables: Record<string, Row[]>): JemmaDb {
  const from = (table: string) => {
    let rows = tables[table] ?? []
    const q = {
      select: () => q,
      order: () => q,
      eq: (key: string, value: unknown) => {
        rows = rows.filter((r) => r[key] === value)
        return q
      },
      neq: (key: string, value: unknown) => {
        rows = rows.filter((r) => r[key] !== value)
        return q
      },
      in: (key: string, values: unknown[]) => {
        rows = rows.filter((r) => values.includes(r[key]))
        return q
      },
      limit: (n: number) => {
        rows = rows.slice(0, n)
        return q
      },
      single: async () => (rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: `expected one row of ${table}, found ${rows.length}` } }),
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
    }
    return q
  }
  return { from } as unknown as JemmaDb
}
