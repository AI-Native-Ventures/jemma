const $ = (id) => document.getElementById(id)

const agentText = (a) => {
  if (!a.installed) return 'Not installed'
  const signedIn = a.signedIn === true ? 'signed in' : a.signedIn === false ? 'not signed in' : 'sign-in unknown'
  return `Installed${a.version ? ' ' + a.version : ''}, ${signedIn}`
}

const reasons = {
  invalid: 'That code did not work. Check it and try again.',
  rate_limited: 'Too many tries. Get a new code and try again later.',
  unreachable: 'Jemma could not be reached.',
  sign_in_required: 'Sign in to Jemma in the main window first.',
}

let latest = 0
async function render() {
  const mine = ++latest
  const s = await window.jemma.getState()
  if (mine !== latest) return // a newer render is on its way
  $('status').textContent = s.statusText
  $('claude-status').textContent = agentText(s.agents.claude)
  $('codex-status').textContent = agentText(s.agents.codex)
  for (const r of document.querySelectorAll('input[name=agent]')) r.checked = r.value === s.agent
  $('account').textContent = s.paired
    ? `Paired${s.account ? ' as ' + (s.account.displayName || s.account.email) : ''}`
    : s.account
      ? `Signed in as ${s.account.displayName || s.account.email}, not paired`
      : 'Not paired'
  $('paused').checked = s.paused
}

for (const r of document.querySelectorAll('input[name=agent]')) r.addEventListener('change', async () => {
  await window.jemma.chooseAgent(r.value)
  await render()
})
$('paused').addEventListener('change', async (e) => {
  await window.jemma.setPaused(e.target.checked)
  await render()
})
const showPair = async (res) => {
  $('pair-message').textContent = res.ok ? 'Paired.' : reasons[res.reason] || 'Pairing failed.'
  await render()
}
$('pair-code').addEventListener('click', async () => showPair(await window.jemma.pairWithCode($('code').value)))
$('pair-self').addEventListener('click', async () => showPair(await window.jemma.pairThisMac()))
$('unpair').addEventListener('click', async () => {
  await window.jemma.unpair()
  $('pair-message').textContent = ''
  await render()
})
$('open-web').addEventListener('click', () => window.jemma.openWeb())
window.jemma.onState(render)
render()
