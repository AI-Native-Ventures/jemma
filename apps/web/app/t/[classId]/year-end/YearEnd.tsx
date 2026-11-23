import { IconLabel } from '@/components/ui/IconLabel'

/** The end of the year: a copy of the class's marks as a file. Moving a class up a grade is not in Jemma yet, so it is not offered. */
export function YearEnd({ short, csvHref }: { short: string; csvHref: string }) {
  return (
    <div className="flex flex-col gap-2">
      <a href={csvHref} download className="flex min-h-[52px] items-center justify-center gap-2 rounded-14 bg-green px-5 py-3 text-center text-[17px] font-semibold text-balance text-white no-underline">
        <IconLabel
          gap={8}
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
              <path d="M5 19.5h14" />
            </svg>
          }
        >
          Download {short}&apos;s marks (CSV)
        </IconLabel>
      </a>
      <p className="m-0 text-[15px] leading-[1.45] text-body">{short} and its marks stay in Jemma after the year ends.</p>
    </div>
  )
}
