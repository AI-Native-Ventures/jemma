// The title bar and the status strip above the web view (boards: desktop-main, desktop-strip-states).
const { titleBar, esc } = window.jd
const NAMES = { claude: 'Claude Code', codex: 'Codex' }

const pauseIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M9 5.5v13M15 5.5v13"/></svg>'
const outlineBtn = (id, icon, text) =>
  `<button id="${id}" type="button" class="nodrag" style="display:flex;align-items:center;gap:6px;height:30px;padding:0 12px;border-radius:9px;border:1px solid #8C89A3;background:#FFFFFF;color:#1F1D36;font-size:13px;font-weight:600;flex:none">${icon}${text}</button>`
const lead = (agent) => `<strong style="font-weight:600">Jemma Desktop</strong><span style="color:#5D5A73"> · ${esc(agent)} · </span>`

function strip(s) {
  const agent = NAMES[s.agent] || ''
  const st = s.status
  const row = (bg, inner) => `<div role="status" style="height:40px;flex:none;display:flex;align-items:center;gap:10px;padding:0 10px 0 14px;background:${bg}">${inner}</div>`
  const text = (inner) => `<span style="flex:1;min-width:0;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${inner}</span>`
  if (st.kind === 'running') {
    const pct = st.total ? Math.round((Math.min(st.done + 1, st.total) / st.total) * 100) : 0
    const bar = st.total ? `<span aria-hidden="true" style="width:140px;height:6px;flex:none;border-radius:999px;background:#EEEDF5;overflow:hidden;display:flex"><span style="width:${pct}%;background:#1F1D36;border-radius:999px"></span></span>` : ''
    const left = st.timeLeft ? `<span style="flex:none;font-size:13px;color:#5D5A73">${esc(st.timeLeft)}</span>` : ''
    return row('#FFFFFF', `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style="flex:none;margin:0 1px;animation:jemmaPulse 1.6s ease-in-out infinite"><polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D"/></svg>${text(`${lead(agent)}<strong style="font-weight:600">${esc(st.label)}</strong>`)}${bar}${left}${outlineBtn('pause', pauseIcon, 'Pause')}`)
  }
  if (st.kind === 'paused') {
    return row('#EEEDF5', `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none"><circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/></svg>${text(`${lead(agent)}<strong style="font-weight:600">Paused</strong><span style="color:#5D5A73"> · New work waits until you resume</span>`)}<button id="resume" type="button" class="nodrag" style="display:flex;align-items:center;gap:6px;height:30px;padding:0 12px;border-radius:9px;border:none;background:#1F1D36;color:#FFFFFF;font-size:13px;font-weight:600;flex:none"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>Resume</button>`)
  }
  if (st.kind === 'cant_run') {
    return row('#FFF4F1', `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B8381F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/></svg>${text(`<strong style="font-weight:600">Jemma Desktop</strong><span style="color:#5D5A73"> · </span><strong style="font-weight:600">Can't run</strong><span style="color:#5D5A73"> · ${esc(st.reason)}</span>`)}<button id="details" type="button" class="nodrag" style="display:flex;align-items:center;height:30px;padding:0 8px;border:none;background:transparent;font-size:13px;font-weight:600;color:#1F1D36;text-decoration:underline;text-underline-offset:3px;flex:none">Details</button>${outlineBtn('cloud', '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 18.5h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 9.6 4.5 4.5 0 0 0 7 18.5z"/></svg>', 'Run in the cloud this time')}`)
  }
  // ready (the idle state)
  return row('#FFFFFF', `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16.5 9.5"/></svg>${text(`${lead(agent)}<strong style="font-weight:600">Ready</strong>`)}${outlineBtn('pause', pauseIcon, 'Pause')}`)
}

function render(s) {
  const cant = s.status.kind === 'cant_run'
  const bar = titleBar(cant ? '#FFC9BB' : '#E7E6EF')
  document.getElementById('app').innerHTML = bar + (s.showStrip ? strip(s) : '')
  const on = (id, fn) => document.getElementById(id)?.addEventListener('click', fn)
  on('pause', () => window.jemma.setPaused(true))
  on('resume', () => window.jemma.setPaused(false))
  on('details', () => window.jemma.showStopped())
  on('cloud', () => window.jemma.runStoppedInCloud())
}

async function load() {
  render(await window.jemma.getShell())
}
window.jemma.onState(load)
load()
