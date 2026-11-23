// South African touches: the same drawings as the design canvas (the "South African touches" board).
// Green is go, gold is the gem, black is the words, red is the red pen, blue is the pen you write with.
// Written by design/sa/gen_tsx.py from design/sa/kit.py. Change the drawing there and run it again.

const GREEN = '#007749'
const GOLD = '#FFB81C'
const GOLD_HI = '#FFD66B'
const RED = '#E03C31'
const BLUE = '#001489'
const BLACK = '#161616'
const GREY = '#8F8D88'
const PALE = '#D9D6CE'

const diamond = (cx: number, cy: number, r: number) => `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`

export type BeadState = 'done' | 'now' | 'next'

/** One bead of a progress row: done is a green bead, now a gold bead with a black edge, next an empty bead. */
export function BeadDot({ state, size = 15 }: { state: BeadState; size?: number }) {
  const c = size / 2
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="block flex-none" data-bead={state}>
      {state === 'done' ? <polygon points={diamond(c, c, c - 0.5)} fill={GREEN} /> : null}
      {state === 'now' ? <polygon points={diamond(c, c, c - 1.2)} fill={GOLD} stroke={BLACK} strokeWidth="1.6" strokeLinejoin="round" /> : null}
      {state === 'next' ? <polygon points={diamond(c, c, c - 1.2)} fill="none" stroke={GREY} strokeWidth="1.4" strokeLinejoin="round" /> : null}
    </svg>
  )
}

/** A row of beads for steps out of a total: the ones before `now` are done. `now` is 1-based; 0 means none is under way. */
export function BeadRow({ total, now, size = 15, gap = 6 }: { total: number; now: number; size?: number; gap?: number }) {
  return (
    <span aria-hidden="true" className="flex items-center" style={{ gap }}>
      {Array.from({ length: total }, (_, i) => (
        <BeadDot key={i} size={size} state={i + 1 < now ? 'done' : i + 1 === now ? 'now' : 'next'} />
      ))}
    </span>
  )
}

const RING = [GREEN, GOLD, RED, BLUE, GOLD, GREEN]

/** Twelve beads round the gem. `lit` beads are coloured, the rest are empty. It turns slowly while a lesson gets ready; paused, it stands still. */
export function BeadRing({ lit, size = 120, paused = false }: { lit: number; size?: number; paused?: boolean }) {
  const beads = Array.from({ length: 12 }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 12
    const x = Math.round((60 + 44 * Math.cos(a)) * 10) / 10
    const y = Math.round((60 + 44 * Math.sin(a)) * 10) / 10
    return i < lit ? (
      <polygon key={i} points={diamond(x, y, 7)} fill={RING[i % RING.length]} />
    ) : (
      <polygon key={i} points={diamond(x, y, 6)} fill="none" stroke={PALE} strokeWidth="1.6" />
    )
  })
  return (
    <span aria-hidden="true" className="relative block flex-none" style={{ width: size, height: size }} data-sa="bead-ring">
      <svg width={size} height={size} viewBox="0 0 120 120" className={paused ? 'block' : 'block motion-safe:animate-[spin_9s_linear_infinite]'}>
        {beads}
      </svg>
      <svg width={size} height={size} viewBox="0 0 120 120" className="absolute inset-0 block">
        <polygon points={diamond(60, 60, 20)} fill={GOLD} />
        <polygon points="60,40 40,60 60,60" fill={GOLD_HI} />
        {paused ? <polygon points={diamond(60, 60, 20)} fill="none" stroke={BLACK} strokeWidth="2" strokeLinejoin="round" /> : null}
      </svg>
    </span>
  )
}

/** The gem bursts: the moment something is finished. */
export function GemBurst({ width = 172 }: { width?: number }) {
  return (
    <svg viewBox="0 0 200 134" width={width} aria-hidden="true" className="block h-auto" data-sa="gem-burst">
      <circle cx="100" cy="66" r="50" fill="#FFF1CC"/>
      <polygon points="100,36 130,66 100,96 70,66" fill="#FFB81C"/>
      <polygon points="100,36 70,66 100,66" fill="#FFD66B"/>
      <polygon points="100,36 130,66 100,96 70,66" fill="none" stroke="#161616" strokeWidth="2.2" strokeLinejoin="round"/>
      <polygon points="46,31 55,40 46,49 37,40" fill="#007749"/>
      <polygon points="156,26 164,34 156,42 148,34" fill="#E03C31"/>
      <polygon points="164,82 174,92 164,102 154,92" fill="#001489"/>
      <polygon points="36,89 43,96 36,103 29,96" fill="#FFB81C" stroke="#161616" strokeWidth="1.8" strokeLinejoin="round"/>
      <polygon points="70,9 75,14 70,19 65,14" fill="#161616"/>
      <polygon points="132,112.5 137.5,118 132,123.5 126.5,118" fill="#007749"/>
      <polygon points="126,7.5 130.5,12 126,16.5 121.5,12" fill="#FFB81C"/>
      <polygon points="66,113.5 70.5,118 66,122.5 61.5,118" fill="#E03C31"/>
      <circle cx="24" cy="64" r="3" fill="#007749"/>
      <circle cx="178" cy="62" r="3" fill="#FFB81C"/>
      <circle cx="98" cy="128" r="2.6" fill="#001489"/>
      <circle cx="100" cy="6" r="2.6" fill="#E03C31"/>
    </svg>
  )
}

/** The five bead colours as a short row of gems, over a finished session. */
export function GemRow({ size = 18 }: { size?: number }) {
  return (
    <span aria-hidden="true" className="flex items-center gap-1.5">
      {[GREEN, GOLD, RED, BLUE, GOLD].map((c, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 16 16" className="block flex-none">
          <polygon points="8,1 15,8 8,15 1,8" fill={c} />
        </svg>
      ))}
    </span>
  )
}
