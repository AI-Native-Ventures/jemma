import { describe, expect, test } from 'vitest'
import {
  AnswerKeyItemSchema,
  DiagnosisSchema,
  DiagramSpecSchema,
  GuidanceSchema,
  LearnerProfileSchema,
  LessonSchema,
  PaperReadSchema,
  QuestionSchema,
  ReteachSchema,
  TopicMapDraftSchema,
  type Lesson,
  type Question,
} from '../src/schemas'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

describe('curriculum', () => {
  test('TopicMapDraft parses a Grade 6 draft with an unsure topic', () => {
    const draft = {
      grade: 6,
      terms: [
        {
          term: 1,
          topics: [
            { name: 'Equivalent fractions', family: 'fractions', prerequisites: [], misconceptions: [] },
            {
              name: 'Adding fractions with different denominators',
              family: 'fractions',
              prerequisites: ['Equivalent fractions'],
              misconceptions: ['Adds the tops and the bottoms', 'Adds the tops and keeps one bottom'],
              check: { reason: 'Could sit in Term 1 or Term 2', options: ['Term 1', 'Term 2'] },
            },
          ],
        },
      ],
      leftOut: [{ name: 'Algebra', reason: 'Grade 7 content' }],
    }
    expect(TopicMapDraftSchema.parse(draft)).toEqual(draft)
    expect(TopicMapDraftSchema.safeParse({ ...draft, grade: '6' }).success).toBe(false)
  })

  test('AnswerKeyItem parses Q4 of teacher-snap-key with a note', () => {
    const item = {
      n: 4,
      prompt: '1 1/2 + 2 1/4',
      answer: '3 3/4',
      marks: 1,
      topicName: 'Adding mixed numbers',
      confidence: 0.62,
      note: "I read three and three quarters. The gap between the 3s is small, so check it isn't 33 over 4.",
    }
    expect(AnswerKeyItemSchema.parse(item)).toEqual(item)
    expect(AnswerKeyItemSchema.safeParse({ ...item, marks: 2 }).success).toBe(false)
    expect(AnswerKeyItemSchema.safeParse({ ...item, confidence: 1.5 }).success).toBe(false)
  })
})

describe('papers', () => {
  test('PaperRead parses a read with a crop and a problem page', () => {
    const read = {
      nameAsWritten: 'Sipho',
      nameConfidence: 0.97,
      pageUsable: true,
      answers: [
        { n: 1, answerAsRead: '2/6', confidence: 0.95 },
        { n: 7, answerAsRead: '0,8', confidence: 0.42, crop: { x: 0.1, y: 0.62, w: 0.3, h: 0.08 } },
      ],
    }
    expect(PaperReadSchema.parse(read)).toEqual(read)
    const bad = { nameAsWritten: null, nameConfidence: 0, pageUsable: false, problem: 'too_dark', answers: [] }
    expect(PaperReadSchema.parse(bad).problem).toBe('too_dark')
    expect(PaperReadSchema.safeParse({ ...bad, problem: 'torn' }).success).toBe(false)
  })
})

