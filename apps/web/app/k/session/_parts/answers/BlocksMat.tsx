'use client'

import { useState, type KeyboardEvent } from 'react'
import { blockPlaces, blocksNumber, blocksOf, BLOCKS_MAX, type BlockPlace } from '@jemma/profiling/logic'
import type { BlocksSpec } from '@jemma/profiling/schemas'
import { GOLD, INK } from '@/components/diagrams/shared'

// P169: a number built with place value blocks, from the "Build with pieces" board. A mat, and under it a button for each block the learner may use: a tap
// puts a block on the mat, and a tap on a block on the mat takes it off. At most 9 of each. The line under the mat says what is on it (never whether it is
// right). The same mat, without the buttons, shows the blocks a learner built in the results.

const MAT_FILL = '#FBF6E8'
const MAT_EDGE = '#8F8D88'
const NAMES: Record<BlockPlace, [string, string]> = { hundreds: ['hundred', 'hundreds'], tens: ['ten', 'tens'], ones: ['one', 'ones'] }

/** "3 tens and 4 ones", or "2 hundreds, 0 tens and 5 ones": every place the learner may use, in order. */
export function blocksWords(places: BlockPlace[], counts: Partial<Record<BlockPlace, number>>): string {
  const parts = places.map((p) => `${counts[p] ?? 0} ${NAMES[p][(counts[p] ?? 0) === 1 ? 0 : 1]}`)
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/** The sizes of the blocks (a cube of a rod or a one, and its pitch; a flat and its pitch): big when ones are all there is, smaller with tens, smallest with hundreds. */
function sizes(places: BlockPlace[]) {
  if (places.includes('hundreds')) return { cell: 9, pitch: 13, flat: 36, flatPitch: 40, h: 150 }
  if (places.includes('tens')) return { cell: 12, pitch: 20, flat: 0, flatPitch: 0, h: 150 }
  return { cell: 22, pitch: 30, flat: 0, flatPitch: 0, h: 116 }
}

type Region = { place: BlockPlace; x: number; w: number }

/** The mat, left to right: hundreds (a 3 by 3 grid of flats), tens (a row of rods), ones (a 3 by 3 grid of cubes). */
function layout(places: BlockPlace[]) {
  const s = sizes(places)
  const gap = 16
  const width = (p: BlockPlace) => (p === 'hundreds' ? 2 * s.flatPitch + s.flat : p === 'tens' ? (BLOCKS_MAX - 1) * s.pitch + s.cell : 2 * s.pitch + s.cell)
  let x = 0
  const regions: Region[] = places.map((place) => {
    const r = { place, x, w: width(place) }
    x += r.w + gap
    return r
  })
  const inner = x - gap
  const W = Math.max(304, inner + 32)
  const left = (W - inner) / 2
  return { s, W, regions: regions.map((r) => ({ ...r, x: r.x + left })) }
}

export type BlocksMatProps = {
  blocks: BlocksSpec
  counts: Partial<Record<BlockPlace, number>>
  /** A block on the mat was tapped: one of that place comes off. Without it the mat only shows the blocks. */
  onTakeOff?: (place: BlockPlace) => void
  label: string
}

export function BlocksMat({ blocks, counts, onTakeOff, label }: BlocksMatProps) {
  const places = blockPlaces(blocks)
  const { s, W, regions } = layout(places)
  const top = 18
  const rodH = 10 * s.cell
  const press = (place: BlockPlace) => (e: KeyboardEvent<SVGGElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    onTakeOff?.(place)
  }
  const block = (place: BlockPlace, k: number, body: React.ReactNode) =>
    onTakeOff ? (
      <g key={`${place}${k}`} role="button" tabIndex={0} aria-label={`Take ${place === 'ones' ? 'a one' : `a ${NAMES[place][0]}`} off the mat`} onClick={() => onTakeOff(place)} onKeyDown={press(place)} style={{ cursor: 'pointer' }}>
        {body}
      </g>
    ) : (
      <g key={`${place}${k}`}>{body}</g>
    )
  return (
    <svg data-mat="" viewBox={`0 0 ${W} ${s.h}`} width="100%" role="group" aria-label={label} style={{ display: 'block', maxWidth: W, height: 'auto', userSelect: 'none' }}>
      <rect x={4} y={4} width={W - 8} height={s.h - 8} rx={16} fill={MAT_FILL} stroke={MAT_EDGE} strokeWidth={1.6} strokeDasharray="6 5" />
      {regions.map((r) => {
        const n = Math.min(BLOCKS_MAX, counts[r.place] ?? 0)
        return Array.from({ length: n }, (_, k) => {
          if (r.place === 'ones') {
            const x = r.x + (k % 3) * s.pitch
            const y = top + Math.floor(k / 3) * s.pitch
            return block('ones', k, <rect x={x} y={y} width={s.cell} height={s.cell} fill={GOLD} stroke={INK} strokeWidth={1.2} />)
          }
          if (r.place === 'tens') {
            const x = r.x + k * s.pitch
            return block(
              'tens',
              k,
              <g>
                {Array.from({ length: 10 }, (_, c) => (
                  <rect key={c} x={x} y={top + c * s.cell} width={s.cell} height={s.cell} fill={GOLD} stroke={INK} strokeWidth={1} />
                ))}
                <rect x={x} y={top} width={s.cell} height={rodH} fill="none" stroke={INK} strokeWidth={1.4} />
              </g>,
            )
          }
          const x = r.x + (k % 3) * s.flatPitch
          const y = top + Math.floor(k / 3) * s.flatPitch
          return block(
            'hundreds',
            k,
            <g>
              <rect x={x} y={y} width={s.flat} height={s.flat} fill={GOLD} stroke={INK} strokeWidth={1.4} />
              {Array.from({ length: 9 }, (_, c) => (
                <g key={c}>
                  <line x1={x + ((c + 1) * s.flat) / 10} y1={y} x2={x + ((c + 1) * s.flat) / 10} y2={y + s.flat} stroke={INK} strokeWidth={0.5} />
                  <line x1={x} y1={y + ((c + 1) * s.flat) / 10} x2={x + s.flat} y2={y + ((c + 1) * s.flat) / 10} stroke={INK} strokeWidth={0.5} />
                </g>
              ))}
            </g>,
          )
        })
      })}
    </svg>
  )
}

/** The small picture of a block on its button. */
function BlockIcon({ place }: { place: BlockPlace }) {
  if (place === 'ones') return <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" fill={GOLD} stroke={INK} strokeWidth="1.2" /></svg>
  if (place === 'tens')
    return (
      <svg width="64" height="16" viewBox="0 0 64 16" aria-hidden="true">
        {Array.from({ length: 10 }, (_, c) => <rect key={c} x={2 + c * 6} y="4" width="6" height="8" fill={GOLD} stroke={INK} strokeWidth="0.8" />)}
      </svg>
    )
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
      <rect x="1" y="1" width="28" height="28" fill={GOLD} stroke={INK} strokeWidth="1.2" />
      {Array.from({ length: 9 }, (_, c) => <line key={c} x1={1 + (c + 1) * 2.8} y1="1" x2={1 + (c + 1) * 2.8} y2="29" stroke={INK} strokeWidth="0.4" />)}
    </svg>
  )
}

