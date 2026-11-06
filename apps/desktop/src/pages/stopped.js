// "Couldn't finish" dialog (board: desktop-job-stopped).
const { esc } = window.jd
const NAMES = { claude: 'Claude Code', codex: 'Codex' }

async function load() {
  const s = await window.jemma.getStopped()
  document.getElementById('app').innerHTML = `<section aria-labelledby="stop" style="width:100vw;height:100vh;display:flex;flex-direction:column;padding:28px;background:#FFFFFF;border:1px solid #CFCDDC;border-radius:16px;overflow:hidden">
  <span aria-hidden="true" style="width:48px;height:48px;flex:none;border-radius:14px;background:#FFE3DA;display:flex;align-items:center;justify-content:center"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/></svg></span>
  <h1 id="stop" style="margin:18px 0 0;font-size:24px;line-height:1.2;font-weight:600;letter-spacing:-0.01em;text-wrap:pretty">Couldn't finish ${esc(s.what)}.</h1>
  <p id="why" style="margin:8px 0 0;font-size:16px;line-height:1.45;color:#5D5A73">${esc(NAMES[s.agent] || 'The AI')} stopped: ${esc(s.why)}.</p>
  <p style="margin:18px 0 0;display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:14px;background:#F7F7FA;font-size:14px;line-height:1.45"><svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" style="flex:none;margin-top:4px"><polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D"/></svg><span>Nothing is lost. ${esc(s.waits)} waits until you choose.</span></p>
  <div style="flex:1;min-height:20px"></div>
  <div style="display:flex;flex-wrap:wrap;justify-content:flex-end;gap:10px">
    <button id="cloud" type="button" style="display:flex;align-items:center;gap:8px;height:46px;padding:0 16px;border-radius:14px;border:1.5px solid #1F1D36;background:#FFFFFF;color:#1F1D36;font-size:15px;font-weight:600"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 18.5h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 9.6 4.5 4.5 0 0 0 7 18.5z"/></svg>Run in the cloud this time</button>
    <button id="retry" type="button" style="display:flex;align-items:center;gap:8px;height:46px;padding:0 16px;border-radius:14px;border:none;background:#1F1D36;color:#FFFFFF;font-size:15px;font-weight:600"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>Try again at ${esc(s.retryAt)}</button>
  </div>
  <p style="margin:10px 0 0;text-align:right;font-size:13px;line-height:1.4;color:#5D5A73">The cloud uses Jemma's free models, for ${esc(s.cloudFor)}.</p>
</section>`
  document.getElementById('cloud').addEventListener('click', () => window.jemma.runStoppedInCloud())
  document.getElementById('retry').addEventListener('click', () => window.jemma.retryStoppedLater())
}
load()
