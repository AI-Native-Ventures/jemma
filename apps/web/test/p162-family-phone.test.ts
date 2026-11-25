import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { usVersion } from '../../landing/src/us.js'
import worker from '../../landing/src/worker.js'
import { familyChildren } from '../lib/family-device'
import { PRICE_FACTOR, priceUsdFor, upgradeUsd, yearAfter } from '../lib/plans'

// P162: prices that follow the family's country (twice the list price in the US), "Who's learning?" on one family phone, and the landing page for a
// visitor in the US.

describe('prices by country', () => {
  it('are the list price everywhere, and twice it in the US', () => {
    expect(PRICE_FACTOR).toEqual({ US: 2 })
    expect([priceUsdFor('light', 'ZA'), priceUsdFor('regular', 'ZA'), priceUsdFor('heavy', 'ZA')]).toEqual([48, 96, 192])
    expect([priceUsdFor('light', 'US'), priceUsdFor('regular', 'US'), priceUsdFor('heavy', 'US')]).toEqual([96, 192, 384])
    expect(priceUsdFor('regular', null)).toBe(96)
    expect(priceUsdFor('regular', 'us')).toBe(192)
  })

  it('charge a US family the difference of the US prices for a bigger plan', () => {
    const now = new Date('2026-11-25T00:00:00Z')
    expect(upgradeUsd('regular', 'heavy', yearAfter(now), now, 'US')).toBe(192)
    expect(upgradeUsd('regular', 'heavy', yearAfter(now), now, 'ZA')).toBe(96)
  })
})

/** Just the reads `familyChildren` makes. */
function fakeDb(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from: (table: string) => {
      const filters: ((r: Record<string, unknown>) => boolean)[] = []
      const b = {
        select: () => b,
        eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
        in: (k: string, v: unknown[]) => (filters.push((r) => v.includes(r[k])), b),
        then: (ok: (v: unknown) => void) => Promise.resolve({ data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))), error: null }).then(ok),
      }
      return b
    },
  } as never
}

describe("Who's learning?", () => {
  it("lists a parent's children by name with their grade and whether each has a PIN, never a child's own side or another family's child", async () => {
    const db = fakeDb({
      parent_links: [
        { parent_id: 'p1', child_id: 'amina', status: 'approved' },
        { parent_id: 'p1', child_id: 'lesedi', status: 'approved' },
        { parent_id: 'p1', child_id: 'later', status: 'pending' },
        { parent_id: 'p2', child_id: 'other', status: 'approved' },
      ],
      children: [
        { id: 'amina', first_name: 'Amina', grade: 6, private_of: null },
        { id: 'lesedi', first_name: 'Lesedi', grade: 2, private_of: null },
        { id: 'other', first_name: 'Other', grade: 4, private_of: null },
      ],
      child_logins: [{ child_id: 'amina', code: 'ABC234' }],
    })
    expect(await familyChildren(db, 'p1')).toEqual([
      { id: 'amina', firstName: 'Amina', grade: 6, hasPin: true },
      { id: 'lesedi', firstName: 'Lesedi', grade: 2, hasPin: false },
    ])
    expect(await familyChildren(db, 'nobody')).toEqual([])
  })

  it('keeps the parent signed in: the PIN is checked with a client of its own that keeps nothing', () => {
    const src = readFileSync(join(__dirname, '../lib/family-device.ts'), 'utf8')
    expect(src).toContain('persistSession: false')
    expect(src).toContain('attemptChildSignIn')
    const action = readFileSync(join(__dirname, '../app/p/who/actions.ts'), 'utf8')
    expect(action).toContain('OWN_HANDOVER')
    expect(action).toContain("eq('status', 'approved')")
  })
})

describe('the landing page for a visitor in the US', () => {
  const page = readFileSync(join(__dirname, '../../landing/public/index.html'), 'utf8')
  const us = usVersion(page)
  const text = (html: string) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

  it('shows the US prices and US words, and leaves every address alone', () => {
    expect(text(us).match(/\$\d+/g)).toEqual(['$0', '$96', '$192', '$384'])
    expect(text(us)).not.toMatch(/\bmaths\b|practis/i)
    expect(text(us)).toContain('Learn math until you understand it.')
    expect(us).toContain('src="/img/maths-fractions.png"')
    expect(us).toContain('/img/parent-marks.png')
    expect(us).toContain('<html lang="en-US">')
  })

  it('leaves the page of every other visitor exactly as it is', () => {
    expect(text(page)).toContain('Learn maths until you understand it.')
    const worker = readFileSync(join(__dirname, '../../landing/src/worker.js'), 'utf8')
    expect(worker).toContain("request.cf?.country !== 'US'")
  })

  describe('the Worker in front of it', () => {
    const asked: Request[] = []
    const env = {
      ASSETS: {
        fetch: async (req: Request) => {
          asked.push(req)
          const path = new URL(req.url).pathname
          if (path.startsWith('/img/')) return new Response('png', { headers: { 'content-type': 'image/png' } })
          if (req.headers.get('if-none-match') === '"old"') return new Response(null, { status: 304 })
          return new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8', etag: '"old"', 'cache-control': 'public, max-age=0' } })
        },
      },
    }
    const visit = (path: string, country: string, headers: Record<string, string> = {}) => {
      const req = new Request(`https://getjemma.ainative.ventures${path}`, { headers })
      Object.defineProperty(req, 'cf', { value: { country } })
      return worker.fetch(req, env)
    }

    it('gives a visitor in the US the US page, fresh every time', async () => {
      const res = await visit('/', 'US', { 'if-none-match': '"old"' })
      expect(res.status).toBe(200)
      expect(text(await res.text())).toContain('Learn math until you understand it.')
      expect(res.headers.get('cache-control')).toBe('private, max-age=0, must-revalidate')
      expect(res.headers.get('etag')).toBeNull()
      expect(asked.at(-1)?.headers.get('if-none-match')).toBeNull()
    })

    it('gives everyone else the page as it is, and every other file as it is', async () => {
      const za = await visit('/', 'ZA')
      expect(await za.text()).toBe(page)
      expect(za.headers.get('etag')).toBe('"old"')
      const kept = await visit('/', 'ZA', { 'if-none-match': '"old"' })
      expect(kept.status).toBe(304)
      const img = await visit('/img/maths-fractions.png', 'US')
      expect(await img.text()).toBe('png')
    })
  })
})
