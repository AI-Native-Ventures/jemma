import { SELF } from 'cloudflare:test'
import { expect, test } from 'vitest'

test('GET /health', async () => {
  const res = await SELF.fetch('http://agent/health')
  expect(await res.json()).toEqual({ ok: true })
})
