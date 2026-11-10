import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createServiceClient, type JemmaDb } from '../../packages/profiling/src/db'
import { bannedWords } from '../../packages/profiling/src/logic'
import { LongViewEvidenceListSchema, LongViewStoredTermsSchema } from '../../packages/profiling/src/schemas'
import { loadHistory } from '../../packages/profiling/src/tools/read/get-learner-history'
import { createSandbox, deleteSandbox } from '../seed/demo'
import { PATTERN_LEARNERS, statementFor } from '../seed/fixtures/long-view-wording'

// The patterns and Needs you items the seed makes for the Long view screens, so they work with no model call.
// The `marked` stages have them, the `start` stage does not.

const db: JemmaDb = createServiceClient({ SUPABASE_URL: process.env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY! })

type Made = { sandboxId: string; schoolId: string; kids: Record<string, string>; teacherId: string }
const made: Made[] = []

async function make(stage: 'start' | 'marked' | 'session_done'): Promise<Made> {
  const s = await createSandbox(db, { stage })
  const kids = (await db.from('children').select('id, first_name').eq('school_id', s.schoolId)).data!
  const row = (await db.from('demo_sandboxes').select('logins').eq('id', s.sandboxId).single()).data!
  const m = { sandboxId: s.sandboxId, schoolId: s.schoolId, kids: Object.fromEntries(kids.map((k) => [k.first_name, k.id])), teacherId: (row.logins as { teacher: { userId: string } }).teacher.userId }
  made.push(m)
  return m
}

const patternsOf = async (m: Made, name: string) => (await db.from('long_view_patterns').select('*').eq('child_id', m.kids[name]!).order('kind').order('family')).data!
const itemsOf = async (m: Made) => (await db.from('needs_you_items').select('child_id, kind, status, ref_id, title, detail, owner_id').eq('school_id', m.schoolId).eq('kind', 'review_long_view')).data!

let start: Made
let marked: Made
let sessionDone: Made

beforeAll(async () => {
  ;[start, marked, sessionDone] = [await make('start'), await make('marked'), await make('session_done')]
}, 300_000)

afterAll(async () => {
  for (const m of made) await deleteSandbox(db, m.sandboxId).catch(() => undefined)
})

describe('the start stage', () => {
  test('has no pattern and no Long view Needs you item', async () => {
    for (const name of Object.keys(start.kids)) expect(await patternsOf(start, name)).toEqual([])
    expect(await itemsOf(start)).toEqual([])
  })
})

describe.each([['marked'], ['session_done']] as const)('the %s stage', (stage) => {
  const m = () => (stage === 'marked' ? marked : sessionDone)

  test('Amina and Naledi have the drafts the job would have saved: one per candidate code finds, none shared', async () => {
    for (const name of PATTERN_LEARNERS) {
      const child = name.charAt(0).toUpperCase() + name.slice(1)
      const ctx = { db, schoolId: m().schoolId, eventId: null, env: {}, now: () => new Date() }
      const { history, noteLabels } = await loadHistory(ctx as never, m().kids[child]!)
      const rows = await patternsOf(m(), child)
      expect(history.candidates.length).toBeGreaterThan(0)
      expect(rows.map((r) => `${r.kind}:${r.family}`).sort()).toEqual(history.candidates.map((c) => c.key).sort())
      for (const row of rows) {
        const cand = history.candidates.find((c) => c.key === `${row.kind}:${row.family}`)!
        expect(row).toMatchObject({ status: 'draft', active: true, approved_by: null, discussed_by: null, dismissed_by: null })
        expect(row.title.length).toBeGreaterThan(0)
        expect(row.title.length).toBeLessThanOrEqual(70)
        expect(row.statement.length).toBeLessThanOrEqual(320)
        expect(bannedWords(`${row.title}\n${row.statement}`)).toEqual([])
        expect(row.statement).not.toContain(String.fromCharCode(0x2014))
        expect(row.statement).toBe(statementFor(cand))
        // The terms keep the newer ones after the run, flagged. The evidence is the candidate's, then the cited notes.
        const terms = LongViewStoredTermsSchema.parse(row.terms)
        expect(terms.filter((t) => t.since)).toHaveLength(cand.since.length)
        const evidence = LongViewEvidenceListSchema.parse(row.evidence)
        expect(evidence.slice(0, cand.evidence.length)).toEqual(cand.evidence)
        for (const e of evidence.filter((x) => x.kind === 'note')) expect(noteLabels.get(e.id)).toBe(e.label)
      }
    }
  })

  test('the other learners have none', async () => {
    for (const name of ['Thabo', 'Lerato', 'Sipho']) expect(await patternsOf(m(), name)).toEqual([])
  })

  test("the teacher has one open Needs you item for each of Amina and Naledi, and none for the others", async () => {
    const items = await itemsOf(m())
    expect(items.map((i) => i.child_id).sort()).toEqual([m().kids.Amina!, m().kids.Naledi!].sort())
    for (const i of items) {
      expect(i).toMatchObject({ status: 'open', owner_id: m().teacherId, ref_id: i.child_id })
      expect(i.detail).toMatch(/^\d patterns? to check before anything is shared\.$/)
    }
    expect(items.find((i) => i.child_id === m().kids.Amina!)!.title).toBe("Look at Amina's Long view")
  })
})

// Amina's numbers depend on the date: the Term 3 paper is dated 25 Sept 2026 and Class Test 1 on the day the sandbox is made.
const inQ4Of2026 = new Date().getUTCFullYear() === 2026 && new Date().getUTCMonth() >= 9
describe.skipIf(!inQ4Of2026)('in the last quarter of 2026', () => {
  test('Amina has the fractions struggle with two newer terms, and the shapes strength; Naledi the measurement struggle', async () => {
    const amina = await patternsOf(marked, 'Amina')
    expect(amina.map((r) => `${r.kind}:${r.family}`)).toEqual(['strength:shapes', 'struggle:fractions'])
    const fractions = amina.find((r) => r.family === 'fractions')!
    expect(fractions.title).toBe('Adding fractions is hard when the bottom numbers differ')
    expect(fractions.statement).toBe(
      'Marks in fractions stayed low from Grade 5 Term 3 to Grade 6 Term 2. The newer results, Homework in Grade 6 Term 3 and Class Test 1 in Grade 6 Term 4, were better.',
    )
    const terms = LongViewStoredTermsSchema.parse(fractions.terms)
    expect(terms.filter((t) => t.since).map((t) => [t.grade, t.term, t.percent])).toEqual([[6, 3, 63], [6, 4, 67]])
    const evidence = LongViewEvidenceListSchema.parse(fractions.evidence)
    const noteIds = evidence.filter((e) => e.kind === 'note').map((e) => e.id)
    expect(noteIds.length).toBeGreaterThan(0)
    const noteRows = (await db.from('learner_records').select('text').in('id', noteIds)).data!
    expect(noteRows.map((n) => n.text).join(' ')).toMatch(/bottom numbers/)
    const shapes = amina.find((r) => r.family === 'shapes')!
    expect(LongViewStoredTermsSchema.parse(shapes.terms).some((t) => t.since)).toBe(false)
    expect((await patternsOf(marked, 'Naledi')).map((r) => `${r.kind}:${r.family}`)).toEqual(['struggle:measurement'])
  })
})
