import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TOUR_LIBRARY, markTourBlock, markTourPractice, tourLessonForReader, tourLibraryEntries, tourPracticeQuestion } from '../app/tour/data/library'
import { DEFAULT_YOU, TOUR_RESULT_KEY, saveTourResult } from '../app/tour/outcome'
import {
  DEFAULT_RETEACH,
  LEARNS_BY,
  TOUR_QUESTION_TAGS,
  TOUR_RETEACH_KEY,
  alsoMissedLine,
  clearReteach,
  groupMissed,
  learnsBest,
  learnsBestLine,
  questionWords,
  saveReteach,
  savedReteach,
  type PartOutcome,
} from '../app/tour/reteach'
import { TourSession } from '../app/tour/TourSession'
import { ReteachCard } from '../app/tour/teacher/ReteachCard'
import TourTeacherTopicPage from '../app/tour/teacher/[part]/[topic]/page'

// P153: the tour's Learn step shows the eight real lessons of the library, and a new step 4, Teach again, follows the results: Jemma groups the missed
// questions into parts, teaches each part again in the way the learner picks (Read, Pictures, Listen), checks it with one question of that lesson's practice, and
// keeps the way that worked for the teacher's page. These tests render components and read files: no database, no server, no model, no browser.

// The server actions of the lessons need a signed-in learner and the database: the tour must never call them. They are doubles that count the calls.
const actions = vi.hoisted(() => ({
  answerLessonQuestion: vi.fn(),
  startTopicLesson: vi.fn(async () => undefined),
  finishTopicLesson: vi.fn(async () => undefined),
}))
vi.mock('../app/k/learn/actions', () => actions)

// The maths editor is not started in these tests: the answer box is the plain one the learner gets when the editor cannot start.
vi.mock('mathlive', () => {
  throw new Error('no editor in this test')
})

// jsdom does not scroll: the screens scroll to their top when they change.
window.scrollTo = vi.fn()

const webRoot = resolve(import.meta.dirname, '..')

const part = (lesson: number, label: string, worked: PartOutcome['worked'], tried: PartOutcome['tried'] = worked ? [worked] : []): PartOutcome => ({ lesson, label, tried, worked })

