'use client'

import { useRef, useState, type PointerEvent } from 'react'
import { groupsAnswer } from '@jemma/profiling/logic'
import type { GroupsSpec } from '@jemma/profiling/schemas'

// P170: things sorted into groups, from the "Drag into groups" board. The cards wait at the top; the learner drags one into a group (it lifts as it moves), or
// taps a card and then its group. A card in a group can be moved again. The line under the groups counts what is left (never whether a card is right). The
// results draw the groups as the learner left them, with a card in the wrong group circled in red pen and its right group beside it.

const PEN = '#E03C31'
const BANK = -1

const cardClass = (on: boolean) =>
  `flex h-[46px] min-w-[46px] cursor-grab items-center justify-center rounded-[10px] px-2 text-[20px] font-bold text-ink select-none touch-none ${
    on ? 'border-[2.4px] border-gold bg-gold-tint shadow-[0_6px_0_rgba(22,22,22,0.12)] -rotate-[5deg]' : 'border-2 border-ink bg-card'
  }`

export function GroupsAnswer({ groups, onChange }: { groups: GroupsSpec; onChange: (text: string) => void }) {
  const [placed, setPlaced] = useState<(number | null)[]>(() => groups.items.map(() => null))
  const [picked, setPicked] = useState<number | null>(null)
  const [drag, setDrag] = useState<{ i: number; dx: number; dy: number } | null>(null)
  const start = useRef<{ i: number; x: number; y: number; moved: boolean } | null>(null)
  /** When the last drag ended: the click a drag ends in (if the card is still there) must not pick the card up again. */
  const dragged = useRef(0)

  const put = (i: number, zone: number) => {
    const next = placed.map((p, k) => (k === i ? (zone === BANK ? null : zone) : p))
    setPlaced(next)
    setPicked(null)
    onChange(groupsAnswer(next))
  }
  const tapZone = (zone: number) => {
    if (picked !== null) put(picked, zone)
  }
  const down = (i: number) => (e: PointerEvent<HTMLButtonElement>) => {
    start.current = { i, x: e.clientX, y: e.clientY, moved: false }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // The card is picked up by a tap all the same.
    }
  }
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const s = start.current
    if (!s) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (!s.moved && Math.hypot(dx, dy) < 6) return
    s.moved = true
    setDrag({ i: s.i, dx, dy })
  }
  const up = (e: PointerEvent<HTMLButtonElement>) => {
    const s = start.current
    start.current = null
    setDrag(null)
    if (!s?.moved) return
    dragged.current = Date.now()
    // A drop: the zone under the finger (the card itself lets the pointer through while it moves).
    const zone = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-zone]')
    if (zone) put(s.i, Number(zone.dataset.zone))
  }
  const card = (i: number) => {
    const on = picked === i || drag?.i === i
    return (
      <button
        key={i}
        type="button"
        data-card={i}
        aria-pressed={picked === i}
        aria-label={`${groups.items[i]!.trim()}${placed[i] === null ? '' : `, in ${groups.names[placed[i]!]!.trim()}`}`}
        onClick={(e) => {
          e.stopPropagation()
          // A drag ends in a click too: only a tap picks a card.
          if (Date.now() - dragged.current < 400) return
          setPicked(picked === i ? null : i)
        }}
        onPointerDown={down(i)}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => {
          start.current = null
          setDrag(null)
        }}
        className={cardClass(on)}
        style={drag?.i === i ? { transform: `translate(${drag.dx}px, ${drag.dy}px) rotate(-7deg)`, pointerEvents: 'none', position: 'relative', zIndex: 10 } : undefined}
      >
        {groups.items[i]!.trim()}
      </button>
    )
  }
  const left = placed.filter((p) => p === null).length
  const done = groups.items.length - left
  return (
    <div data-answer="groups" className="flex w-full flex-col items-center gap-3">
      <div
        data-zone={BANK}
        role="group"
        aria-label="Still to sort"
        onClick={() => tapZone(BANK)}
        className={`flex min-h-[62px] w-full flex-wrap items-center justify-center gap-1.5 rounded-[10px] p-1.5 ${left === 0 ? 'border-[1.6px] border-dashed border-line' : ''}`}
      >
        {groups.items.map((_, i) => (placed[i] === null ? card(i) : null))}
      </div>
      <div className={`grid w-full gap-2.5 ${groups.names.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {groups.names.map((name, g) => (
          <div
            key={g}
            data-zone={g}
            role="button"
            tabIndex={0}
            aria-label={picked === null ? name.trim() : `Put ${groups.items[picked]!.trim()} in ${name.trim()}`}
            onClick={() => tapZone(g)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return
              e.preventDefault()
              tapZone(g)
            }}
            className={`flex min-h-[150px] cursor-pointer flex-col items-center gap-2 rounded-[18px] border-[1.6px] border-dashed bg-ground px-2 pt-2.5 pb-3 ${picked !== null ? 'border-gold' : 'border-muted-2'}`}
          >
            <span className="text-[18px] font-bold">{name.trim()}</span>
            <span className="flex flex-wrap justify-center gap-1.5">{groups.items.map((_, i) => (placed[i] === g ? card(i) : null))}</span>
          </div>
        ))}
      </div>
      <p aria-live="polite" className="m-0 text-center text-[16px] leading-[1.4] text-body">
        {left === 0 ? (
          <>
            All <strong className="font-bold text-ink">{done}</strong> are in a group. Drag one to move it.
          </>
        ) : done === 0 ? (
          'Drag each one into its group, or tap it and then tap its group.'
        ) : (
          <>
            <strong className="font-bold text-ink">{done}</strong> in groups, <strong className="font-bold text-ink">{left}</strong> to go.
          </>
        )}
      </p>
    </div>
  )
}

/** The groups as the learner left them, for the results: a card in the wrong group circled in red pen, with its right group beside it. */
export function GroupsResult({ groups, wrote, right }: { groups: GroupsSpec; wrote: (number | null)[]; right: number[] }) {
  return (
    <div data-groups-result="" className={`grid w-full gap-2 ${groups.names.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
      {groups.names.map((name, g) => (
        <div key={g} className="flex flex-col items-center gap-1.5 rounded-[16px] border-[1.6px] border-dashed border-muted-2 bg-ground px-2 pt-2 pb-3">
          <span className="text-[16px] font-bold">{name.trim()}</span>
          <span className="flex flex-wrap justify-center gap-x-1.5 gap-y-3">
            {groups.items.map((item, i) => {
              if (wrote[i] !== g + 1) return null
              const ok = right[i] === g + 1
              return (
                <span key={i} data-placed={ok ? 'ok' : 'wrong'} className="relative flex h-10 min-w-10 items-center justify-center rounded-[10px] border-2 border-ink bg-card px-1.5 text-[18px] font-bold">
                  {item.trim()}
                  {ok ? null : (
                    <>
                      <span aria-hidden="true" className="pointer-events-none absolute -inset-1.5 rounded-pill border-[2.6px]" style={{ borderColor: PEN }} />
                      <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[11px] font-bold whitespace-nowrap" style={{ color: PEN }}>
                        {`to ${groups.names[(right[i] ?? 1) - 1]?.trim() ?? ''}`}
                      </span>
                    </>
                  )}
                </span>
              )
            })}
          </span>
        </div>
      ))}
    </div>
  )
}
