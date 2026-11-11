import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import type { JemmaDb } from '../../packages/profiling/src/db'

// The sample test sheets in the `sample-papers` bucket. Plain unit tests with a small fake storage client:
// no database, no network, so they run anywhere.

const PAPERS = resolve(import.meta.dirname, '../../fixtures/papers')
const PLACEHOLDER_BYTES = 60_868
const SHEETS = ['amina', 'thabo', 'lerato', 'sipho', 'naledi', 'memo'] as const
const SHEET_PATH = (who: string) => `class-test-1/${who}.png`
const real = (who: string) => new Uint8Array(readFileSync(resolve(PAPERS, `${who}.png`)))

type Upload = { path: string; length: number; first: number | undefined; upsert: boolean | undefined; contentType: string | undefined }

/** Storage with the given objects (path to size). Records every list and upload. A plain upload of an existing path fails like the real one. */
function fakeAdmin(existing: Record<string, number> = {}) {
  const uploads: Upload[] = []
  const lists: string[] = []
  const admin = {
    storage: {
      from: (bucket: string) => ({
        list: async (prefix: string) => {
          lists.push(`${bucket}/${prefix}`)
          const data = Object.entries(existing)
            .filter(([path]) => path.startsWith(`${prefix}/`))
            .map(([path, size]) => ({ name: path.slice(prefix.length + 1), metadata: { size } }))
          return { data, error: null }
        },
        upload: async (path: string, bytes: Uint8Array, o: { upsert?: boolean; contentType?: string }) => {
          uploads.push({ path, length: bytes.length, first: bytes[0], upsert: o.upsert, contentType: o.contentType })
          if (!o.upsert && path in existing) return { data: null, error: { message: 'The resource already exists' } }
          return { data: { path }, error: null }
        },
      }),
    },
  }
  return { admin: admin as unknown as JemmaDb, uploads, lists }
}

/** A new copy of the module, so its "runs once per process" memory starts empty. */
async function fresh() {
  vi.resetModules()
  return import('../seed/fixtures/sample-papers')
}

const sheetUploads = (uploads: Upload[]) => uploads.filter((u) => u.path.startsWith('class-test-1/'))
const noDisk = { readDisk: () => null }

