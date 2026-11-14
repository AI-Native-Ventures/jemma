import grade1 from '../../../../fixtures/curriculum/caps/grade-1.json'
import grade2 from '../../../../fixtures/curriculum/caps/grade-2.json'
import grade3 from '../../../../fixtures/curriculum/caps/grade-3.json'
import grade4 from '../../../../fixtures/curriculum/caps/grade-4.json'
import grade5 from '../../../../fixtures/curriculum/caps/grade-5.json'
import grade6 from '../../../../fixtures/curriculum/caps/grade-6.json'
import grade7 from '../../../../fixtures/curriculum/caps/grade-7.json'
import grade8 from '../../../../fixtures/curriculum/caps/grade-8.json'
import grade9 from '../../../../fixtures/curriculum/caps/grade-9.json'
import grade10 from '../../../../fixtures/curriculum/caps/grade-10.json'
import grade11 from '../../../../fixtures/curriculum/caps/grade-11.json'
import grade12 from '../../../../fixtures/curriculum/caps/grade-12.json'
import type { TopicMapDraft } from '../schemas/curriculum'

// The official South African Mathematics curriculum (CAPS), Grades 1 to 12, as a draft topic map. The 12 files are in
// `fixtures/curriculum/caps/` (their README says where they come from). They are imported, not read at run time: a Worker has no disk,
// so the data is part of the bundle of the web app and of the agent. Pure functions, no database, no model.

type CapsTopic = { name: string; shortName: string; family: string; capsName: string; contentArea: string }
type CapsFile = {
  grade: number
  phase: string
  subject: string
  country: string
  source: { title: string; publisher: string; url: string; pages: string }
  terms: { term: number; topics: CapsTopic[] }[]
}

const FILES: Record<number, CapsFile> = {
  1: grade1 as CapsFile,
  2: grade2 as CapsFile,
  3: grade3 as CapsFile,
  4: grade4 as CapsFile,
  5: grade5 as CapsFile,
  6: grade6 as CapsFile,
  7: grade7 as CapsFile,
  8: grade8 as CapsFile,
  9: grade9 as CapsFile,
  10: grade10 as CapsFile,
  11: grade11 as CapsFile,
  12: grade12 as CapsFile,
}

/** The grades that have a CAPS map: 1 to 12. */
export const capsGrades = (): number[] => Object.keys(FILES).map(Number)

const fileOf = (grade: number): CapsFile | null => (Number.isInteger(grade) ? (FILES[grade] ?? null) : null)

/**
 * The document a grade's topics were read from, for the screen and the log. Null for a grade with no CAPS map.
 * The title and the publisher are shown as a sentence ("From {title}, {publisher}."), so what the files carry beside them is dropped: the
 * name of the PDF file and the side notes in brackets after the publisher.
 */
export function capsSource(grade: number): { title: string; publisher: string; address: string } | null {
  const file = fileOf(grade)
  if (!file) return null
  const title = file.source.title.replace(/\s*\((?:PDF file name|National Curriculum Statement)[^)]*\)/g, '').trim()
  const publisher = file.source.publisher.replace(/\s*\(.*$/, '').trim()
  return { title, publisher, address: file.source.url }
}

/**
 * The CAPS map of a grade as a draft topic map: the file's terms and topics in the file's order, with the names, short names and strands
 * as the file has them. The documents do not give prerequisites or usual mistakes, so those stay empty. Nothing is flagged for a check,
 * nothing is left out, and a term with no topic is not listed. A new object on every call. Null for a grade with no CAPS map.
 */
export function capsDraft(grade: number): TopicMapDraft | null {
  const file = fileOf(grade)
  if (!file) return null
  return {
    grade: file.grade,
    terms: file.terms
      .filter((t) => t.topics.length > 0)
      .map((t) => ({
        term: t.term as 1 | 2 | 3 | 4,
        topics: t.topics.map((x) => ({ name: x.name, shortName: x.shortName, family: x.family, prerequisites: [], misconceptions: [] })),
      })),
    leftOut: [],
  }
}
