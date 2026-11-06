import { MockLanguageModelV4 } from 'ai/test'
import { wrapLanguageModel } from 'ai'
import { expect, test } from 'vitest'
import { MemoryStore, ReplayMissError, SupabaseReplayStore, replayKey, withReplay } from '../../src/ai'

const result = (text: string) =>
  ({
    content: [{ type: 'text', text }],
    finishReason: { unified: 'stop', raw: 'stop' },
    usage: {
      inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 1, text: 1, reasoning: 0 },
    },
    warnings: [],
  }) as never

const params = (text: string) => ({ prompt: [{ role: 'user', content: [{ type: 'text', text }] }] }) as never

function setup(mode: 'live' | 'record' | 'replay' | 'cache', store = new MemoryStore()) {
  const mock = new MockLanguageModelV4({ modelId: 'm1', doGenerate: result('hi') })
  const model = wrapLanguageModel({ model: mock, middleware: withReplay(store, mode) })
  return { mock, model, store }
}

test('record stores, replay returns without calling the model', async () => {
  const store = new MemoryStore()
  const rec = setup('record', store)
  await rec.model.doGenerate(params('q'))
  expect(rec.mock.doGenerateCalls.length).toBe(1)
  const rep = setup('replay', store)
  const out = await rep.model.doGenerate(params('q'))
  expect(rep.mock.doGenerateCalls.length).toBe(0)
  expect(out.content).toEqual([{ type: 'text', text: 'hi' }])
})

test('replay miss throws ReplayMissError', async () => {
  const { model } = setup('replay')
  await expect(model.doGenerate(params('unseen'))).rejects.toBeInstanceOf(ReplayMissError)
})

test('same image bytes give the same key, different bytes a different key', async () => {
  const p = (b: number[]) => ({
    prompt: [{ role: 'user', content: [{ type: 'file', mediaType: 'image/png', data: new Uint8Array(b) }] }],
  })
  const a = await replayKey('m', p([1, 2, 3]))
  expect(await replayKey('m', p([1, 2, 3]))).toBe(a)
  expect(await replayKey('m', p([1, 2, 4]))).not.toBe(a)
})

test('attendance timestamps normalize across days while attendance counts stay meaningful', async () => {
  const profile = (date: string, present: number, total: number) =>
    params(JSON.stringify({ attendance: { present, total, away: [`${date}T08:00:00.000Z`] } }))
  const key = await replayKey('m1', profile('2026-10-27', 9, 10))
  expect(await replayKey('m1', profile('2026-11-06', 9, 10))).toBe(key)
  expect(await replayKey('m1', profile('2026-11-06', 10, 11))).not.toBe(key)
})

test('SupabaseReplayStore reads and writes ai_replays', async () => {
  const rows = new Map<string, unknown>()
  const client = {
    from: (table: string) => {
      expect(table).toBe('ai_replays')
      return {
        select: () => ({
          eq: (_c: string, key: string) => ({
            maybeSingle: async () => ({
              data: rows.has(key) ? { response: rows.get(key) } : null,
              error: null,
            }),
          }),
        }),
        upsert: async (row: { key: string; response: unknown }) => {
          rows.set(row.key, row.response)
          return { error: null }
        },
      }
    },
  }
  const s = new SupabaseReplayStore(client as never)
  expect(await s.get('k')).toBeNull()
  await s.put('k', 'm', { a: 1 })
  expect(await s.get('k')).toEqual({ a: 1 })
})

test('a recording made with one sandbox ids and dates replays in another, with that sandbox ids', async () => {
  const store = new MemoryStore()
  const a = '11111111-1111-4111-8111-111111111111'
  const b = '22222222-2222-4222-8222-222222222222'
  const call = (id: string, day: string) => params(`result ${id} written on ${day}T10:00:00.000Z`)
  const mock = new MockLanguageModelV4({ modelId: 'm1', doGenerate: result(`{"resultId":"${a}"}`) })
  await wrapLanguageModel({ model: mock, middleware: withReplay(store, 'record') }).doGenerate(call(a, '2026-10-27'))
  const rep = new MockLanguageModelV4({ modelId: 'm1', doGenerate: result('never') })
  const out = await wrapLanguageModel({ model: rep, middleware: withReplay(store, 'replay') }).doGenerate(call(b, '2026-11-02'))
  expect(rep.doGenerateCalls.length).toBe(0)
  expect(out.content).toEqual([{ type: 'text', text: `{"resultId":"${b}"}` }])
})

test('cache mode returns a stored answer, and calls the model once on a miss then stores it', async () => {
  const store = new MemoryStore()
  const { mock, model } = setup('cache', store)
  await model.doGenerate(params('q'))
  await model.doGenerate(params('q'))
  expect(mock.doGenerateCalls.length).toBe(1)
  await model.doGenerate(params('another'))
  expect(mock.doGenerateCalls.length).toBe(2)
})

test('two sandboxes with the same inputs hit the same replay key', async () => {
  const sandbox = (school: string, child: string, result: string, at: string) =>
    params(`Learner ${child} in school ${school}, wrote 2/6 on ${at}T08:15:00.000Z. resultId ${result}`)
  const a = sandbox('a1b2c3d4-0000-4000-8000-000000000001', 'a1b2c3d4-0000-4000-8000-0000000000c1', 'a1b2c3d4-0000-4000-8000-0000000000e1', '2026-10-27')
  const b = sandbox('f9e8d7c6-1111-4111-8111-000000000002', 'f9e8d7c6-1111-4111-8111-0000000000c2', 'f9e8d7c6-1111-4111-8111-0000000000e2', '2026-11-02')
  expect(await replayKey('m1', a)).toBe(await replayKey('m1', b))
  // Different content still gives a different key.
  expect(await replayKey('m1', params('Learner x wrote 3/9'))).not.toBe(await replayKey('m1', params('Learner x wrote 2/6')))
})
