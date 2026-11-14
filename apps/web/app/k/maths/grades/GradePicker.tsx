'use client'

import { sheetMarks } from '@/lib/own-grades'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { addMyGrade } from '../../own-actions'

// A large chip for each of the 12 grades, two to a row on a small phone and three from a bigger one, so nothing scrolls sideways. Room at the sides,
// a minimum height and no fixed one (the P90 rule): the marks under the grade may take a second line.
const chip = 'flex min-h-[76px] w-full cursor-pointer flex-col items-center justify-center gap-0.5 rounded-20 border-[1.5px] border-ink px-5 py-3 text-center disabled:cursor-default disabled:opacity-60'

/**
 * The 12 grades of the CAPS maps. The learner's school grade says "your grade" and the grades already in My own say "added". A tap calls
 * `addMyGrade` (it loads that grade's map), says "Loading Grade N..." while it works and opens My maths at that grade. A refusal is said in plain
 * words under the chips. Every grade can be added, the ones ahead of the learner's own too.
 */
export function GradePicker({ schoolGrade, added }: { schoolGrade: number; added: number[] }) {
  const router = useRouter()
  const [loading, setLoading] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const pick = (grade: number) => {
    if (pending) return
    setMessage(null)
    setLoading(grade)
    start(async () => {
      const res = await addMyGrade(grade)
      if (res.ok) {
        router.push(`/k/maths?grade=${grade}`)
        router.refresh()
        return
      }
      setLoading(null)
      setMessage(res.message)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Grades" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {sheetMarks(added, schoolGrade).map(({ grade, marks }) => {
          const here = loading === grade
          return (
            <button
              key={grade}
              type="button"
              aria-label={`Grade ${grade}`}
              aria-describedby={marks.length > 0 ? `grade-${grade}-marks` : undefined}
              aria-busy={here || undefined}
              disabled={pending}
              onClick={() => pick(grade)}
              className={`${chip} ${here ? 'bg-coral text-ink' : 'bg-card text-ink'}`}
            >
              <span className="text-[19px] leading-[1.2] font-bold">Grade {grade}</span>
              {marks.length > 0 ? (
                <span id={`grade-${grade}-marks`} className="flex flex-col text-[13px] leading-[1.3] font-medium text-body">
                  {marks.map((m) => (
                    <span key={m}>{m}</span>
                  ))}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
      {loading !== null && pending ? (
        <p role="status" aria-live="polite" className="m-0 text-center text-[17px] leading-[1.4] font-semibold">Loading Grade {loading}...</p>
      ) : null}
      {message ? <p role="alert" className="m-0 text-center text-[15px] leading-[1.4] text-coral-text">{message}</p> : null}
    </div>
  )
}
