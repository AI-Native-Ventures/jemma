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
    expect(html).toContain('<title>Jemma: learn maths until you understand it</title>')
    const hero = 'Jemma teaches you a short lesson, marks your answers, and teaches again what you got wrong. Every lesson is free.'
    expect(html).toContain(`<meta name="description" content="${hero}">`)
    expect(html).toContain(`<link rel="canonical" href="${LANDING}/">`)
    expect(html).toContain('<meta name="theme-color" content="#F8F6F1">')
  })

  it('has Open Graph title and description, and a favicon that is in the folder', () => {
    expect(html).toContain('<meta property="og:title" content="Jemma: learn maths until you understand it">')
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
      'h1 Learn maths until you understand it.',
      'h2 How it works',
      'h3 Learn',
      'h3 Try',
      'h3 Jemma marks it',
      'h3 Learn it again',
      'h2 Miss one step, and the next is hard.',
      'h3 Fractions',
      'h3 Algebra',
      'h3 Trigonometry and calculus',
      'h2 Maths for Grade 1 to Grade 12.',
      'h2 Add a parent. Join your class.',
      'h3 For parents',
      'h3 For schools',
      'h2 Free to learn. Plans to practise.',
      'h3 Free',
      'h3 Light',
      'h3 Regular',
      'h3 Heavy',
      'h2 The rules it keeps',
      'h2 Try a lesson now.',
    ])
  })

  it('says "MIT licence" beside the scope line in the footer, and that every learner shown is made up', () => {
    const footer = /<footer\b[\s\S]*<\/footer>/.exec(html)![0]
    expect(textOf(footer)).toContain('Mathematics, CAPS Grades 1 to 12. MIT licence. Every learner shown here is made up.')
  })

  it('has no script but the one that carries the tags of an ad link into the app (P161), no template tag and nothing from the design tool', () => {
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]!)
    expect(scripts).toHaveLength(1)
    expect(scripts[0]).toContain("['utm_source', 'utm_medium', 'utm_campaign']")
    expect(scripts[0]).not.toMatch(/fetch|XMLHttpRequest|cookie|localStorage|sendBeacon/)
    for (const banned of ['x-dc', 'support.js', 'text/x-dc', '<helmet', '/_blob/']) expect(html.includes(banned), banned).toBe(false)
  })

  it('asks no third party for anything: no font service and no outside address except the links', () => {
    for (const banned of ['fonts.googleapis', 'fonts.gstatic', '@import']) expect(html.includes(banned), banned).toBe(false)
    const outside = [...html.matchAll(/(?:src|href|content)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]!)
    const allowed = new Set([`${LANDING}/`, `${APP}/tour`, `${APP}/sign-in`, `${APP}/sign-up`, `${APP}/privacy`, `${APP}/help`, GITHUB])
    expect(outside.filter((u) => !allowed.has(u))).toEqual([])
  })

  it('is the light theme only', () => {
    expect(html).not.toMatch(/prefers-color-scheme|color-scheme/)
  })
})

describe("the words are a learner's own (23 Nov 2026)", () => {
  const text = textOf(html)

  it('never says "gap", "gaps", "Long view" or "demo": those are our words, not a learner\'s', () => {
    for (const ours of [/\bgaps?\b/i, /long view/i, /\bdemo\b/i, /across years/i]) expect(text).not.toMatch(ours)
    // Not in the address of a picture either.
    expect(html).not.toMatch(/\/img\/[^"]*gap/i)
  })

  it('calls no one "she" or "he", in the words and in the words that stand for the pictures (the rule of the app, P99b)', () => {
    const alts = [...html.matchAll(/\balt="([^"]*)"/g)].map((m) => m[1]!)
    for (const words of [text, ...alts]) expect(words).not.toMatch(/\b(she|her|hers|herself|he|him|his|himself)\b/i)
  })

  it('pins a card to the hero: what Amina is working on, and the three states of the app', () => {
    expect(text).toContain('Amina is working on Adding fractions New Practising Fixed')
  })

  it('tells how it works in four steps, in order, in plain words', () => {
    const steps = [...html.matchAll(/<span aria-hidden="true"[^>]*>(\d)<\/span>\s*<div[^>]*>\s*<h3[^>]*>([\s\S]*?)<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/g)].map(
      (m) => `${m[1]} ${textOf(m[2]!)}: ${textOf(m[3]!)}`,
    )
    expect(steps).toEqual([
      '1 Learn: A short lesson. Read it, see it in pictures, or listen.',
      '2 Try: Answer the questions. Type them, or snap your paper.',
      '3 Jemma marks it: You see what you got wrong, and why.',
      '4 Learn it again: Jemma teaches that part again. Practise until you get it right.',
    ])
    expect(text).toContain('Got a test back from school? Snap it. Jemma finds what to practise.')
  })

  it('says why maths gets hard without a label: a missed step, never a learner who is bad at maths', () => {
    expect(text).toContain('Why maths gets hard Miss one step, and the next is hard. You are not bad at maths. Jemma teaches again the step you missed.')
    expect(text).toContain('Grade 4 to 6 missed Fractions You miss adding fractions.')
  })

  it('shows the four plans by the year in dollars, one plan for the whole family, and the free practice (P161)', () => {
    const plans = [...html.matchAll(/<li\b[^>]*>\s*<span[^>]*>\s*<span[^>]*>(\$\d+)<\/span>\s*<span[^>]*>([^<]*)<\/span>\s*<\/span>\s*<h3[^>]*>([^<]*)<\/h3>\s*<p[^>]*>([^<]*)<\/p>\s*<p[^>]*>([^<]*)<\/p>/g)].map(
      (m) => m.slice(1, 6).join(' | '),
    )
    expect(plans).toEqual([
      '$0 | always | Free | 2 practices a day | every lesson, always',
      '$48 | a year | Light | 150 practices a month | about 5 a day',
      '$96 | a year | Regular | 300 practices a month | about 10 a day',
      '$192 | a year | Heavy | 600 practices a month | about 20 a day',
    ])
    expect(text).toContain('One plan for the whole family. Your children share it.')
    expect(text).toContain('Without a plan: 2 practices a day for each child. Every lesson is free.')
    expect(text).not.toContain('20% off')
  })

  it('keeps three rules', () => {
    expect(text).toContain('The rules it keeps Jemma never calls you slow or weak. You are never ranked against your class. Your own practice never goes to your school.')
  })
})

describe('the links', () => {
  const links = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => {
    const attrs = m[1]!
    return { href: /\bhref="([^"]*)"/.exec(attrs)?.[1], label: /\baria-label="([^"]*)"/.exec(attrs)?.[1] ?? textOf(m[2]!) }
  })
  const ALLOWED = ['/', `${APP}/tour`, `${APP}/sign-in`, `${APP}/sign-up`, `${APP}/privacy`, `${APP}/help`, GITHUB]

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
      'Try a lesson': `${APP}/tour`,
      'Sign in': `${APP}/sign-in`,
      Start: `${APP}/sign-up`,
      Privacy: `${APP}/privacy`,
      Help: `${APP}/help`,
      'Source on GitHub': GITHUB,
    }
    for (const l of links) expect(want[l.label], `unknown link "${l.label}"`).toBe(l.href)
    const count = (label: string) => links.filter((l) => l.label === label).length
    expect(count('jemma home')).toBe(2)
    expect(count('Try a lesson')).toBe(2)
    expect(count('Sign in')).toBe(3)
    for (const once of ['Start', 'Privacy', 'Help', 'Source on GitHub']) expect(count(once), once).toBe(1)
  })
})

