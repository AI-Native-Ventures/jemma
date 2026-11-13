import { MockLanguageModelV4 } from 'ai/test'
import { wrapLanguageModel } from 'ai'
import { afterEach, describe, expect, test, vi } from 'vitest'
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

// ---- P75: a recorded answer never holds the request, and in cache mode the store can never fail a call ----

afterEach(() => vi.restoreAllMocks())

/** What a provider hands back with its answer: the raw request body, which holds the file when the call carried one. */
const BIG_REQUEST = { body: { contents: [{ inlineData: { data: 'A'.repeat(5000) } }] } }
const withRequest = () => ({ ...(result('hi') as object), request: BIG_REQUEST, response: { id: 'r1', headers: { a: 'b' } } }) as never

/** A store that remembers what was put, and can be made to fail. */
class SpyStore extends MemoryStore {
  puts: unknown[] = []
  constructor(private fail: { get?: boolean; put?: boolean } = {}) {
    super()
  }
  async get(key: string) {
    if (this.fail.get) throw new Error('ai_replays read failed: boom')
    return super.get(key)
  }
  async put(key: string, model: string, value: unknown) {
    if (this.fail.put) throw new Error('ai_replays write failed: canceling statement due to statement timeout')
    this.puts.push(value)
    return super.put(key, model, value)
  }
}

const streamOf = (parts: unknown[]) =>
  new ReadableStream({
    start(c) {
      for (const part of parts) c.enqueue(part)
      c.close()
    },
  })

const CHUNKS = [
  { type: 'stream-start', warnings: [] },
  { type: 'text-start', id: 't1' },
  { type: 'text-delta', id: 't1', delta: 'hi' },
  { type: 'text-end', id: 't1' },
  { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } } },
]

function streamSetup(mode: 'live' | 'record' | 'replay' | 'cache', store: MemoryStore) {
  const mock = new MockLanguageModelV4({
    modelId: 'm1',
    doStream: async () => ({ stream: streamOf(CHUNKS), request: BIG_REQUEST, response: { id: 'r1' } }) as never,
  })
  return { mock, model: wrapLanguageModel({ model: mock, middleware: withReplay(store, mode) }) }
}

async function drain(stream: ReadableStream<unknown>): Promise<unknown[]> {
  const out: unknown[] = []
  const reader = stream.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return out
    out.push(value)
  }
}

describe('a recorded answer never holds the request', () => {
  test('generate: the stored value has no request, the caller still gets the whole result', async () => {
    const store = new SpyStore()
    const mock = new MockLanguageModelV4({ modelId: 'm1', doGenerate: withRequest() })
    const model = wrapLanguageModel({ model: mock, middleware: withReplay(store, 'record') })
    const out = await model.doGenerate(params('q'))
    expect(out.request).toEqual(BIG_REQUEST)
    expect(store.puts).toHaveLength(1)
    const stored = store.puts[0] as Record<string, unknown>
    expect('request' in stored).toBe(false)
    // everything else of the shape stays
    expect(Object.keys(stored).sort()).toEqual(['content', 'finishReason', 'response', 'usage', 'warnings'])
    expect(JSON.stringify(stored)).not.toContain('AAAAA')
  })

  test('stream: the stored rest has no request, the caller still gets the whole rest', async () => {
    const store = new SpyStore()
    const { model } = streamSetup('record', store)
    const out = await model.doStream(params('q'))
    expect(out.request).toEqual(BIG_REQUEST)
    await drain(out.stream)
    expect(store.puts).toHaveLength(1)
    const stored = store.puts[0] as { chunks: unknown[]; rest: Record<string, unknown> }
    expect(stored.chunks).toEqual(CHUNKS)
    expect('request' in stored.rest).toBe(false)
    expect(stored.rest.response).toEqual({ id: 'r1' })
    expect(JSON.stringify(stored)).not.toContain('AAAAA')
  })

  test('the key does not change: an answer recorded now is found by the same call', async () => {
    const store = new SpyStore()
    const mock = new MockLanguageModelV4({ modelId: 'm1', doGenerate: withRequest() })
    await wrapLanguageModel({ model: mock, middleware: withReplay(store, 'record') }).doGenerate(params('q'))
    const rep = new MockLanguageModelV4({ modelId: 'm1', doGenerate: result('never') })
    const out = await wrapLanguageModel({ model: rep, middleware: withReplay(store, 'replay') }).doGenerate(params('q'))
    expect(rep.doGenerateCalls).toHaveLength(0)
    expect(out.content).toEqual([{ type: 'text', text: 'hi' }])
  })

  test('a row recorded before, which still holds the request, replays exactly as it did (generate and stream)', async () => {
    const store = new MemoryStore()
    const legacy = withRequest() as Record<string, unknown>
    await store.put(await replayKey('m1', params('q')), 'm1', legacy)
    const rep = new MockLanguageModelV4({ modelId: 'm1', doGenerate: result('never') })
    const out = await wrapLanguageModel({ model: rep, middleware: withReplay(store, 'replay') }).doGenerate(params('q'))
    expect(rep.doGenerateCalls).toHaveLength(0)
    expect(out).toEqual(legacy)

    const legacyStream = { chunks: CHUNKS, rest: { request: BIG_REQUEST, response: { id: 'r1' } } }
    await store.put(await replayKey('m1:stream', params('s')), 'm1', legacyStream)
    const { model, mock } = streamSetup('replay', store)
    const streamed = await model.doStream(params('s'))
    expect(mock.doStreamCalls).toHaveLength(0)
    expect(streamed.request).toEqual(BIG_REQUEST)
    expect(await drain(streamed.stream)).toEqual(CHUNKS)
  })
})

