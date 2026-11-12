import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import type { TopicMapDraft } from '../../profiling/src/schemas'
import { strandOrder } from '../../profiling/src/logic/strands'
import {
  DOCUMENT_IDS,
  FAMILY_ONE_OR_TWO_WORDS,
  FAMILY_WORD,
  OTHER_SUBJECTS_DIR,
  OTHER_SUBJECT_IDS,
  UNSEEN_DIR,
  documentPath,
  folderOf,
  finalTries,
  loadTruth,
  nameMatches,
  parseTruth,
  perfectDraft,
  parseUnseenResult,
  planResume,
  countRepeats,
  isLiveRun,
  scoreDraft,
  stem,
  whatWentWrong,
  wordsOf,
  type Truth,
  type UnseenResult,
} from '../../../evals/lib/unseen'

const maths = DOCUMENT_IDS.map((id) => loadTruth(id))
const others = OTHER_SUBJECT_IDS.map((id) => loadTruth(id))
const truths = [...maths, ...others]
const grade9 = maths[0] as Truth
// The three earlier documents, outside Mathematics: still scored by the same code, and the scorer tests below use them for the lists of families.
const [science, english, kenya] = others as [Truth, Truth, Truth]

type DraftTopic = TopicMapDraft['terms'][number]['topics'][number]

const perfect = perfectDraft

const withoutTopics = (d: TopicMapDraft, names: string[]): TopicMapDraft => ({ ...d, terms: d.terms.map((t) => ({ ...t, topics: t.topics.filter((x) => !names.includes(x.name)) })) })
const named = (checks: { name: string; pass: boolean; detail: string }[], part: string) => {
  const hit = checks.find((c) => c.name.includes(part))
  if (!hit) throw new Error(`no check like "${part}" in ${checks.map((c) => c.name).join(' | ')}`)
  return hit
}
const failedNames = (checks: { name: string; pass: boolean }[]) => checks.filter((c) => !c.pass).map((c) => c.name)

