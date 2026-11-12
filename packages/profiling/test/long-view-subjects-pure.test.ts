import { describe, expect, test } from 'vitest'
import { reviewOwners, screenPatterns, type RouteClass } from '../src/tools/save/save-long-view'

// The rules of a pattern's subject that need no database: which candidate a drafted pattern is, which words are checked, who is asked to look.

const GOOD = { title: 'Reading marks stay low', statement: 'Marks in reading stayed low for three terms.' }

describe('screenPatterns: a pattern is (subject, key)', () => {
  const known = [
    { key: 'struggle:data', subject: 'Mathematics' },
    { key: 'struggle:data', subject: 'Natural Sciences' },
    { key: 'strength:reading', subject: 'English' },
  ]

  test('the same key in two subjects keeps both, each named by its subject', () => {
    const { accepted, dropped } = screenPatterns(
      [
        { key: 'struggle:data', subject: 'Mathematics', ...GOOD },
        { key: 'struggle:data', subject: 'Natural Sciences', ...GOOD },
      ],
      known,
    )
    expect(dropped).toEqual([])
    expect(accepted.map((a) => [a.subject, a.key])).toEqual([
      ['Mathematics', 'struggle:data'],
      ['Natural Sciences', 'struggle:data'],
    ])
  })

  test('a pattern with no subject takes the only candidate with that key', () => {
    const { accepted, dropped } = screenPatterns([{ key: 'strength:reading', ...GOOD }], known)
    expect(dropped).toEqual([])
    expect(accepted).toMatchObject([{ subject: 'English', key: 'strength:reading' }])
  })

  test('a pattern with no subject is dropped when two subjects have its key, and the reason says to name the subject', () => {
    const { accepted, dropped } = screenPatterns([{ key: 'struggle:data', ...GOOD }], known)
    expect(accepted).toEqual([])
    expect(dropped).toEqual([{ key: 'struggle:data', reason: 'the key is in more than one subject: name the subject' }])
  })

  test('a subject and key the finder did not find are dropped, even when the key exists in another subject', () => {
    const { accepted, dropped } = screenPatterns(
      [
        { key: 'strength:reading', subject: 'Mathematics', ...GOOD },
        { key: 'struggle:made-up', ...GOOD },
        { key: 'struggle:data', subject: 'Social Sciences', ...GOOD },
      ],
      known,
    )
    expect(accepted).toEqual([])
    expect(dropped).toEqual([
      { key: 'strength:reading', subject: 'Mathematics', reason: 'no pattern in the records' },
      { key: 'struggle:made-up', reason: 'no pattern in the records' },
      { key: 'struggle:data', subject: 'Social Sciences', reason: 'no pattern in the records' },
    ])
  })

  test('the subject is read whatever its capitals, and Maths is Mathematics', () => {
    const { accepted } = screenPatterns([{ key: 'struggle:data', subject: ' maths ', ...GOOD }], known)
    expect(accepted.map((a) => a.subject)).toEqual(['Mathematics'])
  })

  test('the same (subject, key) listed twice is kept once', () => {
    const { accepted, dropped } = screenPatterns(
      [
        { key: 'strength:reading', subject: 'English', ...GOOD },
        { key: 'strength:reading', ...GOOD },
      ],
      known,
    )
    expect(accepted).toHaveLength(1)
    expect(dropped).toEqual([{ key: 'strength:reading', subject: 'English', reason: 'listed twice' }])
  })
})

describe('screenPatterns: the word check and the names of the data', () => {
  test('a banned word inside a name from the data is left alone, and the same word elsewhere is still caught', () => {
    const known = [{ key: 'struggle:geography', subject: 'Social Sciences', exempt: ['Social Sciences', 'Geography', 'Rank and file rivers', 'Track and field day'] }]
    const named = screenPatterns([{ key: 'struggle:geography', subject: 'Social Sciences', title: 'Geography marks stay low', statement: 'In Social Sciences, marks in Rank and file rivers and Track and field day stayed low.' }], known)
    expect(named.dropped).toEqual([])
    expect(named.accepted).toHaveLength(1)
    const bare = screenPatterns([{ key: 'struggle:geography', subject: 'Social Sciences', title: 'Geography marks stay low', statement: 'She is not on track in the stream of work.' }], known)
    expect(bare.accepted).toEqual([])
    expect(bare.dropped).toEqual([{ key: 'struggle:geography', subject: 'Social Sciences', reason: 'uses the words "track", "stream"' }])
  })

  test('the reason of a drop is plain and names the words', () => {
    const known = [{ key: 'struggle:reading', subject: 'English' }]
    const bad = screenPatterns([{ key: 'struggle:reading', subject: 'English', title: 'A gifted reader', statement: 'Fine words.' }], known)
    expect(bad.dropped).toEqual([{ key: 'struggle:reading', subject: 'English', reason: 'uses the word "gifted"' }])
  })
})

describe('reviewOwners: who is asked to look at the drafts', () => {
  const klass = (id: string, teacher: string, subject: string, year: number): RouteClass => ({ id, teacher_id: teacher, subject, year })
  const classes = [klass('c1', 'banda', 'Mathematics', 2026), klass('c2', 'zulu', 'English', 2026), klass('c3', 'dube', 'English', 2025), klass('c4', 'naidoo', 'Mathematics', 2027)]
  const joined = ['c1', 'c2', 'c3', 'c4']

  test('the drafts of a subject go to the teacher of the learner\'s class in that subject', () => {
    const owners = reviewOwners(new Map([['English', 2]]), classes.slice(0, 2), ['c1', 'c2'])
    expect([...owners]).toEqual([['zulu', 2]])
  })

  test('with two classes in one subject, the newest year is asked', () => {
    expect([...reviewOwners(new Map([['English', 1]]), classes, joined)]).toEqual([['zulu', 1]])
    expect([...reviewOwners(new Map([['Mathematics', 1]]), classes, joined)]).toEqual([['naidoo', 1]])
  })

  test('two classes of one year in one subject: the class the learner joined first is asked', () => {
    const twins = [klass('a', 'first', 'English', 2026), klass('b', 'second', 'English', 2026)]
    expect([...reviewOwners(new Map([['English', 1]]), twins, ['a', 'b'])]).toEqual([['first', 1]])
    expect([...reviewOwners(new Map([['English', 1]]), twins, ['b', 'a'])]).toEqual([['second', 1]])
  })

  test('a subject with no class goes to the teacher of the class the learner joined first', () => {
    expect([...reviewOwners(new Map([['Natural Sciences', 3]]), classes, joined)]).toEqual([['banda', 3]])
  })

  test('drafts in several subjects are counted for each teacher, and a teacher of two subjects gets one count', () => {
    const owners = reviewOwners(new Map([['Mathematics', 2], ['English', 1], ['Natural Sciences', 1], ['Social Sciences', 0]]), classes.slice(0, 2), ['c1', 'c2'])
    expect([...owners].sort()).toEqual([['banda', 3], ['zulu', 1]])
  })

  test('the subject is matched whatever its capitals, and Maths is Mathematics', () => {
    expect([...reviewOwners(new Map([['Mathematics', 1]]), [klass('m', 'm-teacher', 'Maths', 2026), klass('e', 'e-teacher', 'english', 2026)], ['e', 'm'])]).toEqual([['m-teacher', 1]])
  })

  test('no class at all: nobody is asked', () => {
    expect([...reviewOwners(new Map([['English', 1]]), [], [])]).toEqual([])
  })
})
