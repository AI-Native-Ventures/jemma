import { readFileSync } from 'node:fs'
import { globSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// P90 guard: no button or link of the learner's screens (apps/web/app/k) or the parent's screens (apps/web/app/p) is drawn as a big tap target
// with a fixed height and no room at the sides. It reads the source files, not a browser. A button, a link, a label, a PendingButton, a Button, or a style object named ...Button / ...btn, that
//   - has a fixed `h-[Npx]` (or `h-N`) and no fixed width (it is as wide as its box or its grid cell: `w-full` or no width at all) and no `px-`
//     (or `pl-` and `pr-`), or
//   - sets a fixed inline `height` of 46 px or more and no space at the sides (`padding`) and no fixed `width`, or
//   - is the kit's `<Button>` (a fixed height and 16 px at the sides) without the override that gives it `min-h-` and `px-5` or more
// is a fault: its words touch the edges and a long label cannot take a second line.

const webRoot = resolve(import.meta.dirname, '..')
const files = ['app/k/**/*.{ts,tsx}', 'app/p/**/*.{ts,tsx}'].flatMap((p) => globSync(p, { cwd: webRoot })).sort()

/**
 * Elements left as they are on purpose. An element is let through when its opening tag holds `needle`. Each one says why.
 */
const ALLOWED: { file: string; needle: string; why: string }[] = [
  { file: 'app/k/sign-in/SignInForm.tsx', needle: 'style={keyStyle}', why: 'a keypad key with one digit in it: the grid sets its width and there are no words to wrap' },
  { file: 'app/p/[childId]/activities/new/ActivityForm.tsx', needle: 'aria-pressed={on}', why: 'a day chip, seven to a row: three letters, no room for 20 px at each side and nothing that can wrap' },
]

type Found = { file: string; line: number; tag: string; why: string }

/** The opening tag that starts at `start`: up to the `>` that closes it, skipping `=>`, braces and quoted strings. */
function openingTag(src: string, start: number): string {
  let depth = 0
  let quote: string | null = null
  for (let i = start; i < src.length; i++) {
    const c = src[i]!
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') quote = c
    else if (c === '{') depth++
    else if (c === '}') depth--
    else if (c === '>' && depth === 0 && src[i - 1] !== '=') return src.slice(start, i + 1)
  }
  return src.slice(start)
}

/** The strings the file keeps in a const (a class list or a style object), by name, so `className={big}` can be read. */
function consts(src: string): Map<string, string> {
  const map = new Map<string, string>()
  const re = /(?:^|\n)\s*(?:export\s+)?const\s+([A-Za-z_]\w*)(?:\s*:\s*[\w<>\[\], ]+)?\s*=\s*/g
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const from = m.index + m[0].length
    const first = src[from]
    let end = from
    if (first === "'" || first === '"' || first === '`') {
      end = src.indexOf(first, from + 1)
      while (end > 0 && src[end - 1] === '\\') end = src.indexOf(first, end + 1)
    } else if (first === '{') {
      let depth = 0
      for (end = from; end < src.length; end++) {
        if (src[end] === '{') depth++
        else if (src[end] === '}' && --depth === 0) break
      }
    } else {
      continue
    }
    map.set(m[1]!, src.slice(from, end + 1))
  }
  return map
}

/** The text of an attribute's value, with every const it names written out. */
function attribute(tag: string, name: string, known: Map<string, string>): { text: string; names: string[] } | null {
  const at = tag.search(new RegExp(`\\s${name}=`))
  if (at < 0) return null
  const from = at + name.length + 2
  let text: string
  if (tag[from] === '"' || tag[from] === "'") text = tag.slice(from, tag.indexOf(tag[from]!, from + 1))
  else {
    let depth = 0
    let end = from
    for (; end < tag.length; end++) {
      if (tag[end] === '{') depth++
      else if (tag[end] === '}' && --depth === 0) break
    }
    text = tag.slice(from, end + 1)
  }
  const names = [...text.matchAll(/[A-Za-z_]\w*/g)].map((m) => m[0]).filter((n) => known.has(n))
  return { text: `${text} ${names.map((n) => known.get(n)).join(' ')}`, names }
}

