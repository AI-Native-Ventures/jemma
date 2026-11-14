import type { Json, JemmaDb } from '../db'
import type { TopicMapDraft } from '../schemas/curriculum'
import { capsDraft, capsSource } from './caps'

// The CAPS map of a grade as the rows an approved map is made of, and the one function that writes an approved map. The demo seed uses them
// (the made-up classes 5A, 7A and 4A, the marked stage's own map and a learner's own workspace) and so does a learner who adds a grade to their
// own workspace, so the rows are the same everywhere. No model, no clock: the caller gives the time.

/** A row of `topics`, without the map it belongs to. */
export type TopicRow = { term: number; position: number; name: string; short_name: string; family: string; misconceptions: string[] }

/** One row for every topic of a draft, in the order of the draft, as the seed writes the topics of an approved map. */
export function topicRowsOf(draft: TopicMapDraft): TopicRow[] {
  return draft.terms.flatMap((t) =>
    t.topics.map((x, i) => ({ term: t.term, position: i + 1, name: x.name, short_name: x.shortName ?? x.name, family: x.family, misconceptions: x.misconceptions })),
  )
}

export type CapsMap = {
  grade: number
  draft: TopicMapDraft
  source: { kind: 'caps'; title: string; publisher: string; address: string }
  /** What goes in the `draft` column of the approved map: the draft and its source. */
  stored: TopicMapDraft & { source: CapsMap['source'] }
  rows: TopicRow[]
  /** The line of the activity log, the same words as when a teacher taps "Start from the CAPS map". */
  log: string
}

/** The CAPS map of a grade, ready to be written as an approved map. Null for a grade with no CAPS map (only Grades 1 to 12 have one). */
export function capsMapOf(grade: number): CapsMap | null {
  const draft = capsDraft(grade)
  const found = capsSource(grade)
  if (!draft || !found) return null
  const source = { kind: 'caps' as const, ...found }
  const rows = topicRowsOf(draft)
  return { grade, draft, source, stored: { ...draft, source }, rows, log: `Loaded the CAPS map for Grade ${grade}: ${rows.length} topics` }
}

/** True when a school's country is South Africa. A school stores its country as a code (`ZA`); the name is let through too, as the teacher's own button does. */
export const isSouthAfrica = (country: string): boolean => /^(za|south africa)$/i.test(country.trim())

type Res<T> = PromiseLike<{ data: T; error: { message: string } | null }>

async function must<T>(q: Res<T>, what: string): Promise<NonNullable<T>> {
  const { data, error } = await q
  if (error || data === null || data === undefined) throw new Error(`approved map: ${what}: ${error?.message ?? 'no row'}`)
  return data as NonNullable<T>
}

/**
 * An approved topic map of a class and its topic rows: the map first, then every topic in one insert. The demo seed writes 6B's map this way,
 * each made-up class that starts from the CAPS map, and so does a learner's own class.
 */
export async function writeApprovedMap(
  db: JemmaDb,
  input: { classId: string; stored: unknown; approvedAt: string; rows: TopicRow[] },
): Promise<{ map: { id: string }; topicRows: { id: string; name: string }[] }> {
  const map = await must(
    db.from('curriculum_maps').insert({ class_id: input.classId, status: 'approved', draft: input.stored as NonNullable<Json>, approved_at: input.approvedAt }).select('id').single(),
    'map',
  )
  const topicRows = await must(db.from('topics').insert(input.rows.map((r) => ({ map_id: map.id, ...r }))).select('id, name'), 'topics')
  return { map, topicRows }
}
