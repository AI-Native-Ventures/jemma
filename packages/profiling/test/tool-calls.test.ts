import { afterEach, describe, expect, test, vi } from 'vitest'
import { z } from 'zod'
import { MemoryStore } from '../src/ai'
import { defineTool, isWithImages, withImages, type ToolContext } from '../src/tools/context'

type Row = Record<string, unknown>

/** A db double that keeps every row inserted into any table. `reply` decides what an insert answers. */
function fakeDb(reply: () => { error: { message: string } | null } = () => ({ error: null })) {
  const inserted: { table: string; row: Row }[] = []
  const db = {
    from(table: string) {
      return {
        async insert(row: Row) {
          inserted.push({ table, row })
          return reply()
        },
      }
    },
  }
  return { db, inserted, calls: () => inserted.filter((i) => i.table === 'tool_calls').map((i) => i.row) }
}

const SCHOOL = '11111111-1111-4111-8111-111111111111'
const EVENT = '22222222-2222-4222-8222-222222222222'
const NOW = new Date('2026-11-10T09:30:00.000Z')

function ctxWith(db: unknown, extra: Partial<ToolContext> = {}): ToolContext {
  return {
    db: db as ToolContext['db'],
    schoolId: SCHOOL,
    eventId: null,
    env: { replayStore: new MemoryStore(), LLM_MODEL: 'test/model:free' },
    now: () => NOW,
    ...extra,
  }
}

const echo = defineTool({
  name: 'echo_tool',
  description: 'Test tool',
  input: z.object({ text: z.string(), eventId: z.string().optional() }),
  output: z.object({ said: z.string() }),
  async run(_ctx, { text }) {
    return { said: text }
  },
})

const boom = defineTool({
  name: 'boom_tool',
  description: 'Test tool that throws',
  input: z.object({ n: z.number() }),
  output: z.object({}),
  async run() {
    throw new Error('it broke')
  },
})

afterEach(() => vi.restoreAllMocks())

