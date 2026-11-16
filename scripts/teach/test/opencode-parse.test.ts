import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, test } from 'vitest'
import { extractJson, readEvents, runOpencode } from '../opencode'

describe('extractJson', () => {
  test('returns the object from plain JSON', () => {
    expect(extractJson('{"ok":true,"problems":[]}')).toEqual({ ok: true, problems: [] })
  })

  test('returns the object from a ```json fence', () => {
    expect(extractJson('```json\n{"a":1,"b":[1,2]}\n```')).toEqual({ a: 1, b: [1, 2] })
  })

  test('returns the object from a fence with no language', () => {
    expect(extractJson('```\n{"a":1}\n```')).toEqual({ a: 1 })
  })

  test('returns the object from prose before and after it', () => {
    expect(extractJson('Here is the lesson you asked for:\n{"title":"Fractions","n":3}\nHope it helps!')).toEqual({ title: 'Fractions', n: 3 })
  })

  test('is not fooled by braces and quotes inside strings', () => {
    expect(extractJson('Sure. {"text":"use { and } and \\"quotes\\" here","n":1} done')).toEqual({ text: 'use { and } and "quotes" here', n: 1 })
  })

  test('returns null for cut-off JSON', () => {
    expect(extractJson('{"title":"Fractions","blocks":[{"kind":"explain","text":"A frac')).toBeNull()
  })

  test('returns null for text with no JSON and for an empty reply', () => {
    expect(extractJson('I cannot do that.')).toBeNull()
    expect(extractJson('')).toBeNull()
  })

  test('skips a stray brace pair that is not JSON and finds the object after it', () => {
    expect(extractJson('Use {x} like this: {"a":1}')).toEqual({ a: 1 })
  })
})

describe('readEvents', () => {
  const lines = [
    JSON.stringify({ type: 'step_start', part: { type: 'step-start' } }),
    JSON.stringify({ type: 'text', part: { type: 'text', text: '{"a":' } }),
    JSON.stringify({ type: 'text', part: { type: 'text', text: '1}' } }),
    JSON.stringify({ type: 'step_finish', part: { type: 'step-finish', tokens: { input: 120, output: 30, reasoning: 5 } } }),
  ].join('\n')

  test('joins the text parts and reads the tokens', () => {
    const r = readEvents(lines)
    expect(r.text).toBe('{"a":1}')
    expect(r.tokensIn).toBe(120)
    // output (30) plus reasoning (5): the ledger counts everything the model wrote
    expect(r.tokensOut).toBe(35)
    expect(r.toolCalls).toEqual([])
  })

  test('reports a tool call so a run with tools can be refused', () => {
    const r = readEvents(lines + '\n' + JSON.stringify({ type: 'tool_use', part: { type: 'tool', tool: 'bash' } }))
    expect(r.toolCalls).toEqual(['bash'])
  })

  test('reads an error event', () => {
    const r = readEvents(JSON.stringify({ type: 'error', error: { name: 'APIError', data: { message: 'boom' } } }))
    expect(r.error).toContain('boom')
  })

  test('a text part counts even when the event has another name', () => {
    expect(readEvents(JSON.stringify({ type: 'message.part.updated', part: { type: 'text', text: '{"a":2}' } })).text).toBe('{"a":2}')
  })

  test('a part sent again as it grows replaces its earlier text', () => {
    const lines = [
      JSON.stringify({ type: 'text', part: { id: 'p1', type: 'text', text: '{"a":' } }),
      JSON.stringify({ type: 'text', part: { id: 'p1', type: 'text', text: '{"a":1}' } }),
    ].join('\n')
    expect(readEvents(lines).text).toBe('{"a":1}')
  })

  test('reasoning parts are not part of the reply', () => {
    const r = readEvents([JSON.stringify({ type: 'reasoning', part: { type: 'reasoning', text: 'thinking {"x":1}' } }), JSON.stringify({ type: 'text', part: { type: 'text', text: '{"a":1}' } })].join('\n'))
    expect(r.text).toBe('{"a":1}')
  })

  test('ignores lines that are not JSON', () => {
    expect(readEvents('not json\n' + lines).text).toBe('{"a":1}')
  })
})

