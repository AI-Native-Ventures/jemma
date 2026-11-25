// P162: the landing page for a visitor in the US: US prices (twice the list price) and US words ("math", "practice", "checks"). The page itself is
// the one in public/index.html; this only rewrites its text. Pure: a string in, a string out.

const PHRASES = [
  ['marks your answers', 'checks your answers'],
  ['Jemma marks it', 'Jemma checks it'],
  ['loses marks', 'loses points'],
  ['tests and marks.', 'tests and scores.'],
]

const WORDS = [
  [/\bMaths\b/g, 'Math'],
  [/\bmaths\b/g, 'math'],
  [/\bPractise\b/g, 'Practice'],
  [/\bpractise\b/g, 'practice'],
  [/\bPractising\b/g, 'Practicing'],
  [/\bpractising\b/g, 'practicing'],
  [/\bpractised\b/g, 'practiced'],
]

// The yearly prices of the plans, from the biggest down, so a new price is never changed again.
const PRICES = [
  ['>$192<', '>@@384<'],
  ['>$96<', '>@@192<'],
  ['>$48<', '>@@96<'],
]

export function usVersion(html) {
  let out = html
  for (const [from, to] of PHRASES) out = out.split(from).join(to)
  for (const [from, to] of PRICES) out = out.split(from).join(to)
  out = out.split('>@@').join('>$')
  // Words in the page's text and in its titles and descriptions, never in an address.
  out = out.replace(/(href|src)="[^"]*"|\b(?:Maths|maths|Practise|practise|Practising|practising|practised)\b/g, (m) => {
    if (m.startsWith('href=') || m.startsWith('src=')) return m
    for (const [re, to] of WORDS) {
      re.lastIndex = 0
      if (re.test(m)) return to
    }
    return m
  })
  return out.replace('<html lang="en">', '<html lang="en-US">')
}
