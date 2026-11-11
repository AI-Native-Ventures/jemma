'use client'

import { PendingButton } from '@/components/ui/Button'
import { useEffect, useState, useTransition } from 'react'
import { Sheet } from '@/components/ui'
import { ChevronRightIcon } from '@/components/ui/icons'
import type { SchoolLearner } from '@/lib/class-writes'
import { GRADES } from '@/lib/subjects'
import { addLearner, enrolSchoolLearner, findSchoolLearners, makeLearnerCode, newClassCode, removeParent, renameClass, setClassGrade } from './actions'

const editBtn = 'min-h-11 flex-none rounded-12 border border-muted-2 bg-card px-3.5 text-[14px] font-semibold text-ink'
const save = 'flex h-[52px] items-center justify-center rounded-14 bg-ink text-[17px] font-semibold text-white disabled:opacity-50'

function SettingRow({ label, value, editLabel, first, children }: { label: string; value: string; editLabel: string; first?: boolean; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`flex min-h-[60px] items-center gap-3 py-1.5 ${first ? '' : 'border-t border-soft'}`}>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[13px] text-body">{label}</span>
        <span className="text-[16px] font-medium">{value}</span>
      </span>
      <button type="button" aria-label={editLabel} onClick={() => setOpen(true)} className={editBtn}>
        Edit
      </button>
      {open ? children(() => setOpen(false)) : null}
    </div>
  )
}

export function NameSheet({ classId, name, onClose }: { classId: string; name: string; onClose: () => void }) {
  const [value, setValue] = useState(name)
  const [pending, start] = useTransition()
  return (
    <Sheet open onClose={onClose} title="Class name">
      <label htmlFor="edit-name" className="text-[15px] font-medium">
        Class name
      </label>
      <input id="edit-name" value={value} onChange={(e) => setValue(e.target.value)} className="h-[52px] rounded-14 border border-muted-2 bg-card px-3.5 text-[17px] text-ink" />
      <PendingButton pending={pending} type="button" disabled={pending || !value.trim()} className={save} onClick={() => start(async () => { await renameClass(classId, value); onClose() })}>
        Save
      </PendingButton>
    </Sheet>
  )
}

export function GradeSheet({ classId, grade, onClose }: { classId: string; grade: number; onClose: () => void }) {
  const [value, setValue] = useState(grade)
  const [pending, start] = useTransition()
  return (
    <Sheet open onClose={onClose} title="Grade">
      <span className="grid grid-cols-4 gap-1.5">
        {GRADES.map((g) => (
          <button key={g} type="button" aria-pressed={value === g} onClick={() => setValue(g)} className={`h-11 rounded-12 text-[15px] ${value === g ? 'bg-ink font-semibold text-white' : 'border border-edge bg-card font-medium text-ink'}`}>
            Grade {g}
          </button>
        ))}
      </span>
      <PendingButton pending={pending} type="button" disabled={pending} className={save} onClick={() => start(async () => { await setClassGrade(classId, value); onClose() })}>
        Save
      </PendingButton>
    </Sheet>
  )
}

export function NewCodeButton({ classId }: { classId: string }) {
  const [pending, start] = useTransition()
  return (
    <PendingButton pending={pending} type="button" disabled={pending} onClick={() => start(() => newClassCode(classId))} className="flex min-h-11 items-center justify-center gap-2 rounded-12 border border-muted-2 bg-card text-[15px] font-semibold text-ink">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 12a8 8 0 1 1-2.34-5.66" />
        <path d="M20 4v4.5h-4.5" />
      </svg>
      Make a new code
    </PendingButton>
  )
}

/** In v1 every parent needs the teacher's yes, so the switch cannot be turned off; tapping it says why. */
export function ParentToggle() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" aria-pressed="true" onClick={() => setOpen(true)} className="flex min-h-14 w-full items-center gap-3 border-0 bg-transparent py-1.5 text-left text-ink">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[16px] font-medium">New parents need your OK</span>
          <span className="text-[13px] leading-[1.35] text-body">You approve each parent before they see anything</span>
        </span>
        <span aria-hidden="true" className="relative h-[30px] w-[50px] flex-none rounded-pill bg-ink">
          <span className="absolute top-1 left-6 size-[22px] rounded-pill bg-white" />
        </span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Always on" description="In this version every parent needs your OK before they see anything.">
        <button type="button" onClick={() => setOpen(false)} className={save}>
          Got it
        </button>
      </Sheet>
    </>
  )
}

export function RemoveParentButton({ classId, parentId, childId, name }: { classId: string; parentId: string; childId: string; name: string }) {
  const [pending, start] = useTransition()
  return (
    <PendingButton pending={pending} type="button" disabled={pending} aria-label={`Remove ${name}`} onClick={() => start(() => removeParent(classId, parentId, childId))} className={editBtn}>
      Remove
    </PendingButton>
  )
}

const learnerLine = (l: SchoolLearner) => [l.firstName, `Grade ${l.grade}`, l.classes.length ? `in ${l.classes.join(' and ')}` : null].filter(Boolean).join(', ')

