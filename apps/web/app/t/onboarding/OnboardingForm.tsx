'use client'

import { PendingButton } from '@/components/ui/Button'
import { useEffect, useState, useTransition } from 'react'
import { CheckIcon } from '@/components/ui/icons'
import { ComingButton } from '../_p21-client'
import { saveOnboarding, searchSchools, type SchoolHit } from './actions'

const GRADES = [4, 5, 6, 7]

const chipOff = 'min-h-11 rounded-pill border border-muted-2 bg-card px-4 text-[15px] font-medium text-ink'
const chipOn = 'inline-flex min-h-11 items-center gap-1.5 rounded-pill bg-ink pr-4 pl-3 text-[15px] font-semibold text-white'
const sectionCls = 'flex flex-col rounded-20 border border-line bg-card p-4'

export function OnboardingForm({ initial }: { initial: SchoolHit | null }) {
  const [query, setQuery] = useState(initial ? (initial.name.split(' ')[0] ?? '') : '')
  const [hits, setHits] = useState<SchoolHit[]>(initial ? [initial] : [])
  const [school, setSchool] = useState<SchoolHit | null>(initial)
  const [grades, setGrades] = useState<number[]>([])
  const [pending, start] = useTransition()

  useEffect(() => {
    const t = setTimeout(() => {
      searchSchools(query).then((found) => setHits(found.length || query.trim().length < 2 ? found : []))
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  const shown = hits.length ? hits : school ? [school] : []

  return (
    <>
      <section aria-labelledby="school" className={`${sectionCls} gap-3`}>
        <h2 id="school" className="m-0 text-[17px] font-semibold">
          Your school
        </h2>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="sch" className="text-[15px] font-medium">
            Find your school
          </label>
          <span className="relative block">
            <span className="absolute top-[15px] left-3.5 text-body">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <path d="m20 20-4.4-4.4" />
              </svg>
            </span>
            <input
              id="sch"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              className="h-[52px] w-full rounded-14 border border-muted-2 bg-card pr-3.5 pl-[46px] text-[17px] text-ink"
            />
          </span>
        </div>
        {shown.map((s) => {
          const on = school?.id === s.id
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={on}
              onClick={() => setSchool(s)}
              className={`flex min-h-[68px] items-center gap-3 rounded-[16px] bg-card py-2.5 pr-3.5 pl-3 text-left text-ink ${on ? 'border-2 border-ink' : 'border border-muted-2'}`}
            >
              <span aria-hidden="true" className="flex size-10 flex-none items-center justify-center rounded-12 bg-soft-4">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3.5 9.5 12 5l8.5 4.5L12 14z" />
                  <path d="M7 11.5v4.5c1.5 1.5 3.2 2 5 2s3.5-.5 5-2v-4.5" />
                </svg>
              </span>
              <span className="flex flex-1 flex-col leading-[1.3]">
                <span className="text-[17px] font-semibold">{s.name}</span>
                {s.blurb ? <span className="text-[14px] text-body">{s.blurb}</span> : null}
              </span>
              {on ? (
                <span className="flex size-[26px] items-center justify-center rounded-pill bg-ink">
                  <CheckIcon size={16} stroke="#FFFFFF" />
                </span>
              ) : null}
            </button>
          )
        })}
        <ComingButton className="min-h-11 self-start px-0.5 text-[15px] font-semibold text-ink underline underline-offset-[3px]">My school isn&apos;t listed</ComingButton>
      </section>

      <section aria-labelledby="teach" className={`${sectionCls} gap-3.5`}>
        <h2 id="teach" className="m-0 text-[17px] font-semibold">
          What you teach
        </h2>
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 p-0 text-[15px] font-medium">Subject</legend>
          <span className="flex flex-wrap gap-2">
            <button type="button" aria-pressed="true" className={chipOn}>
              <CheckIcon size={16} stroke="#FFFFFF" />
              Mathematics
            </button>
            <button type="button" disabled className="min-h-11 rounded-pill border border-dashed border-edge bg-card px-4 text-[15px] font-medium text-muted">
              English
            </button>
            <button type="button" disabled className="min-h-11 rounded-pill border border-dashed border-edge bg-card px-4 text-[15px] font-medium text-muted">
              Natural Sciences
            </button>
          </span>
          <span className="text-[13px] text-body">More subjects soon</span>
        </fieldset>
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 p-0 text-[15px] font-medium">Grades</legend>
          <span className="flex flex-wrap gap-2">
            {GRADES.map((g) => {
              const on = grades.includes(g)
              return (
                <button
                  key={g}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setGrades(on ? grades.filter((x) => x !== g) : [...grades, g])}
                  className={on ? `${chipOn} px-4` : chipOff}
                >
                  {on ? <CheckIcon size={16} stroke="#FFFFFF" /> : null}
                  Grade {g}
                </button>
              )
            })}
          </span>
        </fieldset>
      </section>

      <PendingButton pending={pending}
        type="button"
        disabled={!school || pending}
        onClick={() => school && start(() => saveOnboarding(school.id, grades))}
        className="flex h-[52px] items-center justify-center gap-2 rounded-14 bg-ink text-[17px] font-semibold text-white disabled:opacity-50"
      >
        Next: set up your class
      </PendingButton>
      <div className="flex-1" />
    </>
  )
}
