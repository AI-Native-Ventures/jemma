import type { ReactNode } from 'react'
import type { DiagramSpec } from '@jemma/profiling/schemas'
import { RichHtml } from './math-label'
import { BODY, GREEN, RED_TEXT, INK, SOFT, Svg, T } from './shared'

export type Shape2DProps = Extract<DiagramSpec, { kind: 'shape_2d' }>

export function describeShape2D({ shape, labels }: Shape2DProps) {
  const a = shape === 'triangle' ? 'a right-angled triangle' : `a ${shape}`
  return `${a[0]?.toUpperCase()}${a.slice(1)}${labels.length ? ` labelled ${labels.join(', ')}` : ''}.`
}

const fill = { fill: SOFT, stroke: INK, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

const WIDTH = 285
const HEIGHT = 190

// ---- Triangle labels -----------------------------------------------------------------------------------------------------------------------
// The triangle has its right angle at the bottom left (B), the angle theta at the top (A) and the slanted side from A to C. Opposite theta is the
// bottom side, adjacent to it the upright side. A label goes where its words say (theta at A, "opposite" on the bottom, "adjacent" on the upright
// side, "hypotenuse" on the slanted side, "90°" at B); any other list is placed by position, as it always was: [upright side, bottom, slanted side].
// A label that is too long for its place is never drawn on the triangle (it would run off the edge): it is written under the drawing, one a line.

type Slot = { x: number; y: number; size: number; anchor: 'start' | 'middle' | 'end'; weight?: number; fill?: string }
const UPRIGHT: Slot = { x: 85, y: 102, size: 12, anchor: 'end' }
const BASE: Slot = { x: 152, y: 160, size: 12, anchor: 'middle' }
const SLANTED: Slot = { x: 162, y: 92, size: 12, anchor: 'start', weight: 600, fill: RED_TEXT }
const ANGLE: Slot = { x: 107, y: 89, size: 14, anchor: 'middle', weight: 600 }
const RIGHT_ANGLE: Slot = { x: 106, y: 131, size: 11, anchor: 'start', fill: BODY }
const BY_POSITION = [UPRIGHT, BASE, SLANTED]

/** The longest label that sits on the drawing, in characters; a longer one is a sentence or a formula and goes under it. */
const MAX_ON_DRAWING = 14
/** Space kept between a label and the edge of the drawing. */
const EDGE_ROOM = 4

/** A generous estimate of the width of a label, from its length: the fonts the drawing may fall back to are wider than Outfit. */
const textWidth = (text: string, size: number, weight = 400) => [...text].length * size * (weight >= 600 ? 0.64 : 0.6)

/** Does the label, in this place, stay inside the drawing, with room at the edge? */
function fits(text: string, slot: Slot): boolean {
  if ([...text].length > MAX_ON_DRAWING) return false
  const w = textWidth(text, slot.size, slot.weight)
  const left = slot.anchor === 'start' ? slot.x : slot.anchor === 'end' ? slot.x - w : slot.x - w / 2
  return left >= EDGE_ROOM && left + w <= WIDTH - EDGE_ROOM
}

type Role = 'angle' | 'opposite' | 'adjacent' | 'hypotenuse' | 'right_angle'
const SIDE_WORDS: Record<string, Role> = { opposite: 'opposite', opp: 'opposite', adjacent: 'adjacent', adj: 'adjacent', hypotenuse: 'hypotenuse', hyp: 'hypotenuse' }
const ANGLE_NAME = /^(?:(?:angle|∠)\s*[A-Za-z]|[θϑαβγδεφϕψωΘΦ])$/i
const RIGHT_ANGLE_NAME = /^(?:90\s*(?:°|degrees?)|right angle)$/i

/** What a label names, when it names a part of a right-angled triangle. */
function roleOf(text: string): Role | null {
  const t = text.trim()
  const side = SIDE_WORDS[t.toLowerCase().replace(/\s+side$/, '')]
  if (side) return side
  if (ANGLE_NAME.test(t)) return 'angle'
  if (RIGHT_ANGLE_NAME.test(t)) return 'right_angle'
  return null
}

const SLOT_OF: Record<Role, Slot> = { angle: ANGLE, opposite: BASE, adjacent: UPRIGHT, hypotenuse: SLANTED, right_angle: RIGHT_ANGLE }

const put = (text: string, slot: Slot, key: string): ReactNode => (
  <T key={key} x={slot.x} y={slot.y} size={slot.size} weight={slot.weight} fill={slot.fill} anchor={slot.anchor}>
    {text}
  </T>
)

/** The labels on the drawing, and those written under it. Nothing is dropped, and nothing is drawn outside the box. */
function triangleLabels(labels: string[]): { onDrawing: ReactNode[]; angleMark: boolean; under: string[] } {
  const onDrawing: ReactNode[] = []
  const under: string[] = []
  const given = labels.filter((t) => t.trim() !== '')
  let angleMark = false

  if (given.some((t) => ['opposite', 'adjacent', 'hypotenuse'].includes(roleOf(t) ?? ''))) {
    const taken = new Set<Role>()
    given.forEach((text, i) => {
      const role = roleOf(text)
      if (role && !taken.has(role) && fits(text, SLOT_OF[role])) {
        taken.add(role)
        if (role === 'angle') angleMark = true
        onDrawing.push(put(text, SLOT_OF[role], `l${i}`))
      } else under.push(text)
    })
  } else {
    // By position, as always: a blank label keeps its place empty, so the ones after it stay where they were.
    labels.forEach((text, i) => {
      if (text.trim() === '') return
      const slot = BY_POSITION[i]
      if (slot && fits(text, slot)) onDrawing.push(put(text, slot, `l${i}`))
      else under.push(text)
    })
  }
  return { onDrawing, angleMark, under }
}

/**
 * labels by shape:
 * rectangle: [top, right, caption]; square: [side, caption];
 * triangle (right angle at bottom left): [left side, base, slanted side], or labels that name a side or a corner (see `triangleLabels`); circle: [radius, caption].
 */
export function Shape2D(props: Shape2DProps) {
  const { shape, labels: l } = props
  const tri = shape === 'triangle' ? triangleLabels(l) : null
  const drawing = (
    <Svg width={WIDTH} height={HEIGHT} label={describeShape2D(props)}>
      {shape === 'rectangle' && (
        <>
          <rect x={72.5} y={50} width={120} height={72} rx={0} {...fill} />
          {l[0] && <T x={132.5} y={41} size={12}>{l[0]}</T>}
          {l[1] && <T x={198.5} y={90} size={12} anchor="start">{l[1]}</T>}
          {l[2] && <T x={132.5} y={146} size={12} fill={BODY}>{l[2]}</T>}
        </>
      )}
      {shape === 'square' && (
        <>
          <rect x={102.5} y={52} width={80} height={80} rx={0} {...fill} />
          {l[0] && <T x={142.5} y={43} size={12}>{l[0]}</T>}
          {l[1] && <T x={142.5} y={156} size={12} fill={BODY}>{l[1]}</T>}
        </>
      )}
      {shape === 'triangle' && (
        <>
          <path d="M92 138 L92 58 L212 138 Z" {...fill} />
          <line x1={92} y1={58} x2={212} y2={138} stroke={GREEN} strokeWidth={3.5} strokeLinecap="round" />
          <path d="M92 129 L101 129 L101 138" fill="none" stroke={INK} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
          {tri?.angleMark && <path d="M92 74 A16 16 0 0 0 105.3 66.9" fill="none" stroke={INK} strokeWidth={1.2} strokeLinecap="round" />}
          {tri?.onDrawing}
        </>
      )}
      {shape === 'circle' && (
        <>
          <circle cx={142.5} cy={92} r={56} {...fill} />
          <line x1={142.5} y1={92} x2={198.5} y2={92} stroke={GREEN} strokeWidth={3.5} strokeLinecap="round" />
          <circle cx={142.5} cy={92} r={3} fill={INK} />
          {l[0] && <T x={170.5} y={82} size={12} weight={600} fill={RED_TEXT}>{l[0]}</T>}
          {l[1] && <T x={142.5} y={174} size={12} fill={BODY}>{l[1]}</T>}
        </>
      )}
    </Svg>
  )
  if (!tri || tri.under.length === 0) return drawing
  // The words that do not fit on the drawing go under it, one a line, and wrap at the width of the drawing. They are the drawing's own description
  // again (the picture's spoken label already holds every label), so a screen reader skips them.
  return (
    <div style={{ width: '100%', maxWidth: WIDTH }}>
      {drawing}
      <ul
        data-part="notes"
        aria-hidden="true"
        style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14, lineHeight: 1.35, fontWeight: 500, color: INK, textAlign: 'center', overflowWrap: 'anywhere' }}
      >
        {tri.under.map((text, i) => (
          <li key={i}>
            <RichHtml text={text} />
          </li>
        ))}
      </ul>
    </div>
  )
}
