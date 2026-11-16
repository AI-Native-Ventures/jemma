import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibraryEntry, TeachingLessonForChild } from '../lib/teaching'
import type { Delivery } from '../app/k/learn/_parts/delivery'

// P144: the lesson reader in its three deliveries. The same blocks in the same order in all three; the pictures stay in Listen, the words stay in Pictures;
// the voice says `speech` and nothing else; an answer goes to the server and nothing about it is on the page before. The server actions are doubles, the
// voice is a double: no database, no browser, no model.

const actions = vi.hoisted(() => ({
  answerLessonQuestion: vi.fn(),
  startTopicLesson: vi.fn(async () => undefined),
  finishTopicLesson: vi.fn(async () => undefined),
}))
vi.mock('../app/k/learn/actions', () => actions)

import { LessonReader } from '../app/k/learn/_parts/LessonReader'

const picture = { kind: 'fraction_bar' as const, rows: [{ parts: 4, shaded: 1 }] }
const step = (line: string, reason: string) => ({ line, reason })

const lesson: TeachingLessonForChild = {
  position: 1,
  title: 'Adding fractions',
  minutes: 12,
  objectives: ['You will be able to add fractions.', 'You will be able to find a common bottom number.'],
  keyWords: [{ word: 'denominator', meaning: 'The bottom number of a fraction.' }],
  blocks: [
    { kind: 'explain', text: 'A fraction is part of a whole. The bottom number says how many equal parts.', speech: 'A fraction is part of a whole, said in words.' },
    { kind: 'diagram', spec: picture, caption: 'One quarter is shaded', speech: 'One part of four is shaded.' },
    { kind: 'worked', problem: 'Add one half and one quarter', steps: [step('1/2 = 2/4', 'Same bottom number.'), step('2/4 + 1/4 = 3/4', 'Add the tops.'), step('3/4', 'That is the sum.')], answer: '3/4', answerKind: 'fraction', speech: 'Worked speech in words.' },
    { kind: 'explain', text: 'Always make the bottom numbers the same first.', speech: 'Make the bottoms the same first.' },
    { kind: 'worked', problem: 'Add one third and one sixth', steps: [step('1/3 = 2/6', 'Same bottom number.'), step('2/6 + 1/6 = 3/6', 'Add the tops.')], answer: '1/2', answerKind: 'fraction', speech: 'Second worked speech.', diagram: picture },
    { kind: 'try', question: { prompt: 'What is 2 + 3?', render: 'text', answerKind: 'whole' }, hint: 'Count on from two.', speech: 'Now you try, in words.' },
    { kind: 'mistake', wrong: '1/2 + 1/4 = 2/6', right: '1/2 + 1/4 = 3/4', why: 'Never add the bottom numbers.', speech: 'Do not add the bottoms.', diagram: picture },
    { kind: 'explain', text: 'That is all for this part.', speech: 'That is all.' },
  ],
  summary: ['Make the bottoms the same.', 'Add the tops.', 'Keep the bottom.'],
  practice: [1, 2, 3].map((n) => ({ prompt: `Practice question ${n}`, render: 'text' as const, answerKind: 'whole' as const })),
}

const entry: LibraryEntry = { id: 'lesson-1', position: 1, title: 'Adding fractions', minutes: 12, done: false, started: false }
const source = { kind: 'siyavula' as const, title: 'Everything Maths', address: '/read/za/mathematics/grade-6/fractions', credit: 'Based on Siyavula Everything Maths, Grade 6, fractions, CC BY 3.0' }

const reader = (initialDelivery: Delivery, over: Partial<Parameters<typeof LessonReader>[0]> = {}) =>
  render(<LessonReader topicId="topic-1" topicName="Common fractions" grade={6} entry={entry} count={2} lesson={lesson} source={source} next={{ position: 2, title: 'Subtracting fractions' }} session={null} initialDelivery={initialDelivery} {...over} />)

const kinds = (container: HTMLElement) => [...container.querySelectorAll('[data-block]')].map((el) => el.getAttribute('data-block'))
const pictures = (container: HTMLElement) => container.querySelectorAll('[data-picture]').length

