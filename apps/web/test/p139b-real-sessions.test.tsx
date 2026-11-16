// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// P139b: a practice a learner really did has no size in its row (`question_count` is null: only the planner sets it), and the teacher's Topics screens
// used to drop it ("Not tried"). The size and the score now come from the session's Try answers. The pure rule is tested on its own, and the whole
// path (the loader with a stand-in database, then the three screens) is tested with a real-shaped row: question_count null, five Try answers, four right.
// No server, no browser, no database.

type Row = Record<string, unknown>
const db = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, itemQueries: [] as string[][] }))

/**
 * A stand-in for the teacher's Supabase client: a query on a table gives the rows of the fixture, narrowed by `eq` and `in` on the columns the rows have
 * (a column the fixture rows do not carry is not filtered on). `then` gives the rows, `maybeSingle` the first one.
 */
function from(table: string) {
  let rows: Row[] = db.tables[table] ?? []
  const q = {
    select: () => q,
    order: () => q,
    limit: () => q,
    eq: (col: string, val: unknown) => ((rows = rows.filter((r) => !(col in r) || r[col] === val)), q),
    in: (col: string, ids: unknown[]) => {
      if (table === 'session_items') db.itemQueries.push(ids as string[])
      rows = rows.filter((r) => !(col in r) || ids.includes(r[col]))
      return q
    },
    maybeSingle: async () => ({ data: rows[0] ?? null }),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve({ data: rows }).then(resolve, reject),
  }
  return q
}
vi.mock('../lib/supabase/server', () => ({ createSupabaseServer: async () => ({ from }) }))
vi.mock('../components/AiTokens', () => ({ AiTokens: () => null }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))

import { loadTopicsClass } from '../app/t/[classId]/topics/data'
import { learnerResults, mostMissed, needHelpFirst, needsTries, partLines, percentOf, sessionsByTopic, tally, withSizes, type RawSession } from '../app/t/[classId]/topics/logic'
import TopicsPage from '../app/t/[classId]/topics/page'
import TopicDetailPage from '../app/t/[classId]/topics/[family]/[topicId]/page'

const raw = (over: Partial<RawSession> = {}): RawSession => ({ id: 's', childId: 'c', topicId: 't', topicName: 'T', right: 4, questionCount: null, finishedAt: '2026-11-16T17:50:00Z', ...over })
const tries = (sessionId: string, correct: boolean[]) => correct.map((c) => ({ sessionId, correct: c }))

describe('the size and the score of a session', () => {
  it('reads a real practice (question_count null, five Try answers, four right) as 4 of 5, 80 percent', () => {
    const [s] = withSizes([raw({ id: 's-real' })], tries('s-real', [true, true, true, true, false]))
    expect(s).toMatchObject({ right: 4, asked: 5 })
    expect(percentOf({ right: s!.right!, asked: s!.asked! })).toBe(80)
    expect(tally([s!])).toEqual({ right: 4, asked: 5, learners: 1, sessions: 1 })
  })

  it('counts the right Try answers when the row has no score either', () => {
    const [s] = withSizes([raw({ id: 'a', right: null })], tries('a', [true, false, true]))
    expect(s).toMatchObject({ right: 2, asked: 3 })
  })

  it('leaves out a finished session with no Try answers and no size, from every number', () => {
    const [s] = withSizes([raw({ id: 'e', right: 3 })], [])
    expect(s).toMatchObject({ right: 3, asked: null })
    expect(tally([s!])).toEqual({ right: 0, asked: 0, learners: 0, sessions: 0 })
    expect(learnerResults([{ id: 'c', name: 'Baraka' }], [s!])[0]).toMatchObject({ tries: 0, last: null })
    const [none] = withSizes([raw({ id: 'n', right: null })], [])
    expect(none).toMatchObject({ right: null, asked: null })
  })

  it('takes a row that has its size and score as it is, whatever its answers say (the made-up practice, the planner count)', () => {
    const [s] = withSizes([raw({ id: 'm', right: 2, questionCount: 5 })], tries('m', [true, true, true]))
    expect(s).toMatchObject({ right: 2, asked: 5 })
    // A size of zero is no size.
    const [z] = withSizes([raw({ id: 'z', right: 4, questionCount: 0 })], tries('z', [true, true, true, true, false]))
    expect(z).toMatchObject({ right: 4, asked: 5 })
  })

  it('only counts the Try answers of the session they belong to', () => {
    const list = withSizes([raw({ id: 'x' }), raw({ id: 'y', right: 1 })], [...tries('x', [true, false]), ...tries('y', [false, false, true]), ...tries('other', [true])])
    expect(list.map((s) => [s.id, s.right, s.asked])).toEqual([['x', 4, 2], ['y', 1, 3]])
  })

  it('says which sessions need their Try answers read: those with no size or no score in the row', () => {
    expect(needsTries(raw())).toBe(true)
    expect(needsTries(raw({ right: null, questionCount: 5 }))).toBe(true)
    expect(needsTries(raw({ questionCount: 0 }))).toBe(true)
    expect(needsTries(raw({ right: 2, questionCount: 5 }))).toBe(false)
  })
})

