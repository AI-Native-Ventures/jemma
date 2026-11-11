import { describe, expect, test } from 'vitest'
import { providerErrorOf, refusalOf } from '../../../evals/lib/provider'
import { result } from './evals-fixtures'

/** What goose prints as its last message when the provider answered with an error (goose exits 0 even then). */
const HIGH_DEMAND =
  'Ran into this error: Server error: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.. Please retry if you think this is a transient or recoverable error.'

const attempt = (over: Record<string, unknown> = {}) => ({ model: 'm/x:free', seconds: 10, status: 'failed' as const, note: HIGH_DEMAND, saved: false, timedOut: false, tokens: null, ...over })

describe('a provider error that ended the agent run', () => {
  test('goose\'s "Server error" line is one, and the message is given without the framing', () => {
    expect(providerErrorOf(HIGH_DEMAND)).toBe('Server error: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.')
  })
  test('rate limits and a 429 or a 5xx status are provider errors', () => {
    expect(providerErrorOf('Ran into this error: Rate limit exceeded: free-models-per-min. Please retry if you think this is a transient or recoverable error.')).toMatch(/^Rate limit exceeded/)
    expect(providerErrorOf('Ran into this error: Request failed: Too many requests (429): slow down')).toMatch(/^Request failed: Too many requests \(429\)/)
    expect(providerErrorOf('Ran into this error: Request failed: Provider returned error (503)')).toMatch(/\(503\)/)
    expect(providerErrorOf('Ran into this error: Request failed: Bad gateway (502)')).toMatch(/\(502\)/)
  })
  test('a bad request, a wrong key, a model that talks about errors, and normal endings are not provider errors', () => {
    expect(providerErrorOf('Ran into this error: Request failed: Bad request (400): nvidia/this-model-does-not-exist:free is not a valid model ID...')).toBeNull()
    expect(providerErrorOf('Ran into this error: Authentication error: bad key')).toBeNull()
    expect(providerErrorOf("I've reached the maximum number of actions I can do without user input.")).toBeNull()
    expect(providerErrorOf('Job complete. The server error from the earlier call was fixed.')).toBeNull()
    expect(providerErrorOf('')).toBeNull()
  })
  test('a long message is cut at a word with three dots', () => {
    const long = `Ran into this error: Server error: ${'overloaded again and again '.repeat(30)}`
    const got = providerErrorOf(long)!
    expect(got.length).toBeLessThanOrEqual(240)
    expect(got.endsWith('...')).toBe(true)
  })
})

describe('refused or judged, from the saved result', () => {
  test('a run whose last attempt ended on a provider error is refused, with the message', () => {
    const r = result('class-report', 1, { pass: false, attempts: [attempt()] })
    expect(refusalOf(r)).toMatch(/^Server error: This model is currently experiencing high demand/)
  })
  test('the saved providerError field is used when the attempt has one, even if the note says nothing', () => {
    expect(refusalOf(result('class-report', 1, { pass: false, attempts: [attempt({ note: 'x', providerError: 'Rate limit exceeded: per minute' })] }))).toBe('Rate limit exceeded: per minute')
    expect(refusalOf(result('class-report', 1, { pass: false, attempts: [attempt({ providerError: null })] }))).toBeNull()
  })
  test('a first attempt that was refused does not make the run refused when a later one finished', () => {
    const r = result('class-report', 1, { attempts: [attempt(), attempt({ status: 'done', note: 'All finished.' })] })
    expect(refusalOf(r)).toBeNull()
  })
  test('a harness error, a timeout and a failed check are judged, not refused', () => {
    expect(refusalOf(result('class-report', 1, { pass: false, error: 'the sandbox could not be made', attempts: [] }))).toBeNull()
    expect(refusalOf(result('class-report', 1, { pass: false, attempts: [attempt({ note: 'goose timed out after 600 seconds', timedOut: true })] }))).toBeNull()
    expect(refusalOf(result('class-report', 1, { pass: false }))).toBeNull()
  })
  test('a run with no attempt at all is judged', () => {
    expect(refusalOf(result('class-report', 1, { attempts: [] }))).toBeNull()
  })
})
