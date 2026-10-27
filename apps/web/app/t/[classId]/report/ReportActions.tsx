'use client'

const btn =
  'flex h-[46px] flex-none cursor-pointer items-center justify-center gap-2 rounded-14 border-[1.5px] border-ink bg-card px-[18px] text-[15px] font-semibold text-ink'

const download = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
    <path d="M4.5 16v2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2" />
  </svg>
)

const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v)

/** Download PDF prints the page, Export marks saves the learners table as a CSV file. */
export function ReportActions({ rows, file }: { rows: string[][]; file: string }) {
  const exportCsv = () => {
    const csv = rows.map((r) => r.map(cell).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = file
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => window.print()} className={btn}>
        {download}
        Download PDF
      </button>
      <button type="button" onClick={exportCsv} className={btn}>
        {download}
        Export marks (CSV)
      </button>
    </div>
  )
}
