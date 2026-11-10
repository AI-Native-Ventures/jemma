import { describe, expect, test } from 'vitest'
import { measureRoundTrip, readOneSchool, waitForCalmLine } from '../../../evals/lib/line'
import type { JemmaDb } from '../../profiling/src/db'

describe('the database round trip', () => {
  test('is the median of three reads, in whole milliseconds', async () => {
    const steps = [1200, 300, 4100]
    let clock = 0
    let i = 0
    expect(await measureRoundTrip(async () => void (clock += steps[i++]!), 3, () => clock)).toBe(1200)
  })

  test('an even number of reads gives the middle of the two', async () => {
    const steps = [100, 300]
    let clock = 0
    let i = 0
    expect(await measureRoundTrip(async () => void (clock += steps[i++]!), 2, () => clock)).toBe(200)
  })

  test('a failed read throws instead of looking fast', async () => {
    const admin = { from: () => ({ select: () => ({ limit: async () => ({ error: { message: 'fetch failed' } }) }) }) } as unknown as JemmaDb
    await expect(readOneSchool(admin)).rejects.toThrow('fetch failed')
    await expect(measureRoundTrip(() => readOneSchool(admin), 3)).rejects.toThrow('the round trip read failed')
  })

  test('the read asks for one school id and nothing else', async () => {
    const asked: string[] = []
    const admin = {
      from: (table: string) => ({
        select: (cols: string) => ({
          limit: async (n: number) => {
            asked.push(`${table}:${cols}:${n}`)
            return { error: null }
          },
        }),
      }),
    } as unknown as JemmaDb
    await readOneSchool(admin)
    expect(asked).toEqual(['schools:id:1'])
  })
})

describe('waiting for a calm line before the real runs', () => {
  const run = (medians: number[]) => {
    const slept: number[] = []
    const log: string[] = []
    let i = 0
    const promise = waitForCalmLine({
      measure: async () => medians[Math.min(i++, medians.length - 1)]!,
      sleep: async (ms) => void slept.push(ms),
      log: (l) => log.push(l),
    })
    return { promise, slept, log }
  }

  test('a fast line starts at once, without waiting', async () => {
    const { promise, slept } = run([800])
    expect(await promise).toEqual({ medianMs: 800, waitedMs: 0, measurements: [800], startedAnyway: false })
    expect(slept).toEqual([])
  })

  test('exactly 3000 ms is not above the limit', async () => {
    const { promise, slept } = run([3000])
    expect((await promise).startedAnyway).toBe(false)
    expect(slept).toEqual([])
  })

  test('a slow line waits 10 minutes, measures again, and starts when it is fine', async () => {
    const { promise, slept, log } = run([5200, 4100, 900])
    const got = await promise
    expect(got).toMatchObject({ medianMs: 900, waitedMs: 20 * 60_000, startedAnyway: false })
    expect(got.measurements).toEqual([5200, 4100, 900])
    expect(slept).toEqual([600_000, 600_000])
    expect(log[0]).toContain('waiting 10 minutes')
  })

  test('a line that stays slow is waited on for one hour at most, then the runs start anyway and say so', async () => {
    const { promise, slept, log } = run([6000])
    const got = await promise
    expect(slept).toHaveLength(6)
    expect(got).toMatchObject({ medianMs: 6000, waitedMs: 60 * 60_000, startedAnyway: true })
    expect(got.measurements).toHaveLength(7)
    expect(log.at(-1)).toContain('starting anyway')
  })

  test('the limits can be changed: with no waiting allowed a slow line starts at once and says so', async () => {
    const slept: number[] = []
    const got = await waitForCalmLine({ measure: async () => 2500, sleep: async (ms) => void slept.push(ms), limitMs: 2000, maxWaitMs: 0 })
    expect(got).toMatchObject({ medianMs: 2500, waitedMs: 0, startedAnyway: true })
    expect(slept).toEqual([])
  })
})
