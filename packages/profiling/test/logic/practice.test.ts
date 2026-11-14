import { describe, expect, test } from 'vitest'
import { orderOpenGaps, pickPractice, resolveChoice, type ChoiceRules, type PracticeInput } from '../../src/logic'

// What a learner practises when nothing is planned: a fixed gap kept fixed, else the weakest strand of the past records, else the first topic
// of the term. One pure function: no database, no clock but the `now` it is given. An open gap never comes here (the planner plans it).

const NOW = new Date('2026-11-13T15:00:00.000Z') // term 4
const at = (iso: string) => iso

const base: PracticeInput = { now: NOW, fixedGaps: [], finishedSessions: [], strands: [], mapTopics: [] }
const input = (over: Partial<PracticeInput>): PracticeInput => ({ ...base, ...over })

const topics = [
  { id: 't-frac', name: 'Fractions with different denominators', family: 'fractions', term: 4, position: 2 },
  { id: 't-dec', name: 'Adding decimals', family: 'decimals', term: 4, position: 1 },
  { id: 't-whole', name: 'Place value', family: 'whole_numbers', term: 1, position: 1 },
  { id: 't-shape', name: 'Angles', family: 'shapes', term: 2, position: 1 },
]

describe('fixed: a fixed gap practised longest ago', () => {
  const gaps = [
    { topicId: 't-frac', topicName: 'Fractions with different denominators', fixedAt: at('2026-10-20T08:00:00Z') },
    { topicId: 't-dec', topicName: 'Adding decimals', fixedAt: at('2026-10-25T08:00:00Z') },
  ]

  test('the one practised longest ago is picked, with its topic id and family', () => {
    const finishedSessions = [
      { topicId: 't-frac', topicName: 'Fractions with different denominators', finishedAt: at('2026-11-12T16:00:00Z') },
      { topicId: 't-dec', topicName: 'Adding decimals', finishedAt: at('2026-11-02T16:00:00Z') },
    ]
    expect(pickPractice(input({ fixedGaps: gaps, finishedSessions, mapTopics: topics }))).toEqual({
      topicName: 'Adding decimals',
      topicId: 't-dec',
      family: 'decimals',
      why: 'fixed',
    })
  })

  test('a gap never practised since it was fixed counts as the oldest', () => {
    const finishedSessions = [{ topicId: 't-frac', topicName: 'Fractions with different denominators', finishedAt: at('2026-11-12T16:00:00Z') }]
    expect(pickPractice(input({ fixedGaps: gaps, finishedSessions, mapTopics: topics }))?.topicName).toBe('Adding decimals')
  })

  test('the session that fixed the gap does not count as practice: only a session after the gap was fixed does', () => {
    const finishedSessions = [
      { topicId: 't-frac', topicName: 'Fractions with different denominators', finishedAt: at('2026-10-19T16:00:00Z') }, // before it was fixed
      { topicId: 't-dec', topicName: 'Adding decimals', finishedAt: at('2026-10-30T16:00:00Z') }, // after it was fixed
    ]
    expect(pickPractice(input({ fixedGaps: gaps, finishedSessions, mapTopics: topics }))?.topicName).toBe('Fractions with different denominators')
  })

  test('a session is found by the topic id, or by the same name (case and spaces do not matter) when it has no id', () => {
    const finishedSessions = [
      { topicId: null, topicName: '  adding DECIMALS ', finishedAt: at('2026-11-12T16:00:00Z') },
      { topicId: 't-frac', topicName: null, finishedAt: at('2026-11-05T16:00:00Z') },
    ]
    expect(pickPractice(input({ fixedGaps: gaps, finishedSessions, mapTopics: topics }))?.topicName).toBe('Fractions with different denominators')
  })

  test('ties (neither practised since) go to the earlier fixed_at, then to the name', () => {
    expect(pickPractice(input({ fixedGaps: gaps, mapTopics: topics }))?.topicName).toBe('Fractions with different denominators')
    const sameDay = [
      { topicId: null, topicName: 'Zebra', fixedAt: at('2026-10-20T08:00:00Z') },
      { topicId: null, topicName: 'Apple', fixedAt: at('2026-10-20T08:00:00Z') },
    ]
    expect(pickPractice(input({ fixedGaps: sameDay }))?.topicName).toBe('Apple')
  })

  test('a gap with no fixed_at is the oldest among gaps nobody practised', () => {
    const unknown = [
      { topicId: null, topicName: 'Dated', fixedAt: at('2026-10-20T08:00:00Z') },
      { topicId: null, topicName: 'Undated', fixedAt: null },
    ]
    expect(pickPractice(input({ fixedGaps: unknown }))?.topicName).toBe('Undated')
  })

  test('a gap whose topic is on no map has no id and no family, and is still picked by name', () => {
    expect(pickPractice(input({ fixedGaps: [{ topicId: null, topicName: 'Mental sums', fixedAt: null }] }))).toEqual({ topicName: 'Mental sums', topicId: null, family: '', why: 'fixed' })
  })

  test('the topic id of the gap is kept, and a gap with no id takes the id of the map topic of the same name', () => {
    const pick = pickPractice(input({ fixedGaps: [{ topicId: null, topicName: 'adding decimals', fixedAt: null }], mapTopics: topics }))
    expect(pick).toMatchObject({ topicId: 't-dec', family: 'decimals', topicName: 'adding decimals' })
  })

  test('a fixed gap comes before the past records and the map', () => {
    const strands = [{ subject: 'Mathematics', family: 'fractions', label: 'Fractions', byTerm: [{ year: 2026, term: 3, percent: 10 }] }]
    expect(pickPractice(input({ fixedGaps: gaps, strands, mapTopics: topics }))?.why).toBe('fixed')
  })
})