/** The smallest space an inline style leaves at the left or the right, in px: from `padding` (1 to 4 values) or `paddingLeft` and `paddingRight`. 0 when none. */
function sidePadding(text: string): number {
  let left = 0
  let right = 0
  for (const m of text.matchAll(/(?<![\w-])padding(Left|Right)?:\s*['"`]?([^;,}'"`]*)/g)) {
    const values = m[2]!.trim().split(/\s+/).map((v) => parseFloat(v) || 0)
    if (m[1] === 'Left') left = values[0] ?? 0
    else if (m[1] === 'Right') right = values[0] ?? 0
    else {
      const [a = 0, b = a, , d = b] = values
      right = b
      left = d
      void a
    }
  }
  return Math.min(left, right)
}

const allowed = (file: string, tag: string) => ALLOWED.some((a) => a.file === file && tag.includes(a.needle))

const INTERACTIVE = /<(button|Link|a|label|PendingButton|Button)(?=[\s>])/g

/** An icon (an svg, or one of the icon components) first in a flex button with words after it. The icon is left alone at the edge when the words wrap. */
const ICON_FIRST = /^\s*(?:\{[^{}]*\?\s*)?<(svg|Icon|CameraGlyph|CameraIcon|PhoneIcon|GemIcon)\b/
function iconBesideWords(body: string): boolean {
  if (!ICON_FIRST.test(body)) return false
  const left = body
    .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
    .replace(/<(Icon|CameraGlyph|CameraIcon|PhoneIcon|GemIcon)\b[^>]*\/>/g, ' ')
    .replace(/<[^>]*>/g, ' ')
  return /[A-Za-z]{2,}/.test(left)
}

function scanSource(file: string, src: string): Found[] {
  const known = consts(src)
  const found: Found[] = []
  for (const m of src.matchAll(INTERACTIVE)) {
    const tag = openingTag(src, m.index!)
    const line = src.slice(0, m.index).split('\n').length
    const cls = attribute(tag, 'className', known)
    if (cls) {
      const words = cls.text.replace(/[{}'"`]/g, ' ').split(/\s+/)
      const fixed = words.some((w) => /^h-(\[\d+px\]|\d+)$/.test(w))
      const wide = !words.some((w) => /^(w|size)-(\[|\d)/.test(w))
      const roomy = words.some((w) => /^px-/.test(w)) || (words.some((w) => /^pl-/.test(w)) && words.some((w) => /^pr-/.test(w)))
      if (fixed && wide && !roomy && !allowed(file, tag)) found.push({ file, line, tag: m[1]!, why: 'a fixed h, as wide as its box, and no px-' })
    }
    if (m[1] === 'Button') {
      const words = (cls?.text ?? '').replace(/[{}'"`]/g, ' ').split(/\s+/)
      const room = words.some((w) => /^(!)?px-(5|6|7|8)$/.test(w) || /^(!)?px-\[(2\d|[3-9]\d)px\]$/.test(w))
      if (!(room && words.some((w) => w.startsWith('min-h-'))) && !allowed(file, tag)) found.push({ file, line, tag: 'Button', why: 'the kit Button (52 px high, 16 px at the sides) without min-h- and px-5' })
    }
    const style = attribute(tag, 'style', known)
    // An icon beside the words of a button whose content is centred: the words wrap to two lines and the icon is left alone at the edge. IconLabel
    // keeps them together. (A row with its icon at the left and its words beside it is not this: those are not centred.)
    const drawn = `${cls?.text ?? ''} ${style?.text ?? ''}`
    // A button that does not shrink (flex: none) or has a fixed width is as wide as its words: it never wraps.
    const sizedToWords = /flex-none|flex:\s*'?none|(?<![\w-])width:\s*\d|(^|\s)(w|size)-(\[|\d)/.test(drawn)
    if (/\bflex\b|display:\s*['"]?flex/.test(drawn) && /justify-center|justifyContent:\s*'center'|justify-content:\s*center/.test(drawn) && !sizedToWords) {
      const from = m.index! + tag.length
      const close = src.indexOf(`</${m[1]}>`, from)
      if (close > 0 && iconBesideWords(src.slice(from, close)) && !allowed(file, tag)) {
        found.push({ file, line, tag: m[1]!, why: 'an icon beside the words (wrap them in IconLabel, from @/components/ui/IconLabel)' })
      }
    }
    if (style) {
      const height = /(?<![\w-])height:\s*(\d+)/.exec(style.text)
      const fixedWidth = /(?<![\w-])width:\s*\d+/.test(style.text)
      if (height && Number(height[1]) >= 46 && !fixedWidth && sidePadding(style.text) === 0 && !allowed(file, tag)) found.push({ file, line, tag: m[1]!, why: `an inline height of ${height[1]} and no padding` })
    }
  }
  // A style object kept in a const for a button (primaryButton, outlineButton, btn): the same rule as for an inline style.
  for (const [name, body] of known) {
    if (!/(button|btn)$/i.test(name) || !body.startsWith('{')) continue
    const height = /(?<![\w-])height:\s*(\d+)/.exec(body)
    const fixedWidth = /(?<![\w-])width:\s*\d+/.test(body)
    const line = src.slice(0, src.indexOf(`const ${name}`)).split('\n').length
    if (height && Number(height[1]) >= 46 && !fixedWidth && sidePadding(body) === 0 && !allowed(file, name)) {
      found.push({ file, line, tag: name, why: `a style with an inline height of ${height[1]} and no padding` })
    }
  }
  return found
}

const scan = (file: string) => scanSource(file, readFileSync(join(webRoot, file), 'utf8'))

describe('the guard reads the right files', () => {
  it('finds the learner and the parent screens', () => {
    expect(files.length).toBeGreaterThan(50)
    expect(files).toContain('app/k/session/_parts/Paper.tsx')
    expect(files.some((f) => f.startsWith('app/p/'))).toBe(true)
  })

  it('catches the fault it is looking for, and lets a button with room through', () => {
    const bad = `const big = 'flex h-[68px] w-full items-center justify-center rounded-20 bg-coral text-[22px] font-bold'\nexport const A = () => <label className={big}>Take a photo</label>`
    expect(scanSource('x.tsx', bad)).toHaveLength(1)
    const grid = `export const B = () => <button type="button" onClick={() => go()} className="h-[60px] rounded-18 bg-ink">Next</button>`
    expect(scanSource('x.tsx', grid)).toHaveLength(1)
    const inline = `export const C = () => <button type="submit" style={{ display: 'flex', height: 52, borderRadius: 14 }}>Save</button>`
    expect(scanSource('x.tsx', inline)).toHaveLength(1)
    const inlineCss = `export const D = () => <button type="submit" style={css('display:flex;height:52px;border-radius:14px')}>Save</button>`
    expect(scanSource('x.tsx', inlineCss)).toHaveLength(1)
    const roomy = `const big = 'flex min-h-[68px] w-full rounded-20 bg-coral px-5 py-3 text-[20px]'\nexport const E = () => <label className={big}>Take a photo</label>`
    expect(scanSource('x.tsx', roomy)).toEqual([])
    const minOnly = `export const F = () => <a style={css('display:flex;min-height:48px;gap:10px')}>Row</a>`
    expect(scanSource('x.tsx', minOnly)).toEqual([])
    const constStyle = `export const primaryButton: CSSProperties = { display: 'flex', height: 52, borderRadius: 14, padding: 0 }`
    expect(scanSource('x.tsx', constStyle)).toHaveLength(1)
    const constRoomy = `export const primaryButton: CSSProperties = { display: 'flex', minHeight: 56, borderRadius: 14, padding: '12px 20px' }`
    expect(scanSource('x.tsx', constRoomy)).toEqual([])
    const pill = `export const H = () => <a style={{ display: 'flex', height: 46, padding: '0 16px', flex: 'none' }}>Snap</a>`
    expect(scanSource('x.tsx', pill)).toEqual([])
    const kit = `export const I = () => <Button variant="primary" onClick={go}>Got it</Button>`
    expect(scanSource('x.tsx', kit)).toHaveLength(1)
    const kitRoomy = `export const J = () => <Button variant="primary" className="!h-auto min-h-14 !px-5 py-3" onClick={go}>Got it</Button>`
    expect(scanSource('x.tsx', kitRoomy)).toEqual([])
    const iconBeside = `export const K = () => <button type="button" className="flex min-h-14 justify-center px-5 gap-3"><svg width="20"><path d="M0 0" /></svg>Retry</button>`
    expect(scanSource('x.tsx', iconBeside)).toHaveLength(1)
    const iconBesideInline = `export const L = () => <Link href="/x" style={{ display: 'flex', justifyContent: 'center', minHeight: 56, padding: '12px 20px' }}><Icon name="down" size={18} />Download</Link>`
    expect(scanSource('x.tsx', iconBesideInline)).toHaveLength(1)
    const iconGrouped = `export const M = () => <button type="button" className="flex min-h-14 justify-center px-5"><IconLabel icon={<svg width="20" />}>Retry</IconLabel></button>`
    expect(scanSource('x.tsx', iconGrouped)).toEqual([])
    const iconRow = `export const O = () => <a className="flex min-h-14 items-center gap-3 px-5"><svg width="20"><path d="M0 0" /></svg>A row with words</a>`
    expect(scanSource('x.tsx', iconRow)).toEqual([])
    const iconSized = `export const P = () => <Link href="/x" style={css('display:flex;justify-content:center;height:46px;padding:0 18px;flex:none')}><svg width="16"><path d="M0 0" /></svg>Snap a test</Link>`
    expect(scanSource('x.tsx', iconSized)).toEqual([])
    const iconOnly = `export const N = () => <Link href="/x" aria-label="Back" style={{ display: 'flex', width: 44, height: 44 }}><svg width="20"><path d="M0 0" /></svg></Link>`
    expect(scanSource('x.tsx', iconOnly)).toEqual([])
    const fixedSquare = `export const G = () => <button className="flex h-11 w-[52px] items-center justify-center">x</button>`
    expect(scanSource('x.tsx', fixedSquare)).toEqual([])
  })
})

describe('no big button without room', () => {
  it('no button or link of app/k or app/p is as wide as its box with a fixed height and no px-', () => {
    const faults = files.flatMap(scan).map((f) => `${f.file}:${f.line} <${f.tag}> ${f.why}`)
    expect(faults).toEqual([])
  })

  it('the allow list names only files that exist, with a needle that is in them and a reason', () => {
    for (const a of ALLOWED) {
      expect(files).toContain(a.file)
      expect(readFileSync(join(webRoot, a.file), 'utf8')).toContain(a.needle)
      expect(a.why.length).toBeGreaterThan(10)
    }
    expect(relative(webRoot, join(webRoot, 'app'))).toBe('app')
  })
})
