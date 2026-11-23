// Shared bits of the plain-HTML screens, ported from the desktop boards (design/v1-screens/desktop-*.dc.html).
// The traffic lights are the window's own (macOS draws them), so the board's painted dots are not repeated here.
window.jd = {
  esc: (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]),
  titleBar: (borderColor) =>
    `<div class="drag" style="height:38px;flex:none;position:relative;display:flex;align-items:center;padding:0 14px;background:#FFFFFF;border-bottom:1px solid ${borderColor || '#E8E5DE'}"><span style="position:absolute;left:120px;right:120px;text-align:center;font-size:13px;font-weight:600;color:#5C5A55">Jemma Desktop</span></div>`,
  wordmark: (w, h) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="4 12 236 92" width="${w}" height="${h}" role="img" aria-label="jemma" style="display:block"><path d="M32 46 V80 C32 91 24 95 13 93" fill="none" stroke="#161616" stroke-width="9.5" stroke-linecap="round"/><polygon points="32,19 40,27 32,35 24,27" fill="#FFB81C"/><text x="43" y="80" fill="#161616" font-family="Outfit, system-ui, sans-serif" font-size="66" font-weight="700">emma</text></svg>`,
  gem: (size, extra) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true" style="flex:none;${extra || ''}"><polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FFB81C"/></svg>`,
}