describe('defineTool logs every call', () => {
  test('a call that works saves one row with input, output, time and who ran it', async () => {
    const f = fakeDb()
    const out = await echo.run(ctxWith(f.db), { text: 'hello' })
    expect(out).toEqual({ said: 'hello' })
    expect(f.calls()).toHaveLength(1)
    expect(f.calls()[0]).toMatchObject({
      school_id: SCHOOL,
      event_id: null,
      server: 'jemma',
      tool: 'echo_tool',
      via: 'cloud',
      engine: null,
      model: 'test/model:free',
      input: { text: 'hello' },
      output: { said: 'hello' },
      ok: true,
      error: null,
      started_at: NOW.toISOString(),
    })
    expect(Number.isInteger(f.calls()[0]!.duration_ms)).toBe(true)
    expect(f.calls()[0]!.duration_ms as number).toBeGreaterThanOrEqual(0)
  })

  test('a call that throws saves a failed row and throws the same error again', async () => {
    const f = fakeDb()
    const err = await boom.run(ctxWith(f.db), { n: 1 }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toBe('it broke')
    expect(f.calls()).toHaveLength(1)
    expect(f.calls()[0]).toMatchObject({ tool: 'boom_tool', ok: false, error: 'it broke', output: null, input: { n: 1 } })
  })

  test('the tool keeps its name, description and schemas', () => {
    expect(echo.name).toBe('echo_tool')
    expect(echo.description).toBe('Test tool')
    expect(echo.input.parse({ text: 'x' })).toEqual({ text: 'x' })
  })

  test('the event comes from the context, or from the input when the context has none', async () => {
    const withCtxEvent = fakeDb()
    await echo.run(ctxWith(withCtxEvent.db, { eventId: EVENT }), { text: 'a', eventId: '33333333-3333-4333-8333-333333333333' })
    expect(withCtxEvent.calls()[0]!.event_id).toBe(EVENT)

    const fromInput = fakeDb()
    await echo.run(ctxWith(fromInput.db), { text: 'a', eventId: EVENT })
    expect(fromInput.calls()[0]!.event_id).toBe(EVENT)

    const notAUuid = fakeDb()
    await echo.run(ctxWith(notAUuid.db), { text: 'a', eventId: 'not-a-uuid' })
    expect(notAUuid.calls()[0]!.event_id).toBeNull()
  })

  test('via, engine and model come from the context', async () => {
    const f = fakeDb()
    await echo.run(ctxWith(f.db, { via: 'mcp', engine: 'claude', model: 'claude-test' }), { text: 'a' })
    expect(f.calls()[0]).toMatchObject({ via: 'mcp', engine: 'claude', model: 'claude-test' })

    const mcpNoModel = fakeDb()
    await echo.run(ctxWith(mcpNoModel.db, { via: 'mcp' }), { text: 'a' })
    expect(mcpNoModel.calls()[0]).toMatchObject({ via: 'mcp', engine: null, model: null })
  })
})

describe('what is stored is trimmed', () => {
  test('a string longer than 2000 characters becomes its length, at any depth', async () => {
    const f = fakeDb()
    const long = 'x'.repeat(5000)
    const exact = 'y'.repeat(2000)
    const tool = defineTool({
      name: 'long_tool',
      description: 'Test tool',
      input: z.object({ big: z.string(), nested: z.object({ list: z.array(z.string()) }), exact: z.string() }),
      output: z.object({ back: z.array(z.object({ text: z.string() })) }),
      async run(_ctx, input) {
        return { back: [{ text: input.big }] }
      },
    })
    await tool.run(ctxWith(f.db), { big: long, nested: { list: ['ok', long] }, exact })
    expect(f.calls()[0]!.input).toEqual({ big: '<5000 characters>', nested: { list: ['ok', '<5000 characters>'] }, exact })
    expect(f.calls()[0]!.output).toEqual({ back: [{ text: '<5000 characters>' }] })
  })

  test('image data is never stored: only the output and how many images', async () => {
    const f = fakeDb()
    const images = [
      { data: 'A'.repeat(3000), mimeType: 'image/png' },
      { data: 'B'.repeat(10), mimeType: 'image/jpeg' },
    ]
    const tool = defineTool({
      name: 'photo_tool',
      description: 'Test tool',
      input: z.object({ id: z.string() }),
      output: z.object({ pages: z.number() }),
      async run() {
        return withImages({ pages: 2 }, images)
      },
    })
    const res = await tool.run(ctxWith(f.db), { id: 'p' })
    expect(isWithImages(res)).toBe(true)
    expect((res as { images: unknown[] }).images).toBe(images)
    const stored = f.calls()[0]!
    expect(stored.output).toEqual({ output: { pages: 2 }, images: 2 })
    expect(JSON.stringify(stored)).not.toContain('AAAA')
    expect(JSON.stringify(stored)).not.toContain('image/png')
  })
})

describe('a logging failure never changes what the tool does', () => {
  test('an insert that answers with an error: same result, one console.error line', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const f = fakeDb(() => ({ error: { message: 'table missing' } }))
    const out = await echo.run(ctxWith(f.db), { text: 'still works' })
    expect(out).toEqual({ said: 'still works' })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(String(spy.mock.calls[0]![0])).toContain('echo_tool')
  })

  test('an insert that throws: same result', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = {
      from() {
        throw new Error('no such table')
      },
    }
    expect(await echo.run(ctxWith(db), { text: 'fine' })).toEqual({ said: 'fine' })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  test('a db with no from at all: same result', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await echo.run(ctxWith({}), { text: 'fine' })).toEqual({ said: 'fine' })
  })

  test('a failing tool still throws its own error when the log insert fails too', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const f = fakeDb(() => ({ error: { message: 'table missing' } }))
    await expect(boom.run(ctxWith(f.db), { n: 2 })).rejects.toThrow('it broke')
  })

  test('the tool is not run twice when the log fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const run = vi.fn(async () => ({ said: 'once' }))
    const tool = defineTool({ name: 'once_tool', description: 'Test tool', input: z.object({}), output: z.object({ said: z.string() }), run })
    const f = fakeDb(() => ({ error: { message: 'down' } }))
    await tool.run(ctxWith(f.db), {})
    expect(run).toHaveBeenCalledTimes(1)
  })
})

test('log_external_calls does not log a row of its own', async () => {
  const f = fakeDb()
  const tool = defineTool({
    name: 'log_external_calls',
    description: 'Test tool',
    input: z.object({}),
    output: z.object({ logged: z.number() }),
    async run() {
      return { logged: 0 }
    },
  })
  expect(await tool.run(ctxWith(f.db), {})).toEqual({ logged: 0 })
  expect(f.inserted).toEqual([])
})
