'use client'

import { PendingButton } from '@/components/ui/Button'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { approveMap, removeTopic, resolveCheck, saveTopic } from '../actions'
import { TERM_SHORT } from '../format'
import type { MapView } from './MapEditor'

type Topic = MapView['terms'][number]['topics'][number] & { term: number; index: number }

const ORDINALS = ['1st', '2nd', '3rd']
const ordinal = (n: number) => ORDINALS[n - 1] ?? `${n}th`

const tileBase = { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', color: '#1F1D36', borderRadius: 12 } as const
const numStyle = { fontSize: 11, fontWeight: 600, color: '#5D5A73' } as const
const topRow = { display: 'flex', width: '100%', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, color: '#5D5A73' } as const
const nameStyle = { fontSize: 14, fontWeight: 600, lineHeight: 1.3 } as const
const field = { height: 46, borderRadius: 12, border: '1px solid #8C89A3', background: '#FFFFFF', color: '#1F1D36', fontSize: 15 } as const
const label = { fontSize: 14, fontWeight: 500 } as const
const dark = { height: 44, borderRadius: 12, border: 'none', background: '#1F1D36', color: '#FFFFFF', fontSize: 15, fontWeight: 600 } as const
const light = { height: 44, borderRadius: 12, border: '1.5px solid #1F1D36', background: '#FFFFFF', color: '#1F1D36', fontSize: 15, fontWeight: 600 } as const

const GEM = (size: number, mt: number) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none', marginTop: mt }}>
    <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" />
  </svg>
)
const TICK = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
)

const swatch = (extra: React.CSSProperties) => <span aria-hidden="true" style={{ width: 16, height: 12, borderRadius: 4, ...extra }} />

