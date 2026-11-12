import { fileURLToPath } from 'node:url'
import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // The local config has no `ai` binding, so the tests run without a Cloudflare login (see wrangler.local.jsonc).
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.local.jsonc' } })],
  // PDF.js is a stand-in here: with the real one in the module graph, a Worker that starts gets one message too large for workerd.
  // The test that reads a PDF in workerd is in its own project (vitest.pdf.config.ts). See test/stubs/unpdf.ts.
  resolve: { alias: { unpdf: fileURLToPath(new URL('./test/stubs/unpdf.ts', import.meta.url).href) } },
  test: { name: 'agent', include: ['test/**/*.test.ts'], exclude: ['test/unseen-curriculum.test.ts'] },
})
