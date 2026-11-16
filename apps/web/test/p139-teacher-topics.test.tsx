// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

// P139: the teacher's Topics screens. The numbers (averages by part and topic, the most missed questions, who needs help first) are pure functions of
// the rows they are given; the screens draw them, with every maths line typeset; and the practice history of a made-up learner is a pure builder over a
// committed fixture of real AI-written questions. No server, no browser, no database, no model.

vi.mock('../lib/supabase/server', () => ({ createSupabaseServer: vi.fn() }))
// P137b: the token card is an async server component, which a plain render cannot draw. It has its own test (p137-ai-tokens).
vi.mock('../components/AiTokens', () => ({ AiTokens: () => null }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))

const state = vi.hoisted(() => ({ cls: null as unknown, items: [] as unknown[] }))
vi.mock('../app/t/[classId]/topics/data', () => ({
  loadTopicsClass: async () => state.cls,
  loadTopicItems: async () => state.items,
}))

import {
  learnerResults,
  mostMissed,
  needHelpFirst,
  partLines,
  partsOf,
  percentOf,
  practisedLine,
  sessionsByTopic,
  tally,
  topicLines,
  typesetFor,
  type ItemRow,
  type MapTopic,
  type SessionRow,
} from '../app/t/[classId]/topics/logic'
import { buildMadeUpPractice, fixtureFor, idFrom, wrongAnswer, PRACTICE_FIXTURES } from '../../../supabase/seed/made-up-practice'
import TopicsPage from '../app/t/[classId]/topics/page'
import TopicsPartPage from '../app/t/[classId]/topics/[family]/page'
import TopicDetailPage from '../app/t/[classId]/topics/[family]/[topicId]/page'

const webRoot = resolve(import.meta.dirname, '..')

// ---- A Grade 11 class on the CAPS map -----------------------------------------------------------------------------------------------
const t = (id: string, name: string, family: string, term: number, position: number): MapTopic => ({ id, name, family, term, position })
const TOPICS: MapTopic[] = [
  t('t-exp', 'Exponents and surds', 'algebra', 1, 1),
  t('t-eq', 'Equations and inequalities', 'algebra', 1, 2),
  t('t-pat', 'Number patterns', 'patterns', 1, 3),
  t('t-fun', 'Functions', 'functions', 2, 1),
  t('t-trig2', 'Trigonometry', 'trigonometry', 2, 2),
  t('t-trig3', 'Trigonometry (Term 3)', 'trigonometry', 3, 2),
]
const LEARNERS = ['Amina', 'Ben', 'Chipo', 'Dumisani'].map((name, i) => ({ id: `c${i + 1}`, name }))

let n = 0
const s = (childId: string, topicId: string | null, right: number | null, asked: number | null, finishedAt: string | null, topicName: string | null = null): SessionRow => ({
  id: `s${++n}`,
  childId,
  topicId,
  topicName,
  right,
  asked,
  finishedAt,
})

const SESSIONS: SessionRow[] = [
  // Equations and inequalities: Amina 5/5 then (later) 4/5, Ben 2/5, Chipo 1/5, Dumisani has not tried.
  s('c1', 't-eq', 5, 5, '2026-11-05T13:00:00Z'),
  s('c1', 't-eq', 4, 5, '2026-11-12T13:00:00Z'),
  s('c2', 't-eq', 2, 5, '2026-11-10T13:00:00Z'),
  s('c3', 't-eq', 1, 5, '2026-11-11T13:00:00Z'),
  // Exponents and surds: only Amina, found by the topic's name (no id).
  s('c1', null, 3, 5, '2026-11-09T13:00:00Z', 'exponents and surds '),
  // Functions: Ben 5/5.
  s('c2', 't-fun', 5, 5, '2026-11-08T13:00:00Z'),
  // Do not count: not finished, no size, on no topic of the map.
  s('c4', 't-eq', 5, 5, null),
  s('c4', 't-eq', 5, null, '2026-11-08T13:00:00Z'),
  s('c4', 't-other', 5, 5, '2026-11-08T13:00:00Z', 'Something else'),
]

