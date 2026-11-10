import { describe, expect, it } from 'vitest'
import { stepFrom, type StepFacts } from '@/lib/demo'

// Where the judge is on the 5-step demo path. Step 2 (snap the memo and 5 papers, then tap Share with parents) lasts until
// 5 papers are marked AND the teacher has shared the test.

const done: StepFacts = { mapApproved: true, markedPapers: 5, markedPapersHeld: 0, hasChild: true, linked: true, sessionsDone: 1 }
const at = (over: Partial<StepFacts>) => stepFrom({ ...done, ...over })

describe('stepFrom', () => {
  it('starts at 1 until the topic map is approved', () => {
    expect(at({ mapApproved: false, markedPapers: 0, markedPapersHeld: 0 })).toBe(1)
  })

  it('stays at 2 until 5 papers are marked', () => {
    expect(at({ markedPapers: 0, markedPapersHeld: 0 })).toBe(2)
    expect(at({ markedPapers: 4, markedPapersHeld: 4 })).toBe(2)
  })

  it('stays at 2 while a test with a marked paper is still held, even with 5 papers marked', () => {
    expect(at({ markedPapers: 5, markedPapersHeld: 5 })).toBe(2)
    expect(at({ markedPapers: 5, markedPapersHeld: 1 })).toBe(2)
  })

  it('moves on to 3 once the test is shared and Amina is not linked yet', () => {
    expect(at({ markedPapersHeld: 0, linked: false, sessionsDone: 0 })).toBe(3)
    expect(at({ markedPapersHeld: 0, hasChild: false, linked: false, sessionsDone: 0 })).toBe(3)
  })

  it('is 4 once Amina is linked and 5 once she has finished a session', () => {
    expect(at({ sessionsDone: 0 })).toBe(4)
    expect(at({ sessionsDone: 1 })).toBe(5)
  })

  it('goes back to 2 if a new test is held after the first was shared and has marked papers', () => {
    expect(at({ markedPapers: 8, markedPapersHeld: 3 })).toBe(2)
  })
})