describe('the ground truth of the documents', () => {
  test('the three Mathematics documents have the shapes the brief asks for', () => {
    expect(maths.map((t) => [t.grade, t.subject, t.country, t.termCount, t.textLayer])).toEqual([
      [9, 'Mathematics', 'ZA', 4, true],
      [5, 'Mathematics', 'ZA', 4, true],
      [4, 'Mathematics', 'KE', 3, false],
    ])
    expect(maths.map((t) => t.topics.length)).toEqual([14, 15, 12])
  })

  test('the three earlier documents are kept apart, in other-subjects, with their ground truth', () => {
    expect(others.map((t) => [t.grade, t.subject, t.country, t.termCount, t.textLayer])).toEqual([
      [9, 'Natural Sciences', 'ZA', 4, true],
      [5, 'English', 'ZA', 4, true],
      [4, 'Science and Technology', 'KE', 3, false],
    ])
    expect(others.map((t) => t.topics.length)).toEqual([15, 15, 12])
    for (const t of others) {
      expect(folderOf(t.id)).toBe(OTHER_SUBJECTS_DIR)
      expect(existsSync(documentPath(t)), `${t.file} is in other-subjects`).toBe(true)
    }
    for (const t of maths) {
      expect(folderOf(t.id)).toBe(UNSEEN_DIR)
      expect(existsSync(documentPath(t)), `${t.file} is in the unseen folder`).toBe(true)
    }
    expect([...DOCUMENT_IDS, ...OTHER_SUBJECT_IDS]).toHaveLength(6)
  })

  test('each has the two traps: a topic in two terms, and a topic of another grade that is not among the topics', () => {
    for (const t of truths) {
      expect(t.traps.twoTerms.terms.length).toBeGreaterThanOrEqual(2)
      const two = t.topics.find((x) => x.name === t.traps.twoTerms.name)!
      expect(two.terms).toEqual(t.traps.twoTerms.terms)
      expect(t.traps.otherGrade.grade).not.toBe(t.grade)
      expect(t.topics.some((x) => nameMatches(x.name, t.traps.otherGrade.match))).toBe(false)
    }
  })

  test('the Mathematics documents use the strands of Mathematics and also take one or two short lowercase words', () => {
    for (const t of maths) {
      expect(t.families).toEqual(strandOrder('Mathematics'))
      expect(t.otherFamilyWords).toBe(true)
      for (const x of t.topics) expect(t.families!.includes(x.family) || FAMILY_ONE_OR_TWO_WORDS.test(x.family), `${t.id}: "${x.family}"`).toBe(true)
    }
    // a Grade 9 plan has algebra and geometry, which the Grade 6 list does not name
    expect(grade9.topics.some((x) => !grade9.families!.includes(x.family))).toBe(true)
  })

  test('the earlier subjects with a list of families use it, and the Science and Technology one takes any short lowercase word', () => {
    expect(science.families).toEqual(['life_living', 'matter_materials', 'energy_change', 'earth_beyond'])
    expect(english.families).toEqual(['reading', 'writing', 'language', 'speaking_listening'])
    expect(kenya.families).toBeNull()
    for (const t of [science, english]) expect(t.topics.every((x) => t.families!.includes(x.family))).toBe(true)
    expect(kenya.topics.every((x) => FAMILY_WORD.test(x.family))).toBe(true)
  })

  test('the name of each topic matches its own words, and no other topic of the same document', () => {
    for (const t of truths) {
      for (const a of t.topics) {
        expect(nameMatches(a.name, a.match), `${t.id}: "${a.name}" must match itself`).toBe(true)
        for (const b of t.topics) if (a !== b) expect(nameMatches(a.name, b.match), `${t.id}: "${a.name}" must not match "${b.name}"`).toBe(false)
      }
      expect(nameMatches(t.traps.otherGrade.name, t.traps.otherGrade.match)).toBe(true)
    }
  })

  test('every topic and both traps are in the document itself (its source text)', () => {
    for (const t of truths) {
      const source = readFileSync(join(folderOf(t.id), `${t.id}.html`), 'utf8').replace(/<[^>]+>/g, ' ').replace(/&amp;|&middot;/g, ' ')
      const flat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ')
      for (const x of [...t.topics.map((y) => y.name), t.traps.otherGrade.name]) {
        // "Tenses" is written "tenses: past, present and future"; "Reading for information" ends "from non-fiction texts"
        expect(flat(source), `${t.id} must contain "${x}"`).toContain(flat(x))
      }
    }
  })

  test('a ground truth with a topic in a term the document does not have is refused', () => {
    const raw = JSON.parse(readFileSync(join(UNSEEN_DIR, 'grade4-mathematics-ke.json'), 'utf8'))
    raw.topics[0].terms = [4]
    expect(() => parseTruth(raw, 'x')).toThrow(/term the document does not have/)
    raw.topics[0].terms = [1]
    delete raw.traps
    expect(() => parseTruth(raw, 'x')).toThrow(/traps/)
  })

  test('other family words need a list of families to be other than', () => {
    const raw = JSON.parse(readFileSync(join(UNSEEN_DIR, 'grade4-mathematics-ke.json'), 'utf8'))
    raw.families = null
    expect(() => parseTruth(raw, 'x')).toThrow(/otherFamilyWords needs a list/)
    raw.families = ['fractions']
    raw.otherFamilyWords = 'yes'
    expect(() => parseTruth(raw, 'x')).toThrow(/true or false/)
  })
})

describe('matching a name to the ground truth', () => {
  test('light stemming makes plurals, endings and capitals the same', () => {
    expect(stem('bases')).toBe('base')
    expect(stem('flowering')).toBe('flower')
    expect(stem('photosynthesis')).toBe('photosynthesis')
    expect(stem('series')).toBe('sery')
    expect(wordsOf('Acids, Bases & the pH scale!')).toEqual(['acid', 'base', 'the', 'ph', 'scale'])
  })

  test('a shorter or longer wording of the same topic is the same topic', () => {
    const tenses = english.topics.find((t) => t.name === 'Tenses')!
    expect(nameMatches('Tenses: past, present and future', tenses.match)).toBe(true)
    expect(nameMatches('Past and present tense', tenses.match)).toBe(true)
    expect(nameMatches('Story elements: characters, setting and plot', english.topics[0]!.match)).toBe(true)
  })

  test('a different topic is not matched by a shared common word', () => {
    expect(nameMatches('Writing a letter to a friend', english.topics.find((t) => t.name === 'Writing a story')!.match)).toBe(false)
    expect(nameMatches('Capital letters', english.topics.find((t) => t.name === 'Writing a letter to a friend')!.match)).toBe(false)
    expect(nameMatches('Series and parallel circuits', science.topics.find((t) => t.name === 'Electric circuits')!.match)).toBe(false)
  })
})

