// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { gapLine, lockOf, NO_MAP_LINE, rowScore, stageWords, strandScreen, topicLine } from '../app/k/maths/format'
import type { MyMathsStrand } from '@jemma/profiling/logic'

// The pure pieces of the two "My maths" screens: what a row says for a score, for a stage, and what the part's screen shows when the class has
// no approved map. No database, no browser.

const strand = (over: Partial<MyMathsStrand> = {}): MyMathsStrand => ({ family: 'fractions', label: 'Fractions', score: { right: 9, asked: 16 }, topics: [], ...over })
const topic = (name: string, right: number, asked: number, gap: 'new' | 'practising' | 'fixed' | null = null) => ({ id: name, name, family: 'fractions', term: 4, position: 1, score: { right, asked }, gap })

describe('what a row says for a score', () => {
  it('"No score yet" when nothing was asked, otherwise "{right} of {asked} right", and never a percent', () => {
    expect(rowScore({ right: 0, asked: 0 })).toBe('No score yet')
    expect(rowScore({ right: 5, asked: 6 })).toBe('5 of 6 right')
    expect(rowScore({ right: 17, asked: 20 })).toBe('17 of 20 right')
    expect(rowScore({ right: 0, asked: 3 })).toBe('0 of 3 right')
    for (const s of [{ right: 5, asked: 6 }, { right: 1, asked: 3 }]) expect(rowScore(s)).not.toMatch(/%|percent/)
  })
})

describe('what a row says for a stage', () => {
  it('uses the words the gaps screen always used: New, Practising, Fixed', () => {
    expect(stageWords('new')).toBe('New')
    expect(stageWords('practising')).toBe('Practising')
    expect(stageWords('fixed')).toBe('Fixed')
  })

  it('a topic line is its stage when it has a gap, and nothing when it has none', () => {
    expect(topicLine(topic('Adding fractions', 2, 6, 'practising'))).toBe('Practising')
    expect(topicLine(topic('Equivalent fractions', 5, 5, 'fixed'))).toBe('Fixed')
    expect(topicLine(topic('Fractions of amounts', 0, 0))).toBeNull()
  })

  it('a gap line is its stage and its score', () => {
    expect(gapLine({ stage: 'new', score: { right: 2, asked: 6 } })).toBe('New · 2 of 6 right')
    expect(gapLine({ stage: 'fixed', score: { right: 0, asked: 0 } })).toBe('Fixed · No score yet')
  })
})

describe('the screen of one part', () => {
  it('lists this year\'s topics when the map has some, in the order given', () => {
    const view = strandScreen(strand({ topics: [topic('Equivalent fractions', 5, 5), topic('Adding fractions', 2, 6, 'practising')] }))
    expect(view).toEqual({ kind: 'topics', title: 'Fractions', score: '9 of 16 right', topics: expect.any(Array) })
    expect(view.kind === 'topics' && view.topics.map((t) => t.name)).toEqual(['Equivalent fractions', 'Adding fractions'])
  })

  it('says the teacher has not set up this year\'s topics when the part has none (no approved map, or no topic of this part), with one button for the part', () => {
    const view = strandScreen(strand({ topics: [], score: { right: 0, asked: 0 } }))
    expect(view).toEqual({ kind: 'no-topics', title: 'Fractions', score: 'No score yet', line: "Your teacher has not set up this year's topics yet.", button: 'Practise Fractions', choice: { topicName: 'Fractions' } })
    expect(NO_MAP_LINE).toBe("Your teacher has not set up this year's topics yet.")
  })
})

describe('when no Practise button is shown', () => {
  it('while tonight\'s lesson waits: one line and a link to today', () => {
    expect(lockOf('due')).toEqual({ text: "Finish tonight's lesson first.", href: '/k', link: 'Go to today' })
  })

  it('while a practice is being written: one line and a link to today', () => {
    expect(lockOf('writing')).toEqual({ text: 'Jemma is writing your practice.', href: '/k', link: 'Go to today' })
  })

  it('otherwise nothing is in the way', () => {
    expect(lockOf('free')).toBeNull()
  })
})
