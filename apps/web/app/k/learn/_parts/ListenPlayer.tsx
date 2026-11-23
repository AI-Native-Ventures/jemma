'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { barGroups, barHeight, minutesLeft } from './listen'
import type { Listen } from './useListen'

// The player of the Listen tab (P159): the look of the audio memo of a practice (`LearnAudio`), for a whole lesson read by the phone's own voice.
// Every control does what it says. The bars are the parts of the lesson (a wide group is a long part), the count is the part being read, and the time
// is said as "about" because it is worked out from the words. There is no clock and no sound wave: the browser's voice gives neither.

const DONE = '#A27719'
const NOW = '#FFB81C'
const AHEAD = '#3F3E3B'

// Sizes for a phone first: at 360 px the row has 280 px for its five buttons (52 + 44 + 64 + 44 + 58, and the gaps). From 420 px it has room for the big
// sizes of the audio memo. The speed button has one width for every speed, so nothing moves when it changes.
const pill = 'flex h-11 flex-none cursor-pointer items-center justify-center rounded-12 border-[1.5px] text-[14px] font-semibold'
const ghost = 'flex size-11 flex-none cursor-pointer items-center justify-center rounded-pill border-0 bg-transparent p-0 text-white disabled:cursor-default disabled:opacity-35 min-[420px]:size-12'

const Play = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#161616" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>
)
const Pause = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#161616" aria-hidden="true"><rect x="6" y="5" width="4.2" height="14" rx="1" /><rect x="13.8" y="5" width="4.2" height="14" rx="1" /></svg>
)
/** One part back (the bar is on the left) or one part on (the bar is on the right). */
const Skip = ({ back }: { back?: boolean }) => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={back ? { transform: 'scaleX(-1)' } : undefined}>
    <path d="M5 5.5v13l9.5-6.5z" /><rect x="16" y="5.5" width="2.6" height="13" rx="1" />
  </svg>
)

export type ListenPlayerProps = {
  /** The title of the lesson, drawn already (its maths typeset in white). */
  title: ReactNode
  /** How many words the voice says for each part, in the order of the lesson. */
  words: number[]
  listen: Listen
  /** The words of a part show while it is read ("read along"), and the tap that turns that on and off. */
  readAlong: boolean
  onReadAlong: () => void
}

/** The player at the top of the Listen tab: the lesson's title, its parts as bars, where the voice is, and the five controls. */
export function ListenPlayer({ title, words, listen, readAlong, onReadAlong }: ListenPlayerProps) {
  const started = listen.part !== null
  const at = listen.part ?? 0
  const groups = barGroups(words)
  const minutes = minutesLeft(words, at, listen.speed)
  return (
    <section aria-labelledby="listen-title" data-player="true" className="flex flex-col gap-[18px] rounded-[26px] bg-ink p-5 text-white">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/jemma-app-icon.svg" alt="" width={48} height={48} className="block size-12 flex-none" />
        <span className="flex min-w-0 flex-col gap-px">
          <h1 id="listen-title" className="m-0 text-[21px] leading-[1.2] font-bold text-pretty">{title}</h1>
          <span className="text-[14px] text-[#D9D6CE]">Jemma reads it to you</span>
        </span>
      </div>
      <div aria-hidden="true" data-bars="true" className="flex h-11 items-center gap-[7px]">
        {groups.map((k, i) => (
          <span key={i} data-part={i} className="flex min-w-0 items-center gap-[2px]" style={{ flex: `${k} 1 0` }}>
            {Array.from({ length: k }, (_, j) => (
              <span key={j} className="min-w-0 flex-1 rounded-[2px]" style={{ height: barHeight(j, k), background: !started || i > at ? AHEAD : i < at ? DONE : NOW }} />
            ))}
          </span>
        ))}
      </div>
      <div className="flex justify-between gap-3 text-[14px] text-[#D9D6CE] tabular-nums">
        <span>{started ? `Part ${at + 1} of ${words.length}` : `${words.length} parts`}</span>
        <span>{started ? `about ${minutes} min left` : `about ${minutes} min to listen`}</span>
      </div>
      <div className="flex items-center justify-between gap-1.5">
        <button type="button" aria-label={`Speed, ${listen.speed} times`} onClick={listen.cycleSpeed} className={`${pill} w-[52px] border-[#66645F] bg-transparent text-white`}>
          {listen.speed}x
        </button>
        <span className="flex items-center min-[420px]:gap-3">
          <button type="button" aria-label="Back one part" disabled={!started} onClick={listen.prev} className={ghost}>
            <Skip back />
          </button>
          <button
            type="button"
            aria-label={listen.playing ? 'Pause' : 'Play'}
            onClick={listen.toggle}
            className="flex size-16 flex-none cursor-pointer items-center justify-center rounded-pill border-0 bg-gold p-0 text-ink min-[420px]:size-[72px]"
          >
            {listen.playing ? <Pause size={28} /> : <Play size={28} />}
          </button>
          <button type="button" aria-label="Next part" disabled={at >= words.length - 1} onClick={listen.next} className={ghost}>
            <Skip />
          </button>
        </span>
        <button
          type="button"
          aria-pressed={readAlong}
          aria-label={readAlong ? 'The words show as Jemma reads. Hide them' : 'Show the words as Jemma reads'}
          onClick={onReadAlong}
          className={`${pill} px-2 ${readAlong ? 'border-white bg-white text-ink' : 'border-[#66645F] bg-transparent text-white'}`}
        >
          Words
        </button>
      </div>
    </section>
  )
}

/**
 * The player as one slim bar, for the top of the screen while the big one is out of sight: the voice reads its way down a long lesson, so the pause
 * button has to stay in reach.
 */
export function ListenMini({ listen, total, label }: { listen: Listen; total: number; label: string }) {
  const at = listen.part ?? 0
  return (
    <div data-mini-player="true" className="flex items-center gap-2 rounded-14 bg-ink py-1 pr-1 pl-1.5 text-white shadow-[0_12px_28px_-14px_rgba(22,22,22,0.6)]">
      <button type="button" aria-label={listen.playing ? 'Pause' : 'Play'} onClick={listen.toggle} className="flex size-11 flex-none cursor-pointer items-center justify-center rounded-pill border-0 bg-transparent p-0">
        <span className="flex size-9 items-center justify-center rounded-pill bg-gold">{listen.playing ? <Pause size={16} /> : <Play size={16} />}</span>
      </button>
      <p className="m-0 min-w-0 flex-1 truncate text-[15px] font-semibold">
        Part {at + 1} of {total} <span className="font-normal text-[#D9D6CE]">· {label}</span>
      </p>
      <button type="button" aria-label="Next part" disabled={at >= total - 1} onClick={listen.next} className="flex size-11 flex-none cursor-pointer items-center justify-center rounded-pill border-0 bg-transparent p-0 text-white disabled:cursor-default disabled:opacity-35">
        <Skip />
      </button>
    </div>
  )
}

/**
 * A place to hang the big player on, and whether it has gone out of sight above the fold (under the bar that stays at the top). The lesson screens draw
 * the slim bar only then. Where the browser cannot say (no IntersectionObserver), the big player is taken to be in sight.
 */
export function usePlayerOutOfSight(active: boolean) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [out, setOut] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!active || !el || typeof IntersectionObserver === 'undefined') {
      setOut(false)
      return
    }
    const seen = new IntersectionObserver((entries) => setOut(!entries[0]?.isIntersecting), { rootMargin: '-120px 0px 0px 0px' })
    seen.observe(el)
    return () => seen.disconnect()
  }, [active])
  return [ref, out] as const
}
