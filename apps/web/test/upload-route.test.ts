// @vitest-environment node
import { redirect } from 'next/navigation'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { handleUpload, takes, type UploadFn } from '../lib/upload-route'

// The shared handler of the two upload routes (/t/upload and /p/upload). It reads no cookie and does no sign-in check: the
// functions it calls do their own, exactly as when they were form actions. What it adds is the origin check a form action had
// built in, and the plain JSON answer the browser reads.

const HOST = 'jemma.example'
const ORIGIN = `https://${HOST}`

type Opts = { origin?: string | null; host?: string; forwardedHost?: string; method?: string; contentType?: string | null; action?: string | null; args?: unknown; files?: File[]; extra?: Record<string, string> }

/** A request as the browser sends it: multipart, with the origin of the page that posted it. */
function post(opts: Opts = {}): Request {
  const { origin = ORIGIN, host = HOST, forwardedHost, method = 'POST', contentType, action = 'save', args = ['class-1'], files = [], extra = {} } = opts
  const headers = new Headers({ host })
  if (origin !== null) headers.set('origin', origin)
  if (forwardedHost) headers.set('x-forwarded-host', forwardedHost)
  const form = new FormData()
  if (action !== null) form.set('__action', action)
  if (args !== null) form.set('__args', typeof args === 'string' ? args : JSON.stringify(args))
  for (const [k, v] of Object.entries(extra)) form.set(k, v)
  for (const f of files) form.append('file', f)
  if (method === 'GET') return new Request(`${ORIGIN}/t/upload`, { method, headers })
  if (contentType !== undefined) {
    // a body that is not multipart: the content type is the only thing that differs
    if (contentType !== null) headers.set('content-type', contentType)
    return new Request(`${ORIGIN}/t/upload`, { method, headers, body: '{"a":1}' })
  }
  return new Request(`${ORIGIN}/t/upload`, { method, headers, body: form })
}

const bytes = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0) & 0xff)
const read = async (res: Response) => ({ status: res.status, body: (await res.json()) as Record<string, unknown> })

afterEach(() => vi.restoreAllMocks())

describe('the origin check', () => {
  test('a post from another site is 403 and nothing is read or called', async () => {
    const save = vi.fn<UploadFn>(async () => 'ok')
    const request = post({ origin: 'https://evil.example' })
    const formData = vi.spyOn(request, 'formData')
    expect(await read(await handleUpload(request, { save }))).toEqual({ status: 403, body: { error: 'wrong origin' } })
    expect(save).not.toHaveBeenCalled()
    expect(formData).not.toHaveBeenCalled()
  })

  test('a post with no Origin header is 403', async () => {
    const save = vi.fn<UploadFn>(async () => 'ok')
    expect(await read(await handleUpload(post({ origin: null }), { save }))).toEqual({ status: 403, body: { error: 'wrong origin' } })
    expect(save).not.toHaveBeenCalled()
  })

  test('an Origin that is not an address (the opaque "null") is 403', async () => {
    const save = vi.fn<UploadFn>(async () => 'ok')
    expect((await handleUpload(post({ origin: 'null' }), { save })).status).toBe(403)
    expect(save).not.toHaveBeenCalled()
  })

  test('the host is compared with x-forwarded-host when there is one, else with host', async () => {
    const save = vi.fn<UploadFn>(async () => 'ok')
    // behind a proxy the app's own host is internal; the page's host is the forwarded one
    expect((await handleUpload(post({ host: 'internal:3000', forwardedHost: HOST }), { save })).status).toBe(200)
    expect((await handleUpload(post({ host: HOST, forwardedHost: 'other.example' }), { save })).status).toBe(403)
    expect((await handleUpload(post({ host: 'internal:3000' }), { save })).status).toBe(403)
    // a port is part of the host
    expect((await handleUpload(post({ origin: 'http://localhost:3274', host: 'localhost:3274' }), { save })).status).toBe(200)
    expect((await handleUpload(post({ origin: 'http://localhost:3274', host: 'localhost:3275' }), { save })).status).toBe(403)
    expect(save).toHaveBeenCalledTimes(2)
  })
})

