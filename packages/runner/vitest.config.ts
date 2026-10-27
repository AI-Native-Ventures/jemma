import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Job prompts (jobs/*.md) are imported as text, as in the profiling package.
  plugins: [
    {
      name: 'md-as-text',
      transform: (_code, id) => (id.endsWith('.md') ? `export default ${JSON.stringify(readFileSync(id, 'utf8'))}` : null),
    },
  ],
  test: { name: 'runner', include: ['test/**/*.test.ts'], testTimeout: 60_000, hookTimeout: 120_000 },
})
