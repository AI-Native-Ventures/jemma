'use client'

import Link from 'next/link'
import { useState } from 'react'
import { body, gold, ink, line, soft } from './_ui'

export type PickerPlan = { id: string; name: string; price: string; per: string; practice: string; note: string }

function Radio({ on }: { on: boolean }) {
  return (
    <span aria-hidden="true" style={{ width: 24, height: 24, flex: 'none', borderRadius: 999, border: `2px solid ${on ? '#007749' : '#8F8D88'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {on ? <span style={{ width: 12, height: 12, borderRadius: 999, background: '#007749' }} /> : null}
    </span>
  )
}

/**
 * The plans as a list to pick from (P161): Free and the three plans, the one the family is on marked "Now". Picking another plan and Continue opens the
 * check screen for it. Closed (plans not open yet): the list shows, and the button says plans open soon.
 */
export function PlanPicker({ plans, now, open }: { plans: PickerPlan[]; now: string; open: boolean }) {
  const first = plans.find((p) => p.id !== now && p.id !== 'free')?.id ?? 'regular'
  const [picked, setPicked] = useState(now === 'free' ? 'regular' : first)
  const chosen = plans.find((p) => p.id === picked)
  return (
    <>
      <fieldset style={{ margin: 0, padding: 0, border: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <legend style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Pick a plan</legend>
        {plans.map((p) => {
          const on = p.id === picked
          const current = p.id === now
          return (
            <label
              key={p.id}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                minHeight: 72,
                padding: '12px 16px',
                borderRadius: 18,
                background: on ? '#F2F9F5' : '#FFFFFF',
                border: on ? '2px solid #007749' : `1px solid ${line}`,
                margin: on ? 0 : 1,
                cursor: current ? 'default' : 'pointer',
              }}
            >
              <input
                type="radio"
                name="plan"
                value={p.id}
                checked={on}
                disabled={current || p.id === 'free'}
                onChange={() => setPicked(p.id)}
                style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
              />
              <Radio on={on} />
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18, fontWeight: 700 }}>{p.name}</span>
                  {current ? <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: soft, color: ink }}>Now</span> : null}
                </span>
                <span style={{ fontSize: 15, lineHeight: 1.35, color: ink }}>{p.practice}</span>
                {p.note ? <span style={{ fontSize: 13, lineHeight: 1.35, color: body }}>{p.note}</span> : null}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flex: 'none' }}>
                <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>{p.price}</span>
                {p.per ? <span style={{ fontSize: 13, color: body }}>{p.per}</span> : null}
              </span>
            </label>
          )
        })}
      </fieldset>
      <div style={{ flex: 1 }} />
      {open && chosen && chosen.id !== now ? (
        <Link href={`/p/plans/check?plan=${chosen.id}`} style={gold}>
          Continue with {chosen.name}
        </Link>
      ) : !open ? (
        <p style={{ margin: 0, padding: 16, borderRadius: 18, background: '#F4F2EE', fontSize: 16, lineHeight: 1.45, textAlign: 'center' }}>Plans open soon. For now, practice is free.</p>
      ) : null}
    </>
  )
}
