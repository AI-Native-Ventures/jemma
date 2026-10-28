const { titleBar, wordmark, gem } = window.jd
const step = (n, title, text) =>
  `<li style="display:flex;align-items:flex-start;gap:12px"><span aria-hidden="true" style="width:28px;height:28px;flex:none;border-radius:999px;background:#EEEDF5;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center">${n}</span><span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:3px"><span style="font-size:16px;font-weight:600;line-height:1.3">${title}</span><span style="font-size:14px;line-height:1.45;color:#5D5A73">${text}</span></span></li>`
const cells = [1, 2, 3, 4, 5, 6].map((n) => `<input class="cell" type="text" maxlength="1" autocapitalize="characters" autocomplete="off" aria-label="Character ${n} of 6">`).join('')

document.getElementById('app').innerHTML = `${titleBar()}
<main style="flex:1;min-height:0;display:flex;align-items:center;justify-content:center;gap:56px;padding:40px 56px">
  <section aria-labelledby="pair" style="width:440px;flex:none;display:flex;flex-direction:column;gap:22px">
    ${wordmark(92, 36)}
    <div style="display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;gap:12px;align-items:flex-start">
        ${gem(16, 'margin-top:13px')}
        <h1 id="pair" style="margin:0;font-size:34px;line-height:1.15;font-weight:600;letter-spacing:-0.02em">Sign in to Jemma Desktop</h1>
      </div>
      <p style="margin:0 0 0 28px;font-size:16px;line-height:1.45;color:#5D5A73;text-wrap:pretty">Enter the 6-character code shown in Jemma on your phone or browser.</p>
    </div>
    <form id="form" style="display:flex;flex-direction:column;gap:16px">
      <fieldset style="border:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px">
        <legend style="padding:0;margin-bottom:10px;font-size:15px;font-weight:500">Code from Jemma</legend>
        <span style="display:grid;grid-template-columns:repeat(6, minmax(0, 1fr));gap:8px">${cells}</span>
        <span id="help" style="font-size:14px;line-height:1.45;color:#5D5A73">Find it in Jemma: Where Jemma's AI runs, then Pair a desktop.</span>
      </fieldset>
      <button id="go" type="submit" style="display:flex;align-items:center;justify-content:center;gap:8px;height:52px;border-radius:14px;border:none;background:#1F1D36;color:#FFFFFF;font-size:17px;font-weight:600">Sign in</button>
    </form>
    <div style="display:flex;align-items:center;gap:12px;font-size:14px;color:#5D5A73"><span aria-hidden="true" style="flex:1;height:1px;background:#E7E6EF"></span>or<span aria-hidden="true" style="flex:1;height:1px;background:#E7E6EF"></span></div>
    <button id="email" type="button" style="display:flex;align-items:center;justify-content:center;gap:8px;height:52px;border-radius:14px;border:1.5px solid #1F1D36;background:#FFFFFF;color:#1F1D36;font-size:17px;font-weight:600"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4 7 8 6 8-6"/></svg>Sign in with email</button>
  </section>
  <section aria-labelledby="what" style="width:400px;flex:none;display:flex;flex-direction:column;gap:18px;padding:24px;background:#FFFFFF;border:1px solid #E7E6EF;border-radius:22px">
    <h2 id="what" style="margin:0;font-size:18px;font-weight:600">What Jemma Desktop does</h2>
    <ol style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:18px">
      ${step(1, 'Phones still snap tests', 'Snap papers in Jemma the way you do now.')}
      ${step(2, 'Your Mac does the thinking', 'Your own Claude Code or Codex reads the papers and writes the lessons.')}
      ${step(3, 'On the plan you already pay for', "Nothing extra to pay. Without Jemma Desktop, Jemma's cloud does the work on free models.")}
    </ol>
  </section>
</main>`

const inputs = [...document.querySelectorAll('.cell')]
const help = document.getElementById('help')
const helpText = help.textContent
const reasons = {
  invalid: 'That code did not work. Check it and try again.',
  rate_limited: 'Too many tries. Get a new code and try again later.',
  unreachable: 'Jemma could not be reached.',
  keychain: 'The macOS keychain is not available, so Jemma Desktop cannot sign in.',
  session_failed: 'Jemma could not sign you in. Get a new code and try again.',
}
const code = () => inputs.map((i) => i.value).join('')
inputs.forEach((el, i) => {
  el.addEventListener('input', () => {
    el.value = el.value.replace(/[^a-zA-Z0-9]/g, '').slice(-1).toUpperCase()
    if (el.value && inputs[i + 1]) inputs[i + 1].focus()
  })
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && !el.value && inputs[i - 1]) inputs[i - 1].focus()
  })
  el.addEventListener('paste', (e) => {
    const text = (e.clipboardData.getData('text') || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6)
    if (!text) return
    e.preventDefault()
    inputs.forEach((x, k) => (x.value = text[k] || ''))
    inputs[Math.min(text.length, 5)].focus()
  })
})
inputs[0].focus()

document.getElementById('form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const typed = code()
  if (typed.length < 6) return
  const res = await window.jemma.pairWithCode(typed)
  if (!res.ok) {
    help.textContent = reasons[res.reason] || 'Pairing failed.'
    help.style.color = '#B8381F'
  }
})
inputs.forEach((el) => el.addEventListener('input', () => { help.textContent = helpText; help.style.color = '#5D5A73' }))
document.getElementById('email').addEventListener('click', () => window.jemma.signInWithEmail())
