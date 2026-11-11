'use client'

import { PendingButton } from '@/components/ui/Button'
import { useEffect, useState, useTransition } from 'react'
import { Sheet } from '@/components/ui'
import { CheckIcon } from '@/components/ui/icons'
import { COUNTRIES, GRADES, OTHER_SUBJECT, SUBJECTS, validateSchool, validateSubject } from '@/lib/subjects'
import { SelectBox } from '../new/SelectBox'
import { createSchool, saveOnboarding, searchSchools, type SchoolHit } from './actions'

const sectionCls = 'flex flex-col rounded-20 border border-line bg-card p-4'
const field = 'h-[52px] rounded-14 border bg-card px-3.5 text-[17px] text-ink'
const save = 'flex h-[52px] items-center justify-center gap-2 rounded-14 bg-ink text-[17px] font-semibold text-white disabled:opacity-50'

type Choice = { grade: number | null; subject: string; other: string }

/** "My school isn't listed": a short form that makes the school, links the teacher to it and goes on to the class form. */
function SchoolSheet({ pick, onClose }: { pick: Choice; onClose: () => void }) {
  const [name, setName] = useState('')
  const [country, setCountry] = useState('ZA')
  const [region, setRegion] = useState('')
  const [error, setError] = useState('')
  const [offer, setOffer] = useState<SchoolHit | null>(null)
  const [pending, start] = useTransition()

  function submit() {
    const checked = validateSchool({ name, country, region })
    if (!checked.ok) return setError(checked.error)
    setError('')
    setOffer(null)
    start(async () => {
      const res = await createSchool({ name, country, region, ...pick })
      if (res?.error) {
        setError(res.error)
        if (res.existing) {
          const found = res.existing
          setOffer({ id: found.id, name: found.name, blurb: [found.region, COUNTRIES.find((c) => c.code === found.country)?.name].filter(Boolean).join(' · ') || null })
        }
      }
    })
  }

  return (
    <Sheet open onClose={onClose} title="Add your school" description="Tell us the name and where it is. You can start your first class right after.">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="school-name" className="text-[15px] font-medium">
          School name
        </label>
        <input id="school-name" type="text" value={name} onChange={(e) => { setName(e.target.value); setError('') }} autoComplete="off" className={`${field} border-muted-2`} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="school-country" className="text-[15px] font-medium">
          Country
        </label>
        <SelectBox id="school-country" value={country} onChange={(v) => { setCountry(v); setError('') }}>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </SelectBox>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="school-region" className="text-[15px] font-medium">
          Region (optional)
        </label>
        <input id="school-region" type="text" value={region} onChange={(e) => { setRegion(e.target.value); setError('') }} autoComplete="off" className={`${field} border-muted-2`} />
      </div>
      {error ? (
        <p role="alert" className="m-0 text-[14px] leading-[1.4] font-semibold text-coral-text">
          {error}
        </p>
      ) : null}
      {offer ? (
        <div className="flex flex-col gap-2 rounded-14 bg-soft-2 p-3">
          <span className="flex flex-col leading-[1.3]">
            <span className="text-[16px] font-semibold">{offer.name}</span>
            {offer.blurb ? <span className="text-[14px] text-body">{offer.blurb}</span> : null}
          </span>
          <PendingButton pending={pending} type="button" disabled={pending} className={save} onClick={() => start(() => saveOnboarding(offer.id, pick.grade, pick.subject, pick.other))}>
            Yes, use this school
          </PendingButton>
        </div>
      ) : (
        <PendingButton pending={pending} type="button" disabled={pending} className={save} onClick={submit}>
          Create school
        </PendingButton>
      )}
    </Sheet>
  )
}

export function OnboardingForm({ initial }: { initial: SchoolHit | null }) {
  const [query, setQuery] = useState(initial ? (initial.name.split(' ')[0] ?? '') : '')
  const [hits, setHits] = useState<SchoolHit[]>(initial ? [initial] : [])
  const [school, setSchool] = useState<SchoolHit | null>(initial)
  const [grade, setGrade] = useState('')
  const [subject, setSubject] = useState<string>(SUBJECTS[0])
  const [other, setOther] = useState('')
  const [schoolForm, setSchoolForm] = useState(false)
  const [pending, start] = useTransition()
  const pick: Choice = { grade: grade ? Number(grade) : null, subject, other }
  const otherError = subject === OTHER_SUBJECT && other.trim() !== '' && !validateSubject(OTHER_SUBJECT, other).ok

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
        <button type="button" onClick={() => setSchoolForm(true)} className="min-h-11 self-start px-0.5 text-[15px] font-semibold text-ink underline underline-offset-[3px]">
          My school isn&apos;t listed
        </button>
        {schoolForm ? <SchoolSheet pick={pick} onClose={() => setSchoolForm(false)} /> : null}
      </section>

      <section aria-labelledby="teach" className={`${sectionCls} gap-3.5`}>
        <h2 id="teach" className="m-0 text-[17px] font-semibold">
          What you teach
        </h2>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="teach-subject" className="text-[15px] font-medium">
            Subject
          </label>
          <SelectBox id="teach-subject" value={subject} onChange={setSubject}>
            {SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            <option value={OTHER_SUBJECT}>{OTHER_SUBJECT}</option>
          </SelectBox>
          {subject === OTHER_SUBJECT ? (
            <>
              <label htmlFor="teach-other" className="mt-1.5 text-[15px] font-medium">
                Subject name
              </label>
              <input
                id="teach-other"
                type="text"
                value={other}
                onChange={(e) => setOther(e.target.value)}
                aria-invalid={otherError ? true : undefined}
                className={`${field} ${otherError ? 'border-coral-text' : 'border-muted-2'}`}
              />
              <span className={`text-[13px] ${otherError ? 'text-coral-text' : 'text-body'}`}>2 to 40 letters, numbers, spaces, & or -</span>
            </>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="teach-grade" className="text-[15px] font-medium">
            Grade of your first class
          </label>
          <SelectBox id="teach-grade" value={grade} onChange={setGrade}>
            <option value="">Pick a grade</option>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                Grade {g}
              </option>
            ))}
          </SelectBox>
        </div>
      </section>

      <PendingButton pending={pending}
        type="button"
        disabled={!school || pending || otherError}
        onClick={() => school && start(() => saveOnboarding(school.id, pick.grade, subject, other))}
        className="flex h-[52px] items-center justify-center gap-2 rounded-14 bg-ink text-[17px] font-semibold text-white disabled:opacity-50"
      >
        Next: set up your class
      </PendingButton>
      <div className="flex-1" />
    </>
  )
}
