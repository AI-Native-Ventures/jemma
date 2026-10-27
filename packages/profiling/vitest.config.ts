import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Job prompts (jobs/*.md) are imported as text, like the wrangler Text rule does for the agent worker.
  plugins: [
    {
      name: 'md-as-text',
      transform: (_code, id) => (id.endsWith('.md') ? `export default ${JSON.stringify(readFileSync(id, 'utf8'))}` : null),
    },
  ],
  test: { name: 'profiling', include: ['test/**/*.test.ts'] },
})