// ---- A real class: the loader and the screens ---------------------------------------------------------------------------------------
const P1 = 'x^2 - 5x + 6 = 0'
const q = (prompt: string) => ({ prompt, answer: 'x = 2 or x = 3', why: `why ${prompt}`, rightWay: `right way ${prompt}` })
const item = (session_id: string, position: number, prompt: string, correct: boolean, phase = 'try') => ({ session_id, position, phase, question: q(prompt), answer: correct ? 'x = 2 or x = 3' : 'x = 2', correct })
const session = (id: string, child_id: string, over: Row) => ({ id, child_id, status: 'done', topic_id: 't-eq', topic_name: 'Equations and inequalities', lesson_id: 'l1', finished_at: '2026-11-16T17:50:00Z', ...over })

beforeEach(() => {
  db.itemQueries = []
  db.tables = {
    classes: [{ id: 'cl1', name: 'Grade 11 Mathematics', grade: 11, subject: 'Mathematics' }],
    curriculum_maps: [{ id: 'm1', class_id: 'cl1', status: 'approved', draft: { source: { kind: 'caps' } } }],
    topics: [
      { id: 't-exp', map_id: 'm1', name: 'Exponents and surds', family: 'algebra', term: 1, position: 1 },
      { id: 't-eq', map_id: 'm1', name: 'Equations and inequalities', family: 'algebra', term: 1, position: 2 },
    ],
    enrolments: ['Baraka', 'Neema', 'Amani', 'Zuri'].map((first_name, i) => ({ class_id: 'cl1', child_id: `c${i + 1}`, children: { first_name } })),
    sessions: [
      // Baraka's real practice: no size in the row, a score of 4.
      session('s-real', 'c1', { right: 4, question_count: null }),
      // Neema's made-up practice: the row has its size.
      session('s-made', 'c2', { right: 2, question_count: 5, lesson_id: null, finished_at: '2026-11-10T13:00:00Z' }),
      // Amani finished a session with no Try answers at all.
      session('s-empty', 'c3', { right: 3, question_count: null }),
      // Zuri's real practice has neither a size nor a score in its row.
      session('s-bare', 'c4', { right: null, question_count: null }),
    ],
    session_items: [
      item('s-real', 0, P1, false),
      ...['Solve: A', 'Solve: B', 'Solve: C', 'Solve: D'].map((p, i) => item('s-real', i + 1, p, true)),
      // The warm-up never counts.
      item('s-real', 0, 'WARMUP', false, 'warmup'),
      item('s-real', 1, 'WARMUP TWO', false, 'warmup'),
      item('s-made', 0, P1, false),
      item('s-made', 1, 'Solve: A', false),
      item('s-made', 2, 'Solve: B', true),
      item('s-made', 3, 'Solve: C', false),
      item('s-made', 4, 'Solve: D', true),
      item('s-bare', 0, P1, false),
      item('s-bare', 1, 'Solve: A', true),
      item('s-bare', 2, 'Solve: B', true),
    ],
  }
})

