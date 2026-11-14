import { describe, expect, it } from 'vitest'
import { ADD_A_GRADE, CHIP_NAME_MAX, chipAria, chipLabel, GRADES_TO_PICK, higherGradeLine, noTopicsLine, OWN_NOTE, pickClass, sheetMarks, shortDay } from '../lib/own-grades'

// The pure pieces of the learner's "My own" screens (P95, P95c): which class My maths shows, the chip of a class, the words, and what the grade
// sheet marks.
// No database, no clock, no browser.

const caps = (grade: number, classId = `c${grade}`) => ({ classId, grade, caps: true, name: `Grade ${grade} (my own)` })
const own = (grade: number, name: string, classId = `own${grade}`) => ({ classId, grade, caps: false, name })

const chips = [caps(6), caps(7), caps(9)]
// The learner has also given a curriculum of their own for Grade 6 (P97): a second class of the grade, listed after the CAPS class of it.
const withOwn = [caps(6), own(6, "My school's Term 1 plan"), caps(7), own(7, 'Term 2')]

describe('pickClass (the class My maths shows in My own, P95c)', () => {
  it('the class in the address, when it is one of the learner\'s', () => {
    expect(pickClass(chips, { class: 'c7' }, 6)).toEqual(caps(7))
    expect(pickClass(withOwn, { class: 'own6' }, 6)).toEqual(own(6, "My school's Term 1 plan"))
    expect(pickClass(withOwn, { class: 'own7' }, 6)).toEqual(own(7, 'Term 2'))
  })

  it('a class that is not the learner\'s (another learner\'s, a made-up id, nothing) falls back to the default', () => {
    expect(pickClass(chips, { class: 'someone-elses' }, 6)).toEqual(caps(6))
    expect(pickClass(chips, { class: '' }, 6)).toEqual(caps(6))
    expect(pickClass(chips, {}, 6)).toEqual(caps(6))
  })

  it('an old link ?grade=N means the CAPS class of that grade, never an own curriculum of it', () => {
    expect(pickClass(withOwn, { grade: '6' }, 9)).toEqual(caps(6))
    expect(pickClass(withOwn, { grade: '7' }, 6)).toEqual(caps(7))
    expect(pickClass(chips, { grade: '9' }, 6)).toEqual(caps(9))
  })

  it('words that are not a grade, a grade with no CAPS class and a repeated parameter are handled', () => {
    expect(pickClass(chips, { grade: '11' }, 6)).toEqual(caps(6))
    expect(pickClass(chips, { grade: 'seven' }, 6)).toEqual(caps(6))
    expect(pickClass(chips, { grade: '7.5' }, 6)).toEqual(caps(6))
    expect(pickClass([own(9, 'Plan'), caps(6)], { grade: '9' }, 6)).toEqual(caps(6))
    expect(pickClass(chips, { grade: ['9', '7'] }, 6)).toEqual(caps(9))
    expect(pickClass(withOwn, { class: ['own6', 'c7'] }, 6)).toEqual(own(6, "My school's Term 1 plan"))
  })

  it('the class in the address wins over the grade in it', () => {
    expect(pickClass(withOwn, { class: 'own6', grade: '7' }, 6)).toEqual(own(6, "My school's Term 1 plan"))
  })

  it('no address: the CAPS class of the learner\'s own grade, though an own curriculum of that grade is listed too', () => {
    expect(pickClass(withOwn, {}, 6)).toEqual(caps(6))
    expect(pickClass(withOwn, {}, 7)).toEqual(caps(7))
  })

  it('the learner\'s own grade has only an own curriculum: that one; with no class of it: the first class', () => {
    expect(pickClass([caps(7), own(9, 'Plan')], {}, 9)).toEqual(own(9, 'Plan'))
    expect(pickClass(chips.slice(1), {}, 4)).toEqual(caps(7))
  })

  it('no class yet: nothing is picked', () => {
    expect(pickClass([], {}, 6)).toBeNull()
    expect(pickClass([], { grade: '7', class: 'c7' }, 6)).toBeNull()
  })
})

describe('the chip of a class', () => {
  it('a CAPS class reads "Grade 6", with no name', () => {
    expect(chipLabel(caps(6))).toBe('Grade 6')
    expect(chipAria(caps(6))).toBe('Grade 6')
  })

  it('an own curriculum reads "Grade 6 \u00b7 {its name}", and the full name is in the aria-label', () => {
    const c = own(6, "My school's Term 1 plan")
    expect(chipLabel(c)).toBe("Grade 6 \u00b7 My school's Term 1 plan")
    expect(chipAria(c)).toBe("Grade 6 \u00b7 My school's Term 1 plan")
  })

  it('a long name is cut with an ellipsis, the label stays short, and the aria-label keeps the whole name', () => {
    const name = 'My school curriculum for the whole of the year, all four terms'
    const c = own(7, name)
    const label = chipLabel(c)
    expect(label.startsWith('Grade 7 \u00b7 My school curriculum')).toBe(true)
    expect(label.endsWith('\u2026')).toBe(true)
    expect(label.length).toBeLessThanOrEqual('Grade 7 \u00b7 '.length + CHIP_NAME_MAX)
    expect(label).not.toContain('all four terms')
    expect(chipAria(c)).toBe(`Grade 7 \u00b7 ${name}`)
  })

  it('a name of exactly the longest length is not cut, and the cut never leaves a space before the ellipsis', () => {
    const exact = own(6, 'x'.repeat(CHIP_NAME_MAX))
    expect(chipLabel(exact)).toBe(`Grade 6 \u00b7 ${'x'.repeat(CHIP_NAME_MAX)}`)
    const spaced = own(6, `${'a'.repeat(CHIP_NAME_MAX - 1)} bbbbbb`)
    expect(chipLabel(spaced)).toBe(`Grade 6 \u00b7 ${'a'.repeat(CHIP_NAME_MAX - 1)}\u2026`)
  })

  it('has no em dash', () => {
    for (const c of [caps(6), own(6, 'Plan'), own(6, 'x'.repeat(80))]) {
      expect(chipLabel(c)).not.toContain(String.fromCharCode(0x2014))
      expect(chipAria(c)).not.toContain(String.fromCharCode(0x2014))
    }
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
    for (const s of [OWN_NOTE, higherGradeLine(9, 6)!, noTopicsLine(9), ADD_A_GRADE]) expect(s).not.toContain(String.fromCharCode(0x2014))
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
