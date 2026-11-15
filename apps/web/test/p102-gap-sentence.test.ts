import { describe, expect, it } from 'vitest'
import { gapSentence, mistakePhrase, mistakeTitle } from '../lib/mistake-words'

// P102: Ms Banda's class heading reads well whatever form the model's mistake label has: a verb phrase ("Adds the tops") or a full sentence with a
// subject ("Learner may add or subtract ..."). The words are joined by one helper. Pure functions: no database, no browser.

const STORED = 'Learner may add or subtract the top and bottom numbers separately, or forget to make the denominators the same first.'
const SHORT = 'Adding different-denominator fractions'
const gap = (label: string, count = 3, total = 5, shortName = SHORT) => ({ count, total, shortName, mistake: { label } })

describe('gapSentence', () => {
  it('the stored label of the demo class reads as one sentence', () => {
    expect(gapSentence(gap(STORED))).toBe(
      '3 of 5 learners may add or subtract the top and bottom numbers separately, or forget to make the denominators the same first, when adding different-denominator fractions.',
    )
  })

  it('a verb phrase reads as it always did', () => {
    expect(gapSentence(gap('Adds the tops and the bottoms', 4, 5, 'Adding fractions'))).toBe('4 of 5 learners add the tops and the bottoms when adding fractions.')
    expect(gapSentence(gap('Thinks bigger', 2, 5, 'Comparing fractions'))).toBe('2 of 5 learners think bigger when comparing fractions.')
    expect(gapSentence(gap('Mixes up the numerator and the denominator', 3, 5, 'Reading fractions'))).toBe('3 of 5 learners mix up the numerator and the denominator when reading fractions.')
  })

  it('a sentence with a plural subject drops the subject', () => {
    expect(gapSentence(gap('Learners often add the tops and the bottoms.', 3, 5, 'Adding fractions'))).toBe('3 of 5 learners often add the tops and the bottoms when adding fractions.')
    expect(gapSentence(gap('Many learners forget the carry.', 2, 5, 'Adding whole numbers'))).toBe('2 of 5 learners forget the carry when adding whole numbers.')
  })

  it('a sentence with a singular subject drops the subject and says the verb for many', () => {
    expect(gapSentence(gap('The learner adds the tops.', 3, 5, 'Adding fractions'))).toBe('3 of 5 learners add the tops when adding fractions.')
    expect(gapSentence(gap('A learner often has trouble with the carry.', 3, 5, 'Adding whole numbers'))).toBe('3 of 5 learners often have trouble with the carry when adding whole numbers.')
  })

  it('a trailing full stop is dropped before the words are joined, with or without a subject', () => {
    expect(gapSentence(gap('Adds the tops.', 4, 5, 'Adding fractions'))).toBe('4 of 5 learners add the tops when adding fractions.')
    expect(gapSentence(gap('Adds the tops...  ', 4, 5, 'Adding fractions'))).toBe('4 of 5 learners add the tops when adding fractions.')
  })

  it('a phrase that already has a comma takes a comma before "when"; a short one does not', () => {
    expect(gapSentence(gap('Learner may add the tops, or forget the carry', 1, 5, 'Adding fractions'))).toBe('1 of 5 learners may add the tops, or forget the carry, when adding fractions.')
    expect(gapSentence(gap('Learner may add the tops', 1, 5, 'Adding fractions'))).toBe('1 of 5 learners may add the tops when adding fractions.')
  })

  it('no mistake: the learners are stuck on the topic', () => {
    expect(gapSentence({ count: 2, total: 5, shortName: SHORT, mistake: null })).toBe('2 of 5 learners are stuck on adding different-denominator fractions.')
  })

  it('a label that is only a subject, or empty, does not break the sentence', () => {
    expect(gapSentence(gap('Learners', 2, 5, 'Adding fractions'))).toBe('2 of 5 learners are stuck on adding fractions.')
    expect(gapSentence(gap('  .  ', 2, 5, 'Adding fractions'))).toBe('2 of 5 learners are stuck on adding fractions.')
    expect(gapSentence(gap('', 2, 5, 'Adding fractions'))).toBe('2 of 5 learners are stuck on adding fractions.')
  })
})

describe('mistakePhrase: what the learners do, with no subject and no full stop', () => {
  it('verb phrases are put into the form for many learners', () => {
    expect(mistakePhrase('Adds the tops')).toBe('add the tops')
    expect(mistakePhrase('Thinks bigger')).toBe('think bigger')
    expect(mistakePhrase('Misses the carry')).toBe('miss the carry')
    expect(mistakePhrase('Confuses the tops and the bottoms')).toBe('confuse the tops and the bottoms')
    expect(mistakePhrase('Multiplies the denominators')).toBe('multiply the denominators')
    expect(mistakePhrase('Always adds the tops')).toBe('always add the tops')
  })

  it('sentences lose their subject and their full stop', () => {
    expect(mistakePhrase(STORED)).toBe('may add or subtract the top and bottom numbers separately, or forget to make the denominators the same first')
    expect(mistakePhrase('Learners often add the tops.')).toBe('often add the tops')
    expect(mistakePhrase('The learners add the tops.')).toBe('add the tops')
    expect(mistakePhrase('Learners who add the tops')).toBe('add the tops')
  })
})

describe('mistakeTitle: the label shown before a colon', () => {
  it('has no full stop at its end, and is otherwise as stored', () => {
    expect(mistakeTitle(STORED)).toBe('Learner may add or subtract the top and bottom numbers separately, or forget to make the denominators the same first')
    expect(mistakeTitle('Adds the tops and the bottoms')).toBe('Adds the tops and the bottoms')
  })
})
