// Content for stages `marked` and `session_done`, copied from the boards:
// teacher-gap (class gaps, reteach), teacher-curriculum-map/approved (map), teacher-snap-key (key),
// child-learn-diagram and child-learn-cards (Amina's lesson), child-warmup, child-question and
// child-results (questions), parent-session (finished session), parent-profile (guidance, log),
// teacher-class-home (log).
import type { AnswerKeyItem, Guidance, Lesson, Question, Reteach, TopicMapDraft } from '../../../packages/profiling/src/schemas'
import { classTest1Key } from './class-test-1'

// ---- Curriculum map: 24 topics in 4 terms --------------------------------------------------

export type TopicDef = { name: string; family: string; needs: string[]; misconceptions: string[] }

const TOPS = 'Adds the tops and the bottoms'
const KEEPS_ONE = 'Adds the tops and keeps one bottom'
const LAST_DIGITS = 'Lines up the last digits'
const BIGGER = 'Thinks bigger numbers make a bigger fraction'

export const TERMS: { term: 1 | 2 | 3 | 4; topics: TopicDef[] }[] = [
  {
    term: 1,
    topics: [
      { name: 'Whole numbers to 1 000 000', family: 'whole_numbers', needs: [], misconceptions: [] },
      { name: 'Ordering whole numbers', family: 'whole_numbers', needs: ['Whole numbers to 1 000 000'], misconceptions: [] },
      { name: 'Multiplying whole numbers', family: 'whole_numbers', needs: ['Whole numbers to 1 000 000'], misconceptions: [] },
      { name: 'Equivalent fractions', family: 'fractions', needs: [], misconceptions: [] },
      { name: 'Factors and multiples', family: 'whole_numbers', needs: ['Multiplying whole numbers'], misconceptions: [] },
      { name: 'Number patterns', family: 'whole_numbers', needs: [], misconceptions: [] },
    ],
  },
  {
    term: 2,
    topics: [
      { name: 'Adding fractions with the same denominator', family: 'fractions', needs: ['Equivalent fractions'], misconceptions: [] },
      { name: 'Decimal fractions', family: 'decimals', needs: ['Equivalent fractions'], misconceptions: [] },
      { name: '2D shapes', family: 'shapes', needs: [], misconceptions: [] },
      { name: 'Length', family: 'measurement', needs: [], misconceptions: [] },
      { name: 'Mass and capacity', family: 'measurement', needs: ['Length'], misconceptions: [] },
      { name: 'Data handling', family: 'data', needs: [], misconceptions: [] },
    ],
  },
  {
    term: 3,
    topics: [
      {
        name: 'Adding fractions with different denominators',
        family: 'fractions',
        needs: ['Equivalent fractions', 'Adding fractions with the same denominator'],
        misconceptions: [TOPS, KEEPS_ONE],
      },
      {
        name: 'Subtracting fractions with different denominators',
        family: 'fractions',
        needs: ['Adding fractions with different denominators'],
        misconceptions: [TOPS],
      },
      {
        name: 'Adding mixed numbers',
        family: 'fractions',
        needs: ['Adding fractions with different denominators'],
        misconceptions: [TOPS, KEEPS_ONE],
      },
      { name: 'Percentages', family: 'fractions', needs: ['Equivalent fractions', 'Decimal fractions'], misconceptions: [] },
      { name: '3D objects', family: 'shapes', needs: ['2D shapes'], misconceptions: [] },
      { name: 'Perimeter and area', family: 'measurement', needs: ['Length', 'Multiplying whole numbers'], misconceptions: [] },
    ],
  },
  {
    term: 4,
    topics: [
      { name: 'Comparing fractions', family: 'fractions', needs: ['Equivalent fractions'], misconceptions: [BIGGER] },
      { name: 'Fractions and decimals', family: 'fractions', needs: ['Decimal fractions', 'Equivalent fractions'], misconceptions: [] },
      { name: 'Adding decimals', family: 'decimals', needs: ['Decimal fractions'], misconceptions: [LAST_DIGITS] },
      { name: 'Fraction of a quantity', family: 'fractions', needs: ['Equivalent fractions', 'Multiplying whole numbers'], misconceptions: [] },
      { name: 'Probability', family: 'data', needs: ['Data handling'], misconceptions: [] },
      { name: 'Position and movement', family: 'shapes', needs: ['2D shapes'], misconceptions: [] },
    ],
  },
]

