#!/usr/bin/env python3
"""Write the South African touches as React components, from the same drawings as the design canvas.
usage: gen_tsx.py <apps/web dir>"""
import os, re, sys, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit

WEB = sys.argv[1]
OUT = os.path.join(WEB, "components/sa")
os.makedirs(OUT, exist_ok=True)

ATTR = {"stroke-width": "strokeWidth", "stroke-linecap": "strokeLinecap", "stroke-linejoin": "strokeLinejoin",
        "fill-opacity": "fillOpacity", "stroke-opacity": "strokeOpacity", "font-family": "fontFamily",
        "font-size": "fontSize", "font-weight": "fontWeight", "text-anchor": "textAnchor"}


def jsx(svg_markup):
    body = re.sub(r"^<svg[^>]*>", "", svg_markup)
    body = re.sub(r"</svg>$", "", body)
    for a, b in ATTR.items():
        body = body.replace(f' {a}="', f' {b}="')
    body = body.replace("><", ">\n      <")
    return body


HEADER = '''// South African touches: the same drawings as the design canvas (the "South African touches" board).
// Green is go, gold is the gem, black is the words, red is the red pen, blue is the pen you write with.
// Written by design/sa/gen_tsx.py from design/sa/kit.py. Change the drawing there and run it again.
'''

drawings = []
for name, fn, comp, doc in (
    ("welcome", kit.ill_welcome, "WelcomeDrawing", "Two exercise books, the gem rising, a bead bookmark and a protea in a jar. For sign in and a new child."),
    ("reading", kit.ill_reading, "ReadingDrawing", "A paper with a green reading band and a lens with a tick. For Jemma reading papers."),
    ("oops", kit.ill_oops, "OopsDrawing", "A torn page with a plaster on it. For errors where nothing is lost."),
    ("night", kit.ill_night, "NightDrawing", "A moon, gem stars, a closed book and a cup of rooibos. For a night with nothing new."),
    ("link", kit.ill_link, "LinkDrawing", "Two phones joined by a string of beads, with a clock. For waiting for a teacher to say yes."),
):
    drawings.append(f'''
/** {doc} */
export function {comp}({{ className = '' }}: {{ className?: string }}) {{
  return (
    <svg viewBox="0 0 240 150" aria-hidden="true" className={{`block h-auto w-full ${{className}}`}}>
      {jsx(fn())}
    </svg>
  )
}}
''')

chalk = jsx(kit.ill_chalkboard())
chalk = re.sub(r'<text ([^>]*)font-size="40"([^>]*)>6A</text>', lambda m: "", chalk)
chalk = re.sub(r'<text ([^>]*)fontSize="40"([^>]*)>6A</text>',
               '{label && label.length <= 4 ? (<text x="60" y="78" style={{ fontFamily: \'var(--font-outfit), system-ui, sans-serif\' }} '
               'fontSize={label.length <= 2 ? 40 : label.length === 3 ? 32 : 26} fontWeight="700" fill="#FFFFFF" fillOpacity="0.92">{label}</text>) : null}',
               chalk)
assert "{label}" in chalk, "chalkboard label not found"
drawings.append(f'''
/** A green chalkboard with the class name in chalk and a chalk gem. For a new class with nothing marked yet. */
export function ChalkboardDrawing({{ label, className = '' }}: {{ label?: string; className?: string }}) {{
  return (
    <svg viewBox="0 0 240 150" aria-hidden="true" className={{`block h-auto w-full ${{className}}`}}>
      {chalk}
    </svg>
  )
}}
''')

open(os.path.join(OUT, "drawings.tsx"), "w").write(HEADER + "".join(drawings).lstrip("\n").replace("\n\n/**", "\n\n/**", 1))

