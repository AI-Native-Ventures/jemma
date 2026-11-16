import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Maths, MathsOnly, isMaths } from '../components/Maths'
import type { PaperDetail, ResultRow } from '../lib/data/p24'

// P136: a teacher or a parent reads a question, an answer and an explanation as real maths, as a learner does. react-dom only: no server, no database, no
// browser. The pages that read data are given their data by a mock; nothing here reaches the network.

const state = vi.hoisted(() => ({ grade: 10 as number | null, detail: null as unknown }))

vi.mock('@/lib/data/p20', () => ({ getQuestionDetail: async () => state.detail }))
vi.mock('@/lib/data/maths-grade', () => ({ getClassGrade: async () => state.grade, getChildGrade: async () => state.grade }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not found')
  },
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}))
vi.mock('@/app/t/[classId]/snap/actions', () => ({ resolveAnswer: async () => ({ ok: true }), confirmPaper: async () => ({ ok: true }) }))

import TeacherQuestionPage from '../app/t/[classId]/tests/[testId]/q/[n]/page'
import { FixCard } from '../app/t/[classId]/needs-you/[itemId]/FixCard'
import { PaperSheet, QuestionCrop } from '../app/p/[childId]/papers/_parts'

const html = (el: ReactElement) => renderToStaticMarkup(el)
/** The page as an eye sees it: the line a screen reader gets (sr-only) is the plain text and is taken out. */
const visible = (markup: string) => markup.replace(/<span class="sr-only">[^<]*<\/span>/g, '')
const typeset = (markup: string) => markup.includes('class="katex"') && markup.includes('data-typeset="true"')

const PROMPT = 'x^2 − 5x + 6 = 0'
const ANSWER = 'x = 2 or x = 3'

const questionDetail = (prompt: string, rightAnswer: string, wrote: string) => ({
  cls: { id: 'c1', name: 'Grade 10 Maths' },
  test: { id: 't1', title: 'Class Test 1: Algebra', shortTitle: 'Class Test 1' },
  n: 3,
  prompt,
  topic: 'Algebra',
  rightAnswer,
  marks: 2,
  total: 20,
  missed: [{ childId: 'k1', name: 'Amina', answer: wrote }],
  right: [{ childId: 'k2', name: 'Sipho', answer: rightAnswer }],
  summary: null,
  gap: null,
})

const row = (over: Partial<ResultRow>): ResultRow => ({
  id: 'r1',
  paperId: 'p1',
  n: 1,
  prompt: PROMPT,
  answer: 'x = 5',
  correct: false,
  topicName: 'Algebra',
  misconception: null,
  rightAnswer: ANSWER,
  ...over,
})

const paperOf = (grade: number, rows: ResultRow[]): PaperDetail =>
  ({
    child: { id: 'k1', firstName: 'Amina', grade, schoolName: 'Test School', subject: 'Mathematics', subjects: ['Mathematics'], teacherName: 'Ms Dlamini' },
    paperId: 'p1',
    title: 'Class Test 1: Algebra',
    shortTitle: 'Class Test 1',
    total: 3,
    outOf: 5,
    dayLabel: 'Mon 16 Nov',
    snappedAt: '10:00',
    markedAt: '10:05',
    sections: [{ heading: '', rows }],
    missed: rows.filter((r) => !r.correct),
    slipLine: null,
    topGap: null,
    photoUrls: [],
  }) as unknown as PaperDetail

beforeEach(() => {
  state.grade = 10
})

describe('Maths (the one place a teacher or a parent screen draws a line of maths)', () => {
  it('draws a power raised and a sum typeset, never a caret', () => {
    const out = html(<Maths text={PROMPT} grade={10} />)
    expect(typeset(out)).toBe(true)
    expect(visible(out)).not.toContain('^2')
    expect(visible(out)).not.toContain('^')
  })

  it('draws an answer of two roots typeset and keeps the word between them', () => {
    const out = html(<Maths text={ANSWER} grade={10} />)
    expect(typeset(out)).toBe(true)
    expect(visible(out)).toContain(' or ')
  })

  it('draws a fraction of x stacked', () => {
    const out = html(<Maths text="(x + 1)/2" />)
    expect(typeset(out)).toBe(true)
    expect(out).toContain('mfrac')
  })

  it('hands the plain text to a screen reader', () => {
    expect(html(<Maths text={PROMPT} />)).toContain(`<span class="sr-only">${PROMPT}</span>`)
  })

  it('gives plain words back as plain words, so a clamped row keeps clamping', () => {
    expect(html(<Maths text="Class gap on fractions" />)).toBe('Class gap on fractions')
    expect(html(<Maths text="12" grade={9} />)).toBe('12')
  })

  it('draws a primary prompt with its fraction drawing, not KaTeX', () => {
    for (const grade of [null, 4, 6, 7]) {
      const out = html(<Maths text="3/4 of 12" grade={grade} />)
      expect(out).not.toContain('class="katex"')
      expect(out).toContain('inline-flex flex-col')
      expect(visible(out)).toContain('of 12')
    }
  })

  it('types a sum of numbers from Grade 8 and leaves it as words below', () => {
    expect(typeset(html(<Maths text="12 + 7 = 19" grade={9} />))).toBe(true)
    expect(typeset(html(<Maths text="12 + 7 = 19" grade={6} />))).toBe(false)
    expect(isMaths('12 + 7', 9)).toBe(true)
    expect(isMaths('12 + 7', 5)).toBe(false)
    expect(isMaths('x^2', null)).toBe(true)
  })
})

