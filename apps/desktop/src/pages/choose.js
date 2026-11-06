const { titleBar, wordmark, gem, esc } = window.jd
const NAMES = { claude: 'Claude Code', codex: 'Codex' }
const PLANS = { claude: 'Uses your Claude plan', codex: 'Uses your ChatGPT plan' }
const INSTALL = { claude: 'https://docs.claude.com/en/docs/claude-code/overview', codex: 'https://developers.openai.com/codex/cli' }

const termIcon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="m7 10 3 2.5L7 15M12.5 15.5H17"/></svg>'
const pill = (icon, text, bg, border) =>
  `<div style="display:flex;align-items:center;gap:10px;min-height:48px;padding:10px 14px;border-radius:14px;background:${bg};${border ? `border:1px solid ${border};` : ''}font-size:15px;font-weight:600">${icon}${text}</div>`
const ok = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16.5 9.5"/></svg>'
const missing = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5D5A73" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none"><circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/></svg>'
const warn = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#B8381F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/></svg>'

const ready = (a) => a.installed && a.signedIn === true
let selected = null

function radio(name, on, isReady) {
  if (on) return `<button type="button" data-pick="${name}" aria-pressed="true" aria-label="Use ${NAMES[name]}" style="width:44px;height:44px;flex:none;margin:-8px -10px 0 0;padding:0;border:none;background:transparent;display:flex;align-items:center;justify-content:center"><span aria-hidden="true" style="width:24px;height:24px;border-radius:999px;border:2px solid #1F1D36;display:flex;align-items:center;justify-content:center"><span style="width:12px;height:12px;border-radius:999px;background:#1F1D36"></span></span></button>`
  if (isReady) return `<button type="button" data-pick="${name}" aria-pressed="false" aria-label="Use ${NAMES[name]}" style="width:44px;height:44px;flex:none;margin:-8px -10px 0 0;padding:0;border:none;background:transparent;display:flex;align-items:center;justify-content:center"><span aria-hidden="true" style="width:24px;height:24px;border-radius:999px;border:2px solid #8C89A3"></span></button>`
  return `<button type="button" disabled aria-label="Use ${NAMES[name]}, not ready yet" style="width:44px;height:44px;flex:none;margin:-8px -10px 0 0;padding:0;border:none;background:transparent;display:flex;align-items:center;justify-content:center;cursor:default"><span aria-hidden="true" style="width:24px;height:24px;border-radius:999px;border:2px solid #CFCDDC;background:#F4F3F8"></span></button>`
}

function card(name, a, on) {
  let body
  if (!a.installed) {
    body = `${pill(missing, 'Not installed', '#F4F3F8')}<a href="#" data-install="${name}" style="align-self:flex-start;display:flex;align-items:center;gap:6px;min-height:44px;font-size:15px;font-weight:600;color:#1F1D36;text-decoration:underline;text-underline-offset:3px">How to install<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-8.5 8.5"/><path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/></svg></a>`
  } else if (!ready(a)) {
    body = `${pill(warn, 'Installed, not signed in', '#FFF4F1', '#FFC9BB')}<div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px"><span style="flex:1 1 220px;font-size:14px;line-height:1.45;color:#5D5A73">Open Terminal and sign in to ${NAMES[name]}. Then check again.</span><button type="button" data-recheck style="display:flex;align-items:center;gap:6px;min-height:44px;padding:0 14px;border-radius:12px;border:1px solid #8C89A3;background:#FFFFFF;color:#1F1D36;font-size:14px;font-weight:600"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v4.5h-4.5"/></svg>Check again</button></div>`
  } else {
    body = pill(ok, 'Installed and signed in', '#F4F3F8')
  }
  return `<section aria-labelledby="${name}" style="display:flex;flex-direction:column;gap:16px;padding:20px;background:#FFFFFF;border:${on ? '2px solid #1F1D36' : '1px solid #E7E6EF'};border-radius:20px">
    <div style="display:flex;align-items:flex-start;gap:14px">
      <span aria-hidden="true" style="width:48px;height:48px;flex:none;border-radius:14px;background:#EEEDF5;display:flex;align-items:center;justify-content:center">${termIcon}</span>
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:3px"><h2 id="${name}" style="margin:0;font-size:20px;line-height:1.25;font-weight:600">${NAMES[name]}</h2><span style="font-size:14px;color:#5D5A73">${PLANS[name]}</span></div>
      ${radio(name, on, ready(a))}
    </div>${body}</section>`
}