const spoken = vi.hoisted(() => ({ said: [] as string[], utterances: [] as { text: string; onend: (() => void) | null; onerror: (() => void) | null }[] }))
function giveVoice() {
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
  vi.stubGlobal('speechSynthesis', { speak: vi.fn((u: Utterance) => (spoken.said.push(u.text), spoken.utterances.push(u))), cancel: vi.fn() })
  Object.defineProperty(window, 'speechSynthesis', { value: (globalThis as { speechSynthesis: unknown }).speechSynthesis, configurable: true })
}

beforeEach(() => {
  window.localStorage.clear()
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
  spoken.said = []
  spoken.utterances = []
  actions.answerLessonQuestion.mockReset()
  actions.startTopicLesson.mockClear()
  actions.finishTopicLesson.mockClear()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  // `speechSynthesis` was also put on `window` by hand
  Reflect.deleteProperty(window, 'speechSynthesis')
})

describe('the three deliveries of one lesson', () => {
  it('have the same blocks in the same order, and every picture, in all three', () => {
    giveVoice()
    const seen = (['read', 'pictures', 'listen'] as const).map((d) => {
      const { container, unmount } = reader(d)
      const out = { kinds: kinds(container), pictures: pictures(container) }
      unmount()
      return out
    })
    expect(seen[0]!.kinds).toEqual(['explain', 'diagram', 'worked', 'explain', 'worked', 'try', 'mistake', 'explain'])
    expect(seen[1]!.kinds).toEqual(seen[0]!.kinds)
    expect(seen[2]!.kinds).toEqual(seen[0]!.kinds)
    // the picture block, a picture inside a worked example, and one inside the mistake: Listen and Pictures keep every one Read has
    expect(seen[0]!.pictures).toBe(3)
    expect(seen[1]!.pictures).toBe(3)
    expect(seen[2]!.pictures).toBe(3)
  })

  it('Read shows every word and every step of a worked example, and no voice', () => {
    giveVoice()
    reader('read')
    expect(screen.getByText(/The bottom number says how many equal parts/)).toBeTruthy()
    expect(screen.getAllByRole('list', { name: 'Steps' })[0]!.querySelectorAll('li')).toHaveLength(3)
    expect(screen.queryByRole('button', { name: 'Read this part aloud' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Show the first step' })).toBeNull()
    expect(screen.getByRole('radio', { name: 'Read' }).getAttribute('aria-checked')).toBe('true')
  })

  it('Pictures shortens an explanation to its first sentence and keeps the rest under More', () => {
    reader('pictures')
    expect(screen.queryByText(/The bottom number says how many equal parts/)).toBeNull()
    expect(screen.getByText(/A fraction is part of a whole\./)).toBeTruthy()
    const more = screen.getAllByRole('button', { name: 'More' })[0]!
    expect(more.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(more)
    expect(screen.getByText(/The bottom number says how many equal parts/)).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Less' })).toHaveLength(1)
  })

  it('Pictures draws the picture of a block large and before its words', () => {
    const { container } = reader('pictures')
    expect([...container.querySelectorAll('[data-picture]')].every((el) => el.getAttribute('data-size') === 'large')).toBe(true)
    const mistake = container.querySelector('[data-block="mistake"]')!
    // the block's header is its first child, and the picture is the next thing, before the two ways
    expect(mistake.children[1]!.hasAttribute('data-picture')).toBe(true)
    // without Pictures the picture comes after them
    cleanup()
    const read = reader('read').container.querySelector('[data-block="mistake"]')!
    expect(read.children[1]!.hasAttribute('data-picture')).toBe(false)
    expect(read.querySelector('[data-picture]')?.getAttribute('data-size')).toBe('normal')
  })

  it('Pictures and Listen show the steps of a worked example one tap at a time, then the answer', () => {
    giveVoice()
    for (const d of ['pictures', 'listen'] as const) {
      const { container, unmount } = reader(d)
      const worked = within(container.querySelector('[data-block="worked"]') as HTMLElement)
      expect(worked.queryAllByRole('listitem')).toHaveLength(0)
      fireEvent.click(worked.getByRole('button', { name: 'Show the first step' }))
      expect(worked.getAllByRole('listitem')).toHaveLength(1)
      expect(container.querySelector('[data-block="worked"] [data-answer]')).toBeNull()
      fireEvent.click(worked.getByRole('button', { name: 'Show step 2 of 3' }))
      fireEvent.click(worked.getByRole('button', { name: 'Show step 3 of 3' }))
      expect(worked.getAllByRole('listitem')).toHaveLength(3)
      expect(container.querySelector('[data-block="worked"] [data-answer]')).not.toBeNull()
      unmount()
    }
  })
})

describe('Listen', () => {
  it('has a voice button on every block, the words of an explanation under "Show words", and every picture', () => {
    giveVoice()
    const { container } = reader('listen')
    return waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Read this part aloud' })).toHaveLength(8)
      expect(screen.queryByText(/The bottom number says how many equal parts/)).toBeNull()
      expect(screen.getAllByRole('button', { name: 'Show words' })).toHaveLength(3)
      expect(pictures(container)).toBe(3)
    })
  })

  it('says the speech of a block, never the written words or maths', async () => {
    giveVoice()
    reader('listen')
    const buttons = await screen.findAllByRole('button', { name: 'Read this part aloud' })
    fireEvent.click(buttons[0]!)
    fireEvent.click(buttons[2]!)
    expect(spoken.said).toEqual(['A fraction is part of a whole, said in words.', 'Worked speech in words.'])
    for (const said of spoken.said) {
      expect(said).not.toContain('bottom number says')
      expect(said).not.toContain('2/4')
    }
  })

  it('Play all reads the blocks from the first, goes on to the next block when one is finished, and the button says Stop', async () => {
    giveVoice()
    reader('listen')
    fireEvent.click(await screen.findByRole('button', { name: 'Play all' }))
    expect(spoken.said).toEqual(['A fraction is part of a whole, said in words.'])
    expect(screen.getByRole('button', { name: 'Stop reading' }).getAttribute('aria-pressed')).toBe('true')
    // the first text ends: the voice goes on with the second block, and then the third (a worked example)
    act(() => spoken.utterances[0]!.onend?.())
    expect(spoken.said).toEqual(['A fraction is part of a whole, said in words.', 'One part of four is shaded.'])
    act(() => spoken.utterances[1]!.onend?.())
    expect(spoken.said[2]).toBe('Worked speech in words.')
  })

  it('a block read on its own stops at its end, and a voice that fails stops Play all', async () => {
    giveVoice()
    reader('listen')
    const buttons = await screen.findAllByRole('button', { name: 'Read this part aloud' })
    fireEvent.click(buttons[0]!)
    act(() => spoken.utterances[0]!.onend?.())
    expect(spoken.said).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Play all' }))
    expect(spoken.said).toHaveLength(2)
    act(() => spoken.utterances[1]!.onerror?.())
    expect(screen.getByRole('button', { name: 'Play all' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('on a phone that cannot speak shows all the words and says so, with no voice button', async () => {
    reader('listen')
    expect(await screen.findByText(/cannot read aloud here/)).toBeTruthy()
    expect(screen.getByText(/The bottom number says how many equal parts/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Read this part aloud' })).toBeNull()
  })
})

describe('the switch', () => {
  it('opens in the delivery the learner\'s best format gives', () => {
    reader('pictures')
    expect(screen.getByRole('radio', { name: 'Pictures' }).getAttribute('aria-checked')).toBe('true')
  })

  it('a choice kept on the device wins, and a new choice is kept', async () => {
    window.localStorage.setItem('jemma.delivery', 'listen')
    reader('read')
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Listen' }).getAttribute('aria-checked')).toBe('true'))
    fireEvent.click(screen.getByRole('radio', { name: 'Pictures' }))
    expect(window.localStorage.getItem('jemma.delivery')).toBe('pictures')
    expect(screen.getByRole('radio', { name: 'Pictures' }).getAttribute('aria-checked')).toBe('true')
  })

  it('a value it does not know is left alone', () => {
    window.localStorage.setItem('jemma.delivery', 'video')
    reader('read')
    expect(screen.getByRole('radio', { name: 'Read' }).getAttribute('aria-checked')).toBe('true')
  })
})

describe('the lesson around the blocks', () => {
  it('says what the lesson covers, its key words, the summary and where it was written from, with a link', () => {
    reader('read')
    expect(screen.getByRole('heading', { level: 1, name: 'Adding fractions' })).toBeTruthy()
    expect(screen.getByText('Lesson 1 of 2 · 12 min')).toBeTruthy()
    expect(screen.getByText(/find a common bottom number/)).toBeTruthy()
    expect(screen.getByText('denominator')).toBeTruthy()
    expect(screen.getByText('Keep the bottom.')).toBeTruthy()
    expect(document.querySelector('[data-credit]')?.textContent).toContain('Based on Siyavula Everything Maths, Grade 6, fractions, CC BY 3.0')
    expect(screen.getByRole('link', { name: 'See the original' }).getAttribute('href')).toBe('https://www.siyavula.com/read/za/mathematics/grade-6/fractions')
  })

  it('counts the lessons by the highest number, so a lesson that failed its checks leaves a gap and never "Lesson 3 of 2"', () => {
    reader('read', { entry: { ...entry, position: 3 }, count: 3 })
    expect(screen.getByText('Lesson 3 of 3 · 12 min')).toBeTruthy()
  })

  it('tells the server the lesson was opened', async () => {
    reader('read')
    await waitFor(() => expect(actions.startTopicLesson).toHaveBeenCalledWith('lesson-1'))
  })

  it('goes back to the lessons of the topic, and to the practice it came from', () => {
    reader('read', { session: '0b2c6e0e-1111-4222-8333-444455556666' })
    expect(screen.getByRole('link', { name: 'Close the lesson' }).getAttribute('href')).toBe('/k/learn/topic-1?session=0b2c6e0e-1111-4222-8333-444455556666')
  })
})

describe('a try block with a missing number in a fraction', () => {
  const missing: TeachingLessonForChild = {
    ...lesson,
    blocks: lesson.blocks.map((b) => (b.kind === 'try' ? { ...b, question: { prompt: 'Complete: 1/2 = ?/4', render: 'text' as const, answerKind: 'fraction' as const } } : b)),
  }

  it('shows the question as words until the learner opens it, and only then the box inside the fraction', () => {
    const { container } = reader('read', { lesson: missing })
    const block = within(container.querySelector('[data-block="try"]') as HTMLElement)
    expect(block.queryByLabelText('Missing number')).toBeNull()
    expect(block.getByText('Complete: 1/2 = ?/4')).toBeTruthy()
    fireEvent.click(block.getByRole('button', { name: 'Answer this one' }))
    expect(block.getByLabelText('Missing number')).toBeTruthy()
  })
})

describe('a try block', () => {
  it('shows its question at once, opens the answer box on a tap, and has nothing of the answer on the page', () => {
    const { container } = reader('read')
    const block = within(container.querySelector('[data-block="try"]') as HTMLElement)
    expect(block.getByText('What is 2 + 3?')).toBeTruthy()
    expect(block.queryByLabelText('Your answer')).toBeNull()
    fireEvent.click(block.getByRole('button', { name: 'Answer this one' }))
    expect(block.getByLabelText('Your answer')).toBeTruthy()
    expect(block.queryByText('Count on from two.')).toBeNull()
    fireEvent.click(block.getByRole('button', { name: 'Need a hint?' }))
    expect(block.getByText('Count on from two.')).toBeTruthy()
  })

  it('sends the answer to the server with the place of the block, and shows what comes back', async () => {
    actions.answerLessonQuestion.mockResolvedValue({ correct: true, answer: '5', steps: ['2 + 3 = 5'], rightWay: 'Add the two numbers.', why: 'Counting on.' })
    const { container } = reader('read')
    const block = within(container.querySelector('[data-block="try"]') as HTMLElement)
    fireEvent.click(block.getByRole('button', { name: 'Answer this one' }))
    fireEvent.change(block.getByLabelText('Your answer'), { target: { value: '5' } })
    fireEvent.click(block.getByRole('button', { name: 'Check' }))
    await waitFor(() => expect(block.getByText('Yes, that is right.')).toBeTruthy())
    expect(actions.answerLessonQuestion).toHaveBeenCalledWith('lesson-1', { kind: 'try', block: 5 }, '5')
    expect(block.getByText('Add the two numbers.')).toBeTruthy()
  })

  it('says what was right when the answer is wrong, and lets the learner try again', async () => {
    actions.answerLessonQuestion.mockResolvedValue({ correct: false, answer: '5', steps: ['2 + 3 = 5'], rightWay: 'Add the two numbers.', why: 'Counting on.' })
    const { container } = reader('read')
    const block = within(container.querySelector('[data-block="try"]') as HTMLElement)
    fireEvent.click(block.getByRole('button', { name: 'Answer this one' }))
    fireEvent.change(block.getByLabelText('Your answer'), { target: { value: '4' } })
    fireEvent.click(block.getByRole('button', { name: 'Check' }))
    await waitFor(() => expect(block.getByText('Not quite.')).toBeTruthy())
    expect(block.getByText('The answer is:')).toBeTruthy()
    fireEvent.click(block.getByRole('button', { name: 'Try again' }))
    expect(block.getByLabelText('Your answer')).toBeTruthy()
  })

  it('says so, and keeps the box, when the answer could not be sent', async () => {
    actions.answerLessonQuestion.mockRejectedValue(new Error('offline'))
    const { container } = reader('read')
    const block = within(container.querySelector('[data-block="try"]') as HTMLElement)
    fireEvent.click(block.getByRole('button', { name: 'Answer this one' }))
    fireEvent.change(block.getByLabelText('Your answer'), { target: { value: '5' } })
    fireEvent.click(block.getByRole('button', { name: 'Check' }))
    await waitFor(() => expect(block.getByRole('alert').textContent).toContain('did not go through'))
    expect(block.getByLabelText('Your answer')).toBeTruthy()
  })
})

describe('the practice at the end', () => {
  const answerAll = async (correct: boolean[]) => {
    for (let i = 0; i < correct.length; i++) {
      await screen.findByText(`Question ${i + 1} of ${correct.length}`)
      fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: String(i + 1) } })
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
      await waitFor(() => expect(actions.answerLessonQuestion).toHaveBeenCalledTimes(i + 1))
    }
  }

  it('asks the lesson\'s questions one at a time, marks each on the server, saves the score and shows the way on', async () => {
    actions.answerLessonQuestion
      .mockResolvedValueOnce({ correct: true, answer: '1', rightWay: 'way 1', why: 'why 1' })
      .mockResolvedValueOnce({ correct: false, answer: '9', steps: ['step a', 'step b'], rightWay: 'way 2', why: 'why 2' })
      .mockResolvedValueOnce({ correct: true, answer: '3', rightWay: 'way 3', why: 'why 3' })
    reader('read')
    fireEvent.click(screen.getByRole('button', { name: 'Start the practice' }))
    await answerAll([true, false, true])
    expect(actions.answerLessonQuestion.mock.calls.map((c) => [c[1], c[2]])).toEqual([
      [{ kind: 'practice', index: 0 }, '1'],
      [{ kind: 'practice', index: 1 }, '2'],
      [{ kind: 'practice', index: 2 }, '3'],
    ])
    expect(await screen.findByText('You got 2 of 3 right.')).toBeTruthy()
    expect(actions.finishTopicLesson).toHaveBeenCalledWith('lesson-1', 2, 3)
    // the one missed, with the right answer and the way
    expect(screen.getByText('Look at these again')).toBeTruthy()
    expect(screen.getByText('way 2')).toBeTruthy()
    expect(screen.queryByText('way 1')).toBeNull()
    expect(screen.getByRole('link', { name: 'Next lesson: Subtracting fractions' }).getAttribute('href')).toBe('/k/learn/topic-1/2')
    expect(screen.getByRole('link', { name: 'Back to the lessons' }).getAttribute('href')).toBe('/k/learn/topic-1')
  })

  it('has no delivery switch in the practice: it changes nothing there', async () => {
    reader('read')
    expect(screen.getByRole('radiogroup', { name: 'How you want to learn' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Start the practice' }))
    await screen.findByText('Question 1 of 3')
    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(screen.getByRole('progressbar', { name: 'How far you are in the practice' })).toBeTruthy()
  })

  it('offers to save again when the score could not be saved', async () => {
    actions.answerLessonQuestion.mockResolvedValue({ correct: true, answer: '1', rightWay: 'way', why: 'why' })
    actions.finishTopicLesson.mockRejectedValueOnce(new Error('offline'))
    reader('read', { next: null })
    fireEvent.click(screen.getByRole('button', { name: 'Start the practice' }))
    await answerAll([true, true, true])
    fireEvent.click(await screen.findByRole('button', { name: 'Try saving again' }))
    await waitFor(() => expect(actions.finishTopicLesson).toHaveBeenCalledTimes(2))
    // the last lesson has no "next": the way on is back to the lessons
    expect(screen.queryByRole('link', { name: /^Next lesson/ })).toBeNull()
    expect(screen.getByRole('link', { name: 'Back to the lessons' })).toBeTruthy()
  })
})
