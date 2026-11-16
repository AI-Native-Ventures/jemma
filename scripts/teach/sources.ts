import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { TeachingSource } from '@jemma/profiling/schemas'
import { REPO_ROOT, loadCapsFile, type TopicGroup } from './topics'

/**
 * The reference a lesson writer is given: a Siyavula chapter (CC BY 3.0, Grades 7 to 12 only: the reader has no Grades 1 to 6 maths book) or, when
 * there is none, what CAPS says about the topic (its name, content area, term and neighbours). Pages are fetched once, as text, and cached under
 * content/reference (git-ignored). A page without the Creative Commons Attribution line is never used. Videos and simulations are never read.
 */

export const SIYAVULA = 'https://www.siyavula.com'
export const REFERENCE_CAP = 24_000
export const CAPS_CREDIT = 'Follows the CAPS Mathematics curriculum, Department of Basic Education'
export const LICENCE_LINE = 'All Siyavula textbook content made available on this site is released under the terms of a Creative Commons Attribution License'

export type Section = { id: string; title: string; text: string }
export type Reference = { source: TeachingSource; text: string; sections: Section[] }

export type SourceDeps = {
  /** HTML of one page. Replaced in tests; the real one asks siyavula.com politely, one page at a time. */
  fetchHtml: (url: string) => Promise<string>
  /** Where fetched pages are kept. */
  cacheDir: string
  root: string
}

// ---- text of a page -----------------------------------------------------------------------------------------------------------

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-', hellip: '...', rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', deg: '°', times: '×', divide: '÷', minus: '-' }

const decode = (s: string): string =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => safeChar(Number(d)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)