function render(s) {
  const info = s.agents
  if (!selected || !ready(info[selected])) selected = s.agent && ready(info[s.agent]) ? s.agent : ready(info.claude) ? 'claude' : ready(info.codex) ? 'codex' : (s.agent || 'claude')
  const initials = s.account && s.account.initials ? s.account.initials : ''
  const who = s.account && s.account.name ? `<span style="display:flex;align-items:center;gap:10px;font-size:14px;color:#5D5A73"><span aria-hidden="true" style="width:30px;height:30px;flex:none;border-radius:999px;background:#E9E7F3;font-size:11px;font-weight:700;color:#1F1D36;display:flex;align-items:center;justify-content:center">${esc(initials)}</span>Signed in as ${esc(s.account.name)}</span>` : '<span></span>'
  const canRun = ready(info[selected])
  document.getElementById('app').innerHTML = `${titleBar()}
  <main style="flex:1;min-height:0;display:flex;justify-content:center;padding:32px 56px;overflow:hidden">
    <div style="width:100%;max-width:960px;display:flex;flex-direction:column;gap:22px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px">${wordmark(82, 32)}${who}</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;gap:12px;align-items:flex-start">${gem(16, 'margin-top:13px')}<h1 style="margin:0;font-size:34px;line-height:1.15;font-weight:600;letter-spacing:-0.02em">Which AI should do Jemma's work?</h1></div>
        <p style="margin:0 0 0 28px;max-width:680px;font-size:16px;line-height:1.45;color:#5D5A73;text-wrap:pretty">Jemma Desktop uses the AI you already pay for. Reading papers and writing lessons cost you nothing extra.</p>
      </div>
      <div style="display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:16px">${card('claude', info.claude, selected === 'claude')}${card('codex', info.codex, selected === 'codex')}</div>
      <p style="margin:0;display:flex;gap:12px;align-items:flex-start;padding:14px 16px;border-radius:16px;background:#EEEDF5;font-size:15px;line-height:1.5"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none;margin-top:1px"><path d="M12 3.5 5 6v5.5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6z"/></svg><span>Your Claude or ChatGPT plan may use what it sees to improve its models unless you turn that off in its settings. Jemma only sends schoolwork.</span></p>
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px 20px">
        <button id="run" type="button" ${canRun ? '' : 'disabled'} style="display:flex;align-items:center;justify-content:center;gap:8px;height:52px;padding:0 24px;border-radius:14px;border:none;background:#1F1D36;color:#FFFFFF;font-size:17px;font-weight:600;${canRun ? '' : 'opacity:0.5;cursor:default'}">Run Jemma's work on ${NAMES[selected]}</button>
        <button id="cloud" type="button" style="min-height:44px;padding:0 4px;border:none;background:transparent;font-size:15px;font-weight:600;color:#1F1D36;text-decoration:underline;text-underline-offset:3px">Keep using Jemma cloud (free models)</button>
      </div>
    </div>
  </main>`
  document.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => { selected = b.dataset.pick; render(s) }))
  document.querySelectorAll('[data-recheck]').forEach((b) => b.addEventListener('click', load))
  document.querySelectorAll('[data-install]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); window.jemma.openExternal(INSTALL[a.dataset.install]) }))
  document.getElementById('run').addEventListener('click', () => canRun && window.jemma.runOn(selected))
  document.getElementById('cloud').addEventListener('click', () => window.jemma.keepCloud())
}

async function load() {
  render(await window.jemma.getState({ fresh: true }))
}
window.jemma.onState(load)
load()
