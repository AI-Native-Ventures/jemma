import { globSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { assertDevProject, isAllowedSupabaseUrl } from '../scripts/env'

const DEV_REF = 'ayxgctbemuvozwktstaa'
const root = resolve(import.meta.dirname, '../../..')
const read = (file: string) => readFileSync(join(root, file), 'utf8')

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

describe('the scripts that reach a database use the one shared guard', () => {
  const mustUse = ['scripts/proof/run-real-job.ts', 'scripts/proof/run-open-job.ts', 'scripts/export-replays.ts']

  test.each(mustUse)('%s imports assertDevProject from packages/profiling/scripts/env, calls it and has no copy of its own', (file) => {
    const text = read(file)
    expect(text).toMatch(/import\s*\{[^}]*\bassertDevProject\b[^}]*\}\s*from\s*'(?:\.\.\/)+packages\/profiling\/scripts\/env'/)
    expect(text).toMatch(/\bassertDevProject\(\w+\)/)
    expect(text).not.toMatch(/(?:function|const|let)\s+assertDevProject\b/)
  })

  test('no other script holds a project ref: a 20-letter ref is written only in packages/profiling/scripts/env.ts', () => {
    const files = [...globSync('scripts/**/*.{ts,mjs,js}', { cwd: root }), ...globSync('packages/*/scripts/**/*.{ts,mjs,js}', { cwd: root })].filter((file) => file !== 'packages/profiling/scripts/env.ts')
    expect(files.length).toBeGreaterThan(8)
    const ref = /(?<![A-Za-z0-9])[a-z]{20}(?![A-Za-z0-9])/
    const withoutPackageName = (text: string) => text.replaceAll('modelcontextprotocol', '') // the one 20-letter word that is no ref: @modelcontextprotocol/sdk
    expect(files.filter((file) => ref.test(withoutPackageName(read(file))))).toEqual([])
    expect(ref.test(read('packages/profiling/scripts/env.ts'))).toBe(true) // the test would see a ref if there were one
  })
})