describe('the saved library', () => {
  it('is the eight lessons of Grade 11 Equations and inequalities, in teaching order, without the database id', () => {
    const file = JSON.parse(readFileSync(join(webRoot, 'app/tour/data/library.json'), 'utf8')) as Record<string, unknown>[]
    expect(file).toHaveLength(8)
    for (const row of file) expect(Object.keys(row).sort()).toEqual(['base_name', 'content', 'family', 'grade', 'position', 'source', 'title', 'version'])
    expect(TOUR_LIBRARY.map((r) => r.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(new Set(TOUR_LIBRARY.map((r) => r.base_name))).toEqual(new Set(['Equations and inequalities']))
    expect(new Set(TOUR_LIBRARY.map((r) => r.grade))).toEqual(new Set([11]))
  })

  it('lists the lessons with their titles and minutes', () => {
    const entries = tourLibraryEntries()
    expect(entries).toHaveLength(8)
    expect(entries[0]).toEqual({ position: 1, title: 'Solving quadratic equations by factorising', minutes: 22 })
    expect(entries[4]!.title).toBe('Simultaneous equations with one linear and one quadratic')
    expect(entries[5]!.title).toBe('Solving quadratic inequalities')
  })

  it('hands the screen a lesson with no answer of any question the learner is asked', () => {
    for (const r of TOUR_LIBRARY) {
      const found = tourLessonForReader(r.position)!
      for (const q of found.lesson.practice) {
        expect(q).not.toHaveProperty('answer')
        expect(q).not.toHaveProperty('steps')
        expect(q).not.toHaveProperty('why')
        expect(q).not.toHaveProperty('rightWay')
      }
      for (const b of found.lesson.blocks) {
        if (b.kind === 'try') {
          expect(b.question).not.toHaveProperty('answer')
          expect(b.question).not.toHaveProperty('rightWay')
        }
      }
    }
    expect(tourPracticeQuestion(5, 0)).not.toHaveProperty('answer')
    expect(tourLessonForReader(9)).toBeNull()
  })

  it('marks a practice question and a Your turn question with the library marking, in the saved copy', () => {
    expect(markTourPractice(5, 0, '7 - 3x')?.correct).toBe(true)
    expect(markTourPractice(5, 0, '7 + 3x')?.correct).toBe(false)
    expect(markTourPractice(6, 0, 'B')).toMatchObject({ correct: true })
    expect(markTourPractice(6, 0, 'A')).toMatchObject({ correct: false })
    expect(markTourPractice(5, 99, 'x')).toBeNull()
    const at = TOUR_LIBRARY[0]!.content.blocks.findIndex((b) => b.kind === 'try')
    expect(markTourBlock(1, at, 'zzz')?.correct).toBe(false)
    expect(markTourBlock(1, 0, 'zzz')).toBeNull()
  })
})

describe('the parts of the missed questions', () => {
  it('tags each tour question: 1 with lesson 1, 3 and 5 with lesson 5, 4 with lesson 6, and 2 with none', () => {
    expect(TOUR_QUESTION_TAGS.map((t) => t?.lesson ?? null)).toEqual([1, null, 5, 6, 5])
    expect(TOUR_QUESTION_TAGS.map((t) => t?.label ?? null)).toEqual(['Quadratic equations', null, 'Simultaneous equations', 'Quadratic inequalities', 'Simultaneous equations'])
  })

  it('groups the default result (Question 1 right) into two parts, most missed first, and the question with no lesson on its own', () => {
    expect(groupMissed(DEFAULT_YOU)).toEqual({
      parts: [
        { lesson: 5, label: 'Simultaneous equations', questions: [3, 5] },
        { lesson: 6, label: 'Quadratic inequalities', questions: [4] },
      ],
      also: [2],
    })
  })

  it('puts the part with most missed questions first, then the lesson with the lower place', () => {
    expect(groupMissed([false, false, false, false, false]).parts.map((p) => p.lesson)).toEqual([5, 1, 6])
    expect(groupMissed([false, true, true, false, true]).parts.map((p) => p.lesson)).toEqual([1, 6])
    expect(groupMissed([true, true, false, false, true]).parts.map((p) => p.lesson)).toEqual([5, 6])
    // 4 and 5 missed: one each, so lesson 5 (Question 5) comes before nothing else, and lesson 6 follows
    expect(groupMissed([true, true, true, false, false]).parts.map((p) => [p.lesson, p.questions])).toEqual([
      [5, [5]],
      [6, [4]],
    ])
  })

  it('has nothing to teach when everything is right, and only the line when only Question 2 is missed', () => {
    expect(groupMissed([true, true, true, true, true])).toEqual({ parts: [], also: [] })
    expect(groupMissed([true, false, true, true, true])).toEqual({ parts: [], also: [2] })
  })

  it('writes the one line for the missed questions with no lesson', () => {
    expect(alsoMissedLine([2])).toBe('Also missed: Question 2. Jemma teaches it in your next practice.')
    expect(alsoMissedLine([2, 4])).toBe('Also missed: Questions 2 and 4. Jemma teaches them in your next practice.')
    expect(alsoMissedLine([])).toBeNull()
    expect(questionWords([1, 3, 5])).toBe('Questions 1, 3 and 5')
  })
})

describe('the way a learner learns best', () => {
  it('is the way that worked most often', () => {
    expect(learnsBest([part(5, 'A', 'listen'), part(6, 'B', 'listen'), part(1, 'C', 'read')])).toBe('listen')
    expect(learnsBest([part(5, 'A', 'read'), part(6, 'B', 'pictures'), part(1, 'C', 'pictures')])).toBe('pictures')
  })

  it('goes to the way that worked most recently when it is a tie', () => {
    expect(learnsBest([part(5, 'A', 'listen'), part(6, 'B', 'read')])).toBe('read')
    expect(learnsBest([part(5, 'A', 'read'), part(6, 'B', 'listen')])).toBe('listen')
    expect(learnsBest([part(5, 'A', 'listen'), part(6, 'B', 'read'), part(1, 'C', null, ['read', 'pictures'])])).toBe('read')
  })

  it('is nothing when no way has worked yet', () => {
    expect(learnsBest([])).toBeNull()
    expect(learnsBest([part(5, 'A', null, ['read', 'listen'])])).toBeNull()
    expect(learnsBestLine(null)).toBe('Learns best by: not clear yet')
  })

  it('is said as "Learns best by: Listening"', () => {
    expect(learnsBestLine('listen')).toBe('Learns best by: Listening')
    expect(LEARNS_BY).toEqual({ read: 'Reading', pictures: 'Pictures', listen: 'Listening' })
  })

  it('has a default that goes with the default result: two parts, both by listening', () => {
    expect(DEFAULT_RETEACH.parts).toEqual([part(5, 'Simultaneous equations', 'listen'), part(6, 'Quadratic inequalities', 'listen')])
    expect(learnsBestLine(learnsBest(DEFAULT_RETEACH.parts))).toBe('Learns best by: Listening')
  })
})

describe('what the tab keeps', () => {
  const memory = () => {
    const store = new Map<string, string>()
    return { store, storage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) } }
  }

  it('writes the outcome under its own key, beside the result, and reads the same back', () => {
    const { store, storage } = memory()
    expect(TOUR_RETEACH_KEY).not.toBe(TOUR_RESULT_KEY)
    expect(savedReteach(storage)).toBeNull()
    const outcome = { parts: [part(5, 'Simultaneous equations', 'pictures', ['read', 'pictures']), part(6, 'Quadratic inequalities', null, ['listen', 'read'])] }
    saveReteach(storage, outcome)
    expect(JSON.parse(store.get(TOUR_RETEACH_KEY)!)).toEqual(outcome)
    expect(savedReteach(storage)).toEqual(outcome)
  })

  it('reads nothing from what is not an outcome, and keeps none for a part nobody was taught', () => {
    const { store, storage } = memory()
    store.set(TOUR_RETEACH_KEY, 'not json')
    expect(savedReteach(storage)).toBeNull()
    store.set(TOUR_RETEACH_KEY, JSON.stringify({ parts: [{ lesson: 5, label: 'x', tried: ['dance'], worked: null }] }))
    expect(savedReteach(storage)).toBeNull()
    store.set(TOUR_RETEACH_KEY, JSON.stringify({ parts: 'nope' }))
    expect(savedReteach(storage)).toBeNull()
    saveReteach(storage, { parts: [] })
    expect(savedReteach(storage)).toEqual({ parts: [] })
  })

  it('takes the outcome away when a new result is saved', () => {
    const { storage } = memory()
    saveReteach(storage, DEFAULT_RETEACH)
    clearReteach(storage)
    expect(savedReteach(storage)).toBeNull()
  })
})