burst = jsx(kit.gem_burst())
beads_tsx = f'''{HEADER}
const GREEN = '{kit.GREEN}'
const GOLD = '{kit.GOLD}'
const GOLD_HI = '{kit.GOLD_HI}'
const RED = '{kit.RED}'
const BLUE = '{kit.BLUE}'
const BLACK = '{kit.BLACK}'
const GREY = '{kit.GREY}'
const PALE = '{kit.PALE}'

const diamond = (cx: number, cy: number, r: number) => `${{cx}},${{cy - r}} ${{cx + r}},${{cy}} ${{cx}},${{cy + r}} ${{cx - r}},${{cy}}`

export type BeadState = 'done' | 'now' | 'next'

/** One bead of a progress row: done is a green bead, now a gold bead with a black edge, next an empty bead. */
export function BeadDot({{ state, size = 15 }}: {{ state: BeadState; size?: number }}) {{
  const c = size / 2
  return (
    <svg width={{size}} height={{size}} viewBox={{`0 0 ${{size}} ${{size}}`}} aria-hidden="true" className="block flex-none" data-bead={{state}}>
      {{state === 'done' ? <polygon points={{diamond(c, c, c - 0.5)}} fill={{GREEN}} /> : null}}
      {{state === 'now' ? <polygon points={{diamond(c, c, c - 1.2)}} fill={{GOLD}} stroke={{BLACK}} strokeWidth="1.6" strokeLinejoin="round" /> : null}}
      {{state === 'next' ? <polygon points={{diamond(c, c, c - 1.2)}} fill="none" stroke={{GREY}} strokeWidth="1.4" strokeLinejoin="round" /> : null}}
    </svg>
  )
}}

/** A row of beads for steps out of a total: the ones before `now` are done. `now` is 1-based; 0 means none is under way. */
export function BeadRow({{ total, now, size = 15, gap = 6 }}: {{ total: number; now: number; size?: number; gap?: number }}) {{
  return (
    <span aria-hidden="true" className="flex items-center" style={{{{ gap }}}}>
      {{Array.from({{ length: total }}, (_, i) => (
        <BeadDot key={{i}} size={{size}} state={{i + 1 < now || (now === 0 && false) ? 'done' : i + 1 === now ? 'now' : 'next'}} />
      ))}}
    </span>
  )
}}

const RING = [GREEN, GOLD, RED, BLUE, GOLD, GREEN]

/** Twelve beads round the gem. `lit` beads are coloured, the rest are empty. It turns slowly while a lesson gets ready; paused, it stands still. */
export function BeadRing({{ lit, size = 120, paused = false }}: {{ lit: number; size?: number; paused?: boolean }}) {{
  const beads = Array.from({{ length: 12 }}, (_, i) => {{
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 12
    const x = Math.round((60 + 44 * Math.cos(a)) * 10) / 10
    const y = Math.round((60 + 44 * Math.sin(a)) * 10) / 10
    return i < lit ? (
      <polygon key={{i}} points={{diamond(x, y, 7)}} fill={{RING[i % RING.length]}} />
    ) : (
      <polygon key={{i}} points={{diamond(x, y, 6)}} fill="none" stroke={{PALE}} strokeWidth="1.6" />
    )
  }})
  return (
    <span aria-hidden="true" className="relative block flex-none" style={{{{ width: size, height: size }}}} data-sa="bead-ring">
      <svg width={{size}} height={{size}} viewBox="0 0 120 120" className={{paused ? 'block' : 'block motion-safe:animate-[spin_9s_linear_infinite]'}}>
        {{beads}}
      </svg>
      <svg width={{size}} height={{size}} viewBox="0 0 120 120" className="absolute inset-0 block">
        <polygon points={{diamond(60, 60, 20)}} fill={{GOLD}} />
        <polygon points="60,40 40,60 60,60" fill={{GOLD_HI}} />
        {{paused ? <polygon points={{diamond(60, 60, 20)}} fill="none" stroke={{BLACK}} strokeWidth="2" strokeLinejoin="round" /> : null}}
      </svg>
    </span>
  )
}}

/** The gem bursts: the moment something is finished. */
export function GemBurst({{ width = 172 }}: {{ width?: number }}) {{
  return (
    <svg viewBox="0 0 200 134" width={{width}} aria-hidden="true" className="block h-auto" data-sa="gem-burst">
      {burst}
    </svg>
  )
}}

/** The five bead colours as a short row of gems, over a finished session. */
export function GemRow({{ size = 18 }}: {{ size?: number }}) {{
  return (
    <span aria-hidden="true" className="flex items-center gap-1.5">
      {{[GREEN, GOLD, RED, BLUE, GOLD].map((c, i) => (
        <svg key={{i}} width={{size}} height={{size}} viewBox="0 0 16 16" className="block flex-none">
          <polygon points="8,1 15,8 8,15 1,8" fill={{c}} />
        </svg>
      ))}}
    </span>
  )
}}
'''
beads_tsx = beads_tsx.replace("i + 1 < now || (now === 0 && false) ? 'done'", "i + 1 < now ? 'done'")
open(os.path.join(OUT, "beads.tsx"), "w").write(beads_tsx)

index = '''export { BeadDot, BeadRow, BeadRing, GemBurst, GemRow, type BeadState } from './beads'
export { ChalkboardDrawing, LinkDrawing, NightDrawing, OopsDrawing, ReadingDrawing, WelcomeDrawing } from './drawings'
'''
open(os.path.join(OUT, "index.ts"), "w").write(index)
