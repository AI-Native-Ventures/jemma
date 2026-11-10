import { describe, expect, test } from 'vitest'
import { assertDevProject, isAllowedSupabaseUrl } from '../scripts/env'

const DEV_REF = 'ayxgctbemuvozwktstaa'

describe('the Supabase guard for scripts', () => {
  test('allows the local stack on localhost and 127.0.0.1', () => {
    expect(isAllowedSupabaseUrl('http://127.0.0.1:54321')).toBe(true)
    expect(isAllowedSupabaseUrl('http://localhost:54321')).toBe(true)
    expect(() => assertDevProject({ SUPABASE_URL: 'http://127.0.0.1:54321' })).not.toThrow()
    expect(() => assertDevProject({ SUPABASE_URL: 'http://localhost:54321' })).not.toThrow()
  })

  test('allows the team dev project by default, and nothing else that is hosted', () => {
    expect(isAllowedSupabaseUrl(`https://${DEV_REF}.supabase.co`)).toBe(true)
    expect(isAllowedSupabaseUrl('https://someotherprojectref.supabase.co')).toBe(false)
    expect(isAllowedSupabaseUrl('https://localhost.example.com')).toBe(false)
    expect(() => assertDevProject({ SUPABASE_URL: `https://${DEV_REF}.supabase.co` })).not.toThrow()
    expect(() => assertDevProject({ SUPABASE_URL: 'https://someotherprojectref.supabase.co' })).toThrow(/JEMMA_ALLOWED_SUPABASE_REF/)
  })

  test('JEMMA_ALLOWED_SUPABASE_REF replaces the default ref', () => {
    const env = { JEMMA_ALLOWED_SUPABASE_REF: 'myownprojectref' }
    expect(isAllowedSupabaseUrl('https://myownprojectref.supabase.co', env.JEMMA_ALLOWED_SUPABASE_REF)).toBe(true)
    expect(isAllowedSupabaseUrl(`https://${DEV_REF}.supabase.co`, env.JEMMA_ALLOWED_SUPABASE_REF)).toBe(false)
    expect(() => assertDevProject({ ...env, SUPABASE_URL: 'https://myownprojectref.supabase.co' })).not.toThrow()
    expect(() => assertDevProject({ ...env, SUPABASE_URL: `https://${DEV_REF}.supabase.co` })).toThrow()
    // The local stack stays allowed whatever the ref is.
    expect(() => assertDevProject({ ...env, SUPABASE_URL: 'http://127.0.0.1:54321' })).not.toThrow()
  })

  test('an empty ref never allows everything', () => {
    expect(isAllowedSupabaseUrl('https://someotherprojectref.supabase.co', '')).toBe(false)
    expect(() => assertDevProject({ JEMMA_ALLOWED_SUPABASE_REF: '', SUPABASE_URL: 'https://someotherprojectref.supabase.co' })).toThrow()
    expect(() => assertDevProject({ JEMMA_ALLOWED_SUPABASE_REF: '', SUPABASE_URL: `https://${DEV_REF}.supabase.co` })).not.toThrow()
  })

  test('a missing or broken URL is refused', () => {
    expect(isAllowedSupabaseUrl(undefined)).toBe(false)
    expect(isAllowedSupabaseUrl('')).toBe(false)
    expect(isAllowedSupabaseUrl('not a url')).toBe(false)
    expect(() => assertDevProject({})).toThrow(/SUPABASE_URL/)
  })
})
