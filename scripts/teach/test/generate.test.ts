import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { TopicLessonsSchema, type TeachingLesson } from '@jemma/profiling/schemas'
import { Chain, FatalBackendError } from '../chain'
import { Generator, reportLines, scrubDashes } from '../generate'
import { ledgerPath, readLedger, summarize } from '../ledger'
import { capsReference } from '../sources'
import { topicFileNames, topicGroups, lessonPath } from '../topics'
import type { Runner } from '../opencode'
import { goodLesson, worked } from './fixtures'

const group = topicGroups().find((g) => g.grade === 6 && g.baseName === 'Common fractions')!
const fileName = topicFileNames([group]).get(group)!
const MIN = 60_000
const EM = String.fromCharCode(0x2014)

type Call = { model: string; kind: 'outline' | 'write' | 'rewrite' | 'review' }

type FakeOpts = {
  lessons?: number
  /** The lesson a writer returns for a position, and whether it is a rewrite. */
  write?: (position: number, rewrite: boolean) => TeachingLesson
  review?: (position: number, n: number) => { ok: boolean; problems: string[] }
  /** Models that answer "Free usage limit reached" for their first `n` calls. */
  limited?: Record<string, number>
  fence?: boolean
  /** Every call costs this much and reports cached tokens. */
  cost?: number
}

const badLesson = (position: number): TeachingLesson => {
  const lesson = goodLesson({ position })
  const blocks = lesson.blocks.map((b, i) => (i === 3 && b.kind === 'worked' ? { ...b, answer: '5/4' } : b))
  return { ...lesson, blocks }
}

function fake(opts: FakeOpts = {}) {
  const calls: Call[] = []
  const used: Record<string, number> = {}
  let reviews = 0
  const money = opts.cost ? { costUsd: opts.cost, tokensCached: 1500 } : {}
  const run: Runner = async (model, prompt) => {
    used[model] = (used[model] ?? 0) + 1
    if (used[model]! <= (opts.limited?.[model] ?? 0)) return { text: '', limited: true, error: 'Free usage limit reached' }
    const wrap = (o: unknown) => (opts.fence ? '```json\n' + JSON.stringify(o) + '\n```' : JSON.stringify(o))
    if (prompt.includes('# Task: plan the lessons of one topic')) {
      calls.push({ model, kind: 'outline' })
      const n = opts.lessons ?? 1
      return { text: wrap({ lessons: Array.from({ length: n }, (_, i) => ({ title: `Lesson ${i + 1} title`, objectives: [`You will be able to do thing ${i + 1}.`, 'You will be able to explain it.'] })) }), limited: false, tokensIn: 100, tokensOut: 50, ...money }
    }
    if (prompt.includes('# Task: write ONE full maths lesson')) {
      const position = Number(/This is lesson (\d+) of/.exec(prompt)![1])
      const rewrite = prompt.includes('fix every one')
      calls.push({ model, kind: rewrite ? 'rewrite' : 'write' })
      const lesson = (opts.write ?? ((p) => goodLesson({ position: p })))(position, rewrite)
      return { text: wrap(lesson), limited: false, tokensIn: 2000, tokensOut: 4000, ...money }
    }
    const position = Number(/Lesson (\d+) of/.exec(prompt)![1])
    calls.push({ model, kind: 'review' })
    reviews += 1
    return { text: wrap((opts.review ?? (() => ({ ok: true, problems: [] })))(position, reviews)), limited: false, ...money }
  }
  return { run, calls }
}

