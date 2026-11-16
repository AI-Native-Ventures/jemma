import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { libraryKey } from '@jemma/profiling/schemas'

/** The root of the repository, whichever folder a script is started from. */
export const REPO_ROOT = resolve(import.meta.dirname, '../..')

type CapsTopic = { name: string; shortName: string; family: string; capsName: string; contentArea: string }
type CapsFile = { grade: number; source: { title: string; publisher: string; url: string }; terms: { term: number; topics: CapsTopic[] }[] }

export type TopicGroup = {
  grade: number
  /** The CAPS name without " (Term N)": the key a library entry is stored and found under (`libraryKey`). */
  baseName: string
  family: string
  /** The names the Department's document prints for the rows of this group (a row repeated in a later term can print the same name twice: kept once). */
  capsNames: string[]
  contentAreas: string[]
  terms: number[]
  /** The topics of the same grade just before and just after this one in the year (base names, at most four each side). */
  before: string[]
  after: string[]
}

/** The three topics a person checks before the pitch, in this order, come first of all. */
export const PITCH_TOPICS: { grade: number; baseName: string }[] = [
  { grade: 6, baseName: 'Common fractions' },
  { grade: 10, baseName: 'Trigonometry' },
  { grade: 11, baseName: 'Functions' },
]

/** The five topics of the sample gate: the three pitch topics, one Grade 1 topic (CAPS facts only) and one Grade 9 topic (a Siyavula chapter found by its words). */
export const SAMPLE_TOPICS: { grade: number; baseName: string }[] = [...PITCH_TOPICS, { grade: 1, baseName: 'Addition and subtraction' }, { grade: 9, baseName: 'Theorem of Pythagoras' }]

/** After the pitch topics: Grades 12 down to 1 (owner's order, 16 Nov: the oldest learners first). */
const GRADE_ORDER = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
const NEIGHBOURS = 4

export function loadCapsFile(grade: number, root = REPO_ROOT): CapsFile {
  return JSON.parse(readFileSync(join(root, 'fixtures/curriculum/caps', `grade-${grade}.json`), 'utf8')) as CapsFile
}

const unique = <T>(list: T[]): T[] => [...new Set(list)]

/** Every group of one grade, in the order the topics first appear in the year. */
function groupsOfGrade(grade: number, root: string): TopicGroup[] {
  const file = loadCapsFile(grade, root)
  const byName = new Map<string, TopicGroup>()
  for (const term of file.terms) {
    for (const topic of term.topics) {
      const baseName = libraryKey(topic.name)
      const group = byName.get(baseName) ?? { grade, baseName, family: topic.family, capsNames: [], contentAreas: [], terms: [], before: [], after: [] }
      group.capsNames = unique([...group.capsNames, topic.capsName])
      group.contentAreas = unique([...group.contentAreas, topic.contentArea])
      group.terms = unique([...group.terms, term.term]).sort((a, b) => a - b)
      byName.set(baseName, group)
    }
  }
  const groups = [...byName.values()]
  groups.forEach((g, i) => {
    g.before = groups.slice(Math.max(0, i - NEIGHBOURS), i).map((x) => x.baseName)
    g.after = groups.slice(i + 1, i + 1 + NEIGHBOURS).map((x) => x.baseName)
  })
  return groups
}

/** The 488 CAPS rows as one group per (grade, base name): "Common fractions" and "Common fractions (Term 4)" are one group. Pitch topics first, then Grades 12 to 1. */
export function topicGroups(root = REPO_ROOT): TopicGroup[] {
  const all = GRADE_ORDER.flatMap((g) => groupsOfGrade(g, root))
  const isPitch = (g: TopicGroup) => PITCH_TOPICS.findIndex((p) => p.grade === g.grade && p.baseName === g.baseName)
  const pitch = PITCH_TOPICS.map((p) => all.find((g) => isPitch(g) === PITCH_TOPICS.indexOf(p))).filter((g): g is TopicGroup => !!g)
  return [...pitch, ...all.filter((g) => isPitch(g) === -1)]
}

/** A short file name for a topic: lower case words joined by dashes, at most 70 characters. Two names of one grade never share one (see `topicFileNames`). */
export function topicSlug(baseName: string): string {
  const words = baseName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return words.length <= 70 ? words : words.slice(0, 70).replace(/-+[^-]*$/, '') || words.slice(0, 70)
}

/** The file name (without folder) of every group, unique inside its grade: a name that would repeat gets `-2`, `-3`. */
export function topicFileNames(groups: TopicGroup[]): Map<TopicGroup, string> {
  const used = new Map<string, number>()
  const names = new Map<TopicGroup, string>()
  for (const g of groups) {
    const slug = topicSlug(g.baseName)
    const key = `${g.grade}/${slug}`
    const n = (used.get(key) ?? 0) + 1
    used.set(key, n)
    names.set(g, n === 1 ? slug : `${slug}-${n}`)
  }
  return names
}

/** Where the lessons of a group are stored, relative to the repository root. */
export const lessonPath = (group: TopicGroup, fileName: string): string => join('content/lessons', `grade-${group.grade}`, `${fileName}.json`)