const flush = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
}
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }))
const skip = async () => {
  press('Skip')
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500)
  })
}

/** The learner reads nothing, types Question 1 right (x = 3 or x = 2), skips the other four and is on the results. */
async function toResults() {
  render(<TourSession />)
  press(/go to the questions/i)
  await flush()
  await flush()
  fireEvent.change(screen.getByLabelText('Answer 1'), { target: { value: '3' } })
  fireEvent.change(screen.getByLabelText('Answer 2'), { target: { value: '2' } })
  press('Next')
  await flush()
  for (let n = 0; n < 4; n++) await skip()
}

/** P156: the same, but the four skips are one tap on Skip the rest (no answer card, no wait). */
async function toResultsSkippingTheRest() {
  render(<TourSession />)
  press(/go to the questions/i)
  await flush()
  await flush()
  fireEvent.change(screen.getByLabelText('Answer 1'), { target: { value: '3' } })
  fireEvent.change(screen.getByLabelText('Answer 2'), { target: { value: '2' } })
  press('Next')
  await flush()
  press('Skip the rest')
}

/** Types into the plain answer box of the check, or into the two boxes of a question with two answers. */
const typeCheck = (...values: string[]) => {
  if (values.length === 1) fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: values[0] } })
  else values.forEach((v, i) => fireEvent.change(screen.getByLabelText(`Answer ${i + 1}`), { target: { value: v } }))
  press('Next')
}

