// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from 'vitest'

// Server actions are imported below. Their auth, database and redirect parts are stubbed: a refused subject must stop before any of them is used.
const teacher = vi.hoisted(() => ({
  admin: { from: vi.fn() },
  requireTeacher: vi.fn(),
  createClassRecord: vi.fn(),
  createSchoolForTeacher: vi.fn(),
  redirect: vi.fn(),
}))
vi.mock('../lib/data/p21', () => ({ requireTeacher: teacher.requireTeacher, schoolBlurb: vi.fn() }))
vi.mock('../lib/class-writes', () => ({
  canCopyFrom: vi.fn(),
  ClassWriteError: class ClassWriteError extends Error {},
  createClassRecord: teacher.createClassRecord,
  createSchoolForTeacher: teacher.createSchoolForTeacher,
}))
vi.mock('../lib/supabase/server', () => ({ createSupabaseServer: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: teacher.redirect }))

import { createClass } from '../app/t/new/actions'
import { createSchool, saveOnboarding } from '../app/t/onboarding/actions'
import { COUNTRIES, ENABLED_SUBJECTS, GRADES, OTHER_SUBJECT, SUBJECTS, shortSubject, validateClass, validateGrade, validateSchool, validateSubject } from '../lib/subjects'

// One validator for every form and every server action that takes a grade, a subject, a class name or a school.
// For now Jemma covers Mathematics only: the lists still carry every subject, and the validators accept the enabled ones.

const MATHS_ONLY = 'Jemma covers Mathematics for now. More subjects come later.'