describe('ensureSampleFiles', () => {
  test('an empty bucket gets the 6 real sheets, byte for byte the files in fixtures/papers', async () => {
    const { ensureSampleFiles } = await fresh()
    const { admin, uploads } = fakeAdmin()
    await ensureSampleFiles(admin)
    const sheets = sheetUploads(uploads)
    expect(sheets.map((u) => u.path).sort()).toEqual(SHEETS.map(SHEET_PATH).sort())
    for (const who of SHEETS) {
      const sent = sheets.find((u) => u.path === SHEET_PATH(who))!
      expect(sent.length, who).toBe(real(who).length)
      expect(sent.length, who).not.toBe(PLACEHOLDER_BYTES)
      expect(sent.upsert, who).toBe(false)
      expect(sent.contentType, who).toBe('image/png')
    }
  })

  test('a bucket holding 6 placeholder sheets of 60,868 bytes gets all 6 replaced, with upsert on', async () => {
    const { ensureSampleFiles } = await fresh()
    const { admin, uploads } = fakeAdmin(Object.fromEntries(SHEETS.map((who) => [SHEET_PATH(who), PLACEHOLDER_BYTES])))
    await ensureSampleFiles(admin)
    const sheets = sheetUploads(uploads)
    expect(sheets).toHaveLength(6)
    for (const who of SHEETS) {
      const sent = sheets.find((u) => u.path === SHEET_PATH(who))!
      expect(sent.upsert, who).toBe(true)
      expect(sent.length, who).toBe(real(who).length)
    }
  })

  test('a bucket that is already right gets no sheet upload', async () => {
    const { ensureSampleFiles } = await fresh()
    const { admin, uploads } = fakeAdmin(Object.fromEntries(SHEETS.map((who) => [SHEET_PATH(who), real(who).length])))
    await ensureSampleFiles(admin)
    expect(sheetUploads(uploads)).toEqual([])
  })

  test('only the sheet that is missing or the wrong size is uploaded', async () => {
    const { ensureSampleFiles } = await fresh()
    const right = Object.fromEntries(SHEETS.map((who) => [SHEET_PATH(who), real(who).length]))
    delete right[SHEET_PATH('thabo')]
    right[SHEET_PATH('memo')] = PLACEHOLDER_BYTES
    const { admin, uploads } = fakeAdmin(right)
    await ensureSampleFiles(admin)
    const sheets = sheetUploads(uploads)
    expect(sheets.map((u) => [u.path, u.upsert]).sort()).toEqual([
      [SHEET_PATH('memo'), true],
      [SHEET_PATH('thabo'), false],
    ])
  })

  test('the folder is listed once, not once per sheet', async () => {
    const { ensureSampleFiles } = await fresh()
    const { admin, lists } = fakeAdmin()
    await ensureSampleFiles(admin)
    expect(lists).toEqual(['sample-papers/class-test-1'])
  })

  test('a sheet nobody can supply stops the call with a clear message and uploads nothing, not even a placeholder', async () => {
    const { ensureSampleFiles } = await fresh()
    const { admin, uploads, lists } = fakeAdmin()
    await expect(ensureSampleFiles(admin, { loadSheet: async () => null, ...noDisk })).rejects.toThrow(
      'sample sheet amina.png is not available in this runtime',
    )
    expect(uploads).toEqual([])
    expect(lists).toEqual([])
  })

  test('one missing sheet out of six is enough to stop: nothing is uploaded for the other five either', async () => {
    const { ensureSampleFiles } = await fresh()
    const { admin, uploads } = fakeAdmin()
    const loadSheet = async (who: string) => (who === 'memo' ? null : new Uint8Array([137, 80, 78, 71, 1]))
    await expect(ensureSampleFiles(admin, { loadSheet, ...noDisk })).rejects.toThrow('sample sheet memo.png is not available in this runtime')
    expect(uploads).toEqual([])
  })

  test('after a failure the next call tries again', async () => {
    const { ensureSampleFiles } = await fresh()
    const first = fakeAdmin()
    await expect(ensureSampleFiles(first.admin, { loadSheet: async () => null, ...noDisk })).rejects.toThrow('not available')
    const second = fakeAdmin()
    await ensureSampleFiles(second.admin)
    expect(sheetUploads(second.uploads)).toHaveLength(6)
  })

  test('a loader that returns the sheets wins over the disk files', async () => {
    const { ensureSampleFiles } = await fresh()
    const { admin, uploads } = fakeAdmin()
    const fromLoader = new Uint8Array([137, 80, 78, 71, 1, 2, 3])
    await ensureSampleFiles(admin, { loadSheet: async () => fromLoader, readDisk: (who) => real(who) })
    const sheets = sheetUploads(uploads)
    expect(sheets).toHaveLength(6)
    for (const u of sheets) expect(u.length).toBe(fromLoader.length)
  })

  test('a loader that returns null, or throws, for one sheet falls back to the disk file for that sheet', async () => {
    const { ensureSampleFiles } = await fresh()
    const { admin, uploads } = fakeAdmin()
    const fromLoader = new Uint8Array([137, 80, 78, 71, 1, 2, 3])
    const loadSheet = async (who: string) => {
      if (who === 'memo') return null
      if (who === 'amina') throw new Error('no context')
      return fromLoader
    }
    await ensureSampleFiles(admin, { loadSheet })
    const sheets = sheetUploads(uploads)
    expect(sheets.find((u) => u.path === SHEET_PATH('memo'))!.length).toBe(real('memo').length)
    expect(sheets.find((u) => u.path === SHEET_PATH('amina'))!.length).toBe(real('amina').length)
    expect(sheets.find((u) => u.path === SHEET_PATH('naledi'))!.length).toBe(fromLoader.length)
  })

  test('it runs once per process: a second call does not list or upload again', async () => {
    const { ensureSampleFiles } = await fresh()
    const { admin, uploads, lists } = fakeAdmin()
    await ensureSampleFiles(admin)
    const done = { uploads: uploads.length, lists: lists.length }
    await ensureSampleFiles(admin)
    expect({ uploads: uploads.length, lists: lists.length }).toEqual(done)
  })

  test('the teaching plan PDF is still uploaded the way it was: plain upload, and an object that exists is not an error', async () => {
    const { ensureSampleFiles } = await fresh()
    const { admin, uploads } = fakeAdmin({ 'curriculum/grade-6-teaching-plan.pdf': 1 })
    await ensureSampleFiles(admin)
    const pdf = uploads.filter((u) => u.path === 'curriculum/grade-6-teaching-plan.pdf')
    expect(pdf).toHaveLength(1)
    expect(pdf[0]!.upsert).toBe(false)
    expect(pdf[0]!.contentType).toBe('application/pdf')
  })
})
