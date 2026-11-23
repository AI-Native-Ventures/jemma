'use client'

import { useId, useState, useTransition } from 'react'
import { SelectBox } from '@/app/t/new/SelectBox'
import { COUNTRIES, GRADES } from '@/lib/subjects'
import { addChildAlone } from './actions'
import { ALONE_ID, ALONE_LABEL } from './alone'

const field = 'min-h-[52px] w-full rounded-14 border border-muted-2 bg-card px-3.5 py-2 text-[17px] text-ink'
const label = 'text-[15px] font-medium'
const outline =
  'flex min-h-14 w-full cursor-pointer items-center justify-center rounded-14 border-[1.5px] border-ink bg-card px-5 py-3 text-center text-[17px] leading-[1.25] font-semibold text-balance text-ink'
const filled =
  'flex min-h-14 w-full cursor-pointer items-center justify-center rounded-14 border-0 bg-green px-5 py-3 text-center text-[17px] leading-[1.25] font-semibold text-balance text-white disabled:opacity-60'

const NO_NAME = 'Type your child’s first name.'
const NO_GRADE = 'Pick a grade from 1 to 12.'

/**
 * "My child's school doesn't use Jemma": under the class-code form, a second way to add a child. One button opens a short form: the child's first name,
 * the grade (1 to 12) and the country (South Africa first, then the countries a school can be in). The parent adds the child alone, with no school and no
 * teacher: the child practises in their own space, and the parent lands on the child's page. The words are checked here first and again on the server.
 */
export function AloneForm({ defaultName = '', defaultOpen = false }: { defaultName?: string; /** Open at once: the parent came from a link to this form. */ defaultOpen?: boolean }) {
  const id = useId()
  const [open, setOpen] = useState(defaultOpen)
  const [name, setName] = useState(defaultName)
  const [grade, setGrade] = useState('')
  const [country, setCountry] = useState('ZA')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const kid = name.trim() || 'your child'

  const submit = () => {
    if (!name.trim()) return setError(NO_NAME)
    if (!grade) return setError(NO_GRADE)
    setError(null)
    start(async () => {
      // On success the action sends the parent to the child's page, so only a refusal comes back.
      const res = await addChildAlone({ firstName: name, grade: Number(grade), country })
      if (res && !res.ok) setError(res.message)
    })
  }

  return (
    <div id={ALONE_ID} className="flex scroll-mt-4 flex-col gap-3.5">
      <button type="button" aria-expanded={open} aria-controls={`${id}-form`} onClick={() => setOpen((o) => !o)} className={outline}>
        {ALONE_LABEL}
      </button>
      {open ? (
        <form
          id={`${id}-form`}
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          className="flex flex-col gap-4 rounded-20 border border-line bg-card p-4"
        >
          <p className="m-0 text-[15px] leading-[1.45] text-body">Add your child yourself. They practise on their own, and you see how it goes. You can make them a sign-in code next.</p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-name`} className={label}>
              Your child&apos;s first name
            </label>
            <input id={`${id}-name`} type="text" autoComplete="off" value={name} maxLength={40} onChange={(e) => { setName(e.target.value); setError(null) }} className={field} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-grade`} className={label}>
              Grade
            </label>
            <SelectBox id={`${id}-grade`} value={grade} onChange={(v) => { setGrade(v); setError(null) }}>
              <option value="">Pick a grade</option>
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  Grade {g}
                </option>
              ))}
            </SelectBox>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-country`} className={label}>
              Country
            </label>
            <SelectBox id={`${id}-country`} value={country} onChange={(v) => { setCountry(v); setError(null) }}>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </SelectBox>
          </div>
          {error ? (
            <p role="alert" className="m-0 text-[15px] leading-[1.4] font-semibold text-red-text">
              {error}
            </p>
          ) : null}
          <button type="submit" disabled={pending} className={filled}>
            {pending ? 'Adding' : `Add ${kid}`}
          </button>
        </form>
      ) : null}
    </div>
  )
}
