// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// P101: the landing page is its own small site, apps/landing, static files only. This reads the files (no browser, no server, no database):
// the page, its links, its pictures, its font, and the two Cloudflare configs that put the site at getjemma.ainative.ventures and the app at
// jemma.ainative.ventures.

const repoRoot = resolve(import.meta.dirname, '../../..')
const siteRoot = join(repoRoot, 'apps/landing')
const publicDir = join(siteRoot, 'public')
const html = readFileSync(join(publicDir, 'index.html'), 'utf8')

const APP = 'https://jemma.ainative.ventures'
const LANDING = 'https://getjemma.ainative.ventures'
const GITHUB = 'https://github.com/AI-Native-Ventures/jemma'

/** Text of a piece of markup: pictures and tags dropped, white space folded. */
function textOf(markup: string): string {
  return markup
    .replace(/<svg\b[\s\S]*?<\/svg>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Every file under a folder, as repo-relative paths, leaving out the installed packages and the Wrangler cache. */
function walk(dir: string): string[] {
  return readdirSync(join(repoRoot, dir), { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === '.wrangler') return []
    const path = `${dir}/${entry.name}`
    return entry.isDirectory() ? walk(path) : [path]
  })
}

/** The text files of the site, as repo-relative path and content. */
function siteTextFiles(): { path: string; text: string }[] {
  return walk('apps/landing')
    .filter((f) => /(\.(html|css|json|jsonc|txt|svg|md)|_headers)$/.test(f))
    .map((path) => ({ path, text: readFileSync(join(repoRoot, path), 'utf8') }))
}

describe('the page head', () => {
  it('is a complete document with a language, a charset and a phone viewport', () => {
    expect(html.trimStart().toLowerCase().startsWith('<!doctype html>')).toBe(true)
    expect(html).toMatch(/<html lang="en">/)
    expect(html).toMatch(/<meta charset="utf-8">/i)
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">')
  })

  it('has the title, the description from the hero sentence, the canonical address and the theme colour', () => {
    expect(html).toContain('<title>Jemma: follows one learner across years</title>')
    const hero = 'Jemma reads class tests from a photo, finds what each learner is missing, and gives them a short lesson to practise at home.'
    expect(html).toContain(`<meta name="description" content="${hero}">`)
    expect(html).toContain(`<link rel="canonical" href="${LANDING}/">`)
    expect(html).toContain('<meta name="theme-color" content="#F7F7FA">')
  })

  it('has Open Graph title and description, and a favicon that is in the folder', () => {
    expect(html).toContain('<meta property="og:title" content="Jemma: follows one learner across years">')
    expect(html).toMatch(/<meta property="og:description" content="[^"]{40,}">/)
    const icon = /<link rel="icon" href="([^"]+)"/.exec(html)
    expect(icon).not.toBeNull()
    expect(existsSync(join(publicDir, icon![1]!))).toBe(true)
  })
})

describe('the page body', () => {
  it('has the section headings in the designed order', () => {
    const headings = [...html.matchAll(/<h([123])\b[^>]*>([\s\S]*?)<\/h\1>/g)].map((m) => `h${m[1]} ${textOf(m[2]!)}`)
    expect(headings).toEqual([
      'h1 Follows one learner across years, not one term.',
      'h2 How it works',
      'h2 See what held for three terms or more.',
      "h2 Who it's for",
      'h3 For learners',
      'h3 For parents',
      'h3 For teachers',
      'h2 Maths for Grade 1 to Grade 12.',
      'h2 The rules it keeps',
      'h2 See it with a made-up class.',
    ])
  })

  it('says "MIT licence" beside the scope line in the footer', () => {
    const footer = /<footer\b[\s\S]*<\/footer>/.exec(html)![0]
    expect(textOf(footer)).toContain('Mathematics, CAPS Grades 1 to 12. MIT licence')
  })

  it('has no script, no template tag and nothing from the design tool', () => {
    expect(html).not.toMatch(/<script\b/i)
    for (const banned of ['x-dc', 'support.js', 'text/x-dc', '<helmet', '/_blob/']) expect(html.includes(banned), banned).toBe(false)
  })

  it('asks no third party for anything: no font service and no outside address except the links', () => {
    for (const banned of ['fonts.googleapis', 'fonts.gstatic', '@import']) expect(html.includes(banned), banned).toBe(false)
    const outside = [...html.matchAll(/(?:src|href|content)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]!)
    const allowed = new Set([`${LANDING}/`, `${APP}/demo`, `${APP}/sign-in`, `${APP}/sign-up`, `${APP}/privacy`, `${APP}/help`, GITHUB])
    expect(outside.filter((u) => !allowed.has(u))).toEqual([])
  })

  it('is the light theme only', () => {
    expect(html).not.toMatch(/prefers-color-scheme|color-scheme/)
  })
})

