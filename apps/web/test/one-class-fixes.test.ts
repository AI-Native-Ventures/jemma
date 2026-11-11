// @vitest-environment node
import { describe, expect, test, vi } from 'vitest'

// The web data files used to pick "the" class of a child or of a sandbox. Each pick is now a small plain function.
// With one class every one of them gives the words it gave before. With two classes it gives the right one.

vi.mock('../lib/supabase/server', () => ({ createSupabaseServer: vi.fn() }))
vi.mock('../lib/supabase/admin', () => ({ createSupabaseAdmin: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))

import { oldestClass } from '../lib/demo'
import { marksTitle, sinceTermOf, subjectsLabel, termOfDate } from '../lib/data/p23'
import { classLabels, needClass, shortName } from '../lib/data/p21'
import { summariseClasses, testRowLines } from '../lib/data/p24'
import { helpsFamily } from '../lib/data/p25'

describe('shortName (p21)', () => {
  test('a class named the way the demo names it is shortened to its code, as before', () => {
    expect(shortName('6B Mathematics')).toBe('6B')
    expect(shortName('9A Natural Sciences')).toBe('9A')
    expect(shortName('3C')).toBe('3C')
  })

  test('"Grade 9 Natural Sciences" is "Grade 9"', () => {
    expect(shortName('Grade 9 Natural Sciences')).toBe('Grade 9')
    expect(shortName('Gr 4 Reading')).toBe('Gr 4')
  })

  test('a name with no code in front stays whole when it is short, and is cut at the first word when it is long', () => {
    expect(shortName('Maths')).toBe('Maths')
    expect(shortName('Natural Sciences')).toBe('Natural Sciences')
    expect(shortName('Reading club for the little ones')).toBe('Reading')
  })

  test('an empty name stays empty and spaces are ignored', () => {
    expect(shortName('')).toBe('')
    expect(shortName('  6B   Mathematics ')).toBe('6B')
  })
})

describe('classLabels (p21): short names that stay different', () => {
  test('one class, or classes with different codes: the short names, as before', () => {
    expect(classLabels(['6B Mathematics'])).toEqual(['6B'])
    expect(classLabels(['6B Mathematics', '6A Mathematics'])).toEqual(['6B', '6A'])
  })

  test('two classes that would both be "6B" keep their full names, and the others stay short', () => {
    expect(classLabels(['6B Mathematics', '9A Natural Sciences', '6B English'])).toEqual(['6B Mathematics', '9A', '6B English'])
  })
})

describe('needClass (p21): which class a Needs you item counts for', () => {
  const order = ['c1', 'c2', 'c3']

  test('a learner in one class: that class, as before', () => {
    expect(needClass(order, { childClasses: ['c1'], itemClass: null })).toBe('c1')
    expect(needClass(order, { childClasses: ['c1'], itemClass: 'c1' })).toBe('c1')
  })

  test('a learner in two classes: the class the item is about, when it is known', () => {
    expect(needClass(order, { childClasses: ['c1', 'c2'], itemClass: 'c2' })).toBe('c2')
  })

  test('a learner in two classes and no class on the item: the teacher\'s oldest of the two', () => {
    expect(needClass(order, { childClasses: ['c3', 'c2'], itemClass: null })).toBe('c2')
    expect(needClass(order, { childClasses: ['c2', 'c1'], itemClass: null })).toBe('c1')
  })

  test('an item with no learner uses the class it is about, and a class that is not the teacher\'s is not used', () => {
    expect(needClass(order, { childClasses: [], itemClass: 'c2' })).toBe('c2')
    expect(needClass(order, { childClasses: [], itemClass: 'elsewhere' })).toBeUndefined()
    expect(needClass(order, { childClasses: ['c1'], itemClass: 'elsewhere' })).toBe('c1')
    expect(needClass(order, { childClasses: [], itemClass: null })).toBeUndefined()
  })
})

describe('summariseClasses (p24): a child in one class or in several', () => {
  const maths = { classId: 'a', createdAt: '2026-01-10T08:00:00Z', subject: 'Mathematics', teacherId: 't1' }
  const english = { classId: 'b', createdAt: '2026-03-02T08:00:00Z', subject: 'English', teacherId: 't2' }
  const mathsToo = { classId: 'c', createdAt: '2026-05-02T08:00:00Z', subject: 'Mathematics', teacherId: 't3' }

  test('one class: its subject and its teacher, the same words as before', () => {
    expect(summariseClasses([maths])).toEqual({ subjects: ['Mathematics'], subject: 'Mathematics', teacherId: 't1', oldestClassId: 'a' })
  })

  test('two classes: both subjects, oldest class first, and the oldest class\'s teacher whatever order the rows come in', () => {
    const answer = { subjects: ['Mathematics', 'English'], subject: 'Mathematics and English', teacherId: 't1', oldestClassId: 'a' }
    expect(summariseClasses([english, maths])).toEqual(answer)
    expect(summariseClasses([maths, english])).toEqual(answer)
  })

  test('the same subject twice is named once', () => {
    expect(summariseClasses([maths, mathsToo]).subject).toBe('Mathematics')
    expect(summariseClasses([maths, english, mathsToo]).subjects).toEqual(['Mathematics', 'English'])
  })

  test('no class at all', () => {
    expect(summariseClasses([])).toEqual({ subjects: [], subject: '', teacherId: null, oldestClassId: null })
  })
})

describe('testRowLines (p24): each test row shows the subject of its own class', () => {
  const lines = ['Mon 26 Oct · marked by Jemma', 'Missed questions 1, 2 and 4']

  test('a child with one subject sees the lines as before', () => {
    expect(testRowLines(lines, 'Mathematics', 1)).toEqual(lines)
  })

  test('a child with two subjects sees the subject of the row\'s class in front of the first line', () => {
    expect(testRowLines(lines, 'English', 2)).toEqual(['English · Mon 26 Oct · marked by Jemma', 'Missed questions 1, 2 and 4'])
  })

  test('a row with no class (a report card) is left as it is', () => {
    expect(testRowLines(lines, null, 2)).toEqual(lines)
  })
})

describe('oldestClass (demo): the sandbox\'s home class', () => {
  test('one class: that class', () => {
    expect(oldestClass([{ id: 'a', created_at: '2026-01-10T08:00:00Z' }])?.id).toBe('a')
  })

  test('three classes in any order: the oldest', () => {
    const rows = [
      { id: 'late', created_at: '2026-11-11T10:00:00Z' },
      { id: 'home', created_at: '2026-11-11T08:00:00Z' },
      { id: 'mid', created_at: '2026-11-11T09:00:00Z' },
    ]
    expect(oldestClass(rows)?.id).toBe('home')
    expect(oldestClass([...rows].reverse())?.id).toBe('home')
  })

  test('none: null', () => {
    expect(oldestClass([])).toBeNull()
  })
})

describe('helpsFamily (p25)', () => {
  test('tonight\'s topic decides, then the child\'s latest trial, and with neither it says "these"', () => {
    expect(helpsFamily({ topicFamily: 'fractions', latestTrialFamily: 'decimals' })).toBe('fractions')
    expect(helpsFamily({ topicFamily: null, latestTrialFamily: 'decimals' })).toBe('decimals')
    expect(helpsFamily({ topicFamily: null, latestTrialFamily: null })).toBe('these')
    expect(helpsFamily({})).toBe('these')
  })
})

describe('the marks heading (p23)', () => {
  test('one subject: "Maths · change since Term 3", the words the demo showed', () => {
    expect(subjectsLabel(['Mathematics'])).toBe('Maths')
    expect(marksTitle(['Mathematics'], 3)).toBe('Maths · change since Term 3')
  })

  test('another subject is named, and two are joined', () => {
    expect(marksTitle(['English'], 2)).toBe('English · change since Term 2')
    expect(marksTitle(['Mathematics', 'English'], 3)).toBe('Maths and English · change since Term 3')
  })

  test('with nothing to compare with, only the subject is named', () => {
    expect(marksTitle(['English'], null)).toBe('English')
    expect(marksTitle([], 3)).toBe('Change since Term 3')
    expect(marksTitle([], null)).toBe('')
  })

  test('South African school terms by month', () => {
    expect(termOfDate('2026-02-10T10:00:00Z')).toBe(1)
    expect(termOfDate('2026-05-10T10:00:00Z')).toBe(2)
    expect(termOfDate('2026-09-25T10:00:00Z')).toBe(3)
    expect(termOfDate('2026-11-11T10:00:00Z')).toBe(4)
  })

  test('the term the change is measured from is the term of the newest earlier result', () => {
    expect(sinceTermOf(['2026-09-25T10:00:00Z', '2026-04-02T10:00:00Z'])).toBe(3)
    expect(sinceTermOf([])).toBeNull()
  })
})
