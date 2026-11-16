import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { capsDraft } from '@jemma/profiling/caps'
import { StoredLessonSchema } from '@jemma/profiling/schemas'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isPublicPath } from '../lib/public-paths'
import { TOUR_CLASS } from '../app/tour/data/class'
import { TOUR_LESSON, TOUR_QUESTIONS, tourQuestionsForChild } from '../app/tour/data/lesson'
import { TOUR_PARTS, findPart, findTopic } from '../app/tour/data/topics'
import { DEFAULT_YOU, markTourAnswer, readTourResult, reviewTour, saveTourResult, savedTourResult, tourScore, TOUR_RESULT_KEY } from '../app/tour/outcome'
import { TourSession } from '../app/tour/TourSession'
import TourHome from '../app/tour/page'
import TourPartPage from '../app/tour/[part]/page'
import TourLessonPage from '../app/tour/[part]/[topic]/page'
import TourTeacherHome from '../app/tour/teacher/page'
import TourTeacherPartPage from '../app/tour/teacher/[part]/page'
import TourTeacherTopicPage from '../app/tour/teacher/[part]/[topic]/page'

// P138: the backup tour at /tour. It needs no sign-in, no database and no AI call: a saved Grade 11 lesson, the learner's way through it (read, answer
// Question 1, skip the rest) and the teacher's view of a made-up class. These tests read files and render components: no database, no server, no model.

// The maths editor is not started in these tests: the answer box is the plain one the learner gets when the editor cannot start.
vi.mock('mathlive', () => {
  throw new Error('no editor in this test')
})

// jsdom does not scroll: the screens scroll to their top when they change.
window.scrollTo = vi.fn()

const webRoot = resolve(import.meta.dirname, '..')
const Q1 = 'Solve: x^2 − 5x + 6 = 0'

describe('the saved lesson', () => {
  it('is the real lesson, without its database id, and Question 1 is the quadratic', () => {
    const file = JSON.parse(readFileSync(join(webRoot, 'app/tour/data/lesson.json'), 'utf8')) as Record<string, unknown>
    expect(Object.keys(file).sort()).toEqual(['content', 'format', 'topic_name'])
    expect(file.topic_name).toBe('Equations and inequalities')
    expect(TOUR_LESSON.questions).toHaveLength(15)
    expect(TOUR_LESSON.questions.map((q) => q.prompt)).toContain(Q1)
    expect(TOUR_LESSON.diagram?.steps.length).toBeGreaterThan(0)
  })

  it('is a lesson the app itself reads', () => {
    expect(StoredLessonSchema.safeParse(TOUR_LESSON).success).toBe(true)
  })

  it('has five tour questions: the quadratic first, then an equation, a whole number, a choice and a point', () => {
    expect(TOUR_QUESTIONS).toHaveLength(5)
    expect(TOUR_QUESTIONS[0]!.prompt).toBe(Q1)
    expect(TOUR_QUESTIONS[0]!.answer).toBe('x = 2 or x = 3')
    expect(TOUR_QUESTIONS.map((q) => q.answerKind)).toEqual(['equation', 'equation', 'whole', 'choice', 'point'])
    for (const q of TOUR_QUESTIONS) expect(q.steps?.length, q.prompt).toBeGreaterThanOrEqual(2)
  })

  it('P146: Question 1 is told it has two answers (and the letter x), the other equation has one, and no value is sent', () => {
    const [q1, q2, ...rest] = tourQuestionsForChild()
    expect(q1).toMatchObject({ answerKind: 'equation', answerCount: 2, answerLetter: 'x' })
    expect(q2).toMatchObject({ answerKind: 'equation', answerCount: 1, answerLetter: 'x' })
    for (const q of rest) expect(q).not.toHaveProperty('answerCount')
    expect(JSON.stringify(q1)).not.toMatch(/x = 2|x = 3/)
  })

  it('hands the screen questions with no answer in them', () => {
    for (const q of tourQuestionsForChild()) {
      expect(q).not.toHaveProperty('answer')
      expect(q).not.toHaveProperty('why')
      expect(q).not.toHaveProperty('rightWay')
      expect(q.phase).toBe('try')
      expect(q.of).toBe(5)
    }
  })
})