describe('the class average by part and by topic', () => {
  it('lists the parts of the map in map order with their topics', () => {
    expect(partsOf('Mathematics', TOPICS).map((p) => [p.family, p.label, p.topics.map((x) => x.id)])).toEqual([
      ['algebra', 'Algebra', ['t-exp', 't-eq']],
      ['patterns', 'Patterns', ['t-pat']],
      ['functions', 'Functions', ['t-fun']],
      ['trigonometry', 'Trigonometry', ['t-trig2', 't-trig3']],
    ])
  })

  it('puts each finished session on one topic: by id, else by the same name, and leaves out the ones that cannot be averaged', () => {
    const by = sessionsByTopic(TOPICS, SESSIONS)
    expect(by.get('t-eq')!.length).toBe(4)
    expect(by.get('t-exp')!.length).toBe(1)
    expect(by.get('t-fun')!.length).toBe(1)
    expect(by.get('t-pat')!.length).toBe(0)
  })

  it('averages right over asked, with the learners who practised', () => {
    const lines = partLines('Mathematics', TOPICS, SESSIONS)
    const algebra = lines.find((l) => l.family === 'algebra')!
    // 5+4+2+1 on Equations, 3 on Exponents, out of 25: 15 of 25.
    expect(algebra.tally).toEqual({ right: 15, asked: 25, learners: 3, sessions: 5 })
    expect(algebra.percent).toBe(60)
    expect(algebra.topicCount).toBe(2)
    expect(algebra.tried).toBe(2)
    expect(lines.find((l) => l.family === 'functions')!.percent).toBe(100)
    const patterns = lines.find((l) => l.family === 'patterns')!
    expect(patterns.percent).toBeNull()
    expect(patterns.tally.learners).toBe(0)
  })

  it('gives one line for each topic of a part', () => {
    const algebra = partsOf('Mathematics', TOPICS)[0]!
    const lines = topicLines(algebra, TOPICS, SESSIONS)
    expect(lines.map((l) => [l.topic.id, l.percent, l.tally.learners])).toEqual([
      ['t-exp', 60, 1],
      ['t-eq', 60, 3],
    ])
  })

  it('rounds to a whole percent and says nothing when nothing was asked', () => {
    expect(percentOf({ right: 2, asked: 3 })).toBe(67)
    expect(percentOf({ right: 0, asked: 0 })).toBeNull()
    expect(tally([])).toEqual({ right: 0, asked: 0, learners: 0, sessions: 0 })
  })

  it('says how many learners practised in plain words', () => {
    expect(practisedLine(0, 6)).toBe('No one has practised yet')
    expect(practisedLine(3, 6)).toBe('3 of 6 learners practised')
    expect(practisedLine(1, 1)).toBe('1 of 1 learner practised')
  })
})

describe('every learner of the class on one topic', () => {
  const results = learnerResults(LEARNERS, sessionsByTopic(TOPICS, SESSIONS).get('t-eq')!)

  it('lists every learner in name order with the last result and the number of tries', () => {
    expect(results.map((r) => r.name)).toEqual(['Amina', 'Ben', 'Chipo', 'Dumisani'])
    expect(results[0]).toMatchObject({ tries: 2, last: { right: 4, asked: 5, percent: 80, finishedAt: '2026-11-12T13:00:00Z' } })
    expect(results[1]).toMatchObject({ tries: 1, last: { percent: 40 } })
  })

  it('lists a learner with no try as not tried', () => {
    expect(results[3]).toEqual({ childId: 'c4', name: 'Dumisani', tries: 0, last: null })
  })

  it('names the learners who need help first: tried, under 80 percent, the lowest first', () => {
    expect(needHelpFirst(results).map((r) => r.name)).toEqual(['Chipo', 'Ben'])
    expect(needHelpFirst(results, 1).map((r) => r.name)).toEqual(['Chipo'])
    // Everyone strong, or no one tried: nobody.
    expect(needHelpFirst(results.filter((r) => r.name === 'Amina'))).toEqual([])
    expect(needHelpFirst(learnerResults(LEARNERS, []))).toEqual([])
  })
})

