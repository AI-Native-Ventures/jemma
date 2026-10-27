import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: 'profiling', include: ['test/**/*.test.ts'] },
})
