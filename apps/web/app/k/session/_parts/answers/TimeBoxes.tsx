'use client'

import { useState } from 'react'
import type { TimeStyle } from '@jemma/profiling/logic'
import { DigitBox } from './DigitBox'

// P148: the answer of a `time` question. Two boxes, hours and minutes, and am or pm only when the key needs it (a 12 hour clock). A length of time has its
// two boxes with "h" and "min" after them, and either may be left empty. What is sent is the text the marker reads: "14:30", "2:30 pm" or "2 h 15 min".

type Half = 'am' | 'pm'

/**
 * The text for what the boxes hold, or '' while it is not an answer yet: a clock needs both boxes (and am or pm on a 12 hour clock) and a minute under 60;
 * a length of time needs one of them.
 */
export function timeAnswer(style: TimeStyle, hours: string, minutes: string, half: Half | null): string {
  const [h, m] = [hours.trim(), minutes.trim()]
  if (style === 'duration') return [h ? `${Number(h)} h` : '', m ? `${Number(m)} min` : ''].filter(Boolean).join(' ')
  if (!h || !m || Number(m) > 59) return ''
  const clock = `${Number(h)}:${m.padStart(2, '0')}`
  if (style === 'clock12') return Number(h) >= 1 && Number(h) <= 12 && half ? `${clock} ${half}` : ''
  return Number(h) <= 23 ? clock : ''
}

/** A word that goes after or between the boxes ("h", "min"). */
const wordClass = 'pt-[18px] text-[24px] leading-none font-bold text-ink'
const captionClass = 'text-[14px] font-semibold text-body'
const boxClass = 'h-[64px] w-[72px] text-[34px]'

function HalfKey({ half, on, onPress }: { half: Half; on: boolean; onPress: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPress}
      className={`flex h-[44px] w-[60px] cursor-pointer items-center justify-center rounded-[12px] text-[17px] font-bold ${
        on ? 'border-[3px] border-green bg-green text-white' : 'border-2 border-edge bg-card text-ink'
      }`}
    >
      {half}
    </button>
  )
}

export function TimeBoxes({ style, onChange }: { style: TimeStyle; onChange: (answer: string) => void }) {
  const [hours, setHours] = useState('')
  const [minutes, setMinutes] = useState('')
  const [half, setHalf] = useState<Half | null>(null)
  const duration = style === 'duration'
  const change = (h: string, m: string, p: Half | null) => onChange(timeAnswer(style, h, m, p))
  return (
    <div data-time={style} className="flex items-start justify-center gap-2">
      <div className="flex flex-col items-center gap-1">
        <DigitBox id="hours" label="Hours" value={hours} max={duration ? 3 : 2} className={boxClass} onChange={(v) => { setHours(v); change(v, minutes, half) }} />
        {duration ? null : <span aria-hidden="true" className={captionClass}>hours</span>}
      </div>
      <span aria-hidden="true" className={duration ? wordClass : 'pt-[6px] text-[40px] leading-none font-bold text-ink'}>{duration ? 'h' : ':'}</span>
      <div className="flex flex-col items-center gap-1">
        <DigitBox id="minutes" label="Minutes" value={minutes} max={duration ? 3 : 2} className={boxClass} onChange={(v) => { setMinutes(v); change(hours, v, half) }} />
        {duration ? null : <span aria-hidden="true" className={captionClass}>minutes</span>}
      </div>
      {duration ? <span aria-hidden="true" className={wordClass}>min</span> : null}
      {style === 'clock12' ? (
        <div role="group" aria-label="am or pm" className="flex flex-col gap-1.5 pl-1">
          {(['am', 'pm'] as const).map((h) => (
            <HalfKey key={h} half={h} on={half === h} onPress={() => { setHalf(h); change(hours, minutes, h) }} />
          ))}
        </div>
      ) : null}
    </div>
  )
}
