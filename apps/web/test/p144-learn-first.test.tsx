import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibraryEntry } from '../lib/teaching'

// P144: the Learn step of a practice. A topic that has lessons in the library shows "Learn it first" (the lessons with a tick for each one done, a button
// to start or go on, and "I know this, go to practice"). A topic without lessons shows the Learn step exactly as it always was: the cards, the diagram or
// the audio memo. The server actions and the router are doubles: no server, no browser, no database.

const actions = vi.hoisted(() => ({ beginSession: vi.fn(), answer: vi.fn(), finishSession: vi.fn(), paperProgress: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/app/k/session/[sessionId]/actions', () => actions)
// The three screens a Learn step has always been: spies, so the tests can tell which one was drawn.
vi.mock('@/app/k/session/_parts/LearnCards', () => ({ LearnCards: () => <div data-testid="learn-cards" />, LearnBadge: () => null, CARDS_ICON: null, DIAGRAM_ICON: null, AUDIO_ICON: null }))
vi.mock('@/app/k/session/_parts/LearnDiagram', () => ({ LearnDiagram: () => <div data-testid="learn-diagram" /> }))
vi.mock('@/app/k/session/_parts/LearnAudio', () => ({ LearnAudio: () => <div data-testid="learn-audio" /> }))

import { LearnFirstPanel } from '../app/k/learn/_parts/LearnFirstPanel'
import { SessionFlow } from '../app/k/session/[sessionId]/SessionFlow'

const entry = (position: number, over: Partial<LibraryEntry> = {}): LibraryEntry => ({ id: `l${position}`, position, title: `Lesson title ${position}`, minutes: 10 + position, done: false, started: false, ...over })
const SESSION = '0b2c6e0e-1111-4222-8333-444455556666'

describe('LearnFirstPanel', () => {
  const panel = (library: LibraryEntry[], onSkip = vi.fn()) => {
    render(<LearnFirstPanel library={library} topicId="topic-1" sessionId={SESSION} topic="Common fractions" onSkip={onSkip} />)
    return onSkip
  }

  it('says "Learn it first" and lists the lessons in order with their length', () => {
    panel([entry(1), entry(2), entry(3)])
    expect(screen.getByRole('heading', { level: 1, name: 'Learn it first' })).toBeTruthy()
    expect(screen.getByText('Common fractions')).toBeTruthy()
    const rows = within(screen.getByRole('list', { name: 'Lessons' })).getAllByRole('listitem')
    expect(rows.map((r) => r.textContent)).toEqual(['1Lesson title 111 min\u203a', '2Lesson title 212 min\u203a', '3Lesson title 313 min\u203a'])
  })

  it('names the topic without "(Term N)": the lessons are the same for both teachings', () => {
    render(<LearnFirstPanel library={[entry(1)]} topicId="topic-1" sessionId={SESSION} topic="Common fractions (Term 4)" onSkip={vi.fn()} />)
    expect(screen.getByText('Common fractions')).toBeTruthy()
    expect(screen.queryByText(/Term 4/)).toBeNull()
  })

  it('offers "Start lesson 1" when nothing was opened, and opens it from this practice', () => {
    panel([entry(1), entry(2)])
    const start = screen.getByRole('link', { name: 'Start lesson 1' })
    expect(start.getAttribute('href')).toBe(`/k/learn/topic-1/1?session=${SESSION}`)
  })

  it('offers "Continue lesson 2" when lesson 1 is done and lesson 2 was begun, and ticks lesson 1', () => {
    panel([entry(1, { done: true, started: true }), entry(2, { started: true }), entry(3)])
    expect(screen.getByRole('link', { name: 'Continue lesson 2' }).getAttribute('href')).toBe(`/k/learn/topic-1/2?session=${SESSION}`)
    const rows = within(screen.getByRole('list', { name: 'Lessons' })).getAllByRole('listitem')
    expect(rows[0]!.textContent).toContain('Done')
    expect(rows[1]!.textContent).toContain('Started')
    expect(rows[2]!.textContent).not.toMatch(/Done|Started/)
  })

  it('offers to read lesson 1 again when every lesson is done', () => {
    panel([entry(1, { done: true, started: true }), entry(2, { done: true, started: true })])
    expect(screen.getByRole('link', { name: 'Read lesson 1 again' })).toBeTruthy()
  })

  it('"I know this, go to practice" goes on to the questions', () => {
    const onSkip = panel([entry(1), entry(2)])
    fireEvent.click(screen.getByRole('button', { name: 'I know this, go to practice' }))
    expect(onSkip).toHaveBeenCalledTimes(1)
  })
})

describe('the Learn step of a practice session', () => {
  const lesson = {
    title: 'Equivalent fractions',
    format: 'diagram' as const,
    minutes: 10,
    topicName: 'Common fractions',
    cards: [{ heading: 'h', body: 'b' }],
    diagram: { title: 't', caption: 'c', steps: [{ caption: 's', diagram: { kind: 'fraction_bar' as const, rows: [{ parts: 4, shaded: 1 }] } }] },
    warmupCount: 0,
    tryCount: 5,
    first: { position: 1, phase: 'try' as const, index: 1, of: 5, prompt: 'What is 2 + 3?', render: 'text' as const, answerKind: 'whole' as const },
    paper: [],
  }

  const flow = async (props: { library?: LibraryEntry[]; libraryTopicId?: string } = {}) => {
    render(<SessionFlow sessionId={SESSION} firstName="Amina" warmup={[]} tryCount={5} topic="Common fractions" {...props} />)
    await act(async () => {})
  }

  beforeEach(() => {
    for (const fn of Object.values(actions)) fn.mockReset()
    actions.beginSession.mockResolvedValue({ lesson, paper: 'none' })
  })
  afterEach(() => cleanup())

  it('a topic with no lessons shows the Learn step it always had (a diagram lesson: the diagram)', async () => {
    await flow()
    expect(screen.getByTestId('learn-diagram')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Learn it first' })).toBeNull()
  })

  it('an empty library is the same as no library', async () => {
    await flow({ library: [], libraryTopicId: 'topic-1' })
    expect(screen.getByTestId('learn-diagram')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Learn it first' })).toBeNull()
  })

  it('keeps the cards and the audio memo as they were for a topic with no lessons', async () => {
    actions.beginSession.mockResolvedValue({ lesson: { ...lesson, format: 'reading' }, paper: 'none' })
    await flow()
    expect(screen.getByTestId('learn-cards')).toBeTruthy()
    cleanup()
    actions.beginSession.mockResolvedValue({ lesson: { ...lesson, format: 'audio', audio: { script: 'Hello.', url: null } }, paper: 'none' })
    await flow()
    expect(screen.getByTestId('learn-audio')).toBeTruthy()
  })

  it('a topic with lessons shows "Learn it first" instead of the generated cards, diagram or audio', async () => {
    await flow({ library: [entry(1), entry(2)], libraryTopicId: 'topic-1' })
    expect(screen.getByRole('heading', { name: 'Learn it first' })).toBeTruthy()
    for (const id of ['learn-diagram', 'learn-cards', 'learn-audio']) expect(screen.queryByTestId(id)).toBeNull()
    expect(screen.getByRole('link', { name: 'Start lesson 1' }).getAttribute('href')).toBe(`/k/learn/topic-1/1?session=${SESSION}`)
  })

  it('lessons without the id of their topic cannot be opened, so the Learn step is as it always was', async () => {
    await flow({ library: [entry(1)] })
    expect(screen.getByTestId('learn-diagram')).toBeTruthy()
  })

  it('"I know this, go to practice" starts the questions, as "I\'m ready" does', async () => {
    await flow({ library: [entry(1)], libraryTopicId: 'topic-1' })
    fireEvent.click(screen.getByRole('button', { name: 'I know this, go to practice' }))
    expect(await screen.findByText('Question 1 of 5')).toBeTruthy()
    expect(screen.getByText('What is 2 + 3?')).toBeTruthy()
  })

  it('still shows the step header with Learn as the step the learner is on', async () => {
    await flow({ library: [entry(1)], libraryTopicId: 'topic-1' })
    expect(screen.getByRole('list', { name: 'Session steps' }).querySelector('[aria-current="step"]')?.textContent).toBe('Learn')
  })
})