describe('the pictures', () => {
  const imgs = [...html.matchAll(/<img\b([^>]*)>/g)].map((m) => {
    const attr = (name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(m[1]!)?.[1]
    return { src: attr('src'), alt: attr('alt'), width: attr('width'), height: attr('height'), loading: attr('loading'), decoding: attr('decoding') }
  })

  it('are the eleven screenshots, in the order of the page, at the designed sizes (the results screen is shown twice: the hero and step 3)', () => {
    expect(imgs.map((i) => `${i.src} ${i.width}x${i.height}`)).toEqual([
      '/img/results.png 390x844',
      '/img/step-learn.png 390x844',
      '/img/step-try.png 390x844',
      '/img/results.png 390x844',
      '/img/step-learn-again.png 390x844',
      '/img/maths-fractions.png 374x406',
      '/img/maths-graphs.png 374x406',
      '/img/maths-trigonometry.png 374x406',
      '/img/maths-algebra.png 374x406',
      '/img/parent-marks.png 390x844',
      '/img/class-topics.png 390x860',
    ])
    // Pictures are cached for a week, so no picture of the page before this one keeps its name: an old one under the new page would show the old colours.
    for (const old of ['hero-lesson', 'longview-laptop', 'longview-phone', 'learner-my-own', 'parent-tests', 'teacher-class', 'tile-fractions', 'tile-graphs', 'tile-trigonometry', 'tile-algebra']) {
      expect(html.includes(`/img/${old}.png`), old).toBe(false)
    }
    // Nothing is left in the folder that the page does not show.
    expect(readdirSync(join(publicDir, 'img')).sort()).toEqual([...new Set(imgs.map((i) => i.src!.replace('/img/', '')))].sort())
  })

  it('are files in the folder, and real PNG files, with the shape the page gives them', () => {
    for (const i of imgs) {
      const file = join(publicDir, i.src!)
      expect(existsSync(file), `${i.src} is missing`).toBe(true)
      const bytes = readFileSync(file)
      expect(bytes.subarray(0, 8).toString('hex'), `${i.src} is not a PNG`).toBe('89504e470d0a1a0a')
      // The size is in the first chunk (IHDR): width and height, four bytes each. A phone capture may be 2x: the shape must be the same.
      const shape = bytes.readUInt32BE(16) / bytes.readUInt32BE(20)
      expect(Math.abs(shape / (Number(i.width) / Number(i.height)) - 1), `${i.src} is not the shape ${i.width}x${i.height}`).toBeLessThan(0.01)
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

  it('is static files at getjemma.ainative.ventures, with one small script for the home page', () => {
    expect(config.name).toBe('jemma-landing')
    expect(config.compatibility_date).toBe('2026-10-01')
    // The script runs only for the home page, to show visitors in the US
    // the US words and prices. Every other file is served as it is.
    expect(config.assets).toEqual({ directory: './public', binding: 'ASSETS', run_worker_first: ['/', '/index.html'] })
    expect(config.main).toBe('src/worker.js')
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
