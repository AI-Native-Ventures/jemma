import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A browser whose demo cookie names a sandbox that is gone (the sweep removed it, or it was reset elsewhere) must land on /demo
// with a fresh start, never on an error page. The database, the cookies and the redirect are doubles.

const GONE = '11111111-1111-4111-8111-111111111111'
const LIVE = '22222222-2222-4222-8222-222222222222'
const FRESH = '33333333-3333-4333-8333-333333333333'

class Redirected extends Error {
  constructor(readonly url: string) {
    super(`redirect to ${url}`)
  }
}

const cookieJar = { value: undefined as string | undefined, set: vi.fn(), delete: vi.fn() }
const signIn = vi.fn(async () => ({ error: null }))
const signOut = vi.fn(async () => ({}))
const createSandbox = vi.fn()
const resetSandbox = vi.fn()
const boxes: Record<string, { school_id: string; logins: unknown }> = {}

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (cookieJar.value ? { value: cookieJar.value } : undefined), set: cookieJar.set, delete: cookieJar.delete }),
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Redirected(url)
  },
}))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: async () => ({ auth: { signInWithPassword: signIn, signOut } }) }))
vi.mock('../../../supabase/seed/demo', () => ({ createSandbox: (...a: unknown[]) => createSandbox(...a), resetSandbox: (...a: unknown[]) => resetSandbox(...a) }))
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdmin: () => ({
    from(table: string) {
      let id = ''
      const q = {
        select: () => q,
        eq: (k: string, v: string) => {
          if (k === 'id' || k === 'school_id') id = v
          return q
        },
        single: async () => (table === 'classes' ? { data: { id: 'class-1' }, error: null } : { data: boxes[id] ?? null, error: boxes[id] ? null : { message: 'no rows' } }),
        maybeSingle: async () => ({ data: table === 'demo_sandboxes' ? (boxes[id] ?? null) : null, error: null }),
        // The classes of the sandbox school are read as a list: the home class is the oldest.
        then: (resolve: (v: { data: unknown; error: null }) => unknown) => resolve({ data: table === 'classes' ? [{ id: 'class-1', created_at: '2026-01-01T00:00:00Z' }] : null, error: null }),
      }
      return q
    },
  }),
}))

const logins = { teacher: { email: 't@x.test', password: 'p' }, parent: { email: 'p@x.test', password: 'p' }, learner: { email: 'l@x.test', password: 'p' } }
const lands = async (run: Promise<unknown>) => {
  try {
    await run
  } catch (e) {
    if (e instanceof Redirected) return e.url
    throw e
  }
  return null
}

beforeEach(() => {
  for (const k of Object.keys(boxes)) delete boxes[k]
  boxes[LIVE] = { school_id: 'school-live', logins }
  cookieJar.value = undefined
  vi.clearAllMocks()
})
afterEach(() => vi.restoreAllMocks())

describe('a demo cookie that names a sandbox that is gone', () => {
  it('switchRole sends the browser to /demo, forgets the cookie and signs nobody in', async () => {
    cookieJar.value = GONE
    const { switchRole } = await import('@/lib/demo')
    expect(await lands(switchRole('teacher'))).toBe('/demo')
    expect(cookieJar.delete).toHaveBeenCalledWith('jemma_demo')
    expect(signIn).not.toHaveBeenCalled()
  })

  it('signInAs does the same instead of throwing "demo: no sandbox"', async () => {
    const { signInAs } = await import('@/lib/demo')
    expect(await lands(signInAs(GONE, 'parent'))).toBe('/demo')
    expect(cookieJar.delete).toHaveBeenCalledWith('jemma_demo')
    expect(signIn).not.toHaveBeenCalled()
  })

  it('resetDemo sends the browser to /demo without trying to rebuild a sandbox that is not there', async () => {
    cookieJar.value = GONE
    const { resetDemo } = await import('@/lib/demo')
    expect(await lands(resetDemo())).toBe('/demo')
    expect(cookieJar.delete).toHaveBeenCalledWith('jemma_demo')
    expect(resetSandbox).not.toHaveBeenCalled()
  })

  it('tryDemo makes a fresh sandbox and signs in as the teacher there', async () => {
    cookieJar.value = GONE
    createSandbox.mockImplementation(async () => {
      boxes[FRESH] = { school_id: 'school-fresh', logins }
      return { sandboxId: FRESH }
    })
    const { tryDemo } = await import('@/lib/demo')
    expect(await lands(tryDemo('teacher'))).toBe('/t/class-1/curriculum')
    expect(createSandbox).toHaveBeenCalledTimes(1)
    expect(cookieJar.set).toHaveBeenCalledWith('jemma_demo', FRESH, expect.anything())
  })
})

describe('a demo cookie that names a sandbox that is there', () => {
  it('switchRole still signs in as that person and lands on their home', async () => {
    cookieJar.value = LIVE
    const { switchRole } = await import('@/lib/demo')
    expect(await lands(switchRole('parent'))).toBe('/p')
    expect(signIn).toHaveBeenCalledWith({ email: 'p@x.test', password: 'p' })
    expect(cookieJar.set).toHaveBeenCalledWith('jemma_demo', LIVE, expect.anything())
    expect(cookieJar.delete).not.toHaveBeenCalled()
  })

  it('resetDemo still rebuilds it and signs the browser out', async () => {
    cookieJar.value = LIVE
    const { resetDemo } = await import('@/lib/demo')
    expect(await lands(resetDemo())).toBe('/demo')
    expect(resetSandbox).toHaveBeenCalledTimes(1)
    expect(signOut).toHaveBeenCalled()
    expect(cookieJar.delete).not.toHaveBeenCalled()
  })

  it('no cookie at all goes to /demo, as before', async () => {
    const { switchRole } = await import('@/lib/demo')
    expect(await lands(switchRole('teacher'))).toBe('/demo')
    expect(cookieJar.delete).not.toHaveBeenCalled()
  })
})
