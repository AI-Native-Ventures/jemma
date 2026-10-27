import { resolve } from 'node:path'
import { defineConfig } from '@playwright/test'

// Specs read Supabase keys from the repo-root .env.local.
process.loadEnvFile(resolve(import.meta.dirname, '../../.env.local'))

// Own port, never reusing a server: another worktree's dev server on 3000 would test the wrong code.
const port = Number(process.env.PLAYWRIGHT_PORT ?? 3107)
const baseURL = `http://localhost:${port}`
process.env.PLAYWRIGHT_BASE_URL = baseURL

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL },
  projects: [
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
    { name: 'laptop', use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `pnpm --filter web dev --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
