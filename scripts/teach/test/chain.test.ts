import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import { Chain, DEFAULT_MODELS, LIMIT_PARK_MS, callJson, modelsFromEnv, type Attempt } from '../chain'
import type { RunResult, Runner } from '../opencode'

const MIN = 60_000

const clock = (start = 1_000_000) => {
  let t = start
  return { now: () => t, advance: (ms: number) => void (t += ms) }
}

const reply = (text: string, extra: Partial<RunResult> = {}): RunResult => ({ text, limited: false, ...extra })

/** A runner that answers each model from a script: a list of replies used in turn, the last one repeated. */
const scripted = (script: Record<string, RunResult[]>) => {
  const calls: string[] = []
  const used: Record<string, number> = {}
  const run: Runner = async (model) => {
    calls.push(model)
    const list = script[model] ?? [{ text: '', limited: false, error: 'no script' }]
    const i = used[model] ?? 0
    used[model] = i + 1
    return list[Math.min(i, list.length - 1)]!
  }
  return { run, calls }
}

const Shape = z.object({ n: z.number(), word: z.string() })

describe('Chain', () => {
  test('the default chain is the ranked list of the plan, best first, OpenCode free models only', () => {
    expect(DEFAULT_MODELS[0]).toBe('opencode/hy4-flash-free')
    expect(DEFAULT_MODELS).toHaveLength(10)
    for (const m of DEFAULT_MODELS) expect(m).toMatch(/^opencode\/[a-z0-9.-]+-free$/)
    for (const banned of ['iceman', 'big-pickle', 'jev-']) expect(DEFAULT_MODELS.join(',')).not.toContain(banned)
  })

  test('TEACH_MODELS overrides the default list', () => {
    expect(modelsFromEnv({ TEACH_MODELS: 'opencode/a-free, opencode/b-free' })).toEqual(['opencode/a-free', 'opencode/b-free'])
    expect(modelsFromEnv({})).toEqual(DEFAULT_MODELS)
    expect(modelsFromEnv({ TEACH_MODELS: '  ' })).toEqual(DEFAULT_MODELS)
  })

  test('TEACH_MODELS refuses a model that is not an OpenCode free model', () => {
    expect(() => modelsFromEnv({ TEACH_MODELS: 'openrouter/anthropic/claude-sonnet-5' })).toThrow(/OpenCode/)
    expect(() => modelsFromEnv({ TEACH_MODELS: 'opencode/big-pickle' })).toThrow(/not allowed/)
    expect(() => modelsFromEnv({ TEACH_MODELS: 'opencode/iceman-free' })).toThrow(/not allowed/)
  })

  test('next() returns the models in order and skips the excluded ones', () => {
    const c = new Chain(['a', 'b', 'c'])
    expect(c.next()).toBe('a')
    expect(c.next(['a'])).toBe('b')
    expect(c.next(['a', 'b'])).toBe('c')
    expect(c.next(['a', 'b', 'c'])).toBeNull()
  })

  test('a parked model is skipped until 60 minutes have passed', () => {
    const k = clock()
    const c = new Chain(['a', 'b'], k.now)
    c.park('a', LIMIT_PARK_MS)
    expect(LIMIT_PARK_MS).toBe(60 * MIN)
    expect(c.next()).toBe('b')
    k.advance(59 * MIN)
    expect(c.next()).toBe('b')
    k.advance(2 * MIN)
    expect(c.next()).toBe('a')
  })

  test('says when the first parked model comes back, so a long run can wait for it', () => {
    const k = clock()
    const c = new Chain(['a', 'b'], k.now)
    expect(c.nextAvailableAt()).toBeNull()
    c.park('a', 30 * MIN)
    c.park('b', 10 * MIN)
    expect(c.nextAvailableAt()).toBe(k.now() + 10 * MIN)
    expect(c.nextAvailableAt(['b'])).toBe(k.now() + 30 * MIN)
  })

  test('a model that fails four times in a row is parked for a while, and one success clears the count', () => {
    const k = clock()
    const c = new Chain(['a', 'b'], k.now)
    for (let i = 0; i < 3; i++) c.recordFailure('a')
    expect(c.next()).toBe('a')
    c.recordSuccess('a')
    for (let i = 0; i < 3; i++) c.recordFailure('a')
    expect(c.next()).toBe('a')
    c.recordFailure('a')
    expect(c.next()).toBe('b')
    k.advance(16 * MIN)
    expect(c.next()).toBe('a')
  })
})

