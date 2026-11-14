import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LearnAudio } from '../app/k/session/_parts/LearnAudio'
import { LearnCards } from '../app/k/session/_parts/LearnCards'
import { LearnDiagram } from '../app/k/session/_parts/LearnDiagram'
import type { LessonForChild } from '../app/k/session/[sessionId]/types'

// The lesson cards and captions draw a fraction as a fraction. Same words, same headings for a screen reader.

const base: LessonForChild = { title: 'Lesson', format: 'reading', minutes: 5, topicName: 'Fractions', warmupCount: 2, tryCount: 5, first: null }
const drawn = (el: Element) => {
  const copy = el.cloneNode(true) as HTMLElement
  copy.querySelectorAll('.sr-only').forEach((e) => e.remove())
  return copy.textContent ?? ''
}

describe('reading cards', () => {
  const lesson: LessonForChild = {
    ...base,
    cards: [
      { heading: 'Why 1/2 + 1/4 is 3/4', body: 'Make the bottoms match: 1/2 + 1/4 = 3/4' },
      { heading: 'Make the bottoms match first', body: 'A half is the same as 2/4, so you can add.' },
      { heading: 'No fractions here', body: 'Take your time.' },
    ],
  }

  it('a card with a sum draws it stacked, and its heading is still read as it was written', () => {
    render(<LearnCards lesson={lesson} card={0} onBack={() => {}} onNext={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Why 1/2 + 1/4 is 3/4' })).toBeTruthy()
    const body = screen.getByText(/Make the bottoms match:/).closest('p')!
    expect(drawn(body)).not.toContain('/')
    expect(body.querySelectorAll('span.inline-flex')).toHaveLength(3)
    expect(body.querySelector('.sr-only')!.textContent).toBe('1/2 + 1/4 = 3/4')
  })

  it('a fraction inside a sentence is stacked too', () => {
    render(<LearnCards lesson={lesson} card={1} onBack={() => {}} onNext={() => {}} />)
    const body = screen.getByText('A half is the same as 2/4, so you can add.').closest('p')!
    expect(body.querySelectorAll('span.inline-flex')).toHaveLength(1)
    expect(drawn(body)).toBe('A half is the same as 24, so you can add.')
  })

  it('words without a fraction are untouched', () => {
    render(<LearnCards lesson={lesson} card={2} onBack={() => {}} onNext={() => {}} />)
    expect(screen.getByText('Take your time.').closest('p')!.innerHTML).toBe('Take your time.')
  })
})

describe('the diagram lesson', () => {
  const lesson: LessonForChild = {
    ...base,
    format: 'diagram',
    title: 'Why 1/2 + 1/4 is 3/4',
    diagram: {
      title: 'Why 1/2 + 1/4 is 3/4',
      caption: 'Cut the half into quarters, then add.',
      steps: [
        { caption: 'Start with 1/2 and 1/4.', diagram: { kind: 'fraction_bar', rows: [{ parts: 2, shaded: 1, label: '1/2' }, { parts: 4, shaded: 1, label: '1/4' }] } },
        { caption: 'Cut the half in two.', diagram: { kind: 'fraction_bar', rows: [{ parts: 4, shaded: 2 }] } },
      ],
      contrast: { caption: 'You cannot add the bottoms.', diagram: { kind: 'fraction_bar', rows: [{ parts: 6, shaded: 2, label: '2/6' }] } },
    },
  }

  it('the title and each step caption draw their fractions stacked', () => {
    render(<LearnDiagram lesson={lesson} onReady={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Why 1/2 + 1/4 is 3/4' })).toBeTruthy()
    const caption = screen.getByText('Start with 1/2 and 1/4.').parentElement!
    expect(caption.querySelectorAll('span.inline-flex')).toHaveLength(2)
    expect(drawn(caption)).toBe('1Start with 12 and 14.')
  })

  it('the "Why not" box keeps its words as they are', () => {
    render(<LearnDiagram lesson={lesson} onReady={() => {}} />)
    expect(screen.getByText('Why not 2/6?')).toBeTruthy()
  })
})

describe('the audio memo', () => {
  const lesson: LessonForChild = {
    ...base,
    format: 'audio',
    title: 'Why we cannot add the bottoms',
    audio: { script: 'Lots of people write 2/6 for a half plus a quarter.\nBut the bottom is the size of the pieces.', url: null },
  }

  it('the read-along text draws its fractions stacked', () => {
    vi.stubGlobal('speechSynthesis', undefined)
    render(<LearnAudio lesson={lesson} firstName="Amina" onReady={() => {}} />)
    const line = screen.getByText('Lots of people write 2/6 for a half plus a quarter.').closest('p')!
    expect(line.querySelectorAll('span.inline-flex')).toHaveLength(1)
    expect(drawn(line)).toBe('Lots of people write 26 for a half plus a quarter.')
    fireEvent.click(screen.getByRole('button', { name: "I'm ready" }))
    vi.unstubAllGlobals()
  })
})