describe('the links', () => {
  const links = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => {
    const attrs = m[1]!
    return { href: /\bhref="([^"]*)"/.exec(attrs)?.[1], label: /\baria-label="([^"]*)"/.exec(attrs)?.[1] ?? textOf(m[2]!) }
  })
  const ALLOWED = ['/', `${APP}/demo`, `${APP}/sign-in`, `${APP}/sign-up`, `${APP}/privacy`, `${APP}/help`, GITHUB]

  it('every link has an address from the allowed set and none is "#"', () => {
    expect(links.length).toBeGreaterThan(0)
    for (const l of links) {
      expect(l.href, l.label).toBeTruthy()
      expect(l.href, l.label).not.toBe('#')
      expect(ALLOWED, `${l.label} -> ${l.href}`).toContain(l.href)
    }
  })

  it('each label goes where the packet says', () => {
    const want: Record<string, string> = {
      'jemma home': '/',
      'Try the demo': `${APP}/demo`,
      'Sign in': `${APP}/sign-in`,
      Start: `${APP}/sign-up`,
      Privacy: `${APP}/privacy`,
      Help: `${APP}/help`,
      'Source on GitHub': GITHUB,
    }
    for (const l of links) expect(want[l.label], `unknown link "${l.label}"`).toBe(l.href)
    const count = (label: string) => links.filter((l) => l.label === label).length
    expect(count('jemma home')).toBe(2)
    expect(count('Try the demo')).toBe(2)
    expect(count('Sign in')).toBe(3)
    for (const once of ['Start', 'Privacy', 'Help', 'Source on GitHub']) expect(count(once), once).toBe(1)
  })
})

describe('the pictures', () => {
  const imgs = [...html.matchAll(/<img\b([^>]*)>/g)].map((m) => {
    const attr = (name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(m[1]!)?.[1]
    return { src: attr('src'), alt: attr('alt'), width: attr('width'), height: attr('height'), loading: attr('loading'), decoding: attr('decoding') }
  })

  it('are the ten screenshots, in the order of the page, at the designed sizes', () => {
    expect(imgs.map((i) => `${i.src} ${i.width}x${i.height}`)).toEqual([
      '/img/hero-lesson.png 390x844',
      '/img/longview-laptop.png 1440x900',
      '/img/longview-phone.png 390x844',
      '/img/learner-my-own.png 390x844',
      '/img/parent-tests.png 390x844',
      '/img/teacher-class.png 390x844',
      '/img/tile-fractions.png 374x406',
      '/img/tile-graphs.png 374x406',
      '/img/tile-trigonometry.png 374x406',
      '/img/tile-algebra.png 374x406',
    ])
  })

  it('are files in the folder, and real PNG files', () => {
    for (const i of imgs) {
      const file = join(publicDir, i.src!)
      expect(existsSync(file), `${i.src} is missing`).toBe(true)
      expect(readFileSync(file).subarray(0, 8).toString('hex'), `${i.src} is not a PNG`).toBe('89504e470d0a1a0a')
    }
  })

  it('each has a size, a text alternative and async decoding; all but the hero load lazily', () => {
    imgs.forEach((i, n) => {
      expect(i.width, i.src).toMatch(/^\d+$/)
      expect(i.height, i.src).toMatch(/^\d+$/)
      expect((i.alt ?? '').trim().length, `${i.src} alt`).toBeGreaterThan(10)
      expect(i.decoding, i.src).toBe('async')
      if (n === 0) expect(i.loading, 'the hero picture').toBeUndefined()
      else expect(i.loading, i.src).toBe('lazy')
    })
    expect(new Set(imgs.map((i) => i.alt)).size).toBe(imgs.length)
  })
})

describe('the font', () => {
  const css = [...html.matchAll(/@font-face\s*\{[^}]*\}/g)].map((m) => m[0])

  it('is Outfit in four weights, served from the site, swapped in when it arrives', () => {
    expect(css.length).toBe(4)
    const weights = css.map((c) => /font-weight:\s*(\d+)/.exec(c)![1])
    expect(weights).toEqual(['400', '500', '600', '700'])
    for (const c of css) {
      expect(c).toMatch(/font-family:\s*'?Outfit'?/)
      expect(c).toMatch(/font-display:\s*swap/)
    }
  })

  it('points at woff2 files that are in the folder, and the licence is next to them', () => {
    for (const c of css) {
      const url = /url\(\s*'?([^)']+)'?\s*\)/.exec(c)![1]!
      expect(url.startsWith('/fonts/') && url.endsWith('.woff2'), url).toBe(true)
      const file = join(publicDir, url)
      expect(existsSync(file), `${url} is missing`).toBe(true)
      expect(readFileSync(file).subarray(0, 4).toString('latin1'), `${url} is not woff2`).toBe('wOF2')
    }
    const licence = readFileSync(join(publicDir, 'fonts/OFL.txt'), 'utf8')
    expect(licence).toContain('SIL OPEN FONT LICENSE Version 1.1')
    expect(licence).toContain('Outfit')
  })
})