describe('history: the weakest strand of the past records', () => {
  const strand = (family: string, label: string, percents: (number | null)[], subject = 'Mathematics') => ({
    subject,
    family,
    label,
    byTerm: percents.map((percent, i) => ({ year: 2025 + Math.floor(i / 4), term: (i % 4) + 1, percent })),
  })

  test('the lowest mean over the last three terms that have marks wins, and the pick is the strand with its plain label', () => {
    const strands = [strand('whole_numbers', 'Whole numbers', [80, 82, 85]), strand('fractions', 'Fractions', [50, 55, 60]), strand('decimals', 'Decimals', [70, 72, 75])]
    expect(pickPractice(input({ strands }))).toEqual({ topicName: 'Fractions', topicId: null, family: 'fractions', why: 'history' })
  })

  test('only the last three terms with marks count: an old bad term is forgotten, a term with no marks is left out', () => {
    const strands = [
      strand('fractions', 'Fractions', [10, 90, 90, null, 90]), // last three with marks: 90, 90, 90
      strand('decimals', 'Decimals', [40, 60, null, 60, 60]), // last three with marks: 60, 60, 60
    ]
    expect(pickPractice(input({ strands }))?.topicName).toBe('Decimals')
  })

  test('a strand with fewer than three marked terms still counts, with the terms it has', () => {
    const strands = [strand('whole_numbers', 'Whole numbers', [70, 70, 70]), strand('shapes', 'Shapes and space', [null, 40])]
    expect(pickPractice(input({ strands }))?.topicName).toBe('Shapes and space')
  })

  test('a strand with no marks at all is never picked', () => {
    const strands = [strand('fractions', 'Fractions', [null, null]), strand('decimals', 'Decimals', [90])]
    expect(pickPractice(input({ strands }))?.topicName).toBe('Decimals')
    expect(pickPractice(input({ strands: [strand('fractions', 'Fractions', [null, null])] }))).toBeNull()
  })

  test('terms are put in order whatever order they come in', () => {
    const byTerm = [
      { year: 2026, term: 3, percent: 90 },
      { year: 2024, term: 1, percent: 0 },
      { year: 2025, term: 4, percent: 90 },
      { year: 2026, term: 2, percent: 90 },
    ]
    const strands = [{ subject: 'Mathematics', family: 'fractions', label: 'Fractions', byTerm }, strand('decimals', 'Decimals', [80, 80, 80])]
    expect(pickPractice(input({ strands }))?.topicName).toBe('Decimals')
  })

  test('a tie goes to the strand that comes first in the subject', () => {
    const strands = [strand('whole_numbers', 'Whole numbers', [60]), strand('fractions', 'Fractions', [60])]
    expect(pickPractice(input({ strands }))?.topicName).toBe('Whole numbers')
  })

  test('a strand practised in a session that finished today is skipped when another strand qualifies', () => {
    const strands = [strand('fractions', 'Fractions', [30]), strand('decimals', 'Decimals', [60]), strand('shapes', 'Shapes and space', [90])]
    const today = [{ topicId: null, topicName: 'Fractions', finishedAt: at('2026-11-13T09:00:00Z') }]
    expect(pickPractice(input({ strands, finishedSessions: today }))?.topicName).toBe('Decimals')
    // yesterday does not count
    const yesterday = [{ topicId: null, topicName: 'Fractions', finishedAt: at('2026-11-12T23:00:00Z') }]
    expect(pickPractice(input({ strands, finishedSessions: yesterday }))?.topicName).toBe('Fractions')
  })

  test('a session on a map topic counts for its strand, and so does a session named by the strand key', () => {
    const strands = [strand('fractions', 'Fractions', [30]), strand('decimals', 'Decimals', [60])]
    const byMapTopic = [{ topicId: 't-frac', topicName: 'Fractions with different denominators', finishedAt: at('2026-11-13T09:00:00Z') }]
    expect(pickPractice(input({ strands, finishedSessions: byMapTopic, mapTopics: topics }))?.topicName).toBe('Decimals')
    const byKey = [{ topicId: null, topicName: 'fractions', finishedAt: at('2026-11-13T09:00:00Z') }]
    expect(pickPractice(input({ strands, finishedSessions: byKey }))?.topicName).toBe('Decimals')
  })

  test('when every strand was practised today the weakest is picked anyway', () => {
    const strands = [strand('fractions', 'Fractions', [30]), strand('decimals', 'Decimals', [60])]
    const today = [
      { topicId: null, topicName: 'Fractions', finishedAt: at('2026-11-13T09:00:00Z') },
      { topicId: null, topicName: 'Decimals', finishedAt: at('2026-11-13T10:00:00Z') },
    ]
    expect(pickPractice(input({ strands, finishedSessions: today }))?.topicName).toBe('Fractions')
  })

  test('history comes before the map', () => {
    expect(pickPractice(input({ strands: [strand('fractions', 'Fractions', [30])], mapTopics: topics }))?.why).toBe('history')
  })
})

