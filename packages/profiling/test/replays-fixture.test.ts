import { existsSync, readFileSync, statSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { describe, expect, test } from 'vitest'
import { encodeReplays, fetchReplays, isAnswerKey, scrubResponse } from '../../../scripts/export-replays'
import { REPLAYS_FIXTURE, batchRows, loadReplays, parseReplays, type ReplayRow } from '../../../scripts/load-replays'

const row = (key: string, text = 'x'): ReplayRow => ({ key, model: 'm/one:free', response: { text } })

/** Just enough of the Supabase query builder: select, not, order, range. Records what was asked. */
function fakeReadDb(table: ReplayRow[]) {
  const calls: string[] = []
  const db = {
    from(name: string) {
      calls.push(`from ${name}`)
      const query = {
        select: (cols: string) => (calls.push(`select ${cols}`), query),
        not: (col: string, op: string, value: string) => (calls.push(`not ${col} ${op} ${value}`), query),
        order: (col: string) => (calls.push(`order ${col}`), query),
        range: async (a: number, b: number) => ({ data: table.slice(a, b + 1), error: null }),
      }
      return query
    },
  }
  return { db: db as never, calls }
}

function fakeWriteDb(failOn?: number) {
  const batches: ReplayRow[][] = []
  const opts: unknown[] = []
  const db = {
    from: (name: string) => ({
      upsert: async (batch: ReplayRow[], o: unknown) => {
        expect(name).toBe('ai_replays')
        batches.push(batch)
        opts.push(o)
        return { error: failOn === batches.length ? { message: 'boom' } : null }
      },
    }),
  }
  return { db: db as never, batches, opts }
}

describe('export and load of recorded answers', () => {
  test('lock rows are not answers', () => {
    expect(isAnswerKey('lock:tail:abc')).toBe(false)
    expect(isAnswerKey('9f86d081884c7d659a2feaa0c55ad015')).toBe(true)
  })

  test('the model host cookie is dropped from a stored answer and nothing else is', () => {
    const answer = { content: [{ text: 'hi' }], response: { id: 'g1', headers: { 'Set-Cookie': '__cf_bm=abc', date: 'today', 'x-generation-id': 'g1' } } }
    expect(scrubResponse(answer)).toEqual({ content: [{ text: 'hi' }], response: { id: 'g1', headers: { date: 'today', 'x-generation-id': 'g1' } } })
    expect(answer.response.headers['Set-Cookie']).toBe('__cf_bm=abc')
    expect(scrubResponse({ text: 'no headers here' })).toEqual({ text: 'no headers here' })
    expect(scrubResponse('plain' as never)).toBe('plain')
  })

  test('encode then parse gives the same rows back', () => {
    const rows = [row('a', 'one'), row('b', 'two')]
    expect(parseReplays(encodeReplays(rows))).toEqual(rows)
    expect(JSON.parse(gunzipSync(encodeReplays(rows)).toString('utf8'))).toEqual(rows)
  })

  test('parse refuses a file that is not an array of answers', () => {
    expect(() => parseReplays(encodeReplays({ nope: 1 } as never))).toThrow(/array/)
    expect(() => parseReplays(encodeReplays([{ key: 'a', model: 'm' }] as never))).toThrow(/row 0/)
  })

  test('fetch reads every page, only selects, and drops lock rows', async () => {
    const table = [row('a'), row('b'), row('lock:x'), row('c'), row('d')]
    const { db, calls } = fakeReadDb(table)
    const rows = await fetchReplays(db, 2)
    expect(rows.map((r) => r.key)).toEqual(['a', 'b', 'c', 'd'])
    expect(rows[0]).toEqual(row('a'))
    expect(calls).toContain('not key like lock:%')
    expect(calls.every((c) => /^(from ai_replays|select |not |order )/.test(c))).toBe(true)
  })

  test('fetch stops on a full last page and on an empty page', async () => {
    expect((await fetchReplays(fakeReadDb([row('a'), row('b')]).db, 2)).map((r) => r.key)).toEqual(['a', 'b'])
    expect(await fetchReplays(fakeReadDb([]).db, 2)).toEqual([])
  })

  test('batches stay under the size limit and keep the order', () => {
    const rows = ['a', 'b', 'c', 'd', 'e'].map((k) => row(k, 'y'.repeat(100)))
    const size = JSON.stringify(rows[0]).length
    const batches = batchRows(rows, size * 2)
    expect(batches.map((b) => b.length)).toEqual([2, 2, 1])
    expect(batches.flat().map((r) => r.key)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(batchRows([row('big', 'z'.repeat(1000))], 10)).toHaveLength(1)
    expect(batchRows([], 10)).toEqual([])
  })

  test('load upserts every row by key, in batches', async () => {
    const rows = ['a', 'b', 'c'].map((k) => row(k, 'y'.repeat(100)))
    const { db, batches, opts } = fakeWriteDb()
    const sent = await loadReplays(db, rows, JSON.stringify(rows[0]).length * 2)
    expect(sent).toBe(3)
    expect(batches.map((b) => b.length)).toEqual([2, 1])
    expect(opts).toEqual([{ onConflict: 'key' }, { onConflict: 'key' }])
  })

  test('load says what went wrong', async () => {
    await expect(loadReplays(fakeWriteDb(1).db, [row('a')])).rejects.toThrow(/boom/)
  })
})

describe('the committed fixture fixtures/ai-replays.json.gz', () => {
  const present = existsSync(REPLAYS_FIXTURE)
  const bytes = present ? readFileSync(REPLAYS_FIXTURE) : Buffer.alloc(0)
  const text = present ? gunzipSync(bytes).toString('utf8') : ''

  test('is there, under 40 MB, and holds recorded answers with no locks', () => {
    expect(present).toBe(true)
    expect(statSync(REPLAYS_FIXTURE).size).toBeLessThan(40_000_000)
    const rows = parseReplays(bytes)
    expect(rows.length).toBeGreaterThan(100)
    expect(rows.some((r) => r.key.startsWith('lock:'))).toBe(false)
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length)
  })

  test('is made of rows recorded with the models start.sh sets', () => {
    const models = new Set(parseReplays(bytes).map((r) => r.model))
    const allowed = new Set(['nvidia/nemotron-3.5-super-vl:free', 'nvidia/nemotron-3-ultra-550b-a55b:free', 'google/gemma-4-31b-it:free'])
    expect([...models].filter((m) => !allowed.has(m))).toEqual([])
  })

  test('holds no key-like strings and no real email addresses', () => {
    expect(text).not.toMatch(/sk-[A-Za-z0-9_-]{8,}/)
    expect(text).not.toContain('eyJhbGci')
    expect(text).not.toContain('sb_secret')
    expect(text.toLowerCase()).not.toContain('set-cookie')
    expect(text).not.toContain('__cf_bm')
    const emails = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []
    const madeUp = /@([a-z0-9-]+\.)*(example\.[a-z]+|test|invalid)$/i
    expect(emails.filter((e) => !madeUp.test(e))).toEqual([])
  })
})
