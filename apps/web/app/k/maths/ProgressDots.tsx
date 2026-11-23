import { LEGEND, levelWords, type Level } from './format'

// The circles of "My maths" (P122), drawn like the teacher's Long view so the product speaks one language: a solid circle is 80 percent or more, a
// half-filled one (left half) is 50 to 79, a white one with an outline is below 50, and a dashed one is a topic not tried yet. The same drawing as
// the landing page's Long view card (a 14 by 14 box, the circle 5.3 in radius, a 1.4 stroke), shown here at 16 px by default.

const INK = '#161616'
const DASHED = '#8F8D88'

/** One circle. Decorative on its own: the caller labels the group (`ProgressDots`) or the row (`ProgressDot` with `label`). */
export function ProgressDot({ level, size = 16, label }: { level: Level; size?: number; label?: string }) {
  const a11y = label ? ({ role: 'img', 'aria-label': label } as const) : ({ 'aria-hidden': true } as const)
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" data-dot={level} className="flex-none" {...a11y}>
      {level === 'none' ? (
        <circle cx="7" cy="7" r="5.3" fill="#FFFFFF" stroke={DASHED} strokeWidth="1.4" strokeDasharray="2.4 2.35" />
      ) : (
        <>
          <circle cx="7" cy="7" r="5.3" fill={level === 'full' ? INK : '#FFFFFF'} stroke={INK} strokeWidth="1.4" />
          {level === 'half' ? <path d="M7 1.7a5.3 5.3 0 0 0 0 10.6z" fill={INK} /> : null}
        </>
      )}
    </svg>
  )
}

/** The circle of one topic on a part's page: labelled for a screen reader ("80 percent or more"). */
export const TopicDot = ({ level }: { level: Level }) => <ProgressDot level={level} label={levelWords(level)} />

/** The circles of one part, one for each topic in map order, wrapping onto more lines when there are many. The group has one label for a screen reader. */
export function ProgressDots({ levels, label }: { levels: Level[]; label: string }) {
  return (
    <span role="img" aria-label={label} className="flex flex-wrap gap-1">
      {levels.map((level, i) => (
        <ProgressDot key={i} level={level} />
      ))}
    </span>
  )
}

/** The one-line key to the four circles. Shown once above a list of circles. */
export function ProgressLegend() {
  return (
    <p data-legend="" className="m-0 flex flex-wrap gap-x-3 gap-y-1 text-[13px] leading-[1.5] text-body">
      {LEGEND.map((l) => (
        <span key={l.level} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <ProgressDot level={l.level} size={14} />
          {l.text}
        </span>
      ))}
    </p>
  )
}
