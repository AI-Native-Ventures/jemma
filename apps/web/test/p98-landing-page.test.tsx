// @vitest-environment node
import { existsSync, globSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

// P98: the landing page at "/". Its sections, headings, words, links (with their addresses) and pictures, drawn with react-dom/server:
// no server, no browser, no database. The sections are separate components so the page can be restyled later without changing its structure.
// 23 Nov 2026: the page talks to a learner now ("Learn maths until you understand it."), with the words, the sections and the pictures of the
// approved design, the same as the live site (apps/landing, test p101-landing-site).

import { LandingPage } from '../app/_landing/LandingPage'
import { Header } from '../app/_landing/Header'
import { Hero } from '../app/_landing/Hero'
import { HowItWorks } from '../app/_landing/HowItWorks'
import { WhyHard } from '../app/_landing/WhyHard'
import { Maths } from '../app/_landing/Maths'
import { Audiences } from '../app/_landing/Audiences'
import { Plans } from '../app/_landing/Plans'
import { Rules } from '../app/_landing/Rules'
import { Closing } from '../app/_landing/Closing'
import { Footer } from '../app/_landing/Footer'

const webRoot = resolve(import.meta.dirname, '..')
const GITHUB = 'https://github.com/AI-Native-Ventures/jemma'

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
    return { src: get('src')!, alt: words(get('alt') ?? ''), width: Number(get('width')), height: Number(get('height')), loading: get('loading'), decoding: get('decoding') }
  })
/** The headings of a piece of markup, in order, each with its level. */
const outline = (html: string) => [...html.matchAll(/<h([123])(?=[\s>])[^>]*>([\s\S]*?)<\/h\1>/g)].map((m) => `h${m[1]} ${words(m[2]!)}`)

const page = renderToStaticMarkup(<LandingPage />)

// The eleven pictures of the page, in order, as the page writes them: the address, the size it is shown at and what is on the screen.
// The words of each alt are the ones of the live site (apps/landing/public/index.html), word for word. Amina is called by name in them, never
// "she": no screen of the app says "she" or "he" of a person (test p99b-no-gendered-words), and the live site keeps the same rule (test p101-landing-site).
const PICTURES = [
  { src: '/landing/results.png', width: 390, height: 844, alt: "Amina's results on Jemma: Amina finished, and the one answer Amina missed is explained step by step." },
  { src: '/landing/step-learn.png', width: 390, height: 844, alt: 'A lesson for Amina on adding and subtracting fractions: Amina can listen to it or read along.' },
  { src: '/landing/step-try.png', width: 390, height: 844, alt: 'Question 1 of 5: what is one half plus one quarter?' },
  { src: '/landing/results.png', width: 390, height: 844, alt: "Amina's results: the answer Amina missed, why, and the right way." },
  { src: '/landing/step-learn-again.png', width: 390, height: 844, alt: 'Amina moved adding fractions from New to Practising.' },
  { src: '/landing/maths-fractions.png', width: 374, height: 406, alt: 'A fractions question: what is one half plus one quarter?' },
  { src: '/landing/maths-graphs.png', width: 374, height: 406, alt: 'A lesson on straight-line graphs, with the graph drawn.' },
  { src: '/landing/maths-trigonometry.png', width: 374, height: 406, alt: 'A lesson on trigonometry in right triangles, with the triangle drawn.' },
  { src: '/landing/maths-algebra.png', width: 374, height: 406, alt: 'A lesson on algebraic expressions, drawn as a rectangle.' },
  { src: '/landing/parent-marks.png', width: 390, height: 844, alt: "A parent's view of a child's tests and marks." },
  { src: '/landing/class-topics.png', width: 390, height: 860, alt: "A teacher's list of what the class doesn't get yet, topic by topic." },
]
/** The phone captures saved at twice the size they are shown at. Every other picture is shown at its real size. */
const TWICE = ['/landing/step-learn.png', '/landing/step-learn-again.png', '/landing/class-topics.png']