describe('the questions the class missed most', () => {
  const q = (prompt: string, why?: string, rightWay?: string) => ({ prompt, answer: 'x', ...(why ? { why } : {}), ...(rightWay ? { rightWay } : {}) })
  const item = (childId: string, question: unknown, correct: boolean, answer: string): ItemRow => ({ sessionId: `${childId}-s`, childId, correct, answer, question })
  const A = q('Solve: 3x + 5 = 20', 'The 5 is moved across without changing its sign.', 'Subtract 5 from both sides, then divide by 3.')
  const B = q('Solve: x/2 - 3 = 4', 'Only one side was changed.', 'Add 3 to both sides, then multiply by 2.')
  const C = q('Solve: 5(x - 2) = 15')
  const ITEMS: ItemRow[] = [
    item('c1', A, false, 'x = 4'),
    item('c2', A, false, 'x = 4'),
    item('c3', A, false, 'x = 6'),
    item('c4', A, true, 'x = 5'),
    item('c1', B, false, 'x = 10'),
    item('c1', B, false, 'x = 10'),
    item('c2', B, true, 'x = 14'),
    item('c1', C, true, 'x = 5'),
    item('c2', C, true, 'x = 5'),
  ]

  it('orders by how many learners missed it, with the AI notes and how many tried', () => {
    const list = mostMissed(ITEMS)
    expect(list.map((m) => [m.prompt, m.missedBy, m.triedBy])).toEqual([
      ['Solve: 3x + 5 = 20', 3, 4],
      ['Solve: x/2 - 3 = 4', 1, 2],
    ])
    expect(list[0]).toMatchObject({ why: 'The 5 is moved across without changing its sign.', rightWay: 'Subtract 5 from both sides, then divide by 3.', commonWrong: { answer: 'x = 4', count: 2 } })
  })

  it('never lists a question nobody got wrong, and counts a learner once however many times they missed it', () => {
    const list = mostMissed(ITEMS)
    expect(list.some((m) => m.prompt === C.prompt)).toBe(false)
    expect(list[1]!.missedBy).toBe(1)
  })

  it('keeps the first few and reads a stored question that has no notes', () => {
    expect(mostMissed(ITEMS, 1)).toHaveLength(1)
    expect(mostMissed([item('c1', { prompt: 'No notes here' }, false, '')])).toEqual([{ prompt: 'No notes here', missedBy: 1, triedBy: 1, why: null, rightWay: null, commonWrong: null }])
    expect(mostMissed([item('c1', 'not a question', false, 'x'), item('c1', null, false, 'x')])).toEqual([])
  })
})

describe('typesetting by grade', () => {
  it('typesets every line for Grades 8 to 12 and leaves the primary grades as they were', () => {
    expect(typesetFor(8)).toBe('all')
    expect(typesetFor(12)).toBe('all')
    expect(typesetFor(7)).toBeUndefined()
    expect(typesetFor(6)).toBeUndefined()
  })
})

// ---- The three screens ---------------------------------------------------------------------------------------------------------------
const CLASS = (grade = 11) => ({ id: 'cl1', name: 'Grade 11A Mathematics', grade, subject: 'Mathematics', source: { caps: true, grade }, topics: TOPICS, learners: LEARNERS, sessions: SESSIONS })
const words = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