describe('the Grade 11 topics', () => {
  it('has Algebra, with Equations and inequalities inside it', () => {
    const algebra = findPart('algebra')
    expect(algebra?.label).toBe('Algebra')
    expect(algebra?.topics.map((t) => t.name)).toEqual(['Exponents and surds', 'Equations and inequalities', 'Number patterns'])
    expect(findTopic('algebra', 'equations')?.name).toBe('Equations and inequalities')
  })

  it('lists the parts in the owner order', () => {
    expect(TOUR_PARTS.map((p) => p.label)).toEqual([
      'Algebra',
      'Functions',
      'Finance, growth and decay',
      'Trigonometry',
      'Euclidean geometry',
      'Analytical geometry',
      'Measurement',
      'Statistics',
      'Probability',
    ])
  })

  it('names every topic of the CAPS map of Grade 11, as the app has it, and no other', () => {
    const caps = new Set((capsDraft(11)?.terms ?? []).flatMap((t) => t.topics.map((x) => x.name.toLowerCase())))
    const tour = TOUR_PARTS.flatMap((p) => p.topics.map((t) => t.name.toLowerCase()))
    expect(caps.size).toBeGreaterThan(8)
    expect(new Set(tour)).toEqual(caps)
  })
})

describe('the answer and the skips', () => {
  const q1 = TOUR_QUESTIONS[0]!

  it('marks "x = 3 or x = 2" right, in either order, and "x = 2" alone wrong', () => {
    expect(markTourAnswer(q1, 'x = 3 or x = 2')).toBe(true)
    expect(markTourAnswer(q1, 'x = 2 or x = 3')).toBe(true)
    expect(markTourAnswer(q1, 'x = 2')).toBe(false)
    expect(markTourAnswer(q1, 'x = 4 or x = 3')).toBe(false)
  })

  it('gives 1 of 5 when only Question 1 is answered right and the rest are skipped', () => {
    const review = reviewTour(TOUR_QUESTIONS, ['x = 3 or x = 2', null, null, null, null])
    expect(tourScore(review)).toEqual({ right: 1, total: 5 })
    expect(review.map((m) => m.correct)).toEqual([true, false, false, false, false])
    expect(review.map((m) => m.n)).toEqual([1, 2, 3, 4, 5])
  })

  it('counts every skip as wrong, even all five', () => {
    expect(tourScore(reviewTour(TOUR_QUESTIONS, [null, null, null, null, null]))).toEqual({ right: 0, total: 5 })
  })

  it('explains each skipped question with the right answer and its steps', () => {
    const review = reviewTour(TOUR_QUESTIONS, ['x = 3 or x = 2', null, null, null, null])
    for (const m of review.slice(1)) {
      expect(m.wrote).toBe('Skipped')
      expect(m.right).not.toBe('')
      expect(m.steps?.length).toBeGreaterThanOrEqual(2)
      expect(m.rightWay).not.toBe('')
    }
    // a choice question shows the choice, not its letter
    expect(review[3]!.right).toBe('−1 < x < 3')
    expect(review[4]!.right).toBe('(2; 4)')
  })

  it('keeps the learner result in the browser tab, and reads a default when there is none', () => {
    const store = new Map<string, string>()
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
    expect(readTourResult(storage)).toEqual(DEFAULT_YOU)
    expect(DEFAULT_YOU).toEqual([true, false, false, false, false])
    saveTourResult(storage, [true, true, false, false, false])
    expect(store.get(TOUR_RESULT_KEY)).toBe('[true,true,false,false,false]')
    expect(readTourResult(storage)).toEqual([true, true, false, false, false])
    store.set(TOUR_RESULT_KEY, 'not json')
    expect(readTourResult(storage)).toEqual(DEFAULT_YOU)
    store.set(TOUR_RESULT_KEY, '[true]')
    expect(readTourResult(storage)).toEqual(DEFAULT_YOU)
  })

  it('tells a lesson done in this tab from none: the saved result is null until the lesson has been finished', () => {
    const store = new Map<string, string>()
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
    expect(savedTourResult(storage)).toBeNull()
    saveTourResult(storage, [false, false, false, false, false])
    expect(savedTourResult(storage)).toEqual([false, false, false, false, false])
    store.set(TOUR_RESULT_KEY, '[true,"x",false,false,false]')
    expect(savedTourResult(storage)).toBeNull()
  })
})

