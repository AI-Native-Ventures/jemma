import { describe, expect, test } from 'vitest'
import { BANNED_WORDS as FROM_LONG_VIEW, bannedWords as bannedFromLongView } from '../../src/logic/long-view'
import { BANNED_WORDS, HARMLESS_PHRASES, bannedWords, leaveOutLabels, sentencesOf, speaksAboutLearner } from '../../src/logic/no-labels'

// P104: the "a profile, never a label" check is one shared module. The Long view, the guidance card, the class report and the lesson all use it.
// No database, no network, no model.

describe('the matcher moved to one shared module', () => {
  test('the Long view still has the very same list and matcher', () => {
    expect(FROM_LONG_VIEW).toBe(BANNED_WORDS)
    expect(bannedFromLongView).toBe(bannedWords)
  })

  test('it still finds whole words, case-insensitive, and phrases across a line break', () => {
    expect(bannedWords('A Gifted and SMART learner')).toEqual(['gifted', 'smart'])
    expect(bannedWords('a weak\nlearner')).toEqual(['weak learner'])
    expect(bannedWords('The slowly rising marks, a doctoral thesis, mainstream, tracks, ranking')).toEqual([])
  })

  test('a name that comes from the data is left alone, unless it is itself a banned word', () => {
    expect(bannedWords('Rank and file is a topic.', ['Rank and file'])).toEqual([])
    expect(bannedWords('She is on track', ['Track'])).toEqual(['track'])
  })
})

describe('a learner whose first name is a banned word', () => {
  // Clever, Bright, Smart and Genius are real first names. A card that says "Clever is doing well" is not a label.
  test('the name itself is not a label', () => {
    expect(bannedWords('Clever is doing well this week.', [], ['Clever'])).toEqual([])
    expect(bannedWords('Hello Bright. Today we add fractions.', [], ['Bright'])).toEqual([])
  })

  test('the word used about the learner still is, because the name is matched as written', () => {
    expect(bannedWords('Clever is a clever learner.', [], ['Clever'])).toEqual(['clever'])
    expect(bannedWords('Bright is bright and gifted.', [], ['Bright'])).toEqual(['bright', 'gifted'])
  })

  test('a name inside another word is not taken out', () => {
    expect(bannedWords('Brightness', [], ['Bright'])).toEqual([])
    expect(bannedWords('Clevers are clever', [], ['Clever'])).toEqual(['clever'])
  })

  test('an ordinary name changes nothing', () => {
    expect(bannedWords('Amina is gifted.', [], ['Amina'])).toEqual(['gifted'])
  })
})

describe('sentencesOf', () => {
  test('the pieces always join back to the text', () => {
    for (const text of [
      'One. Two! Three? Four',
      'Hello Amina.  Today we add 0.75 and 1,5.\n\nNext part. "You did it." Then more...',
      '',
      '   ',
      'No end',
      'A line\nthat goes on. Then ends.',
      'Wait?! Really?!',
    ]) {
      expect(sentencesOf(text).join('')).toBe(text)
    }
  })

  test('it splits after . ! ? that is followed by a space or the end, not inside a decimal', () => {
    expect(sentencesOf('Add 0.75 and 1.5. Then stop! Why?')).toEqual(['Add 0.75 and 1.5. ', 'Then stop! ', 'Why?'])
  })

  test('a closing quote stays with its sentence, and a line break does not end one', () => {
    expect(sentencesOf('She said "well done." Then left.')).toEqual(['She said "well done." ', 'Then left.'])
    expect(sentencesOf('a weak\nlearner. Fine.')).toEqual(['a weak\nlearner. ', 'Fine.'])
  })
})

describe('speaksAboutLearner', () => {
  test('a sentence that names the learner, says you or names learners in general', () => {
    expect(speaksAboutLearner('Hello Amina.', ['Amina'])).toBe(true)
    expect(speaksAboutLearner('hello amina', ['Amina'])).toBe(true)
    expect(speaksAboutLearner("You're doing well.", [])).toBe(true)
    expect(speaksAboutLearner('Check your answer.', [])).toBe(true)
    expect(speaksAboutLearner('Every learner makes this mistake.', [])).toBe(true)
    expect(speaksAboutLearner('Ask the children to try.', [])).toBe(true)
  })

  test('a sentence of maths does not', () => {
    expect(speaksAboutLearner('Multiply the top and bottom of one half by two.', ['Amina'])).toBe(false)
    expect(speaksAboutLearner('Use a clever trick to line up the bottoms.', ['Amina'])).toBe(false)
    expect(speaksAboutLearner('The Aminas of the world.', ['Amina'])).toBe(false)
  })
})