/** The answer of a question with blocks: the mat, the line that says what is on it, and a button for each block. `onChange` gets the number, or '' when the mat is empty. */
export function BlocksAnswer({ blocks, onChange }: { blocks: BlocksSpec; onChange: (text: string) => void }) {
  const places = blockPlaces(blocks)
  const [counts, setCounts] = useState<Partial<Record<BlockPlace, number>>>({})
  const set = (place: BlockPlace, by: number) => {
    const next = { ...counts, [place]: Math.max(0, Math.min(BLOCKS_MAX, (counts[place] ?? 0) + by)) }
    setCounts(next)
    const any = places.some((p) => (next[p] ?? 0) > 0)
    onChange(any ? String(blocksNumber(next)) : '')
  }
  const empty = places.every((p) => (counts[p] ?? 0) === 0)
  return (
    <div data-answer="blocks" className="flex w-full flex-col items-center gap-3">
      <BlocksMat blocks={blocks} counts={counts} onTakeOff={(p) => set(p, -1)} label={empty ? 'The mat is empty.' : `On the mat: ${blocksWords(places, counts)}.`} />
      <div className="flex w-full flex-wrap justify-center gap-2.5">
        {places.map((place) => (
          <button
            key={place}
            type="button"
            disabled={(counts[place] ?? 0) >= BLOCKS_MAX}
            onClick={() => set(place, 1)}
            className="flex min-h-[64px] min-w-[92px] flex-1 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-18 border-2 border-ink bg-card px-2 py-2 text-[15px] font-bold whitespace-nowrap text-ink disabled:cursor-default disabled:opacity-40"
          >
            <BlockIcon place={place} />+ {NAMES[place][0]}
          </button>
        ))}
      </div>
      <p aria-live="polite" className="m-0 text-center text-[16px] leading-[1.4] text-body">
        {empty ? null : <strong className="font-bold text-ink">{blocksWords(places, counts)}</strong>}
        {empty ? null : ' on the mat. '}
        Tap a block to put it on the mat. Tap a block on the mat to take it off.
      </p>
    </div>
  )
}

/** The mat of the number a learner built, for the results ("Your blocks"). Nothing when the number cannot be built with these blocks. */
export function BuiltMat({ blocks, wrote }: { blocks: BlocksSpec; wrote: string }) {
  const counts = /^\d+$/.test(wrote.trim()) ? blocksOf(Number(wrote.trim())) : null
  if (!counts) return null
  const places = blockPlaces(blocks)
  return (
    <div data-built="" className="flex flex-col gap-1.5">
      <span className="text-[14px] font-semibold text-body">Your blocks</span>
      <BlocksMat blocks={blocks} counts={counts} label={`Your blocks: ${blocksWords(places, counts)}.`} />
    </div>
  )
}
