import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // The local config has no `ai` binding, so the tests run without a Cloudflare login (see wrangler.local.jsonc).
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.local.jsonc' } })],
  test: { name: 'agent', include: ['test/**/*.test.ts'] },
})
