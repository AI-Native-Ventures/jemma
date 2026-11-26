import type { ReactNode } from 'react'
import type { SolidSpec } from '@jemma/profiling/schemas'
import { SOLID_COUNTS } from '@jemma/profiling/logic'
import { GOLD, GOLD_SOFT, GOLD_TINT, INK, Svg, type Variant } from './shared'

// P192: a 3D object, from the "Shapes and position" board ("How many faces, edges and corners does the pyramid have?"). It is drawn from a little above and to the
// side, so the front, the top or a side shows, and the edges behind it are dashed.

export type SolidProps = SolidSpec & { variant?: Variant }

const W = 300
const H = 190

const NAMES: Record<SolidSpec['shape'], string> = {
  cube: 'A cube',
  cuboid: 'A rectangular prism',
  square_pyramid: 'A square-based pyramid',
  triangular_pyramid: 'A triangular pyramid',
  triangular_prism: 'A triangular prism',
  cylinder: 'A cylinder',
  cone: 'A cone',
  sphere: 'A sphere',
}

/** P196: the sizes written on a 3D object, in words. */
function sizeWords(sizes: SolidSpec['sizes']): string {
  if (!sizes) return ''
  const said = [
    sizes.radius ? `radius ${sizes.radius.trim()}` : '',
    sizes.length ? `length ${sizes.length.trim()}` : '',
    sizes.width ? `width ${sizes.width.trim()}` : '',
    sizes.height ? `height ${sizes.height.trim()}` : '',
    sizes.slant ? `slant height ${sizes.slant.trim()}` : '',
  ].filter(Boolean)
  return said.length ? ` Its sizes: ${said.slice(0, -1).join(', ')}${said.length > 1 ? ' and ' : ''}${said[said.length - 1]}.` : ''
}

