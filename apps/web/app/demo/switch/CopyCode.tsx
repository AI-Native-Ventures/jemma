'use client'

/** "Copy code" button of the demo path card. Label stays as drawn; the copy itself is the only effect. */
export function CopyCode({ code }: { code: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(code).catch(() => undefined)
      }}
      className="flex h-12 cursor-pointer items-center gap-1.5 rounded-12 border-[1.5px] border-ink bg-card px-4 font-[inherit] text-[15px] font-semibold text-ink"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="8" y="8" width="12" height="12" rx="2" />
        <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" />
      </svg>
      Copy code
    </button>
  )
}