export function topicMapDraft(): TopicMapDraft {
  return {
    grade: 6,
    terms: TERMS.map((t) => ({
      term: t.term,
      topics: t.topics.map((p) => ({
        name: p.name,
        family: p.family,
        prerequisites: p.needs,
        misconceptions: p.misconceptions,
        ...(p.name === 'Percentages'
          ? {
              check: {
                reason: 'The teaching plan lists percentages in Term 3 and again in Term 4. I put it in Term 3.',
                options: ['Keep in Term 3', 'Move to Term 4'],
              },
            }
          : {}),
      })),
    })),
    leftOut: [
      {
        name: 'Rounding off to 5, 10, 100 and 1 000',
        reason: 'It sat on a Grade 5 page, but your teaching plan mentions it in Term 3.',
      },
    ],
  }
}

export const CURRICULUM_DOCS = [
  { title: 'Grade 6 teaching plan', pages: 120 },
  { title: 'Grade 6 Mathematics term plan', pages: 89 },
]

// ---- Class Test 1 -------------------------------------------------------------------------

export const TEST_TITLE = 'Class Test 1: Fractions and decimals'

/** The key lists topics as the snap-key board draws them; the approved map names them in full. */
const MAP_TOPIC_FOR_KEY_TOPIC: Record<string, string> = {
  'Adding fractions': 'Adding fractions with different denominators',
  'Subtracting fractions': 'Subtracting fractions with different denominators',
}
export const mapTopicName = (keyTopic: string) => MAP_TOPIC_FOR_KEY_TOPIC[keyTopic] ?? keyTopic

export function answerKeyItems(): AnswerKeyItem[] {
  return classTest1Key.map((q) => ({
    n: q.n,
    prompt: q.prompt,
    answer: q.answer,
    marks: 1,
    topicName: mapTopicName(q.topicName),
    confidence: q.n === 4 ? 0.62 : 0.97,
    ...(q.n === 4 ? { note: 'I read three and three quarters. The gap between the 3s is small, so check it is not 33 over 4.' } : {}),
  }))
}

// ---- Reteach (teacher-gap) ----------------------------------------------------------------

export const RETEACH_TOPIC = 'Adding fractions with different denominators'

export const RETEACH: Reteach = {
  title: 'Fraction strips',
  minutes: 10,
  audience: 'whole class',
  youNeed: '3 paper strips per learner, all the same length.',
  steps: [
    { minutes: 2, text: 'Fold one strip into halves and one into quarters.' },
    { minutes: 3, text: 'Lay them side by side. How many quarters fit in a half? Write 1/2 = 2/4.' },
    { minutes: 3, text: 'Add 1/2 + 1/4 with the strips. Count the quarters: 3/4. Ask why 2/6 is smaller than 1/2.' },
    { minutes: 2, text: 'Exit question on the board: 1/3 + 1/6.' },
  ],
  exitQuestion: '1/3 + 1/6',
}

export const RETEACH_WHY = '4 of 5 add the tops and the bottoms. It points back to equivalent fractions, a Term 1 basic.'
export const RETEACH_MISSING_BASIC = 'Equivalent fractions · Term 1'
export const RETEACH_EXPLANATION =
  "The bottom number says the size of the pieces. Halves and quarters are different sizes, so they can't be added until the bottoms match."

// ---- Sipho's unsure Q7 (teacher-class-home, teacher-review) ----------------------------------

export const SIPHO_NEEDS = { title: "Check 1 answer on Sipho's paper", detail: 'Class Test 1 · question 7 · I read 0,8' }

// ---- Amina's week (parent-learn "This week"); only tonight (inDays 0) has a written lesson ----
// Board counts: tonight "5 questions", Thursday "5 questions"; Wednesday and Saturday show none.

export const WEEK_PLAN: {
  inDays: number
  topic: string
  format: 'reading' | 'diagram' | 'audio'
  minutes: number
  questions: number | null
}[] = [
  { inDays: 0, topic: 'Adding fractions with different denominators', format: 'diagram', minutes: 12, questions: 5 },
  { inDays: 2, topic: 'Adding decimals', format: 'reading', minutes: 10, questions: null },
  { inDays: 3, topic: 'Adding fractions with different denominators', format: 'diagram', minutes: 6, questions: 5 },
  { inDays: 5, topic: 'Adding decimals', format: 'audio', minutes: 10, questions: null },
]

// ---- Questions ----------------------------------------------------------------------------

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)

/** `a + b` as a fraction sum question, answered over the common bottom (as the boards do). */
export function fractionSum(a: string, b: string, difficulty: 1 | 2 | 3): Question {
  const [n1, d1] = a.split('/').map(Number) as [number, number]
  const [n2, d2] = b.split('/').map(Number) as [number, number]
  const lcd = (d1 * d2) / gcd(d1, d2)
  const r1 = (n1 * lcd) / d1
  const r2 = (n2 * lcd) / d2
  const answer = `${r1 + r2}/${lcd}`
  const moves: string[] = []
  if (lcd !== d1) moves.push(`${a} is the same as ${r1}/${lcd}`)
  if (lcd !== d2) moves.push(`${b} is the same as ${r2}/${lcd}`)
  return {
    prompt: `${a} + ${b}`,
    render: 'fraction_sum',
    terms: [a, b],
    answer,
    answerKind: 'fraction',
    difficulty,
    why: 'you added the tops and the bottoms.',
    rightWay: `${moves.join(' and ')}. Then ${r1}/${lcd} + ${r2}/${lcd} = ${answer}.`,
  }
}

