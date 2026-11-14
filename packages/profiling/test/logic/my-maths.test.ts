import { describe, expect, test } from 'vitest'
import { buildMyMaths, scoreText, type MyMathsInput } from '../../src/logic'

// "My maths": the learner's own count in each part of Mathematics. One pure function: no database, no clock but the `now` it is given.
// A score is { right, asked }: never a percent, never a grade, never anything about another learner.

const NOW = new Date('2026-11-13T15:00:00.000Z')

const topics = [
  { id: 't-equiv', name: 'Equivalent fractions', family: 'fractions', term: 4, position: 1, prerequisiteIds: [] },
  { id: 't-add', name: 'Adding fractions', family: 'fractions', term: 4, position: 2, prerequisiteIds: ['t-equiv'] },
  { id: 't-amount', name: 'Fractions of amounts', family: 'fractions', term: 4, position: 3, prerequisiteIds: [] },
  { id: 't-place', name: 'Place value', family: 'whole_numbers', term: 1, position: 1, prerequisiteIds: [] },
  { id: 't-dec', name: 'Adding decimals', family: 'decimals', term: 4, position: 4, prerequisiteIds: [] },
]

const base: MyMathsInput = { now: NOW, subject: 'Mathematics', topics: [], gaps: [], answers: [], sessions: [], history: [] }
const input = (over: Partial<MyMathsInput>): MyMathsInput => ({ ...base, ...over })

type Answer = MyMathsInput['answers'][number]
const answer = (topicName: string, correct: boolean, over: Partial<Answer> = {}): Answer => ({
  topicId: null, topicName, family: null, correct, paperStatus: 'marked', testHeld: false, ...over,
})
const many = (n: number, right: number, topicName: string, over: Partial<Answer> = {}): Answer[] =>
  Array.from({ length: n }, (_, i) => answer(topicName, i < right, over))

type Session = MyMathsInput['sessions'][number]
const session = (topicName: string, tries: boolean[], over: Partial<Session> = {}): Session => ({
  topicId: null, topicName, family: null, status: 'done', finishedAt: '2026-11-10T16:00:00Z',
  items: tries.map((correct) => ({ phase: 'try', correct })), ...over,
})
const gap = (topicName: string, stage: 'new' | 'practising' | 'fixed', over: Partial<MyMathsInput['gaps'][number]> = {}): MyMathsInput['gaps'][number] => ({
  topicId: null, topicName, stage, createdAt: '2026-10-01T08:00:00Z', fixedAt: stage === 'fixed' ? '2026-10-20T08:00:00Z' : null, ...over,
})

const strand = (out: ReturnType<typeof buildMyMaths>, family: string) => out.strands.find((s) => s.family === family)!
const topic = (out: ReturnType<typeof buildMyMaths>, id: string) => out.strands.flatMap((s) => s.topics).find((t) => t.id === id)!

describe('the words for a score', () => {
  test('"No score yet" when nothing was asked, otherwise "{right} of {asked} right"', () => {
    expect(scoreText({ right: 0, asked: 0 })).toBe('No score yet')
    expect(scoreText({ right: 5, asked: 6 })).toBe('5 of 6 right')
    expect(scoreText({ right: 0, asked: 4 })).toBe('0 of 4 right')
    expect(scoreText({ right: 1, asked: 1 })).toBe('1 of 1 right')
  })
})

describe('the parts of Mathematics', () => {
  test('all six strands come in the order of the subject, with "No score yet", for a learner with nothing at all', () => {
    const out = buildMyMaths(base)
    expect(out.strands.map((s) => [s.family, s.label])).toEqual([
      ['whole_numbers', 'Whole numbers'],
      ['fractions', 'Fractions'],
      ['decimals', 'Decimals'],
      ['shapes', 'Shapes and space'],
      ['measurement', 'Measurement'],
      ['data', 'Data handling'],
    ])
    expect(out.strands.every((s) => s.score.asked === 0 && s.topics.length === 0)).toBe(true)
    expect(out.gaps).toEqual([])
    expect(out.suggestions).toEqual([])
  })

  test('the topics of a strand are the topics of this year\'s map, by term then position, and a strand not in the list of the subject comes after', () => {
    const extra = { id: 't-pat', name: 'Number patterns', family: 'Patterns and Algebra', term: 2, position: 1, prerequisiteIds: [] }
    const out = buildMyMaths(input({ topics: [topics[2]!, topics[0]!, topics[1]!, extra] }))
    expect(strand(out, 'fractions').topics.map((t) => t.name)).toEqual(['Equivalent fractions', 'Adding fractions', 'Fractions of amounts'])
    expect(out.strands.map((s) => s.family).slice(-1)).toEqual(['patterns_and_algebra'])
    expect(out.strands.at(-1)).toMatchObject({ label: 'Patterns and algebra' })
    expect(out.strands.at(-1)!.topics.map((t) => t.name)).toEqual(['Number patterns'])
  })

  test('a map topic carries the stage of the learner\'s gap on it, found by id or by the same name', () => {
    const out = buildMyMaths(input({ topics, gaps: [gap('Adding fractions', 'practising', { topicId: 't-add' }), gap('  equivalent FRACTIONS ', 'fixed')] }))
    expect(topic(out, 't-add').gap).toBe('practising')
    expect(topic(out, 't-equiv').gap).toBe('fixed')
    expect(topic(out, 't-amount').gap).toBeNull()
  })
})