describe('map: the first topic of the current term', () => {
  test('the topic with the lowest position in the current term', () => {
    expect(pickPractice(input({ mapTopics: topics }))).toEqual({ topicName: 'Adding decimals', topicId: 't-dec', family: 'decimals', why: 'map' })
  })

  test('the current term is the calendar quarter of now', () => {
    expect(pickPractice(input({ now: new Date('2026-02-10T08:00:00Z'), mapTopics: topics }))?.topicName).toBe('Place value')
    expect(pickPractice(input({ now: new Date('2026-05-10T08:00:00Z'), mapTopics: topics }))?.topicName).toBe('Angles')
  })

  test('a current term with no topic gives the first topic of the map', () => {
    expect(pickPractice(input({ now: new Date('2026-08-10T08:00:00Z'), mapTopics: topics }))?.topicName).toBe('Place value')
  })

  test('topics of one position are put in order by name, so the pick never depends on the order they were read in', () => {
    const same = [
      { id: 'b', name: 'Bravo', family: 'data', term: 4, position: 1 },
      { id: 'a', name: 'Alpha', family: 'data', term: 4, position: 1 },
    ]
    expect(pickPractice(input({ mapTopics: same }))?.topicName).toBe('Alpha')
    expect(pickPractice(input({ mapTopics: [...same].reverse() }))?.topicName).toBe('Alpha')
  })
})

describe('nothing', () => {
  test('no fixed gap, no marks and no map gives null', () => {
    expect(pickPractice(base)).toBeNull()
  })
})

