// @vitest-environment node
import { existsSync, globSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

// P98: the landing page at "/". Its sections, headings, words, links (with their addresses) and pictures, drawn with react-dom/server:
// no server, no browser, no database. The sections are separate components so the page can be restyled later without changing its structure.

import { LandingPage } from '../app/_landing/LandingPage'
import { Hero } from '../app/_landing/Hero'
import { HowItWorks } from '../app/_landing/HowItWorks'
import { Audiences } from '../app/_landing/Audiences'
import { Rules } from '../app/_landing/Rules'
import { Footer } from '../app/_landing/Footer'

const webRoot = resolve(import.meta.dirname, '..')

/** The words of a piece of markup: tags gone, entities decoded, spaces collapsed. */
const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
const all = (html: string, tag: string) => [...html.matchAll(new RegExp(`<${tag}(?=[\\s>])[^>]*>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) => words(m[1]!))
const links = (html: string) => [...html.matchAll(/<a ([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({ href: /href="([^"]*)"/.exec(m[1]!)![1]!, text: words(m[2]!), attrs: m[1]! }))
const images = (html: string) =>
  [...html.matchAll(/<img ([^>]*?)\/?>/g)].map((m) => {
    const get = (name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(` ${m[1]}`)?.[1]
    return { src: get('src')!, alt: words(get('alt') ?? ''), width: Number(get('width')), height: Number(get('height')), loading: get('loading') }
  })
const section = (html: string, heading: string) => {
  const at = html.indexOf(`>${heading}</h2>`)
  expect(at, `the section "${heading}"`).toBeGreaterThan(0)
  const start = html.lastIndexOf('<section', at)
  return html.slice(start, html.indexOf('</section>', at))
}

const page = renderToStaticMarkup(<LandingPage />)

describe('the hero', () => {
  const hero = renderToStaticMarkup(<Hero />)

  it('has the wordmark, the one h1 and one sentence under it', () => {
    expect(hero).toContain('aria-label="jemma"')
    expect(all(hero, 'h1')).toEqual(['Follows one learner across years, not one term.'])
    expect(words(hero)).toContain('Jemma reads class tests from a photo, finds what each learner is missing, and gives them a short lesson to practise at home.')
    expect(all(page, 'h1')).toHaveLength(1)
  })

  it('has "Try the demo" going to /demo and "Sign in" going to /sign-in', () => {
    expect(links(hero).map(({ href, text }) => [text, href])).toEqual([
      ['Try the demo', '/demo'],
      ['Sign in', '/sign-in'],
    ])
  })

  it('says every learner in the demo is made up', () => {
    expect(words(hero)).toContain('Every learner in the demo is made up.')
  })

  it('has one phone screenshot, loaded at once (not lazily)', () => {
    const shots = images(hero)
    expect(shots).toHaveLength(1)
    expect(shots[0]!.loading).not.toBe('lazy')
    expect(shots[0]!.alt).toMatch(/Amina/)
  })
})

describe('how it works', () => {
  const how = renderToStaticMarkup(<HowItWorks />)

  it('is a section with its heading and three numbered steps in plain words', () => {
    expect(all(how, 'h2')).toEqual(['How it works'])
    expect(all(how, 'h3')).toEqual([
      'A teacher snaps a class test.',
      'Jemma reads it, code marks it, and finds the gaps.',
      'Each learner gets a short lesson for tonight, on screen or on paper.',
    ])
    expect(how.match(/<ol[\s>]/g)).toHaveLength(1)
    expect(all(how, 'li')).toHaveLength(3)
  })

  it('says what Jemma teaches, as it is', () => {
    expect(words(how)).toContain('Jemma teaches Mathematics for Grades 1 to 12, with the South African CAPS curriculum built in.')
  })
})

describe('who it is for', () => {
  const who = renderToStaticMarkup(<Audiences />)

  it('has three cards: learners, parents and teachers', () => {
    expect(all(who, 'h2')).toEqual(['Who it is for'])
    expect(all(who, 'h3')).toEqual(['For learners', 'For parents', 'For teachers'])
    expect(who.match(/<article[\s>]/g)).toHaveLength(3)
  })

  it('each card has 2 to 3 short lines and one screenshot with real alt text, loaded lazily with its size set', () => {
    for (const card of who.split('<article').slice(1)) {
      const lines = all(card, 'li')
      expect(lines.length).toBeGreaterThanOrEqual(2)
      expect(lines.length).toBeLessThanOrEqual(3)
      for (const line of lines) expect(line.length, line).toBeLessThanOrEqual(100)
      const shots = images(card)
      expect(shots).toHaveLength(1)
      expect(shots[0]!.loading).toBe('lazy')
      expect(shots[0]!.alt.length).toBeGreaterThan(40)
      expect(shots[0]!.width).toBeGreaterThan(0)
      expect(shots[0]!.height).toBeGreaterThan(0)
    }
  })

  it('the learner card says what a learner can do', () => {
    const card = who.split('<article')[1]!
    expect(all(card, 'li')).toEqual([
      'Switch between My school and My own, and practise any grade from 1 to 12.',
      'Answer on the screen, or on paper with one photo.',
      'Add a marked test of your own. Jemma reads it from a photo.',
    ])
  })

  it('the parent card says what a parent sees and does', () => {
    const card = who.split('<article')[2]!
    expect(all(card, 'li')).toEqual([
      'See your child\'s results once the teacher shares them.',
      'Practise at home with your child.',
      'You see nothing about a child until the teacher says yes to your link.',
    ])
  })

  it('the teacher card says what a teacher gets, and no more than the product does', () => {
    const card = who.split('<article')[3]!
    expect(all(card, 'li')).toEqual([
      'Snap a class test. Code marks it and shows the gaps of the whole class.',
      'The Long view shows what held for three terms or more, so you can raise it with the family.',
      'You approve the topic map, the answer key and every Long view pattern.',
    ])
  })
})

describe('the rules it keeps', () => {
  const rules = renderToStaticMarkup(<Rules />)

  it('has its heading and four rules', () => {
    expect(all(rules, 'h2')).toEqual(['The rules it keeps'])
    expect(all(rules, 'h3')).toEqual(['A profile, never a label.', 'Every claim has a source.', 'The teacher goes first.', 'Never ranked against classmates.'])
    expect(all(rules, 'li')).toHaveLength(4)
  })

  it('says each one as the README does', () => {
    const text = words(rules)
    expect(text).toContain('Jemma shows a pattern, like fractions staying low for three terms. It never gives a child a track, a path or a career.')
    expect(text).toContain('Each pattern lists the tests and notes it comes from, and a teacher can open each one.')
    expect(text).toContain('Results and Long view patterns reach a family only after the teacher says yes.')
    expect(text).toContain('A learner is never compared with a classmate, and never sees a rank.')
  })
})

describe('the footer', () => {
  const footer = renderToStaticMarkup(<Footer />)

  it('names the challenge and the licence', () => {
    expect(words(footer)).toContain('Built for the African Agentic AI Design Challenge, Education track.')
    expect(words(footer)).toContain('Open source under the MIT licence.')
  })

  it('has every link, with its address', () => {
    expect(links(footer).map(({ text, href }) => [text, href])).toEqual([
      ['Try the demo', '/demo'],
      ['Sign in', '/sign-in'],
      ['Start', '/sign-up'],
      ['Privacy', '/privacy'],
      ['Help', '/help'],
      ['Source on GitHub', 'https://github.com/AI-Native-Ventures/jemma'],
    ])
  })

  it('opens the source in a new tab without handing over the window', () => {
    const source = links(footer).find((l) => l.text === 'Source on GitHub')!
    expect(source.attrs).toContain('target="_blank"')
    expect(source.attrs).toContain('rel="noopener noreferrer"')
  })
})

describe('the whole page', () => {
  it('has its parts in order, inside one main and one footer', () => {
    const at = (s: string) => page.indexOf(s)
    expect(page.match(/<main[\s>]/g)).toHaveLength(1)
    expect(page.match(/<footer[\s>]/g)).toHaveLength(1)
    expect(all(page, 'h2')).toEqual(['How it works', 'Who it is for', 'The rules it keeps'])
    expect(at('Follows one learner')).toBeLessThan(at('>How it works<'))
    expect(at('>How it works<')).toBeLessThan(at('>Who it is for<'))
    expect(at('>Who it is for<')).toBeLessThan(at('>The rules it keeps<'))
    expect(at('>The rules it keeps<')).toBeLessThan(at('<footer'))
  })

  it('every section is labelled by its heading', () => {
    for (const heading of ['How it works', 'Who it is for', 'The rules it keeps']) {
      const html = section(page, heading)
      const labelled = /aria-labelledby="([^"]+)"/.exec(html)![1]!
      expect(html).toContain(`id="${labelled}"`)
    }
  })

  it('the scaffold placeholder is gone', () => {
    expect(page).not.toMatch(/scaffold/i)
    expect(page).not.toContain('Screens arrive in later packets')
  })

  it('has no em dash', () => {
    expect(page).not.toContain(String.fromCharCode(0x2014))
  })

  it('adds nothing to the head of the document: no meta, title, style, script or base tag (the title and description come from the page metadata), and the one link React adds is the preload of the hero picture', () => {
    expect(page).not.toMatch(/<(meta|title|style|script|base)[\s>/]/)
    expect([...page.matchAll(/<link [^>]*>/g)].map((m) => m[0])).toEqual(['<link rel="preload" as="image" href="/landing/learner-my-own.png"/>'])
  })

  it('every link on the page goes to a page that exists in this app (or to GitHub)', () => {
    for (const { href } of links(page)) {
      if (href.startsWith('https://')) {
        expect(href).toBe('https://github.com/AI-Native-Ventures/jemma')
        continue
      }
      const found = globSync(`app/**/${href.slice(1)}/page.tsx`, { cwd: webRoot }).filter((f) => f.replace(/\(\w+\)\//g, '') === `app${href}/page.tsx`)
      expect(found, `a page for ${href}`).not.toEqual([])
    }
  })

  it('the four screenshots are the four files of public/landing, each used once', () => {
    const shots = images(page).map((i) => i.src)
    expect(shots).toEqual(['/landing/learner-my-own.png', '/landing/learner-marked-test.png', '/landing/parent-profile.png', '/landing/teacher-long-view.png'])
  })
})

describe('the pictures', () => {
  /** The real width and height of a PNG, from its header. */
  const pngSize = (file: string) => {
    const bytes = readFileSync(file)
    expect(bytes.subarray(1, 4).toString('latin1'), `${file} is a PNG`).toBe('PNG')
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
  }

  it('each file exists, and the width and height written on the image are its real size', () => {
    for (const shot of images(page)) {
      const file = join(webRoot, 'public', shot.src)
      expect(existsSync(file), shot.src).toBe(true)
      expect({ width: shot.width, height: shot.height }, shot.src).toEqual(pngSize(file))
    }
  })

  it('every image has alt text that says what is on the screen, and that it is a phone screen', () => {
    for (const shot of images(page)) {
      expect(shot.alt.split(' ').length, shot.alt).toBeGreaterThanOrEqual(8)
      expect(shot.alt).toMatch(/phone/i)
    }
  })

  it('only the hero loads at once: every other image is lazy', () => {
    const [hero, ...rest] = images(page)
    expect(hero!.loading).not.toBe('lazy')
    expect(rest.map((i) => i.loading)).toEqual(['lazy', 'lazy', 'lazy'])
  })
})
