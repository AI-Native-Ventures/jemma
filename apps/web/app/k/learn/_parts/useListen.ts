'use client'

import { useEffect, useRef, useState } from 'react'
import type { BlockForChild } from '@/lib/teaching'
import { speechOf } from './delivery'
import { nextSpeed } from './listen'
import { canSpeak, speakText, stopSpeaking } from './voice'

/** What the player of the Listen tab, its small bar and the Listen button of each part read and call. */
export type Listen = {
  /** False only once the browser has said it cannot read aloud. Until it has been asked, a voice is taken to be there. */
  ok: boolean
  /** The part the player is at, from 0: the one being read, or the one a pause or a skip left it on. Null before the first play and after the last part. */
  part: number | null
  /** A voice is reading now. */
  playing: boolean
  /** The voice goes on to the next part by itself (the player's own play), not one part alone (a part's own Listen button). */
  all: boolean
  /** 1, 1.25, 1.5 or 0.75. */
  speed: number
  /** The parts the voice has read, or started to read, in this lesson. Their words stay on the screen with "Words" on, so nothing above moves. */
  heard: ReadonlySet<number>
  /** The big button: reads on from where the player is (the first part before anything was played), or pauses. A pause keeps the sentence. */
  toggle: () => void
  /** The Listen button of a part: reads that part alone, or stops it when it is the one being read. */
  playPart: (index: number) => void
  /** The part after this one. While the voice reads, it reads on from there. */
  next: () => void
  /** The start of this part when the voice is past its first sentence, else the part before it. */
  prev: () => void
  cycleSpeed: () => void
  /** Stops the voice and puts the player back at the start (a change of tab, the end of the lesson). */
  stop: () => void
}

/**
 * The voice of one lesson, for both lesson screens (the app's and the saved tour's). It reads the `speech` of each part with the browser's own voice, one
 * sentence at a time, and knows which part and which sentence it is at: so a pause carries on at that sentence, a skip moves one part, and a new speed
 * takes hold at the sentence being said.
 */
export function useListen(blocks: BlockForChild[]): Listen {
  const [ok, setOk] = useState<boolean | null>(null)
  const [part, setPart] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [all, setAll] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [heard, setHeard] = useState<ReadonlySet<number>>(() => new Set())
  // The part to bring into view, and a count so the same part can be asked for twice.
  const [view, setView] = useState<{ part: number; n: number } | null>(null)
  const sentence = useRef(0)
  const pace = useRef(1)

  useEffect(() => {
    setOk(canSpeak())
    return stopSpeaking
  }, [])

  // The top of the part comes into view, under the bar that stays at the top of the screen (its `scroll-margin-top`). It is done after the screen is
  // drawn, so the words that read along are already in place.
  useEffect(() => {
    if (view) document.getElementById(`block-${view.part}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }, [view])
  const show = (i: number) => setView((v) => ({ part: i, n: (v?.n ?? 0) + 1 }))

  function speak(i: number, chain: boolean, from: number, scroll = true) {
    const block = blocks[i]
    if (!block) return
    sentence.current = from
    setPart(i)
    setPlaying(true)
    setAll(chain)
    setHeard((h) => (h.has(i) ? h : new Set(h).add(i)))
    if (scroll) show(i)
    speakText(speechOf(block), {
      from,
      speed: pace.current,
      onSentence: (s) => {
        sentence.current = s
      },
      onEnd: () => {
        if (chain && i + 1 < blocks.length) return speak(i + 1, true, 0)
        // The last part was read: the player is back at its start. One part read alone: the player waits at the part after it.
        sentence.current = 0
        setPlaying(false)
        setAll(false)
        setPart(!chain && i + 1 < blocks.length ? i + 1 : null)
      },
      onError: () => {
        setPlaying(false)
        setAll(false)
      },
    })
  }

  const pause = () => {
    stopSpeaking()
    setPlaying(false)
  }

  const stop = () => {
    stopSpeaking()
    sentence.current = 0
    setPlaying(false)
    setAll(false)
    setPart(null)
  }

  const move = (to: number) => {
    const i = Math.max(0, Math.min(blocks.length - 1, to))
    if (playing) return speak(i, true, 0)
    stopSpeaking()
    sentence.current = 0
    setPart(i)
    show(i)
  }

  return {
    ok: ok !== false,
    part,
    playing,
    all,
    speed,
    heard,
    toggle: () => (playing ? pause() : speak(part ?? 0, true, part === null ? 0 : sentence.current)),
    playPart: (i) => (playing && part === i ? pause() : speak(i, false, part === i ? sentence.current : 0)),
    next: () => move((part ?? 0) + 1),
    prev: () => move(part !== null && sentence.current > 0 ? part : (part ?? 0) - 1),
    cycleSpeed: () => {
      const to = nextSpeed(speed)
      pace.current = to
      setSpeed(to)
      // The sentence being said starts again at the new speed, and the page stays where it is.
      if (playing && part !== null) speak(part, all, sentence.current, false)
    },
    stop,
  }
}
