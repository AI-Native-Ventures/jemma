import { randomUUID } from 'node:crypto'
import { MemoryStore, type AiEnv } from '../../packages/profiling/src/ai'
import type { JemmaDb } from '../../packages/profiling/src/db'
import { runDraftMap } from '../../packages/profiling/src/jobs/cloud/draft-map'
import { ok } from '../../packages/profiling/src/tools/context'
import { TopicMapDraftSchema, type TopicMapDraft } from '../../packages/profiling/src/schemas'
import { brief } from './checks'
import { RESULT_VERSION, scoreDraft, type Truth, type UnseenResult } from './unseen'

type ModelGetter = typeof import('../../packages/profiling/src/ai').getModel

/**
 * One live run of the curriculum reader (`draft_map`) on one document, in this process: a small made-up school and class of
 * the document's grade, subject and country, the document in storage, the real job with the free models, then the draft the
 * job saved, scored in code. Everything it makes is deleted at the end, also when the run fails.
 */

const MESSAGE_AT_LEAST = /rate.?limit|overloaded|high demand|provider returned error|internal (server )?error|upstream|too many requests|temporarily|capacity|no endpoints found|timed? ?out/i

type Errorish = { statusCode?: number; status?: number; message?: string; cause?: unknown; lastError?: unknown; errors?: unknown[] }

/** A failure of this machine's own connection: the request never got an answer, from the provider or from anyone. */
const NETWORK_AT_LEAST = /fetch failed|cannot connect to api|ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ENETUNREACH|ENETDOWN|EHOSTUNREACH|EPIPE|UND_ERR_CONNECT_TIMEOUT|UND_ERR_SOCKET|socket hang up|network (connection )?(was )?lost|network is unreachable|getaddrinfo/i

/**
 * The words of a failure of this machine's network (no connection, no name lookup, a dropped socket), else null. It is not a
 * provider answer: the script repeats such a try without using one of its repeats and says so in the result. A try that got an
 * HTTP answer of any kind (a 429, a 5xx) is the provider's and is not this.
 */
export function networkProblem(err: unknown, depth = 0): string | null {
  const e = err as (Errorish & { code?: string }) | null
  if (!e || typeof e !== 'object' || depth > 4) return null
  const code = e.statusCode ?? e.status
  if (code !== undefined) return null
  for (const inner of [e.lastError, e.cause, ...(e.errors ?? [])]) {
    const found = networkProblem(inner, depth + 1)
    if (found) return found
  }
  const text = `${typeof e.code === 'string' ? `${e.code} ` : ''}${typeof e.message === 'string' ? e.message : ''}`
  return NETWORK_AT_LEAST.test(text) ? brief(text.replace(/^Failed after \d+ attempts?\. Last error:\s*/i, ''), 200) : null
}

/** The words of the provider when it gave no answer (a rate limit, a capacity or server error, a 429 or a 5xx), else null. */
export function noAnswerReason(err: unknown, depth = 0): string | null {
  const e = err as Errorish | null
  if (!e || typeof e !== 'object' || depth > 4) return null
  // the error that is inside (a retry wrapper holds the last error, a failed call holds its cause) tells it best
  for (const inner of [e.lastError, e.cause, ...(e.errors ?? [])]) {
    const found = noAnswerReason(inner, depth + 1)
    if (found) return found
  }
  const message = typeof e.message === 'string' ? e.message : ''
  const code = e.statusCode ?? e.status
  const own = (code !== undefined && (code === 408 || code === 429 || code >= 500)) || MESSAGE_AT_LEAST.test(message)
  if (!own) return null
  // "Failed after 3 attempts. Last error: Provider returned error" is told as the last error only
  return brief(message.replace(/^Failed after \d+ attempts?\. Last error:\s*/i, '') || `HTTP ${code ?? 'error'}`, 200)
}

export type RunFixture = {
  schoolId: string
  teacherId: string
  classId: string
  mapId: string
  cleanup(): Promise<void>
}