describe('screen 1: the parts', () => {
  it('shows each part with its class average and how many learners practised, linked to the part', async () => {
    state.cls = CLASS()
    const html = renderToStaticMarkup(await TopicsPage({ params: Promise.resolve({ classId: 'cl1' }) }))
    const text = words(html)
    expect(text).toContain('Mathematics')
    expect(text).toContain('Algebra')
    expect(text).toContain('60%')
    expect(text).toContain('3 of 4 learners practised')
    expect(text).toContain('No one has practised yet')
    expect(html).toContain('href="/t/cl1/topics/algebra"')
    expect(html).toContain('href="/t/cl1"')
  })

  it('says so, with a link to the curriculum, when the class has no topics', async () => {
    state.cls = { ...CLASS(), topics: [] }
    const html = renderToStaticMarkup(await TopicsPage({ params: Promise.resolve({ classId: 'cl1' }) }))
    expect(words(html)).toContain('This class has no topics yet.')
    expect(html).toContain('href="/t/cl1/curriculum"')
  })

  it('is not found for a class the teacher cannot see', async () => {
    state.cls = null
    await expect(TopicsPage({ params: Promise.resolve({ classId: 'nope' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

describe('screen 2: the topics of a part', () => {
  it('lists the topics under their terms with the class average and a link to each', async () => {
    state.cls = CLASS()
    const html = renderToStaticMarkup(await TopicsPartPage({ params: Promise.resolve({ classId: 'cl1', family: 'trigonometry' }) }))
    const text = words(html)
    expect(text).toContain('Term 2')
    expect(text).toContain('Term 3')
    // The second teaching is told apart by its term, not by the "(Term 3)" in its name.
    expect(text).not.toContain('(Term 3)')
    expect(html).toContain('href="/t/cl1/topics/trigonometry/t-trig3"')
    const algebra = words(renderToStaticMarkup(await TopicsPartPage({ params: Promise.resolve({ classId: 'cl1', family: 'algebra' }) })))
    expect(algebra).toContain('Equations and inequalities')
    expect(algebra).toContain('3 of 4 learners practised')
  })

  it('is not found for a part the class does not have', async () => {
    state.cls = CLASS()
    await expect(TopicsPartPage({ params: Promise.resolve({ classId: 'cl1', family: 'calculus' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

describe('screen 3: one topic', () => {
  const PROMPT = 'x^2 − 5x + 6 = 0'
  const ROOTS = 'x = 2 or x = 3'
  const render = async (topicId = 't-eq') => renderToStaticMarkup(await TopicDetailPage({ params: Promise.resolve({ classId: 'cl1', family: 'algebra', topicId }) }))

  it('lists every learner with the last result and "not tried", and the AI analysis made from the stored notes', async () => {
    state.cls = CLASS()
    state.items = [
      { sessionId: 's1', childId: 'c2', correct: false, answer: 'x = 2', question: { prompt: PROMPT, answer: ROOTS, why: 'Only one root was found.', rightWay: 'Factorise: (x − 2)(x − 3) = 0.' } },
      { sessionId: 's2', childId: 'c3', correct: false, answer: 'x = 2', question: { prompt: PROMPT, answer: ROOTS, why: 'Only one root was found.', rightWay: 'Factorise: (x − 2)(x − 3) = 0.' } },
      { sessionId: 's3', childId: 'c1', correct: true, answer: ROOTS, question: { prompt: PROMPT, answer: ROOTS } },
    ]
    const html = await render()
    const text = words(html)
    for (const name of ['Amina', 'Ben', 'Chipo', 'Dumisani']) expect(text).toContain(name)
    expect(text).toContain('Not tried')
    expect(text).toContain('4 of 5 right')
    expect(text).toContain('2 tries')
    expect(text).toContain('AI analysis')
    expect(text).toContain('Missed by 2 of 3 learners who tried it')
    expect(text).toContain('Only one root was found.')
    expect(text).toContain('Who needs help first')
    expect(html).toContain('href="/t/cl1/learners/c3"')
    expect(html).toContain('href="/t/cl1/topics/algebra"')
  })

  it('draws the prompt typeset for a Grade 11 class, and a primary class the way it always was', async () => {
    state.cls = CLASS(11)
    state.items = [{ sessionId: 's1', childId: 'c2', correct: false, answer: 'x = 2', question: { prompt: PROMPT, answer: ROOTS } }]
    const html = await render()
    expect(html).toContain('class="katex"')
    // A line of plain numbers: typeset in Grade 11, drawn the way it always was in Grade 6.
    state.items = [{ sessionId: 's1', childId: 'c2', correct: false, answer: '18', question: { prompt: '12 + 7', answer: '19' } }]
    expect(await render()).toContain('class="katex"')
    state.cls = CLASS(6)
    expect(await render()).not.toContain('class="katex"')
  })

  it('has a topic nobody practised: every learner not tried and nothing to analyse', async () => {
    state.items = []
    state.cls = { ...CLASS(), topics: [...TOPICS.slice(0, 2), t('t-x', 'Factorising', 'algebra', 1, 3)] }
    const quiet = words(await render('t-x'))
    expect(quiet).toContain('No one has practised this topic yet')
    expect(quiet.match(/Not tried/g)).toHaveLength(4)
  })

  it('is not found for a topic that is not in the part', async () => {
    state.cls = CLASS()
    await expect(render('t-fun')).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('has the token card at the top of screen 1 and screen 3 (P137b filled the spots P139 marked)', () => {
    for (const file of ['app/t/[classId]/topics/page.tsx', 'app/t/[classId]/topics/[family]/[topicId]/page.tsx']) {
      const source = readFileSync(resolve(webRoot, file), 'utf8')
      expect(source.match(/<AiTokens /g), file).toHaveLength(1)
      expect(source, file).not.toContain('P137 token card')
    }
  })
})

// ---- The practice history of a made-up learner ---------------------------------------------------------------------------------------
describe('the practice a made-up learner has done', () => {
  const NOW = new Date('2026-11-16T10:00:00Z')
  const CHILDREN = ['00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000c', '00000000-0000-4000-8000-00000000000d', '00000000-0000-4000-8000-00000000000e', '00000000-0000-4000-8000-00000000000f']
  const MAP = [
    { id: 'topic-exp', name: 'Exponents and surds' },
    { id: 'topic-eq', name: 'Equations and inequalities' },
    { id: 'topic-fun', name: 'Functions' },
  ]
  const built = buildMadeUpPractice({ childIds: CHILDREN, topics: MAP, now: NOW })

  it('is the same every time for the same learners', () => {
    expect(buildMadeUpPractice({ childIds: CHILDREN, topics: MAP, now: NOW })).toEqual(built)
    expect(idFrom('a')).toBe(idFrom('a'))
    expect(idFrom('a')).not.toBe(idFrom('b'))
    expect(idFrom('a')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('practises only the topic a fixture fits, with finished sessions of five Try answers each', () => {
    expect(built.sessions.length).toBeGreaterThan(5)
    for (const x of built.sessions) {
      expect(x.topic_id).toBe('topic-eq')
      expect(x.topic_name).toBe('Equations and inequalities')
      expect(x.status).toBe('done')
      expect(x.question_count).toBe(5)
      const mine = built.items.filter((i) => i.session_id === x.id)
      expect(mine).toHaveLength(5)
      expect(mine.map((i) => i.position)).toEqual([0, 1, 2, 3, 4])
      expect(mine.every((i) => i.phase === 'try')).toBe(true)
      // The score on the session is the number of right answers on its items.
      expect(x.right).toBe(mine.filter((i) => i.correct).length)
    }
    expect(new Set(built.sessions.map((x) => x.id)).size).toBe(built.sessions.length)
  })

  it('uses the real AI-written questions, with their notes, and a right answer for a right item', () => {
    const fixture = PRACTICE_FIXTURES[0]!
    const prompts = new Map(fixture.content.questions.map((q) => [q.prompt, q]))
    expect(fixture.content.questions).toHaveLength(15)
    for (const i of built.items) {
      const q = i.question as { prompt: string; answer: string; why: string; rightWay: string }
      expect(prompts.has(q.prompt)).toBe(true)
      expect(typeof q.why).toBe('string')
      expect(typeof q.rightWay).toBe('string')
      if (i.correct) expect(i.answer).toBe(q.answer)
      else expect(i.answer).not.toBe(q.answer)
    }
    expect(JSON.stringify(fixture)).not.toContain('e51f2370')
    expect(readFileSync(resolve(webRoot, '../../supabase/seed/fixtures/lesson-eq11.json'), 'utf8')).not.toContain('"id"')
  })

  it('varies the scores: some learners strong, some weak, and one learner has not tried', () => {
    const last = new Map<string, number>()
    for (const x of [...built.sessions].sort((a, b) => a.finished_at.localeCompare(b.finished_at))) last.set(x.child_id, x.right)
    const scores = [...last.values()]
    expect(Math.max(...scores)).toBeGreaterThanOrEqual(4)
    expect(Math.min(...scores)).toBeLessThanOrEqual(2)
    expect(new Set(built.sessions.map((x) => x.child_id)).size).toBe(CHILDREN.length - 1)
    expect(new Set(built.sessions.map((x) => x.child_id)).has(CHILDREN[2]!)).toBe(false)
  })

  it('dates the sessions over the last two weeks and never inside the last 36 hours, so the class home is not read as "last night"', () => {
    for (const x of built.sessions) {
      const age = NOW.getTime() - new Date(x.finished_at).getTime()
      expect(age).toBeGreaterThan(48 * 3600_000)
      expect(age).toBeLessThan(14 * 86_400_000)
      expect(new Date(x.created_at).getTime()).toBeLessThan(new Date(x.finished_at).getTime())
      expect(x.planned_for).toBe(x.finished_at.slice(0, 10))
    }
  })

  it('has the class miss the same questions: the analysis has something to say', () => {
    const items: ItemRow[] = built.items.map((i) => ({ sessionId: i.session_id, childId: built.sessions.find((x) => x.id === i.session_id)!.child_id, correct: i.correct, answer: i.answer, question: i.question }))
    const missed = mostMissed(items)
    expect(missed.length).toBeGreaterThan(0)
    expect(missed[0]!.missedBy).toBeGreaterThanOrEqual(2)
    expect(missed[0]!.why).toBeTruthy()
    expect(missed[0]!.rightWay).toBeTruthy()
  })

  it('gives nothing for a class with no learner or no topic a fixture fits, and finds the fixture by name', () => {
    expect(buildMadeUpPractice({ childIds: [], topics: MAP, now: NOW })).toEqual({ sessions: [], items: [] })
    expect(buildMadeUpPractice({ childIds: CHILDREN, topics: [{ id: 'x', name: 'Calculus' }], now: NOW })).toEqual({ sessions: [], items: [] })
    expect(fixtureFor('Equations and inequalities (Term 3)')).toBe(PRACTICE_FIXTURES[0])
    expect(fixtureFor('equations and inequalities ')).toBe(PRACTICE_FIXTURES[0])
    expect(fixtureFor('Functions')).toBeNull()
  })

  it('makes a wrong answer that is never the right one', () => {
    for (const q of PRACTICE_FIXTURES[0]!.content.questions) {
      for (const variant of [false, true]) {
        const wrong = wrongAnswer(q, variant)
        expect(wrong, `${q.prompt} ${variant}`).not.toBe(q.answer.trim())
        expect(wrong.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('the files of P139', () => {
  it('has no em dash', () => {
    for (const file of ['app/t/[classId]/topics/logic.ts', 'app/t/[classId]/topics/parts.tsx', 'app/t/[classId]/topics/data.ts', 'app/t/[classId]/TopicsEntry.tsx', '../../supabase/seed/made-up-practice.ts']) {
      expect(readFileSync(resolve(webRoot, file), 'utf8').includes(String.fromCharCode(0x2014)), file).toBe(false)
    }
  })
})
