import type { DiagramSpec } from '@jemma/profiling/schemas'
import { BODY, CORAL, CORAL_TEXT, INK, SOFT, Svg, T } from './shared'

export type Shape2DProps = Extract<DiagramSpec, { kind: 'shape_2d' }>

export function describeShape2D({ shape, labels }: Shape2DProps) {
  const a = shape === 'triangle' ? 'a right-angled triangle' : `a ${shape}`
  return `${a[0]?.toUpperCase()}${a.slice(1)}${labels.length ? ` labelled ${labels.join(', ')}` : ''}.`
}

const fill = { fill: SOFT, stroke: INK, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

/**
 * labels by shape:
 * rectangle: [top, right, caption]; square: [side, caption];
 * triangle (right angle at bottom left): [left side, base, slanted side]; circle: [radius, caption].
 */
export function Shape2D(props: Shape2DProps) {
  const { shape, labels: l } = props
  return (
    <Svg width={285} height={190} label={describeShape2D(props)}>
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
          <line x1={92} y1={58} x2={212} y2={138} stroke={CORAL} strokeWidth={3.5} strokeLinecap="round" />
          <path d="M92 129 L101 129 L101 138" fill="none" stroke={INK} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
          {l[0] && <T x={85} y={102} size={12} anchor="end">{l[0]}</T>}
          {l[1] && <T x={152} y={160} size={12}>{l[1]}</T>}
          {l[2] && <T x={162} y={92} size={12} weight={600} fill={CORAL_TEXT} anchor="start">{l[2]}</T>}
        </>
      )}
      {shape === 'circle' && (
        <>
          <circle cx={142.5} cy={92} r={56} {...fill} />
          <line x1={142.5} y1={92} x2={198.5} y2={92} stroke={CORAL} strokeWidth={3.5} strokeLinecap="round" />
          <circle cx={142.5} cy={92} r={3} fill={INK} />
          {l[0] && <T x={170.5} y={82} size={12} weight={600} fill={CORAL_TEXT}>{l[0]}</T>}
          {l[1] && <T x={142.5} y={174} size={12} fill={BODY}>{l[1]}</T>}
        </>
      )}
    </Svg>
  )
}