describe('what counts', () => {
  test('the answers of a test the teacher has not shared count nowhere, and appear once it is shared', () => {
    const held = [...many(6, 5, 'Adding fractions', { topicId: 't-add', testHeld: true })]
    expect(topic(buildMyMaths(input({ topics, answers: held })), 't-add').score).toEqual({ right: 0, asked: 0 })
    const shared = held.map((a) => ({ ...a, testHeld: false }))
    expect(topic(buildMyMaths(input({ topics, answers: shared })), 't-add').score).toEqual({ right: 5, asked: 6 })
  })

  test('a paper of no test counts (homework, a snapped report card), a paper still being read or waiting in Needs you or failed counts nowhere', () => {
    const answers = [
      ...many(2, 2, 'Adding fractions', { topicId: 't-add', testHeld: null }),
      ...many(3, 3, 'Adding fractions', { topicId: 't-add', paperStatus: 'reading' }),
      ...many(3, 3, 'Adding fractions', { topicId: 't-add', paperStatus: 'queued' }),
      ...many(3, 3, 'Adding fractions', { topicId: 't-add', paperStatus: 'needs_you' }),
      ...many(3, 3, 'Adding fractions', { topicId: 't-add', paperStatus: 'failed' }),
    ]
    expect(topic(buildMyMaths(input({ topics, answers })), 't-add').score).toEqual({ right: 2, asked: 2 })
  })

  test('the Try answers of a finished session count under the session\'s topic, the warm-up answers count nowhere', () => {
    const s = session('Adding fractions', [true, true, false, true, false], {
      topicId: 't-add',
      items: [
        { phase: 'warmup', correct: true },
        { phase: 'warmup', correct: true },
        ...[true, true, false, true, false].map((correct) => ({ phase: 'try', correct })),
      ],
    })
    expect(topic(buildMyMaths(input({ topics, sessions: [s] })), 't-add').score).toEqual({ right: 3, asked: 5 })
  })

  test('a session that is not finished counts nowhere', () => {
    for (const status of ['planned', 'in_progress']) {
      expect(topic(buildMyMaths(input({ topics, sessions: [session('Adding fractions', [true, true], { topicId: 't-add', status, finishedAt: null })] })), 't-add').score.asked).toBe(0)
    }
  })

  test('answers and sessions on one topic are added together', () => {
    const out = buildMyMaths(input({ topics, answers: many(6, 2, 'Adding fractions', { topicId: 't-add' }), sessions: [session('Adding fractions', [true, true, true], { topicId: 't-add' })] }))
    expect(topic(out, 't-add').score).toEqual({ right: 5, asked: 9 })
  })

  test('an answer is found under its topic by id, or by the same name (case and spaces do not matter) when it has no id', () => {
    const out = buildMyMaths(input({ topics, answers: [answer('adding FRACTIONS ', true), answer('Adding fractions', false, { topicId: 't-add' }), answer('Equivalent fractions', true, { topicId: 'a-topic-of-another-map' })] }))
    expect(topic(out, 't-add').score).toEqual({ right: 1, asked: 2 })
    // an id that is on no map still finds the topic by its name
    expect(topic(out, 't-equiv').score).toEqual({ right: 1, asked: 1 })
  })

  test('the past records are not an input: the history of the Long view changes no score', () => {
    const history = [{ subject: 'Mathematics', family: 'fractions', label: 'Fractions', byTerm: [{ year: 2025, term: 3, percent: 12 }] }]
    const a = buildMyMaths(input({ topics, answers: many(4, 3, 'Adding fractions', { topicId: 't-add' }) }))
    const b = buildMyMaths(input({ topics, answers: many(4, 3, 'Adding fractions', { topicId: 't-add' }), history }))
    expect(b.strands.map((s) => s.score)).toEqual(a.strands.map((s) => s.score))
    expect(b.gaps).toEqual(a.gaps)
  })
})

