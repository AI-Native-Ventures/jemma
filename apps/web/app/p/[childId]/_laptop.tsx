import type { ReactNode } from 'react'
import { css } from './beyond/_parts'

/** Laptop frame of the parent child space (boards laptop-parent-*): main column, 1120 wide, eyebrow and headline. Phone never shows it. */
export function LaptopShell({ eyebrow, title, below, right, children }: { eyebrow: string; title: string; below?: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="hidden px-9 pt-8 pb-10 lg:block" style={css('line-height:normal;color:#1F1D36')}>
      <div style={css('max-width:1120px;margin:0 auto;display:flex;flex-direction:column;gap:22px')}>
        <div style={css('display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:16px')}>
          <div style={css('display:flex;flex-direction:column;gap:10px;max-width:780px')}>
            <p style={css('margin:0;font-size:15px;color:#5D5A73')}>{eyebrow}</p>
            <div style={css('display:flex;gap:12px;align-items:flex-start')}>
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style={css('flex:none;margin-top:14px')}>
                <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" />
              </svg>
              <h1 style={{ ...css('margin:0;font-size:36px;line-height:1.15;font-weight:600;letter-spacing:-0.02em'), textWrap: 'pretty' }}>{title}</h1>
            </div>
            {below}
          </div>
          {right}
        </div>
        {children}
      </div>
    </div>
  )
}

export const PAPER_ICON = (
  <>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </>
)

export const CAMERA_ICON = (
  <>
    <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
    <circle cx="12" cy="12.5" r="3.5" />
  </>
)

export const ChevronSvg = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={css('flex:none')}>
    <path d="m9 6 6 6-6 6" />
  </svg>
)