/** The en dash and the em dash, built from their codes so that no such character is written in this file. */
const DASHES = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`, 'g')

const safeChar = (code: number): string => {
  // an em dash (8212) or an en dash (8211) is written as a plain dash: no em dash may reach a lesson or a repo file
  if (code === 0x2014 || code === 0x2013) return '-'
  try {
    return String.fromCodePoint(code)
  } catch {
    return ''
  }
}

/** Siyavula writes maths as LaTeX between \( and \). The lessons use plain notation (3/4, x^2, sqrt(8)), so the reference is read that way too. */
export function latexToPlain(input: string): string {
  let s = input
  const group = (re: RegExp, f: (...m: string[]) => string) => {
    for (let i = 0; i < 6; i++) {
      const next = s.replace(re, (...args) => f(...(args as string[])))
      if (next === s) break
      s = next
    }
  }
  s = s.replace(/\\\(|\\\)|\\\[|\\\]/g, '').replace(/\\left|\\right/g, '').replace(/\\,|\\;|\\:|\\!|\\ |\\quad|\\qquad/g, ' ')
  s = s.replace(/\^\{?\\circ\}?/g, '\u00b0')
  group(/\^\{([^{}]*)\}/g, (_m, a = '') => (a.length === 1 || /^\d+$/.test(a) ? `^${a}` : `^(${a})`))
  group(/_\{([^{}]*)\}/g, (_m, a = '') => `_${a}`)
  group(/\\text\{([^{}]*)\}|\\mathrm\{([^{}]*)\}|\\textbf\{([^{}]*)\}/g, (_m, a = '', b = '', c = '') => a || b || c)
  group(/\\sqrt\[3\]\{([^{}]*)\}/g, (_m, a = '') => `cbrt(${a})`)
  group(/\\sqrt\{([^{}]*)\}/g, (_m, a = '') => `sqrt(${a})`)
  group(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, (_m, a = '', b = '') => `(${a})/(${b})`)
  const words: Record<string, string> = {
    '\\times': '×', '\\div': '÷', '\\cdot': '×', '\\pm': '±', '\\leq': '≤', '\\le': '≤', '\\geq': '≥', '\\ge': '≥', '\\neq': '≠', '\\ne': '≠',
    '\\theta': 'θ', '\\alpha': 'α', '\\beta': 'β', '\\pi': 'π', '\\infty': 'infinity', '\\circ': '°', '\\degree': '°', '\\therefore': 'so', '\\because': 'because',
    '\\sin': 'sin', '\\cos': 'cos', '\\tan': 'tan', '\\log': 'log', '\\ln': 'ln', '\\rightarrow': '->', '\\to': '->', '\\ldots': '...', '\\dots': '...', '\\%': '%', '\\angle': 'angle', '\\triangle': 'triangle', '\\parallel': 'parallel to', '\\perp': 'perpendicular to',
  }
  s = s.replace(/\\[a-zA-Z]+|\\%/g, (m) => words[m] ?? m.slice(1))
  s = s.replace(/\^\{?°\}?/g, '°').replace(/[{}]/g, '')
  return s
}

/** The text of the part of a Siyavula page that teaches: no scripts, styles, menus, buttons, videos, simulations or teacher notes. */
export function htmlToText(html: string): string {
  let h = html
  const main = h.indexOf('<main')
  if (main !== -1) h = h.slice(main)
  const body = h.indexOf('<body>')
  if (body !== -1) h = h.slice(body)
  const end = h.search(/footer-legal|<footer|<\/main>/)
  if (end !== -1) h = h.slice(0, end)
  h = h
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|nav|header|noscript|form|button|iframe|video|audio|svg|object|embed|canvas|select)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<table[^>]*class="[^"]*nav-buttons[^"]*"[\s\S]*?<\/table>/gi, ' ')
    .replace(/<section[^>]*class="[^"]*teachers-guide[^"]*"[\s\S]*?<\/section>/gi, ' ')
    .replace(/<img\b[^>]*>/gi, ' ')
    .replace(/<h1\b[^>]*>/gi, '\n\n# ')
    .replace(/<h2\b[^>]*>/gi, '\n\n## ')
    .replace(/<h3\b[^>]*>/gi, '\n\n### ')
    .replace(/<h4\b[^>]*>/gi, '\n\n#### ')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<(td|th)\b[^>]*>/gi, ' | ')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|table|ul|ol|blockquote)>|<br\s*\/?>|<hr\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
  let text = decode(h)
  text = latexToPlain(text)
  text = text
    .replace(/\s*\([A-Z]{5}\)/g, '')
    .replace(DASHES, '-')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text
}

/** The title of a page: its first heading. */
export function pageTitle(html: string): string {
  const m = /<h1[^>]*class="[^"]*(?:sv-heading|title)[^"]*"[^>]*>([\s\S]*?)<\/h1>/i.exec(html) ?? /<title>([\s\S]*?)<\/title>/i.exec(html)
  return decode((m?.[1] ?? '').replace(/<[^>]+>/g, '')).replace(/\s*\|\s*Siyavula\s*$/i, '').replace(/\s+/g, ' ').trim()
}

/** The licence sentence found on a page, or null when the page does not say it is under the Creative Commons Attribution License. */
export function licenceOf(html: string): string | null {
  const plain = decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ')
  if (/NoDerivatives|NonCommercial/i.test(plain.slice(plain.search(/released under the terms/i) - 20, plain.search(/released under the terms/i) + 200))) return null
  return /released under the terms of a\s+Creative Commons Attribution License/i.test(plain) ? LICENCE_LINE : null
}

// ---- the table of contents of a grade -----------------------------------------------------------------------------------------

export type Chapter = { title: string; url: string; pages: { url: string; title: string }[] }

/** The chapters of one grade's book, each with the pages of its sections. A page appears once: in Grades 7 to 9 a whole chapter is one page. */
export function parseGradeIndex(html: string, grade: number): Chapter[] {
  const chapters: Chapter[] = []
  for (const block of html.split('<ul class="chapter">').slice(1)) {
    const head = /href="([^"]*)"\s+class="chapter-title">([^<]*)</.exec(block)
    if (!head) continue
    const chapter: Chapter = { title: decode(head[2] ?? '').trim(), url: abs(head[1] ?? ''), pages: [] }
    for (const link of block.matchAll(/<a href="([^"]*)">\s*<span class="section-title ?">([^<]*)</g)) {
      const href = link[1] ?? ''
      if (!href.startsWith(`/read/za/mathematics/grade-${grade}/`)) continue
      const url = abs(href.replace(/[?#].*$/, ''))
      if (chapter.pages.some((p) => p.url === url)) continue
      chapter.pages.push({ url, title: decode(link[2] ?? '').replace(/\s+/g, ' ').trim() })
    }
    if (chapter.pages.length) chapters.push(chapter)
  }
  return chapters
}

const abs = (href: string): string => (href.startsWith('http') ? href : `${SIYAVULA}${href}`)

/** Pages that do not teach: summaries, exercise lists, assessments. */
const NOT_TEACHING = /summary|end of chapter|exercises|assessment|term revision/i

// ---- matching a CAPS topic to a chapter --------------------------------------------------------------------------------------

const STOP = new Set(['and', 'of', 'the', 'a', 'an', 'in', 'to', 'with', 'for', 'using', 'on', 'their', 'chapter', 'working', 'basic'])
const stem = (w: string): string => (w.length > 3 && w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)

export const tokens = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/chapter\s*\d+\s*:/g, ' ')
    .replace(/['’]s?\b/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w))
    .map(stem)

/** Dice overlap of the words of a CAPS topic and of a chapter title: 1 is the same words, 0 nothing shared. */
export function overlap(topic: string, chapterTitle: string): number {
  const a = new Set(tokens(topic))
  const b = new Set(tokens(chapterTitle))
  if (a.size === 0 || b.size === 0) return 0
  const shared = [...a].filter((w) => b.has(w)).length
  return (2 * shared) / (a.size + b.size)
}

export const MATCH_AT_LEAST = 0.6

/** Every chapter that matches the topic best (two chapters can share a name: Trigonometry in Grade 10), or none when nothing matches well enough. */
export function matchChapters(baseName: string, chapters: Chapter[]): Chapter[] {
  const scored = chapters.map((c) => ({ c, score: overlap(baseName, c.title) })).filter((x) => x.score >= MATCH_AT_LEAST)
  const best = Math.max(0, ...scored.map((x) => x.score))
  return scored.filter((x) => x.score === best).map((x) => x.c)
}

/**
 * Chapters chosen by hand for the three pitch topics, because the names do not meet by words. Grade 6 has no Siyavula book on the reader (it starts
 * at Grade 7): the Grade 7 chapter on fractions is the reference for Grade 6 Common fractions and the credit names Grade 7, as it is.
 */
export const HAND_TABLE: Record<string, { bookGrade: number; chapterTitles: string[]; chapterUrls: string[]; pages: string[]; pageTitles?: string[] }> = {
  '6|Common fractions': {
    bookGrade: 7,
    chapterTitles: ['Chapter 7: Fractions'],
    chapterUrls: [`${SIYAVULA}/read/za/mathematics/grade-7/fractions`],
    pages: [`${SIYAVULA}/read/za/mathematics/grade-7/fractions/07-fractions`],
  },
  '10|Trigonometry': {
    bookGrade: 10,
    chapterTitles: ['Chapter 5: Trigonometry', 'Chapter 11: Trigonometry'],
    chapterUrls: [`${SIYAVULA}/read/za/mathematics/grade-10/trigonometry-part-1`, `${SIYAVULA}/read/za/mathematics/grade-10/trigonometry-part-2`],
    pages: [
      ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => `${SIYAVULA}/read/za/mathematics/grade-10/trigonometry-part-1/05-trigonometry-part-1-0${n}`),
      `${SIYAVULA}/read/za/mathematics/grade-10/trigonometry-part-2/11-trigonometry-part-2-00`,
    ],
  },
  '11|Functions': {
    bookGrade: 11,
    chapterTitles: ['Chapter 5: Functions'],
    chapterUrls: [`${SIYAVULA}/read/za/mathematics/grade-11/functions`],
    pages: [1, 2, 3, 4, 5, 6, 7].map((n) => `${SIYAVULA}/read/za/mathematics/grade-11/functions/05-functions-0${n}`),
  },
}

// ---- fetching and keeping pages ------------------------------------------------------------------------------------------------

/** One polite request at a time, a pause between them, a generic client name, text only. */
let queue: Promise<unknown> = Promise.resolve()
export function politeFetch(url: string): Promise<string> {
  const run = async () => {
    await new Promise((r) => setTimeout(r, 400))
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; text-reader)', accept: 'text/html' }, signal: AbortSignal.timeout(30_000), redirect: 'follow' })
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
    return res.text()
  }
  const result = queue.then(run, run)
  queue = result.catch(() => undefined)
  return result
}

export const defaultDeps = (root = REPO_ROOT): SourceDeps => ({ fetchHtml: politeFetch, cacheDir: join(root, 'content/reference'), root })

const writeAtomic = (file: string, text: string) => {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, text)
  renameSync(tmp, file)
}

const slugOf = (url: string) => url.replace(/^https?:\/\/[^/]+\/read\/za\/mathematics\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')

export type Doc = { url: string; title: string; text: string; licence: string }

/** One page as text: from the cache, or fetched, checked for the licence line, cut to its text and cached. Null when the page cannot be fetched or is not under CC BY. */
export async function fetchDoc(url: string, grade: number, deps: SourceDeps): Promise<Doc | null> {
  const file = join(deps.cacheDir, `grade-${grade}`, `${slugOf(url)}.txt`)
  if (existsSync(file)) {
    const raw = readFileSync(file, 'utf8')
    const m = /^# (.*)\nlicence: (.*)\n\n([\s\S]*)$/.exec(raw)
    if (m) return { url, title: m[1] ?? '', licence: m[2] ?? '', text: m[3] ?? '' }
  }
  let html: string
  try {
    html = await deps.fetchHtml(url)
  } catch {
    return null
  }
  const licence = licenceOf(html)
  if (!licence) return null
  const doc: Doc = { url, title: pageTitle(html), licence, text: htmlToText(html) }
  if (doc.text.length < 200) return null
  writeAtomic(file, `# ${doc.title}\nlicence: ${licence}\n\n${doc.text}\n`)
  return doc
}