describe('the header', () => {
  const header = renderToStaticMarkup(<Header />)

  it('has the wordmark and "Sign in" going to /sign-in', () => {
    expect(header).toMatch(/^<header[\s>]/)
    expect(header).toContain('aria-label="jemma"')
    expect(links(header).map(({ href, text }) => [text, href])).toEqual([['Sign in', '/sign-in']])
  })
})

describe('the hero', () => {
  const hero = renderToStaticMarkup(<Hero />)

  it('has the small chip, the one h1 and one sentence under it', () => {
    expect(words(hero).startsWith('Maths · Grade 1 to 12 Learn maths until you understand it. Jemma teaches you a short lesson,')).toBe(true)
    expect(all(hero, 'h1')).toEqual(['Learn maths until you understand it.'])
    expect(words(hero)).toContain('Jemma teaches you a short lesson, marks your answers, and teaches again what you got wrong. Every lesson is free.')
    expect(all(page, 'h1')).toHaveLength(1)
  })

  it('has "Try a lesson" going to /tour and "Sign in" going to /sign-in', () => {
    expect(links(hero).map(({ href, text }) => [text, href])).toEqual([
      ['Try a lesson', '/tour'],
      ['Sign in', '/sign-in'],
    ])
  })

  it('"Try a lesson" is the one gold button, with black words on it, and "Sign in" is the outline button', () => {
    const [lesson, signIn] = links(hero)
    expect(lesson!.attrs).toContain('bg-gold text-ink')
    expect(signIn!.attrs).toContain('border-ink bg-card text-ink')
    expect(signIn!.attrs).not.toContain('bg-gold')
  })

  it('says no sign-up is needed, right after the buttons', () => {
    expect(words(hero)).toContain('Try a lesson Sign in No sign-up needed.')
  })

  it('has one phone screenshot, loaded at once (not lazily)', () => {
    const shots = images(hero)
    expect(shots).toHaveLength(1)
    expect(shots[0]!.loading).not.toBe('lazy')
    expect(shots[0]!.alt).toMatch(/Amina/)
    expect(shots[0]!.alt).toBe(PICTURES[0]!.alt)
  })

  it('pins a small card to the phone: what Amina is working on and the three states of the app. It is decoration, kept from a screen reader, and shown at every width', () => {
    const card = /<div aria-hidden="true" class="([^"]*)">([\s\S]*?)<\/div>/.exec(hero)!
    expect(words(card[2]!)).toBe('Amina is working on Adding fractions New Practising Fixed')
    // Since 23 Nov the whole phone and its card show at every width (the owner: "the full image doesn't show on the hero").
    expect(card[1]!.split(' ')).not.toContain('hidden')
    expect(hero).toMatch(/h-\[calc\(var\(--phone\)\*2\.3\)\]/)
    expect(hero).not.toMatch(/1\.165/)
  })
})

