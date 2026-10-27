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

function setup(mode: 'live' | 'record' | 'replay', store = new MemoryStore()) {
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