describe('runOpencode with a fake opencode', () => {
  const dir = mkdtempSync(join(tmpdir(), 'teach-fake-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  const fake = (name: string, body: string) => {
    const file = join(dir, name)
    writeFileSync(file, `#!/usr/bin/env node\n${body}\n`)
    chmodSync(file, 0o755)
    return file
  }

  test('reads the reply of a normal run and passes the prompt as an attached file', async () => {
    const bin = fake(
      'ok.cjs',
      `const fs = require('node:fs')
const args = process.argv.slice(2)
const file = args[args.indexOf('-f') + 1]
const prompt = fs.readFileSync(file, 'utf8')
const out = (o) => console.log(JSON.stringify(o))
out({ type: 'text', part: { type: 'text', text: JSON.stringify({ echoed: prompt, args: args.filter((a) => a.startsWith('--') || a === '-m' || a === 'opencode/fake-free'), cwd: process.cwd(), pwd: process.env.PWD, cfg: process.env.XDG_CONFIG_HOME, env: { data: process.env.XDG_DATA_HOME, state: process.env.XDG_STATE_HOME, claudeOff: process.env.OPENCODE_DISABLE_CLAUDE_CODE, config: process.env.OPENCODE_CONFIG } }) } })
out({ type: 'step_finish', part: { type: 'step-finish', tokens: { input: 11, output: 7 } } })`,
    )
    const r = await runOpencode('opencode/fake-free', 'hello prompt', { timeoutMs: 20_000, bin })
    expect(r.limited).toBe(false)
    expect(r.error).toBeUndefined()
    expect(r.tokensIn).toBe(11)
    expect(r.tokensOut).toBe(7)
    const got = JSON.parse(r.text) as { echoed: string; args: string[]; cfg: string; cwd: string; pwd: string; env: Record<string, string | undefined> }
    expect(got.echoed).toBe('hello prompt')
    expect(got.args).toEqual(expect.arrayContaining(['--pure', '--format', '--title', '-m', 'opencode/fake-free']))
    expect(got.cfg).not.toContain('.config')
    // OpenCode resolves the attached file from $PWD: it must be the folder the child runs in
    expect(got.pwd).toBe(got.cwd)
    expect(got.env).toMatchObject({ data: expect.stringContaining('teach-oc-'), state: expect.stringContaining('teach-oc-'), claudeOff: '1' })
    expect(got.env.config).toBeUndefined()
  })

  test('a limited model is stopped at once and reported as limited', async () => {
    const bin = fake(
      'limited.cjs',
      `console.error('timestamp=x level=ERROR message="stream error" error.error="AI_APICallError: Free usage limit reached. Free models work in OpenCode"')
setTimeout(() => {}, 60000)`,
    )
    const t0 = Date.now()
    const r = await runOpencode('opencode/fake-free', 'p', { timeoutMs: 30_000, bin })
    expect(r.limited).toBe(true)
    expect(Date.now() - t0).toBeLessThan(10_000)
  })

  test('a limit message split over two chunks is still read, and a timeout does not hide a limit', async () => {
    const bin = fake(
      'split.cjs',
      `process.stderr.write('level=ERROR message="stream error" error.error="AI_APICallError: Free usage li')
setTimeout(() => process.stderr.write('mit reached. Free models work"\\n'), 150)
setTimeout(() => {}, 60000)`,
    )
    const r = await runOpencode('opencode/fake-free', 'p', { timeoutMs: 20_000, bin })
    expect(r.limited).toBe(true)
  })

  test('a grandchild that keeps the pipes open does not hold the call for ever', async () => {
    const bin = fake(
      'grandchild.cjs',
      `const { spawn } = require('node:child_process')
spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'inherit', detached: false })
console.log(JSON.stringify({ type: 'text', part: { type: 'text', text: '{"a":1}' } }))
process.exit(0)`,
    )
    const t0 = Date.now()
    const r = await runOpencode('opencode/fake-free', 'p', { timeoutMs: 20_000, bin })
    expect(r.text).toBe('{"a":1}')
    expect(Date.now() - t0).toBeLessThan(10_000)
  })

  test('a run that takes too long is killed and reported', async () => {
    const bin = fake('slow.cjs', `setTimeout(() => {}, 60000)`)
    const t0 = Date.now()
    const r = await runOpencode('opencode/fake-free', 'p', { timeoutMs: 600, bin })
    expect(r.limited).toBe(false)
    expect(r.error).toMatch(/timed out/)
    expect(Date.now() - t0).toBeLessThan(10_000)
  })

  test('a run that makes a tool call is refused', async () => {
    const bin = fake(
      'tool.cjs',
      `console.log(JSON.stringify({ type: 'tool_use', part: { type: 'tool', tool: 'read' } }))
console.log(JSON.stringify({ type: 'text', part: { type: 'text', text: '{"a":1}' } }))`,
    )
    const r = await runOpencode('opencode/fake-free', 'p', { timeoutMs: 20_000, bin })
    expect(r.error).toMatch(/tool call/)
  })

  test('a binary that exits with an error reports it', async () => {
    const bin = fake('fail.cjs', `console.error('Error: model not found'); process.exit(1)`)
    const r = await runOpencode('opencode/fake-free', 'p', { timeoutMs: 20_000, bin })
    expect(r.limited).toBe(false)
    expect(r.error).toMatch(/model not found/)
  })
})