describe('how it works', () => {
  const how = renderToStaticMarkup(<HowItWorks />)

  it('is a section with its heading and four numbered steps in plain words', () => {
    expect(all(how, 'h2')).toEqual(['How it works'])
    expect(all(how, 'h3')).toEqual(['Learn', 'Try', 'Jemma marks it', 'Learn it again'])
    expect(how.match(/<ol[\s>]/g)).toHaveLength(1)
    expect(all(how, 'li')).toEqual([
      '1 Learn A short lesson. Read it, see it in pictures, or listen.',
      '2 Try Answer the questions. Type them, or snap your paper.',
      '3 Jemma marks it You see what you got wrong, and why.',
      '4 Learn it again Jemma teaches that part again. Practise until you get it right.',
    ])
  })

  it('each step has one phone screenshot, loaded lazily, in a tray that cuts it off', () => {
    const steps = how.split('<li').slice(1)
    expect(steps).toHaveLength(4)
    steps.forEach((step, i) => {
      const shots = images(step)
      expect(shots).toHaveLength(1)
      expect(shots[0]!.loading).toBe('lazy')
      expect({ src: shots[0]!.src, alt: shots[0]!.alt }).toEqual({ src: PICTURES[i + 1]!.src, alt: PICTURES[i + 1]!.alt })
      // the tray: a fixed height and nothing drawn outside it, and the picture is before the words of the step
      const tray = /<div class="([^"]*)">/.exec(step)![1]!.split(' ')
      expect(tray).toEqual(expect.arrayContaining(['h-[250px]', 'overflow-hidden']))
      expect(step.indexOf('<img')).toBeLessThan(step.indexOf('<h3'))
    })
  })

  it('says what to do with a test from school, in one soft gold line with a camera', () => {
    const line = /<p class="([^"]*)">(<svg[\s\S]*?<\/svg>)([\s\S]*?)<\/p>/.exec(how)!
    expect(words(line[3]!)).toBe('Got a test back from school? Snap it. Jemma finds what to practise.')
    expect(line[1]!.split(' ')).toContain('bg-gold-tint')
    expect(line[2]).toContain('aria-hidden="true"')
    expect(how.indexOf('Got a test back from school?')).toBeGreaterThan(how.indexOf('</ol>'))
  })
})

describe('why maths gets hard', () => {
  const hard = renderToStaticMarkup(<WhyHard />)

  it('is a green-tint band with its chip, its heading and one sentence', () => {
    expect(hard).toMatch(/^<section [^>]*class="bg-green-tint"/)
    expect(all(hard, 'h2')).toEqual(['Miss one step, and the next is hard.'])
    expect(words(hard).startsWith('Why maths gets hard Miss one step, and the next is hard. You are not bad at maths. Jemma teaches again the step you missed.')).toBe(true)
  })

  it('has three cards, from the missed step to the years after it', () => {
    expect(all(hard, 'h3')).toEqual(['Fractions', 'Algebra', 'Trigonometry and calculus'])
    expect(all(hard, 'li')).toEqual([
      'Grade 4 to 6 missed Fractions You miss adding fractions.',
      'Grade 7 to 9 Algebra So equations with fractions go wrong.',
      'Grade 10 to 12 Trigonometry and calculus Then these get hard too.',
    ])
  })

  it('only the first card is the missed one: a red edge and a red chip, in the red that can be read', () => {
    const cards = [...hard.matchAll(/<li class="([^"]*)">([\s\S]*?)<\/li>/g)].map((m) => ({ classes: m[1]!.split(' '), html: m[2]! }))
    expect(cards.map((c) => c.classes.includes('border-red'))).toEqual([true, false, false])
    expect(cards.map((c) => c.html.includes('>missed<'))).toEqual([true, false, false])
    const chip = /<span class="([^"]*)">missed<\/span>/.exec(cards[0]!.html)![1]!.split(' ')
    expect(chip).toEqual(expect.arrayContaining(['border-red', 'text-red-text']))
  })
})

describe('maths for every grade', () => {
  const maths = renderToStaticMarkup(<Maths />)

  it('has its heading and one sentence', () => {
    expect(all(maths, 'h2')).toEqual(['Maths for Grade 1 to Grade 12.'])
    expect(words(maths)).toContain('Maths for Grade 1 to Grade 12. CAPS is built in. Lessons draw the diagrams, graphs and shapes.')
  })

  it('has four small tiles, each with its name and one picture loaded lazily, and eight topics', () => {
    const [tiles, topics] = [...maths.matchAll(/<ul[^>]*>([\s\S]*?)<\/ul>/g)].map((m) => m[1]!)
    expect(all(tiles!, 'li')).toEqual(['Fractions', 'Graphs', 'Trigonometry', 'Algebra'])
    expect(images(tiles!).map(({ src, alt, loading }) => ({ src, alt, loading }))).toEqual(PICTURES.slice(5, 9).map(({ src, alt }) => ({ src, alt, loading: 'lazy' })))
    expect(all(topics!, 'li')).toEqual(['Numbers', 'Fractions', 'Algebra', 'Functions and graphs', 'Geometry', 'Trigonometry', 'Data handling', 'Financial maths'])
    expect(images(topics!)).toEqual([])
  })
})

