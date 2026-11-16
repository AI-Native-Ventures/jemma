'use client'

import { useId, useState, useTransition } from 'react'
import { PendingButton } from '@/components/ui/Button'
import { SelectBox } from '@/app/t/new/SelectBox'
import { COUNTRIES, GRADES } from '@/lib/subjects'
import { colors, errorText, primaryButton } from '../../_parts'
import { startLearner } from './actions'

const NO_GRADE = 'Pick your grade, from 1 to 12.'

/**
 * The grade (Grade 1 to Grade 12) and the country (South Africa first, the same list as the parent's form), and one button. The grade is checked here
 * first and again on the server. On success the action sends the learner to their home, so only a refusal comes back.
 */
export function LearnerStartForm() {
  const id = useId()
  const [grade, setGrade] = useState('')
  const [country, setCountry] = useState('ZA')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const submit = () => {
    if (!grade) return setError(NO_GRADE)
    setError(null)
    start(async () => {
      const res = await startLearner({ grade: Number(grade), country })
      if (res && !res.ok) setError(res.message)
    })
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 18, background: '#FFFFFF', border: `1px solid ${colors.line}`, borderRadius: 22 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label htmlFor={`${id}-grade`} style={{ fontSize: 15, fontWeight: 500 }}>
          Grade
        </label>
        <SelectBox id={`${id}-grade`} value={grade} invalid={error === NO_GRADE} onChange={(v) => { setGrade(v); setError(null) }}>
          <option value="">Pick your grade</option>
          {GRADES.map((g) => (
            <option key={g} value={g}>
              Grade {g}
            </option>
          ))}
        </SelectBox>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label htmlFor={`${id}-country`} style={{ fontSize: 15, fontWeight: 500 }}>
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
        <p role="alert" style={errorText}>
          {error}
        </p>
      ) : null}
      <PendingButton pending={pending} type="submit" disabled={pending} style={{ ...primaryButton, opacity: pending ? 0.6 : 1 }}>
        Start practising
      </PendingButton>
    </form>
  )
}