describe('the lists', () => {
  test('the data still knows six subjects, and Other is the name the old form used for a typed one', () => {
    expect([...SUBJECTS]).toEqual(['Mathematics', 'English', 'Natural Sciences', 'Social Sciences', 'Technology', 'Life Skills'])
    expect(OTHER_SUBJECT).toBe('Other')
  })

  test('only Mathematics is enabled, and it is one of the subjects Jemma knows', () => {
    expect([...ENABLED_SUBJECTS]).toEqual(['Mathematics'])
    for (const s of ENABLED_SUBJECTS) expect(SUBJECTS as readonly string[]).toContain(s)
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
  test('accepts Mathematics as it is', () => {
    expect(validateSubject('Mathematics')).toEqual({ ok: true, subject: 'Mathematics' })
    for (const s of ENABLED_SUBJECTS) expect(validateSubject(s)).toEqual({ ok: true, subject: s })
  })

  test('refuses every other subject Jemma knows, with one plain sentence', () => {
    for (const s of SUBJECTS.filter((x) => !(ENABLED_SUBJECTS as readonly string[]).includes(x))) {
      expect(validateSubject(s), s).toEqual({ ok: false, error: MATHS_ONLY })
    }
  })

  test('refuses Other with a typed name, whatever the name is', () => {
    for (const typed of ['Agricultural Sciences', 'Reading Club', 'Arts & Culture', 'English', 'natural sciences', 'Ab', undefined, '', 'Maths!']) {
      expect(validateSubject(OTHER_SUBJECT, typed), String(typed)).toEqual({ ok: false, error: MATHS_ONLY })
    }
  })

  test('refuses a subject nobody knows, an empty one and a wrong type', () => {
    for (const bad of ['Underwater Basket Weaving', '', ' ', 'mathematics', 'Maths', null, undefined, 7, {}]) {
      expect(validateSubject(bad, 'Art'), String(bad)).toEqual({ ok: false, error: MATHS_ONLY })
    }
  })

  test('a typed name that spells an enabled subject becomes the list spelling (switching a subject on needs only the one list)', () => {
    expect(validateSubject(OTHER_SUBJECT, ' mathematics ')).toEqual({ ok: true, subject: 'Mathematics' })
  })
})

describe('validateClass', () => {
  const good = { name: '9A Mathematics', grade: 9, subject: 'Mathematics' }

  test('a class with a name, a grade and Mathematics is fine, and the name is trimmed', () => {
    expect(validateClass({ ...good, name: '  9A Mathematics ' })).toEqual({ ok: true, value: good })
  })

  test('says what is wrong, one thing at a time, name first', () => {
    expect(validateClass({ ...good, name: '   ' })).toEqual({ ok: false, error: 'Give the class a name' })
    expect(validateClass({ ...good, name: 'x'.repeat(61) })).toEqual({ ok: false, error: 'Keep the class name under 60 letters' })
    expect(validateClass({ ...good, grade: 13 })).toEqual({ ok: false, error: 'Pick a grade from 1 to 12' })
    expect(validateClass({ ...good, subject: 'Nope' })).toEqual({ ok: false, error: MATHS_ONLY })
  })

  test('a class in another subject is refused, also as Other with a typed name', () => {
    expect(validateClass({ name: '9A Natural Sciences', grade: 9, subject: 'Natural Sciences' })).toEqual({ ok: false, error: MATHS_ONLY })
    expect(validateClass({ name: '6B English', grade: 6, subject: 'English' })).toEqual({ ok: false, error: MATHS_ONLY })
    expect(validateClass({ name: '3C Reading', grade: 3, subject: OTHER_SUBJECT, otherSubject: 'Reading Club' })).toEqual({ ok: false, error: MATHS_ONLY })
  })

  test('the grade stays free: every grade from 1 to 12 makes a Mathematics class', () => {
    for (const g of GRADES) expect(validateClass({ ...good, grade: g })).toEqual({ ok: true, value: { ...good, grade: g } })
  })
})

describe('the server actions refuse a subject that is not enabled, also when the request is hand-made', () => {
  const classInput = { name: '6C Mathematics', grade: 6, subject: 'Mathematics', code: 'ABC234', learners: [] }

  beforeEach(() => {
    vi.clearAllMocks()
    teacher.requireTeacher.mockResolvedValue({ admin: teacher.admin, userId: 'teacher-1', schoolId: 'school-1' })
    teacher.createClassRecord.mockResolvedValue({ classId: 'class-1' })
    teacher.createSchoolForTeacher.mockResolvedValue({ ok: true })
  })

  test('createClass: another subject, or Other with a typed name, makes no class', async () => {
    expect(await createClass({ ...classInput, subject: 'English' })).toEqual({ error: MATHS_ONLY })
    expect(await createClass({ ...classInput, subject: 'Natural Sciences' })).toEqual({ error: MATHS_ONLY })
    expect(await createClass({ ...classInput, subject: OTHER_SUBJECT, otherSubject: 'Reading Club' })).toEqual({ error: MATHS_ONLY })
    expect(await createClass({ ...classInput, subject: '' })).toEqual({ error: MATHS_ONLY })
    expect(teacher.createClassRecord).not.toHaveBeenCalled()
    expect(teacher.redirect).not.toHaveBeenCalled()
  })

  test('createClass: Mathematics makes the class with the subject Mathematics', async () => {
    await createClass(classInput)
    expect(teacher.createClassRecord).toHaveBeenCalledTimes(1)
    expect(teacher.createClassRecord.mock.calls[0]![1]).toMatchObject({ name: '6C Mathematics', grade: 6, subject: 'Mathematics', schoolId: 'school-1' })
    expect(teacher.redirect).toHaveBeenCalledWith('/t/new/class-1')
  })

  test('saveOnboarding: another subject is refused before the teacher is linked to the school', async () => {
    expect(await saveOnboarding('school-2', 6, 'English', '')).toEqual({ error: MATHS_ONLY })
    expect(await saveOnboarding('school-2', 6, OTHER_SUBJECT, 'Reading Club')).toEqual({ error: MATHS_ONLY })
    expect(teacher.admin.from).not.toHaveBeenCalled()
    expect(teacher.redirect).not.toHaveBeenCalled()
  })

  test('saveOnboarding: Mathematics links the school and opens the class form at the grade, with no subject in the address', async () => {
    teacher.admin.from.mockReturnValue({ update: () => ({ eq: async () => ({ error: null }) }) })
    await saveOnboarding('school-2', 6, 'Mathematics', '')
    expect(teacher.admin.from).toHaveBeenCalledWith('profiles')
    expect(teacher.redirect).toHaveBeenCalledWith('/t/new?grade=6')
  })

  test('createSchool: another subject is refused before the school is made', async () => {
    const input = { name: 'Kibera Primary', country: 'KE', region: 'Nairobi', grade: 3 }
    expect(await createSchool({ ...input, subject: 'English', other: '' })).toEqual({ error: MATHS_ONLY })
    expect(await createSchool({ ...input, subject: OTHER_SUBJECT, other: 'Reading Club' })).toEqual({ error: MATHS_ONLY })
    expect(teacher.createSchoolForTeacher).not.toHaveBeenCalled()
    expect(teacher.redirect).not.toHaveBeenCalled()
  })

  test('createSchool: Mathematics makes the school and opens the class form at the grade', async () => {
    await createSchool({ name: 'Kibera Primary', country: 'KE', region: 'Nairobi', grade: 3, subject: 'Mathematics' })
    expect(teacher.createSchoolForTeacher).toHaveBeenCalledTimes(1)
    expect(teacher.redirect).toHaveBeenCalledWith('/t/new?grade=3')
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