describe('orderOpenGaps: the order the planner takes open gaps in', () => {
  const g = (name: string, stage: 'new' | 'practising', created: string, id: string | null = null) => ({ topic_id: id, name, stage, created_at: created })
  const none = () => [] as string[]

  test('lowest stage first, then the oldest', () => {
    const gaps = [g('B', 'practising', '2026-10-01'), g('C', 'new', '2026-10-05'), g('A', 'new', '2026-10-02')]
    expect(orderOpenGaps(gaps, none).map((x) => x.name)).toEqual(['A', 'C', 'B'])
  })

  test('the basic a gap needs comes first when it is a gap too, down the chain, and the rest keep their order', () => {
    const gaps = [g('Add', 'new', '2026-10-01', 't-add'), g('Equiv', 'practising', '2026-10-09', 't-equiv'), g('Dec', 'new', '2026-10-03', 't-dec'), g('Pieces', 'practising', '2026-10-10', 't-pieces')]
    const needs: Record<string, string[]> = { 't-add': ['t-equiv'], 't-equiv': ['t-pieces'] }
    expect(orderOpenGaps(gaps, (id) => needs[id] ?? []).map((x) => x.name)).toEqual(['Pieces', 'Add', 'Dec', 'Equiv'])
  })

  test('a loop of prerequisites ends, and no gap is lost or repeated', () => {
    const gaps = [g('A', 'new', '2026-10-01', 'a'), g('B', 'new', '2026-10-02', 'b')]
    const out = orderOpenGaps(gaps, (id) => (id === 'a' ? ['b'] : ['a']))
    expect(out.map((x) => x.name).sort()).toEqual(['A', 'B'])
  })

  test('it does not change the list it is given, and no gap gives no order', () => {
    const gaps = [g('B', 'practising', '2026-10-01'), g('A', 'new', '2026-10-02')]
    orderOpenGaps(gaps, none)
    expect(gaps.map((x) => x.name)).toEqual(['B', 'A'])
    expect(orderOpenGaps([], none)).toEqual([])
  })
})

describe('resolveChoice: the learner\'s choice is theirs to make', () => {
  const rules: ChoiceRules = {
    mapTopics: [
      { id: 't-add', name: 'Adding fractions', family: 'fractions' },
      { id: 't-dec', name: 'Adding decimals', family: 'decimals' },
    ],
    gaps: [
      { topicId: 't-add', topicName: 'Adding fractions' },
      { topicId: null, topicName: 'Mental sums' },
    ],
    subject: 'Mathematics',
  }
  const choose = (topicName: string, topicId?: string | null, over: Partial<ChoiceRules> = {}) => resolveChoice({ topicName, topicId }, { ...rules, ...over })

  test('a topic of the map is accepted by id, or by name (case and spaces do not matter), and comes back in the map\'s own words', () => {
    expect(choose('anything', 't-dec')).toEqual({ topicName: 'Adding decimals', topicId: 't-dec', family: 'decimals', kind: 'map' })
    expect(choose('  adding DECIMALS ')).toEqual({ topicName: 'Adding decimals', topicId: 't-dec', family: 'decimals', kind: 'map' })
    expect(choose('Adding decimals', 'some-other-id')).toMatchObject({ topicId: 't-dec', kind: 'map' })
  })

  test('the name of one of the learner\'s gaps is accepted, with the topic id and family of the map when it has them', () => {
    expect(choose('mental sums')).toEqual({ topicName: 'Mental sums', topicId: null, family: '', kind: 'gap' })
    expect(choose('Mental sums', null, { gaps: [{ topicId: null, topicName: 'Adding decimals' }, ...rules.gaps] })).toMatchObject({ kind: 'gap' })
    expect(choose('Old topic', null, { gaps: [{ topicId: null, topicName: 'Old topic' }] })).toMatchObject({ topicName: 'Old topic', topicId: null, kind: 'gap' })
  })

  test('the label of a strand of the learner\'s subject is accepted, with its key as the family and no topic id', () => {
    expect(choose('Fractions')).toEqual({ topicName: 'Fractions', topicId: null, family: 'fractions', kind: 'strand' })
    expect(choose('shapes and SPACE')).toEqual({ topicName: 'Shapes and space', topicId: null, family: 'shapes', kind: 'strand' })
    expect(choose('Whole numbers', null, { mapTopics: [] })).toMatchObject({ family: 'whole_numbers', kind: 'strand' })
  })

  test('a topic of another class\'s map, a name nobody knows and an empty name are refused', () => {
    expect(choose('Angles', 't-of-another-class')).toBeNull()
    expect(choose('Quadratic equations')).toBeNull()
    expect(choose('')).toBeNull()
    expect(choose('   ', 't-add')).toBeNull()
  })

  test('a strand of another subject is refused, and with no subject no strand is offered', () => {
    expect(choose('Reading')).toBeNull()
    expect(choose('Fractions', null, { subject: null })).toBeNull()
    expect(choose('Reading', null, { subject: 'English' })).toMatchObject({ kind: 'strand', family: 'reading' })
  })

  test('the key of a strand is not its label: only the label is accepted', () => {
    expect(choose('whole_numbers')).toBeNull()
  })
})
