// The whole made-up school: three teachers, six classes in three subjects across Grades 4 to 7, the five learners of 6B in three classes,
// eighteen generated learners in the other three classes, four parents and what they are linked to.
// Nothing here reads the clock or the database: the people, their order and their records depend only on the class year, so the demo
// page can list them before any sandbox exists and every sandbox gets the same school.
import { makeLearners, type MadeBatch, type MadeLearner } from '../generator'
import { strandOrder } from '../../../packages/profiling/src/logic/strands'
import { CAST } from './cast'

export type TeacherKey = 'banda' | 'dlamini' | 'okafor'
export type ParentKey = 'thandi' | 'nomsa' | 'peter' | 'grace'
export type ClassKey = '6b-maths' | '6b-english' | '6b-science' | '5a-maths' | '7a-english' | '4a-science'

export const HILLVIEW_TEACHERS: { key: TeacherKey; displayName: string; emailLocal: string; subject: string }[] = [
  { key: 'banda', displayName: CAST.teacher.displayName, emailLocal: CAST.teacher.emailLocal, subject: 'Mathematics' },
  { key: 'dlamini', displayName: 'Mr Dlamini', emailLocal: 'mr.dlamini', subject: 'English' },
  { key: 'okafor', displayName: 'Ms Okafor', emailLocal: 'ms.okafor', subject: 'Natural Sciences' },
]

/** In this order. 6B Mathematics comes first and stays the oldest class: it is the sandbox's home class. */
export const HILLVIEW_CLASSES: {
  key: ClassKey
  name: string
  grade: number
  subject: string
  teacher: TeacherKey
  /** The five learners of 6B, or learners made up for this class. */
  learners: 'six-b' | 'made-up'
  /** Teachers of the years before, oldest first, for the made-up learners' records. */
  before: string[]
}[] = [
  { key: '6b-maths', name: '6B Mathematics', grade: 6, subject: 'Mathematics', teacher: 'banda', learners: 'six-b', before: [] },
  { key: '6b-english', name: '6B English', grade: 6, subject: 'English', teacher: 'dlamini', learners: 'six-b', before: ['Mr Dube', 'Mrs Naidoo'] },
  { key: '6b-science', name: '6B Natural Sciences', grade: 6, subject: 'Natural Sciences', teacher: 'okafor', learners: 'six-b', before: ['Mr Dube', 'Mrs Naidoo'] },
  { key: '5a-maths', name: '5A Mathematics', grade: 5, subject: 'Mathematics', teacher: 'banda', learners: 'made-up', before: ['Mr Dube', 'Mrs Naidoo'] },
  { key: '7a-english', name: '7A English', grade: 7, subject: 'English', teacher: 'dlamini', learners: 'made-up', before: ['Mrs Naidoo', 'Mr Dube'] },
  { key: '4a-science', name: '4A Natural Sciences', grade: 4, subject: 'Natural Sciences', teacher: 'okafor', learners: 'made-up', before: ['Mr Dube', 'Mrs Naidoo'] },
]

export const MADE_UP_PER_CLASS = 6

export const HILLVIEW_PARENTS: { key: ParentKey; displayName: string; emailLocal: string; relation: string }[] = [
  { key: 'thandi', displayName: CAST.parent.displayName, emailLocal: CAST.parent.emailLocal, relation: CAST.parent.relation },
  { key: 'nomsa', displayName: 'Nomsa K', emailLocal: 'nomsa', relation: 'mum' },
  { key: 'peter', displayName: 'Peter A', emailLocal: 'peter', relation: 'dad' },
  { key: 'grace', displayName: 'Grace A', emailLocal: 'grace', relation: 'mum' },
]

/**
 * Who each parent is linked to, by class and position among that class's made-up learners (0 is the first).
 * Nomsa K has two children in different grades (5A and 4A). Peter A and Grace A are both guardians of the same 7A learner.
 * Thandi M and Amina are linked in the demo path (step 3), not here. Every other learner has no linked parent.
 */
export const HILLVIEW_LINKS: { parent: ParentKey; classKey: ClassKey; at: number }[] = [
  { parent: 'nomsa', classKey: '5a-maths', at: 0 },
  { parent: 'nomsa', classKey: '4a-science', at: 0 },
  { parent: 'peter', classKey: '7a-english', at: 0 },
  { parent: 'grace', classKey: '7a-english', at: 0 },
]

