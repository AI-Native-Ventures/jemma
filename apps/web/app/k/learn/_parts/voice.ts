// The voice of the Listen delivery (P144): the browser's own speech (`speechSynthesis`), the one `LearnAudio` already falls back to. It says the `speech` of a
// block, which holds words only. A phone that cannot speak is told so by `canSpeak`, and the lesson then shows the words.

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

/**
 * Says a text. `onEnd` is called when the last sentence is finished, `onError` when the browser cannot say it. Starting a new text stops the one before it,
 * and the one stopped never calls back (so "Play all" cannot jump ahead when a learner taps another block).
 */
export function speakText(text: string, on: { onEnd?: () => void; onError?: () => void }): void {
  if (!canSpeak()) return void on.onError?.()
  stopSpeaking()
  const mine = current
  const chunks = chunksOf(text)
  if (chunks.length === 0) return void on.onEnd?.()
  chunks.forEach((chunk, i) => {
    const utterance = new SpeechSynthesisUtterance(chunk)
    utterance.lang = 'en-ZA'
    utterance.rate = 0.95
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
