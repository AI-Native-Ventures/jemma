// The voice of the Listen delivery (P144): the browser's own speech (`speechSynthesis`), the one `LearnAudio` already falls back to. It says the `speech` of a
// block, which holds words only. A phone that cannot speak is told so by `canSpeak`, and the lesson then shows the words. The player of the Listen tab
// (`ListenPlayer`) drives it through `useListen`: it can start at a sentence and at a speed.

let current = 0
/** The utterances being said. Chrome drops the end signal of one that nothing refers to any more, so they are kept until they are done or stopped. */
let queued: SpeechSynthesisUtterance[] = []

/** True in a browser that can read aloud. False on the server and in a browser without speech. */
export const canSpeak = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'

/** Stops whatever is being said. What was said before never calls back after this. */
export function stopSpeaking(): void {
  current++
  queued = []
  try {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
  } catch {
    // Nothing was speaking.
  }
}

/** A long text said in one go stops half way in some browsers: it is said sentence by sentence instead. */
export const chunksOf = (text: string): string[] =>
  text
    .replace(/([.!?])\s+/g, '$1\n')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

/** The pace of the voice at speed 1: a little slower than the browser's own, so maths said aloud can be followed. */
export const BASE_RATE = 0.95

export type SpeakOptions = {
  onEnd?: () => void
  onError?: () => void
  /** Called as each sentence starts, with its place in the text from 0. The player keeps it, so a pause carries on at that sentence. */
  onSentence?: (index: number) => void
  /** The sentence to start at, from 0 (where a pause left off). Past the end, the last sentence is said. */
  from?: number
  /** How fast, as a multiple of the usual pace: 1, 1.25, 1.5 or 0.75 in the player. */
  speed?: number
}

/**
 * Says a text. `onEnd` is called when the last sentence is finished, `onError` when the browser cannot say it. Starting a new text stops the one before it,
 * and the one stopped never calls back (so the player cannot jump ahead when a learner taps another block).
 */
export function speakText(text: string, on: SpeakOptions): void {
  if (!canSpeak()) return void on.onError?.()
  stopSpeaking()
  const mine = current
  const chunks = chunksOf(text)
  if (chunks.length === 0) return void on.onEnd?.()
  const from = Math.max(0, Math.min(Math.floor(on.from ?? 0), chunks.length - 1))
  chunks.forEach((chunk, i) => {
    if (i < from) return
    const utterance = new SpeechSynthesisUtterance(chunk)
    utterance.lang = 'en-ZA'
    utterance.rate = BASE_RATE * (on.speed ?? 1)
    utterance.onstart = () => {
      if (mine === current) on.onSentence?.(i)
    }
    if (i === chunks.length - 1) {
      utterance.onend = () => {
        if (mine !== current) return
        queued = []
        on.onEnd?.()
      }
    }
    // A sentence that cannot be said ends the whole text: the ones after it are stopped, so nothing carries on (or starts "Play all" again) behind it.
    utterance.onerror = () => {
      if (mine !== current) return
      stopSpeaking()
      on.onError?.()
    }
    queued.push(utterance)
    window.speechSynthesis.speak(utterance)
  })
}
