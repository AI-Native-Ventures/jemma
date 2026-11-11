'use client'

import { PendingButton } from '@/components/ui/Button'
import { useState, useTransition } from 'react'
import type { CopyOption } from '@/lib/data/p21'
import { GRADES, OTHER_SUBJECT, SUBJECTS, validateClass } from '@/lib/subjects'
import { ComingButton, ShareButton } from '../_p21-client'
import { createClass } from './actions'
import { SelectBox } from './SelectBox'

const card = 'flex flex-col rounded-20 border border-line bg-card p-4'
const shareIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 15V3.5M7.5 8 12 3.5 16.5 8" />
    <path d="M5 12.5v6a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-6" />
  </svg>
)

const NAME_ERRORS = ['Give the class a name', 'Keep the class name under 60 letters']

export function NewClassForm({ code, initialGrade, initialSubject, initialOther, copyOptions }: { code: string; initialGrade: number; initialSubject: string; initialOther: string; copyOptions: CopyOption[] }) {
  const [name, setName] = useState('')
  const [grade, setGrade] = useState(initialGrade)
  const [subject, setSubject] = useState(initialSubject)
  const [other, setOther] = useState(initialOther)
  const [copyFrom, setCopyFrom] = useState('')
  const [learners, setLearners] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  const nameError = NAME_ERRORS.includes(error) ? error : ''
  const otherError = error && !nameError ? error : ''
  const copying = copyOptions.find((c) => c.id === copyFrom)

  function add() {
    const n = draft.trim()
    if (n) setLearners([...learners, n])
    setDraft('')
  }

  function submit() {
    const checked = validateClass({ name, grade, subject, otherSubject: other })
    if (!checked.ok) return setError(checked.error)
    setError('')
    start(async () => {
      const res = await createClass({ name, grade, subject, otherSubject: other, code, learners, copyFromClassId: copyFrom || null })
      if (res?.error) setError(res.error)
    })
  }

  return (
    <>
      <section aria-labelledby="cls" className={`${card} gap-3.5`}>
        <h2 id="cls" className="m-0 text-[17px] font-semibold">
          Class
        </h2>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cname" className="text-[15px] font-medium">
            Class name
          </label>
          <input
            id="cname"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-describedby="cname-hint"
            aria-invalid={nameError ? true : undefined}
            className={`h-[52px] rounded-14 border bg-card px-3.5 text-[17px] text-ink ${nameError ? 'border-coral-text' : 'border-muted-2'}`}
          />
          <span id="cname-hint" className={`text-[13px] ${nameError ? 'text-coral-text' : 'text-body'}`}>
            {nameError || 'What you and parents see'}
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="grade" className="text-[15px] font-medium">
            Grade
          </label>
          <SelectBox id="grade" value={String(grade)} onChange={(v) => setGrade(Number(v))}>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                Grade {g}
              </option>
            ))}
          </SelectBox>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="subj" className="text-[15px] font-medium">
            Subject
          </label>
          <SelectBox id="subj" value={subject} onChange={setSubject}>
            {SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            <option value={OTHER_SUBJECT}>{OTHER_SUBJECT}</option>
          </SelectBox>
          {subject === OTHER_SUBJECT ? (
            <>
              <label htmlFor="subj-other" className="mt-1.5 text-[15px] font-medium">
                Subject name
              </label>
              <input
                id="subj-other"
                type="text"
                value={other}
                onChange={(e) => setOther(e.target.value)}
                aria-describedby="subj-other-hint"
                aria-invalid={otherError ? true : undefined}
                className={`h-[52px] rounded-14 border bg-card px-3.5 text-[17px] text-ink ${otherError ? 'border-coral-text' : 'border-muted-2'}`}
              />
              <span id="subj-other-hint" className={`text-[13px] ${otherError ? 'text-coral-text' : 'text-body'}`}>
                {otherError || '2 to 40 letters, numbers, spaces, & or -'}
              </span>
            </>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="lrn" className={`${card} gap-2`}>
        <div className="flex flex-col gap-0.5">
          <h2 id="lrn" className="m-0 text-[17px] font-semibold">
            Learners
          </h2>
          <p className="m-0 text-[14px] text-body">{learners.length} added</p>
        </div>
        {copyOptions.length > 0 ? (
          <div className="flex flex-col gap-1.5 pb-1">
            <label htmlFor="copy" className="text-[15px] font-medium">
              Copy learners from another class
            </label>
            <SelectBox id="copy" value={copyFrom} onChange={setCopyFrom}>
              <option value="">No, I will add them myself</option>
              {copyOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.learners} {c.learners === 1 ? 'learner' : 'learners'})
                </option>
              ))}
            </SelectBox>
            {copying ? (
              <span className="text-[13px] text-body">
                {copying.learners === 1 ? 'Its learner is' : `All ${copying.learners} learners are`} in the new class too. They are not made again.
              </span>
            ) : null}
          </div>
        ) : null}
        <ul className="m-0 list-none p-0">
          {learners.map((l, i) => (
            <li key={`${l}-${i}`} className="flex min-h-[52px] items-center gap-3 border-t border-soft">
              <span aria-hidden="true" className="flex size-8 flex-none items-center justify-center rounded-pill bg-soft-3 text-[13px] font-bold">
                {l.charAt(0).toUpperCase()}
              </span>
              <span className="flex-1 text-[16px]">{l}</span>
              <button type="button" aria-label={`Remove ${l}`} onClick={() => setLearners(learners.filter((_, j) => j !== i))} className="flex size-11 items-center justify-center rounded-12 text-body">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <label htmlFor="addname" className="absolute size-px overflow-hidden whitespace-nowrap [clip:rect(0_0_0_0)]">
            Add a learner
          </label>
          <input
            id="addname"
            type="text"
            placeholder="Type a name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
            className="h-12 min-w-0 flex-1 rounded-12 border border-muted-2 bg-card px-3.5 text-[16px] text-ink placeholder:text-muted-2"
          />
          <button type="button" onClick={add} className="h-12 rounded-12 border-[1.5px] border-ink bg-card px-4 text-[15px] font-semibold text-ink">
            Add
          </button>
        </div>
        <ComingButton className="flex min-h-[60px] items-center gap-3 rounded-14 border border-line bg-soft-2 px-3.5 py-2 text-left text-ink">
          <span aria-hidden="true" className="flex size-9 flex-none items-center justify-center rounded-12 bg-coral-tint">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
              <circle cx="12" cy="12.5" r="3.5" />
            </svg>
          </span>
          <span className="flex flex-1 flex-col leading-[1.3]">
            <span className="text-[15px] font-semibold">Snap the register instead</span>
            <span className="text-[13px] text-body">Jemma reads the names from your class list</span>
          </span>
        </ComingButton>
      </section>

      <section aria-labelledby="code" className={`${card} gap-2.5`}>
        <div className="flex flex-col gap-0.5">
          <h2 id="code" className="m-0 text-[17px] font-semibold">
            Class code for parents
          </h2>
          <p className="m-0 text-[14px] text-body">Parents type it to link their child. You can share it later too.</p>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="flex h-[52px] flex-1 items-center rounded-12 bg-soft-2 px-3.5 text-[22px] font-bold tracking-[0.14em]">{code}</span>
          <ShareButton code={code} className="flex h-[52px] items-center gap-1.5 rounded-12 border-[1.5px] border-ink bg-card px-4 text-[15px] font-semibold text-ink">
            {shareIcon}Share
          </ShareButton>
        </div>
      </section>

      <PendingButton pending={pending} type="button" onClick={submit} disabled={pending} className="flex h-[52px] items-center justify-center gap-2 rounded-14 bg-ink text-[17px] font-semibold text-white disabled:opacity-50">
        Create class
      </PendingButton>
      <div className="flex-1" />
    </>
  )
}
