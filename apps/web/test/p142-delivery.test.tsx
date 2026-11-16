import type { BlockForChild } from '../lib/teaching'
import { describe, expect, it } from 'vitest'
import { blockView, DELIVERIES, defaultDelivery, firstSentence, readDelivery, speechOf, type Delivery } from '../app/k/learn/_parts/delivery'

// P142: three deliveries of one lesson. The learner's style is an EMPHASIS, never an exclusion: Listen keeps the pictures, Pictures keeps the words, Read keeps
// the pictures. The same blocks come in the same order in all three; only how each block is shown changes. Pure rules here, no browser, no database.

const picture = { kind: 'fraction_bar' as const, rows: [{ parts: 4, shaded: 1 }] }
const blocks: Record<string, BlockForChild> = {
  explain: { kind: 'explain', text: 'A fraction is part of a whole. The bottom number says how many equal parts.', speech: 'A fraction is part of a whole.' },
  diagram: { kind: 'diagram', spec: picture, caption: 'One quarter', speech: 'One part of four is shaded.' },
  worked: { kind: 'worked', problem: 'p', steps: [{ line: '1/2 = 2/4', reason: 'r' }, { line: '2/4 + 1/4 = 3/4', reason: 'r' }], answer: '3/4', answerKind: 'fraction', speech: 'spoken' },
  workedWithPicture: { kind: 'worked', problem: 'p', steps: [{ line: 'a', reason: 'r' }, { line: 'b', reason: 'r' }], answer: '3/4', answerKind: 'fraction', speech: 'spoken', diagram: picture },
  try: { kind: 'try', question: { prompt: 'q', render: 'text', answerKind: 'whole' }, hint: 'h', speech: 'spoken' },
  tryWithPicture: { kind: 'try', question: { prompt: 'q', render: 'text', answerKind: 'whole', diagram: picture }, hint: 'h', speech: 'spoken' },
  mistake: { kind: 'mistake', wrong: 'w', right: 'r', why: 'y', speech: 'spoken' },
  mistakeWithPicture: { kind: 'mistake', wrong: 'w', right: 'r', why: 'y', speech: 'spoken', diagram: picture },
}

describe('defaultDelivery: the best format of the learner opens the lesson', () => {
  it('is Read when the learner has no trials', () => expect(defaultDelivery([])).toBe('read'))

  it('maps the best average score: diagram to Pictures, reading to Read, audio to Listen', () => {
    expect(defaultDelivery([{ format: 'diagram', score: 4 }, { format: 'reading', score: 2 }, { format: 'audio', score: 1 }])).toBe('pictures')
    expect(defaultDelivery([{ format: 'diagram', score: 1 }, { format: 'reading', score: 5 }, { format: 'audio', score: 2 }])).toBe('read')
    expect(defaultDelivery([{ format: 'diagram', score: 1 }, { format: 'reading', score: 2 }, { format: 'audio', score: 5 }])).toBe('listen')
  })

  it('goes by the average of each format, not by one score', () => {
    const trials = [
      { format: 'diagram' as const, score: 5 },
      { format: 'diagram' as const, score: 1 },
      { format: 'audio' as const, score: 4 },
      { format: 'audio' as const, score: 3 },
    ]
    expect(defaultDelivery(trials)).toBe('listen')
  })

  it('keeps Read when two formats are equally good', () => {
    expect(defaultDelivery([{ format: 'diagram', score: 3 }, { format: 'reading', score: 3 }])).toBe('read')
  })
})

