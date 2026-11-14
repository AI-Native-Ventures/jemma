'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Sheet } from '@/components/ui'
import type { LessonForChild } from '../[sessionId]/types'
import { FractionText } from './Frac'
import { AUDIO_ICON, LearnBadge } from './LearnCards'

const BARS = [10, 18, 26, 14, 32, 22, 16, 28, 38, 20, 12, 26, 34, 18, 24, 14, 30, 22, 16, 10, 20, 28, 18, 26, 14, 22, 32, 16, 24, 12, 18, 28, 20, 26, 14, 22, 16, 10]
const WORDS_PER_SECOND = 2.6
const SPEEDS = [1, 1.25, 1.5, 0.75]

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const sentencesOf = (script: string) => script.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? []

/** Paragraphs for "Read along": the script's own, or its sentences in pairs. */
function paragraphsOf(script: string): string[][] {
  const own = script.split(/\n+/).map((p) => p.trim()).filter(Boolean)
  const groups = own.length > 1 ? own.map(sentencesOf) : (() => {
    const all = sentencesOf(script)
    const out: string[][] = []
    for (let i = 0; i < all.length; i += 2) out.push(all.slice(i, i + 2))
    return out
  })()
  return groups
}

type Player = {
  playing: boolean
  position: number
  duration: number
  speed: number
  toggle: () => void
  skip: (by: number) => void
  cycleSpeed: () => void
  /** Index of the sentence being read, for "Read along". */
  sentence: number
}

/** Plays the lesson's audio file when there is one, else the browser reading the script aloud. */
function usePlayer(script: string, url: string | null): Player {
  const sentences = useMemo(() => sentencesOf(script), [script])
  const sentenceSeconds = useMemo(() => sentences.map((s) => s.split(/\s+/).length / WORDS_PER_SECOND), [sentences])
  const [speed, setSpeed] = useState(1)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [fileDuration, setFileDuration] = useState(0)
  const audio = useRef<HTMLAudioElement | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const posRef = useRef(0)
  const total = sentenceSeconds.reduce((a, b) => a + b, 0)
  const duration = url && fileDuration ? fileDuration : total / speed

  const stopSpeech = useCallback(() => {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
  }, [])

  const speakFrom = useCallback(
    (seconds: number, rate: number) => {
      stopSpeech()
      if (typeof speechSynthesis === 'undefined') return
      let acc = 0
      let from = 0
      for (let i = 0; i < sentenceSeconds.length; i++) {
        if (acc + sentenceSeconds[i]! > seconds) break
        acc += sentenceSeconds[i]!
        from = i + 1
      }
      posRef.current = acc / rate
      sentences.slice(from).forEach((text) => {
        const u = new SpeechSynthesisUtterance(text)
        u.rate = rate
        speechSynthesis.speak(u)
      })
      timer.current = setInterval(() => {
        posRef.current += 0.25
        setPosition(posRef.current)
        if (!speechSynthesis.speaking && !speechSynthesis.pending) {
          stopSpeech()
          setPlaying(false)
        }
      }, 250)
    },
    [sentenceSeconds, sentences, stopSpeech],
  )

  useEffect(() => {
    if (!url) return
    const el = new Audio(url)
    audio.current = el
    el.onloadedmetadata = () => setFileDuration(el.duration)
    el.ontimeupdate = () => setPosition(el.currentTime)
    el.onended = () => setPlaying(false)
    return () => {
      el.pause()
      audio.current = null
    }
  }, [url])
  useEffect(() => stopSpeech, [stopSpeech])

  const toggle = () => {
    if (audio.current) {
      if (playing) audio.current.pause()
      else void audio.current.play()
    } else if (playing) {
      stopSpeech()
    } else {
      speakFrom(position * speed, speed)
    }
    setPlaying(!playing)
  }
  const skip = (by: number) => {
    if (audio.current) {
      audio.current.currentTime = Math.max(0, Math.min(audio.current.duration || 0, audio.current.currentTime + by))
      return
    }
    const target = Math.max(0, Math.min(total, position * speed + by * speed))
    setPosition(target / speed)
    posRef.current = target / speed
    if (playing) speakFrom(target, speed)
  }
  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]!
    setSpeed(next)
    if (audio.current) audio.current.playbackRate = next
    else if (playing) speakFrom(position * speed, next)
    else setPosition((position * speed) / next)
  }

  let acc = 0
  let sentence = 0
  const elapsed = audio.current ? position : position * speed
  for (let i = 0; i < sentenceSeconds.length; i++) {
    if (acc + sentenceSeconds[i]! > elapsed) break
    acc += sentenceSeconds[i]!
    sentence = i
  }
  return { playing, position, duration, speed, toggle, skip, cycleSpeed, sentence }
}

const ghostButton = 'flex size-12 cursor-pointer items-center justify-center rounded-pill border-0 bg-transparent p-0 text-white'
const pill = 'flex h-11 w-[52px] cursor-pointer items-center justify-center rounded-12 border-[1.5px] border-[#6B6888] bg-transparent text-[15px] font-semibold text-white'

