const $ = (id) => document.getElementById(id)
let latest = 0
async function render() {
  const mine = ++latest
  const s = await window.jemma.getState()
  if (mine !== latest) return // a newer render is on its way
  $('status').textContent = s.statusText
  $('agent').textContent = s.agent ? `Using ${s.agent === 'claude' ? 'Claude Code' : 'Codex'}` : 'No AI agent chosen'
  $('toggle').textContent = s.paused ? 'Resume' : 'Pause'
  $('toggle').dataset.paused = String(s.paused)
}
$('toggle').addEventListener('click', async () => {
  await window.jemma.setPaused($('toggle').dataset.paused !== 'true')
  await render()
})
window.jemma.onState(render)
render()