describe('a strand', () => {
  test('is the sum of its map topics', () => {
    const answers = [...many(6, 5, 'Equivalent fractions', { topicId: 't-equiv' }), ...many(4, 1, 'Adding fractions', { topicId: 't-add' })]
    const out = buildMyMaths(input({ topics, answers }))
    expect(strand(out, 'fractions').score).toEqual({ right: 6, asked: 10 })
    expect(strand(out, 'decimals').score).toEqual({ right: 0, asked: 0 })
  })

  test('also holds the answers and sessions of a topic that is on no map, through its family or through its name', () => {
    const answers = [
      answer('Mixed numbers', true, { family: 'fractions' }), // its family is the strand
      answer('Common FRACTIONS', true, { family: 'common fractions' }), // the family in another word of the same strand
      answer('Fractions', false), // its name is the strand's label
      answer('Mental sums', true), // nothing says which strand: counts nowhere in a strand
    ]
    const out = buildMyMaths(input({ topics, answers, sessions: [session('Decimals', [true, true, false])] }))
    expect(strand(out, 'fractions').score).toEqual({ right: 2, asked: 3 })
    expect(strand(out, 'decimals').score).toEqual({ right: 2, asked: 3 })
    expect(out.strands.reduce((sum, s) => sum + s.score.asked, 0)).toBe(6)
  })

  test('an answer counted under a map topic is not counted again as an unmatched answer', () => {
    const out = buildMyMaths(input({ topics, answers: [answer('Adding fractions', true, { family: 'fractions' })] }))
    expect(strand(out, 'fractions').score).toEqual({ right: 1, asked: 1 })
  })
})

describe('the learner\'s gaps', () => {
  test('open gaps first in the order the planner would take them (the basic before what needs it, then by stage, then oldest), then fixed gaps, newest fixed first', () => {
    const gaps = [
      gap('Adding fractions', 'practising', { topicId: 't-add', createdAt: '2026-10-02T08:00:00Z' }),
      gap('Fixed long ago', 'fixed', { fixedAt: '2026-09-01T08:00:00Z' }),
      gap('Equivalent fractions', 'new', { topicId: 't-equiv', createdAt: '2026-10-05T08:00:00Z' }),
      gap('Fixed lately', 'fixed', { fixedAt: '2026-11-01T08:00:00Z' }),
      gap('Adding decimals', 'new', { topicId: 't-dec', createdAt: '2026-10-01T08:00:00Z' }),
    ]
    const out = buildMyMaths(input({ topics, gaps }))
    expect(out.gaps.map((g) => [g.topicName, g.stage])).toEqual([
      ['Adding decimals', 'new'],
      ['Equivalent fractions', 'new'],
      ['Adding fractions', 'practising'],
      ['Fixed lately', 'fixed'],
      ['Fixed long ago', 'fixed'],
    ])
  })

  test('a basic that is itself a gap comes before the gap that needs it', () => {
    // "Adding fractions" is the oldest new gap, but it needs "Equivalent fractions", which is a gap too (practising): that one is first
    const gaps = [
      gap('Adding fractions', 'new', { topicId: 't-add', createdAt: '2026-10-01T08:00:00Z' }),
      gap('Equivalent fractions', 'practising', { topicId: 't-equiv', createdAt: '2026-10-09T08:00:00Z' }),
      gap('Adding decimals', 'new', { topicId: 't-dec', createdAt: '2026-10-03T08:00:00Z' }),
    ]
    expect(buildMyMaths(input({ topics, gaps })).gaps.map((g) => g.topicName)).toEqual(['Equivalent fractions', 'Adding fractions', 'Adding decimals'])
  })

  test('each gap has its score, by id or by name, and a gap whose topic is on no map is scored under its name', () => {
    const gaps = [gap('Adding fractions', 'new', { topicId: 't-add' }), gap('Mental sums', 'practising')]
    const answers = [...many(6, 2, 'Adding fractions', { topicId: 't-add' }), ...many(3, 3, 'mental SUMS')]
    const out = buildMyMaths(input({ topics, gaps, answers, sessions: [session('Mental sums', [false, true])] }))
    expect(out.gaps.find((g) => g.topicName === 'Adding fractions')!.score).toEqual({ right: 2, asked: 6 })
    expect(out.gaps.find((g) => g.topicName === 'Mental sums')!.score).toEqual({ right: 4, asked: 5 })
  })

  test('no gaps gives an empty list', () => {
    expect(buildMyMaths(input({ topics })).gaps).toEqual([])
  })
})