const EASY: [string, string][] = [['1/4', '1/8'], ['1/2', '1/6'], ['1/3', '1/6'], ['1/2', '1/8'], ['1/5', '1/10']]
const MEDIUM: [string, string][] = [['1/2', '1/4'], ['2/3', '1/6'], ['3/4', '1/8'], ['1/4', '3/8'], ['2/5', '3/10']]
const HARD: [string, string][] = [['1/2', '1/3'], ['1/4', '1/6'], ['2/3', '1/4'], ['3/4', '1/6'], ['1/3', '2/5']]

export const LESSON_QUESTIONS: Question[] = [
  ...EASY.map(([a, b]) => fractionSum(a, b, 1)),
  ...MEDIUM.map(([a, b]) => fractionSum(a, b, 2)),
  ...HARD.map(([a, b]) => fractionSum(a, b, 3)),
]

const find = (a: string, b: string) => LESSON_QUESTIONS.find((q) => q.terms?.[0] === a && q.terms?.[1] === b)!

/** child-warmup: a quick one from a fixed gap. */
export const WARMUP: Question[] = [
  {
    prompt: 'Which fraction is the same as 1/2?',
    render: 'text',
    answer: 'A',
    answerKind: 'choice',
    choices: ['2/4', '1/4', '2/3', '3/4'],
    difficulty: 1,
    why: 'a half and two quarters are the same amount.',
    rightWay: 'Cut each half into 2 equal parts. 1/2 is the same as 2/4.',
  },
  {
    prompt: 'Which fraction is the same as 1/3?',
    render: 'text',
    answer: 'A',
    answerKind: 'choice',
    choices: ['2/6', '1/6', '2/3', '3/6'],
    difficulty: 1,
    why: 'a third and two sixths are the same amount.',
    rightWay: 'Cut each third into 2 equal parts. 1/3 is the same as 2/6.',
  },
]

// ---- Amina's lesson: diagram format (child-learn-diagram, child-learn-cards) ----------------

export const LESSON_TOPIC = 'Adding fractions with different denominators'

export const AMINA_LESSON: Lesson = {
  format: 'diagram',
  title: 'Why 1/2 + 1/4 is 3/4',
  minutes: 12,
  cards: [
    {
      heading: 'Two different sizes',
      body: "A half and a quarter are different sizes. Before we add, let's see them side by side.",
      diagram: { kind: 'fraction_bar', rows: [{ parts: 2, shaded: 1, label: '1/2' }, { parts: 4, shaded: 1, label: '1/4' }] },
    },
    {
      heading: 'Make the bottoms match first',
      body: "The bottom number tells you how big each piece is. A half is bigger than a quarter, so you can't add them as they are.",
      diagram: { kind: 'fraction_bar', rows: [{ parts: 2, shaded: 1, label: '1/2' }, { parts: 4, shaded: 2, label: '2/4' }] },
    },
    {
      heading: 'Now add the tops',
      body: "Now both are quarters: 2/4 + 1/4 = 3/4",
      diagram: { kind: 'fraction_bar', rows: [{ parts: 4, shaded: 3, label: '3/4' }] },
    },
    {
      heading: 'Check it makes sense',
      body: "3/4 is more than the half you started with. Adding can't make it smaller.",
    },
  ],
  diagram: {
    title: 'Why 1/2 + 1/4 is 3/4',
    caption: 'Fraction bars: one half equals two quarters, plus one quarter makes three quarters.',
    steps: [
      {
        caption: 'A half and a quarter',
        diagram: { kind: 'fraction_bar', rows: [{ parts: 2, shaded: 1, label: '1/2' }, { parts: 4, shaded: 1, label: '1/4' }] },
      },
      {
        caption: 'Cut the half into quarters. Same amount.',
        diagram: { kind: 'fraction_bar', rows: [{ parts: 2, shaded: 1, label: '1/2' }, { parts: 4, shaded: 2, label: '2/4' }] },
      },
      {
        caption: 'Now add the quarters: 2 + 1 = 3',
        diagram: { kind: 'fraction_bar', rows: [{ parts: 4, shaded: 3, label: '3/4' }] },
      },
    ],
    contrast: {
      caption: "2/6 is less than the half you started with. Adding can't make it smaller.",
      diagram: { kind: 'fraction_bar', rows: [{ parts: 2, shaded: 1, label: '1/2' }, { parts: 6, shaded: 2, label: '2/6' }] },
    },
  },
  warmup: WARMUP,
  questions: LESSON_QUESTIONS,
}

