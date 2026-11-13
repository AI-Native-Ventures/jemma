import { describe, expect, test } from 'vitest'
import { applyFix, parseTable, pickFamily, readRows, resolveFamily, validateOneResult, type FamilyChoice, type ReadContext } from '../../src/logic'
import type { FileMapping } from '../../src/schemas'

// A strand written in a file ("Numbers", "Shape", "speaking-listening") is matched to the strand the class offers through the one plain form
// of canonicalFamily (P73b). What matched before still matches the same way: the exact key or label comes first.

const maths: FamilyChoice[] = [
  { family: 'whole_numbers', label: 'Whole numbers' },
  { family: 'fractions', label: 'Fractions' },
  { family: 'decimals', label: 'Decimals' },
  { family: 'shapes', label: 'Shapes and space' },
  { family: 'measurement', label: 'Measurement' },
  { family: 'data', label: 'Data handling' },
]
const english: FamilyChoice[] = [
  { family: 'reading', label: 'Reading' },
  { family: 'writing', label: 'Writing' },
  { family: 'language', label: 'Language' },
  { family: 'speaking_listening', label: 'Speaking and listening' },
]

describe('pickFamily: what matched before, matches the same way', () => {
  test('the exact key, or the exact label, in any case', () => {
    expect(pickFamily('fractions', maths, 'Mathematics')).toBe('fractions')
    expect(pickFamily('Whole numbers', maths, 'Mathematics')).toBe('whole_numbers')
    expect(pickFamily('SHAPES AND SPACE', maths, 'Mathematics')).toBe('shapes')
    expect(pickFamily('data_handling', maths)).toBe('data')
  })

  test('without a subject nothing new matches', () => {
    expect(pickFamily('Numbers', maths)).toBeNull()
    expect(pickFamily('Shape', maths)).toBeNull()
  })

  test('a class that offers no list gets a tidy short word, as before', () => {
    expect(pickFamily('Number Sense', null, 'Mathematics')).toBe('number_sense')
  })

  test('a word nobody knows is not a strand', () => {
    expect(pickFamily('robotics', maths, 'Mathematics')).toBeNull()
    expect(pickFamily('', maths, 'Mathematics')).toBeNull()
  })
})

describe('pickFamily: a cell that says it another way', () => {
  test('Mathematics words of the table find the strand the class offers', () => {
    expect(pickFamily('Numbers', maths, 'Mathematics')).toBe('whole_numbers')
    expect(pickFamily('number sense', maths, 'Mathematics')).toBe('whole_numbers')
    expect(pickFamily('Place value', maths, 'Mathematics')).toBe('whole_numbers')
    expect(pickFamily('Shape', maths, 'Mathematics')).toBe('shapes')
    expect(pickFamily('geometry', maths, 'Mathematics')).toBe('shapes')
    expect(pickFamily('Decimal fractions', maths, 'Mathematics')).toBe('decimals')
    expect(pickFamily('common fractions', maths, 'Mathematics')).toBe('fractions')
    expect(pickFamily('statistics', maths, 'Mathematics')).toBe('data')
    expect(pickFamily('Measuring', maths, 'Mathematics')).toBe('measurement')
  })

  test('"Maths" is Mathematics', () => {
    expect(pickFamily('Numbers', maths, 'Maths')).toBe('whole_numbers')
  })

  test('hyphens, underscores and extra spaces do not matter in another subject either', () => {
    expect(pickFamily('speaking-listening', english, 'English')).toBe('speaking_listening')
    expect(pickFamily('  Speaking   and  Listening ', english, 'English')).toBe('speaking_listening')
  })

  test('a strand the class does not offer is still not a strand, and the Mathematics words do not leak into another subject', () => {
    const noDecimals = maths.filter((f) => f.family !== 'decimals')
    expect(pickFamily('Decimal fractions', noDecimals, 'Mathematics')).toBeNull()
    expect(pickFamily('Numbers', english, 'English')).toBeNull()
  })

  test('a class whose strands came from a model-drafted map still finds its own spelling', () => {
    const own: FamilyChoice[] = [
      { family: 'patterns_and_algebra', label: 'Patterns and algebra' },
      { family: 'whole_numbers', label: 'Whole numbers' },
    ]
    expect(pickFamily('Patterns and Algebra', own, 'Mathematics')).toBe('patterns_and_algebra')
    expect(pickFamily('patterns-and-algebra', own, 'Mathematics')).toBe('patterns_and_algebra')
    expect(pickFamily('Numbers', own, 'Mathematics')).toBe('whole_numbers')
  })
})