describe('the Cloudflare config of the site', () => {
  const config = JSON.parse(readFileSync(join(siteRoot, 'wrangler.jsonc'), 'utf8'))

  it('is static files at getjemma.ainative.ventures, with no Worker script', () => {
    expect(config.name).toBe('jemma-landing')
    expect(config.compatibility_date).toBe('2026-10-01')
    expect(config.assets).toEqual({ directory: './public' })
    expect(config.main).toBeUndefined()
    expect(config.routes).toEqual([{ pattern: 'getjemma.ainative.ventures', custom_domain: true }])
    expect(config.workers_dev).toBe(true)
  })

  it('has a package with a deploy script and the same wrangler as the app', () => {
    const pkg = JSON.parse(readFileSync(join(siteRoot, 'package.json'), 'utf8'))
    const web = JSON.parse(readFileSync(join(repoRoot, 'apps/web/package.json'), 'utf8'))
    expect(pkg.private).toBe(true)
    expect(pkg.scripts.deploy).toBe('wrangler deploy')
    expect(pkg.devDependencies.wrangler).toBe(web.devDependencies.wrangler)
    expect(pkg.devDependencies.wrangler).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('caches the pictures and fonts for a long time', () => {
    const headers = readFileSync(join(publicDir, '_headers'), 'utf8')
    expect(headers).toMatch(/\/img\/\*\s+Cache-Control: public, max-age=\d{6,}/)
    expect(headers).toMatch(/\/fonts\/\*\s+Cache-Control: public, max-age=\d{6,}/)
  })
})

describe('the Cloudflare config of the app', () => {
  const config = JSON.parse(readFileSync(join(repoRoot, 'apps/web/wrangler.jsonc'), 'utf8'))

  it('is at jemma.ainative.ventures, keeps the old address, and knows where the landing site is', () => {
    expect(config.routes).toEqual([{ pattern: 'jemma.ainative.ventures', custom_domain: true }])
    expect(config.workers_dev).toBe(true)
    expect(config.vars).toEqual({ LANDING_URL: LANDING })
    expect(config.name).toBe('jemma-web')
  })
})

describe('the whole site folder', () => {
  const files = siteTextFiles()

  it('is found (this test reads something)', () => {
    expect(files.map((f) => f.path)).toEqual(expect.arrayContaining(['apps/landing/public/index.html', 'apps/landing/wrangler.jsonc']))
  })

  it('holds no em dash', () => {
    const dash = String.fromCharCode(0x2014)
    expect(files.filter((f) => f.text.includes(dash)).map((f) => f.path)).toEqual([])
  })

  it('holds no local path and no coordinator word', () => {
    // The words are written in two halves so that this file does not contain them itself.
    const banned = [
      ['coord', '-work'],
      ['heavy', '-run'],
      ['/Us', 'ers/'],
      ['.cla', 'ude/'],
      ['jemma', '-briefs'],
    ].map((halves) => halves.join(''))
    for (const f of files) for (const word of banned) expect(f.text.includes(word), `${f.path} has "${word}"`).toBe(false)
  })
})
