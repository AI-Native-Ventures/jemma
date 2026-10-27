'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { css, Icon } from '../../beyond/_parts'
import { saveActivity, type ActivityInput } from '../actions'

const KINDS: { id: NonNullable<ActivityInput['kind']>; label: string }[] = [
  { id: 'sport', label: 'Sport' },
  { id: 'club', label: 'Club' },
  { id: 'music', label: 'Music' },
  { id: 'art', label: 'Art' },
  { id: 'other', label: 'Something else' },
]
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const SINCE = ['This term', 'Last term', 'This year', 'Longer']

const OFF = 'border:1px solid #8C89A3;background:#FFFFFF;color:#1F1D36'
const ON = 'border:none;background:#1F1D36;color:#FFFFFF'

export function ActivityForm({ childId, name }: { childId: string; name: string }) {
  const router = useRouter()
  const [kind, setKind] = useState<ActivityInput['kind']>(null)
  const [title, setTitle] = useState('')
  const [place, setPlace] = useState('')
  const [days, setDays] = useState<string[]>([])
  const [since, setSince] = useState(SINCE[0]!)
  const [error, setError] = useState<string | null>(null)
  const [focus, setFocus] = useState(false)
  const [pending, start] = useTransition()

  const save = () =>
    start(async () => {
      setError(null)
      const res = await saveActivity(childId, { kind, name: title, place, days, since })
      if (res.ok) router.push(`/p/${childId}`)
      else setError(res.error)
    })

  return (
    <div style={css('display:flex;flex-direction:column;gap:20px;padding:12px 20px 24px;min-height:0;line-height:normal')}>
      <h1 style={{ ...css('margin:0;font-size:27px;line-height:1.18;font-weight:700;letter-spacing:-0.015em'), textWrap: 'pretty' }}>{`What does ${name} do outside class?`}</h1>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
        style={css('display:flex;flex-direction:column;gap:20px')}
      >
        <fieldset style={css('border:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px')}>
          <legend style={css('padding:0;margin-bottom:10px;font-size:15px;font-weight:500')}>Kind</legend>
          <div style={css('display:flex;flex-wrap:wrap;gap:8px')}>
            {KINDS.map((k) => {
              const on = kind === k.id
              return (
                <button
                  key={k.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setKind(k.id)}
                  style={css(`display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 16px;border-radius:999px;${on ? ON : OFF};font-size:15px;font-weight:500`)}
                >
                  {on ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m5 12.5 4.5 4.5L19 7.5" />
                    </svg>
                  ) : null}
                  {k.label}
                </button>
              )
            })}
          </div>
        </fieldset>

        <div style={css('display:flex;flex-direction:column;gap:6px')}>
          <label htmlFor="aname" style={css('font-size:15px;font-weight:500')}>What is it called?</label>
          <input
            id="aname"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            style={css(`height:52px;padding:0 16px;border-radius:14px;border:${focus ? '2px solid #1F1D36' : '1px solid #8C89A3'};background:#FFFFFF;color:#1F1D36;font-size:17px`)}
          />
        </div>

        <div style={css('display:flex;flex-direction:column;gap:6px')}>
          <label htmlFor="awhere" style={css('font-size:15px;font-weight:500')}>
            Where <span style={css('color:#5D5A73;font-weight:400')}>(optional)</span>
          </label>
          <input
            id="awhere"
            type="text"
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            style={css('height:52px;padding:0 16px;border-radius:14px;border:1px solid #8C89A3;background:#FFFFFF;color:#1F1D36;font-size:17px')}
          />
        </div>

        <fieldset style={css('border:none;margin:0;padding:0')}>
          <legend style={css('padding:0;margin-bottom:10px;font-size:15px;font-weight:500')}>Which days?</legend>
          <div style={css('display:grid;grid-template-columns:repeat(7, minmax(0, 1fr));gap:6px')}>
            {DAYS.map((d) => {
              const on = days.includes(d)
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d])}
                  style={css(`height:46px;border-radius:12px;${on ? ON : OFF};font-size:14px;font-weight:600`)}
                >
                  {d}
                </button>
              )
            })}
          </div>
        </fieldset>

        <div style={css('display:flex;flex-direction:column;gap:6px')}>
          <label htmlFor="asince" style={css('font-size:15px;font-weight:500')}>Since when?</label>
          <select
            id="asince"
            value={since}
            onChange={(e) => setSince(e.target.value)}
            style={css('height:52px;padding:0 14px;border-radius:14px;border:1px solid #8C89A3;background:#FFFFFF;color:#1F1D36;font-size:17px')}
          >
            {SINCE.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      </form>

      <p style={css('margin:0;display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:14px;background:#EEEDF5;font-size:14px;line-height:1.45')}>
        <span style={css('flex:none;margin-top:1px;display:flex')}>
          <Icon name="eye" size={18} width={1.8} color="#1F1D36" />
        </span>
        {`Ms Banda sees activities on ${name}'s profile. Jemma uses them in the guidance card, never to mark her.`}
      </p>

      {error ? (
        <p role="alert" style={css('margin:0;font-size:14px;font-weight:600;color:#B8381F')}>{error}</p>
      ) : null}

      <div style={css('flex:1')} />
      <button
        type="button"
        onClick={save}
        disabled={pending}
        style={css('display:flex;align-items:center;justify-content:center;height:52px;border-radius:14px;border:none;background:#1F1D36;color:#FFFFFF;font-size:17px;font-weight:600;opacity:' + (pending ? '0.6' : '1'))}
      >
        Save activity
      </button>
    </div>
  )
}
