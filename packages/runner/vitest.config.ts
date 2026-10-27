import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: 'runner', include: ['test/**/*.test.ts'], testTimeout: 60_000, hookTimeout: 120_000 },
})
