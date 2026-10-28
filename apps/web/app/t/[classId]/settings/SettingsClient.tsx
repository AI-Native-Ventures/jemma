'use client'

import { PendingButton } from '@/components/ui/Button'
import { useState, useTransition } from 'react'
import { Sheet } from '@/components/ui'
import { ChevronRightIcon } from '@/components/ui/icons'
import { ComingSheet } from '../../_p21-client'
import { addLearner, newClassCode, removeParent, renameClass, setClassGrade } from './actions'

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
        {[4, 5, 6, 7].map((g) => (
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

export function SubjectSheet({ onClose }: { onClose: () => void }) {
  return <ComingSheet open onClose={onClose} />
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

export function AddLearnerRow({ classId }: { classId: string }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [pending, start] = useTransition()
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex min-h-14 w-full items-center gap-3 border-0 border-t border-soft bg-transparent py-1.5 text-left text-ink">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[16px] font-medium">Add a learner</span>
        </span>
        <ChevronRightIcon className="flex-none" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Add a learner">
        <label htmlFor="new-learner" className="text-[15px] font-medium">
          Learner&apos;s first name
        </label>
        <input id="new-learner" value={name} onChange={(e) => setName(e.target.value)} className="h-[52px] rounded-14 border border-muted-2 bg-card px-3.5 text-[17px] text-ink" />
        <PendingButton pending={pending} type="button" disabled={pending || !name.trim()} className={save} onClick={() => start(async () => { await addLearner(classId, name); setName(''); setOpen(false) })}>
          Add
        </PendingButton>
      </Sheet>
    </>
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

export function SubjectRow({ subject }: { subject: string }) {
  return (
    <SettingRow label="Subject" value={subject} editLabel="Edit subject">
      {(close) => <SubjectSheet onClose={close} />}
    </SettingRow>
  )
}
