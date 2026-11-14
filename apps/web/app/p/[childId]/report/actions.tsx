'use client'

import { Icon, css } from '../beyond/_parts'

/** Download PDF opens the browser's print sheet (Save as PDF); Share a copy uses the share sheet, else copies the link. */
export function ReportActions() {
  const share = async () => {
    const url = window.location.href
    try {
      if (navigator.share) await navigator.share({ title: document.title, url })
      else await navigator.clipboard.writeText(url)
    } catch {
      // The person closed the share sheet.
    }
  }
  return (
    <div style={css('display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:8px')}>
      <button type="button" onClick={() => window.print()} style={css('display:flex;align-items:center;justify-content:center;gap:8px;min-height:56px;padding:12px 20px;text-align:center;text-wrap:balance;border-radius:14px;border:none;background:#1F1D36;color:#FFFFFF;font-size:15px;font-weight:600')}>
        <Icon name="down" size={18} width={2} />
        Download PDF
      </button>
      <button type="button" onClick={share} style={css('display:flex;align-items:center;justify-content:center;gap:8px;min-height:56px;padding:12px 20px;text-align:center;text-wrap:balance;border-radius:14px;border:1.5px solid #1F1D36;background:#FFFFFF;color:#1F1D36;font-size:15px;font-weight:600')}>
        <Icon name="share" size={18} width={2} />
        Share a copy
      </button>
    </div>
  )
}