describe('in cache mode the store can never fail a call', () => {
  test('put throws: the result comes back, the model was called once, one line says what happened', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const mock = new MockLanguageModelV4({ modelId: 'm1', doGenerate: withRequest() })
    const model = wrapLanguageModel({ model: mock, middleware: withReplay(new SpyStore({ put: true }), 'cache') })
    const out = await model.doGenerate(params('q'))
    expect(out.content).toEqual([{ type: 'text', text: 'hi' }])
    expect(out.request).toEqual(BIG_REQUEST)
    expect(mock.doGenerateCalls).toHaveLength(1)
    expect(log).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith('recorded answer not saved, the answer is used: ai_replays write failed: canceling statement due to statement timeout')
  })

  test('get throws: the model is asked, the answer comes back, one line says what happened', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const store = new SpyStore({ get: true })
    const mock = new MockLanguageModelV4({ modelId: 'm1', doGenerate: result('fresh') })
    const model = wrapLanguageModel({ model: mock, middleware: withReplay(store, 'cache') })
    const out = await model.doGenerate(params('q'))
    expect(out.content).toEqual([{ type: 'text', text: 'fresh' }])
    expect(mock.doGenerateCalls).toHaveLength(1)
    expect(log).toHaveBeenCalledWith('recorded answer not read, the model is asked: ai_replays read failed: boom')
    // the answer is still stored after a failed read
    expect(store.puts).toHaveLength(1)
  })

  test('stream: put throws in flush and the stream still ends well; get throws and the model is asked', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const a = streamSetup('cache', new SpyStore({ put: true }))
    const out = await a.model.doStream(params('q'))
    expect(await drain(out.stream)).toEqual(CHUNKS)
    expect(a.mock.doStreamCalls).toHaveLength(1)
    expect(log).toHaveBeenCalledWith('recorded answer not saved, the answer is used: ai_replays write failed: canceling statement due to statement timeout')

    log.mockClear()
    const b = streamSetup('cache', new SpyStore({ get: true }))
    const again = await b.model.doStream(params('q'))
    expect(await drain(again.stream)).toEqual(CHUNKS)
    expect(b.mock.doStreamCalls).toHaveLength(1)
    expect(log).toHaveBeenCalledWith('recorded answer not read, the model is asked: ai_replays read failed: boom')
  })

  test('record: a failed put still throws, so a recording run never loses an answer silently', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const mock = new MockLanguageModelV4({ modelId: 'm1', doGenerate: result('hi') })
    const model = wrapLanguageModel({ model: mock, middleware: withReplay(new SpyStore({ put: true }), 'record') })
    await expect(model.doGenerate(params('q'))).rejects.toThrow(/ai_replays write failed/)
    expect(log).not.toHaveBeenCalled()
    // the stream in record mode too
    const { model: streamModel } = streamSetup('record', new SpyStore({ put: true }))
    const out = await streamModel.doStream(params('q'))
    await expect(drain(out.stream)).rejects.toThrow(/ai_replays write failed/)
  })

  test('replay: a failed get still throws', async () => {
    const mock = new MockLanguageModelV4({ modelId: 'm1', doGenerate: result('hi') })
    const model = wrapLanguageModel({ model: mock, middleware: withReplay(new SpyStore({ get: true }), 'replay') })
    await expect(model.doGenerate(params('q'))).rejects.toThrow(/ai_replays read failed/)
    expect(mock.doGenerateCalls).toHaveLength(0)
    const { model: streamModel } = streamSetup('replay', new SpyStore({ get: true }))
    await expect(streamModel.doStream(params('q'))).rejects.toThrow(/ai_replays read failed/)
  })

  test('live: the store is never used', async () => {
    const store = new SpyStore({ get: true, put: true })
    const mock = new MockLanguageModelV4({ modelId: 'm1', doGenerate: result('hi') })
    const out = await wrapLanguageModel({ model: mock, middleware: withReplay(store, 'live') }).doGenerate(params('q'))
    expect(out.content).toEqual([{ type: 'text', text: 'hi' }])
  })
})