describe('the way the learner goes through the tour', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    sessionStorage.clear()
  })
  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  const flush = async () => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
  }
  const skip = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    // the right answer is on the screen for a moment
    expect(screen.getByRole('status').textContent).toContain('Answer:')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })
  }

  it('reads the lesson, answers Question 1, skips the other four and ends on 1 of 5 with every skipped question explained', async () => {
    render(<TourSession />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Equations and inequalities')
    fireEvent.click(screen.getByRole('button', { name: /ready/i }))
    await flush()

    expect(screen.getByText('Question 1 of 5')).toBeTruthy()
    // P146: the quadratic has two answers, so it has two boxes (each with "x =" in front of it), and Next waits for both
    await flush()
    const next = () => screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement
    expect(screen.queryByLabelText('Your answer')).toBeNull()
    fireEvent.change(screen.getByLabelText('Answer 1'), { target: { value: '3' } })
    expect(next().disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Answer 2'), { target: { value: '2' } })
    expect(next().disabled).toBe(false)
    fireEvent.click(next())
    await flush()

    for (const n of [2, 3, 4, 5]) {
      expect(screen.getByText(`Question ${n} of 5`)).toBeTruthy()
      await skip()
    }

    const score = document.querySelector('[data-score]')
    expect(score?.textContent).toBe('You got 1 of 5 right.')
    expect(document.querySelectorAll('[data-verdict="right"]')).toHaveLength(1)
    const missed = document.querySelectorAll('[data-verdict="missed"]')
    expect(missed).toHaveLength(4)
    for (const card of Array.from(missed)) expect(card.querySelector('[data-steps]')).not.toBeNull()
    expect(JSON.parse(sessionStorage.getItem(TOUR_RESULT_KEY) ?? 'null')).toEqual([true, false, false, false, false])
    const toTeacher = screen.getByRole('link', { name: /teacher/i })
    expect(toTeacher.getAttribute('href')).toBe('/tour/teacher')
  })

  it('P146: Question 1 shows two boxes, Answer 1 and Answer 2, each with "x =" in front, and the line under them says one box for each', async () => {
    render(<TourSession />)
    fireEvent.click(screen.getByRole('button', { name: /ready/i }))
    await flush()
    expect(screen.getByText('Question 1 of 5')).toBeTruthy()
    expect(screen.getAllByRole('textbox').map((b) => b.getAttribute('id'))).toEqual(['answer-1', 'answer-2'])
    expect(Array.from(document.querySelectorAll('[data-answer-label]')).map((e) => e.textContent)).toEqual(['Answer 1', 'Answer 2'])
    expect(Array.from(document.querySelectorAll('[data-letter]')).map((e) => e.textContent)).toEqual(['x =', 'x ='])
    expect(screen.getByText('Type each answer in its own box.')).toBeTruthy()
    expect(document.body.textContent).not.toContain('Two answers')
    // the owner's own answer: the other order, with "x =" typed too
    fireEvent.change(screen.getByLabelText('Answer 1'), { target: { value: 'x = 3' } })
    fireEvent.change(screen.getByLabelText('Answer 2'), { target: { value: 'x = 2' } })
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(false)
    // the second question has one answer: one box
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await flush()
    expect(screen.getByText('Question 2 of 5')).toBeTruthy()
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(screen.getByLabelText('Your answer')).toBeTruthy()
  })

  it('shows the right answer for a moment on Skip, then the next question, and skipping the first question counts as wrong', async () => {
    render(<TourSession />)
    fireEvent.click(screen.getByRole('button', { name: /ready/i }))
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    const status = screen.getByRole('status')
    expect(within(status).getByText(/Answer:/)).toBeTruthy()
    // the question has not moved on yet
    expect(screen.getByText('Question 1 of 5')).toBeTruthy()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1499)
    })
    expect(screen.getByText('Question 1 of 5')).toBeTruthy()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2)
    })
    expect(screen.getByText('Question 2 of 5')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })
})

/** Every link on the screen stays inside the tour: nothing here may send a signed-out person to the signed-in app. */
const stayInTour = () => {
  const hrefs = Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href') ?? '')
  expect(hrefs.length).toBeGreaterThan(0)
  for (const href of hrefs) expect(href, href).toMatch(/^\/tour(\/|$)/)
}
const hrefOf = (name: string | RegExp) => screen.getByRole('link', { name }).getAttribute('href')

