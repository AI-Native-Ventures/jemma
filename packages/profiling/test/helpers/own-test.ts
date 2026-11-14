import { MemoryStore } from '../../src/ai'
import type { MarkedTestRead } from '../../src/schemas/marked-test'
import type { ToolContext } from '../../src/tools/context'
import { memoryDb, type MemoryDb } from './memory-db'

/**
 * A learner's own twin, a private class with an approved topic map, and one marked test (a paper of no test) with two photo pages in storage,
 * all in memory. For the tests of the two tools, the plan and the job behind `own_test.snapped`. No database, no network, no model.
 */

export const SCHOOL = '11111111-1111-4111-8111-111111111111'
export const OTHER_SCHOOL = '99999999-9999-4999-8999-999999999999'
export const CHILD = '33333333-3333-4333-8333-333333333333'
export const CLASS = '22222222-2222-4222-8222-222222222222'
export const MAP = '44444444-4444-4444-8444-444444444444'
export const PAPER = '55555555-5555-4555-8555-555555555555'
export const EVENT = '88888888-8888-4888-8888-888888888888'
export const NOW = new Date('2026-11-14T18:00:00.000Z')
/** The first bytes of a JPEG: enough to be a file in storage. */
export const PHOTO = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
export const PHOTO_BASE64 = Buffer.from(PHOTO).toString('base64')
/** A real 1 by 1 PNG, so that the type a model is told for a page is the type of its bytes. */
export const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))
export const PAGE_1 = `${SCHOOL}/${CHILD}/own-test/${PAPER}-1.jpg`
export const PAGE_2 = `${SCHOOL}/${CHILD}/own-test/${PAPER}-2.png`

type Row = Record<string, unknown>

/** The topics of the approved map, written out of order on purpose: the tool must give them term by term, then by position. */
export const TOPICS: Row[] = [
  { id: 't-adding', map_id: MAP, name: 'Adding fractions with different denominators', family: 'fractions', term: 2, position: 1, prerequisite_ids: [] },
  { id: 't-decimals', map_id: MAP, name: 'Decimal fractions', family: 'decimals', term: 2, position: 2, prerequisite_ids: [] },
  { id: 't-equivalent', map_id: MAP, name: 'Equivalent fractions', family: 'fractions', term: 1, position: 2, prerequisite_ids: [] },
  { id: 't-whole', map_id: MAP, name: 'Whole numbers', family: 'numbers', term: 1, position: 1, prerequisite_ids: [] },
]

export function ownTestWorld(over: Record<string, Row[]> = {}, files: Record<string, Record<string, Uint8Array>> = { papers: { [PAGE_1]: PHOTO, [PAGE_2]: PHOTO } }): MemoryDb {
  return memoryDb(
    {
      children: [{ id: CHILD, school_id: SCHOOL, first_name: 'Amina', grade: 6 }],
      classes: [{ id: CLASS, school_id: SCHOOL, subject: 'Mathematics', grade: 6 }],
      enrolments: [{ class_id: CLASS, child_id: CHILD }],
      curriculum_maps: [{ id: MAP, class_id: CLASS, status: 'approved' }],
      topics: TOPICS,
      papers: [{ id: PAPER, child_id: CHILD, test_id: null, owner: 'parent', kind: 'test', status: 'queued', name_read: null, total: null, error: null }],
      paper_pages: [
        { paper_id: PAPER, page_no: 2, storage_path: PAGE_2 },
        { paper_id: PAPER, page_no: 1, storage_path: PAGE_1 },
      ],
      question_results: [],
      activity_log: [],
      tool_calls: [],
      ...over,
    },
    files,
  )
}

export const ctxFor = (db: MemoryDb, over: Partial<ToolContext> = {}): ToolContext => ({
  db,
  schoolId: SCHOOL,
  eventId: EVENT,
  env: { replayStore: new MemoryStore() },
  now: () => NOW,
  ...over,
})

type Question = MarkedTestRead['questions'][number]
/** One question the way the model reads it: sure of itself unless said otherwise. */
export const q = (n: string, result: Question['result'], topic: string, over: Partial<Question> = {}): Question => ({
  n,
  prompt: `question ${n}`,
  answerAsWritten: `answer ${n}`,
  result,
  topic,
  confidence: 0.95,
  ...over,
})

/** What a model read from a marked test. */
export const readOf = (questions: Question[], over: Partial<MarkedTestRead> = {}): MarkedTestRead => ({ pageUsable: true, questions, ...over })
