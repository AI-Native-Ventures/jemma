import { describe, expect, test } from 'vitest'
import { KIT_PICTURES, PICTURE_KITS, kitPicturesFor, pictureBullet, primaryAnswerBlock, primaryKit } from '../src/ai/primary-answers'
import { renderPrompt } from '../src/ai/prompt-variants'
import { makeClassContext } from '../src/ai/subject-profile'
import { isSeniorQuestion } from '../src/logic/answers/quantity'
import { pictureProblem } from '../src/logic/picture'
import { DiagramSpecSchema, PrimaryPictureSpecSchema, SeniorDiagramSpecSchema, type SeniorDiagramSpec } from '../src/schemas/diagram'
import type { Question } from '../src/schemas/lesson'
import { PrimaryExtraQuestionSchema } from '../src/schemas/primary-extra'
import { DIAGRAM_WORDS, answerProblem } from '../src/tools/save/save-lesson'

// P197: the pictures of the "Data" and "Probability" boards: a tally table, a pie chart, a line plot, a spinner and a bag of counters for Grades 1 to 6, and a
// broken-line graph, a histogram, an ogive, a stem and leaf display, a scatter plot with its line of best fit and a Venn diagram for Grades 10 to 12. The demo
// schema does not change. No database, no network, no model.

const klass = (grade: number, country = 'ZA') => makeClassContext({ classId: 'c', subject: 'Mathematics', grade, country })
// An en dash or an em dash, written by its code so this file has none.
const LONG_DASH = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`)

const PIE: SeniorDiagramSpec = { kind: 'pie_chart', parts: [{ label: 'Walk', percent: 40 }, { label: 'Bus', percent: 25, ask: true }, { label: 'Car', percent: 20 }, { label: 'Taxi', percent: 15 }] }
const PRIMARY: SeniorDiagramSpec[] = [
  { kind: 'tally_table', heading: 'Pet', rows: [{ label: 'Dogs', count: 12 }, { label: 'Cats', count: 7 }] },
  PIE,
  { kind: 'dot_plot', marks: ['1', '2', '3', '4'], counts: [2, 5, 0, 3], title: 'Shoe size' },
  { kind: 'spinner', parts: ['gold', 'green', 'gold', 'red'] },
  { kind: 'counters', gold: 5, green: 3, red: 2 },
]
const SENIOR: SeniorDiagramSpec[] = [
  { kind: 'line_graph', labels: ['Mon', 'Tue', 'Wed'], values: [18, 22, 25], yMin: 10, yMax: 30, step: 5, unit: '°C' },
  { kind: 'histogram', start: 40, width: 10, counts: [3, 7, 12, 9, 4], xLabel: 'mark (%)', yLabel: 'learners' },
  { kind: 'ogive', start: 0, width: 20, totals: [4, 12, 26, 36, 40], readAt: 20 },
  { kind: 'stem_leaf', rows: [{ stem: 4, leaves: [5, 8] }, { stem: 5, leaves: [3, 3, 6, 9] }] },
  { kind: 'scatter', points: [{ x: 1, y: 30 }, { x: 4, y: 55 }, { x: 8, y: 80 }], xMax: 10, yMax: 100, line: { a: 24, b: 7.5 } },
  { kind: 'venn', a: 'Soccer', b: 'Netball', aOnly: '12', both: '?', bOnly: '8', neither: '5' },
]

const question = (over: Partial<Question> = {}): Question => ({
  prompt: 'What percentage of learners come by bus?',
  render: 'text',
  answer: '25',
  answerKind: 'whole',
  difficulty: 1,
  why: 'The parts of a pie chart add up to 100%.',
  rightWay: '100 - 40 - 20 - 15 = 25',
  diagram: PIE,
  ...over,
})

describe('the schemas', () => {
  test.each([...PRIMARY, ...SENIOR].map((d) => [d.kind, d] as const))('the wide reader takes %s, and it makes sense', (_kind, d) => {
    expect(SeniorDiagramSpecSchema.safeParse(d).success).toBe(true)
    expect(pictureProblem(d)).toBeNull()
  })

  test('the five of Grades 1 to 6 are primary pictures, and a lesson card keeps its seven', () => {
    for (const d of PRIMARY) {
      expect(PrimaryPictureSpecSchema.safeParse(d).success).toBe(true)
      expect(DiagramSpecSchema.safeParse(d).success).toBe(false)
      expect(isSeniorQuestion({ answerKind: 'whole', diagram: d })).toBe(false)
    }
    expect(PrimaryExtraQuestionSchema.safeParse(question()).success).toBe(true)
  })

  test('the six of Grades 10 to 12 are for a senior question only, and make it one', () => {
    for (const d of SENIOR) {
      expect(PrimaryPictureSpecSchema.safeParse(d).success).toBe(false)
      expect(isSeniorQuestion({ answerKind: 'whole', diagram: d })).toBe(true)
    }
  })

  test.each([
    ['a tally table of 6 rows', { kind: 'tally_table', rows: Array.from({ length: 6 }, (_, i) => ({ label: `R${i}`, count: 1 })) }, '2 to 5 rows'],
    ['a count of 21', { kind: 'tally_table', rows: [{ label: 'Dogs', count: 21 }, { label: 'Cats', count: 2 }] }, 'a count from 0 to 20'],
    ['percents that add up to 90', { kind: 'pie_chart', parts: [{ label: 'A', percent: 50 }, { label: 'B', percent: 40 }] }, 'add up to 100'],
    ['a pie chart that asks twice', { kind: 'pie_chart', parts: [{ label: 'A', percent: 50, ask: true }, { label: 'B', percent: 50, ask: true }] }, 'at most one part'],
    ['a line plot with a count missing', { kind: 'dot_plot', marks: ['1', '2', '3'], counts: [1, 2] }, 'each with its count'],
    ['a line plot with no dots', { kind: 'dot_plot', marks: ['1', '2'], counts: [0, 0] }, 'at least one dot'],
    ['a spinner of one part', { kind: 'spinner', parts: ['gold'] }, '2 to 12'],
    ['a bag of 25 counters', { kind: 'counters', gold: 20, red: 5 }, '2 to 20'],
    ['a point off the scale', { kind: 'line_graph', labels: ['Mon', 'Tue'], values: [5, 22], yMin: 10, yMax: 30 }, 'on its scale'],
    ['twelve long labels', { kind: 'line_graph', labels: Array.from({ length: 12 }, (_, i) => `W${i + 10}a`), values: Array(12).fill(1), yMin: 0, yMax: 10, step: 1 }, '1 to 3 when'],
    ['a histogram with no bars', { kind: 'histogram', start: 0, width: 10, counts: [0, 0] }, 'at least one bar'],
    ['running totals that go down', { kind: 'ogive', start: 0, width: 10, totals: [5, 3, 8] }, 'never go down'],
    ['an ogive read from past its top', { kind: 'ogive', start: 0, width: 10, totals: [5, 8], readAt: 9 }, 'between 0 and the last'],
    ['leaves out of order', { kind: 'stem_leaf', rows: [{ stem: 1, leaves: [5, 2] }, { stem: 2, leaves: [1] }] }, 'smallest first'],
    ['a point past the end of the plot', { kind: 'scatter', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 12, y: 3 }], xMax: 10, yMax: 10 }, 'on it'],
    ['a long part of a Venn diagram', { kind: 'venn', a: 'A', b: 'B', aOnly: 'twelve', both: '3', bOnly: '4' }, 'short number'],
  ] as const)('%s', (_name, d, words) => {
    expect(pictureProblem(d as unknown as SeniorDiagramSpec)).toContain(words)
  })
})

describe('the key fits the picture', () => {
  test('the part of a pie chart with a question mark: its percent is the key', () => {
    expect(answerProblem(question())).toBeNull()
    expect(answerProblem(question({ answer: '40' }))).toContain('the percent of Bus, 25')
    // A pie chart that asks about no part leaves the key to the question.
    expect(answerProblem(question({ prompt: 'What percentage walk?', answer: '40', diagram: { kind: 'pie_chart', parts: [{ label: 'Walk', percent: 40 }, { label: 'Bus', percent: 60 }] } }))).toBeNull()
  })
})

describe('the lesson writer', () => {
  test('data gets a tally table in Grades 1 to 4, a line plot from Grade 2 and a pie chart from Grade 4', () => {
    expect(KIT_PICTURES.data).toEqual(['bar_chart', 'tally_table', 'pie_chart', 'dot_plot'])
    expect(kitPicturesFor('data', 1)).toContain('tally_table')
    expect(kitPicturesFor('data', 1)).not.toContain('dot_plot')
    expect(kitPicturesFor('data', 3)).toEqual(expect.arrayContaining(['tally_table', 'dot_plot']))
    expect(kitPicturesFor('data', 3)).not.toContain('pie_chart')
    expect(kitPicturesFor('data', 5)).toEqual(expect.arrayContaining(['pie_chart', 'dot_plot']))
    expect(kitPicturesFor('data', 5)).not.toContain('tally_table')
    expect(pictureBullet('data', klass(5))).toContain('`pie_chart`')
  })

  test('probability has a kit of its own from Grade 4, and the demo class keeps its call', () => {
    expect(PICTURE_KITS).toContain('chance')
    expect(primaryKit(klass(5), 'Probability')).toBe('chance')
    expect(primaryKit(klass(4, 'US'), 'Probability')).toBe('chance')
    expect(primaryKit(klass(3), 'Probability')).toBeNull()
    expect(primaryKit(klass(6), 'Probability')).toBeNull()
    expect(primaryKit(klass(6, 'KE'), 'Probability')).toBe('chance')
    expect(KIT_PICTURES.chance).toEqual(['spinner', 'counters'])
    expect(primaryAnswerBlock('chance', klass(5))).toBe(pictureBullet('chance', klass(5)))
    expect(pictureBullet('chance', klass(5))).toContain('`spinner`')
    expect(pictureBullet('chance', klass(5))).toContain('`counters`')
  })

  test('the words have no long dashes', () => {
    for (const grade of [1, 2, 3, 4, 5, 6])
      for (const kit of ['data', 'chance'] as const) expect(pictureBullet(kit, klass(grade)) ?? '').not.toMatch(LONG_DASH)
    expect(renderPrompt('write_lesson', 'Use only the diagram kinds in the schema.', klass(11))).not.toMatch(LONG_DASH)
  })

  test('the senior writer is told of all of them', () => {
    const senior = renderPrompt('write_lesson', 'Use only the diagram kinds in the schema.', klass(11))
    for (const kind of ['`line_graph`', '`histogram`', '`ogive`', '`stem_leaf`', '`scatter`', '`venn`', '`spinner`', '`counters`', '`pie_chart`', '`tally_table`']) expect(senior).toContain(kind)
  })

  test('the save gate has words for each', () => {
    for (const d of [...PRIMARY, ...SENIOR]) expect(DIAGRAM_WORDS[d.kind], d.kind).toBeTruthy()
    expect(DIAGRAM_WORDS.venn).toBe('a Venn diagram')
    expect(DIAGRAM_WORDS.dot_plot).toBe('a line plot')
  })
})
