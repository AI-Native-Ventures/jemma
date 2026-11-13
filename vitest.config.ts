import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { projects: ['packages/*', 'apps/agent', 'apps/agent/vitest.pdf.config.ts', 'apps/desktop', 'apps/web', 'supabase'] },
})
