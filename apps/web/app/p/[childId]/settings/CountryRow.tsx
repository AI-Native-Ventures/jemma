'use client'

import { useState, useTransition } from 'react'
import { SelectBox } from '@/app/t/new/SelectBox'
import { COUNTRIES } from '@/lib/subjects'
import { saveChildCountry } from './actions'

/**
 * P161: a child's country, which a parent can change. It sets the child's own curriculum and the money, units and number format of their practice
 * (South Africa: rand, metric, 0,75; the US: dollars, US units, 0.75).
 */
export function CountryRow({ childId, name, initial }: { childId: string; name: string; initial: string }) {
  const [country, setCountry] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '6px 0' }}>
      <label htmlFor={`country-${childId}`} style={{ fontSize: 16, fontWeight: 500 }}>
        {name}&apos;s country
      </label>
      <span style={{ fontSize: 13, lineHeight: 1.35, color: '#5C5A55' }}>Sets {name}&apos;s maths topics, money, units and how numbers are written.</span>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <SelectBox id={`country-${childId}`} value={country} onChange={(v) => { setCountry(v); setMsg(null) }}>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </SelectBox>
        </div>
        <button
          type="button"
          disabled={pending || country === saved}
          onClick={() =>
            start(async () => {
              const res = await saveChildCountry(childId, country)
              if (res.ok) {
                setSaved(country)
                setMsg('Saved.')
              } else setMsg(res.error)
            })
          }
          style={{ minHeight: 48, padding: '0 16px', borderRadius: 12, border: '1px solid #8F8D88', background: '#FFFFFF', color: '#161616', fontSize: 15, fontWeight: 600, opacity: pending || country === saved ? 0.55 : 1, cursor: 'pointer' }}
        >
          {pending ? 'Saving' : 'Save'}
        </button>
      </div>
      {msg ? (
        <p role="status" style={{ margin: 0, fontSize: 14, color: msg === 'Saved.' ? '#005C38' : '#B8281E' }}>
          {msg}
        </p>
      ) : null}
    </div>
  )
}
