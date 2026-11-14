// @vitest-environment node
import { NextRequest } from 'next/server'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

// The learner's upload route /k/upload. Only `snapPractice` can be named through it, and the proxy keeps out everyone who is not that learner:
// a signed-out post is sent to sign-in and a teacher's (or a parent's, without a hand-over) is sent home, exactly as /t/upload and /p/upload
// do it. The proxy and the route run here with stand-ins for the sign-in and for the action. No database, no server.

const who = vi.hoisted(() => ({ user: 'learner' as 'nobody' | 'learner' | 'teacher' | 'parent' }))
const snap = vi.hoisted(() => ({ calls: [] as { sessionId: string; files: File[] }[], fails: false }))

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: who.user === 'nobody' ? null : { id: 'user-1' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: who.user === 'nobody' ? null : { role: who.user } }) }) }) }),
  }),
}))
vi.mock('../app/k/session/[sessionId]/actions', () => ({
  snapPractice: async (sessionId: string, files: File[]) => {
    if (snap.fails) throw new Error('storage: school-1/c1/practice/secret-path.jpg')
    snap.calls.push({ sessionId, files })
    return { ok: true }
  },
}))

import { proxy } from '../proxy'
import { signHandover } from '../lib/handover'
import { POST } from '../app/k/upload/route'

const HOST = 'jemma.example'
const ORIGIN = `https://${HOST}`

beforeAll(() => {
  process.env.SUPABASE_URL = 'http://supabase.test'
  process.env.SUPABASE_ANON_KEY = 'anon-not-a-secret'
  process.env.CHILD_PIN_PEPPER = 'test-pepper-not-a-secret'
})
afterEach(() => {
  who.user = 'learner'
  snap.calls = []
  snap.fails = false
})

const door = (path: string, cookie?: string) => proxy(new NextRequest(`${ORIGIN}${path}`, { method: 'POST', headers: cookie ? { cookie } : {} }))
const where = (res: Response) => ({ status: res.status, to: res.headers.get('location') ? new URL(res.headers.get('location')!).pathname : null })

describe('the proxy in front of the upload routes', () => {
  it('a signed-out post is sent to sign-in, on all three routes alike', async () => {
    who.user = 'nobody'
    for (const path of ['/t/upload', '/p/upload', '/k/upload']) expect(where(await door(path)), path).toEqual({ status: 307, to: '/sign-in' })
  })

  it('a teacher on the learner route is sent to their own space, and the function is never reached', async () => {
    who.user = 'teacher'
    expect(where(await door('/k/upload'))).toEqual({ status: 307, to: '/t' })
    // the parent's route does the same for a teacher
    expect(where(await door('/p/upload'))).toEqual({ status: 307, to: '/t' })
  })

  it('a parent on the learner route, with no hand-over, is sent to the parent space', async () => {
    who.user = 'parent'
    expect(where(await door('/k/upload'))).toEqual({ status: 307, to: '/p' })
  })

  it('a learner goes through', async () => {
    who.user = 'learner'
    expect(where(await door('/k/upload'))).toEqual({ status: 200, to: null })
  })

  it("a learner on the teacher's or the parent's route is sent home", async () => {
    who.user = 'learner'
    expect(where(await door('/t/upload'))).toEqual({ status: 307, to: '/k' })
    expect(where(await door('/p/upload'))).toEqual({ status: 307, to: '/k' })
  })

  it('a parent whose phone was handed over may post the photo, and the hand-over opens nothing else', async () => {
    who.user = 'parent'
    const cookie = `jemma_handover=${await signHandover('s1', 'c1')}`
    expect(where(await door('/k/upload', cookie))).toEqual({ status: 200, to: null })
    // what the hand-over has always opened
    expect(where(await door('/k/session/s1', cookie)).status).toBe(200)
    expect(where(await door('/k/done', cookie)).status).toBe(200)
    // and nothing more
    for (const path of ['/k/maths', '/k/me', '/k', '/k/session/s2', '/k/upload/extra']) expect(where(await door(path, cookie)), path).toEqual({ status: 307, to: '/p' })
  })

  it('a forged or expired hand-over opens nothing', async () => {
    who.user = 'parent'
    const real = await signHandover('s1', 'c1')
    const forged = `${real.slice(0, -4)}0000`
    const expired = `jemma_handover=${await signHandover('s1', 'c1', Date.now() - 2 * 60 * 60 * 1000)}`
    expect(where(await door('/k/upload', `jemma_handover=${forged}`))).toEqual({ status: 307, to: '/p' })
    expect(where(await door('/k/upload', expired))).toEqual({ status: 307, to: '/p' })
  })

  it('a teacher with a hand-over cookie is still a teacher', async () => {
    who.user = 'teacher'
    const cookie = `jemma_handover=${await signHandover('s1', 'c1')}`
    expect(where(await door('/k/upload', cookie))).toEqual({ status: 307, to: '/t' })
  })
})

/** A post as the browser sends it: multipart, from a page of this site. */
function post(action: string, args: unknown, files: File[] = [], origin = ORIGIN) {
  const form = new FormData()
  form.set('__action', action)
  form.set('__args', JSON.stringify(args))
  for (const f of files) form.append('file', f)
  return new Request(`${ORIGIN}/k/upload`, { method: 'POST', headers: { host: HOST, origin }, body: form })
}

describe('the learner route itself', () => {
  it('names snapPractice with the session and hands it the files, then answers its result', async () => {
    const photo = new File([new Uint8Array(10)], 'answers.jpg', { type: 'image/jpeg' })
    const res = await POST(post('snapPractice', ['s1'], [photo]))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ result: { ok: true } })
    expect(snap.calls).toHaveLength(1)
    expect(snap.calls[0]!.sessionId).toBe('s1')
    expect(snap.calls[0]!.files.map((f) => [f.name, f.size])).toEqual([['answers.jpg', 10]])
  })

  it('no other function can be named, not the teacher\'s, not the parent\'s, not the names every object has', async () => {
    for (const action of ['uploadCurriculum', 'uploadMemo', 'addPaper', 'uploadScans', 'addPage', 'retakePaper', 'snapHomework', 'answer', 'finishSession', '__proto__', 'constructor']) {
      const res = await POST(post(action, ['s1']))
      expect(res.status, action).toBe(400)
      expect(await res.json()).toEqual({ error: 'unknown action' })
    }
    expect(snap.calls).toEqual([])
  })

  it('exactly one argument, the session: any other count is refused before the function runs', async () => {
    for (const args of [[], ['s1', 'extra']]) expect((await POST(post('snapPractice', args))).status).toBe(400)
    expect(snap.calls).toEqual([])
  })

  it('a post from another site is refused', async () => {
    expect((await POST(post('snapPractice', ['s1'], [], 'https://evil.example'))).status).toBe(403)
    expect(snap.calls).toEqual([])
  })

  it('an error inside the function is a plain 500 that holds no text of it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    snap.fails = true
    const res = await POST(post('snapPractice', ['s1']))
    const text = await res.text()
    expect(res.status).toBe(500)
    expect(JSON.parse(text)).toEqual({ error: 'failed' })
    expect(text).not.toContain('secret-path')
  })
})
