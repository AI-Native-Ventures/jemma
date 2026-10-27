// @vitest-environment node
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { createServiceClient } from '@jemma/profiling/db'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  attemptChildSignIn,
  childEmail,
  childPassword,
  createChildLogin,
} from '@/lib/child-login'

// Next skips .env.local when NODE_ENV=test, so load it directly.
process.loadEnvFile(resolve(import.meta.dirname, '../../../.env.local'))
process.env.CHILD_PIN_PEPPER ||= 'test-pepper-not-a-secret'

const url = process.env.SUPABASE_URL!
const admin = createServiceClient({
  SUPABASE_URL: url,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
})
const anon = () =>
  createClient(url, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } })

const signIn = async (email: string, password: string) => {
  const { error } = await anon().auth.signInWithPassword({ email, password })
  return !error
}

describe('child credentials', () => {
  test('email is the lower-cased code on the kids domain', () => {
    expect(childEmail('AB12CD')).toBe('ab12cd@kids.jemma.invalid')
  })

  test('password is a stable hex HMAC that depends on code and pin', async () => {
    const a = await childPassword('AB12CD', '1234')
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(await childPassword('AB12CD', '1234')).toBe(a)
    expect(await childPassword('AB12CD', '1235')).not.toBe(a)
    expect(await childPassword('AB12CE', '1234')).not.toBe(a)
  })
})

describe('child PIN sign-in against jemma-dev', () => {
  let schoolId: string
  let childId: string
  let code: string
  let userId: string

  beforeAll(async () => {
    const school = await admin
      .from('schools')
      .insert({ name: 'P07 test school', country: 'ZA' })
      .select('id')
      .single()
    schoolId = school.data!.id
    const child = await admin
      .from('children')
      .insert({ school_id: schoolId, first_name: 'Testa', grade: 6 })
      .select('id')
      .single()
    childId = child.data!.id
    const login = await createChildLogin(admin, childId, '4321')
    code = login.code
    const row = await admin.from('child_logins').select('user_id').eq('code', code).single()
    userId = row.data!.user_id
  }, 30_000)

  afterAll(async () => {
    await admin.from('child_login_attempts').delete().eq('code', code)
    await admin.from('children').delete().eq('id', childId)
    await admin.from('schools').delete().eq('id', schoolId)
    if (userId) await admin.auth.admin.deleteUser(userId)
  }, 30_000)

  test('createChildLogin makes a learner profile and links the child', async () => {
    expect(code).toMatch(/^[A-Z2-9]{6}$/)
    const profile = await admin.from('profiles').select('role').eq('user_id', userId).single()
    expect(profile.data?.role).toBe('learner')
    const child = await admin.from('children').select('user_id').eq('id', childId).single()
    expect(child.data?.user_id).toBe(userId)
  })

  test('right PIN signs in', async () => {
    expect(await attemptChildSignIn(admin, signIn, code.toLowerCase(), '4321')).toEqual({ ok: true })
  }, 30_000)

  test('locks after 5 wrong PINs, even for the right PIN', async () => {
    for (let i = 0; i < 5; i++) {
      expect(await attemptChildSignIn(admin, signIn, code, '0000')).toEqual({
        ok: false,
        reason: 'wrong',
      })
    }
    expect(await attemptChildSignIn(admin, signIn, code, '0000')).toEqual({
      ok: false,
      reason: 'locked',
    })
    expect(await attemptChildSignIn(admin, signIn, code, '4321')).toEqual({
      ok: false,
      reason: 'locked',
    })
  }, 60_000)

  test('wrong tries older than 15 minutes do not count', async () => {
    const old = new Date(Date.now() - 20 * 60_000).toISOString()
    await admin.from('child_login_attempts').delete().eq('code', code)
    await admin
      .from('child_login_attempts')
      .insert(Array.from({ length: 5 }, () => ({ code, at: old })))
    expect(await attemptChildSignIn(admin, signIn, code, '4321')).toEqual({ ok: true })
  }, 30_000)

  test('a malformed PIN is wrong without calling auth', async () => {
    let called = false
    const spy = async () => ((called = true), true)
    expect(await attemptChildSignIn(admin, spy, code, 'abcd')).toEqual({ ok: false, reason: 'wrong' })
    expect(called).toBe(false)
  })
})
