import { describe, expect, test } from 'vitest'
import { DEFAULT_SUBJECT, canonicalFamily, canonicalSubject, compareSubjects, sameSubject, strandLabel, strandOrder } from '../../src/logic/strands'

describe('strand labels', () => {
  test('Mathematics keeps exactly the six labels and the order the Long view had before subjects', () => {
    // The table the Long view screen used before: p52.ts STRANDS.
    const before: Record<string, string> = {
      whole_numbers: 'Whole numbers',
      fractions: 'Fractions',
      decimals: 'Decimals',
      shapes: 'Shapes and space',
      measurement: 'Measurement',
      data: 'Data handling',
    }
    expect(strandOrder('Mathematics')).toEqual(Object.keys(before))
    for (const [family, label] of Object.entries(before)) expect(strandLabel('Mathematics', family)).toBe(label)
  })

  test('English, Natural Sciences and Social Sciences have their own strands', () => {
    expect(strandOrder('English')).toEqual(['reading', 'writing', 'language', 'speaking_listening'])
    expect(strandLabel('English', 'reading')).toBe('Reading')
    expect(strandLabel('English', 'writing')).toBe('Writing')
    expect(strandLabel('English', 'language')).toBe('Language')
    expect(strandLabel('English', 'speaking_listening')).toBe('Speaking and listening')

    expect(strandOrder('Natural Sciences')).toEqual(['life_living', 'matter_materials', 'energy_change', 'earth_beyond'])
    expect(strandLabel('Natural Sciences', 'life_living')).toBe('Life and living')
    expect(strandLabel('Natural Sciences', 'matter_materials')).toBe('Matter and materials')
    expect(strandLabel('Natural Sciences', 'energy_change')).toBe('Energy and change')
    expect(strandLabel('Natural Sciences', 'earth_beyond')).toBe('Planet Earth and beyond')

    expect(strandOrder('Social Sciences')).toEqual(['history', 'geography'])
    expect(strandLabel('Social Sciences', 'history')).toBe('History')
    expect(strandLabel('Social Sciences', 'geography')).toBe('Geography')
  })

  test('the same family name can mean different strands in different subjects', () => {
    expect(strandLabel('Mathematics', 'data')).toBe('Data handling')
    expect(strandLabel('English', 'data')).toBe('Data')
    expect(strandLabel('Natural Sciences', 'reading')).toBe('Reading')
  })

  test('any other subject or family is tidied into plain words', () => {
    expect(strandLabel('Mathematics', 'patterns_and_algebra')).toBe('Patterns and algebra')
    expect(strandLabel('Technology', 'structures')).toBe('Structures')
    expect(strandLabel('Technology', 'electrical-systems')).toBe('Electrical systems')
    expect(strandLabel('Technology', '')).toBe('Other')
    expect(strandOrder('Technology')).toEqual([])
  })

  test('a subject is found whatever its capitals or spaces, and "Maths" is Mathematics', () => {
    expect(strandLabel(' mathematics ', 'fractions')).toBe('Fractions')
    expect(strandLabel('Maths', 'fractions')).toBe('Fractions')
    expect(strandLabel('natural sciences', 'life_living')).toBe('Life and living')
    expect(strandOrder('ENGLISH')).toEqual(['reading', 'writing', 'language', 'speaking_listening'])
  })

  test('two names are the same subject when they differ only by capitals, spaces or Maths', () => {
    expect(sameSubject('Maths', ' mathematics')).toBe(true)
    expect(sameSubject('English', 'english ')).toBe(true)
    expect(sameSubject('English', 'Natural Sciences')).toBe(false)
  })

  test('a subject has one written name: Maths is Mathematics, and any other name keeps its words', () => {
    expect(canonicalSubject('Maths')).toBe('Mathematics')
    expect(canonicalSubject(' mathematics ')).toBe('Mathematics')
    expect(canonicalSubject('english')).toBe('English')
    expect(canonicalSubject('NATURAL SCIENCES')).toBe('Natural Sciences')
    expect(canonicalSubject('  Technology ')).toBe('Technology')
  })

  test('the default subject is Mathematics, and subjects sort the way a teacher expects', () => {
    expect(DEFAULT_SUBJECT).toBe('Mathematics')
    expect(['Technology', 'Natural Sciences', 'English', 'Mathematics', 'Social Sciences'].sort(compareSubjects)).toEqual([
      'Mathematics',
      'English',
      'Natural Sciences',
      'Social Sciences',
      'Technology',
    ])
  })
})