export function AddLearnerRow({ classId }: { classId: string }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [found, setFound] = useState<SchoolLearner[]>([])
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  // Children of this school with the same first name, so a learner who is already here is not made twice.
  useEffect(() => {
    if (!open) return
    const wanted = name.trim()
    if (!wanted) return setFound([])
    let current = true
    const t = setTimeout(() => {
      findSchoolLearners(classId, wanted).then((hits) => current && setFound(hits))
    }, 250)
    return () => {
      current = false
      clearTimeout(t)
    }
  }, [open, name, classId])

  const close = () => {
    setOpen(false)
    setName('')
    setFound([])
    setError('')
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex min-h-14 w-full items-center gap-3 border-0 border-t border-soft bg-transparent py-1.5 text-left text-ink">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[16px] font-medium">Add a learner</span>
        </span>
        <ChevronRightIcon className="flex-none" />
      </button>
      <Sheet open={open} onClose={close} title="Add a learner">
        <label htmlFor="new-learner" className="text-[15px] font-medium">
          Learner&apos;s first name
        </label>
        <input id="new-learner" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" className="h-[52px] rounded-14 border border-muted-2 bg-card px-3.5 text-[17px] text-ink" />
        {found.length > 0 ? (
          <section aria-label="Already at your school" className="flex flex-col gap-2">
            <h3 className="m-0 text-[13px] font-semibold text-body">Already at your school</h3>
            {found.map((l) => (
              <PendingButton
                key={l.childId}
                pending={pending}
                type="button"
                disabled={pending}
                aria-label={`Add ${learnerLine(l)}`}
                className="flex min-h-14 items-center rounded-14 border border-muted-2 bg-card px-3.5 py-2 text-left text-[16px] font-medium text-ink"
                onClick={() =>
                  start(async () => {
                    const done = await enrolSchoolLearner(classId, l.childId)
                    if (done.ok) close()
                    else setError(done.error)
                  })
                }
              >
                {learnerLine(l)}
              </PendingButton>
            ))}
          </section>
        ) : null}
        {error ? (
          <p role="alert" className="m-0 text-[14px] leading-[1.4] font-semibold text-coral-text">
            {error}
          </p>
        ) : null}
        <PendingButton pending={pending} type="button" disabled={pending || !name.trim()} className={save} onClick={() => start(async () => { await addLearner(classId, name); close() })}>
          {found.length > 0 ? 'New learner' : 'Add'}
        </PendingButton>
      </Sheet>
    </>
  )
}

/** One learner of the class, with "Make a sign-in code": the teacher sets a 4 digit PIN and reads out the 6 character code. */
export function LearnerCodeRow({ classId, childId, name }: { classId: string; childId: string; name: string }) {
  const [open, setOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [code, setCode] = useState<{ code: string; pin: string } | null>(null)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  const close = () => {
    setOpen(false)
    setPin('')
    setCode(null)
    setError('')
  }
  return (
    <div className="flex min-h-14 items-center gap-3 border-t border-soft py-1.5">
      <span className="min-w-0 flex-1 text-[16px] font-medium">{name}</span>
      <button type="button" aria-label={`Make a sign-in code for ${name}`} onClick={() => setOpen(true)} className={editBtn}>
        Make a sign-in code
      </button>
      <Sheet open={open} onClose={close} title={`Sign-in code for ${name}`} description="The learner types the code and the PIN at Sign in with your code. Making a new one stops the old one.">
        {code ? (
          <>
            <div className="flex flex-col gap-1 rounded-14 bg-soft-2 p-3.5">
              <span className="text-[13px] text-body">Sign-in code</span>
              <span aria-label="Sign-in code" className="text-[28px] font-bold tracking-[0.14em]">
                {code.code}
              </span>
              <span className="text-[13px] text-body">PIN {code.pin}</span>
            </div>
            <p className="m-0 text-[14px] leading-[1.45] text-body">Write both down for {name}. Jemma does not keep the PIN where you can read it again.</p>
            <button type="button" onClick={close} className={save}>
              Done
            </button>
          </>
        ) : (
          <>
            <label htmlFor={`pin-${childId}`} className="text-[15px] font-medium">
              4 digit PIN
            </label>
            <input
              id={`pin-${childId}`}
              value={pin}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              autoComplete="off"
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="h-[52px] rounded-14 border border-muted-2 bg-card px-3.5 text-[22px] tracking-[0.3em] text-ink"
            />
            {error ? (
              <p role="alert" className="m-0 text-[14px] leading-[1.4] font-semibold text-coral-text">
                {error}
              </p>
            ) : null}
            <PendingButton
              pending={pending}
              type="button"
              disabled={pending || pin.length !== 4}
              className={save}
              onClick={() =>
                start(async () => {
                  const made = await makeLearnerCode(classId, childId, pin)
                  if (made.ok) setCode({ code: made.code, pin })
                  else setError(made.error)
                })
              }
            >
              Make the code
            </PendingButton>
          </>
        )}
      </Sheet>
    </div>
  )
}

export function NameRow({ classId, name }: { classId: string; name: string }) {
  return (
    <SettingRow first label="Name" value={name} editLabel="Edit class name">
      {(close) => <NameSheet classId={classId} name={name} onClose={close} />}
    </SettingRow>
  )
}

export function GradeRow({ classId, grade }: { classId: string; grade: number }) {
  return (
    <SettingRow label="Grade" value={`Grade ${grade}`} editLabel="Edit grade">
      {(close) => <GradeSheet classId={classId} grade={grade} onClose={close} />}
    </SettingRow>
  )
}

/** The subject is shown, not changed: a class is made for one subject. */
export function SubjectRow({ subject }: { subject: string }) {
  return (
    <div className="flex min-h-[60px] items-center gap-3 border-t border-soft py-1.5">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[13px] text-body">Subject</span>
        <span className="text-[16px] font-medium">{subject}</span>
      </span>
    </div>
  )
}
