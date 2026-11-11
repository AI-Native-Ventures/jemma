// @vitest-environment node
import { describe, expect, test } from 'vitest'
import { COUNTRIES, GRADES, OTHER_SUBJECT, SUBJECTS, shortSubject, validateClass, validateGrade, validateSchool, validateSubject } from '../lib/subjects'

// One validator for every form and every server action that takes a grade, a subject, a class name or a school.

describe('the lists', () => {
  test('the subjects are the six the teacher picks from, and Other is added by the form', () => {
    expect([...SUBJECTS]).toEqual(['Mathematics', 'English', 'Natural Sciences', 'Social Sciences', 'Technology', 'Life Skills'])
    expect(OTHER_SUBJECT).toBe('Other')
  })

  test('the grades are 1 to 12', () => {
    expect([...GRADES]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  })

  test('the countries have an ISO code each, South Africa first and Other last', () => {
    expect(COUNTRIES.map((c) => c.name)).toEqual([
      'South Africa', 'Kenya', 'Nigeria', 'Ghana', 'Uganda', 'Tanzania', 'Rwanda', 'Zambia', 'Zimbabwe', 'Botswana', 'Namibia', 'Ethiopia', 'Other',
    ])
    expect(COUNTRIES[0]).toEqual({ code: 'ZA', name: 'South Africa' })
    for (const c of COUNTRIES) expect(c.code).toMatch(/^[A-Z]{2}$/)
    expect(new Set(COUNTRIES.map((c) => c.code)).size).toBe(COUNTRIES.length)
  })
})

describe('validateGrade', () => {
  test('accepts every whole grade from 1 to 12', () => {
    for (const g of GRADES) expect(validateGrade(g)).toEqual({ ok: true, grade: g })
  })

  test('refuses 0, 13, a fraction, NaN, a string and nothing', () => {
    for (const bad of [0, 13, -1, 6.5, Number.NaN, '6', null, undefined]) {
      expect(validateGrade(bad as never), String(bad)).toEqual({ ok: false, error: 'Pick a grade from 1 to 12' })
    }
  })
})

describe('validateSubject', () => {
  test('accepts a subject from the list as it is', () => {
    for (const s of SUBJECTS) expect(validateSubject(s)).toEqual({ ok: true, subject: s })
  })

  test('Other needs a name of 2 to 40 characters: letters, digits, spaces, & and -', () => {
    expect(validateSubject(OTHER_SUBJECT, 'Agricultural Sciences')).toEqual({ ok: true, subject: 'Agricultural Sciences' })
    expect(validateSubject(OTHER_SUBJECT, 'Arts & Culture')).toEqual({ ok: true, subject: 'Arts & Culture' })
    expect(validateSubject(OTHER_SUBJECT, 'isiZulu Home-Language 2')).toEqual({ ok: true, subject: 'isiZulu Home-Language 2' })
    expect(validateSubject(OTHER_SUBJECT, 'Français')).toEqual({ ok: true, subject: 'Français' })
    expect(validateSubject(OTHER_SUBJECT, 'Ab')).toEqual({ ok: true, subject: 'Ab' })
    expect(validateSubject(OTHER_SUBJECT, 'x'.repeat(40))).toEqual({ ok: true, subject: 'x'.repeat(40) })
  })

  test('trims the name and joins runs of spaces', () => {
    expect(validateSubject(OTHER_SUBJECT, '  Music   and   Drama ')).toEqual({ ok: true, subject: 'Music and Drama' })
  })

  test('refuses a missing, one letter, long or odd name', () => {
    const say = 'Name the subject in 2 to 40 letters, numbers, spaces, & or -'
    for (const bad of [undefined, '', ' ', 'A', 'x'.repeat(41), 'Maths!', 'Art <b>', 'Art/Craft', 'a_b', 'a.b', 'Art, Craft', '12345'.repeat(9)]) {
      expect(validateSubject(OTHER_SUBJECT, bad), String(bad)).toEqual({ ok: false, error: say })
    }
  })

  test('a typed name that is on the list becomes the list name, whatever its case', () => {
    expect(validateSubject(OTHER_SUBJECT, 'english')).toEqual({ ok: true, subject: 'English' })
    expect(validateSubject(OTHER_SUBJECT, 'NATURAL  sciences')).toEqual({ ok: true, subject: 'Natural Sciences' })
  })

  test('refuses a subject that is neither on the list nor Other, and ignores a typed name when one from the list is chosen', () => {
    expect(validateSubject('Underwater Basket Weaving')).toEqual({ ok: false, error: 'Pick a subject' })
    expect(validateSubject('', 'Art')).toEqual({ ok: false, error: 'Pick a subject' })
    expect(validateSubject('English', 'Art')).toEqual({ ok: true, subject: 'English' })
  })
})

describe('validateClass', () => {
  const good = { name: '9A Natural Sciences', grade: 9, subject: 'Natural Sciences' }

  test('a class with a name, a grade and a subject is fine, and the name is trimmed', () => {
    expect(validateClass({ ...good, name: '  9A Natural Sciences ' })).toEqual({ ok: true, value: good })
    expect(validateClass({ name: '3C Reading', grade: 3, subject: OTHER_SUBJECT, otherSubject: 'Reading Club' })).toEqual({
      ok: true,
      value: { name: '3C Reading', grade: 3, subject: 'Reading Club' },
    })
  })

  test('says what is wrong, one thing at a time, name first', () => {
    expect(validateClass({ ...good, name: '   ' })).toEqual({ ok: false, error: 'Give the class a name' })
    expect(validateClass({ ...good, name: 'x'.repeat(61) })).toEqual({ ok: false, error: 'Keep the class name under 60 letters' })
    expect(validateClass({ ...good, grade: 13 })).toEqual({ ok: false, error: 'Pick a grade from 1 to 12' })
    expect(validateClass({ ...good, subject: 'Nope' })).toEqual({ ok: false, error: 'Pick a subject' })
  })
})

describe('validateSchool', () => {
  const good = { name: 'Kibera Primary', country: 'KE', region: 'Nairobi' }

  test('a name, a country code from the list and an optional region', () => {
    expect(validateSchool(good)).toEqual({ ok: true, value: good })
    expect(validateSchool({ name: ' Kibera  Primary ', country: 'KE' })).toEqual({ ok: true, value: { name: 'Kibera Primary', country: 'KE', region: null } })
    expect(validateSchool({ ...good, region: '   ' })).toEqual({ ok: true, value: { ...good, region: null } })
  })

  test('the name is 2 to 80 characters', () => {
    expect(validateSchool({ ...good, name: 'A' })).toEqual({ ok: false, error: 'Type the name of the school (2 to 80 letters)' })
    expect(validateSchool({ ...good, name: '' })).toEqual({ ok: false, error: 'Type the name of the school (2 to 80 letters)' })
    expect(validateSchool({ ...good, name: 'x'.repeat(81) })).toEqual({ ok: false, error: 'Type the name of the school (2 to 80 letters)' })
    expect(validateSchool({ ...good, name: 'x'.repeat(80) }).ok).toBe(true)
  })

  test('the country must be one of the codes in the list', () => {
    expect(validateSchool({ ...good, country: 'FR' })).toEqual({ ok: false, error: 'Pick the country' })
    expect(validateSchool({ ...good, country: '' })).toEqual({ ok: false, error: 'Pick the country' })
    expect(validateSchool({ ...good, country: 'ke' })).toEqual({ ok: false, error: 'Pick the country' })
  })

  test('the region is at most 60 characters', () => {
    expect(validateSchool({ ...good, region: 'x'.repeat(61) })).toEqual({ ok: false, error: 'Keep the region under 60 letters' })
  })
})

describe('shortSubject', () => {
  test('Mathematics is Maths, everything else is as it is', () => {
    expect(shortSubject('Mathematics')).toBe('Maths')
    expect(shortSubject('English')).toBe('English')
    expect(shortSubject('Natural Sciences')).toBe('Natural Sciences')
  })
})