describe('the loader', () => {
  it('sizes a real practice from its Try answers and asks only for the sessions whose row has no size or no score', async () => {
    const c = await loadTopicsClass('cl1')
    const by = new Map(c!.sessions.map((s) => [s.id, s]))
    expect(by.get('s-real')).toMatchObject({ right: 4, asked: 5 })
    expect(by.get('s-made')).toMatchObject({ right: 2, asked: 5 })
    expect(by.get('s-empty')).toMatchObject({ right: 3, asked: null })
    expect(by.get('s-bare')).toMatchObject({ right: 2, asked: 3 })
    expect(db.itemQueries).toHaveLength(1)
    expect([...db.itemQueries[0]!].sort()).toEqual(['s-bare', 's-empty', 's-real'])
  })

  it('asks for no Try answers when every row has its size and score', async () => {
    db.tables.sessions = [session('s-made', 'c2', { right: 2, question_count: 5 })]
    const c = await loadTopicsClass('cl1')
    expect(c!.sessions).toHaveLength(1)
    expect(db.itemQueries).toHaveLength(0)
  })

  it('gives the topic its class average, tries and learners with the real practice in it', async () => {
    const c = (await loadTopicsClass('cl1'))!
    const lines = partLines(c.subject, c.topics, c.sessions)
    // 4 + 2 + 2 right out of 5 + 5 + 3 asked, three learners (Amani's empty session is left out).
    expect(lines[0]).toMatchObject({ family: 'algebra', percent: 62, tally: { right: 8, asked: 13, learners: 3, sessions: 3 } })
    const results = learnerResults(c.learners, sessionsByTopic(c.topics, c.sessions).get('t-eq')!)
    expect(results.map((r) => [r.name, r.tries, r.last?.percent ?? null])).toEqual([['Amani', 0, null], ['Baraka', 1, 80], ['Neema', 1, 40], ['Zuri', 1, 67]])
    expect(needHelpFirst(results).map((r) => r.name)).toEqual(['Neema', 'Zuri'])
  })
})

describe('the screens with a real practice', () => {
  const words = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

  it('screen 1 counts the real practice in the average and in the learners who practised', async () => {
    const text = words(renderToStaticMarkup(await TopicsPage({ params: Promise.resolve({ classId: 'cl1' }) })))
    expect(text).toContain('62%')
    expect(text).toContain('3 of 4 learners practised')
  })

  it('screen 3 shows the real learner with 80 percent, 4 of 5 right and one try, not "Not tried"', async () => {
    const html = renderToStaticMarkup(await TopicDetailPage({ params: Promise.resolve({ classId: 'cl1', family: 'algebra', topicId: 't-eq' }) }))
    const text = words(html)
    expect(text).toMatch(/Baraka\s*80%/)
    expect(text).toContain('4 of 5 right')
    expect(text).toContain('1 try')
    // Only Amani, whose session has no answers, is not tried.
    expect(text.match(/Not tried/g)).toHaveLength(1)
    expect(text).toMatch(/Amani\s*Not tried/)
    expect(text).toContain('62%')
    expect(text).toContain('3 of 4')
    // Who needs help first, and the question the class missed most with the AI's own notes. The warm-up is nowhere.
    expect(text).toContain('Who needs help first')
    expect(text).toContain('Missed by 3 of 3 learners who tried it')
    expect(text).toContain(`why ${P1}`)
    expect(text).toContain(`right way ${P1}`)
    expect(text).not.toContain('WARMUP')
  })

  it('has the most missed question count the real practice: three learners got it wrong', async () => {
    const c = (await loadTopicsClass('cl1'))!
    const sessions = sessionsByTopic(c.topics, c.sessions).get('t-eq')!
    const items = (db.tables.session_items as Row[])
      .filter((r) => r.phase === 'try' && sessions.some((s) => s.id === r.session_id))
      .map((r) => ({ sessionId: r.session_id as string, childId: sessions.find((s) => s.id === r.session_id)!.childId, correct: r.correct as boolean, answer: r.answer as string, question: r.question }))
    const [first] = mostMissed(items)
    expect(first).toMatchObject({ prompt: P1, missedBy: 3, triedBy: 3 })
  })
})
