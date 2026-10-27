import { readFileSync } from 'node:fs'
import { globSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, test } from 'vitest'

const repoRoot = resolve(import.meta.dirname, '../../..')

test('no em dash in source or docs', () => {
  const patterns = [
    'apps/**/*.{ts,tsx,css,md}',
    'packages/**/*.{ts,tsx,md}',
    'docs/**/*.md',
    'supabase/**/*.{ts,sql}',
  ]
  const ignored = /(^|\/)(node_modules|\.next|\.open-next|\.wrangler)\//
  const files = patterns
    .flatMap((p) => globSync(p, { cwd: repoRoot }))
    .filter((f) => !ignored.test(f))
  const dash = String.fromCharCode(0x2014)
  const offenders = files.filter((f) => readFileSync(join(repoRoot, f), 'utf8').includes(dash))
  expect(offenders).toEqual([])
})