describe('MathsOnly (the rows pinned around one unbroken line)', () => {
  it('hands a sum of numbers back as the plain text it was', () => {
    const sum = 'What is 2 3/4 + 1 2/3 = 12'
    expect(html(<MathsOnly text={sum} />)).toBe(sum)
  })

  it('typesets a line with a power in it', () => {
    expect(typeset(html(<MathsOnly text="x^2 = 9" />))).toBe(true)
  })
})

describe('the teacher question page', () => {
  it('shows a Grade 10 question, its right answer and the learners answers as maths', async () => {
    state.detail = questionDetail(PROMPT, ANSWER, 'x = 5')
    const out = html(await TeacherQuestionPage({ params: Promise.resolve({ classId: 'c1', testId: 't1', n: '3' }) }))
    expect(typeset(out)).toBe(true)
    expect(visible(out)).not.toContain('^2')
    expect(visible(out)).not.toContain('^')
    // The question, the right answer chip, the line under it and the two learners answers are each drawn by KaTeX.
    expect((out.match(/data-typeset="true"/g) ?? []).length).toBeGreaterThanOrEqual(5)
  })

  it('keeps the board drawing of a primary sum: stacked fractions, no KaTeX', async () => {
    state.grade = 4
    state.detail = questionDetail('3/4 + 1/4', '1', '4/8')
    const out = html(await TeacherQuestionPage({ params: Promise.resolve({ classId: 'c1', testId: 't1', n: '3' }) }))
    expect(out).not.toContain('class="katex"')
    expect(out).toContain('border-t-[3px]')
  })

  it('does not break when the grade is not known', async () => {
    state.grade = null
    state.detail = questionDetail(PROMPT, ANSWER, 'x = 5')
    const out = html(await TeacherQuestionPage({ params: Promise.resolve({ classId: 'c1', testId: 't1', n: '3' }) }))
    expect(typeset(out)).toBe(true)
  })
})

describe('the teacher fix card', () => {
  it('shows the two answers it offers as maths', () => {
    const out = html(<FixCard classId="c1" itemId="i1" n={2} original="x = 5" keyAnswer={ANSWER} current={null} marks={1} grade={10} />)
    expect(typeset(out)).toBe(true)
    expect(visible(out)).toContain(' or ')
  })
})

describe('the parent paper and the missed-question crop', () => {
  it('draws the questions and the answers of a Grade 10 paper as maths', () => {
    const out = html(<PaperSheet paper={paperOf(10, [row({}), row({ id: 'r2', n: 2, prompt: '(x + 1)/2', answer: '4', rightAnswer: '3' })])} />)
    expect(typeset(out)).toBe(true)
    expect(visible(out)).not.toContain('^2')
    expect(out).toContain('mfrac')
    // The right answer in the coral pill is drawn too, with its word kept.
    expect(visible(out)).toContain(' or ')
  })

  it('draws a primary paper as it was: no KaTeX, the sum is still a line of words', () => {
    const out = html(<PaperSheet paper={paperOf(4, [row({ prompt: '3 + 4', answer: '7', rightAnswer: null, correct: true })])} />)
    expect(out).not.toContain('class="katex"')
    expect(visible(out)).toContain('3 + 4 =')
  })

  it('draws a primary fraction on the cut-out as before, and algebra as maths', () => {
    const primary = html(<QuestionCrop row={row({ prompt: '1/2 + 1/4', answer: '3/4', rightAnswer: '3/4' })} grade={4} />)
    expect(primary).not.toContain('class="katex"')
    expect(primary).toContain('border-top:1.5px solid #2A2A2A')
    const senior = html(<QuestionCrop row={row({})} grade={10} />)
    expect(typeset(senior)).toBe(true)
    expect(visible(senior)).not.toContain('^2')
  })
})
