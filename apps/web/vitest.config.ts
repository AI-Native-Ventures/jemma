import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    react(),
    // The tool registry pulls in the job prompts (jobs/*.md), which are text, as in the profiling tests and the agent worker.
    { name: 'md-as-text', transform: (_code, id) => (id.endsWith('.md') ? `export default ${JSON.stringify(readFileSync(id, 'utf8'))}` : null) },
  ],
  resolve: { alias: { '@': resolve(import.meta.dirname) } },
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['./test/setup.ts'],
  },
})