describe('leaveOutLabels', () => {
  test('a clean text comes back exactly as it was, spaces and all', () => {
    const text = '  Hello Amina.  Today we add fractions.\n\nBye.  '
    expect(leaveOutLabels(text, 'script')).toEqual({ text, dropped: [] })
  })

  test('it drops the sentence that carries a banned word, keeps the rest, and says what and why', () => {
    const r = leaveOutLabels('Amina is doing well. She is a gifted learner. Next up is subtracting fractions.', 'headline')
    expect(r.text).toBe('Amina is doing well. Next up is subtracting fractions.')
    expect(r.dropped).toEqual([{ field: 'headline', text: 'She is a gifted learner.', reason: 'uses the word "gifted"' }])
  })

  test('the reason lists every banned word of the sentence', () => {
    const r = leaveOutLabels('A slow learner who should study to be an engineer.', 'x')
    expect(r.text).toBe('')
    expect(r.dropped[0]!.reason).toBe('uses the words "slow", "should study", "engineer"')
  })

  test('a paragraph break stays between the sentences that are kept', () => {
    expect(leaveOutLabels('First part.\n\nShe is lazy.\n\nLast part.', 'x').text).toBe('First part.\n\nLast part.')
  })

  test('with aboutLearnerOnly it reads only a sentence that names the learner or says you', () => {
    const text = 'Use a clever trick: double the top. You are so clever! Thabo is slow at this. The track is 3/4 km.'
    const r = leaveOutLabels(text, 'script', { aboutLearnerOnly: true, people: ['Thabo'] })
    expect(r.text).toBe('Use a clever trick: double the top. The track is 3/4 km.')
    expect(r.dropped.map((d) => d.text)).toEqual(['You are so clever!', 'Thabo is slow at this.'])
  })

  test('without aboutLearnerOnly every sentence is read', () => {
    const r = leaveOutLabels('Use a clever trick. Fine.', 'x')
    expect(r.text).toBe('Fine.')
  })

  test('names from the data and the learner own name are left alone', () => {
    const r = leaveOutLabels('Clever is doing well. Rank and file is next.', 'x', { people: ['Clever'], exempt: ['Rank and file'] })
    expect(r.dropped).toEqual([])
  })
})

describe('"keep track of" and "lose track of" are maths words, not a career track (P116)', () => {
  // A hint like "Learners may lose track of the minus signs" lost a whole practice on 16 Nov, because `track` is banned. Only these eight phrases are taken out.
  test('the exact sentence that failed a practice has no banned word', () => {
    expect(bannedWords('Learners may join the y terms with the number terms or lose track of the minus signs.')).toEqual([])
  })

  test('the list is exactly the eight harmless phrases', () => {
    expect([...HARMLESS_PHRASES]).toEqual([
      'keep track of', 'keeps track of', 'kept track of', 'keeping track of',
      'lose track of', 'loses track of', 'lost track of', 'losing track of',
    ])
  })

  test.each([...['keep', 'keeps', 'kept', 'keeping', 'lose', 'loses', 'lost', 'losing']])('"%s track of" is harmless, in any case and with any run of spaces', (verb) => {
    expect(bannedWords(`Learners ${verb} track of the signs.`)).toEqual([])
    expect(bannedWords(`LEARNERS ${verb.toUpperCase()} TRACK OF THE SIGNS.`)).toEqual([])
    expect(bannedWords(`Learners ${verb}   track \t of the signs.`)).toEqual([])
    expect(bannedWords(`Learners ${verb}\ntrack\nof the signs.`)).toEqual([])
  })

  test('"Learners lost track of the minus sign." has none', () => {
    expect(bannedWords('Learners lost track of the minus sign.')).toEqual([])
  })

  test('"on track" and the other uses of the word stay banned', () => {
    expect(bannedWords('You are on track.')).toEqual(['track'])
    expect(bannedWords('She is on the fast track.')).toEqual(['track'])
    expect(bannedWords('Amina keeps track.')).toEqual(['track'])
    expect(bannedWords('She lost track and fell behind.')).toEqual(['track'])
    expect(bannedWords('The stream and the track.')).toEqual(['stream', 'track'])
  })

  test('a harmless phrase does not hide a banned use of the same word in the same text', () => {
    expect(bannedWords('Keep track of the signs, you are on track.')).toEqual(['track'])
    expect(bannedWords('You are on track and may lose track of the signs.')).toEqual(['track'])
  })

  test('only whole words: a longer word around the phrase is not the phrase', () => {
    expect(bannedWords('Learners may relose track of it.')).toEqual(['track'])
    expect(bannedWords('Learners may lose track offer.')).toEqual(['track'])
    expect(bannedWords('Learners may lose tracks of the signs.')).toEqual([])
  })

  test('the other banned words in the same sentence are still found, in order', () => {
    expect(bannedWords('A gifted learner who may lose track of the signs and wants a career.')).toEqual(['gifted', 'career'])
  })

  test('leaveOutLabels keeps a sentence that only loses track, and drops one that says "on track"', () => {
    const r = leaveOutLabels('Learners may lose track of the minus signs. You are on track.', 'why', { aboutLearnerOnly: true })
    expect(r.text).toBe('Learners may lose track of the minus signs.')
    expect(r.dropped).toEqual([{ field: 'why', text: 'You are on track.', reason: 'uses the word "track"' }])
  })
})
