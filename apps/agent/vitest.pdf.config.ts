import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

// The one agent test that really loads PDF.js (`unpdf`, 1.7 MB of code) in workerd, so it uses the real library. It has its own
// project on purpose: Vitest sends every module it already knows of in one WebSocket message to a Worker that starts, and with
// PDF.js in that message the message is too large for workerd (error 1009), which kills the Worker of the next test file.
// The other agent tests run in the `agent` project (vitest.config.ts), where PDF.js is a stand-in.
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.local.jsonc' } })],
  test: { name: 'agent-pdf', include: ['test/unseen-curriculum.test.ts'] },
})