async function gradeIndex(grade: number, deps: SourceDeps): Promise<Chapter[]> {
  if (grade < 7) return []
  const file = join(deps.cacheDir, `grade-${grade}`, '_index.html')
  let html: string
  if (existsSync(file)) html = readFileSync(file, 'utf8')
  else {
    try {
      html = await deps.fetchHtml(`${SIYAVULA}/read/za/mathematics/grade-${grade}`)
    } catch {
      return []
    }
    if (!licenceOf(html)) return []
    writeAtomic(file, html)
  }
  return parseGradeIndex(html, grade)
}

// ---- sections and the text a model is given -----------------------------------------------------------------------------------

/** A page cut into sections: each page of a section-per-page book is one, a chapter on one page is cut at its `##` headings. */
export function sectionsOf(doc: Doc, chapterOnePage: boolean): Section[] {
  if (!chapterOnePage) {
    const id = /^(\d+(?:\.\d+)?)\b/.exec(doc.title)?.[1] ?? doc.title.slice(0, 12)
    return [{ id, title: doc.title, text: doc.text }]
  }
  const parts = doc.text.split(/\n\n(?=## )/)
  const chapterNo = /Chapter (\d+)/.exec(doc.title)?.[1] ?? '0'
  let n = 0
  return parts.flatMap((part) => {
    const heading = /^## (.*)\n?/.exec(part)
    if (!heading) return part.trim().length > 200 ? [{ id: `${chapterNo}.0`, title: doc.title, text: part.trim() }] : []
    n += 1
    return [{ id: `${chapterNo}.${n}`, title: heading[1]!.trim(), text: part.trim() }]
  })
}

/** What the outline call reads: the list of sections and the start of each, to the cap. */
export function overview(sections: Section[], cap = REFERENCE_CAP): string {
  const head = sections.map((s) => `- ${s.id} ${s.title}`).join('\n')
  const each = Math.max(600, Math.floor((cap - head.length - sections.length * 20) / Math.max(1, sections.length)))
  const body = sections.map((s) => `### Section ${s.id}: ${s.title}\n${s.text.length > each ? `${s.text.slice(0, each).trimEnd()} ...` : s.text}`).join('\n\n')
  return `Sections of the reference:\n${head}\n\n${body}`.slice(0, cap)
}

/** What a writer call reads: the chosen sections in full, sharing the cap when there are many. Without ids (or none found) the overview. */
export function referenceText(ref: Reference, ids?: string[], cap = REFERENCE_CAP): string {
  const chosen = ids?.length ? ref.sections.filter((s) => ids.includes(s.id)) : []
  if (chosen.length === 0) return ref.text.slice(0, cap)
  const each = Math.floor(cap / chosen.length)
  return chosen.map((s) => `### Section ${s.id}: ${s.title}\n${s.text.length > each ? `${s.text.slice(0, each).trimEnd()} ...` : s.text}`).join('\n\n').slice(0, cap)
}

// ---- reference for a group ------------------------------------------------------------------------------------------------------

const bookName = (grade: number) => (grade >= 10 ? 'Everything Maths' : 'Mathematics')

const siyavulaSource = (bookGrade: number, chapters: { title: string; url: string }[], licence: string): TeachingSource => ({
  kind: 'siyavula',
  title: `Siyavula ${bookName(bookGrade)}, Grade ${bookGrade}`,
  address: chapters[0]?.url,
  licence,
  credit: `Based on Siyavula ${bookName(bookGrade)}, Grade ${bookGrade}, ${chapters.map((c) => c.title).join(' and ')}, CC BY 3.0`,
})

/** What CAPS gives for a topic: the name, the content area, the term, and the topics around it. Used where no textbook chapter is found. */
export function capsReference(group: TopicGroup, root = REPO_ROOT): Reference {
  const file = loadCapsFile(group.grade, root)
  const title = file.source.title.replace(/\s*\((?:PDF file name|National Curriculum Statement)[^)]*\)/g, '').trim()
  const lines = [
    `Topic: ${group.baseName}`,
    `Name in the CAPS document: ${group.capsNames.join('; ')}`,
    `Content area: ${group.contentAreas.join('; ')}`,
    `Grade ${group.grade}, taught in term ${group.terms.join(' and ')}`,
    `Strand: ${group.family}`,
    group.before.length ? `Topics just before it in the year: ${group.before.join('; ')}` : '',
    group.after.length ? `Topics just after it in the year: ${group.after.join('; ')}` : '',
    'There is no textbook chapter for this topic. Teach it from what the South African CAPS Mathematics curriculum asks for this grade.',
  ].filter(Boolean)
  return { source: { kind: 'caps', title, address: file.source.url, credit: CAPS_CREDIT }, text: lines.join('\n'), sections: [] }
}

/** The reference of a group: Siyavula pages when a chapter is found and its licence line is on the page, otherwise the CAPS facts. Never throws on a network problem. */
export async function referenceFor(group: TopicGroup, deps: SourceDeps = defaultDeps()): Promise<Reference> {
  const caps = () => capsReference(group, deps.root)
  const hand = HAND_TABLE[`${group.grade}|${group.baseName}`]
  let chapters: { title: string; url: string }[] = []
  let pageUrls: string[] = []
  let bookGrade = group.grade
  let onePage = false
  if (hand) {
    chapters = hand.chapterTitles.map((title, i) => ({ title, url: hand.chapterUrls[i] ?? '' }))
    pageUrls = hand.pages
    bookGrade = hand.bookGrade
    onePage = hand.bookGrade <= 9
  } else {
    if (group.grade < 7) return caps()
    const matched = matchChapters(group.baseName, await gradeIndex(group.grade, deps))
    if (matched.length === 0) return caps()
    chapters = matched.map((c) => ({ title: c.title, url: c.url }))
    pageUrls = matched.flatMap((c) => c.pages.filter((p) => !NOT_TEACHING.test(p.title)).map((p) => p.url))
    onePage = group.grade <= 9
  }
  const docs: Doc[] = []
  for (const url of pageUrls.slice(0, 14)) {
    const doc = await fetchDoc(url, bookGrade, deps)
    if (doc) docs.push(doc)
  }
  const licence = docs[0]?.licence
  if (!licence || docs.length === 0) return caps()
  const sections = docs.flatMap((d) => sectionsOf(d, onePage))
  return { source: siyavulaSource(bookGrade, chapters, licence), text: overview(sections), sections }
}
