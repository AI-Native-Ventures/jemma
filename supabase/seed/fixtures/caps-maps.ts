import { capsDraft, capsSource } from '../../../packages/profiling/src/curriculum/caps'
import type { TopicMapDraft } from '../../../packages/profiling/src/schemas'
import { HILLVIEW_CLASSES } from './hillview'

// The CAPS map each made-up class of the demo school starts with, already approved: the official South African Mathematics topics of the
// class's grade (`packages/profiling/src/curriculum/caps.ts`). 6B is not here: its first step in the demo path is the teacher's own upload,
// and its recorded answers depend on that. Pure: no database, no clock. The seed writes the rows.

/** A row of `topics`, without the map it belongs to. */
export type TopicRow = { term: number; position: number; name: string; short_name: string; family: string; misconceptions: string[] }

/** One row for every topic of a draft, in the order of the draft, as the seed writes the topics of an approved map. */
export function topicRowsOf(draft: TopicMapDraft): TopicRow[] {
  return draft.terms.flatMap((t) =>
    t.topics.map((x, i) => ({ term: t.term, position: i + 1, name: x.name, short_name: x.shortName ?? x.name, family: x.family, misconceptions: x.misconceptions })),
  )
}

export type CapsClassMap = {
  classKey: string
  grade: number
  draft: TopicMapDraft
  source: { kind: 'caps'; title: string; publisher: string; address: string }
  /** What goes in the `draft` column of the approved map: the draft and its source. */
  stored: TopicMapDraft & { source: CapsClassMap['source'] }
  rows: TopicRow[]
  /** The line of the activity log, the same words as when a teacher taps "Start from the CAPS map". */
  log: string
}

/** The classes that start with a CAPS map: every class with made-up learners (5A, 7A, 4A), in the order of the school. */
export function capsClassMaps(): CapsClassMap[] {
  return HILLVIEW_CLASSES.filter((c) => c.learners === 'made-up').map((c) => {
    const draft = capsDraft(c.grade)
    const found = capsSource(c.grade)
    if (!draft || !found) throw new Error(`demo seed: no CAPS map for Grade ${c.grade}`)
    const source = { kind: 'caps' as const, ...found }
    const rows = topicRowsOf(draft)
    return { classKey: c.key, grade: c.grade, draft, source, stored: { ...draft, source }, rows, log: `Loaded the CAPS map for Grade ${c.grade}: ${rows.length} topics` }
  })
}
