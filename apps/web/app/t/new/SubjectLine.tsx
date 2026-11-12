import { ENABLED_SUBJECTS } from '@/lib/subjects'

/** The subject of a new class: Mathematics, shown and not picked. The class form and the onboarding form say it the same way. */
export const CLASS_SUBJECT: string = ENABLED_SUBJECTS[0]

export function SubjectLine() {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[15px] font-medium">Subject</span>
      <span className="flex h-[52px] items-center rounded-14 bg-soft-2 px-3.5 text-[17px] text-ink">{CLASS_SUBJECT}</span>
      <span className="text-[13px] text-body">More subjects come later</span>
    </div>
  )
}