/** The row of a query, or an error that says which step failed. */
async function must<T>(q: Parameters<typeof ok<T>>[0], what: string): Promise<NonNullable<T>> {
  try {
    return await ok(q)
  } catch (err) {
    throw new Error(`${what}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** A school, a teacher, a class of the document's grade and subject, an empty draft map and the document itself. */
export async function makeFixture(db: JemmaDb, truth: Truth, bytes: Uint8Array, pages: number, tag = `unseen${Date.now()}${randomUUID().slice(0, 6)}`): Promise<RunFixture> {
  const created = await db.auth.admin.createUser({ email: `${tag}-teacher@example.test`, password: `${tag}-Passw0rd!`, email_confirm: true })
  if (created.error) throw new Error(`teacher: ${created.error.message}`)
  const teacherId = created.data.user.id
  let schoolId: string | null = null
  const path = (id: string) => `${tag}/${id}/${truth.file}`
  let uploaded: string | null = null
  const cleanup = async () => {
    if (uploaded) await db.storage.from('curriculum').remove([uploaded])
    if (schoolId) await db.from('schools').delete().eq('id', schoolId)
    await db.auth.admin.deleteUser(teacherId)
  }
  try {
    const school = await must(db.from('schools').insert({ name: `${tag} School`, country: truth.country, ai_runner: 'cloud' }).select('id').single(), 'school')
    schoolId = school.id
    await must(db.from('profiles').insert({ user_id: teacherId, role: 'teacher', display_name: 'Ms Unseen', school_id: schoolId }).select('user_id').single(), 'profile')
    const cls = await must(
      db.from('classes').insert({ school_id: schoolId, teacher_id: teacherId, name: `${truth.grade}A ${truth.subject}`, grade: truth.grade, year: 2026, subject: truth.subject, join_code: tag.slice(-12) }).select('id').single(),
      'class',
    )
    const map = await must(db.from('curriculum_maps').insert({ class_id: cls.id, status: 'draft' }).select('id').single(), 'map')
    uploaded = path(cls.id)
    const up = await db.storage.from('curriculum').upload(uploaded, bytes, { contentType: truth.mimeType, upsert: true })
    if (up.error) throw new Error(`document: ${up.error.message}`)
    await must(db.from('curriculum_docs').insert({ class_id: cls.id, storage_path: uploaded, title: truth.file.replace(/\.[^.]+$/, ''), pages }).select('id').single(), 'document row')
    return { schoolId, teacherId, classId: cls.id, mapId: map.id, cleanup }
  } catch (err) {
    await cleanup().catch(() => {})
    throw err
  }
}

export type RunArgs = {
  db: JemmaDb
  aiEnv: Omit<AiEnv, 'replayStore'>
  getModel: ModelGetter
  truth: Truth
  bytes: Uint8Array
  pages: number
  runId: string
  n: number
  attempt: number
  /** Injected in tests. */
  now?: () => Date
}

/** Runs the job once and scores what it saved. Never throws: a failed run is a result with the error text. */
export async function runOnce(a: RunArgs): Promise<UnseenResult> {
  const now = a.now ?? (() => new Date())
  const startedAt = now().toISOString()
  const began = Date.now()
  let calls = 0
  let error: string | null = null
  let noAnswer: string | null = null
  let machineNetwork: string | null = null
  let fixture: RunFixture | null = null
  let way: UnseenResult['way'] = null
  let visionProblem: string | null = null
  let model: string | null = null
  let draft: TopicMapDraft | null = null
  try {
    fixture = await makeFixture(a.db, a.truth, a.bytes, a.pages)
    const ctx = {
      db: a.db,
      schoolId: fixture.schoolId,
      eventId: null,
      env: { ...a.aiEnv, AI_MODE: 'live' as const, replayStore: new MemoryStore() },
      now: () => new Date(),
    }
    try {
      await runDraftMap(ctx, null, { mapId: fixture.mapId }, {
        getModel: (kind, env) => {
          calls++
          return a.getModel(kind, env)
        },
      })
    } catch (err) {
      machineNetwork = networkProblem(err)
      noAnswer = machineNetwork ? null : noAnswerReason(err)
      error = err instanceof Error ? err.message : String(err)
    }
    const log = await a.db.from('tool_calls').select('input, model').eq('school_id', fixture.schoolId).eq('tool', 'read_documents').order('started_at', { ascending: false }).limit(1)
    const row = log.data?.[0]
    if (row) {
      const input = row.input as { way?: string; visionProblem?: string | null }
      way = input.way === 'text' ? 'text' : input.way === 'vision' ? 'vision' : null
      visionProblem = input.visionProblem ?? null
      model = row.model
    }
    const saved = await a.db.from('curriculum_maps').select('draft').eq('id', fixture.mapId).single()
    const parsed = TopicMapDraftSchema.safeParse(saved.data?.draft)
    draft = parsed.success ? parsed.data : null
  } catch (err) {
    // the database is reached over the same network: a try that could not even make its school for want of a connection is not a fail
    machineNetwork = networkProblem(err)
    error = `could not run: ${err instanceof Error ? err.message : String(err)}`
  } finally {
    await fixture?.cleanup().catch((err) => {
      error = `${error ? `${error}; ` : ''}cleanup: ${err instanceof Error ? err.message : String(err)}`
    })
  }

  const seconds = Number(((Date.now() - began) / 1000).toFixed(1))
  const base = { version: RESULT_VERSION, runId: a.runId, docId: a.truth.id, n: a.n, attempt: a.attempt, startedAt, seconds, calls, way, visionProblem, model } as const
  if (error && !draft) {
    if (machineNetwork) return { ...base, verdict: 'no_answer', error: null, noAnswer: null, machineNetwork, checks: [], figures: null, draft: null }
    return { ...base, verdict: noAnswer ? 'no_answer' : 'fail', error: noAnswer ? null : error, noAnswer, checks: [], figures: null, draft: null }
  }
  if (!draft) return { ...base, verdict: 'fail', error: 'the job saved no draft', noAnswer: null, checks: [], figures: null, draft: null }
  const score = scoreDraft(draft, a.truth)
  return { ...base, verdict: score.pass ? 'pass' : 'fail', error: error, noAnswer: null, checks: score.checks, figures: score.figures, draft }
}