describe('diagnosis', () => {
  test('Diagnosis parses Amina Q1 and a missing basic of null', () => {
    const d = [
      {
        resultId: id(1),
        misconception: 'Adds the tops and the bottoms',
        gapTopicName: 'Adding fractions with different denominators',
        missingBasic: 'Equivalent fractions',
      },
      { resultId: id(2), misconception: 'Other: copied the wrong digit', gapTopicName: 'Adding decimals', missingBasic: null },
    ]
    expect(DiagnosisSchema.parse(d)).toEqual(d)
  })

  test('Reteach parses the teacher-gap board', () => {
    const r = {
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
    expect(ReteachSchema.parse(r)).toEqual(r)
    expect(ReteachSchema.safeParse({ ...r, steps: 'none' }).success).toBe(false)
  })
})

describe('diagram', () => {
  test('every kind parses and an unknown kind is rejected', () => {
    const specs = [
      { kind: 'fraction_bar', rows: [{ parts: 2, shaded: 1, label: '1/2' }, { parts: 4, shaded: 2 }] },
      { kind: 'number_line', min: 0, max: 1, step: 0.25, marks: [{ value: 0.75, label: '3/4' }] },
      { kind: 'area_model', rows: 2, cols: 4, shaded: 3 },
      { kind: 'place_value', columns: ['Ones', 'Tenths', 'Hundredths'], digits: ['0', '5', '0'] },
      { kind: 'bar_chart', bars: [{ label: 'Mon', value: 3 }], yMax: 5 },
      { kind: 'shape_2d', shape: 'rectangle', labels: ['4 cm', '2 cm'] },
      { kind: 'grid_area', cols: 4, rows: 3, cells: [[0, 0], [1, 0]] },
    ]
    for (const s of specs) expect(DiagramSpecSchema.parse(s)).toEqual(s)
    expect(DiagramSpecSchema.safeParse({ kind: 'pie', slices: 3 }).success).toBe(false)
    expect(DiagramSpecSchema.safeParse({ kind: 'shape_2d', shape: 'hexagon', labels: [] }).success).toBe(false)
  })
})

const q = (difficulty: 1 | 2 | 3, i: number): Question => ({
  prompt: `1/${i + 2} + 1/${(i + 2) * 2}`,
  render: 'fraction_sum',
  terms: [`1/${i + 2}`, `1/${(i + 2) * 2}`],
  answer: `3/${(i + 2) * 2}`,
  answerKind: 'fraction',
  difficulty,
  why: 'The bottoms are different sizes, so match them first.',
  rightWay: 'Make the bottoms match, then add the tops.',
})

const fifteen = (): Question[] =>
  ([1, 2, 3] as const).flatMap((d) => Array.from({ length: 5 }, (_, i) => q(d, i)))

const diagramLesson = (): Lesson => ({
  format: 'diagram',
  title: 'Why 1/2 + 1/4 is 3/4',
  minutes: 12,
  diagram: {
    title: 'Why 1/2 + 1/4 is 3/4',
    caption: 'Fraction bars: one half equals two quarters, plus one quarter makes three quarters.',
    steps: [
      { caption: 'A half and a quarter', diagram: { kind: 'fraction_bar', rows: [{ parts: 2, shaded: 1 }, { parts: 4, shaded: 1 }] } },
      { caption: 'Cut the half into quarters. Same amount.', diagram: { kind: 'fraction_bar', rows: [{ parts: 4, shaded: 2 }] } },
      { caption: 'Now add the quarters: 2 + 1 = 3', diagram: { kind: 'fraction_bar', rows: [{ parts: 4, shaded: 3 }] } },
    ],
    contrast: {
      caption: "2/6 is less than the half you started with. Adding can't make it smaller.",
      diagram: { kind: 'fraction_bar', rows: [{ parts: 6, shaded: 2 }] },
    },
  },
  warmup: [q(1, 0), q(1, 1)],
  questions: fifteen(),
})

describe('lesson', () => {
  test('Question parses a choice question', () => {
    const choice: Question = {
      prompt: 'Which fraction is 0,25?',
      render: 'text',
      answer: 'B',
      answerKind: 'choice',
      choices: ['1/2', '1/4', '2/5', '3/4'],
      difficulty: 2,
      why: '0,25 is 25 hundredths, the same as one quarter.',
      rightWay: 'Divide 100 by 4 to see 25 hundredths in one quarter.',
    }
    expect(QuestionSchema.parse(choice)).toEqual(choice)
    expect(QuestionSchema.safeParse({ ...choice, difficulty: 4 }).success).toBe(false)
  })

  test('diagram Lesson parses with 2 warm-ups and 15 questions', () => {
    const l = diagramLesson()
    expect(LessonSchema.parse(l)).toEqual(l)
  })

  test('Lesson accepts 0 warm-ups and rejects 1 or 3', () => {
    expect(LessonSchema.safeParse({ ...diagramLesson(), warmup: [] }).success).toBe(true)
    expect(LessonSchema.safeParse({ ...diagramLesson(), warmup: [q(1, 0)] }).success).toBe(false)
    expect(LessonSchema.safeParse({ ...diagramLesson(), warmup: [q(1, 0), q(1, 1), q(1, 2)] }).success).toBe(false)
  })

  test('a lesson with 14 questions is rejected', () => {
    const l = { ...diagramLesson(), questions: fifteen().slice(0, 14) }
    expect(LessonSchema.safeParse(l).success).toBe(false)
  })

  test('15 questions that are not 5 per difficulty are rejected', () => {
    const skewed = fifteen().map((x, i) => (i < 6 ? { ...x, difficulty: 1 as const } : x))
    expect(LessonSchema.safeParse({ ...diagramLesson(), questions: skewed }).success).toBe(false)
  })

  test('audio and reading formats parse', () => {
    const audio = { ...diagramLesson(), format: 'audio', diagram: undefined, audio: { script: 'Today we add a half and a quarter.' } }
    expect(LessonSchema.safeParse(audio).success).toBe(true)
    const reading = {
      ...diagramLesson(),
      format: 'reading',
      diagram: undefined,
      cards: [{ heading: 'Same size pieces', body: 'Halves and quarters are different sizes.', diagram: { kind: 'fraction_bar', rows: [{ parts: 2, shaded: 1 }] } }],
    }
    expect(LessonSchema.safeParse(reading).success).toBe(true)
    expect(LessonSchema.safeParse({ ...audio, format: 'video' }).success).toBe(false)
  })
})

describe('guidance', () => {
  test('Guidance parses the parent-profile board', () => {
    const g = {
      headline: 'Amina is doing well. One thing to work on this week: adding fractions.',
      focus: [
        {
          title: 'Make the bottoms match, then add',
          why: 'All 3 of her missed fraction questions come from adding the bottoms. Fixing this one step fixes all 3.',
          evidence: [{ label: 'Class Test 1 · Q1, Q2, Q4', resultIds: [id(1), id(2), id(3)] }],
        },
        {
          title: 'Then line up the comma in decimals',
          why: 'Same idea in a new place: line up what each digit is worth.',
          evidence: [{ label: 'Class Test 1 · Q8', resultIds: [id(4)] }],
        },
      ],
      lookingAhead: 'Grade 7 builds percentages and ratio on fractions, so this is worth fixing now.',
    }
    expect(GuidanceSchema.parse(g)).toEqual(g)
  })

  test('a focus item with no evidence is rejected', () => {
    const g = { headline: 'h', focus: [{ title: 't', why: 'w', evidence: [] }], lookingAhead: 'l' }
    expect(GuidanceSchema.safeParse(g).success).toBe(false)
  })
})

describe('profile', () => {
  test('LearnerProfile parses Amina after Class Test 1', () => {
    const guidance = GuidanceSchema.parse({
      headline: 'Amina is doing well. One thing to work on this week: adding fractions.',
      focus: [{ title: 'Make the bottoms match, then add', why: 'Fixes all 3.', evidence: [{ label: 'Class Test 1 · Q1', resultIds: [id(1)] }] }],
      lookingAhead: 'Grade 7 builds on fractions.',
    })
    const p = {
      child: { id: id(10), firstName: 'Amina', grade: 6, schoolName: 'Hillview Primary', className: '6B Mathematics' },
      marksByTopic: [
        { topicName: 'Adding fractions with different denominators', percent: 0, change: -50 },
        { topicName: 'Comparing fractions', percent: 100, change: 0 },
      ],
      gaps: [
        {
          id: id(20),
          topicName: 'Adding fractions with different denominators',
          topicId: id(21),
          stage: 'new',
          evidence: [id(1), id(2), id(3)],
          misconception: 'Adds the tops and the bottoms',
        },
      ],
      recentSessions: [{ id: id(30), topicName: 'Adding fractions with different denominators', format: 'audio', right: 3, minutes: 12, finishedAt: '2026-10-26T16:30:00.000Z' }],
      observations: [{ id: id(40), kind: 'effort', text: 'Tries every question.', author: 'Ms Banda', createdAt: '2026-10-27T08:00:00.000Z' }],
      attendance: { present: 9, total: 10, away: ['2026-10-20'] },
      activities: [{ id: id(50), kind: 'sport', name: 'Netball', place: 'School', days: ['Tue', 'Thu'], since: 'Term 2' }],
      guidance,
    }
    expect(LearnerProfileSchema.parse(p)).toEqual(p)
    expect(LearnerProfileSchema.parse({ ...p, guidance: null }).guidance).toBeNull()
    expect(LearnerProfileSchema.safeParse({ ...p, attendance: { present: 9 } }).success).toBe(false)
  })
})

describe('TopicMapDraft shortName', () => {
  const draft = (extra: object) => ({
    grade: 6,
    terms: [{ term: 1, topics: [{ name: 'Adding fractions with different denominators', family: 'fractions', prerequisites: [], misconceptions: [], ...extra }] }],
    leftOut: [],
  })
  test('accepts an optional shortName', () => {
    const r = TopicMapDraftSchema.parse(draft({ shortName: 'Adding fractions' }))
    expect(r.terms[0]!.topics[0]!.shortName).toBe('Adding fractions')
  })
  test('still accepts a topic without one', () => {
    expect(TopicMapDraftSchema.safeParse(draft({})).success).toBe(true)
  })
})
