import { describe, expect, test } from 'vitest'
import { countryName, isBaselineClass, makeClassContext, normalizeCountry, subjectProfile } from '../../src/ai/subject-profile'

// The pure parts of the class context: no database, no network, no model.

describe('subjectProfile: the strand family keys to suggest', () => {
  test.each([
    ['English', ['reading', 'writing', 'language', 'speaking_listening']],
    ['Natural Sciences', ['life_living', 'matter_materials', 'energy_change', 'earth_beyond']],
    ['Social Sciences', ['history', 'geography']],
    ['Technology', ['structures', 'processing', 'mechanical_systems', 'electrical_systems']],
    ['Life Skills', ['personal_wellbeing', 'physical_education', 'creative_arts']],
  ])('%s', (subject, families) => {
    expect(subjectProfile(subject).families).toEqual(families)
  })

  test('Mathematics keeps the families its prompts name today', () => {
    expect(subjectProfile('Mathematics').families).toEqual(['fractions', 'decimals', 'shape', 'measurement', 'data'])
  })

  test('any other subject has no list: the model picks short lowercase words of its own', () => {
    expect(subjectProfile('Afrikaans').families).toBeNull()
    expect(subjectProfile('Art').families).toBeNull()
    expect(subjectProfile('').families).toBeNull()
  })

  test('spelling and case do not matter, and the usual short names work', () => {
    expect(subjectProfile('  maths ').key).toBe('mathematics')
    expect(subjectProfile('Math').key).toBe('mathematics')
    expect(subjectProfile('MATHEMATICS').key).toBe('mathematics')
    expect(subjectProfile('English Home Language').key).toBe('english')
    expect(subjectProfile('english first additional language').key).toBe('english')
    expect(subjectProfile('Science').key).toBe('natural_sciences')
    expect(subjectProfile('natural science').key).toBe('natural_sciences')
    expect(subjectProfile('Social Science').key).toBe('social_sciences')
    expect(subjectProfile('Life Orientation').key).toBe('life_skills')
  })

  test('every subject says how its answers look, in words a prompt can use', () => {
    for (const s of ['Mathematics', 'English', 'Natural Sciences', 'Social Sciences', 'Technology', 'Life Skills', 'Art']) {
      expect(subjectProfile(s).answers.length).toBeGreaterThan(10)
      expect(subjectProfile(s).answers).not.toMatch(/undefined/)
    }
    expect(subjectProfile('Natural Sciences').answers).not.toMatch(/fraction|rand|comma/i)
  })
})

describe('the country', () => {
  test('a code gives its name; a name gives its code', () => {
    expect(normalizeCountry('za')).toBe('ZA')
    expect(normalizeCountry(' KE ')).toBe('KE')
    expect(normalizeCountry('South Africa')).toBe('ZA')
    expect(normalizeCountry('kenya')).toBe('KE')
    expect(countryName('ZA')).toBe('South Africa')
    expect(countryName('KE')).toBe('Kenya')
    expect(countryName('NG')).toBe('Nigeria')
  })

  test('a country that is not known keeps what was written, and never says undefined', () => {
    expect(normalizeCountry('Atlantis')).toBe('Atlantis')
    expect(countryName('Atlantis')).toBe('Atlantis')
    expect(normalizeCountry('')).toBe('')
    expect(countryName('')).not.toMatch(/undefined/)
  })
})

describe('the baseline class: Mathematics, Grade 6, South Africa', () => {
  const ctx = (subject: string, grade: number, country: string) => makeClassContext({ classId: 'c1', subject, grade, country })

  test('it is the baseline, whichever way the subject and the country are written', () => {
    expect(isBaselineClass(ctx('Mathematics', 6, 'ZA'))).toBe(true)
    expect(isBaselineClass(ctx('Maths', 6, 'ZA'))).toBe(true)
    expect(isBaselineClass(ctx('mathematics', 6, 'South Africa'))).toBe(true)
  })

  test('a class that cannot be told is treated as the baseline: its prompts stay as they are', () => {
    expect(isBaselineClass(null)).toBe(true)
  })

  test('one different thing makes it a different class', () => {
    expect(isBaselineClass(ctx('Mathematics', 5, 'ZA'))).toBe(false)
    expect(isBaselineClass(ctx('Mathematics', 6, 'KE'))).toBe(false)
    expect(isBaselineClass(ctx('English', 6, 'ZA'))).toBe(false)
  })

  test('the context keeps the subject as written, for the line the prompt shows', () => {
    const c = ctx('Natural Sciences', 9, 'KE')
    expect(c).toMatchObject({ classId: 'c1', subject: 'Natural Sciences', subjectKey: 'natural_sciences', grade: 9, country: 'KE', countryName: 'Kenya' })
  })
})