describe('the learner pages', () => {
  afterEach(() => cleanup())

  it('the first page lists every part of Grade 11 Mathematics, each a link into the tour', () => {
    render(<TourHome />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('My maths')
    for (const part of TOUR_PARTS) expect(hrefOf(new RegExp(`^${part.label.replace(/[()]/g, '\\$&')}`)), part.label).toBe(`/tour/${part.slug}`)
    stayInTour()
  })

  it('Algebra shows its three topics and only Equations and inequalities opens the lesson', async () => {
    render(await TourPartPage({ params: Promise.resolve({ part: 'algebra' }) }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Algebra')
    expect(hrefOf(/Equations and inequalities/)).toBe('/tour/algebra/equations')
    expect(screen.getByText('Exponents and surds')).toBeTruthy()
    expect(screen.getByText('Number patterns')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Exponents and surds/ })).toBeNull()
    stayInTour()
  })

  it('a part that is not on the list is not a page', async () => {
    await expect(TourPartPage({ params: Promise.resolve({ part: 'astrology' }) })).rejects.toThrow()
  })

  it('the lesson page is the session', () => {
    render(<TourLessonPage />)
    expect(screen.getByRole('button', { name: /ready/i })).toBeTruthy()
  })

  it('the whole session keeps its links inside the tour, from the lesson to the results', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      render(<TourSession />)
      stayInTour()
      fireEvent.click(screen.getByRole('button', { name: /ready/i }))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      stayInTour()
      for (let n = 1; n <= 5; n++) {
        fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1500)
        })
      }
      expect(document.querySelector('[data-score]')?.textContent).toBe('You got 0 of 5 right.')
      stayInTour()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('the learner pages show the score of a finished lesson', () => {
  beforeEach(() => sessionStorage.clear())
  afterEach(() => cleanup())

  const algebraRow = () => screen.getByRole('link', { name: /^Algebra/ })

  it('the topic list says Not started yet for every part until the lesson is done', async () => {
    render(<TourHome />)
    await act(async () => {})
    expect(screen.getAllByText('Not started yet')).toHaveLength(TOUR_PARTS.length)
  })

  it('after a finished lesson the Algebra row of the list shows one topic started, and the other parts stay as they were', async () => {
    saveTourResult(sessionStorage, [true, false, false, false, false])
    render(<TourHome />)
    await act(async () => {})
    expect(algebraRow().textContent).toContain('0 of 3 secure \u00b7 1 started')
    expect(algebraRow().querySelector('[data-dot="empty"]')).not.toBeNull()
    expect(algebraRow().querySelectorAll('[data-dot]')).toHaveLength(3)
    expect(screen.getAllByText('Not started yet')).toHaveLength(TOUR_PARTS.length - 1)
  })

  it('a lesson that went well fills the circle and counts the topic as secure', async () => {
    saveTourResult(sessionStorage, [true, true, true, true, false])
    render(<TourHome />)
    await act(async () => {})
    expect(algebraRow().textContent).toContain('1 of 3 secure')
    expect(algebraRow().querySelector('[data-dot="full"]')).not.toBeNull()
  })

  it('the Algebra page shows the score on Equations and inequalities only, and the same score under the heading', async () => {
    saveTourResult(sessionStorage, [true, false, false, false, false])
    render(await TourPartPage({ params: Promise.resolve({ part: 'algebra' }) }))
    await act(async () => {})
    const equations = screen.getByRole('link', { name: /Equations and inequalities/ })
    expect(equations.textContent).toContain('1 of 5 right')
    expect(equations.querySelector('[data-dot="empty"]')).not.toBeNull()
    expect(screen.getByText('Exponents and surds').closest('li')?.textContent).toContain('No score yet')
    expect(screen.getByText('Number patterns').closest('li')?.textContent).toContain('No score yet')
    expect(screen.getByRole('heading', { level: 1 }).parentElement?.textContent).toContain('1 of 5 right')
    stayInTour()
  })

  it('another part has no score to show', async () => {
    saveTourResult(sessionStorage, [true, false, false, false, false])
    render(await TourPartPage({ params: Promise.resolve({ part: 'functions' }) }))
    await act(async () => {})
    expect(document.body.textContent).not.toContain('1 of 5 right')
  })

  it('the lesson itself writes the score the list then shows: five skips are 0 of 5', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      render(<TourSession />)
      fireEvent.click(screen.getByRole('button', { name: /ready/i }))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      for (let n = 1; n <= 5; n++) {
        fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1500)
        })
      }
    } finally {
      vi.useRealTimers()
    }
    cleanup()
    render(await TourPartPage({ params: Promise.resolve({ part: 'algebra' }) }))
    await act(async () => {})
    expect(screen.getByRole('link', { name: /Equations and inequalities/ }).textContent).toContain('0 of 5 right')
  })
})