describe('scoring a draft', () => {
  test.each(truths.map((t) => [t.id, t] as const))('%s: a draft that is right in every way passes every check', (_id, t) => {
    const score = scoreDraft(perfect(t), t)
    expect(failedNames(score.checks)).toEqual([])
    expect(score.pass).toBe(true)
    expect(score.figures).toMatchObject({ found: t.topics.length, of: t.topics.length, invented: 0 })
  })

  test('the checks are the ones the brief names, each with a reason in plain words', () => {
    const score = scoreDraft(perfect(science), science)
    expect(score.checks.map((c) => c.name)).toEqual([
      'the draft is for the right grade',
      'at least 80 percent of the topics were found',
      'at most 15 percent of the draft is made up',
      'at least 80 percent of the found topics are in the right term',
      'the topic listed in two terms is flagged with a question',
      'the topic of another grade is flagged with a question or left out with a reason',
      "every family key is one of the subject's keys",
      'the map has the number of terms the document has',
    ])
    expect(score.checks.every((c) => c.detail.length > 5)).toBe(true)
  })

  test('topics found: 12 of 15 is exactly 80 percent and passes, 11 of 15 does not', () => {
    const names = science.topics.map((t) => t.name)
    expect(named(scoreDraft(withoutTopics(perfect(science), names.slice(0, 3)), science).checks, 'topics were found').pass).toBe(true)
    const eleven = scoreDraft(withoutTopics(perfect(science), names.slice(0, 4)), science)
    expect(named(eleven.checks, 'topics were found')).toMatchObject({ pass: false })
    expect(named(eleven.checks, 'topics were found').detail).toContain('found 11 of 15')
    expect(eleven.pass).toBe(false)
  })

  test('topics made up: 15 percent of the draft is allowed, more is not', () => {
    const base = perfect(english)
    const extra = (n: number): TopicMapDraft => ({
      ...base,
      terms: base.terms.map((t, i) => (i === 0 ? { ...t, topics: [...t.topics, ...Array.from({ length: n }, (_, k) => ({ name: `Zebra studies ${k}`, family: 'reading', prerequisites: [], misconceptions: [] }))] } : t)),
    })
    // 15 real topics + 2 made up = 17: 2/17 is 11.8 percent. +3 = 18: 3/18 is 16.7 percent.
    expect(named(scoreDraft(extra(2), english).checks, 'made up').pass).toBe(true)
    const three = scoreDraft(extra(3), english)
    expect(named(three.checks, 'made up').pass).toBe(false)
    expect(named(three.checks, 'made up').detail).toContain('3 of 18 drafted topics are not in the document')
  })

  test('the topic of another grade is not a made up topic, but it must be flagged', () => {
    const d = perfect(english)
    const noFlag: TopicMapDraft = { ...d, leftOut: [], terms: d.terms.map((t) => (t.term === 4 ? { ...t, topics: [...t.topics, { name: 'Writing a formal essay', family: 'writing', prerequisites: [], misconceptions: [] }] } : t)) }
    const s = scoreDraft(noFlag, english)
    expect(named(s.checks, 'made up').pass).toBe(true)
    expect(named(s.checks, 'another grade')).toMatchObject({ pass: false })
    expect(named(s.checks, 'another grade').detail).toContain('normal topic of Term 4')
    // with a check on it, or under leftOut, it is flagged
    const withCheck: TopicMapDraft = { ...noFlag, terms: noFlag.terms.map((t) => ({ ...t, topics: t.topics.map((x) => (x.name === 'Writing a formal essay' ? { ...x, check: { reason: 'A Grade 7 skill', options: ['Keep', 'Leave out'] } } : x)) })) }
    expect(named(scoreDraft(withCheck, english).checks, 'another grade').pass).toBe(true)
    expect(named(scoreDraft(d, english).checks, 'another grade').pass).toBe(true)
  })

  test('silently leaving the other grade topic out is not flagging it', () => {
    const s = scoreDraft({ ...perfect(science), leftOut: [] }, science)
    expect(named(s.checks, 'another grade')).toMatchObject({ pass: false })
    expect(named(s.checks, 'another grade').detail).toContain('neither in the draft nor under leftOut')
  })

  test('the topic listed in two terms needs a question, and an empty reason is not a question', () => {
    const d = perfect(science)
    const strip = (check: DraftTopic['check']): TopicMapDraft => ({ ...d, terms: d.terms.map((t) => ({ ...t, topics: t.topics.map((x) => (x.name === 'Electric circuits' ? { ...x, check } : x)) })) })
    expect(named(scoreDraft(strip(undefined), science).checks, 'two terms')).toMatchObject({ pass: false })
    expect(named(scoreDraft(strip({ reason: '  ', options: ['a', 'b'] }), science).checks, 'two terms').pass).toBe(false)
    expect(named(scoreDraft(withoutTopics(d, ['Electric circuits']), science).checks, 'two terms').detail).toContain('not in the draft at all')
  })

  test('right term: either of the two terms is right for the topic listed twice, and a wrong term is named', () => {
    const d = perfect(english)
    const moveIn = (base: TopicMapDraft, name: string, to: 1 | 2 | 3 | 4): TopicMapDraft => {
      const t = base.terms.flatMap((x) => x.topics).find((x) => x.name === name)!
      return { ...base, terms: base.terms.map((x) => ({ ...x, topics: x.term === to ? [...x.topics.filter((y) => y.name !== name), t] : x.topics.filter((y) => y.name !== name) })) }
    }
    expect(named(scoreDraft(moveIn(d, 'Writing a paragraph', 3), english).checks, 'right term').pass).toBe(true)
    expect(named(scoreDraft(moveIn(d, 'Writing a paragraph', 4), english).checks, 'right term').pass).toBe(true) // 14 of 15 is enough
    // five topics in the wrong term: 10 of 15 right is under 80 percent
    let wrong = d
    for (const n of ['Story elements', 'Writing a recount', 'Poems and rhyme', 'Tenses', 'Class debate']) wrong = moveIn(wrong, n, n === 'Class debate' ? 1 : 4)
    const s = scoreDraft(wrong, english)
    expect(named(s.checks, 'right term').pass).toBe(false)
    expect(named(s.checks, 'right term').detail).toContain('should be')
  })

  test('the grade must be the document grade', () => {
    const s = scoreDraft({ ...perfect(kenya), grade: 6 }, kenya)
    expect(named(s.checks, 'right grade')).toMatchObject({ pass: false })
    expect(named(s.checks, 'right grade').detail).toBe('draft grade 6, document grade 4')
  })

  test('families: a key outside the subject list fails, and for Science and Technology any short lowercase word passes', () => {
    const d = perfect(science)
    const odd: TopicMapDraft = { ...d, terms: d.terms.map((t, i) => (i === 0 ? { ...t, topics: t.topics.map((x, j) => (j === 0 ? { ...x, family: 'biology' } : x)) } : t)) }
    const s = scoreDraft(odd, science)
    expect(named(s.checks, 'family key')).toMatchObject({ pass: false })
    expect(named(s.checks, 'family key').detail).toContain('"biology"')
    const k = perfect(kenya)
    const free: TopicMapDraft = { ...k, terms: k.terms.map((t) => ({ ...t, topics: t.topics.map((x) => ({ ...x, family: 'living_things' })) })) }
    expect(named(scoreDraft(free, kenya).checks, 'family key').pass).toBe(true)
    const shouting: TopicMapDraft = { ...k, terms: k.terms.map((t) => ({ ...t, topics: t.topics.map((x) => ({ ...x, family: 'Living Things And Their Environment' })) })) }
    expect(named(scoreDraft(shouting, kenya).checks, 'family key').pass).toBe(false)
  })

  test('Mathematics: the Grade 6 list or one or two short lowercase words pass, and the words that were not in the list are named', () => {
    const d = perfect(grade9)
    const withFamily = (family: string, name = 'Integers and exponents'): TopicMapDraft => ({ ...d, terms: d.terms.map((t) => ({ ...t, topics: t.topics.map((x) => (x.name === name ? { ...x, family } : x)) })) })
    const plain = scoreDraft(d, grade9)
    expect(named(plain.checks, 'family key')).toMatchObject({ pass: true })
    expect(named(plain.checks, 'family key').name).toBe("every family key is one of the subject's keys, or one or two short lowercase words")
    // the perfect Grade 9 draft uses algebra, functions and geometry, none of them in the Grade 6 list
    expect(plain.figures.extraFamilies).toEqual(['algebra', 'functions', 'geometry', 'money', 'patterns', 'ratio'])
    expect(named(plain.checks, 'family key').detail).toContain('not in the list (whole_numbers, fractions, decimals, shapes, measurement, data): algebra, functions, geometry, money, patterns, ratio')
    // a key of the list is not an extra word
    expect(scoreDraft(withFamily('fractions'), grade9).figures.extraFamilies).toEqual(['algebra', 'functions', 'geometry', 'money', 'patterns', 'ratio'])
    expect(scoreDraft(withFamily('number_sense'), grade9).figures.extraFamilies).toContain('number_sense')
    expect(named(scoreDraft(withFamily('number_sense'), grade9).checks, 'family key').pass).toBe(true)
    // capital letters, three words, a single letter and an empty family are none of them short lowercase words
    for (const bad of ['Algebra', 'patterns_and_algebra', 'a', '', 'algebra!', 'abcdefghijklmnop']) {
      const s = scoreDraft(withFamily(bad), grade9)
      expect(named(s.checks, 'family key'), `"${bad}"`).toMatchObject({ pass: false })
      expect(named(s.checks, 'family key').detail).toContain('not allowed')
    }
    // a document without other words does not get the extra figure
    expect(scoreDraft(perfect(science), science).figures.extraFamilies).toBeUndefined()
  })

  test('terms: a three term document must give three terms, and an invented fourth term fails', () => {
    const k = perfect(kenya)
    expect(named(scoreDraft(k, kenya).checks, 'number of terms').pass).toBe(true)
    const four: TopicMapDraft = { ...k, terms: [...k.terms, { term: 4, topics: [{ name: 'Weather and seasons', family: 'weather', prerequisites: [], misconceptions: [] }] }] }
    expect(named(scoreDraft(four, kenya).checks, 'number of terms')).toMatchObject({ pass: false })
    // an empty fourth term is not a term (the job drops it before saving, and the scorer ignores it too)
    const empty: TopicMapDraft = { ...k, terms: [...k.terms, { term: 4, topics: [] }] }
    expect(named(scoreDraft(empty, kenya).checks, 'number of terms').pass).toBe(true)
    // a four term document drafted as three terms also fails
    const three: TopicMapDraft = { ...perfect(science), terms: perfect(science).terms.slice(0, 3) }
    expect(named(scoreDraft(three, science).checks, 'number of terms').pass).toBe(false)
  })

  test('an empty draft fails every count and does not divide by zero', () => {
    const s = scoreDraft({ grade: 9, terms: [], leftOut: [] }, science)
    expect(s.pass).toBe(false)
    expect(s.figures).toMatchObject({ found: 0, drafted: 0 })
    expect(named(s.checks, 'made up').pass).toBe(false)
  })
})