/** Board laptop-teacher-curriculum: four term columns beside the topic panel. */
export function MapLaptop({ view }: { view: MapView }) {
  const [pending, start] = useTransition()
  const all: Topic[] = view.terms.flatMap((t) => t.topics.map((x, index) => ({ ...x, term: t.term, index })))
  const [sel, setSel] = useState<string>(() => view.terms.find((t) => t.term === view.initialTerm)?.topics[0]?.name ?? all[0]?.name ?? '')
  const run = (fn: () => Promise<unknown>) => start(async () => void (await fn()))

  const topic = all.find((t) => t.name === sel) ?? null
  const leftOut = topic ? null : (view.leftOut.find((l) => l.name === sel) ?? null)
  const docs = view.docs.length > 1 ? `${view.docs.slice(0, -1).join(', ')} and the ${view.docs[view.docs.length - 1]}` : (view.docs[0] ?? '')
  const subtitle = `${docs ? `Drafted from ${docs}. ` : ''}Nothing reaches a learner until you approve.`

  const pick = (name: string) => {
    setSel(name)
  }

  const tile = (t: Topic) => {
    const selected = t.name === sel
    const needed = Boolean(topic) && topic!.prereqs.includes(t.name)
    const builds = Boolean(topic) && t.prereqs.includes(topic!.name)
    let style: React.CSSProperties = { ...tileBase, gap: 2, padding: '9px 11px', border: '1px solid #E7E6EF', background: '#FFFFFF' }
    let tag: { text: string; color: string } | null = null
    if (selected) style = { ...tileBase, gap: 2, padding: '8px 10px', border: '2px solid #1F1D36', background: '#FFFFFF', boxShadow: '0 4px 12px rgba(31,29,54,0.12)' }
    else if (needed) {
      style = { ...tileBase, gap: 4, padding: '8px 10px', border: '2px solid #FF6A4D', background: '#FFFFFF' }
      tag = { text: 'Needed first', color: '#B8381F' }
    } else if (builds) {
      style = { ...tileBase, gap: 4, padding: '9px 11px', border: '1px solid #E7E6EF', background: '#E9E7F3' }
      tag = { text: 'Builds on it', color: '#1F1D36' }
    } else if (t.check) {
      style = { ...tileBase, gap: 4, padding: '9px 11px', border: '1px solid #FFC9BB', background: '#FFF4F1' }
      tag = { text: 'Check term', color: '#B8381F' }
    }
    return (
      <button key={t.name} type="button" aria-pressed={selected} onClick={() => pick(t.name)} style={style}>
        {tag ? (
          <span style={topRow}>{t.index + 1} <span style={{ color: tag.color }}>{tag.text}</span></span>
        ) : (
          <span style={numStyle}>{t.index + 1}</span>
        )}
        <span style={{ ...nameStyle, fontWeight: selected ? 700 : 600 }}>{t.name}</span>
      </button>
    )
  }

  return (
    <div style={{ lineHeight: 'normal', padding: '28px 32px 36px', opacity: pending ? 0.7 : 1 }}>
      <div style={{ maxWidth: 1140, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 720 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <p style={{ margin: 0, fontSize: 15, color: '#5D5A73' }}>{`Curriculum · Grade ${view.grade} ${view.subject}`}</p>
              {view.draft ? <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: '#EEEDF5' }}>Draft</span> : null}
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              {GEM(16, 13)}
              <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.15, fontWeight: 600, letterSpacing: '-0.02em', textWrap: 'pretty' }}>{view.headline}</h1>
            </div>
            <p style={{ margin: '0 0 0 28px', fontSize: 14, color: '#5D5A73' }}>{subtitle}</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href={`/t/${view.classId}/curriculum`} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 46, padding: '0 16px', borderRadius: 14, border: '1.5px solid #1F1D36', color: '#1F1D36', fontSize: 15, fontWeight: 600, textDecoration: 'none' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" /><path d="M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15" /></svg>
              Documents
            </Link>
            <PendingButton pending={pending} type="button" disabled={pending} onClick={() => run(() => approveMap(view.mapId))} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 46, padding: '0 18px', borderRadius: 14, border: 'none', background: '#1F1D36', color: '#FFFFFF', fontSize: 15, fontWeight: 600 }}>
              {TICK}
              Approve map
            </PendingButton>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
          <section aria-label="Topic map" style={{ flex: '1 1 640px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 18px', fontSize: 13, color: '#5D5A73' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{swatch({ border: '2px solid #1F1D36', background: '#FFFFFF' })}Selected</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{swatch({ border: '2px solid #FF6A4D', background: '#FFFFFF' })}Needed first</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{swatch({ background: '#E9E7F3' })}Builds on it</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{swatch({ background: '#FFF4F1', border: '1px solid #FFC9BB' })}For you to check</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(170px, 100%), 1fr))', gap: 12, alignItems: 'start' }}>
              {view.terms.map((t) => (
                <div key={t.term} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, background: '#EFEEF4', borderRadius: 18 }}>
                  <h2 style={{ margin: '0 0 2px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 15, fontWeight: 700 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {`Term ${t.term}`}
                      {t.badge > 0 ? <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: '#FF6A4D', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{t.badge}</span> : null}
                    </span>
                    {view.months ? <span style={{ fontSize: 12, fontWeight: 500, color: '#5D5A73' }}>{TERM_SHORT[t.term]}</span> : null}
                  </h2>
                  {all.filter((x) => x.term === t.term).map(tile)}
                  {view.leftOut.filter((l) => l.term === t.term).map((l) => (
                    <button key={l.name} type="button" aria-pressed={l.name === sel} onClick={() => pick(l.name)} style={{ ...tileBase, gap: 4, padding: '9px 11px', border: l.name === sel ? '2px solid #1F1D36' : '1.5px dashed #E8553A', background: '#FFF4F1' }}>
                      <span style={{ ...topRow, color: '#B8381F' }}>Left out <span>Check</span></span>
                      <span style={nameStyle}>{l.name}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="edit" style={{ flex: '0 1 340px', minWidth: 280, display: 'flex', flexDirection: 'column', gap: 16, padding: 20, background: '#FFFFFF', border: '1px solid #E7E6EF', borderRadius: 22 }}>
            {topic ? (
              <EditPanel
                key={`${topic.name}|${topic.term}|${topic.index}|${topic.prereqs.join('|')}`}
                topic={topic}
                all={all}
                termCounts={Object.fromEntries(view.terms.map((t) => [t.term, t.topics.length]))}
                pending={pending}
                onSave={(name, term, position, prerequisites) => { setSel(name); run(() => saveTopic(view.mapId, topic.name, { name, term, position, prerequisites })) }}
                onRemove={() => { setSel(all.find((x) => x.name !== topic.name)?.name ?? ''); run(() => removeTopic(view.mapId, topic.name)) }}
                onResolve={(option) => run(() => resolveCheck(view.mapId, topic.name, option))}
              />
            ) : leftOut ? (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#B8381F' }}>Left out</span>
                  <h2 id="edit" style={{ margin: 0, fontSize: 20, lineHeight: 1.25, fontWeight: 700 }}>{leftOut.name}</h2>
                </div>
                <p style={{ margin: 0, display: 'flex', gap: 8, fontSize: 15, lineHeight: 1.45 }}>{GEM(12, 5)}<span>{leftOut.reason} Add it?</span></p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                  <button type="button" disabled={pending} onClick={() => run(() => resolveCheck(view.mapId, leftOut.name, `Add to Term ${leftOut.term}`))} style={dark}>{`Add to Term ${leftOut.term}`}</button>
                  <button type="button" disabled={pending} onClick={() => run(() => resolveCheck(view.mapId, leftOut.name, 'Leave it out'))} style={light}>Leave it out</button>
                </div>
              </>
            ) : (
              <h2 id="edit" style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Pick a topic to edit it.</h2>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function EditPanel({
  topic,
  all,
  termCounts,
  pending,
  onSave,
  onRemove,
  onResolve,
}: {
  topic: Topic
  all: Topic[]
  termCounts: Record<number, number>
  pending: boolean
  onSave: (name: string, term: number, position: number, prerequisites: string[]) => void
  onRemove: () => void
  onResolve: (option: string) => void
}) {
  const [name, setName] = useState(topic.name)
  const [term, setTerm] = useState(topic.term)
  const [position, setPosition] = useState(topic.index)
  const [needs, setNeeds] = useState(topic.prereqs)
  const [picking, setPicking] = useState(false)
  const places = (termCounts[term] ?? 0) + (term === topic.term ? 0 : 1)
  const termOf = (n: string) => all.find((x) => x.name === n)?.term
  const options = all.filter((x) => x.name !== topic.name && !needs.includes(x.name))

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#5D5A73' }}>{`Term ${topic.term} · topic ${topic.index + 1}`}</span>
        <h2 id="edit" style={{ margin: 0, fontSize: 20, lineHeight: 1.25, fontWeight: 700 }}>{topic.name}</h2>
      </div>

      {topic.check ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 14, background: '#FFF4F1', border: '1px solid #FFC9BB', borderRadius: 16 }}>
          <p style={{ margin: 0, display: 'flex', gap: 8, fontSize: 15, lineHeight: 1.45 }}>{GEM(12, 5)}<span>{topic.check.reason}</span></p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            {topic.check.options.map((o, k) => (
              <button key={o} type="button" disabled={pending} onClick={() => onResolve(o)} style={k === 0 ? dark : light}>{o}</button>
            ))}
          </div>
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label htmlFor="tname" style={label}>Name</label>
        <input id="tname" type="text" value={name} onChange={(e) => setName(e.target.value)} style={{ ...field, padding: '0 12px' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="tterm" style={label}>Term</label>
          <select id="tterm" value={term} onChange={(e) => { const n = Number(e.target.value); setTerm(n); setPosition((termCounts[n] ?? 0) + (n === topic.term ? -1 : 0)) }} style={{ ...field, padding: '0 10px' }}>
            {Object.keys(termCounts).map(Number).sort((a, b) => a - b).map((n) => <option key={n} value={n}>{`Term ${n}`}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="torder" style={label}>Order</label>
          <select id="torder" value={position} onChange={(e) => setPosition(Number(e.target.value))} style={{ ...field, padding: '0 10px' }}>
            {Array.from({ length: places }, (_, i) => <option key={i} value={i}>{ordinal(i + 1)}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={label}>Needs first</span>
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {needs.map((n) => (
            <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, minHeight: 44, padding: '0 0 0 12px', borderRadius: 999, border: '1.5px solid #FF6A4D', fontSize: 13, fontWeight: 600 }}>
              {termOf(n) ? `${n} · T${termOf(n)}` : n}
              <button type="button" aria-label={`Remove ${n}`} onClick={() => setNeeds(needs.filter((x) => x !== n))} style={{ width: 44, height: 44, border: 'none', background: 'transparent', padding: 0, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1F1D36' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </span>
          ))}
          {picking ? (
            <select aria-label="Add a topic it needs" autoFocus value="" onChange={(e) => { if (e.target.value) setNeeds([...needs, e.target.value]); setPicking(false) }} onBlur={() => setPicking(false)} style={{ ...field, height: 44, padding: '0 10px', fontSize: 13, maxWidth: '100%' }}>
              <option value="">Pick a topic</option>
              {options.map((x) => <option key={x.name} value={x.name}>{`${x.name} · T${x.term}`}</option>)}
            </select>
          ) : (
            <button type="button" onClick={() => setPicking(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 44, padding: '0 14px', borderRadius: 999, border: '1px dashed #8C89A3', background: 'transparent', fontSize: 13, fontWeight: 600, color: '#1F1D36' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              Add
            </button>
          )}
        </span>
      </div>

      {topic.misconceptions.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={label}>Mistakes Jemma looks for</span>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {topic.misconceptions.map((m) => {
              const cut = m.indexOf(': ')
              return (
                <li key={m} style={{ padding: '9px 12px', borderRadius: 12, background: '#F4F3F8', fontSize: 14, lineHeight: 1.4 }}>
                  {cut < 0 ? m : <>{m.slice(0, cut + 2)}<strong style={{ fontWeight: 700 }}>{m.slice(cut + 2)}</strong></>}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, color: '#5D5A73' }}>{`Found in the teaching plan, Term ${topic.term}. Every test question and lesson on this topic gets tagged to it.`}</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <PendingButton pending={pending} type="button" disabled={pending || !name.trim()} onClick={() => onSave(name.trim(), term, position, needs)} style={{ ...dark, flex: 1, height: 46 }}>Save</PendingButton>
        <PendingButton pending={pending} type="button" disabled={pending} onClick={onRemove} style={{ ...light, height: 46, padding: '0 14px' }}>Remove topic</PendingButton>
      </div>
    </>
  )
}