describe('add a parent, join your class', () => {
  const who = renderToStaticMarkup(<Audiences />)

  it('has two big cards: parents and schools', () => {
    expect(all(who, 'h2')).toEqual(['Add a parent. Join your class.'])
    expect(all(who, 'h3')).toEqual(['For parents', 'For schools'])
    expect(who.match(/<article[\s>]/g)).toHaveLength(2)
  })

  it('each card has three short lines and one screenshot with real alt text, loaded lazily with its size set, in a tray that cuts it off', () => {
    const cards = who.split('<article').slice(1)
    cards.forEach((card, i) => {
      const lines = all(card, 'li')
      expect(lines).toHaveLength(3)
      for (const line of lines) expect(line.length, line).toBeLessThanOrEqual(100)
      const shots = images(card)
      expect(shots).toHaveLength(1)
      expect(shots[0]!.loading).toBe('lazy')
      expect(shots[0]!.alt.length).toBeGreaterThan(40)
      expect(shots[0]!.width).toBeGreaterThan(0)
      expect(shots[0]!.height).toBeGreaterThan(0)
      expect({ src: shots[0]!.src, alt: shots[0]!.alt }).toEqual({ src: PICTURES[9 + i]!.src, alt: PICTURES[9 + i]!.alt })
      const tray = [...card.matchAll(/<div class="([^"]*)">/g)].map((m) => m[1]!.split(' ')).find((classes) => classes.includes('overflow-hidden'))
      expect(tray).toEqual(expect.arrayContaining(['h-[270px]', 'overflow-hidden']))
    })
  })

  it('each card is labelled by its heading', () => {
    for (const card of who.split('<article').slice(1)) {
      const labelled = /aria-labelledby="([^"]+)"/.exec(card)![1]!
      expect(card).toContain(`<h3 id="${labelled}"`)
    }
  })

  it('the parent card says what a parent sees and does', () => {
    const card = who.split('<article')[1]!
    expect(all(card, 'li')).toEqual(['See where your child loses marks.', 'Snap homework. Jemma marks it.', 'Practise at home together.'])
  })

  it('the school card says what a school gets, and no more than the product does', () => {
    const card = who.split('<article')[2]!
    expect(all(card, 'li')).toEqual(['Marks from a photo of a class test.', "See what the class doesn't get yet.", 'The teacher approves the answer key first.'])
  })
})

describe('the plans', () => {
  const plans = renderToStaticMarkup(<Plans />)

  it('has its heading and one sentence', () => {
    expect(all(plans, 'h2')).toEqual(['Free to learn. Plans to practise.'])
    expect(words(plans)).toContain('Free to learn. Plans to practise. Every lesson is free, always. A plan gives you more practice.')
  })

  it('shows the four plans by the year in dollars', () => {
    expect(all(plans, 'h3')).toEqual(['Free', 'Light', 'Regular', 'Heavy'])
    expect(all(plans, 'li')).toEqual([
      '$0 always Free 2 practices a day every lesson, always',
      '$48 a year Light 150 practices a month about 5 a day',
      '$96 a year Regular 300 practices a month about 10 a day',
      '$192 a year Heavy 600 practices a month about 20 a day',
    ])
  })

  it('says the family price, and that paid plans are not open yet', () => {
    expect(words(plans).endsWith('about 20 a day Family: 20% off for two or more learners. Paid plans are not open yet. For now, practice is free.')).toBe(true)
  })

  it('never writes white words on gold: the price of a paid plan is black on gold', () => {
    const rings = [...plans.matchAll(/<span class="([^"]*rounded-full[^"]*)">/g)].map((m) => m[1]!.split(' '))
    expect(rings).toHaveLength(4)
    expect(rings.map((r) => (r.includes('bg-gold') ? 'gold' : r.includes('bg-gold-tint') ? 'tint' : 'none'))).toEqual(['tint', 'gold', 'gold', 'gold'])
    for (const ring of rings) expect(ring.some((c) => c.startsWith('text-white'))).toBe(false)
  })
})

