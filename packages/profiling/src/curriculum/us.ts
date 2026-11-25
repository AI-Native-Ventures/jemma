import grade1 from '../../../../fixtures/curriculum/us/grade-1.json' with { type: 'json' }
import grade2 from '../../../../fixtures/curriculum/us/grade-2.json' with { type: 'json' }
import grade3 from '../../../../fixtures/curriculum/us/grade-3.json' with { type: 'json' }
import grade4 from '../../../../fixtures/curriculum/us/grade-4.json' with { type: 'json' }
import grade5 from '../../../../fixtures/curriculum/us/grade-5.json' with { type: 'json' }
import grade6 from '../../../../fixtures/curriculum/us/grade-6.json' with { type: 'json' }
import grade7 from '../../../../fixtures/curriculum/us/grade-7.json' with { type: 'json' }
import grade8 from '../../../../fixtures/curriculum/us/grade-8.json' with { type: 'json' }
import grade9 from '../../../../fixtures/curriculum/us/grade-9.json' with { type: 'json' }
import grade10 from '../../../../fixtures/curriculum/us/grade-10.json' with { type: 'json' }
import grade11 from '../../../../fixtures/curriculum/us/grade-11.json' with { type: 'json' }
import grade12 from '../../../../fixtures/curriculum/us/grade-12.json' with { type: 'json' }
import type { TopicMapDraft } from '../schemas/curriculum'

// The US maths topics (Common Core State Standards for Mathematics), Grades 1 to 12, as a draft topic map (P161). A country added next to South
// Africa: the CAPS files and functions are unchanged. The 12 files are in `fixtures/curriculum/us/` (their README says where they come from), and
// are imported, not read at run time, as the CAPS files are. Pure functions, no database, no model.

type UsTopic = { name: string; shortName: string; family: string; standard: string; domain: string }
type UsFile = { grade: number; subject: string; country: string; course: string | null; source: { title: string; publisher: string; url: string; part: string }; terms: { term: number; topics: UsTopic[] }[] }

const FILES: Record<number, UsFile> = {
  1: grade1 as UsFile,
  2: grade2 as UsFile,
  3: grade3 as UsFile,
  4: grade4 as UsFile,
  5: grade5 as UsFile,
  6: grade6 as UsFile,
  7: grade7 as UsFile,
  8: grade8 as UsFile,
  9: grade9 as UsFile,
  10: grade10 as UsFile,
  11: grade11 as UsFile,
  12: grade12 as UsFile,
}

export const usGrades = (): number[] => Object.keys(FILES).map(Number)

const fileOf = (grade: number): UsFile | null => (Number.isInteger(grade) ? (FILES[grade] ?? null) : null)

/** The document a grade's topics come from, for the screen and the log. Null for a grade with no US map. */
export function usSource(grade: number): { title: string; publisher: string; address: string } | null {
  const file = fileOf(grade)
  if (!file) return null
  return { title: file.course ? `${file.source.title}, ${file.course}` : file.source.title, publisher: file.source.publisher, address: file.source.url }
}

/** The US map of a grade as a draft topic map, in the files' order. Nothing is flagged and nothing is left out. Null for a grade with no US map. */
export function usDraft(grade: number): TopicMapDraft | null {
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