describe('the teacher pages', () => {
  beforeEach(() => sessionStorage.clear())
  afterEach(() => cleanup())

  it('the first page lists the parts with the class average, each a link', () => {
    render(<TourTeacherHome />)
    expect(screen.getByText('Grade 11A')).toBeTruthy()
    expect(hrefOf(/Algebra/)).toBe('/tour/teacher/algebra')
    expect(screen.getByText('Class average 61%')).toBeTruthy()
    // a part not taught yet says so
    expect(screen.getAllByText('Not taught yet').length).toBe(2)
    stayInTour()
  })

  it('Algebra lists its subtopics with their averages and only Equations and inequalities opens the class page', async () => {
    render(await TourTeacherPartPage({ params: Promise.resolve({ part: 'algebra' }) }))
    expect(hrefOf(/Equations and inequalities/)).toBe('/tour/teacher/algebra/equations')
    expect(screen.queryByRole('link', { name: /Exponents and surds/ })).toBeNull()
    expect(screen.getByText('Class average 71%')).toBeTruthy()
    stayInTour()
  })

  it('the topic page has the learners, the analysis and the tokens', async () => {
    render(await TourTeacherTopicPage({ params: Promise.resolve({ part: 'algebra', topic: 'equations' }) }))
    const rows = Array.from(document.querySelectorAll('[data-learner]')).map((r) => r.getAttribute('data-learner'))
    expect(rows).toEqual(['Lwazi', ...TOUR_CLASS.learners.map((l) => l.name)])
    // the tour learner's row, before the lesson was done in this tab: 1 of 5, marked "You"
    const you = document.querySelector('[data-learner="Lwazi"]')!
    expect(you.textContent).toContain('1 of 5')
    expect(you.textContent).toContain('You')
    // learners right on each question, from the class file
    expect(['1', '2', '3', '4', '5'].map((n) => document.querySelector(`[data-column="${n}"]`)?.textContent)).toEqual(['4', '2', '7', '4', '3'])
    expect(screen.getByText('What Jemma sees in the class')).toBeTruthy()
    expect(screen.getByText('Fractions not cleared properly')).toBeTruthy()
    expect(document.querySelector('[data-tokens-total]')?.textContent).toBe('19,642')
    stayInTour()
  })

  it('the tokens card has the real counts of one practice: the model, three labelled rows, and the class worked out from them', async () => {
    render(await TourTeacherTopicPage({ params: Promise.resolve({ part: 'algebra', topic: 'equations' }) }))
    const card = document.querySelector('section[aria-labelledby="tokens"]') as HTMLElement
    expect(card.querySelector('[data-tokens-total]')?.textContent).toBe('19,642')
    expect(card.textContent).toContain("tokens for one learner's practice")
    // the model stays on the card
    expect(card.querySelector('[data-model]')?.textContent).toContain('DeepSeek V4.1 Flash')
    expect(card.querySelector('[data-model]')?.textContent).toContain('Cloudflare Workers AI')
    // the three rows, with their counts
    const row = (label: string) => within(card).getByRole('rowheader', { name: new RegExp(label) }).closest('tr') as HTMLElement
    const cells = (tr: HTMLElement) => Array.from(tr.querySelectorAll('td')).map((td) => td.textContent)
    expect(cells(row('Lesson and 15 questions'))).toEqual(['8,644', '10,998', '19,642'])
    expect(cells(row('Marking the typed answers'))).toEqual(['0', '0', '0'])
    expect(row('Marking the typed answers').textContent).toContain("Jemma's own marking code, no AI")
    expect(cells(row("The teacher's AI analysis"))).toEqual(['0', '0', '0'])
    expect(row("The teacher's AI analysis").textContent).toContain('Built from the notes the AI already wrote')
    // no made-up learner by learner numbers any more
    expect(card.querySelectorAll('tbody tr')).toHaveLength(4)
    expect(card.textContent).toContain('About 19,600 tokens per learner practice (one lesson with its questions)')
    // nine learners are listed, so the class is nine practices, worked out from the one real call
    const class_ = card.querySelector('[data-class-total]')!
    expect(class_.textContent).toContain('9 learners')
    expect(class_.textContent).toContain('9 × 19,642 = 176,778')
    expect(class_.textContent).toContain('worked out from that one real call')
  })

  it('keeps the name of the tour learner whole on a phone: "You" sits under the name, and the name and the pill never share a line', async () => {
    render(await TourTeacherTopicPage({ params: Promise.resolve({ part: 'algebra', topic: 'equations' }) }))
    const you = document.querySelector('[data-learner="Lwazi"]')!
    const name = you.querySelector('[data-learner-name]') as HTMLElement
    expect(name.textContent).toBe('Lwazi')
    // the name and the pill are in one column: the pill is the second line, so the name has the whole width of the column
    const column = name.parentElement as HTMLElement
    expect(column.className).toContain('flex-col')
    expect(Array.from(column.children).map((c) => c.textContent)).toEqual(['Lwazi', 'You'])
    // the other eight have a name and no pill
    for (const l of TOUR_CLASS.learners) {
      const row = document.querySelector(`[data-learner="${l.name}"]`)!
      expect(row.querySelector('[data-learner-name]')?.textContent).toBe(l.name)
      expect(row.querySelector('[data-learner-name]')?.parentElement?.children).toHaveLength(1)
    }
  })

  it('gives the name the room: on a phone the five marks are 20 px circles and the score column is narrower, and both go back to full size on a laptop', async () => {
    render(await TourTeacherTopicPage({ params: Promise.resolve({ part: 'algebra', topic: 'equations' }) }))
    const row = document.querySelector('[data-learner="Refilwe"]') as HTMLElement
    const marks = row.querySelector('[aria-label^="Refilwe:"]') as HTMLElement
    expect(marks.className).toContain('gap-1')
    expect(marks.className).toContain('lg:gap-1.5')
    for (const mark of Array.from(marks.children)) {
      expect((mark as HTMLElement).className).toContain('size-5')
      expect((mark as HTMLElement).className).toContain('lg:size-6')
    }
    // the header and the footer of the list use the same cell sizes, so the Q1 to Q5 labels sit over the marks
    const header = document.querySelector('[data-marks-head]') as HTMLElement
    for (const cell of Array.from(header.children)) expect((cell as HTMLElement).className).toContain('w-5')
    const footer = document.querySelectorAll('[data-column]')
    expect(footer).toHaveLength(5)
    for (const cell of Array.from(footer)) expect((cell as HTMLElement).className).toContain('w-5')
  })

  it('has no learner by learner token table: the tokens card names no learner and holds none of the old made-up numbers', async () => {
    render(await TourTeacherTopicPage({ params: Promise.resolve({ part: 'algebra', topic: 'equations' }) }))
    const card = document.querySelector('section[aria-labelledby="tokens"]') as HTMLElement
    for (const l of TOUR_CLASS.learners) expect(card.textContent).not.toContain(l.name)
    expect(card.textContent).not.toMatch(/\b230\b|\b52\b/)
    expect(card.querySelector('table')?.querySelectorAll('thead th')).toHaveLength(4)
    expect(Array.from(card.querySelectorAll('thead th')).map((th) => th.textContent)).toEqual(['Job', 'Read', 'Written', 'Total'])
  })

  it('shows the result of the lesson done in this tab in the tour learner row', async () => {
    sessionStorage.setItem(TOUR_RESULT_KEY, JSON.stringify([true, true, true, false, false]))
    render(await TourTeacherTopicPage({ params: Promise.resolve({ part: 'algebra', topic: 'equations' }) }))
    await act(async () => {})
    expect(document.querySelector('[data-learner="Lwazi"]')?.textContent).toContain('3 of 5')
  })

  it('draws whatever token rows the class file holds, and adds them up', async () => {
    const saved = JSON.stringify(TOUR_CLASS.tokens)
    TOUR_CLASS.tokens.jobs = [{ key: 'only', label: 'One job', input: 1200, output: 34 }]
    try {
      render(await TourTeacherTopicPage({ params: Promise.resolve({ part: 'algebra', topic: 'equations' }) }))
      expect(document.querySelector('[data-tokens-total]')?.textContent).toBe('1,234')
      expect(screen.getByText('One job')).toBeTruthy()
      expect(document.querySelector('[data-class-total]')?.textContent).toContain('9 \u00d7 1,234 = 11,106')
    } finally {
      Object.assign(TOUR_CLASS.tokens, JSON.parse(saved))
    }
  })
})

