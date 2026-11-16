import type { TeachingBlock, TeachingLesson, TeachingSource, TopicLessons } from '@jemma/profiling/schemas'

type Question = Extract<TeachingBlock, { kind: 'try' }>['question']

export const question = (over: Partial<Question> = {}): Question => ({
  prompt: 'What is 1/5 + 2/5?',
  render: 'text',
  steps: ['1/5 + 2/5', '(1 + 2)/5', '3/5'],
  answer: '3/5',
  answerKind: 'fraction',
  difficulty: 1,
  why: 'The denominator stays the same when the parts are the same size.',
  rightWay: 'Add the tops, keep the bottom: 1 + 2 = 3, so 3/5.',
  ...over,
})

export const explain = (text = 'A fraction names equal parts of a whole. The bottom number says how many equal parts. The top number says how many we take.'): Extract<TeachingBlock, { kind: 'explain' }> => ({
  kind: 'explain',
  text,
  speech: 'A fraction names equal parts of a whole. The bottom number says how many equal parts there are. The top number says how many we take.',
})

export const fractionBar = (shaded = 1, parts = 4): TeachingBlock => ({
  kind: 'diagram',
  spec: { kind: 'fraction_bar', rows: [{ parts, shaded, label: `${shaded}/${parts}` }] },
  caption: `One bar cut into ${parts} equal parts, ${shaded} shaded.`,
  speech: `A bar is cut into ${parts} equal parts and ${shaded} of them are shaded.`,
})

export const worked = (a = 1, b = 2, d = 4): TeachingBlock => ({
  kind: 'worked',
  problem: `What is ${a}/${d} + ${b}/${d}?`,
  steps: [
    { line: `${a}/${d} + ${b}/${d}`, reason: 'The parts are the same size, so we can add the tops.' },
    { line: `(${a} + ${b})/${d}`, reason: 'Add the tops and keep the bottom.' },
    { line: `${a + b}/${d}`, reason: `${a} + ${b} = ${a + b}.` },
  ],
  answer: `${a + b}/${d}`,
  answerKind: 'fraction',
  speech: `One way to add: ${a} over ${d} plus ${b} over ${d}. The parts are the same size, so add the tops and keep the bottom. The answer is ${a + b} over ${d}.`,
})

export const tryBlock = (): TeachingBlock => ({ kind: 'try', question: question({ prompt: 'What is 1/3 + 1/3?', steps: ['1/3 + 1/3', '(1 + 1)/3', '2/3'], answer: '2/3' }), hint: 'Add the tops and keep the bottom.', speech: 'Now you try. What is one third plus one third?' })

export const mistake = (): TeachingBlock => ({
  kind: 'mistake',
  wrong: '1/4 + 2/4 = 3/8',
  right: '1/4 + 2/4 = 3/4',
  why: 'The size of the parts does not change when we add, so the bottom number stays the same.',
  speech: 'A usual mistake is to add the bottoms too and write three eighths. The parts are still quarters, so the answer is three quarters.',
})

export const practice = (n = 5): Question[] =>
  Array.from({ length: n }, (_, i) => {
    const a = i + 1
    return question({
      prompt: `What is ${a}/9 + 1/9?`,
      steps: [`${a}/9 + 1/9`, `(${a} + 1)/9`, `${a + 1}/9`],
      answer: `${a + 1}/9`,
      difficulty: (i < 2 ? 1 : i < 4 ? 2 : 3) as 1 | 2 | 3,
    })
  })

/** A Grade 6 lesson that passes every check: change one thing in a test to see the one check that catches it. */
export const goodLesson = (over: Partial<TeachingLesson> = {}): TeachingLesson => ({
  position: 1,
  title: 'Adding fractions with the same bottom number',
  minutes: 15,
  objectives: ['You will be able to add fractions with the same denominator.', 'You will be able to explain why the denominator stays the same.'],
  keyWords: [{ word: 'denominator', meaning: 'The bottom number of a fraction. It says how many equal parts the whole has.' }],
  blocks: [explain(), fractionBar(1, 4), explain('Two quarters and one quarter make three quarters.'), worked(1, 2, 4), worked(2, 2, 5), worked(3, 4, 8), tryBlock(), mistake(), explain('Remember: add the tops, keep the bottom.')],
  summary: ['Fractions with the same denominator are added by adding the numerators.', 'The denominator stays the same.', 'Check that your answer is not more than the whole unless you expect it.'],
  practice: practice(5),
  ...over,
})

export const capsSource = (): TeachingSource => ({
  kind: 'caps',
  title: 'Curriculum and Assessment Policy Statement (CAPS), Mathematics, Intermediate Phase, Grades 4-6',
  address: 'https://www.education.gov.za/Portals/0/CD/example.pdf',
  credit: 'Follows the CAPS Mathematics curriculum, Department of Basic Education',
})

export const siyavulaSource = (): TeachingSource => ({
  kind: 'siyavula',
  title: 'Siyavula Everything Maths, Grade 11',
  address: 'https://www.siyavula.com/read/za/mathematics/grade-11/functions',
  licence: 'Creative Commons Attribution License',
  credit: 'Based on Siyavula Everything Maths, Grade 11, Chapter 5: Functions, CC BY 3.0',
})

export const topicFile = (over: Partial<TopicLessons> = {}): TopicLessons => ({
  grade: 6,
  baseName: 'Common fractions',
  family: 'fractions',
  capsNames: ['Common fractions'],
  terms: [1, 4],
  source: capsSource(),
  lessons: [goodLesson()],
  status: [{ position: 1, status: 'ready', problems: [], writer: 'opencode/a-free', reviewer: 'opencode/b-free' }],
  generatedAt: '2026-11-16T20:00:00.000Z',
  ...over,
})
