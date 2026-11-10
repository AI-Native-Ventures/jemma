import { describe, expect, test } from 'vitest'
import { parseFreePercent, waitForMemory } from '../../../evals/lib/memory'

describe('the memory guard', () => {
  test('reads the free percentage from the last line of memory_pressure', () => {
    expect(parseFreePercent('The system has 17179869184 (1048576 pages with a page size of 16384).\nSystem-wide memory free percentage: 54%\n')).toBe(54)
    expect(parseFreePercent('System-wide memory free percentage: 7%')).toBe(7)
  })
  test('text without the line gives null, not zero', () => {
    expect(parseFreePercent('')).toBeNull()
    expect(parseFreePercent('something else')).toBeNull()
  })

  const run = (readings: (number | null)[], startAt?: number) => {
    const slept: number[] = []
    const log: string[] = []
    let i = 0
    const promise = waitForMemory({ read: async () => readings[Math.min(i++, readings.length - 1)]!, sleep: async (ms) => void slept.push(ms), log: (l) => log.push(l), startAt })
    return { promise, slept, log }
  }

  test('starts at once at 30 percent or more', async () => {
    const a = run([30])
    expect(await a.promise).toEqual({ waits: 0, waitedMs: 0, lastPercent: 30 })
    expect(a.slept).toEqual([])
  })
  test('below 30 percent it sleeps 60 seconds and looks again until there is enough', async () => {
    const a = run([22, 28, 41])
    expect(await a.promise).toEqual({ waits: 2, waitedMs: 120_000, lastPercent: 41 })
    expect(a.slept).toEqual([60_000, 60_000])
    expect(a.log[0]).toContain('only 22%')
  })
  test('a machine that cannot be read (not a Mac) never waits', async () => {
    const a = run([null])
    expect(await a.promise).toEqual({ waits: 0, waitedMs: 0, lastPercent: null })
    expect(a.slept).toEqual([])
  })
})
