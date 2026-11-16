// Where the topic map of a learner's class came from, and how a part of "My maths" shows its topics because of it (P115). Pure: no database, no clock.
//
// The CAPS maps teach some topics twice in a year (Grade 9 has "Algebraic expressions" and "Algebraic equations" in Term 1 and again in Term 3). A map
// stores one topic row for each, and the second one carries "(Term 3)" in its name so the two rows are told apart. A CAPS part therefore lists its
// topics under a "Term N" heading and shows the names without that suffix. A map that is not from CAPS (a curriculum the learner uploaded, or a
// teacher's own) keeps its names and its flat list as they always were.

/** What a screen needs to know about the map of the class it shows: whether it is the CAPS map, and the grade of the class. */
export type MapSource = { caps: boolean; grade: number | null }

/** True when the jsonb `draft` of an approved map says it came from the official curriculum (`source.kind` is 'caps'). Anything else is false. */
export function isCapsDraft(draft: unknown): boolean {
  const source = draft && typeof draft === 'object' ? (draft as { source?: unknown }).source : null
  return !!source && typeof source === 'object' && (source as { kind?: unknown }).kind === 'caps'
}

/** The line under the heading of a part of a CAPS map: "From the CAPS curriculum for Grade 9." Null for a map that is not CAPS, or a class with no grade. */
export const capsLine = (source: MapSource | null | undefined): string | null =>
  source?.caps && source.grade !== null ? `From the CAPS curriculum for Grade ${source.grade}.` : null

/** A name with the " (Term N)" the map adds to the second teaching of a topic taken off its end: "Algebraic expressions (Term 3)" is "Algebraic expressions". */
export const withoutTermSuffix = (name: string): string => name.replace(/\s*\(Term\s*\d+\)\s*$/i, '').trim() || name

/** One heading of a part: the term, and the topics of the part that are taught in it, in the order they came. */
export type TermGroup<T> = { term: number; topics: T[] }

/**
 * The topics of a part under their terms, lowest term first, each group in the order the topics came. Null when the part is not shown by term (the
 * map is not CAPS): the caller keeps its flat list. A topic of a CAPS map always has a term (1 to 4).
 */
export function groupByTerm<T extends { term: number }>(topics: T[], source: MapSource | null | undefined): TermGroup<T>[] | null {
  if (!source?.caps) return null
  const terms = [...new Set(topics.map((t) => t.term))].sort((a, b) => a - b)
  return terms.map((term) => ({ term, topics: topics.filter((t) => t.term === term) }))
}