describe('where a strand is read: the model\'s word for a topic, one typed result, a fix', () => {
  test('resolveFamily: the model said "numbers" for the topic and the class offers whole_numbers', () => {
    const topics = [{ text: 'Counting in tens', family: 'numbers' }]
    expect(resolveFamily('Counting in tens', topics, maths, 'Mathematics')).toBe('whole_numbers')
    // without the subject the old way: the model's word is not one the class offers, and the topic words name no strand
    expect(resolveFamily('Counting in tens', topics, maths)).toBeNull()
  })

  test('an answer of "unsure" still stands as unsure', () => {
    expect(resolveFamily('Counting in tens', [{ text: 'Counting in tens', family: 'unsure' }], maths, 'Mathematics')).toBeNull()
  })

  test('readRows: a topic the model placed in "shape" lands in the shapes strand of a Mathematics class', () => {
    const ctx: ReadContext = { learners: [{ id: 'amina', firstName: 'Amina', lastName: null }], subject: 'Mathematics', grade: 6, year: 2026, country: 'ZA', families: maths }
    const none = { learner: null, mark: null, outOf: null, percent: null, date: null, term: null, year: null, grade: null, subject: null, title: null, kind: null, topic: null, note: null, teacher: null, attendance: null }
    const mapping: FileMapping = {
      ...none,
      learner: 'Learner', date: 'Date', title: 'Assessment', topic: 'Topic', mark: 'Mark', outOf: 'Total',
      fixed: { kind: null, outOf: null, grade: null, year: null, term: null, subject: null, teacher: null },
      topics: [{ text: 'Triangles', family: 'shape' }],
    }
    const { rows } = readRows(parseTable('Learner,Date,Assessment,Topic,Mark,Total\nAmina,2025-02-12,Class Test 1,Triangles,16,20\n'), mapping, ctx)
    expect(rows[0]!.family).toBe('shapes')
  })

  test('validateOneResult: a typed strand "Numbers" is whole_numbers; a made-up one still gets the old sentence', () => {
    const c = { subject: 'Maths', year: 2026, families: maths }
    const quiz = { kind: 'quiz', grade: 5, year: 2025, term: 1, title: 'Class Test 1', marks: 14, outOf: 20, teacherName: 'Mrs Naidoo' }
    expect(validateOneResult({ ...quiz, family: 'Numbers' }, c)).toMatchObject({ ok: true, value: { family: 'whole_numbers' } })
    expect(validateOneResult({ ...quiz, family: 'robotics' }, c)).toEqual({ ok: false, error: 'Pick one of the strands in the list' })
  })

  test('applyFix: the strand the teacher types is read the same way', () => {
    const ctx: ReadContext = { learners: [{ id: 'amina', firstName: 'Amina', lastName: null }], subject: 'Mathematics', grade: 6, year: 2026, country: 'ZA', families: maths }
    const none = { learner: null, mark: null, outOf: null, percent: null, date: null, term: null, year: null, grade: null, subject: null, title: null, kind: null, topic: null, note: null, teacher: null, attendance: null }
    const mapping: FileMapping = {
      ...none,
      learner: 'Learner', date: 'Date', title: 'Assessment', topic: 'Topic', mark: 'Mark', outOf: 'Total',
      fixed: { kind: null, outOf: null, grade: null, year: null, term: null, subject: null, teacher: null },
      topics: [],
    }
    const { rows } = readRows(parseTable('Learner,Date,Assessment,Topic,Mark,Total\nAmina,2025-02-12,Class Test 1,Triangles,16,20\n'), mapping, ctx)
    expect(rows[0]!.family).toBeNull()
    expect(applyFix(rows, { row: 2, family: 'Geometry' }, { learners: ctx.learners, families: maths, subject: 'Mathematics' })[0]!.family).toBe('shapes')
    expect(applyFix(rows, { row: 2, family: 'Geometry' }, { learners: ctx.learners, families: maths })[0]!.family).toBeNull()
  })
})

describe('the two sample files of "Add past records" map exactly as they did', () => {
  // The words the recorded model answers use for the topics of fixtures/records. Every one is a key the class offers, so it matches on the
  // exact path, which comes first: the plain-form match is never reached for these files.
  const recorded: Record<string, string> = {
    'Place value': 'whole_numbers',
    'Adding fractions': 'fractions',
    'Reading bar graphs': 'data',
    'Bar graphs quiz': 'data',
    'Tally charts test': 'data',
    'Measurement quiz': 'measurement',
    'Pictograms assignment': 'data',
    'Data project': 'data',
    'Decimals quiz': 'decimals',
    'Adding fractions test': 'fractions',
    'Place value quiz': 'whole_numbers',
  }

  test('every recorded word is an exact match with no subject, and the same strand with one', () => {
    for (const [text, word] of Object.entries(recorded)) {
      expect(pickFamily(word, maths), text).toBe(word)
      expect(pickFamily(word, maths, 'Mathematics'), text).toBe(word)
      expect(resolveFamily(text, [{ text, family: word }], maths, 'Mathematics'), text).toBe(resolveFamily(text, [{ text, family: word }], maths))
    }
  })
})
