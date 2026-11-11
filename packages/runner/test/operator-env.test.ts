import { expect, test } from 'vitest'
import { OPERATOR_SCRUBBED_KEYS, operatorScrubKeys, prepareOperatorEnv } from '../src/operator-env'

// The operator script starts an agent with this process's environment. No database, no network, no agent: plain objects
// stand in for the process environment, and no value here is a real key.

const FAKE_KEY = 'fake-openrouter-value'

/** A stand-in for `process.env` that holds every name the operator removes, plus one it must leave alone. */
const processLike = (): NodeJS.ProcessEnv => ({
  ...Object.fromEntries(OPERATOR_SCRUBBED_KEYS.map((key) => [key, `fake-${key}`])),
  PATH: '/usr/bin',
})

test('claude and codex scrub every provider key, every Supabase name and the secrets, openrouter included', () => {
  for (const agent of ['claude', 'codex'] as const) {
    const keys = operatorScrubKeys(agent)
    for (const name of ['OPENROUTER_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'ANTHROPIC_API_KEY', 'EVENTS_SECRET']) {
      expect(keys, `${agent} scrubs ${name}`).toContain(name)
    }
    expect(keys).toEqual(OPERATOR_SCRUBBED_KEYS)
  }
})

test('goose scrubs the same names except OPENROUTER_API_KEY', () => {
  const keys = operatorScrubKeys('goose')
  expect(keys).not.toContain('OPENROUTER_API_KEY')
  for (const name of ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL', 'SUPABASE_DB_URL', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'EVENTS_SECRET']) {
    expect(keys, `goose still scrubs ${name}`).toContain(name)
  }
  expect(keys).toEqual(OPERATOR_SCRUBBED_KEYS.filter((key) => key !== 'OPENROUTER_API_KEY'))
})

test('operatorScrubKeys hands out a copy: changing it does not change the list', () => {
  const copy = operatorScrubKeys('claude')
  copy.length = 0
  expect(operatorScrubKeys('claude')).toEqual(OPERATOR_SCRUBBED_KEYS)
  expect(OPERATOR_SCRUBBED_KEYS.length).toBeGreaterThan(0)
})

test('goose with a key that is only in the merged env: the key stays in the process environment, the others are removed', () => {
  const processEnv = processLike()
  delete processEnv.OPENROUTER_API_KEY // the key is in .env.local only, not in the shell
  prepareOperatorEnv({ OPENROUTER_API_KEY: FAKE_KEY }, processEnv, 'goose')
  expect(processEnv.OPENROUTER_API_KEY).toBe(FAKE_KEY)
  expect(processEnv.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined()
  expect(processEnv.ANTHROPIC_API_KEY).toBeUndefined()
  expect(processEnv.OPENAI_API_KEY).toBeUndefined()
  expect(processEnv.EVENTS_SECRET).toBeUndefined()
  expect(processEnv.PATH).toBe('/usr/bin') // a name that is not on the list is left alone
})

test('goose uses the key of the merged env even when the shell has another one', () => {
  const processEnv = processLike()
  prepareOperatorEnv({ OPENROUTER_API_KEY: FAKE_KEY }, processEnv, 'goose')
  expect(processEnv.OPENROUTER_API_KEY).toBe(FAKE_KEY)
})

test('goose without a key, or with a blank one, throws the plain message', () => {
  const message = 'set OPENROUTER_API_KEY in .env.local: goose needs a (free) OpenRouter key'
  expect(() => prepareOperatorEnv({}, processLike(), 'goose')).toThrow(message)
  expect(() => prepareOperatorEnv({ OPENROUTER_API_KEY: '' }, processLike(), 'goose')).toThrow(message)
  expect(() => prepareOperatorEnv({ OPENROUTER_API_KEY: '   ' }, processLike(), 'goose')).toThrow(message)
  expect(() => prepareOperatorEnv({ OPENROUTER_API_KEY: undefined }, processLike(), 'goose')).toThrow(message)
})

test('claude and codex remove the key from the process environment, even when it was set in both places', () => {
  for (const agent of ['claude', 'codex'] as const) {
    const processEnv = processLike()
    prepareOperatorEnv({ OPENROUTER_API_KEY: FAKE_KEY }, processEnv, agent)
    expect(processEnv.OPENROUTER_API_KEY, agent).toBeUndefined()
    expect('OPENROUTER_API_KEY' in processEnv, agent).toBe(false)
    expect(processEnv.SUPABASE_SERVICE_ROLE_KEY, agent).toBeUndefined()
    expect(processEnv.PATH, agent).toBe('/usr/bin')
  }
})

test('claude and codex need no OpenRouter key at all', () => {
  for (const agent of ['claude', 'codex'] as const) expect(() => prepareOperatorEnv({}, processLike(), agent)).not.toThrow()
})
