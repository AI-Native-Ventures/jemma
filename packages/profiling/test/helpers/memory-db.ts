import type { JemmaDb } from '../../src/db'

type Row = Record<string, unknown>
type Result = { data: unknown; error: { message: string } | null }

/**
 * A database in memory, for tests of a job that reads and writes a few tables and one storage bucket. It understands the calls
 * the curriculum job makes: `select`, `insert`, `update`, `delete`, `eq`, `neq`, `in`, `order`, `limit`, `single`, `maybeSingle`,
 * and awaiting the query. Every column of a row comes back whatever the select list says. No network: a test of the job does not
 * wait for a shared database.
 */
export type MemoryDb = JemmaDb & { tables: Record<string, Row[]>; files: Record<string, Record<string, Uint8Array>> }

export function memoryDb(seed: Record<string, Row[]> = {}, files: Record<string, Record<string, Uint8Array>> = {}): MemoryDb {
  const tables: Record<string, Row[]> = Object.fromEntries(Object.entries(seed).map(([name, rows]) => [name, rows.map((r) => ({ ...r }))]))
  let tick = 0

  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = []
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
    let payload: Row[] = []
    let patch: Row = {}
    let sort: { key: string; ascending: boolean } | null = null
    let max = Infinity

    const run = (): Result => {
      const all = (tables[table] ??= [])
      if (op === 'insert') {
        const added = payload.map((p) => ({ id: crypto.randomUUID(), created_at: new Date(Date.UTC(2026, 10, 12, 8, 0, tick++)).toISOString(), ...p }))
        all.push(...added)
        return { data: added, error: null }
      }
      const hit = all.filter((r) => filters.every((f) => f(r)))
      if (op === 'update') {
        for (const r of hit) Object.assign(r, patch)
        return { data: hit, error: null }
      }
      if (op === 'delete') {
        tables[table] = all.filter((r) => !hit.includes(r))
        return { data: hit, error: null }
      }
      const ordered = sort ? [...hit].sort((a, b) => (String(a[sort!.key]) < String(b[sort!.key]) ? -1 : 1) * (sort!.ascending ? 1 : -1)) : hit
      return { data: ordered.slice(0, max), error: null }
    }

    const q = {
      select: () => q,
      insert: (v: Row | Row[]) => {
        op = 'insert'
        payload = Array.isArray(v) ? v : [v]
        return q
      },
      update: (p: Row) => {
        op = 'update'
        patch = p
        return q
      },
      delete: () => {
        op = 'delete'
        return q
      },
      eq: (key: string, value: unknown) => (filters.push((r) => r[key] === value), q),
      neq: (key: string, value: unknown) => (filters.push((r) => r[key] !== value), q),
      in: (key: string, values: unknown[]) => (filters.push((r) => values.includes(r[key])), q),
      order: (key: string, o?: { ascending?: boolean }) => ((sort = { key, ascending: o?.ascending ?? true }), q),
      limit: (n: number) => ((max = n), q),
      single: async (): Promise<Result> => {
        const { data } = run()
        const rows = data as Row[]
        return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: `expected one row of ${table}, found ${rows.length}` } }
      },
      maybeSingle: async (): Promise<Result> => ({ data: (run().data as Row[])[0] ?? null, error: null }),
      then: (resolve: (v: Result) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
    }
    return q
  }

  const storage = {
    from: (bucket: string) => ({
      download: async (path: string) => {
        const bytes = files[bucket]?.[path]
        return bytes ? { data: new Blob([bytes as BlobPart]), error: null } : { data: null, error: { message: `not found: ${bucket}/${path}` } }
      },
    }),
  }

  return { from, storage, tables, files } as unknown as MemoryDb
}
