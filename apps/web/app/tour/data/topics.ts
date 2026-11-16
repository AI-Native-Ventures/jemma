// The Grade 11 Mathematics topics of the tour, grouped the way "My maths" groups a senior map: a part (Algebra) holds its topics. The names are the
// names of the CAPS map of Grade 11 (a test holds the two lists to each other). A static list: the tour reads nothing.

export type TourTopic = { slug: string; name: string; term: 1 | 2 | 3 | 4 }
export type TourPart = { slug: string; label: string; topics: TourTopic[] }

export const TOUR_GRADE = 11
export const TOUR_SUBJECT = 'Mathematics'

/** The learner of the tour: the one who is on the screen, and the one row of the teacher's list that is today's. */
export const TOUR_LEARNER = 'Lwazi'

/** The one topic of the tour that has a lesson: the learner opens it, and the teacher's page of the class goes down to it. */
export const LESSON_PART = 'algebra'
export const LESSON_TOPIC = 'equations'

export const TOUR_PARTS: TourPart[] = [
  {
    slug: 'algebra',
    label: 'Algebra',
    topics: [
      { slug: 'exponents-and-surds', name: 'Exponents and surds', term: 1 },
      { slug: 'equations', name: 'Equations and inequalities', term: 1 },
      { slug: 'number-patterns', name: 'Number patterns', term: 1 },
    ],
  },
  { slug: 'functions', label: 'Functions', topics: [{ slug: 'functions', name: 'Functions', term: 2 }] },
  { slug: 'finance', label: 'Finance, growth and decay', topics: [{ slug: 'finance-growth-and-decay', name: 'Finance, growth and decay', term: 3 }] },
  {
    slug: 'trigonometry',
    label: 'Trigonometry',
    topics: [
      { slug: 'trigonometry-reduction', name: 'Trigonometry (reduction formulae, graphs, equations)', term: 2 },
      { slug: 'trigonometry-rules', name: 'Trigonometry (sine, area, cosine rules)', term: 3 },
    ],
  },
  { slug: 'euclidean-geometry', label: 'Euclidean geometry', topics: [{ slug: 'euclidean-geometry', name: 'Euclidean Geometry', term: 3 }] },
  { slug: 'analytical-geometry', label: 'Analytical geometry', topics: [{ slug: 'analytical-geometry', name: 'Analytical Geometry', term: 1 }] },
  { slug: 'measurement', label: 'Measurement', topics: [{ slug: 'measurement', name: 'Measurement', term: 3 }] },
  { slug: 'statistics', label: 'Statistics', topics: [{ slug: 'statistics', name: 'Statistics', term: 4 }] },
  { slug: 'probability', label: 'Probability', topics: [{ slug: 'probability', name: 'Probability', term: 3 }] },
]

export const findPart = (slug: string): TourPart | undefined => TOUR_PARTS.find((p) => p.slug === slug)

export const findTopic = (part: string, topic: string): TourTopic | undefined => findPart(part)?.topics.find((t) => t.slug === topic)

/** True for the one topic that opens a lesson. */
export const hasLesson = (part: string, topic: string): boolean => part === LESSON_PART && topic === LESSON_TOPIC

/** The topics of a part by term, as the part's page lists them ("Term 1", "Term 2"). */
export function byTerm(part: TourPart): { term: number; topics: TourTopic[] }[] {
  const terms = [...new Set(part.topics.map((t) => t.term))].sort((a, b) => a - b)
  return terms.map((term) => ({ term, topics: part.topics.filter((t) => t.term === term) }))
}