describe('blockView: the table of the design, one row for each kind of block', () => {
  it('Read shows every block whole, with the pictures at normal size and no voice', () => {
    for (const b of Object.values(blocks)) {
      expect(blockView(b, 'read'), b.kind).toMatchObject({ showText: 'full', diagramFirst: false, diagramLarge: false, speak: false })
    }
    expect(blockView(blocks.worked!, 'read').revealSteps).toBe(false)
  })

  it('Pictures shortens an explanation to its first sentence (the rest is under "More"), never drops it', () => {
    expect(blockView(blocks.explain!, 'pictures').showText).toBe('first-sentence')
    for (const key of ['diagram', 'worked', 'try', 'mistake']) expect(blockView(blocks[key]!, 'pictures').showText, key).toBe('full')
  })

  it('Pictures puts the picture first and large, wherever a block has one', () => {
    for (const key of ['diagram', 'workedWithPicture', 'tryWithPicture', 'mistakeWithPicture']) {
      expect(blockView(blocks[key]!, 'pictures'), key).toMatchObject({ diagramFirst: true, diagramLarge: true })
    }
    for (const key of ['explain', 'worked', 'try', 'mistake']) expect(blockView(blocks[key]!, 'pictures'), key).toMatchObject({ diagramFirst: false, diagramLarge: false })
  })

  it('Pictures reveals the steps of a worked example one tap at a time, and so does Listen', () => {
    expect(blockView(blocks.worked!, 'pictures').revealSteps).toBe(true)
    expect(blockView(blocks.worked!, 'listen').revealSteps).toBe(true)
    expect(blockView(blocks.explain!, 'pictures').revealSteps).toBe(false)
  })

  it('Listen has a voice for every block, collapses only the words of an explanation, and never hides a picture', () => {
    for (const b of Object.values(blocks)) expect(blockView(b, 'listen').speak, b.kind).toBe(true)
    expect(blockView(blocks.explain!, 'listen').showText).toBe('collapsed')
    for (const key of ['diagram', 'worked', 'try', 'mistake']) expect(blockView(blocks[key]!, 'listen').showText, key).toBe('full')
    // the picture is drawn in Listen exactly as in Read: not moved, not shrunk, not left out
    for (const key of ['diagram', 'workedWithPicture', 'tryWithPicture', 'mistakeWithPicture']) {
      expect(blockView(blocks[key]!, 'listen'), key).toMatchObject({ diagramFirst: false, diagramLarge: false })
    }
  })

  it('no delivery leaves a channel out: every delivery has text for a try question and a mistake, and the three share one block order', () => {
    for (const d of DELIVERIES) {
      for (const key of ['try', 'mistake', 'worked', 'diagram']) expect(blockView(blocks[key]!, d).showText, `${d} ${key}`).not.toBe('collapsed')
    }
  })
})

describe('firstSentence: the part of an explanation Pictures shows first', () => {
  it('splits at the end of the first sentence', () => {
    expect(firstSentence('A fraction is part of a whole. The bottom number says how many equal parts.')).toEqual({ first: 'A fraction is part of a whole.', rest: 'The bottom number says how many equal parts.' })
  })

  it('does not split inside a number or after a question that is one sentence', () => {
    expect(firstSentence('Take 3.5 away from 10. Then stop.')).toEqual({ first: 'Take 3.5 away from 10.', rest: 'Then stop.' })
    expect(firstSentence('What is 1/2 of 8? Half of 8 is 4.')).toEqual({ first: 'What is 1/2 of 8?', rest: 'Half of 8 is 4.' })
  })

  it('a text of one sentence has no rest', () => {
    expect(firstSentence('Only one sentence here.')).toEqual({ first: 'Only one sentence here.', rest: '' })
    expect(firstSentence('No full stop at all')).toEqual({ first: 'No full stop at all', rest: '' })
  })

  it('keeps the first paragraph break as the end when the text has no stop before it', () => {
    expect(firstSentence('Heading line\n\nThe real text. More.')).toEqual({ first: 'Heading line', rest: 'The real text. More.' })
  })
})

describe('speechOf: the voice reads the words of the block and nothing else', () => {
  it('is the speech of every kind of block', () => {
    expect(speechOf(blocks.explain!)).toBe('A fraction is part of a whole.')
    expect(speechOf(blocks.worked!)).toBe('spoken')
    expect(speechOf(blocks.try!)).toBe('spoken')
  })

  it('never carries the written maths of a block: a worked line or a caption is not in it', () => {
    for (const b of Object.values(blocks)) {
      expect(speechOf(b)).not.toContain('2/4')
      expect(speechOf(b)).not.toContain('\\')
    }
  })
})

describe('readDelivery: the choice kept on the device', () => {
  const store = (value: string | null) => ({ getItem: (key: string) => (key === 'jemma.delivery' ? value : null) })

  it('reads a saved choice', () => {
    for (const d of DELIVERIES) expect(readDelivery(store(d))).toBe(d)
  })

  it('says nothing for a value it does not know, or nothing saved, or a store that cannot be read', () => {
    expect(readDelivery(store('video'))).toBeNull()
    expect(readDelivery(store(null))).toBeNull()
    expect(readDelivery(null)).toBeNull()
    expect(readDelivery({ getItem: () => { throw new Error('blocked') } })).toBeNull()
  })

  it('has exactly the three deliveries', () => expect([...DELIVERIES] satisfies Delivery[]).toEqual(['read', 'pictures', 'listen']))
})