describe('the sign-in rule', () => {
  it('lets a signed-out person open /tour, the learner pages and the teacher pages of the tour', () => {
    for (const path of ['/tour', '/tour/', '/tour/algebra', '/tour/algebra/equations', '/tour/teacher', '/tour/teacher/algebra', '/tour/teacher/algebra/equations']) {
      expect(isPublicPath(path), path).toBe(true)
    }
  })

  it('still sends everything else to sign-in, and keeps the learner sign-in open', () => {
    expect(isPublicPath('/k/sign-in')).toBe(true)
    for (const path of ['/k', '/t', '/p', '/k/session/abc', '/t/abc', '/tourist', '/tours/x']) expect(isPublicPath(path), path).toBe(false)
  })
})

describe('the made-up class', () => {
  it('is Grade 11A with eight learners, each with five results for Equations and inequalities', () => {
    expect(TOUR_CLASS.name).toBe('Grade 11A')
    expect(TOUR_CLASS.learners).toHaveLength(8)
    for (const l of TOUR_CLASS.learners) {
      expect(l.name.length).toBeGreaterThan(1)
      expect(l.results).toHaveLength(5)
    }
    expect(new Set(TOUR_CLASS.learners.map((l) => l.name)).size).toBe(8)
  })

  it('has an average for the topics, an analysis and a token block to render whatever numbers are in it', () => {
    expect(TOUR_CLASS.analysis.summary.length).toBeGreaterThan(40)
    expect(TOUR_CLASS.analysis.mistakes.length).toBeGreaterThan(1)
    expect(TOUR_CLASS.analysis.reteach.length).toBeGreaterThan(0)
    expect(TOUR_CLASS.parts.algebra?.avg).toBeTypeOf('number')
    expect(TOUR_CLASS.topics.equations?.avg).toBeTypeOf('number')
    const { tokens } = TOUR_CLASS
    expect(tokens.model).toEqual({ name: 'DeepSeek V4.1 Flash', provider: 'Cloudflare Workers AI' })
    expect(tokens.jobs.map((j) => j.label)).toEqual(['Lesson and 15 questions', 'Marking the typed answers', "The teacher's AI analysis"])
    expect(tokens.jobs.map((j) => [j.input, j.output])).toEqual([
      [8644, 10998],
      [0, 0],
      [0, 0],
    ])
    expect(tokens.perLearner).toBe('About 19,600 tokens per learner practice (one lesson with its questions)')
  })
})

