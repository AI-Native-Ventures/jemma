'use client'

import { useState, useSyncExternalStore, useTransition } from 'react'
import { Button, Sheet } from '@/components/ui'
import { addTopic, approveMap, moveTopic, renameTopic, resolveCheck } from '../actions'
import { TERM_RANGE, plural } from '../format'
import { MapLaptop } from './MapLaptop'

export type MapView = {
  mapId: string
  classId: string
  grade: number
  subject: string
  docs: string[]
  headline: string
  draft: boolean
  initialTerm: number
  terms: {
    term: 1 | 2 | 3 | 4
    badge: number
    topics: { name: string; needs: string | null; prereqs: string[]; misconceptions: string[]; check: { reason: string; options: string[] } | null }[]
  }[]
  leftOut: { name: string; term: number; reason: string }[]
}

const GEM = (size: number, mt: number) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none', marginTop: mt }}>
    <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" />
  </svg>
)
const dark = { height: 44, borderRadius: 12, border: 'none', background: '#1F1D36', color: '#FFFFFF', fontSize: 15, fontWeight: 600 } as const
const light = { height: 44, borderRadius: 12, border: '1.5px solid #1F1D36', background: '#FFFFFF', color: '#1F1D36', fontSize: 15, fontWeight: 600 } as const
const checkPill = <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 9px', borderRadius: 999, background: '#FF6A4D', color: '#1F1D36', flex: 'none' }}>Check</span>
const input = { height: 48, borderRadius: 12, border: '1.5px solid #CFCDDC', background: '#FFFFFF', padding: '0 14px', fontSize: 16, color: '#1F1D36', fontFamily: 'inherit' } as const

const LAPTOP = '(min-width: 1024px)'
const subscribe = (cb: () => void) => {
  const q = window.matchMedia(LAPTOP)
  q.addEventListener('change', cb)
  return () => q.removeEventListener('change', cb)
}

/** Phone: one term at a time. Width 1024 and up: all four terms beside the topic panel (board laptop-teacher-curriculum). */
export function MapEditor({ view }: { view: MapView }) {
  const laptop = useSyncExternalStore(subscribe, () => window.matchMedia(LAPTOP).matches, () => false)
  return laptop ? <MapLaptop view={view} /> : <MapPhone view={view} />
}

