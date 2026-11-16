import { fractionsIn } from '@jemma/profiling/logic'
import { hasMath } from './Frac'
import { hasTypeset, type TypesetMode } from './typeset'

// P130: a question may be long. A prompt is cut into its context (sentences of words, in normal text) and its maths line (the sentence that holds the
// maths, or the question when no sentence does), which is drawn large and typeset. Pure functions: no screen here. The words of the prompt are never
// changed or dropped; the screens still carry the whole prompt as `data-prompt` and as the plain words for a screen reader.

/** A prompt up to this many letters is one block, drawn big, exactly as it always was. */
export const SHORT_PROMPT = 60
/** The most letters of a maths line that still get the middle size (26 px); a longer one gets the smallest (22 px). */
export const MEDIUM_PROMPT = 110
/** On a results card the question stays beside "Question N" only when it is this short: a longer one gets the whole width under the number. */
export const BESIDE_NUMBER = 30

/**
 * The cut points: a full stop, question mark or exclamation mark (and a closing bracket or quote after it) followed by a space and then anything but a
 * small letter (so "2.5", "R4,50" and "approx. three" are not cut), and a colon that ends a line. No look-behind: an older phone cannot read one.
 */
const BOUNDARY = /[.?!]+[)"'”’\]]*\s+(?=[^\sa-z])|:[ \t]*\r?\n\s*/g

/** The sentences of a prompt, each trimmed, in order. A prompt with no cut point is one sentence; an empty one is none. */
export function sentencesOf(text: string): string[] {
  const out: string[] = []
  let at = 0
  for (const m of text.matchAll(BOUNDARY)) {
    const piece = text.slice(at, m.index + m[0].trimEnd().length).trim()
    if (piece) out.push(piece)
    at = m.index + m[0].length
  }
  const last = text.slice(at).trim()
  if (last) out.push(last)
  return out
}

/** A sentence holds maths when some of it is typeset, has a power or a root, or has a fraction (a missing part of one too). */
const holdsMaths = (sentence: string, mode: TypesetMode): boolean => hasTypeset(sentence, mode) || hasMath(sentence) || fractionsIn(sentence).length > 0

/** 0 is today's size (30 px), 1 the middle (26 px), 2 the smallest (22 px): by the length of the large line. */
export type Step = 0 | 1 | 2
const stepOf = (line: string): Step => (line.length <= SHORT_PROMPT ? 0 : line.length <= MEDIUM_PROMPT ? 1 : 2)

export type PromptLayout = {
  /** True when the prompt is cut into context and a maths line; false when it is one block as it always was. */
  split: boolean
  /** The context before the maths line, in normal text ('' when there is none). */
  before: string
  /** The large line: the maths line of a word problem, or the whole prompt when it is not cut. */
  line: string
  /** Sentences after the maths line ("Then write down what you found."), in normal text. */
  after: string
  step: Step
}

/**
 * How a prompt is laid out. A prompt of one sentence, or of up to `SHORT_PROMPT` letters, is one block (so every question of the demo class is drawn
 * as before). A longer prompt of two sentences or more has the last sentence that holds maths as its maths line (the last sentence when none does);
 * the sentences before it are the context, and any after it come last, also in normal text. `mode` is how the screen typesets a question.
 */
export function promptLayout(prompt: string, mode: TypesetMode): PromptLayout {
  const text = prompt.trim()
  const sentences = sentencesOf(text)
  if (sentences.length < 2 || text.length <= SHORT_PROMPT) return { split: false, before: '', line: prompt, after: '', step: stepOf(text) }
  let at = sentences.length - 1
  for (let i = sentences.length - 1; i >= 0; i--) {
    if (holdsMaths(sentences[i]!, mode)) {
      at = i
      break
    }
  }
  const line = sentences[at]!
  return { split: true, before: sentences.slice(0, at).join(' '), line, after: sentences.slice(at + 1).join(' '), step: stepOf(line) }
}

/** True when a results card may keep the question beside "Question N": one short sentence. Anything longer has the whole width under the number. */
export const besideNumber = (prompt: string): boolean => prompt.trim().length <= BESIDE_NUMBER && sentencesOf(prompt.trim()).length < 2