// ---- Finished session (parent-session) ------------------------------------------------------

export const SESSION_TRY = [
  { q: find('1/2', '1/4'), answer: '3/4', correct: true, seconds: 100, difficulty: 2, adapted: null },
  { q: find('2/3', '1/6'), answer: '3/9', correct: false, seconds: 130, difficulty: 2, adapted: null },
  { q: find('1/4', '1/8'), answer: '3/8', correct: true, seconds: 80, difficulty: 1, adapted: 'easier' },
  { q: find('1/2', '1/6'), answer: '4/6', correct: true, seconds: 115, difficulty: 1, adapted: null },
  { q: find('3/4', '1/8'), answer: '4/12', correct: false, seconds: 150, difficulty: 2, adapted: 'harder' },
] as const

export const SESSION_WARMUP = [
  { q: WARMUP[0]!, answer: 'A', correct: true, seconds: 35 },
  { q: WARMUP[1]!, answer: 'A', correct: true, seconds: 40 },
]

export const SESSION_DONE = { right: 3, minutes: 12, trialScore: 3 }

// ---- Homework Amina's mum snapped on Sunday (parent-profile: "Check the homework you snapped") --

export const HOMEWORK_ROWS = [
  { prompt: '0,3 + 0,4', wrote: '0,7', correct: true, confidence: 0.96 },
  { prompt: '0,6 + 0,25', wrote: '0,31', correct: false, confidence: 0.93, misconception: LAST_DIGITS },
  { prompt: '1,5 + 0,75', wrote: '2,25', correct: true, confidence: 0.95 },
  { prompt: '0,2 + 0,45', wrote: '0,65', correct: true, confidence: 0.38 },
  { prompt: '0,5 + 0,3', wrote: '0,8', correct: true, confidence: 0.94 },
]
export const HOMEWORK_NEEDS = { title: 'Check the homework you snapped', detail: "Sunday · 5 answers, 1 I'm unsure about" }

// ---- Guidance card (parent-profile) --------------------------------------------------------

export function guidanceCard(ids: { fractions: string[]; decimals: string[]; homework: string[] }): Guidance {
  return {
    headline: 'Amina is doing well. One thing to work on this week: adding fractions.',
    focus: [
      {
        title: 'Make the bottoms match, then add',
        why: 'All 3 of her missed fraction questions come from adding the bottoms. Fixing this one step fixes all 3.',
        evidence: [{ label: 'Class Test 1 · Q1, Q2, Q4', resultIds: ids.fractions }],
      },
      {
        title: 'Then line up the comma in decimals',
        why: 'Same idea in a new place: line up what each digit is worth.',
        evidence: [
          { label: 'Class Test 1 · Q8', resultIds: ids.decimals },
          { label: 'Homework · Sunday', resultIds: ids.homework },
        ],
      },
    ],
    lookingAhead: 'Grade 7 builds percentages and ratio on fractions, so this is worth fixing now.',
  }
}

// ---- "What Jemma did" lines (minutes before the sandbox was made) -------------------------------

export const CLASS_LOG = [
  { minutesAgo: 75, tool: 'draft_topic_map', text: 'Drafted the map from your 2 documents' },
  { minutesAgo: 62, tool: 'save_topic_map_draft', text: 'Saved the map you approved: 24 topics, Percentages kept in Term 3, Rounding left out' },
  { minutesAgo: 6, tool: 'mark_paper', text: 'Read 5 papers. 1 unsure, sent to you.' },
  { minutesAgo: 5, tool: 'mark_paper', text: "Tagged Class Test 1's 10 questions to 7 topics on your map" },
  { minutesAgo: 4, tool: 'class_gap_report', text: 'Found 3 class gaps and the mistake behind each one' },
  { minutesAgo: 3, tool: 'class_gap_report', text: 'Wrote a 10 minute reteach for adding fractions' },
  { minutesAgo: 2, tool: 'plan_next_session', text: "Planned tonight's lesson for all 5 learners" },
]

export const AMINA_LOG = [
  { minutesAgo: 24 * 60 + 5, tool: 'mark_paper', text: 'Read the homework you snapped. 1 answer was too faint to be sure' },
  { minutesAgo: 6, tool: 'mark_paper', text: "Marked Class Test 1 against Ms Banda's memo: 6 out of 10" },
  { minutesAgo: 5, tool: 'update_learner_profile', text: "Updated Amina's gaps: adding fractions is now her first focus" },
  { minutesAgo: 2, tool: 'save_lesson', text: "Built tonight's 12-minute lesson on adding fractions, with fraction bars" },
]

export const SESSION_LOG = 'Amina finished her lesson: 3 of 5. Moved her to Practising'