describe('the results of live runs', () => {
  const result = (over: Partial<UnseenResult>): UnseenResult => ({
    version: 1, runId: 'r', docId: 'grade5-english-za', n: 1, attempt: 1, startedAt: '2026-11-12T08:00:00.000Z', verdict: 'pass', seconds: 40, calls: 1,
    way: 'vision', visionProblem: null, model: 'nvidia/nemotron-3.5-super-vl:free', error: null, noAnswer: null, checks: [], figures: null, draft: null, ...over,
  })

  test('a repeat replaces the try that got no answer, and only the last try of a run counts', () => {
    const tries = [
      result({ n: 1, attempt: 1, verdict: 'no_answer', noAnswer: 'Rate limit exceeded' }),
      result({ n: 1, attempt: 2, verdict: 'pass' }),
      result({ n: 2, attempt: 1, verdict: 'fail' }),
      result({ docId: 'grade9-natural-sciences-za', n: 1 }),
    ]
    const last = finalTries(tries)
    expect(last.map((r) => `${r.docId}:${r.n}:${r.attempt}:${r.verdict}`)).toEqual([
      'grade5-english-za:1:2:pass',
      'grade5-english-za:2:1:fail',
      'grade9-natural-sciences-za:1:1:pass',
    ])
  })

  test('what went wrong is told in plain words: no answers apart from fails, with the provider\'s words once', () => {
    const runs = [
      result({ n: 1, verdict: 'no_answer', noAnswer: 'Rate limit exceeded: Provider returned error.' }),
      result({ n: 2, verdict: 'no_answer', noAnswer: 'Rate limit exceeded: Provider returned error.' }),
      result({ n: 3, verdict: 'fail', checks: [{ name: 'the map has the number of terms the document has', pass: false, detail: 'the document has 3 terms, the draft has terms 1, 2, 3, 4' }] }),
    ]
    const text = whatWentWrong(runs)
    expect(text).toContain('2 runs got no answer from the free endpoint ("Rate limit exceeded: Provider returned error."), so they were not judged')
    expect(text.match(/Rate limit exceeded/g)).toHaveLength(1)
    expect(text).toContain('run 3: the map has the number of terms the document has (the document has 3 terms, the draft has terms 1, 2, 3, 4)')
    expect(whatWentWrong([result({})])).toBe('nothing: every run passed every check')
  })

  test('a result file is checked when it is read', () => {
    expect(parseUnseenResult(JSON.stringify(result({})), 'f').docId).toBe('grade5-english-za')
    expect(() => parseUnseenResult('nope', 'f')).toThrow(/not valid JSON/)
    expect(() => parseUnseenResult(JSON.stringify({ ...result({}), version: 9 }), 'f')).toThrow(/version/)
    expect(() => parseUnseenResult(JSON.stringify({ ...result({}), verdict: 'maybe' }), 'f')).toThrow(/verdict/)
  })
})