describe('the tour files', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name)
      return statSync(full).isDirectory() ? walk(full) : [full]
    })
  const files = walk(join(webRoot, 'app/tour')).filter((f) => /\.(ts|tsx)$/.test(f))

  it('has files to read', () => {
    expect(files.length).toBeGreaterThan(8)
  })

  it('imports no database client, and imports nothing from the data layer of the real app', () => {
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      expect(src, file).not.toMatch(/supabase/i)
      expect(src, file).not.toMatch(/@\/lib\/data/)
      expect(src, file).not.toMatch(/@jemma\/profiling\/(server|db|tools|jobs|ai|orchestrator)/)
    }
  })

  it('has no fetch, no server action and no model call', () => {
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      expect(src, file).not.toMatch(/\bfetch\s*\(/)
      expect(src, file).not.toMatch(/['"]use server['"]/)
      expect(src, file).not.toMatch(/\bgenerateText|streamText|generateObject\b/)
      expect(src, file).not.toMatch(/\/actions['"]/)
    }
  })

  it('says "demo" nowhere on the page', () => {
    for (const file of files) expect(readFileSync(file, 'utf8'), file).not.toMatch(/demo/i)
  })

  it('has no em dash', () => {
    for (const file of [...files, join(webRoot, 'app/tour/data/class.json'), join(webRoot, 'app/tour/data/lesson.json')]) expect(readFileSync(file, 'utf8'), file).not.toContain(String.fromCharCode(0x2014))
  })
})