describe('the rules it keeps', () => {
  const rules = renderToStaticMarkup(<Rules />)

  it('has its heading and three rules', () => {
    expect(all(rules, 'h2')).toEqual(['The rules it keeps'])
    expect(all(rules, 'h3')).toEqual([])
    expect(all(rules, 'li')).toEqual(['Jemma never calls you slow or weak.', 'You are never ranked against your class.', 'Your own practice never goes to your school.'])
  })

  it('says each one in a learner\'s own words', () => {
    expect(words(rules)).toBe('The rules it keeps Jemma never calls you slow or weak. You are never ranked against your class. Your own practice never goes to your school.')
  })
})

describe('the green band at the end', () => {
  const closing = renderToStaticMarkup(<Closing />)

  it('is a green band with white words: the heading and that no sign-up is needed', () => {
    expect(/^<section [^>]*class="([^"]*)"/.exec(closing)![1]!.split(' ')).toEqual(expect.arrayContaining(['bg-green', 'text-white']))
    expect(all(closing, 'h2')).toEqual(['Try a lesson now.'])
    expect(words(closing)).toBe('Try a lesson now. No sign-up needed. Try a lesson Sign in')
  })

  it('has the same two buttons as the first screen, to the same addresses', () => {
    expect(links(closing).map(({ href, text }) => [text, href])).toEqual([
      ['Try a lesson', '/tour'],
      ['Sign in', '/sign-in'],
    ])
    expect(links(closing)[0]!.attrs).toContain('bg-gold text-ink')
  })
})

describe('the footer', () => {
  const footer = renderToStaticMarkup(<Footer />)

  it('has the wordmark, and says what Jemma teaches, the licence, and that every learner shown is made up', () => {
    expect(footer).toContain('aria-label="jemma"')
    expect(words(footer)).toContain('Mathematics, CAPS Grades 1 to 12. MIT licence. Every learner shown here is made up.')
  })

  it('has every link, with its address', () => {
    expect(links(footer).map(({ text, href }) => [text, href])).toEqual([
      ['Start', '/sign-up'],
      ['Privacy', '/privacy'],
      ['Help', '/help'],
      ['Source on GitHub', GITHUB],
    ])
  })

  it('opens the source in a new tab without handing over the window', () => {
    const source = links(footer).find((l) => l.text === 'Source on GitHub')!
    expect(source.attrs).toContain('target="_blank"')
    expect(source.attrs).toContain('rel="noopener noreferrer"')
  })
})