export function LearnAudio({ lesson, firstName, onReady }: { lesson: LessonForChild; firstName: string; onReady: () => void }) {
  const script = lesson.audio?.script ?? ''
  const player = usePlayer(script, lesson.audio?.url ?? null)
  const [lang, setLang] = useState(false)
  const paragraphs = useMemo(() => paragraphsOf(script), [script])
  const minutes = lesson.audio?.url ? Math.max(1, Math.ceil(player.duration / 60)) : lesson.minutes
  const playedBars = player.duration ? Math.round((player.position / player.duration) * BARS.length) : 0
  let seen = 0
  return (
    <main className="flex flex-1 flex-col gap-4 px-5 pt-[18px] pb-[26px]">
      <div className="flex items-center justify-between">
        <p className="m-0 text-[15px] font-semibold text-body">Learn</p>
        <LearnBadge icon={AUDIO_ICON}>{`Audio memo · ${minutes} min`}</LearnBadge>
      </div>
      <section aria-labelledby="memo" className="flex flex-col gap-[18px] rounded-[26px] bg-ink p-5 text-white">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/jemma-app-icon.svg" alt="" width={48} height={48} className="block size-12" />
          <span className="flex flex-col gap-px">
            <h1 id="memo" className="m-0 text-[21px] leading-[1.2] font-bold">
              <FractionText text={lesson.title} size={26} rule={2.5} gap={3} side={3} color="#FFFFFF" />
            </h1>
            <span className="text-[14px] text-[#D6D4E2]">Jemma, for {firstName}</span>
          </span>
        </div>
        <div aria-hidden="true" className="flex h-11 items-center gap-[3px]">
          {BARS.map((h, i) => (
            <span key={i} className="flex-1 rounded-[2px]" style={{ height: h, background: i < playedBars ? '#FF6A4D' : '#4A4766' }} />
          ))}
        </div>
        <div className="flex justify-between text-[14px] text-[#D6D4E2] tabular-nums">
          <span>{clock(player.position)}</span>
          <span>{clock(player.duration)}</span>
        </div>
        <div className="flex items-center justify-between">
          <button type="button" aria-label={`Speed, ${player.speed} times`} onClick={player.cycleSpeed} className={pill}>
            {player.speed}x
          </button>
          <span className="flex items-center gap-[18px]">
            <button type="button" aria-label="Back 10 seconds" onClick={() => player.skip(-10)} className={ghostButton}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 12a8 8 0 1 0 2.34-5.66" /><path d="M4 4v4.5h4.5" /><path d="M10 10v5M13 10h2v5h-2z" />
              </svg>
            </button>
            <button
              type="button"
              aria-label={player.playing ? 'Pause' : 'Play'}
              onClick={player.toggle}
              className="flex size-[72px] cursor-pointer items-center justify-center rounded-pill border-0 bg-coral p-0 text-ink"
            >
              {player.playing ? (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="#1F1D36" aria-hidden="true"><rect x="6" y="5" width="4.2" height="14" rx="1" /><rect x="13.8" y="5" width="4.2" height="14" rx="1" /></svg>
              ) : (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="#1F1D36" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>
              )}
            </button>
            <button type="button" aria-label="Forward 10 seconds" onClick={() => player.skip(10)} className={ghostButton}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 12a8 8 0 1 1-2.34-5.66" /><path d="M20 4v4.5h-4.5" /><path d="M9 10v5M12 10h2v5h-2z" />
              </svg>
            </button>
          </span>
          <button type="button" aria-label="Listening in English. Change language" onClick={() => setLang(true)} className={pill}>
            EN
          </button>
        </div>
      </section>
      <section aria-labelledby="readalong" className="flex flex-col gap-2.5 rounded-[22px] border border-line bg-card px-[18px] py-4">
        <h2 id="readalong" className="m-0 text-[15px] font-semibold text-body">Read along</h2>
        {paragraphs.map((sentences, i) => {
          const start = seen
          seen += sentences.length
          const now = player.sentence >= start && player.sentence < seen
          return (
            <p
              key={i}
              className={`m-0 text-[17px] leading-[1.55] ${now ? '-mx-2 rounded-12 bg-[#FFF1ED] p-2 font-medium text-ink' : 'text-body'}`}
            >
              <FractionText text={sentences.join(' ')} size={22} rule={2} gap={3} side={3} />
            </p>
          )
        })}
      </section>
      <div className="flex-1" />
      <button type="button" onClick={onReady} className="min-h-[60px] cursor-pointer rounded-18 border-0 bg-ink px-5 py-3 text-center text-[19px] font-bold text-balance text-white">
        I&apos;m ready
      </button>
      <Sheet open={lang} onClose={() => setLang(false)} title="Coming after the challenge" description="This part of Jemma is not in this version yet.">
        <button type="button" onClick={() => setLang(false)} className="min-h-14 cursor-pointer rounded-14 border-0 bg-ink px-5 py-3 text-center text-[17px] font-semibold text-balance text-white">
          Got it
        </button>
      </Sheet>
    </main>
  )
}
