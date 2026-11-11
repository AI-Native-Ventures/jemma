// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from 'vitest'

// loadSheet reads a sample sheet from the Worker's static assets. The Cloudflare context is replaced by a small fake.

const context = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: context.get }))

import { loadSheet } from '../lib/sample-sheets'

const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4])
const assets = (answer: (req: Request) => Promise<Response> | Response) => {
  const fetch = vi.fn(async (req: Request) => answer(req))
  context.get.mockReturnValue({ env: { ASSETS: { fetch } } })
  return fetch
}

beforeEach(() => {
  context.get.mockReset()
})

describe('loadSheet', () => {
  test('asks the assets for /sample-papers/<name>.png and returns the bytes of a 200', async () => {
    const fetch = assets(() => new Response(PNG, { status: 200 }))
    const bytes = await loadSheet('memo')
    expect(Array.from(bytes!)).toEqual(Array.from(PNG))
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0]![0].url).toBe('https://assets.local/sample-papers/memo.png')
  })

  test('returns null when the assets do not have the file', async () => {
    assets(() => new Response('not found', { status: 404 }))
    expect(await loadSheet('amina')).toBeNull()
  })

  test('returns null when a 200 is not a PNG (a page instead of the picture)', async () => {
    assets(() => new Response('<html>hello</html>', { status: 200 }))
    expect(await loadSheet('amina')).toBeNull()
  })

  test('returns null when there is no Cloudflare context (next dev), so the disk file is used', async () => {
    context.get.mockImplementation(() => {
      throw new Error('getCloudflareContext called outside a request')
    })
    expect(await loadSheet('thabo')).toBeNull()
  })

  test('returns null when the context has no ASSETS binding', async () => {
    context.get.mockReturnValue({ env: {} })
    expect(await loadSheet('thabo')).toBeNull()
  })

  test('returns null when the fetch itself throws', async () => {
    assets(() => {
      throw new Error('boom')
    })
    expect(await loadSheet('sipho')).toBeNull()
  })
})