describe('what is accepted', () => {
  test('a GET is 405', async () => {
    const save = vi.fn<UploadFn>(async () => 'ok')
    const res = await handleUpload(post({ method: 'GET' }), { save })
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('POST')
    expect(await res.json()).toEqual({ error: 'method not allowed' })
    expect(save).not.toHaveBeenCalled()
  })

  test('a body that is not multipart is 400', async () => {
    const save = vi.fn<UploadFn>(async () => 'ok')
    for (const contentType of ['application/json', 'text/plain', null]) {
      expect((await read(await handleUpload(post({ contentType }), { save }))).status).toBe(400)
    }
    expect(save).not.toHaveBeenCalled()
  })

  test('an unknown action is 400, also the names every object has', async () => {
    const save = vi.fn<UploadFn>(async () => 'ok')
    for (const action of ['nope', '__proto__', 'constructor', 'toString', 'hasOwnProperty', '']) {
      expect(await read(await handleUpload(post({ action }), { save })), action).toEqual({ status: 400, body: { error: 'unknown action' } })
    }
    expect((await handleUpload(post({ action: null }), { save })).status).toBe(400)
    expect(save).not.toHaveBeenCalled()
  })

  test('__args that is not a JSON array of strings is 400', async () => {
    const save = vi.fn<UploadFn>(async () => 'ok')
    for (const args of ['not json', '{"0":"a"}', '"class-1"', '[1,2]', '["a",null]', '[["a"]]', 'null']) {
      expect(await read(await handleUpload(post({ args }), { save })), args).toEqual({ status: 400, body: { error: 'bad arguments' } })
    }
    expect((await handleUpload(post({ args: null }), { save })).status).toBe(400)
    expect(save).not.toHaveBeenCalled()
  })

  test('a number of arguments the action does not take is 400 (takes)', async () => {
    const run = vi.fn<UploadFn>(async () => 'ok')
    const allowed = { two: takes(2, run) }
    expect((await handleUpload(post({ action: 'two', args: ['a'] }), allowed)).status).toBe(400)
    expect((await handleUpload(post({ action: 'two', args: ['a', 'b', 'c'] }), allowed)).status).toBe(400)
    expect(run).not.toHaveBeenCalled()
    expect((await handleUpload(post({ action: 'two', args: ['a', 'b'] }), allowed)).status).toBe(200)
    expect(run).toHaveBeenCalledTimes(1)
  })
})

describe('a good post', () => {
  test('calls the function with the arguments and the files, bytes equal, and answers its result', async () => {
    // the bytes Cloudflare's edge refuses inside a form action: ' $F and " $F (and with a space after the quote)
    const tricky = bytes(`%PDF-1.7 head '$F middle "$F more ' $F and " $F end ÿ\u0000\u0080`)
    const plain = bytes('plain bytes')
    const seen: { args: string[]; files: File[]; keys: string[] }[] = []
    const save = vi.fn<UploadFn>(async (args, form) => {
      seen.push({ args, files: form.getAll('file') as File[], keys: [...form.keys()] })
      return { ok: true, count: 2 }
    })
    const res = await handleUpload(
      post({ args: ['class-1', 'test-1'], files: [new File([tricky], 'plan.pdf', { type: 'application/pdf' }), new File([plain], 'photo.png', { type: 'image/png' })] }),
      { save },
    )
    expect(await read(res)).toEqual({ status: 200, body: { result: { ok: true, count: 2 } } })
    expect(save).toHaveBeenCalledTimes(1)
    const { args, files } = seen[0]!
    expect(args).toEqual(['class-1', 'test-1'])
    expect(files.map((f) => [f.name, f.type, f.size])).toEqual([['plan.pdf', 'application/pdf', tricky.length], ['photo.png', 'image/png', plain.length]])
    expect(new Uint8Array(await files[0]!.arrayBuffer())).toEqual(tricky)
    expect(new Uint8Array(await files[1]!.arrayBuffer())).toEqual(plain)
  })

  test('__action and __args are not in the form the function gets, other fields are', async () => {
    const seen: string[][] = []
    const save = vi.fn<UploadFn>(async (_args, form) => void seen.push([...form.keys()]))
    await handleUpload(post({ files: [new File(['x'], 'a.png', { type: 'image/png' })], extra: { note: 'kept' } }), { save })
    expect(seen).toEqual([['note', 'file']])
  })

  test('a function that returns nothing is answered as null', async () => {
    const save = vi.fn<UploadFn>(async () => undefined)
    expect(await read(await handleUpload(post(), { save }))).toEqual({ status: 200, body: { result: null } })
  })

  test('the function is picked by its name among several', async () => {
    const one = vi.fn<UploadFn>(async () => 1)
    const two = vi.fn<UploadFn>(async () => 2)
    expect(await read(await handleUpload(post({ action: 'two' }), { one, two }))).toEqual({ status: 200, body: { result: 2 } })
    expect(one).not.toHaveBeenCalled()
  })
})

describe('when the function throws', () => {
  test('any error is 500 "failed", logged, and its text never reaches the answer', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const save = vi.fn<UploadFn>(async () => {
      throw new Error('storage: school-1/class-1/9999-secret-path.pdf already exists')
    })
    const res = await handleUpload(post(), { save })
    const text = await res.text()
    expect(res.status).toBe(500)
    expect(JSON.parse(text)).toEqual({ error: 'failed' })
    expect(text).not.toContain('secret-path')
    expect(log).toHaveBeenCalledTimes(1)
  })

  test('a redirect signal is thrown again, for Next to answer', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const save = vi.fn<UploadFn>(async () => redirect('/sign-in'))
    const caught = await handleUpload(post(), { save }).then(
      () => null,
      (e: unknown) => e,
    )
    expect(caught).toBeInstanceOf(Error)
    expect((caught as { digest?: string }).digest).toMatch(/^NEXT_REDIRECT/)
    expect(log).not.toHaveBeenCalled()
  })

  test('a not-found signal is thrown again too', async () => {
    const { notFound } = await import('next/navigation')
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const save = vi.fn<UploadFn>(async () => notFound())
    const caught = await handleUpload(post(), { save }).then(
      () => null,
      (e: unknown) => e,
    )
    expect((caught as { digest?: string }).digest).toMatch(/^NEXT_HTTP_ERROR_FALLBACK;404/)
    expect(log).not.toHaveBeenCalled()
  })
})