describe('suggested for you', () => {
  const open = [
    gap('Equivalent fractions', 'new', { topicId: 't-equiv', createdAt: '2026-10-01T08:00:00Z' }),
    gap('Adding fractions', 'practising', { topicId: 't-add', createdAt: '2026-10-02T08:00:00Z' }),
  ]

  test('the open gaps come first, in the order the planner would take them, with their reasons in plain words', () => {
    const out = buildMyMaths(input({ topics, gaps: open, answers: many(6, 2, 'Adding fractions', { topicId: 't-add' }) }))
    expect(out.suggestions).toEqual([
      { topicId: 't-equiv', topicName: 'Equivalent fractions', family: 'fractions', why: 'new', reason: 'To fix', score: { right: 0, asked: 0 } },
      { topicId: 't-add', topicName: 'Adding fractions', family: 'fractions', why: 'practising', reason: 'Practising', score: { right: 2, asked: 6 } },
    ])
  })

  test('then the fixed gap that pickPractice would pick (practised longest ago), "Keep it fixed"', () => {
    const gaps = [
      ...open,
      gap('Adding decimals', 'fixed', { topicId: 't-dec', fixedAt: '2026-10-20T08:00:00Z' }),
      gap('Place value', 'fixed', { topicId: 't-place', fixedAt: '2026-10-10T08:00:00Z' }),
    ]
    const sessions = [session('Place value', [true, true, true, true, true], { topicId: 't-place', finishedAt: '2026-11-12T16:00:00Z' })]
    const out = buildMyMaths(input({ topics, gaps, sessions }))
    expect(out.suggestions.map((s) => [s.topicName, s.reason])).toEqual([
      ['Equivalent fractions', 'To fix'],
      ['Adding fractions', 'Practising'],
      ['Adding decimals', 'Keep it fixed'],
    ])
    expect(out.suggestions[2]).toMatchObject({ topicId: 't-dec', family: 'decimals', why: 'fixed', score: { right: 0, asked: 0 } })
  })

  test('there are never more than three: open gaps are cut at three and leave no room for the fixed one', () => {
    const gaps = [
      gap('Equivalent fractions', 'new', { topicId: 't-equiv', createdAt: '2026-10-01T08:00:00Z' }),
      gap('Adding fractions', 'new', { topicId: 't-add', createdAt: '2026-10-02T08:00:00Z' }),
      gap('Fractions of amounts', 'new', { topicId: 't-amount', createdAt: '2026-10-03T08:00:00Z' }),
      gap('Adding decimals', 'new', { topicId: 't-dec', createdAt: '2026-10-04T08:00:00Z' }),
      gap('Place value', 'fixed', { topicId: 't-place' }),
    ]
    const out = buildMyMaths(input({ topics, gaps }))
    expect(out.suggestions).toHaveLength(3)
    expect(out.suggestions.map((s) => s.topicName)).toEqual(['Equivalent fractions', 'Adding fractions', 'Fractions of amounts'])
    expect(out.gaps).toHaveLength(5)
  })

  test('with only fixed gaps the one fixed gap pickPractice picks is the only suggestion', () => {
    const gaps = [gap('Adding decimals', 'fixed', { topicId: 't-dec' }), gap('Place value', 'fixed', { topicId: 't-place' })]
    const out = buildMyMaths(input({ topics, gaps, history: [{ subject: 'Mathematics', family: 'fractions', label: 'Fractions', byTerm: [{ year: 2025, term: 3, percent: 10 }] }] }))
    expect(out.suggestions).toHaveLength(1)
    expect(out.suggestions[0]).toMatchObject({ why: 'fixed', reason: 'Keep it fixed' })
  })

  test('with no gap at all, the weakest strand of the past records comes next: its label, no topic id, "A good next step", and the score of the strand', () => {
    const history = [
      { subject: 'Mathematics', family: 'whole_numbers', label: 'Whole numbers', byTerm: [{ year: 2025, term: 3, percent: 90 }] },
      { subject: 'Mathematics', family: 'fractions', label: 'Fractions', byTerm: [{ year: 2025, term: 3, percent: 30 }] },
    ]
    const out = buildMyMaths(input({ topics, history, answers: many(8, 3, 'Adding fractions', { topicId: 't-add' }) }))
    expect(out.suggestions).toEqual([{ topicId: null, topicName: 'Fractions', family: 'fractions', why: 'history', reason: 'A good next step', score: { right: 3, asked: 8 } }])
  })

  test('with no gap and no past records, the first topic of the term from the map is suggested', () => {
    const out = buildMyMaths(input({ topics }))
    expect(out.suggestions).toEqual([{ topicId: 't-equiv', topicName: 'Equivalent fractions', family: 'fractions', why: 'map', reason: 'A good next step', score: { right: 0, asked: 0 } }])
  })

  test('with nothing at all there is no suggestion', () => {
    expect(buildMyMaths(base).suggestions).toEqual([])
  })

  test('the past records are only a reason to suggest when there is no gap: an open gap hides them', () => {
    const history = [{ subject: 'Mathematics', family: 'fractions', label: 'Fractions', byTerm: [{ year: 2025, term: 3, percent: 10 }] }]
    const out = buildMyMaths(input({ topics, history, gaps: [gap('Adding decimals', 'new', { topicId: 't-dec' })] }))
    expect(out.suggestions.map((s) => s.why)).toEqual(['new'])
  })
})