describe('callJson', () => {
  test('returns the value of the first model that answers with valid JSON', async () => {
    const { run, calls } = scripted({ a: [reply('{"n":1,"word":"one"}')] })
    const out = await callJson(new Chain(['a', 'b']), 'prompt', Shape, { timeoutMs: 1000, run })
    expect(out).toEqual({ value: { n: 1, word: 'one' }, model: 'a' })
    expect(calls).toEqual(['a'])
  })

  test('a reply wrapped in prose or a code fence still counts', async () => {
    const { run } = scripted({ a: [reply('Sure!\n```json\n{"n":2,"word":"two"}\n```\nDone.')] })
    const out = await callJson(new Chain(['a']), 'prompt', Shape, { timeoutMs: 1000, run })
    expect(out?.value).toEqual({ n: 2, word: 'two' })
  })

  test('moves to the next model when the reply is not JSON, is cut off or fails the schema', async () => {
    const { run, calls } = scripted({
      a: [reply('I am sorry, I cannot help.')],
      b: [reply('{"n":1,"word":"one"')],
      c: [reply('{"n":"one","word":"one"}')],
      d: [reply('{"n":4,"word":"four"}')],
    })
    const attempts: Attempt[] = []
    const out = await callJson(new Chain(['a', 'b', 'c', 'd']), 'prompt', Shape, { timeoutMs: 1000, run, onAttempt: (x) => attempts.push(x) })
    expect(out).toEqual({ value: { n: 4, word: 'four' }, model: 'd' })
    expect(calls).toEqual(['a', 'b', 'c', 'd'])
    expect(attempts.map((x) => x.ok)).toEqual([false, false, false, true])
    expect(attempts[0]?.error).toMatch(/no JSON/i)
    expect(attempts[2]?.error).toMatch(/schema/i)
  })

  test('a limited model is parked for 60 minutes and the next model answers', async () => {
    const k = clock()
    const chain = new Chain(['a', 'b'], k.now)
    const { run, calls } = scripted({ a: [reply('', { limited: true })], b: [reply('{"n":1,"word":"x"}')] })
    const first = await callJson(chain, 'p', Shape, { timeoutMs: 1000, run })
    expect(first?.model).toBe('b')
    // a second call goes straight to b: a is parked and is not tried in a loop
    const second = await callJson(chain, 'p', Shape, { timeoutMs: 1000, run })
    expect(second?.model).toBe('b')
    expect(calls).toEqual(['a', 'b', 'b'])
    k.advance(61 * MIN)
    expect(chain.next()).toBe('a')
  })

  test('returns null when every model fails, and tries each model once', async () => {
    const { run, calls } = scripted({ a: [reply('nope')], b: [reply('', { limited: true })], c: [reply('', { error: 'timed out after 1s' })] })
    const out = await callJson(new Chain(['a', 'b', 'c']), 'p', Shape, { timeoutMs: 1000, run })
    expect(out).toBeNull()
    expect(calls).toEqual(['a', 'b', 'c'])
  })

  test('a preferred model is tried first when it is free, and the rest follow in rank order', async () => {
    const { run, calls } = scripted({ a: [reply('{"n":1,"word":"a"}')], b: [reply('nope')], c: [reply('{"n":3,"word":"c"}')] })
    const out = await callJson(new Chain(['a', 'b', 'c']), 'p', Shape, { timeoutMs: 1000, run, prefer: 'b' })
    expect(out?.model).toBe('a')
    expect(calls).toEqual(['b', 'a'])
    const parked = new Chain(['a', 'b'])
    parked.park('b', 1000)
    expect(parked.next([], 'b')).toBe('a')
  })

  test('never calls a model it was told to exclude', async () => {
    const { run, calls } = scripted({ a: [reply('{"n":1,"word":"a"}')], b: [reply('{"n":2,"word":"b"}')] })
    const out = await callJson(new Chain(['a', 'b']), 'p', Shape, { timeoutMs: 1000, run, exclude: ['a'] })
    expect(out?.model).toBe('b')
    expect(calls).toEqual(['b'])
  })

  test('a tool call or a crash of one model does not stop the run', async () => {
    const { run } = scripted({ a: [reply('{"n":1,"word":"a"}', { error: 'the model made a tool call (bash)' })], b: [reply('{"n":2,"word":"b"}')] })
    const out = await callJson(new Chain(['a', 'b']), 'p', Shape, { timeoutMs: 1000, run })
    expect(out?.model).toBe('b')
  })

  test('a runner that throws is a failed attempt, not a crash', async () => {
    const run: Runner = async (model) => {
      if (model === 'a') throw new Error('spawn exploded')
      return reply('{"n":9,"word":"z"}')
    }
    const out = await callJson(new Chain(['a', 'b']), 'p', Shape, { timeoutMs: 1000, run })
    expect(out?.model).toBe('b')
  })
})