describe('canonicalFamily: one strand, one name, however a map or a file spells it', () => {
  // Every plain word of the table in the packet, and the family it gives for Mathematics.
  const table: Record<string, string[]> = {
    whole_numbers: [
      'whole numbers',
      'whole number',
      'numbers',
      'number',
      'number operations',
      'numbers and operations',
      'numbers operations and relationships',
      'operations',
      'number sense',
      'place value',
      'counting',
    ],
    fractions: ['fractions', 'fraction', 'common fractions'],
    decimals: ['decimals', 'decimal', 'decimal fractions'],
    shapes: ['shapes', 'shape', 'shapes and space', 'shape and space', 'space and shape', 'geometry', 'space'],
    measurement: ['measurement', 'measurements', 'measuring', 'measure'],
    data: ['data', 'data handling', 'statistics', 'graphs'],
  }

  test('every word of the table gives its family for Mathematics', () => {
    for (const [family, words] of Object.entries(table)) for (const word of words) expect(canonicalFamily('Mathematics', word), word).toBe(family)
  })

  test('capitals, spaces, underscores and hyphens do not matter', () => {
    expect(canonicalFamily('Mathematics', 'Numbers')).toBe('whole_numbers')
    expect(canonicalFamily('Mathematics', '  Shape  ')).toBe('shapes')
    expect(canonicalFamily('Mathematics', 'Shapes_and_space')).toBe('shapes')
    expect(canonicalFamily('Mathematics', 'shape-and-space')).toBe('shapes')
    expect(canonicalFamily('Mathematics', 'Numbers  Operations and Relationships')).toBe('whole_numbers')
    expect(canonicalFamily('Mathematics', 'DATA   HANDLING')).toBe('data')
    expect(canonicalFamily('Mathematics', 'whole_numbers')).toBe('whole_numbers')
  })

  test('the subject is found the way every other function finds it: Maths is Mathematics', () => {
    expect(canonicalFamily('Maths', 'shape')).toBe('shapes')
    expect(canonicalFamily(' mathematics ', 'number')).toBe('whole_numbers')
  })

  test('another subject: a label or a key of that subject gives its key', () => {
    expect(canonicalFamily('English', 'Speaking and listening')).toBe('speaking_listening')
    expect(canonicalFamily('English', 'speaking-listening')).toBe('speaking_listening')
    expect(canonicalFamily('English', 'Reading')).toBe('reading')
    expect(canonicalFamily('Natural Sciences', 'Planet Earth and beyond')).toBe('earth_beyond')
    expect(canonicalFamily('Natural Sciences', 'life living')).toBe('life_living')
    expect(canonicalFamily('Social Sciences', 'History')).toBe('history')
  })

  test('the Mathematics table belongs to Mathematics only', () => {
    // English has no "numbers" strand: the word stays what it is, in plain form.
    expect(canonicalFamily('English', 'Numbers')).toBe('numbers')
    expect(canonicalFamily('English', 'Data')).toBe('data')
    expect(canonicalFamily('Technology', 'Shapes and space')).toBe('shapes_and_space')
    // A Mathematics label is not an English strand.
    expect(canonicalFamily('English', 'Fractions')).toBe('fractions')
  })

  test('a word nobody knows keeps its plain form with underscores', () => {
    expect(canonicalFamily('Mathematics', 'algebra')).toBe('algebra')
    expect(canonicalFamily('Mathematics', 'Patterns and Algebra')).toBe('patterns_and_algebra')
    expect(canonicalFamily('Mathematics', ' Patterns-and_Algebra ')).toBe('patterns_and_algebra')
    expect(canonicalFamily('Technology', 'Electrical systems')).toBe('electrical_systems')
  })

  test('an empty word stays empty', () => {
    expect(canonicalFamily('Mathematics', '')).toBe('')
    expect(canonicalFamily('Mathematics', '   ')).toBe('')
    expect(canonicalFamily('English', '')).toBe('')
  })

  test('a family already in its plain form does not change, so reading twice is the same as reading once', () => {
    for (const subject of ['Mathematics', 'English', 'Natural Sciences', 'Social Sciences', 'Technology'])
      for (const family of [...strandOrder(subject), 'algebra', 'patterns_and_algebra']) expect(canonicalFamily(subject, canonicalFamily(subject, family))).toBe(canonicalFamily(subject, family))
    for (const family of strandOrder('Mathematics')) expect(canonicalFamily('Mathematics', family)).toBe(family)
  })
})