describe('generate', () => {
  let root: string
  let clock: number
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'teach-gen-'))
    clock = 1_000_000
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  const make = (f: ReturnType<typeof fake>, extra: Partial<ConstructorParameters<typeof Generator>[0]> = {}) =>
    new Generator({
      root,
      chain: new Chain(['opencode/a-free', 'opencode/b-free'], () => clock),
      run: f.run,
      reference: async (g) => capsReference(g),
      sleep: async (ms) => void (clock += ms),
      log: () => undefined,
      timeoutMs: 1000,
      maxWaitMs: 120 * MIN,
      ...extra,
    })
  const filePath = () => join(root, lessonPath(group, fileName))
  const failList = () => JSON.parse(readFileSync(join(root, 'content/lessons/fail-list.json'), 'utf8')) as { topics: { baseName: string; attempts: number }[]; lessons: { position: number; problems: string[] }[] }

  test('one topic end to end writes a valid TopicLessons file, one file for both term rows', async () => {
    const f = fake({ lessons: 2, fence: true })
    const g = make(f)
    const result = await g.generateTopic(group, fileName)
    expect(result).toMatchObject({ status: 'done', ready: 2, failed: 0 })
    const file = TopicLessonsSchema.parse(JSON.parse(readFileSync(filePath(), 'utf8')))
    expect(file).toMatchObject({ grade: 6, baseName: 'Common fractions', family: 'fractions', terms: [1, 4], capsNames: ['Common fractions'] })
    expect(file.lessons.map((l) => [l.position, l.title])).toEqual([[1, 'Lesson 1 title'], [2, 'Lesson 2 title']])
    expect(file.lessons[0]!.objectives[0]).toBe('You will be able to do thing 1.')
    expect(file.source.kind).toBe('caps')
    expect(file.status.map((s) => s.status)).toEqual(['ready', 'ready'])
    expect(file.status[0]).toMatchObject({ writer: 'opencode/a-free', reviewer: 'opencode/b-free' })
    expect(Date.parse(file.generatedAt)).not.toBeNaN()
    expect(existsSync(join(root, 'content/lessons/.progress'))).toBe(true)
    expect(existsSync(join(root, 'content/lessons/.progress', `g6-${fileName}.json`))).toBe(false)
  })

  test('the reviewer is never the writer, and every call is in the ledger', async () => {
    const f = fake()
    await make(f).generateTopic(group, fileName)
    const write = f.calls.find((c) => c.kind === 'write')!
    const review = f.calls.find((c) => c.kind === 'review')!
    expect(review.model).not.toBe(write.model)
    const ledger = readLedger(root)
    expect(ledger.map((l) => l.kind)).toEqual(['outline', 'write', 'review'])
    expect(ledger.every((l) => l.ok && l.grade === 6 && l.topic === 'Common fractions')).toBe(true)
    expect(ledger[1]).toMatchObject({ tokensIn: 2000, tokensOut: 4000 })
    expect(existsSync(ledgerPath(root))).toBe(true)
    expect(summarize(ledger).find((s) => s.model === 'opencode/a-free')).toMatchObject({ calls: 2, failures: 0, limited: 0 })
  })

  test('a lesson that fails the code checks is rewritten once by the same writer, then passes', async () => {
    const f = fake({ write: (p, rewrite) => (rewrite ? goodLesson({ position: p }) : badLesson(p)) })
    const result = await make(f).generateTopic(group, fileName)
    expect(result).toMatchObject({ status: 'done', ready: 1 })
    expect(f.calls.map((c) => c.kind)).toEqual(['outline', 'write', 'rewrite', 'review'])
    expect(f.calls[2]!.model).toBe(f.calls[1]!.model)
    expect(readLedger(root).map((l) => l.kind)).toEqual(['outline', 'write', 'rewrite', 'review'])
  })

  test('a reviewer that finds a problem sends the lesson back once, with the problem in the prompt', async () => {
    const prompts: string[] = []
    const base = fake({ review: (_p, n) => (n === 1 ? { ok: false, problems: ['block 4: 3/4 is wrong'] } : { ok: true, problems: [] }) })
    const run: Runner = async (m, p) => {
      prompts.push(p)
      return base.run(m, p, { timeoutMs: 1 })
    }
    const result = await make(base, { run }).generateTopic(group, fileName)
    expect(result).toMatchObject({ status: 'done', ready: 1 })
    expect(base.calls.map((c) => c.kind)).toEqual(['outline', 'write', 'review', 'rewrite', 'review'])
    expect(prompts.find((p) => p.includes('fix every one'))).toContain('block 4: 3/4 is wrong')
  })

  test('a lesson that fails twice ends failed and is in the fail list; the passing lessons are kept', async () => {
    const f = fake({ lessons: 2, write: (p) => (p === 2 ? badLesson(p) : goodLesson({ position: p })) })
    const result = await make(f).generateTopic(group, fileName)
    expect(result).toMatchObject({ status: 'partial', ready: 1, failed: 1 })
    const file = TopicLessonsSchema.parse(JSON.parse(readFileSync(filePath(), 'utf8')))
    expect(file.lessons.map((l) => l.position)).toEqual([1])
    expect(file.status.map((s) => [s.position, s.status])).toEqual([[1, 'ready'], [2, 'failed']])
    expect(file.status[1]!.problems.join(' ')).toMatch(/last step/)
    const list = failList()
    expect(list.lessons).toHaveLength(1)
    expect(list.lessons[0]).toMatchObject({ position: 2 })
    expect(list.topics).toEqual([])
  })

  test('when lesson 1 fails there is no file, and the topic is in the fail list', async () => {
    const f = fake({ lessons: 1, write: (p) => badLesson(p) })
    const result = await make(f).generateTopic(group, fileName)
    expect(result).toMatchObject({ status: 'failed', ready: 0, failed: 1 })
    expect(existsSync(filePath())).toBe(false)
    expect(failList().topics).toEqual([expect.objectContaining({ baseName: 'Common fractions', attempts: 1 })])
  })

  test('a topic that failed twice is not tried again unless asked', async () => {
    const f = fake({ write: (p) => badLesson(p) })
    await make(f).generateTopic(group, fileName)
    await make(f).generateTopic(group, fileName)
    expect(failList().topics[0]!.attempts).toBe(2)
    const before = f.calls.length
    const third = await make(f).generateTopic(group, fileName)
    expect(third.status).toBe('skipped')
    expect(f.calls.length).toBe(before)
    const forced = await make(f, { retryFailed: true }).generateTopic(group, fileName)
    expect(forced.status).toBe('failed')
    expect(f.calls.length).toBeGreaterThan(before)
  })

  test('--retry-failed writes again only the failed lessons and keeps the ready ones as they are', async () => {
    const first = fake({ lessons: 2, write: (p) => (p === 2 ? badLesson(p) : goodLesson({ position: p })) })
    await make(first).generateTopic(group, fileName)
    const before = TopicLessonsSchema.parse(JSON.parse(readFileSync(filePath(), 'utf8')))
    expect(before.lessons).toHaveLength(1)
    expect(failList().lessons[0]).toMatchObject({ position: 2, title: 'Lesson 2 title' })

    const second = fake({ lessons: 2 })
    const plain = await make(second).generateTopic(group, fileName)
    expect(plain.status).toBe('skipped')
    expect(second.calls).toEqual([])

    const retry = await make(second, { retryFailed: true }).generateTopic(group, fileName)
    expect(retry).toMatchObject({ status: 'done', ready: 2, failed: 0 })
    expect(second.calls.map((c) => c.kind)).toEqual(['write', 'review'])
    const after = TopicLessonsSchema.parse(JSON.parse(readFileSync(filePath(), 'utf8')))
    expect(after.lessons.map((l) => [l.position, l.title])).toEqual([[1, 'Lesson 1 title'], [2, 'Lesson 2 title']])
    expect(after.lessons[0]).toEqual(before.lessons[0])
    expect(failList().lessons).toEqual([])

    const again = await make(second, { retryFailed: true }).generateTopic(group, fileName)
    expect(again.status).toBe('skipped')
  })

  test('a model that fails at once for another reason is not called in a loop while another model rests', async () => {
    let boom = 0
    const run: Runner = async (model) => {
      if (model === 'opencode/a-free') return { text: '', limited: true, error: 'Free usage limit reached' }
      boom += 1
      return { text: '', limited: false, error: 'exit code 1' }
    }
    const result = await make(fake(), { run, chain: new Chain(['opencode/a-free', 'opencode/b-free'], () => clock) }).generateTopic(group, fileName)
    expect(result.status).toBe('failed')
    expect(boom).toBeLessThan(5)
  })

  test('a restarted run does not ask again a model that said "limit reached" less than an hour ago, and does after an hour', () => {
    const f = fake()
    const lineAt = (model: string, minutesAgo: number, limited: boolean) =>
      JSON.stringify({ time: new Date(Date.now() - minutesAgo * MIN).toISOString(), model, kind: 'probe', seconds: 0, ok: !limited, limited })
    mkdirSync(join(root, 'content/lessons'), { recursive: true })
    writeFileSync(ledgerPath(root), [lineAt('opencode/a-free', 10, true), lineAt('opencode/b-free', 90, true), lineAt('opencode/c-free', 20, true), lineAt('opencode/c-free', 5, false)].join('\n') + '\n')
    const chain = new Chain(['opencode/a-free', 'opencode/b-free', 'opencode/c-free'], () => clock)
    make(f, { chain })
    expect(chain.next()).toBe('opencode/b-free')
    expect(chain.next(['opencode/b-free'])).toBe('opencode/c-free')
    clock += 51 * MIN
    expect(chain.next()).toBe('opencode/a-free')
  })

  test('one topic that breaks does not end the run', async () => {
    const f = fake()
    const second = topicGroups().find((g) => g.grade === 6 && g.baseName === 'Decimal fractions')!
    const g = make(f, { reference: async (x) => (x === group ? Promise.reject(new Error('disk full')) : capsReference(x)) })
    const summary = await g.runAll([group, second])
    expect(summary).toMatchObject({ failed: 1, done: 1 })
  })

  test('--max-lessons cuts the outline', async () => {
    const f = fake({ lessons: 4 })
    const result = await make(f, { maxLessons: 2 }).generateTopic(group, fileName)
    expect(result).toMatchObject({ status: 'done', ready: 2 })
    expect(f.calls.filter((c) => c.kind === 'write')).toHaveLength(2)
  })

  test('the ledger holds the cost and the cached tokens of every call, and the report adds them up per model and per kind', async () => {
    const f = fake({ cost: 0.01 })
    await make(f).generateTopic(group, fileName)
    const ledger = readLedger(root)
    expect(ledger.every((l) => l.costUsd === 0.01 && l.tokensCached === 1500)).toBe(true)
    const lines = reportLines(ledger)
    expect(lines[0]).toBe('calls in the ledger: 3, $0.03 in all')
    expect(lines.join('\n')).toMatch(/kind write: 1 calls.*2000 in \(1500 cached\), 4000 out, \$0.01/)
    expect(lines.join('\n')).toMatch(/kind review: 1 calls/)
    expect(summarize(ledger).reduce((n, s) => n + s.usd, 0)).toBeCloseTo(0.03, 6)
  })

  test('--max-usd stops the run when the ledger holds that many dollars, and says so', async () => {
    const f = fake({ lessons: 3, cost: 0.4 })
    const g = make(f, { maxUsd: 1 })
    const result = await g.generateTopic(group, fileName)
    expect(result.status).toBe('stopped')
    expect(result.reason).toMatch(/budget of \$1/)
    expect(g.budgetReached).toBe(true)
    expect(f.calls).toHaveLength(3)
    expect(readLedger(root)).toHaveLength(3)
    expect(g.spent()).toBeCloseTo(1.2, 6)
    expect(existsSync(filePath())).toBe(false)
    // a later run with a higher budget carries on from the saved lessons; the dollars already spent still count
    const more = make(f, { maxUsd: 5 })
    expect((await more.generateTopic(group, fileName)).status).toBe('done')
    const strict = make(fake({ cost: 0.4 }), { maxUsd: 1.2 })
    expect(strict.spent()).toBeGreaterThanOrEqual(1.2)
  })

  test('the budget counts the dollars of every earlier run, and a run with no cost keeps going', async () => {
    const f = fake({ lessons: 2 })
    const g = make(f, { maxUsd: 0.5 })
    expect((await g.generateTopic(group, fileName)).status).toBe('done')
    expect(g.budgetReached).toBe(false)
  })

  test('a backend that cannot go on (no credit, key refused) stops the run and keeps what was done', async () => {
    let n = 0
    const run: Runner = async (model, prompt) => {
      n += 1
      if (n >= 3) throw new FatalBackendError('OpenRouter says payment is required: no credit is left on the key')
      return fake({ lessons: 2 }).run(model, prompt, { timeoutMs: 1 })
    }
    const g = make(fake(), { run })
    const result = await g.generateTopic(group, fileName)
    expect(result.status).toBe('stopped')
    expect(result.reason).toMatch(/payment is required/)
    expect(g.stopReason).toMatch(/payment/)
    expect(existsSync(join(root, 'content/lessons/fail-list.json'))).toBe(false)
  })

  test('a model rests as long as the chain says: two minutes on a paid rate limit', async () => {
    const f = fake({ limited: { 'opencode/a-free': 1 } })
    const chain = new Chain(['opencode/a-free', 'opencode/b-free'], () => clock, 2 * MIN)
    await make(f, { chain }).generateTopic(group, fileName)
    expect(f.calls[0]!.model).toBe('opencode/b-free')
    expect(chain.next()).toBe('opencode/a-free')
  })

  test('a second run skips the finished topic and makes no call', async () => {
    const f = fake()
    await make(f).generateTopic(group, fileName)
    const calls = f.calls.length
    const again = await make(f).generateTopic(group, fileName)
    expect(again.status).toBe('skipped')
    expect(f.calls.length).toBe(calls)
  })

  test('a model that is out of free quota is parked for an hour, never retried in a loop, and the next model takes over', async () => {
    const f = fake({ limited: { 'opencode/a-free': 99 } })
    const chain = new Chain(['opencode/a-free', 'opencode/b-free', 'opencode/c-free'], () => clock)
    const result = await make(f, { chain }).generateTopic(group, fileName)
    expect(result.status).toBe('done')
    expect(f.calls.map((c) => c.model)).toEqual(['opencode/b-free', 'opencode/b-free', 'opencode/c-free'])
    const ledger = readLedger(root)
    expect(ledger.filter((l) => l.limited)).toHaveLength(1)
    expect(chain.next()).toBe('opencode/b-free')
    clock += 61 * MIN
    expect(chain.next()).toBe('opencode/a-free')
  })

  test('when every model is limited the run waits until the first one is back, then goes on', async () => {
    const f = fake({ limited: { 'opencode/a-free': 1, 'opencode/b-free': 1 } })
    const slept: number[] = []
    const result = await make(f, { sleep: async (ms) => void (slept.push(ms), (clock += ms)) }).generateTopic(group, fileName)
    expect(result.status).toBe('done')
    expect(slept.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(60 * MIN)
    expect(slept.every((ms) => ms <= 5 * MIN)).toBe(true)
  })

  test('when every model is limited and waiting is not allowed the topic stops, is not failed, and keeps no fail-list entry', async () => {
    const f = fake({ limited: { 'opencode/a-free': 99, 'opencode/b-free': 99 } })
    const result = await make(f, { maxWaitMs: 0 }).generateTopic(group, fileName)
    expect(result).toMatchObject({ status: 'stopped' })
    expect(result.reason).toMatch(/limit/i)
    expect(existsSync(join(root, 'content/lessons/fail-list.json'))).toBe(false)
    expect(existsSync(filePath())).toBe(false)
  })

  test('the call cap stops the run, and the next run continues from the saved lessons without asking for the outline again', async () => {
    const f = fake({ lessons: 2 })
    const first = make(f, { limitCalls: 3 })
    const stopped = await first.generateTopic(group, fileName)
    expect(stopped.status).toBe('stopped')
    expect(first.capReached).toBe(true)
    expect(readLedger(root)).toHaveLength(3)
    expect(existsSync(filePath())).toBe(false)
    const second = await make(f, { limitCalls: 20 }).generateTopic(group, fileName)
    expect(second).toMatchObject({ status: 'done', ready: 2 })
    expect(f.calls.map((c) => c.kind)).toEqual(['outline', 'write', 'review', 'write', 'review'])
    expect(TopicLessonsSchema.parse(JSON.parse(readFileSync(filePath(), 'utf8'))).lessons).toHaveLength(2)
  })

  test('the cap counts calls already in the ledger, including a hand made one', async () => {
    const f = fake()
    const g = make(f, { limitCalls: 1 })
    g.addProbe({ model: 'opencode/a-free', ok: false, limited: true, error: 'Free usage limit reached' })
    expect(readLedger(root).map((l) => l.kind)).toEqual(['probe'])
    const result = await g.generateTopic(group, fileName)
    expect(result.status).toBe('stopped')
    expect(f.calls).toEqual([])
  })

  test('runAll works through the groups with a pool and returns a summary', async () => {
    const f = fake()
    const second = topicGroups().find((g) => g.grade === 6 && g.baseName === 'Decimal fractions')!
    const groups = [group, second]
    const g = make(f, { concurrency: 2 })
    const summary = await g.runAll(groups)
    expect(summary).toMatchObject({ done: 2, skipped: 0, failed: 0, partial: 0, stopped: 0 })
    const again = await make(f, { concurrency: 2 }).runAll(groups)
    expect(again).toMatchObject({ done: 0, skipped: 2 })
  })

  test('a model that writes an em dash, a wrong position or a wrong title is put right by code', async () => {
    const f = fake({ write: (p) => ({ ...goodLesson({ position: 7, title: 'My own title' }), summary: [`Add ${EM} then check`, 'Keep the bottom.', 'Check it.'] }) })
    await make(f).generateTopic(group, fileName)
    const file = TopicLessonsSchema.parse(JSON.parse(readFileSync(filePath(), 'utf8')))
    expect(file.lessons[0]).toMatchObject({ position: 1, title: 'Lesson 1 title' })
    expect(JSON.stringify(file)).not.toContain(EM)
  })

  test('scrubDashes turns the long dashes into plain ones, deep inside a value', () => {
    expect(scrubDashes({ a: [`one ${EM} two`, `three${EM}four`, { b: `5${String.fromCharCode(0x2013)}10` }] })).toEqual({ a: ['one - two', 'three - four', { b: '5-10' }] })
  })

  test('worked fixture sanity: the bad lesson really fails a check', () => {
    expect(worked(1, 2, 4).kind).toBe('worked')
    expect(badLesson(1).blocks[3]).toMatchObject({ answer: '5/4' })
  })
})