describe('resuming a run id that was stopped', () => {
  const t = (docId: string, n: number, over: Partial<UnseenResult> = {}): UnseenResult => ({
    version: 1, runId: 'r', docId, n, attempt: 1, startedAt: '2026-11-12T08:00:00.000Z', verdict: 'pass', seconds: 40, calls: 1,
    way: 'vision', visionProblem: null, model: 'm:free', error: null, noAnswer: null, checks: [], figures: null, draft: null, ...over,
  })
  const lost = (n: number, attempt: number) => t('k', n, { attempt, verdict: 'no_answer', calls: 0, way: null, model: null, machineNetwork: 'teacher: fetch failed', seconds: 0 })

  test('a run that has a pass or a fail is done and is never run again, a run with nothing is not', () => {
    const plan = planResume([t('a', 1), t('a', 2, { verdict: 'fail' }), t('k', 1)], 3)
    expect([...plan.done].sort()).toEqual(['a|1', 'a|2', 'k|1'])
    expect(plan.nextAttempt.get('a|2')).toBe(2)
    expect(plan.done.has('k|3')).toBe(false)
    expect(plan.nextAttempt.get('k|3') ?? 1).toBe(1)
  })

  test('tries lost to this machine\'s network are not a result: the run is repeated from the next try, and no repeat is used up', () => {
    const plan = planResume([t('k', 1), t('k', 2, { verdict: 'fail', error: 'Failed to process successful response' }), lost(3, 1), lost(3, 2), lost(3, 3)], 3)
    expect(plan.done.has('k|3')).toBe(false)
    expect(plan.nextAttempt.get('k|3')).toBe(4)
    expect(plan.repeatsUsed).toBe(0)
    expect(plan.networkTries).toBe(3)
  })

  test('a try where the provider gave no answer and was then repeated used one repeat', () => {
    const none = (n: number, attempt: number) => t('a', n, { attempt, verdict: 'no_answer', noAnswer: 'Rate limit exceeded', way: null })
    const plan = planResume([none(1, 1), t('a', 1, { attempt: 2 }), none(2, 1), none(2, 2)], 3)
    expect(plan.repeatsUsed).toBe(2)
    expect(plan.done.has('a|1')).toBe(true)
    // run 2 ended on a no answer and 1 repeat is left, so it is repeated
    expect(plan.done.has('a|2')).toBe(false)
    expect(plan.nextAttempt.get('a|2')).toBe(3)
    // with no repeat left the no answer stays the result of that run
    expect(planResume([none(1, 1), t('a', 1, { attempt: 2 }), none(2, 1), none(2, 2)], 2).done.has('a|2')).toBe(true)
  })

  test('only a try that really asked a model and was not lost to the network is a live run, and only a no answer that was tried again is a repeat', () => {
    expect(isLiveRun(t('a', 1))).toBe(true)
    expect(isLiveRun(lost(3, 1))).toBe(false)
    expect(isLiveRun(t('a', 1, { calls: 0, verdict: 'fail', error: 'could not run: x' }))).toBe(false)
    const none = t('a', 1, { verdict: 'no_answer', noAnswer: 'Rate limit exceeded', way: null })
    expect(countRepeats([none, t('a', 1, { attempt: 2 }), lost(3, 1), lost(3, 2)])).toBe(1)
    expect(countRepeats([lost(3, 1), lost(3, 2), t('k', 3, { attempt: 3 })])).toBe(0)
  })

  test('what went wrong names the network when a run never got past it, and does not call it a provider answer', () => {
    const text = whatWentWrong([t('k', 3, { attempt: 3, verdict: 'no_answer', calls: 0, way: null, machineNetwork: 'teacher: fetch failed', seconds: 0 })])
    expect(text).toContain('never got past this Mac\'s own network ("teacher: fetch failed"), so it was not judged')
    expect(text).not.toContain('free endpoint')
  })
})
