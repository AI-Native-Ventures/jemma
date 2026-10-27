import { afterAll, beforeAll, expect, test } from 'vitest'
import { detectAgents } from '../src'
import { useFakes } from './helpers'

let restore: () => void
beforeAll(() => {
  restore = useFakes()
})
afterAll(() => restore())

test('detects installed agents and versions', async () => {
  const found = await detectAgents()
  expect(found.claude).toEqual({ installed: true, version: '9.9.9', signedIn: true })
  expect(found.codex).toEqual({ installed: true, version: '9.9.9', signedIn: true })

  process.env.FAKE_SIGNED_IN = 'no'
  const out = await detectAgents()
  expect(out.claude.signedIn).toBe(false)
  expect(out.codex.signedIn).toBe(false)
  delete process.env.FAKE_SIGNED_IN
})

test('a missing agent is reported as not installed', async () => {
  const saved = process.env.PATH
  process.env.PATH = '/nonexistent-dir'
  try {
    const found = await detectAgents({ extraDirs: [] })
    expect(found.claude).toEqual({ installed: false, version: null, signedIn: false })
    expect(found.codex).toEqual({ installed: false, version: null, signedIn: false })
  } finally {
    process.env.PATH = saved
  }
})