const radio = (name: string) => screen.getByRole('radio', { name })
const choose = (name: string) => fireEvent.click(screen.getByRole('button', { name }))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  sessionStorage.clear()
  for (const fn of Object.values(actions)) fn.mockClear()
})
afterEach(() => {
  // whatever the test did, no lesson server action was called
  for (const [name, fn] of Object.entries(actions)) expect(fn, name).not.toHaveBeenCalled()
  vi.useRealTimers()
  cleanup()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(window, 'speechSynthesis')
})

describe('step 1, Learn: the lessons of the library', () => {
  it('lists the eight lessons with their minutes, and a button that goes to the questions', () => {
    render(<TourSession />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Learn it first')
    const items = within(screen.getByRole('list', { name: 'Lessons' })).getAllByRole('listitem')
    expect(items).toHaveLength(8)
    expect(items[0]!.textContent).toContain('Solving quadratic equations by factorising')
    expect(items[0]!.textContent).toContain('22 min')
    expect(items[7]!.textContent).toContain('Quadratic word problems')
    expect(screen.getByRole('button', { name: 'Start lesson 1' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /go to the questions/i })).toBeTruthy()
  })

  it('shows four steps on the step bar: Learn, Try, Results and Teach again', () => {
    render(<TourSession />)
    const steps = within(screen.getByRole('list', { name: 'Session steps' })).getAllByRole('listitem')
    expect(steps.map((s) => s.textContent)).toEqual(['Learn', 'Try', 'Results', 'Teach again'])
    expect(steps[0]!.getAttribute('aria-current')).toBe('step')
  })

  it('opens a lesson in the reader with Read, Pictures and Listen, and Back returns to the list', () => {
    render(<TourSession />)
    press('Start lesson 1')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Solving quadratic equations by factorising')
    expect(within(screen.getByRole('radiogroup', { name: 'How you want to learn' })).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Read', 'Pictures', 'Listen'])
    expect(radio('Read').getAttribute('aria-checked')).toBe('true')
    // the lesson has its blocks, a worked example, and a question of its own
    expect(document.querySelectorAll('[data-block]').length).toBeGreaterThan(8)
    expect(document.querySelector('[data-block="worked"]')).not.toBeNull()
    expect(document.querySelector('[data-block="try"]')).not.toBeNull()
    fireEvent.click(radio('Pictures'))
    expect(radio('Pictures').getAttribute('aria-checked')).toBe('true')
    press('Back')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Learn it first')
    // any lesson opens from the list
    press(/Completing the square/)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Completing the square')
  })

  it('goes from the end of a lesson to the questions', async () => {
    render(<TourSession />)
    press('Start lesson 1')
    press('Go to the questions')
    await flush()
    expect(screen.getByText('Question 1 of 5')).toBeTruthy()
  })

  it('reads the lesson aloud in Listen, with the browser voice', () => {
    const said: string[] = []
    class Utterance {
      text: string
      lang = ''
      rate = 1
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      constructor(text: string) {
        this.text = text
      }
    }
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance)
    const synth = { speak: vi.fn((u: Utterance) => void said.push(u.text)), cancel: vi.fn() }
    vi.stubGlobal('speechSynthesis', synth)
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true })
    render(<TourSession />)
    press('Start lesson 1')
    fireEvent.click(radio('Listen'))
    expect(radio('Listen').getAttribute('aria-checked')).toBe('true')
    // P159: Listen has a player; its big button reads the lesson from the first part, as Play all did.
    fireEvent.click(within(document.querySelector('[data-player]') as HTMLElement).getByRole('button', { name: 'Play' }))
    expect(synth.speak).toHaveBeenCalled()
    const first = TOUR_LIBRARY[0]!.content.blocks[0]!
    expect(said.join(' ')).toContain((first as { speech: string }).speech.split(/(?<=[.!?])\s+/)[0]!)
    // every block has its own voice button (the one being read says Stop)
    expect(screen.getAllByRole('button', { name: 'Read this part aloud' }).length + screen.getAllByRole('button', { name: 'Stop reading this part' }).length).toBe(TOUR_LIBRARY[0]!.content.blocks.length)
  })

  it('marks a Your turn question inside a lesson in the browser, with no server call', async () => {
    render(<TourSession />)
    press('Start lesson 1')
    const turn = document.querySelector('[data-block="try"]') as HTMLElement
    fireEvent.click(within(turn).getByRole('button', { name: 'Answer this one' }))
    await flush()
    expect(within(turn).queryByRole('alert')).toBeNull()
    // "Solve for x: x² - x - 12 = 0" has two answers: two boxes
    fireEvent.change(within(turn).getByLabelText('Answer 1'), { target: { value: '4' } })
    fireEvent.change(within(turn).getByLabelText('Answer 2'), { target: { value: '-3' } })
    fireEvent.click(within(turn).getByRole('button', { name: 'Check' }))
    await flush()
    expect(turn.querySelector('[data-result="right"]')).not.toBeNull()
    expect(within(turn).queryByRole('alert')).toBeNull()
  })
})

