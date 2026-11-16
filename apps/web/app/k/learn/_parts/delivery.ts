import type { BlockForChild } from '@/lib/teaching'

// Three deliveries of one lesson (P142): Read, Pictures, Listen. The learner's style is an EMPHASIS, never an exclusion: Listen keeps the pictures,
// Pictures keeps the words, Read keeps the pictures. The blocks are the same and come in the same order in all three; only how a block is shown changes.
// Pure: no browser, no database, so the rules are tested without either.

export const DELIVERIES = ['read', 'pictures', 'listen'] as const
export type Delivery = (typeof DELIVERIES)[number]

/** The key the choice is kept under on the device (localStorage). */
export const DELIVERY_KEY = 'jemma.delivery'

export const DELIVERY_LABEL: Record<Delivery, string> = { read: 'Read', pictures: 'Pictures', listen: 'Listen' }

const FORMAT_DELIVERY = { reading: 'read', diagram: 'pictures', audio: 'listen' } as const
const FORMAT_ORDER = ['reading', 'diagram', 'audio'] as const

/**
 * The delivery a lesson opens in: the format the learner did best in (the trials Jemma already keeps: a diagram lesson is Pictures, a reading lesson is
 * Read, an audio memo is Listen), by the average score of each. No trials, or no format ahead of Read: Read.
 */
export function defaultDelivery(trials: { format: 'reading' | 'diagram' | 'audio'; score: number }[]): Delivery {
  let best: (typeof FORMAT_ORDER)[number] | null = null
  let bestAverage = -Infinity
  for (const format of FORMAT_ORDER) {
    const scores = trials.filter((t) => t.format === format).map((t) => t.score)
    if (scores.length === 0) continue
    const average = scores.reduce((a, b) => a + b, 0) / scores.length
    if (average > bestAverage) {
      best = format
      bestAverage = average
    }
  }
  return best ? FORMAT_DELIVERY[best] : 'read'
}

/** The device's storage, or null where even touching it fails (some private browsing modes). */
export function deviceStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** The saved choice of this device, or null when nothing (or something this version does not know) is saved, or the store cannot be read. */
export function readDelivery(store: Pick<Storage, 'getItem'> | null): Delivery | null {
  try {
    const value = store?.getItem(DELIVERY_KEY)
    return (DELIVERIES as readonly string[]).includes(value ?? '') ? (value as Delivery) : null
  } catch {
    return null
  }
}

/** Keeps the choice on this device. A store that cannot be written (private browsing) is ignored: the choice then lasts for the visit. */
export function saveDelivery(store: Pick<Storage, 'setItem'> | null, delivery: Delivery): void {
  try {
    store?.setItem(DELIVERY_KEY, delivery)
  } catch {
    // Not kept. The lesson goes on in the delivery chosen.
  }
}

export type BlockView = {
  /** `full`: all the words. `first-sentence`: the first sentence, the rest under "More". `collapsed`: the words under "Show words", the voice has them. */
  showText: 'full' | 'first-sentence' | 'collapsed'
  /** The block's picture comes before its words. */
  diagramFirst: boolean
  /** The block's picture is drawn as wide as the screen allows. */
  diagramLarge: boolean
  /** The block has a voice (a button that reads its `speech`). */
  speak: boolean
  /** The steps of a worked example are shown one tap at a time. */
  revealSteps: boolean
}

const hasPicture = (b: BlockForChild): boolean =>
  b.kind === 'diagram' || ((b.kind === 'worked' || b.kind === 'mistake') && !!b.diagram) || (b.kind === 'try' && !!b.question.diagram)

/**
 * How one block is shown in a delivery (the table of the design, 6.2):
 * - Read: every block whole, pictures at normal size, no voice.
 * - Pictures: an explanation shortened to its first sentence with "More"; a block with a picture shows it first and large; the steps of a worked example
 *   appear one tap at a time. No words are dropped: a try question, a mistake and a worked example keep all their text.
 * - Listen: a voice for every block; the words of an explanation sit under "Show words"; every picture stays; the steps of a worked example appear one
 *   tap at a time (or all at once while the voice reads the block).
 */
export function blockView(block: BlockForChild, delivery: Delivery): BlockView {
  const picture = hasPicture(block)
  return {
    showText: block.kind === 'explain' && delivery === 'pictures' ? 'first-sentence' : block.kind === 'explain' && delivery === 'listen' ? 'collapsed' : 'full',
    diagramFirst: delivery === 'pictures' && picture,
    diagramLarge: delivery === 'pictures' && picture,
    speak: delivery === 'listen',
    revealSteps: delivery !== 'read' && block.kind === 'worked',
  }
}

/** The words a voice says for a block: its `speech`, never the written maths (the generator's checks keep symbols out of it). */
export const speechOf = (block: BlockForChild): string => block.speech

/** The first sentence of a text and the rest. A full stop inside a number ("3.5") ends nothing; a blank line ends the first part too. */
export function firstSentence(text: string): { first: string; rest: string } {
  const ends = /[.!?](?=\s|$)/.exec(text)
  let cut = ends ? ends.index + 1 : -1
  const paragraph = text.indexOf('\n\n')
  if (paragraph !== -1 && (cut === -1 || paragraph < cut)) cut = paragraph
  if (cut === -1 || cut >= text.length) return { first: text.trim(), rest: '' }
  return { first: text.slice(0, cut).trim(), rest: text.slice(cut).trim() }
}
