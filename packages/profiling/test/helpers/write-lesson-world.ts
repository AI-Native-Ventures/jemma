import { MockLanguageModelV4 } from 'ai/test'
import { MemoryStore } from '../../src/ai'
import { runJobWriteLesson } from '../../src/jobs/cloud/write-lesson'
import type { ToolContext } from '../../src/tools/context'
import { memoryDb, type MemoryDb } from './memory-db'

/**
 * What the lesson-writing model is asked, for a class of any subject, grade and country, in memory. No database, no network, no live model.
 *
 * The test file that uses this must replace the tool `get_child_context` with a double that returns `CHILD_INFO` (`vi.mock` is per file), and the
 * context lookup with the identity. See the files that import this one.
 */

export const SCHOOL = '11111111-1111-4111-8111-111111111111'
export const CLASS = '22222222-2222-4222-8222-222222222222'
export const CHILD = '33333333-3333-4333-8333-333333333333'
export const MAP = '44444444-4444-4444-8444-444444444444'
export const TOPIC = '66666666-6666-4666-8666-666666666666'
export const SESSION = '55555555-5555-4555-8555-555555555555'

/** What `get_child_context` hands the job: fixed, so that the data block of a baseline class can be pinned to the byte. */
export const CHILD_INFO = {
  profile: {
    child: { id: CHILD, firstName: 'Amina', grade: 6 },
    gaps: [{ topicName: 'Equivalent fractions', stage: 'practising', misconceptions: ['adds the tops and the bottoms'] }],
  },
  gaps: [{ topicName: 'Equivalent fractions', stage: 'practising', misconceptions: ['adds the tops and the bottoms'] }],
  formatTrials: [{ topicFamily: 'fractions', format: 'diagram', score: 3 }],
  session: {
    id: SESSION,
    status: 'planned' as const,
    plannedFor: '2026-11-14',
    lessonId: null,
    topicName: 'Equivalent fractions',
    format: 'diagram' as const,
    warmup: [],
  },
}

export type ClassSpec = { subject: string; grade: number; country: string; family?: string | null; topicName?: string }

export function writeLessonWorld(spec: ClassSpec): MemoryDb {
  return memoryDb({
    schools: [{ id: SCHOOL, country: spec.country }],
    classes: [{ id: CLASS, school_id: SCHOOL, subject: spec.subject, grade: spec.grade }],
    curriculum_maps: [{ id: MAP, class_id: CLASS }],
    topics: [{ id: TOPIC, map_id: MAP, name: spec.topicName ?? 'Equivalent fractions', family: spec.family === undefined ? 'fractions' : spec.family }],
    sessions: [{ id: SESSION, child_id: CHILD, status: 'planned', topic_id: TOPIC, topic_name: spec.topicName ?? 'Equivalent fractions', planned_for: '2026-11-14' }],
    enrolments: [{ class_id: CLASS, child_id: CHILD }],
  })
}

export type Seen = { system: string; user: string }

/** A model that replies with `reply` and keeps the system text and the user's words of every request. */
export function recordingModel(reply: string, seen: Seen[]) {
  return new MockLanguageModelV4({
    modelId: 'mock',
    doGenerate: async (options: unknown) => {
      const prompt = (options as { prompt: { role: string; content: unknown }[] }).prompt
      const system = prompt.find((m) => m.role === 'system')!.content as string
      const parts = prompt.find((m) => m.role === 'user')!.content as { type: string; text?: string }[]
      seen.push({ system, user: parts.find((p) => p.type === 'text')!.text! })
      return {
        content: [{ type: 'text', text: reply }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } },
        warnings: [],
      } as never
    },
  })
}

/** Runs the job `write_lesson` once for a class, with the prompt text given, and returns what the model was asked first. */
export async function askedFor(spec: ClassSpec, prompt: string, reply = '{}'): Promise<Seen> {
  const seen: Seen[] = []
  const db = writeLessonWorld(spec)
  const ctx: ToolContext = { db, schoolId: SCHOOL, eventId: null, env: { replayStore: new MemoryStore() }, now: () => new Date('2026-11-14T10:00:00Z') }
  // The reply is not a lesson, so the job fails after its attempts; what the model was asked is what is looked at.
  await runJobWriteLesson(ctx, '', { childId: CHILD, sessionId: SESSION }, { model: recordingModel(reply, seen), prompt }).catch(() => undefined)
  if (!seen[0]) throw new Error('the model was never asked')
  return seen[0]
}
