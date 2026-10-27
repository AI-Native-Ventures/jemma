import type { ReactNode, SVGProps } from 'react'

type IconProps = { size?: number; strokeWidth?: number; className?: string } & Omit<
  SVGProps<SVGSVGElement>,
  'width' | 'height' | 'strokeWidth'
>

/** Stroke icon shell. Paths are copied from the v1 boards (24 grid, round caps). */
function Stroke({ size = 22, strokeWidth = 1.8, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const ChevronDownIcon = (p: IconProps) => (
  <Stroke size={20} strokeWidth={2} {...p}>
    <path d="m6 9 6 6 6-6" />
  </Stroke>
)

export const ChevronRightIcon = (p: IconProps) => (
  <Stroke size={20} strokeWidth={2} {...p}>
    <path d="m9 6 6 6-6 6" />
  </Stroke>
)

export const SwapIcon = (p: IconProps) => (
  <Stroke size={18} strokeWidth={2} {...p}>
    <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />
  </Stroke>
)

export const BellIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" />
    <path d="M10 20.5a2 2 0 0 0 4 0" />
  </Stroke>
)

export const GearIcon = (p: IconProps) => (
  <Stroke {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Stroke>
)

export const HomeIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />
  </Stroke>
)

export const PeopleIcon = (p: IconProps) => (
  <Stroke {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M15.8 14.2c2.4-.3 4.3 1.2 4.7 4.3" />
  </Stroke>
)

export const PersonIcon = (p: IconProps) => (
  <Stroke {...p}>
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
  </Stroke>
)

export const BookIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M4 5.5C4 4.7 4.7 4 5.5 4H10c1.1 0 2 .9 2 2v14c0-1.1-.9-2-2-2H4z" />
    <path d="M20 5.5c0-.8-.7-1.5-1.5-1.5H14c-1.1 0-2 .9-2 2v14c0-1.1.9-2 2-2h6z" />
  </Stroke>
)

export const CameraIcon = ({ strokeWidth = 2, size = 24, ...p }: IconProps) => (
  <Stroke size={size} strokeWidth={strokeWidth} {...p}>
    <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
    <circle cx="12" cy="12.5" r="3.5" />
  </Stroke>
)

export const ClipboardIcon = (p: IconProps) => (
  <Stroke {...p}>
    <rect x="5" y="4.5" width="14" height="16" rx="2" />
    <path d="M9 4.5V3.8a.8.8 0 0 1 .8-.8h4.4a.8.8 0 0 1 .8.8v.7" />
    <path d="M8.5 10h7M8.5 13.5h7M8.5 17h4" />
  </Stroke>
)

export const LayersIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M12 3.5 3.5 8 12 12.5 20.5 8z" />
    <path d="M3.5 12 12 16.5 20.5 12" />
    <path d="M3.5 16 12 20.5 20.5 16" />
  </Stroke>
)

export const SunIcon = (p: IconProps) => (
  <Stroke {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
  </Stroke>
)

export const GapsIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M12 3 21 12 12 21 3 12z" />
  </Stroke>
)

export const ReportIcon = ({ size = 16, ...p }: IconProps) => (
  <Stroke size={size} {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </Stroke>
)

export const ReviewDocIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
    <path d="M10.2 12.3a1.9 1.9 0 0 1 3.6.7c0 1.3-1.8 1.6-1.8 2.8M12 18.2h.01" />
  </Stroke>
)

export const CheckDocIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
    <path d="m9 14 2 2 4-4" />
  </Stroke>
)

export const CheckIcon = ({ strokeWidth = 2.4, size = 20, ...p }: IconProps) => (
  <Stroke size={size} strokeWidth={strokeWidth} {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Stroke>
)

export const CloseIcon = ({ strokeWidth = 2, ...p }: IconProps) => (
  <Stroke strokeWidth={strokeWidth} {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Stroke>
)

export const WarningIcon = ({ size = 26, strokeWidth = 2, ...p }: IconProps) => (
  <Stroke size={size} strokeWidth={strokeWidth} {...p}>
    <path d="M12 3.5 21.5 20h-19z" />
    <path d="M12 10v4.5M12 17.5h.01" />
  </Stroke>
)

export const RetryIcon = ({ size = 20, strokeWidth = 2, ...p }: IconProps) => (
  <Stroke size={size} strokeWidth={strokeWidth} {...p}>
    <path d="M20 12a8 8 0 1 1-2.34-5.66" />
    <path d="M20 4v4.5h-4.5" />
  </Stroke>
)

export const ClockIcon = ({ size = 16, strokeWidth = 1.9, ...p }: IconProps) => (
  <Stroke size={size} strokeWidth={strokeWidth} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Stroke>
)

export const NoteIcon = ({ size = 14, strokeWidth = 1.9, ...p }: IconProps) => (
  <Stroke size={size} strokeWidth={strokeWidth} {...p}>
    <path d="M5 4.5h10l4 4V19.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-14a1 1 0 0 1 1-1z" />
    <path d="M14.5 4.5V9h4.5" />
    <path d="M8 13h8M8 16.5h5" />
  </Stroke>
)

export const CalendarIcon = ({ size = 22, ...p }: IconProps) => (
  <Stroke size={size} {...p}>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 9.5h16M8.5 3v4M15.5 3v4" />
  </Stroke>
)

export const BulbIcon = ({ size = 15, strokeWidth = 1.9, ...p }: IconProps) => (
  <Stroke size={size} strokeWidth={strokeWidth} {...p}>
    <path d="M9 18h6M10 21h4" />
    <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.3 1.1 2.2h5c0-.9.5-1.7 1.1-2.2A6 6 0 0 0 12 3z" />
  </Stroke>
)

/** Jemma's gem: the coral diamond used as the headline mark and as the dot of the j. */
export function GemIcon({ size = 14, className, ...rest }: { size?: number; className?: string } & Omit<SVGProps<SVGSVGElement>, 'width' | 'height'>) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className={className} {...rest}>
      <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" />
    </svg>
  )
}