describe('the whole page', () => {
  it('has its parts in order, inside one header, one main and one footer', () => {
    const at = (s: string) => page.indexOf(s)
    expect(page.match(/<header[\s>]/g)).toHaveLength(1)
    expect(page.match(/<main[\s>]/g)).toHaveLength(1)
    expect(page.match(/<footer[\s>]/g)).toHaveLength(1)
    expect(all(page, 'h2')).toEqual([
      'How it works',
      'Miss one step, and the next is hard.',
      'Maths for Grade 1 to Grade 12.',
      'Add a parent. Join your class.',
      'Free to learn. Plans to practise.',
      'The rules it keeps',
      'Try a lesson now.',
    ])
    expect(at('<header')).toBeLessThan(at('<main'))
    expect(at('<main')).toBeLessThan(at('<h1'))
    expect(at('<h1')).toBeLessThan(at('<h2'))
    expect(at('>Try a lesson now.<')).toBeLessThan(at('</main>'))
    expect(at('</main>')).toBeLessThan(at('<footer'))
  })

  it('has every heading of the approved page, in its order', () => {
    expect(outline(page)).toEqual([
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

  it('is its sections put together, in order, with nothing between them', () => {
    const parts = [<Hero key="1" />, <HowItWorks key="2" />, <WhyHard key="3" />, <Maths key="4" />, <Audiences key="5" />, <Plans key="6" />, <Rules key="7" />, <Closing key="8" />]
    const main = /<main>([\s\S]*)<\/main>/.exec(page)![1]!
    // React writes the preload of the hero picture at the top of what it draws: it is not part of a section
    const drawn = (html: string) => html.replace(/<link [^>]*>/g, '')
    expect(main).toBe(parts.map((part) => drawn(renderToStaticMarkup(part))).join(''))
    expect(page.indexOf(renderToStaticMarkup(<Header />))).toBeGreaterThan(0)
    expect(page.endsWith(`${renderToStaticMarkup(<Footer />)}</div>`)).toBe(true)
  })

  it('every section is labelled by its heading', () => {
    const sections = [...page.matchAll(/<section[\s\S]*?<\/section>/g)].map((m) => m[0])
    expect(sections).toHaveLength(8)
    for (const html of sections) {
      const labelled = /^<section aria-labelledby="([^"]+)"/.exec(html)![1]!
      expect(html).toMatch(new RegExp(`<h[12] id="${labelled}"`))
    }
    const ids = [...page.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!)
    expect(new Set(ids).size, 'every id is used once').toBe(ids.length)
  })

  it('the scaffold placeholder is gone', () => {
    expect(page).not.toMatch(/scaffold/i)
    expect(page).not.toContain('Screens arrive in later packets')
  })

  it('has no em dash and no en dash', () => {
    expect(page).not.toContain(String.fromCharCode(0x2014))
    expect(page).not.toContain(String.fromCharCode(0x2013))
  })

  it('the words of the page before this one are gone: no "gap", no Long view, no demo, no "Who it is for", and nothing for a learner or a teacher by that name', () => {
    // what a person reads or hears: the words, the text of each picture and each label for a screen reader
    const read = [words(page), ...images(page).map((i) => i.alt), ...[...page.matchAll(/aria-label="([^"]*)"/g)].map((m) => words(m[1]!))].join(' | ')
    for (const gone of [/\bgaps?\b/i, /long view/i, /\bdemo\b/i, /across years/i, /who it(\u2019|'| i)s for/i, /for learners/i, /for teachers/i, /design challenge/i]) expect(read).not.toMatch(gone)
    // and no address of the page says "gap" either
    expect(page).not.toMatch(/gap[s]?\.png/)
  })

  it('never says "she" or "he" of a person: Amina is called by name', () => {
    const read = [words(page), ...images(page).map((i) => i.alt)].join(' | ')
    expect(read).not.toMatch(/\b(she|her|hers|herself|he|him|his|himself)\b/i)
  })

  it('is the light theme only', () => {
    expect(page).not.toMatch(/\bdark:/)
  })

  it('adds nothing to the head of the document: no meta, title, style, script or base tag (the title and description come from the page metadata), and the one link React adds is the preload of the hero picture', () => {
    expect(page).not.toMatch(/<(meta|title|style|script|base)[\s>/]/)
    expect([...page.matchAll(/<link [^>]*>/g)].map((m) => m[0])).toEqual(['<link rel="preload" as="image" href="/landing/results.png"/>'])
  })

  it('every link on the page goes to a page that exists in this app (or to GitHub)', () => {
    for (const { href } of links(page)) {
      if (href.startsWith('https://')) {
        expect(href).toBe(GITHUB)
        continue
      }
      const found = globSync(`app/**/${href.slice(1)}/page.tsx`, { cwd: webRoot }).filter((f) => f.replace(/\(\w+\)\//g, '') === `app${href}/page.tsx`)
      expect(found, `a page for ${href}`).not.toEqual([])
    }
  })

  it('each label goes to its own address, and is on the page as often as the design has it', () => {
    const want: Record<string, string> = { 'Try a lesson': '/tour', 'Sign in': '/sign-in', Start: '/sign-up', Privacy: '/privacy', Help: '/help', 'Source on GitHub': GITHUB }
    for (const l of links(page)) expect(want[l.text], `a link the page does not know: "${l.text}"`).toBe(l.href)
    const count = (label: string) => links(page).filter((l) => l.text === label).length
    expect(count('Try a lesson')).toBe(2)
    expect(count('Sign in')).toBe(3)
    for (const once of ['Start', 'Privacy', 'Help', 'Source on GitHub']) expect(count(once), once).toBe(1)
  })

  it('every link is at least 44 px high: it has a least height of 44 px (min-h-11) or more', () => {
    for (const l of links(page)) {
      const least = /class="([^"]*)"/.exec(l.attrs)![1]!.split(' ').filter((c) => /^min-h-/.test(c))
      expect(least.length, l.text).toBeGreaterThan(0)
      expect(least.every((c) => c === 'min-h-11' || c === 'min-h-[58px]'), `${l.text}: ${least.join(' ')}`).toBe(true)
    }
  })

  it('the eleven screenshots are the ten files of public/landing, in the order of the page (the results screen is shown twice: the hero and step 3)', () => {
    expect(images(page).map((i) => i.src)).toEqual(PICTURES.map((p) => p.src))
    // nothing is left in the folder that the page does not show
    expect(readdirSync(join(webRoot, 'public/landing')).sort()).toEqual([...new Set(PICTURES.map((p) => p.src.replace('/landing/', '')))].sort())
    expect(new Set(PICTURES.map((p) => p.src)).size).toBe(10)
  })
})

describe('the pictures', () => {
  /** The real width and height of a PNG, from its header. */
  const pngSize = (file: string) => {
    const bytes = readFileSync(file)
    expect(bytes.subarray(1, 4).toString('latin1'), `${file} is a PNG`).toBe('PNG')
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
  }

  it('each file exists, and the width and height written on the image are its real size (half of it for a phone capture saved at twice the size)', () => {
    for (const shot of images(page)) {
      const file = join(webRoot, 'public', shot.src)
      expect(existsSync(file), shot.src).toBe(true)
      const times = TWICE.includes(shot.src) ? 2 : 1
      expect({ width: shot.width * times, height: shot.height * times }, shot.src).toEqual(pngSize(file))
    }
    for (const src of TWICE) expect(images(page).some((i) => i.src === src), src).toBe(true)
  })

  it('each picture is written at the size the design shows it at', () => {
    expect(images(page).map(({ src, width, height }) => ({ src, width, height }))).toEqual(PICTURES.map(({ src, width, height }) => ({ src, width, height })))
  })

  it('every image has alt text that says what is on the screen, and no two say the same', () => {
    expect(images(page).map((i) => i.alt)).toEqual(PICTURES.map((p) => p.alt))
    for (const shot of images(page)) expect(shot.alt.split(' ').length, shot.alt).toBeGreaterThanOrEqual(8)
    expect(new Set(images(page).map((i) => i.alt)).size).toBe(11)
  })

  it('only the hero loads at once: every other image is lazy, and every image is decoded off the main thread', () => {
    const [hero, ...rest] = images(page)
    expect(hero!.loading).not.toBe('lazy')
    expect(rest.map((i) => i.loading)).toEqual(Array.from({ length: 10 }, () => 'lazy'))
    for (const shot of images(page)) expect(shot.decoding, shot.src).toBe('async')
  })
})
