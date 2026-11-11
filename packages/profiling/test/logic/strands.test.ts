import { describe, expect, test } from 'vitest'
import { DEFAULT_SUBJECT, canonicalSubject, compareSubjects, sameSubject, strandLabel, strandOrder } from '../../src/logic/strands'

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
