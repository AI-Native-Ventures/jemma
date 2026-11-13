import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, test, vi } from 'vitest'
import { createServiceClient, type JemmaDb } from '../src/db'
import { loadEnv } from './helpers/env'
import { documentPath, loadTruth } from '../../../evals/lib/unseen-truth'
import { makeFixture, type RunFixture } from '../../../evals/lib/unseen-run'

// The real database, once: the school, the class of the document's grade and subject, the map and the document that a live run
// of the curriculum reader starts from are made, read back and deleted. No model, no job. This is what the live script does
// first, so a wrong column or a missing bucket shows here and not in the middle of the live runs.
// The database is shared with other workers and answers in seconds, not milliseconds, when they run their suites.
vi.setConfig({ testTimeout: 600_000, hookTimeout: 600_000 })

const root = resolve(import.meta.dirname, '../../..')
const env = loadEnv()
const db: JemmaDb = createServiceClient({ SUPABASE_URL: env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY! })
let fixture: RunFixture | null = null

afterAll(async () => {
  await fixture?.cleanup().catch(() => undefined)
})

describe('the school a live run starts from, in the real database', () => {
  test('a class of Grade 4 Mathematics in Kenya, with its document, is made, and everything is gone after clean-up', async () => {
    const truth = loadTruth('grade4-mathematics-ke')
    const bytes = new Uint8Array(readFileSync(documentPath(truth)))
    fixture = await makeFixture(db, truth, bytes, 4)
    const cls = await db.from('classes').select('grade, subject, school_id').eq('id', fixture.classId).single()
    expect(cls.data).toMatchObject({ grade: 4, subject: 'Mathematics', school_id: fixture.schoolId })
    const school = await db.from('schools').select('country').eq('id', fixture.schoolId).single()
    expect(school.data?.country).toBe('KE')
    const map = await db.from('curriculum_maps').select('status').eq('id', fixture.mapId).single()
    expect(map.data?.status).toBe('draft')
    const docs = await db.from('curriculum_docs').select('storage_path, pages').eq('class_id', fixture.classId)
    expect(docs.data).toHaveLength(1)
    expect(docs.data![0]!.pages).toBe(4)
    const stored = await db.storage.from('curriculum').download(docs.data![0]!.storage_path)
    expect(stored.error).toBeNull()
    expect(stored.data!.size).toBe(bytes.length)

    const { schoolId, classId } = fixture
    await fixture.cleanup()
    fixture = null
    expect((await db.from('schools').select('id').eq('id', schoolId)).data).toEqual([])
    expect((await db.from('classes').select('id').eq('id', classId)).data).toEqual([])
    // the folder is listed from the database of the bucket (a download may still be answered from a cache for a while)
    const folder = docs.data![0]!.storage_path.split('/').slice(0, -1).join('/')
    expect((await db.storage.from('curriculum').list(folder)).data).toEqual([])
  })
})