describe('the Results step', () => {
  it('has the main button "Let Jemma teach what you missed", and the teacher\'s view button stays', async () => {
    await toResults()
    expect(document.querySelector('[data-score]')?.textContent).toBe('You got 1 of 5 right.')
    expect(screen.getByRole('button', { name: 'Let Jemma teach what you missed' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /teacher/i }).getAttribute('href')).toBe('/tour/teacher')
    expect(screen.getByRole('button', { name: 'Start again' })).toBeTruthy()
    // the step bar is on Results (step 3 of 4)
    const steps = within(screen.getByRole('list', { name: 'Session steps' })).getAllByRole('listitem')
    expect(steps[2]!.getAttribute('aria-current')).toBe('step')
  })

  it('leaves the old outcome behind when a new result is saved', async () => {
    saveReteach(sessionStorage, DEFAULT_RETEACH)
    await toResults()
    expect(sessionStorage.getItem(TOUR_RETEACH_KEY)).toBeNull()
    expect(JSON.parse(sessionStorage.getItem(TOUR_RESULT_KEY) ?? 'null')).toEqual([true, false, false, false, false])
  })
})

describe('P156: Skip the rest, then the results and Teach again', () => {
  it('is on the results at once as 1 of 5, and the old outcome of Teach again is gone, as after five single skips', async () => {
    saveReteach(sessionStorage, DEFAULT_RETEACH)
    await toResultsSkippingTheRest()
    expect(document.querySelector('[data-score]')?.textContent).toBe('You got 1 of 5 right.')
    expect(screen.getByRole('button', { name: 'Let Jemma teach what you missed' })).toBeTruthy()
    expect(sessionStorage.getItem(TOUR_RETEACH_KEY)).toBeNull()
    expect(JSON.parse(sessionStorage.getItem(TOUR_RESULT_KEY) ?? 'null')).toEqual([true, false, false, false, false])
    const steps = within(screen.getByRole('list', { name: 'Session steps' })).getAllByRole('listitem')
    expect(steps[2]!.getAttribute('aria-current')).toBe('step')
  })

  it('Teach again lists the same parts after Skip the rest as after five single skips', async () => {
    const partsAndAlso = () => {
      press('Let Jemma teach what you missed')
      return {
        heading: screen.getByRole('heading', { level: 1 }).textContent,
        parts: within(screen.getByRole('list', { name: 'Parts to teach again' }))
          .getAllByRole('listitem')
          .map((p) => p.textContent),
        also: document.querySelector('[data-also]')?.textContent,
      }
    }
    await toResults()
    const longWay = partsAndAlso()
    cleanup()
    sessionStorage.clear()
    await toResultsSkippingTheRest()
    const shortWay = partsAndAlso()
    expect(shortWay).toEqual(longWay)
    expect(shortWay.parts).toEqual(['Part 1Simultaneous equationsQuestions 3 and 5 missed', 'Part 2Quadratic inequalitiesQuestion 4 missed'])
    expect(shortWay.also).toBe('Also missed: Question 2. Jemma teaches it in your next practice.')
  })

  it('the way through Teach again works after it: Teach me again opens the first part with its three ways to learn', async () => {
    await toResultsSkippingTheRest()
    press('Let Jemma teach what you missed')
    press('Teach me again')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('How do you want to learn it?')
    expect(screen.getByText('Part 1 of 2')).toBeTruthy()
    expect(Array.from(document.querySelectorAll('[data-delivery]')).map((b) => b.getAttribute('aria-label'))).toEqual(['Read', 'Pictures', 'Listen'])
  })
})