/** What the five learners of 6B have in their other classes, besides the Mathematics history in `long-history.ts`. */
const SIX_B = CAST.children as readonly string[]
const SIX_B_FAMILIES = { English: strandOrder('English'), 'Natural Sciences': strandOrder('Natural Sciences') }

/**
 * Records in English and Natural Sciences back to Grade 4 for the five learners (marked work only: their notes and attendance are in
 * the Mathematics history). Amina, Thabo and Lerato each carry one planted pattern in a subject other than Mathematics.
 * Thabo has nothing in Grade 5 terms 2 and 3 in any subject (he was at another school).
 */
export function sixBOtherSubjects(year: number): { subject: 'English' | 'Natural Sciences'; batch: MadeBatch }[] {
  const common = { grade: 6, year, count: SIX_B.length, names: SIX_B, marksOnly: true, away: [[], [5, 6], [], [], []] as number[][] }
  return [
    {
      subject: 'English',
      batch: makeLearners({
        ...common, subject: 'English', subjects: ['English'], seed: 'hillview|6b|english', families: SIX_B_FAMILIES.English, teacherNames: ['Mr Dube', 'Mrs Naidoo', 'Mr Dlamini'],
        // Amina: a struggle in writing. Lerato: a strength in language.
        plant: [{ family: 'writing', kind: 'struggle', since: 0 }, null, { family: 'language', kind: 'strength', since: 0 }, null, null],
      }),
    },
    {
      subject: 'Natural Sciences',
      batch: makeLearners({
        ...common, subject: 'Natural Sciences', subjects: ['Natural Sciences'], seed: 'hillview|6b|science', families: SIX_B_FAMILIES['Natural Sciences'], teacherNames: ['Mr Dube', 'Mrs Naidoo', 'Ms Okafor'],
        // Thabo: a strength in life and living.
        plant: [null, { family: 'life_living', kind: 'strength', since: 1 }, null, null, null],
      }),
    },
  ]
}

export type MadeUpClass = { classKey: ClassKey; batch: MadeBatch }

/** The generated learners of the three made-up classes. First names are not repeated anywhere in the school. */
export function madeUpClasses(year: number): MadeUpClass[] {
  const used: string[] = [...SIX_B]
  const out: MadeUpClass[] = []
  for (const c of HILLVIEW_CLASSES) {
    if (c.learners !== 'made-up') continue
    const teacher = HILLVIEW_TEACHERS.find((t) => t.key === c.teacher)!
    const batch = makeLearners({
      subject: c.subject, grade: c.grade, year, count: MADE_UP_PER_CLASS, seed: `hillview|${c.key}`, families: strandOrder(c.subject),
      teacherNames: [...c.before, teacher.displayName], avoidNames: used,
    })
    used.push(...batch.learners.map((l) => l.firstName))
    out.push({ classKey: c.key, batch })
  }
  return out
}

/** The made-up learner of a class at a position, or undefined. */
export function madeUpLearner(classes: MadeUpClass[], classKey: ClassKey, at: number): MadeLearner | undefined {
  return classes.find((c) => c.classKey === classKey)?.batch.learners[at]
}

/** The people the demo page lists: teachers with their classes, parents with their children, learners by class. All from the roster, no database. */
export function hillviewPeople(year: number) {
  const made = madeUpClasses(year)
  const classesOf = (t: TeacherKey) => HILLVIEW_CLASSES.filter((c) => c.teacher === t)
  const parents = HILLVIEW_PARENTS.map((p) => ({
    ...p,
    children:
      p.key === 'thandi'
        ? [{ name: 'Amina', grade: 6 }]
        : HILLVIEW_LINKS.filter((l) => l.parent === p.key).map((l) => ({
            name: madeUpLearner(made, l.classKey, l.at)!.firstName,
            grade: HILLVIEW_CLASSES.find((c) => c.key === l.classKey)!.grade,
          })),
  }))
  return {
    teachers: HILLVIEW_TEACHERS.map((t) => ({ ...t, classes: classesOf(t.key).map((c) => c.name) })),
    parents,
    learners: HILLVIEW_CLASSES.map((c) => ({
      classKey: c.key,
      className: c.name,
      grade: c.grade,
      names: c.learners === 'six-b' ? [...SIX_B] : made.find((m) => m.classKey === c.key)!.batch.learners.map((l) => l.firstName),
    })),
  }
}
