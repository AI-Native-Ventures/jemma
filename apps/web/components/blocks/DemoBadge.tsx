import { GemIcon } from '../ui/icons'

/** The "Demo" pill shown in headers while the user is in a sandbox. */
export function DemoBadge() {
  return (
    <span className="inline-flex items-center gap-[5px] leading-[normal] rounded-pill bg-coral-tint py-1 pr-2.5 pl-2 text-[12px] font-bold">
      <GemIcon size={10} />
      Demo
    </span>
  )
}
