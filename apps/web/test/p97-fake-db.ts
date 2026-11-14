// A stand-in for the service client that keeps rows per table and can read, insert, update and delete them: enough for the actions of "Add your
// own work" (P97), whose point is which rows are written and with what. It applies `eq`, `neq`, `in`, `is` and `contains`-free filters, and the
// `payload->>key` form on a jsonb column; it ignores `order`, `limit` and `select` columns. Storage keeps the paths it was given. No network, no database.

export type Row = Record<string, unknown>
export type Tables = Record<string, Row[]>
export type Call = { table: string; verb: 'insert' | 'update' | 'delete'; values?: Row | Row[]; filters: string[] }

export type FakeAdmin = ReturnType<typeof fakeAdmin>

type Filter = (row: Row) => boolean

function valueAt(row: Row, column: string): unknown {
  const arrow = /^(\w+)->>(\w+)$/.exec(column)
  if (!arrow) return row[column]
  const json = row[arrow[1]!]
  const v = json && typeof json === 'object' ? (json as Row)[arrow[2]!] : undefined
  return v === undefined || v === null ? v : String(v)
}

export function fakeAdmin(
  tables: Tables = {},
  options: { uploadError?: (path: string) => string | null; insertError?: (table: string) => string | null; rpcError?: string | null } = {},
) {
  const calls: Call[] = []
  const uploads: { bucket: string; path: string; type: string; size: number }[] = []
  const removed: { bucket: string; paths: string[] }[] = []
  const rpcs: { name: string; args: unknown }[] = []
  let counter = 0
  const rows = (table: string) => (tables[table] ??= [])

  const from = (table: string) => {
    let verb: 'select' | 'insert' | 'update' | 'delete' = 'select'
    let values: Row | Row[] | undefined
    const filters: Filter[] = []
    const described: string[] = []
    let inserted: Row[] = []
    let ran = false
    const matches = (r: Row) => filters.every((f) => f(r))

    const run = (): { data: Row[]; error: { message: string; code?: string } | null } => {
      if (verb === 'insert') {
        if (!ran) {
          ran = true
          const failure = options.insertError?.(table) ?? null
          if (failure) return { data: [], error: { message: failure } }
          const list = Array.isArray(values) ? values : [values!]
          inserted = list.map((v) => ({ id: `${table}-${++counter}`, created_at: new Date(1_700_000_000_000 + counter).toISOString(), ...v }))
          rows(table).push(...inserted)
          calls.push({ table, verb, values, filters: described })
        }
        return { data: inserted, error: null }
      }
      if (verb === 'update') {
        if (!ran) {
          ran = true
          for (const r of rows(table).filter(matches)) Object.assign(r, values)
          calls.push({ table, verb, values, filters: described })
        }
        return { data: rows(table).filter(matches), error: null }
      }
      if (verb === 'delete') {
        if (!ran) {
          ran = true
          const gone = rows(table).filter(matches)
          tables[table] = rows(table).filter((r) => !gone.includes(r))
          calls.push({ table, verb, filters: described })
        }
        return { data: [], error: null }
      }
      return { data: rows(table).filter(matches).map((r) => ({ ...r })), error: null }
    }

    const builder: Record<string, unknown> = new Proxy(
      {},
      {
        get(_t, method: string) {
          if (method === 'then') return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject)
          if (method === 'single' || method === 'maybeSingle')
            return () => {
              const out = run()
              if (out.error) return Promise.resolve({ data: null, error: out.error })
              const one = out.data[0] ?? null
              return Promise.resolve(one || method === 'maybeSingle' ? { data: one, error: null } : { data: null, error: { message: 'no rows', code: 'PGRST116' } })
            }
          return (...args: unknown[]) => {
            switch (method) {
              case 'insert':
                verb = 'insert'
                values = args[0] as Row | Row[]
                break
              case 'update':
                verb = 'update'
                values = args[0] as Row
                break
              case 'delete':
                verb = 'delete'
                break
              case 'eq':
                described.push(`${String(args[0])}=${String(args[1])}`)
                filters.push((r) => valueAt(r, args[0] as string) === args[1] || String(valueAt(r, args[0] as string)) === String(args[1]))
                break
              case 'neq':
                described.push(`${String(args[0])}!=${String(args[1])}`)
                filters.push((r) => valueAt(r, args[0] as string) !== args[1])
                break
              case 'in':
                described.push(`${String(args[0])} in ${JSON.stringify(args[1])}`)
                filters.push((r) => (args[1] as unknown[]).includes(valueAt(r, args[0] as string)))
                break
              case 'is':
                described.push(`${String(args[0])} is ${String(args[1])}`)
                filters.push((r) => (valueAt(r, args[0] as string) ?? null) === args[1])
                break
              default:
                // select, order, limit, gte, ...: not applied
                break
            }
            return builder
          }
        },
      },
    )
    return builder
  }

  const storage = {
    from: (bucket: string) => ({
      upload: async (path: string, file: File) => {
        const failure = options.uploadError?.(path) ?? null
        if (failure) return { error: { message: failure } }
        uploads.push({ bucket, path, type: file.type, size: file.size })
        return { error: null }
      },
      remove: async (paths: string[]) => {
        removed.push({ bucket, paths })
        return { error: null }
      },
    }),
  }

  const rpc = async (name: string, args: unknown) => {
    rpcs.push({ name, args })
    return { data: null, error: options.rpcError ? { message: options.rpcError } : null }
  }

  return { from, storage, rpc, tables, calls, uploads, removed, rpcs }
}

export const photo = (over: { name?: string; type?: string; bytes?: number } = {}) =>
  new File([new Uint8Array(over.bytes ?? 2000)], over.name ?? 'page.jpg', { type: over.type ?? 'image/jpeg' })
