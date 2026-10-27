import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { defineConfig } from 'vitest/config'

const envFile = fileURLToPath(new URL('../.env.local', import.meta.url))
const env = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {}

export default defineConfig({
  resolve: {
    alias: {
      '@supabase/supabase-js': fileURLToPath(
        new URL('../packages/profiling/node_modules/@supabase/supabase-js', import.meta.url),
      ),
    },
  },
  test: {
    name: 'supabase',
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 120_000,
    env,
  },
})
