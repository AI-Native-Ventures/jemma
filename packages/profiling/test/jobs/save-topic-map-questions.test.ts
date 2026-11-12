import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { MemoryStore } from '../../src/ai'
import { TopicMapDraftSchema, type TopicMapDraft } from '../../src/schemas'
import type { ToolContext } from '../../src/tools/context'
import { saveTopicMapDraft } from '../../src/tools/save/save-topic-map-draft'
import { memoryDb, type MemoryDb } from '../helpers/memory-db'
import { parseReplays } from '../../../../scripts/load-replays'

// The save tool for the topic map draft asks the teacher about a topic that the model listed in two terms and asked nothing
// about. These tests run the real tool against a database in memory (no network).

const root = resolve(import.meta.dirname, '../../../..')
const topic = (name: string, check?: { reason: string; options: string[] }) => ({ name, family: 'algebra', prerequisites: [], misconceptions: [], ...(check ? { check } : {}) })
const draftOf = (grade: number, terms: [1 | 2 | 3 | 4, ReturnType<typeof topic>[]][]): TopicMapDraft => ({ grade, terms: terms.map(([term, topics]) => ({ term, topics })), leftOut: [] })

type World = { db: MemoryDb; ctx: ToolContext; mapId: string }
function world(grade: number): World {
  const schoolId = randomUUID()
  const classId = randomUUID()
  const mapId = randomUUID()
  const db = memoryDb({
    schools: [{ id: schoolId, country: 'ZA' }],
    classes: [{ id: classId, school_id: schoolId, teacher_id: randomUUID(), name: `${grade}A Mathematics`, grade, subject: 'Mathematics' }],
    curriculum_maps: [{ id: mapId, class_id: classId, status: 'draft', draft: {} }],
    curriculum_docs: [{ class_id: classId, storage_path: 'plan.pdf', title: 'plan', pages: 6 }],
  })
  return { db, mapId, ctx: { db, schoolId, eventId: null, env: { replayStore: new MemoryStore() }, now: () => new Date('2026-11-12T10:00:00Z') } }
}
const saved = (w: World) => w.db.tables.curriculum_maps![0]!.draft as TopicMapDraft
const toolRows = (w: World) => w.db.tables.tool_calls?.filter((r) => r.tool === 'save_topic_map_draft') ?? []
const activity = (w: World) => (w.db.tables.activity_log ?? []).map((r) => String(r.text))

describe('a topic listed in two terms with no question from the model', () => {
  const pair = () => draftOf(9, [[2, [topic('Linear equations'), topic('Ratio, rate and proportion')]], [3, [topic('Ratio, rate and proportion'), topic('Functions')]]])

  test('is saved with a question on both entries, and the answer of the tool says how many code added', async () => {
    const w = world(9)
    const out = await saveTopicMapDraft.run(w.ctx, { mapId: w.mapId, draft: pair() })
    expect(out).toEqual({ topics: 4, unsure: 2, codeQuestions: 2 })
    const both = saved(w).terms.flatMap((t) => t.topics.filter((x) => x.name === 'Ratio, rate and proportion').map((x) => [t.term, x.check?.reason]))
    expect(both).toEqual([[2, 'Listed in Term 2 and Term 3. Which term is it taught in?'], [3, 'Listed in Term 2 and Term 3. Which term is it taught in?']])
  })

  test('the tool log row and the activity line say how many questions code added, and the Needs you line counts them', async () => {
    const w = world(9)
    await saveTopicMapDraft.run(w.ctx, { mapId: w.mapId, draft: pair() })
    expect(toolRows(w)[0]).toMatchObject({ ok: true, output: { topics: 4, unsure: 2, codeQuestions: 2 } })
    expect(activity(w)).toContain('Asked you about 2 topics that the plan lists in more than one term (the questions came from code, not from the model)')
    expect(w.db.tables.needs_you_items![0]!.detail).toBe('4 topics in 2 terms. Check 2, then approve.')
  })
})

describe('a topic listed in two terms that the model already asked about', () => {
  test('keeps the question of the model and gets no second one', async () => {
    const w = world(9)
    const asked = { reason: 'Listed in Terms 2 and 3', options: ['Keep in Term 2', 'Move to Term 3'] }
    const out = await saveTopicMapDraft.run(w.ctx, { mapId: w.mapId, draft: draftOf(9, [[2, [topic('Ratio', asked)]], [3, [topic('Ratio')]]]) })
    expect(out).toEqual({ topics: 2, unsure: 1, codeQuestions: 0 })
    expect(saved(w).terms.flatMap((t) => t.topics.map((x) => x.check))).toEqual([asked, undefined])
    expect(activity(w).some((l) => l.includes('came from code'))).toBe(false)
  })
})

describe('the recorded map of the demo saves exactly as it did', () => {
  /** The recorded answers of the Grade 6 Mathematics draft: every recorded answer that holds a topic map draft the save tool would take. */
  function recordedDrafts(): TopicMapDraft[] {
    const rows = parseReplays(new Uint8Array(readFileSync(join(root, 'fixtures/ai-replays.json.gz'))))
    const out: TopicMapDraft[] = []
    for (const r of rows) {
      const content = (r.response as { content?: { text?: string }[] }).content
      const text = Array.isArray(content) ? content.map((c) => c.text ?? '').join('') : ''
      const start = text.lastIndexOf('{"draft"')
      if (start < 0) continue
      try {
        const parsed = TopicMapDraftSchema.safeParse((JSON.parse(text.slice(start, text.lastIndexOf('}') + 1)) as { draft: unknown }).draft)
        if (parsed.success && parsed.data.grade === 6 && parsed.data.terms.length) out.push(parsed.data)
      } catch {
        // an answer that is not a map
      }
    }
    return out
  }

  test('there is at least one recorded Grade 6 map, and none of them has a topic in two terms', () => {
    const drafts = recordedDrafts()
    expect(drafts.length).toBeGreaterThan(0)
    for (const d of drafts) {
      const names = d.terms.flatMap((t) => t.topics.map((x) => x.name.trim().toLowerCase().replace(/\s+/g, ' ')))
      expect(new Set(names).size).toBe(names.length)
    }
  })

  test('each saves with no question added by code, the same topics in the same terms, and the same Needs you line', async () => {
    for (const draft of recordedDrafts()) {
      const w = world(6)
      const out = await saveTopicMapDraft.run(w.ctx, { mapId: w.mapId, draft })
      expect(out.codeQuestions).toBe(0)
      const shape = (d: TopicMapDraft) => d.terms.map((t) => [t.term, t.topics.map((x) => [x.name, x.family, x.check ?? null])])
      expect(shape(saved(w))).toEqual(shape(draft))
      const topics = draft.terms.reduce((n, t) => n + t.topics.length, 0)
      const unsure = draft.terms.reduce((n, t) => n + t.topics.filter((x) => x.check).length, 0)
      expect(w.db.tables.needs_you_items![0]!.detail).toBe(`${topics} topics in ${draft.terms.length} terms.${unsure ? ` Check ${unsure}, then approve.` : ''}`)
      expect(activity(w).some((l) => l.includes('came from code'))).toBe(false)
    }
  })
})