function MapPhone({ view }: { view: MapView }) {
  const [term, setTerm] = useState(view.initialTerm)
  const [pending, start] = useTransition()
  const [dragging, setDragging] = useState<string | null>(null)
  const [sheet, setSheet] = useState<{ kind: 'add' } | { kind: 'edit'; name: string } | null>(null)
  const [text, setText] = useState('')
  const [editTerm, setEditTerm] = useState(term)
  const current = view.terms.find((t) => t.term === term)!
  const run = (fn: () => Promise<unknown>) => start(async () => void (await fn()))
  const move = (name: string, to: number, position: number) => run(() => moveTopic(view.mapId, name, to, position))
  const leftOut = view.leftOut.filter((l) => l.term === term)

  const closeSheet = () => setSheet(null)
  const openAdd = () => {
    setText('')
    setSheet({ kind: 'add' })
  }
  const openEdit = (name: string) => {
    setText(name)
    setEditTerm(term)
    setSheet({ kind: 'edit', name })
  }
  const submitSheet = () => {
    if (!sheet || !text.trim()) return
    const s = sheet
    closeSheet()
    run(async () => {
      if (s.kind === 'add') return addTopic(view.mapId, term, text)
      if (text.trim() !== s.name) await renameTopic(view.mapId, s.name, text)
      if (editTerm !== term) await moveTopic(view.mapId, text.trim() || s.name, editTerm, Number.MAX_SAFE_INTEGER)
    })
  }

  return (
    <div style={{ lineHeight: 'normal', display: 'flex', flexDirection: 'column', gap: 18, padding: '12px 20px 16px', maxWidth: 720, opacity: pending ? 0.7 : 1 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#5D5A73' }}>Curriculum</p>
          {view.draft ? <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: '#EEEDF5' }}>Draft</span> : null}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          {GEM(14, 10)}
          <h1 style={{ margin: 0, fontSize: 26, lineHeight: 1.2, fontWeight: 600, letterSpacing: '-0.01em', textWrap: 'pretty' }}>{view.headline}</h1>
        </div>
        <p style={{ margin: '0 0 0 24px', fontSize: 14, lineHeight: 1.45, color: '#5D5A73' }}>Drag to reorder. Tap a topic to rename it, change its term or what it needs.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 4, padding: 4, background: '#EEEDF5', borderRadius: 14 }}>
        {view.terms.map((t) => {
          const on = t.term === term
          return (
            <button
              key={t.term}
              type="button"
              aria-pressed={on}
              onClick={() => setTerm(t.term)}
              style={{
                height: 44, border: 'none', borderRadius: 10, background: on ? '#FFFFFF' : 'transparent', fontSize: 15, fontWeight: on ? 600 : 500, color: '#1F1D36',
                ...(on ? { boxShadow: '0 1px 3px rgba(31,29,54,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 } : {}),
              }}
            >
              Term {t.term}{' '}
              {t.badge > 0 ? (
                <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: '#FF6A4D', color: '#1F1D36', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{t.badge}</span>
              ) : null}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{`Term ${term} · ${TERM_RANGE[term]}`}</h2>
        <span style={{ fontSize: 14, color: '#5D5A73' }}>{plural(current.topics.length, 'topic')}</span>
      </div>

      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {current.topics.map((t, i) =>
          t.check ? (
            <li key={t.name} style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 14px 14px 12px', background: '#FFF4F1', border: '1px solid #FFC9BB', borderRadius: 16 }}>
              <span style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ width: 24, height: 24, flex: 'none', borderRadius: 999, background: '#FFFFFF', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span className="topic-name" style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}>{t.name}</span>
                  {t.needs ? <span style={{ fontSize: 13, color: '#5D5A73', lineHeight: 1.35 }}>{t.needs}</span> : null}
                </span>
                {checkPill}
              </span>
              <p style={{ margin: 0, display: 'flex', gap: 8, fontSize: 15, lineHeight: 1.45 }}>
                {GEM(12, 5)}
                <span>{t.check.reason}</span>
              </p>
              <span style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                {t.check.options.map((o, k) => (
                  <button key={o} type="button" disabled={pending} onClick={() => run(() => resolveCheck(view.mapId, t.name, o))} style={k === 0 ? dark : light}>
                    {o}
                  </button>
                ))}
              </span>
            </li>
          ) : (
            <li
              key={t.name}
              draggable
              onDragStart={() => setDragging(t.name)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragging && dragging !== t.name) move(dragging, term, i)
                setDragging(null)
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 4px 10px 2px', background: '#FFFFFF', border: '1px solid #E7E6EF', borderRadius: 16 }}
            >
              <button type="button" aria-label={`Move ${t.name}`} onClick={() => move(t.name, term, i === 0 ? 1 : i - 1)} style={{ width: 44, height: 44, flex: 'none', border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                <svg width="12" height="18" viewBox="0 0 12 18" fill="#8C89A3" aria-hidden="true"><circle cx="3" cy="3" r="1.5" /><circle cx="9" cy="3" r="1.5" /><circle cx="3" cy="9" r="1.5" /><circle cx="9" cy="9" r="1.5" /><circle cx="3" cy="15" r="1.5" /><circle cx="9" cy="15" r="1.5" /></svg>
              </button>
              <span style={{ width: 24, height: 24, flex: 'none', borderRadius: 999, background: '#EEEDF5', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span className="topic-name" style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}>{t.name}</span>
                {t.needs ? <span style={{ fontSize: 13, color: '#5D5A73', lineHeight: 1.35 }}>{t.needs}</span> : null}
              </span>
              <button type="button" aria-label={`Edit ${t.name}`} onClick={() => openEdit(t.name)} style={{ width: 44, height: 44, flex: 'none', border: 'none', background: 'transparent', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1F1D36', padding: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" /></svg>
              </button>
            </li>
          ),
        )}
      </ol>

      {leftOut.map((l) => (
        <section key={l.name} aria-labelledby="leftout" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 14, background: '#FFF4F1', border: '1px solid #FFC9BB', borderRadius: 16 }}>
          <span style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#B8381F' }}>Left out</span>
              <span id="leftout" style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}>{l.name}</span>
            </span>
            {checkPill}
          </span>
          <p style={{ margin: 0, display: 'flex', gap: 8, fontSize: 15, lineHeight: 1.45 }}>
            {GEM(12, 5)}
            <span>{l.reason} Add it?</span>
          </p>
          <span style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            <button type="button" disabled={pending} onClick={() => run(() => resolveCheck(view.mapId, l.name, `Add to Term ${l.term}`))} style={dark}>{`Add to Term ${l.term}`}</button>
            <button type="button" disabled={pending} onClick={() => run(() => resolveCheck(view.mapId, l.name, 'Leave it out'))} style={light}>Leave it out</button>
          </span>
        </section>
      ))}

      <button type="button" onClick={openAdd} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 14, border: '1.5px dashed #8C89A3', background: 'transparent', color: '#1F1D36', fontSize: 15, fontWeight: 600 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        {`Add a topic to Term ${term}`}
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => approveMap(view.mapId))}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 14, border: 'none', background: '#1F1D36', color: '#FFFFFF', fontSize: 17, fontWeight: 600 }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
          Approve map
        </button>
        <p style={{ margin: 0, textAlign: 'center', fontSize: 13, color: '#5D5A73' }}>You can edit the map any time. Jemma re-tags past results.</p>
      </div>

      <Sheet open={sheet !== null} onClose={closeSheet} title={sheet?.kind === 'add' ? `Add a topic to Term ${term}` : 'Edit topic'}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, fontWeight: 600 }}>
          Topic name
          <input value={text} onChange={(e) => setText(e.target.value)} style={input} />
        </label>
        {sheet?.kind === 'edit' ? (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, fontWeight: 600 }}>
            Term
            <select value={editTerm} onChange={(e) => setEditTerm(Number(e.target.value))} style={input}>
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{`Term ${n}`}</option>)}
            </select>
          </label>
        ) : null}
        <Button variant="primary" onClick={submitSheet}>{sheet?.kind === 'add' ? 'Add topic' : 'Save topic'}</Button>
      </Sheet>
    </div>
  )
}