describe('step 4, Teach again', () => {
  it('shows what Jemma looked at: the missed questions in parts, most first, and one line for the question with no lesson', async () => {
    await toResults()
    press('Let Jemma teach what you missed')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Jemma looked at your answers')
    const parts = within(screen.getByRole('list', { name: 'Parts to teach again' })).getAllByRole('listitem')
    expect(parts.map((p) => p.textContent)).toEqual(['Part 1Simultaneous equationsQuestions 3 and 5 missed', 'Part 2Quadratic inequalitiesQuestion 4 missed'])
    expect(document.querySelector('[data-also]')?.textContent).toBe('Also missed: Question 2. Jemma teaches it in your next practice.')
    const steps = within(screen.getByRole('list', { name: 'Session steps' })).getAllByRole('listitem')
    expect(steps[3]!.getAttribute('aria-current')).toBe('step')
  })

  it('asks how to learn each part with three big choices, and opens the full lesson in the one picked', async () => {
    await toResults()
    press('Let Jemma teach what you missed')
    press('Teach me again')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('How do you want to learn it?')
    expect(screen.getByText('Simultaneous equations')).toBeTruthy()
    expect(screen.getByText('Part 1 of 2')).toBeTruthy()
    expect(Array.from(document.querySelectorAll('[data-delivery]')).map((b) => b.getAttribute('aria-label'))).toEqual(['Read', 'Pictures', 'Listen'])
    choose('Pictures')
    // lesson 5, the whole of it, in Pictures, with the switch to change it
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Simultaneous equations with one linear and one quadratic')
    expect(radio('Pictures').getAttribute('aria-checked')).toBe('true')
    expect(document.querySelectorAll('[data-block]').length).toBe(TOUR_LIBRARY[4]!.content.blocks.length)
    fireEvent.click(radio('Listen'))
    expect(radio('Listen').getAttribute('aria-checked')).toBe('true')
  })

  it('checks with the first practice question: right says "That worked: Listen", then the next part, then what Jemma found', async () => {
    await toResults()
    press('Let Jemma teach what you missed')
    press('Teach me again')
    choose('Listen')
    press('Check what you learned')
    await flush()
    expect(screen.getByText('Make y the subject of 3x + y = 7.')).toBeTruthy()
    typeCheck('7 - 3x')
    expect(screen.getByRole('status').textContent).toContain('That worked: Listen')
    expect(screen.getByRole('status').getAttribute('data-result')).toBe('right')
    press('Next part')
    expect(screen.getByText('Part 2 of 2')).toBeTruthy()
    expect(screen.getByText('Quadratic inequalities')).toBeTruthy()
    choose('Read')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Solving quadratic inequalities')
    press('Check what you learned')
    await flush()
    expect(screen.getByText('Solve (x - 1)(x - 4) < 0.')).toBeTruthy()
    const options = Array.from(document.querySelectorAll('button[aria-pressed]'))
    fireEvent.click(options[1]!)
    press('Next')
    expect(screen.getByRole('status').textContent).toContain('That worked: Read')
    press('See what Jemma found')

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('What Jemma found')
    const rows = within(screen.getByRole('list', { name: 'How each part went' })).getAllByRole('listitem')
    expect(rows.map((r) => r.textContent)).toEqual(['Simultaneous equationsWorked: Listen', 'Quadratic inequalitiesWorked: Read'])
    // a tie goes to the way that worked most recently
    expect(document.querySelector('[data-learns-best]')?.textContent).toBe('Learns best by: Reading')
    expect(screen.getByRole('link', { name: /teacher/i }).getAttribute('href')).toBe('/tour/teacher')
    expect(savedReteach(sessionStorage)).toEqual({ parts: [part(5, 'Simultaneous equations', 'listen'), part(6, 'Quadratic inequalities', 'read')] })
  })

  it('shows the steps of a wrong check, and "Try it another way" offers the other ways and a new question', async () => {
    await toResults()
    press('Let Jemma teach what you missed')
    press('Teach me again')
    choose('Pictures')
    press('Check what you learned')
    await flush()
    typeCheck('7 + 3x')
    const status = screen.getByRole('status')
    expect(status.getAttribute('data-result')).toBe('wrong')
    expect(status.textContent).toContain('Not quite')
    expect(within(status).getByRole('list', { name: 'Steps' }).querySelectorAll('li').length).toBeGreaterThanOrEqual(2)
    expect(status.textContent).not.toContain('That worked')
    press('Try it another way')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('How do you want to learn it?')
    // the one tried is shown as tried and cannot be picked again
    const tried = screen.getByRole('button', { name: 'Pictures, tried' }) as HTMLButtonElement
    expect(tried.disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Read' }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: 'Listen' }) as HTMLButtonElement).disabled).toBe(false)
    choose('Listen')
    expect(radio('Listen').getAttribute('aria-checked')).toBe('true')
    press('Check what you learned')
    await flush()
    // the second question of the practice
    expect(screen.getAllByText(/Solve y = x \+ 2 and y = x\^2/).length).toBeGreaterThan(0)
    typeCheck('2', '-1')
    expect(screen.getByRole('status').textContent).toContain('That worked: Listen')
  })

  it('after two wrong tries shows the worked answer and moves on, and the part is "Not yet"', async () => {
    await toResults()
    press('Let Jemma teach what you missed')
    press('Teach me again')
    choose('Read')
    press('Check what you learned')
    await flush()
    typeCheck('7 + 3x')
    press('Try it another way')
    choose('Pictures')
    press('Check what you learned')
    await flush()
    typeCheck('5', '6')
    const status = screen.getByRole('status')
    expect(status.textContent).toContain('Not yet')
    expect(status.textContent).toContain('The worked answer')
    expect(status.textContent).toContain('The answer is:')
    expect(within(status).getByRole('list', { name: 'Steps' })).toBeTruthy()
    // no third try: the way on is the next part
    expect(screen.queryByRole('button', { name: 'Try it another way' })).toBeNull()
    press('Next part')
    expect(screen.getByText('Part 2 of 2')).toBeTruthy()
    choose('Listen')
    press('Check what you learned')
    await flush()
    fireEvent.click(Array.from(document.querySelectorAll('button[aria-pressed]'))[1]!)
    press('Next')
    press('See what Jemma found')
    const rows = within(screen.getByRole('list', { name: 'How each part went' })).getAllByRole('listitem')
    expect(rows[0]!.textContent).toBe('Simultaneous equationsNot yetTried: Read, Pictures')
    expect(rows[1]!.textContent).toBe('Quadratic inequalitiesWorked: Listen')
    expect(document.querySelector('[data-learns-best]')?.textContent).toBe('Learns best by: Listening')
    expect(savedReteach(sessionStorage)?.parts[0]).toEqual(part(5, 'Simultaneous equations', null, ['read', 'pictures']))
  })

  it('counts the way in use at the check: a learner who switches to another delivery in the lesson is credited with that one', async () => {
    await toResults()
    press('Let Jemma teach what you missed')
    press('Teach me again')
    choose('Read')
    fireEvent.click(radio('Listen'))
    press('Check what you learned')
    await flush()
    typeCheck('7 - 3x')
    expect(screen.getByRole('status').textContent).toContain('That worked: Listen')
  })

  it('keeps every link inside the tour (and, as after every test here, calls no server action)', async () => {
    await toResults()
    press('Let Jemma teach what you missed')
    press('Teach me again')
    choose('Listen')
    for (const a of Array.from(document.querySelectorAll('a'))) expect(a.getAttribute('href') ?? '', a.outerHTML).toMatch(/^\/tour(\/|$)/)
  })

  it('stores what Jemma found for the teacher\'s page', async () => {
    await toResults()
    press('Let Jemma teach what you missed')
    press('Teach me again')
    choose('Listen')
    press('Check what you learned')
    await flush()
    typeCheck('7 - 3x')
    press('Next part')
    choose('Listen')
    press('Check what you learned')
    await flush()
    fireEvent.click(Array.from(document.querySelectorAll('button[aria-pressed]'))[1]!)
    press('Next')
    press('See what Jemma found')
    cleanup()
    render(<ReteachCard name="Sarah" />)
    await act(async () => {})
    expect(document.querySelector('[data-learns-best]')?.textContent).toBe('Learns best by: Listening')
    expect(Array.from(document.querySelectorAll('[data-reteach-part]')).map((e) => e.getAttribute('data-reteach-part'))).toEqual(['5', '6'])
  })
})

describe('the teacher\'s view of how the learner learns', () => {
  it('shows the default when nothing is stored: two parts, both worked by Listening, "Learns best by: Listening"', async () => {
    render(<ReteachCard name="Sarah" />)
    await act(async () => {})
    const rows = Array.from(document.querySelectorAll('[data-reteach-part]'))
    expect(rows.map((r) => r.textContent)).toEqual(['Simultaneous equationsWorked: Listening', 'Quadratic inequalitiesWorked: Listening'])
    expect(document.querySelector('[data-learns-best]')?.textContent).toBe('Learns best by: Listening')
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Taught again: Sarah')
  })

  it('shows what was found in this tab, a way that did not work included', async () => {
    saveReteach(sessionStorage, { parts: [part(5, 'Simultaneous equations', 'pictures', ['read', 'pictures']), part(6, 'Quadratic inequalities', null, ['listen', 'read'])] })
    render(<ReteachCard name="Sarah" />)
    await act(async () => {})
    const rows = Array.from(document.querySelectorAll('[data-reteach-part]'))
    expect(rows.map((r) => r.textContent)).toEqual(['Simultaneous equationsWorked: PicturesTried: Reading, Pictures', 'Quadratic inequalitiesNot yetTried: Listening, Reading'])
    expect(document.querySelector('[data-learns-best]')?.textContent).toBe('Learns best by: Pictures')
  })

  it('says so when the lesson was done in this tab and the missed parts were not taught again', async () => {
    saveTourResult(sessionStorage, [false, false, false, false, false])
    render(<ReteachCard name="Sarah" />)
    await act(async () => {})
    expect(document.querySelector('[data-reteach="none"]')?.textContent).toBe('Sarah has not been taught the missed parts again yet.')
    expect(document.querySelector('[data-learns-best]')).toBeNull()
  })

  it('is on the class page of the topic, in the column with the learners', async () => {
    render(await TourTeacherTopicPage({ params: Promise.resolve({ part: 'algebra', topic: 'equations' }) }))
    await act(async () => {})
    const card = document.querySelector('section[aria-labelledby="reteach"]') as HTMLElement
    expect(card).not.toBeNull()
    expect(card.querySelector('[data-learns-best]')?.textContent).toBe('Learns best by: Listening')
    expect(card.querySelectorAll('[data-reteach-part]')).toHaveLength(2)
  })
})

describe('the tour files after P153', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name)
      return statSync(full).isDirectory() ? walk(full) : [full]
    })
  const files = walk(join(webRoot, 'app/tour')).filter((f) => /\.(ts|tsx)$/.test(f))

  it('never imports the server actions of the lessons or the data layer', () => {
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      expect(src, file).not.toMatch(/startTopicLesson|answerLessonQuestion|finishTopicLesson/)
      expect(src, file).not.toMatch(/k\/learn\/actions/)
      expect(src, file).not.toMatch(/@\/lib\/data/)
    }
  })

  it('has no em dash in the library, the new files or their words', () => {
    for (const file of [...files, join(webRoot, 'app/tour/data/library.json')]) expect(readFileSync(file, 'utf8'), file).not.toContain(String.fromCharCode(0x2014))
  })
})
