import { describe, expect, it } from 'vitest'
import { ADD_A_GRADE, GRADES_TO_PICK, higherGradeLine, noTopicsLine, OWN_NOTE, pickGrade, sheetMarks, shortDay } from '../lib/own-grades'

// The pure pieces of the learner's "My own" screens (P95): which grade My maths shows, the words, and what the grade sheet marks.
// No database, no clock, no browser.

const chips = [
  { classId: 'c6', grade: 6 },
  { classId: 'c7', grade: 7 },
  { classId: 'c9', grade: 9 },
]

describe('pickGrade (the grade My maths shows in My own)', () => {
  it('the grade in the address, when the learner has added it', () => {
    expect(pickGrade(chips, '7', 6)).toEqual({ classId: 'c7', grade: 7 })
    expect(pickGrade(chips, '9', 6)).toEqual({ classId: 'c9', grade: 9 })
  })

  it('no grade in the address: the learner\'s own grade', () => {
    expect(pickGrade(chips, undefined, 7)).toEqual({ classId: 'c7', grade: 7 })
  })

  it('a grade the learner has not added, or words that are not a grade, fall back to the default', () => {
    expect(pickGrade(chips, '11', 6)).toEqual({ classId: 'c6', grade: 6 })
    expect(pickGrade(chips, 'seven', 6)).toEqual({ classId: 'c6', grade: 6 })
    expect(pickGrade(chips, '7.5', 6)).toEqual({ classId: 'c6', grade: 6 })
    expect(pickGrade(chips, '', 6)).toEqual({ classId: 'c6', grade: 6 })
  })

  it('the first of two grades in the address counts (a repeated parameter)', () => {
    expect(pickGrade(chips, ['9', '7'], 6)).toEqual({ classId: 'c9', grade: 9 })
  })

  it('the learner\'s own grade is not among the added ones: the lowest grade', () => {
    expect(pickGrade(chips.slice(1), undefined, 4)).toEqual({ classId: 'c7', grade: 7 })
  })

  it('no grade added yet: nothing is picked', () => {
    expect(pickGrade([], undefined, 6)).toBeNull()
    expect(pickGrade([], '7', 6)).toBeNull()
  })
})

describe('the words', () => {
  it('the line under the switch in My own says nothing goes to the school', () => {
    expect(OWN_NOTE).toBe('Your own practice. Nothing here goes to your school.')
  })

  it('a grade above the learner\'s own is said in plain words, with no warning', () => {
    expect(higherGradeLine(9, 6)).toBe('This is Grade 9 work. Take your time.')
    expect(higherGradeLine(7, 6)).toBe('This is Grade 7 work. Take your time.')
  })

  it('the learner\'s own grade, and the ones below it, have no such line', () => {
    expect(higherGradeLine(6, 6)).toBeNull()
    expect(higherGradeLine(5, 6)).toBeNull()
  })

  it('a grade with no topics says so', () => {
    expect(noTopicsLine(9)).toBe('No topics yet for Grade 9.')
  })

  it('a learner with no grade yet is told to add one', () => {
    expect(ADD_A_GRADE).toBe('Add a grade to start.')
  })

  it('no sentence has an em dash', () => {
    for (const s of [OWN_NOTE, higherGradeLine(9, 6)!, noTopicsLine(9), ADD_A_GRADE]) expect(s).not.toContain('—')
  })
})

describe('sheetMarks (the 12 grades of the grade sheet)', () => {
  it('lists Grades 1 to 12, in order', () => {
    expect(GRADES_TO_PICK).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(sheetMarks([], 6).map((g) => g.grade)).toEqual(GRADES_TO_PICK)
  })

  it('marks the learner\'s grade "your grade" and the grades already added "added"', () => {
    const marks = sheetMarks([6, 7], 6)
    expect(marks.find((g) => g.grade === 6)!.marks).toEqual(['your grade', 'added'])
    expect(marks.find((g) => g.grade === 7)!.marks).toEqual(['added'])
    expect(marks.find((g) => g.grade === 9)!.marks).toEqual([])
  })

  it('the learner\'s grade is "your grade" even when it is not added yet', () => {
    expect(sheetMarks([], 6).find((g) => g.grade === 6)!.marks).toEqual(['your grade'])
  })
})

describe('shortDay', () => {
  it('writes a timestamp or a date as the weekday, the day and the month', () => {
    expect(shortDay('2026-11-13T17:30:00.000Z')).toBe('Fri 13 Nov')
    expect(shortDay('2026-11-11')).toBe('Wed 11 Nov')
    expect(shortDay('2026-01-01T00:00:00Z')).toBe('Thu 1 Jan')
  })

  it('uses the UTC day, so a late evening does not move to the next day', () => {
    expect(shortDay('2026-11-13T23:59:00Z')).toBe('Fri 13 Nov')
  })

  it('gives no text for an empty or unreadable value', () => {
    expect(shortDay('')).toBe('')
    expect(shortDay('not a date')).toBe('')
  })
})