export function describeSolid({ shape, sizes, variant = 'card' }: SolidProps): string {
  const dashed =
    shape === 'sphere' ? 'The hidden half of the line round its middle is dashed.' : shape === 'cylinder' || shape === 'cone' ? 'The hidden part of its edge is dashed.' : 'Its hidden edges are dashed.'
  // While a question is answered the words never name the object or count its parts: either may be the answer.
  if (variant === 'question') return `A 3D object. ${dashed}${sizeWords(sizes)}`
  const n = SOLID_COUNTS[shape]!
  const part = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`
  return `${NAMES[shape]}. ${dashed}${sizeWords(sizes)} It has ${part(n.faces, 'face', 'faces')}, ${part(n.edges, 'edge', 'edges')} and ${part(n.corners, 'corner', 'corners')}.`
}

/** P196: the sizes on a 3D object: a dashed radius and height inside it where they are, and each label beside what it measures. */
function Sizes({ shape, sizes }: { shape: SolidSpec['shape']; sizes: NonNullable<SolidSpec['sizes']> }) {
  const label = (x: number, y: number, text: string | undefined, anchor: 'start' | 'middle' | 'end' = 'middle') =>
    text ? (
      <text key={`${x}.${y}`} data-size={text.trim()} x={x} y={y} fontSize={13} fontWeight={700} fill={INK} textAnchor={anchor} stroke="#FFFFFF" strokeWidth={3} paintOrder="stroke">
        {text.trim()}
      </text>
    ) : null
  const dash = (x1: number, y1: number, x2: number, y2: number, key: string) => <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke={INK} strokeWidth={1.6} strokeDasharray="6 4" />
  switch (shape) {
    case 'cone':
      return (
        <g>
          {sizes.height ? dash(150, 20, 150, 155, 'h') : null}
          {sizes.radius ? dash(150, 155, 225, 155, 'r') : null}
          {label(142, 96, sizes.height, 'end')}
          {label(188, 185, sizes.radius)}
          {label(198, 86, sizes.slant, 'start')}
        </g>
      )
    case 'cylinder':
      return (
        <g>
          {sizes.radius ? dash(150, 40, 220, 40, 'r') : null}
          {label(185, 33, sizes.radius)}
          {label(228, 100, sizes.height, 'start')}
        </g>
      )
    case 'sphere':
      return (
        <g>
          {sizes.radius ? dash(150, 95, 228, 95, 'r') : null}
          {label(189, 88, sizes.radius)}
        </g>
      )
    case 'cube':
    case 'cuboid': {
      const width = shape === 'cube' ? 100 : 150
      const x = (W - width - 40) / 2
      return (
        <g>
          {label(x + width / 2, 177, sizes.length)}
          {label(x - 8, 114, sizes.height, 'end')}
          {label(x + width + 26, 152, sizes.width, 'start')}
        </g>
      )
    }
    default:
      return (
        <g>
          {label(W / 2, 182, sizes.length)}
          {label(W - 20, 100, sizes.height, 'end')}
        </g>
      )
  }
}

type Pt = readonly [number, number]
const pts = (...ps: Pt[]) => ps.map(([x, y]) => `${x},${y}`).join(' ')
const Face = ({ at, fill }: { at: Pt[]; fill: string }) => <polygon points={pts(...at)} fill={fill} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
const Hidden = ({ a, b }: { a: Pt; b: Pt }) => <line data-hidden="" x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={INK} strokeWidth={1.4} strokeDasharray="5 4" />

/** Half an ellipse: the front half (below the middle) drawn, the back half dashed. */
function Ellipse({ cx, cy, rx, ry }: { cx: number; cy: number; rx: number; ry: number }) {
  return (
    <g>
      <path data-hidden="" d={`M${cx - rx},${cy} A${rx},${ry} 0 0 1 ${cx + rx},${cy}`} fill="none" stroke={INK} strokeWidth={1.4} strokeDasharray="5 4" />
      <path d={`M${cx - rx},${cy} A${rx},${ry} 0 0 0 ${cx + rx},${cy}`} fill="none" stroke={INK} strokeWidth={2} />
    </g>
  )
}

function box(width: number): ReactNode {
  // The front face, then the top and the right side, set back by (40, -30).
  const x = (W - width - 40) / 2
  const f: Pt[] = [
    [x, 60],
    [x + width, 60],
    [x + width, 160],
    [x, 160],
  ]
  const b = f.map(([px, py]) => [px + 40, py - 30] as const)
  // The hidden edges are drawn last, dashed, so they show through the faces in front of them.
  return (
    <g>
      <Face at={f} fill={GOLD_TINT} />
      <Face at={[f[0]!, b[0]!, b[1]!, f[1]!]} fill={GOLD_SOFT} />
      <Face at={[f[1]!, b[1]!, b[2]!, f[2]!]} fill={GOLD} />
      <Hidden a={b[3]!} b={b[0]!} />
      <Hidden a={b[3]!} b={b[2]!} />
      <Hidden a={b[3]!} b={f[3]!} />
    </g>
  )
}

function drawing(shape: SolidSpec['shape']): ReactNode {
  switch (shape) {
    case 'cube':
      return box(100)
    case 'cuboid':
      return box(150)
    case 'square_pyramid':
      return (
        <g>
          <Face at={[[60, 150], [200, 150], [250, 110], [110, 110]]} fill={GOLD_TINT} />
          <Face at={[[155, 20], [60, 150], [200, 150]]} fill={GOLD} />
          <Face at={[[155, 20], [200, 150], [250, 110]]} fill={GOLD_SOFT} />
          <Hidden a={[155, 20]} b={[110, 110]} />
          <Hidden a={[110, 110]} b={[60, 150]} />
          <Hidden a={[110, 110]} b={[250, 110]} />
        </g>
      )
    case 'triangular_pyramid':
      return (
        <g>
          <Face at={[[125, 22], [55, 160], [200, 166]]} fill={GOLD} />
          <Face at={[[125, 22], [200, 166], [252, 118]]} fill={GOLD_SOFT} />
          <Hidden a={[55, 160]} b={[252, 118]} />
        </g>
      )
    case 'triangular_prism':
      return (
        <g>
          <Face at={[[60, 160], [160, 160], [110, 76]]} fill={GOLD_TINT} />
          <Face at={[[110, 76], [160, 160], [250, 126], [200, 42]]} fill={GOLD} />
          <Hidden a={[60, 160]} b={[150, 126]} />
          <Hidden a={[150, 126]} b={[250, 126]} />
          <Hidden a={[150, 126]} b={[200, 42]} />
        </g>
      )
    case 'cylinder':
      return (
        <g>
          <path d="M80,40 L80,150 A70,18 0 0 0 220,150 L220,40 Z" fill={GOLD_TINT} stroke="none" />
          <line x1={80} y1={40} x2={80} y2={150} stroke={INK} strokeWidth={2} />
          <line x1={220} y1={40} x2={220} y2={150} stroke={INK} strokeWidth={2} />
          <Ellipse cx={150} cy={150} rx={70} ry={18} />
          <ellipse cx={150} cy={40} rx={70} ry={18} fill={GOLD_SOFT} stroke={INK} strokeWidth={2} />
        </g>
      )
    case 'cone':
      return (
        <g>
          <path d="M150,20 L75,155 A75,18 0 0 0 225,155 Z" fill={GOLD_TINT} stroke="none" />
          <line x1={150} y1={20} x2={75} y2={155} stroke={INK} strokeWidth={2} />
          <line x1={150} y1={20} x2={225} y2={155} stroke={INK} strokeWidth={2} />
          <Ellipse cx={150} cy={155} rx={75} ry={18} />
        </g>
      )
    case 'sphere':
      return (
        <g>
          <circle cx={150} cy={95} r={78} fill={GOLD_TINT} stroke={INK} strokeWidth={2} />
          <Ellipse cx={150} cy={95} rx={78} ry={20} />
          <circle cx={122} cy={62} r={14} fill="#FFFFFF" opacity={0.55} />
        </g>
      )
  }
}

export function Solid(props: SolidProps) {
  return (
    <Svg width={W} height={H} label={describeSolid(props)}>
      {drawing(props.shape)}
      {props.sizes ? <Sizes shape={props.shape} sizes={props.sizes} /> : null}
    </Svg>
  )
}
