import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { CAPS_CREDIT, HAND_TABLE, REFERENCE_CAP, capsReference, fetchDoc, htmlToText, latexToPlain, licenceOf, matchChapters, overlap, overview, parseGradeIndex, referenceFor, referenceText, sectionsOf, type Chapter, type SourceDeps } from '../sources'
import { REPO_ROOT, topicGroups } from '../topics'

const EM = String.fromCharCode(0x2014)
const EN = String.fromCharCode(0x2013)
const LICENCE_HTML = '<section class="footer-legal"><p>All Siyavula textbook content made available on this site is released under the terms of a <a href="https://creativecommons.org/licenses/by/3.0/">Creative Commons Attribution License</a>. Embedded videos are not covered.</p></section>'

const page = (title: string, body: string, opts: { licence?: boolean } = {}) =>
  `<!DOCTYPE html><html><head><title>${title} | Siyavula</title><script>var secret = "SCRIPT TEXT";</script><style>.a { color: red }</style></head>
<body class="x"><nav>MENU TEXT</nav>
<main class="sv-main"><header class="sv-page-header"><h1 class="sv-heading">${title} </h1></header>
<table class="nav-buttons"><tbody><tr><td>NAV BUTTONS</td></tr></tbody></table>
<div class="sv-panel--page-toc"><nav>TOC TEXT</nav></div>
<body>
  <section class="teachers-guide"><p>TEACHER NOTE</p></section>
  ${body}
  <iframe src="x">VIDEO TEXT</iframe>
</body>
</main>
${opts.licence === false ? '<footer class="footer-legal"><p>Some rights reserved.</p></footer>' : LICENCE_HTML}</body></html>`

const BODY = `<h2 class="title">5.1 Quadratic functions <span class="shortcode">(EMBGJ)</span></h2>
<p>Functions of the form \\(y = a x^{2} + q\\) are parabolas. Use \\(\\frac{1}{2}\\) and \\(\\sqrt{x}\\) and 30\\(^{\\circ}\\).</p>
<ul><li>First point about the turning point and the axis of symmetry of every parabola we draw today.</li><li>Second point.</li></ul>
<p>${'The graph of a quadratic function is a parabola with a turning point. '.repeat(8)}</p>`

describe('htmlToText', () => {
  const text = htmlToText(page('5.1 Quadratic functions', BODY))

  test('drops scripts, styles, menus, buttons, notes for teachers and videos', () => {
    for (const gone of ['SCRIPT TEXT', 'color: red', 'MENU TEXT', 'NAV BUTTONS', 'TOC TEXT', 'TEACHER NOTE', 'VIDEO TEXT', 'Some rights']) expect(text).not.toContain(gone)
  })

  test('keeps the teaching text, its headings and its list', () => {
    expect(text).toContain('## 5.1 Quadratic functions')
    expect(text).toContain('are parabolas')
    expect(text).toContain('- First point')
    expect(text).not.toContain('EMBGJ')
  })

  test('writes the maths in plain notation, not LaTeX', () => {
    expect(text).toContain('y = a x^2 + q')
    expect(text).toContain('(1)/(2)')
    expect(text).toContain('sqrt(x)')
    expect(text).toContain('30°')
    expect(text).not.toMatch(/\\\(|\\frac|\\sqrt/)
  })

  test('turns a real em dash or en dash in the page into a plain dash', () => {
    const t = htmlToText(page('x', `<p>one${EM}two and three${EN}four ${'word '.repeat(60)}</p>`))
    expect(t).toContain('one-two and three-four')
    expect(t).not.toContain(EM)
  })
})

describe('latexToPlain', () => {
  test('common pieces', () => {
    expect(latexToPlain('\\(\\frac{3}{4} \\times 2\\)')).toBe('(3)/(4) × 2')
    expect(latexToPlain('\\(x^{2}\\) and \\(x^{n+1}\\)')).toBe('x^2 and x^(n+1)')
    expect(latexToPlain('\\(\\sin \\theta = \\frac{opp}{hyp}\\)')).toBe('sin θ = (opp)/(hyp)')
    expect(latexToPlain('\\(\\sqrt{x^{2}+1}\\)')).toBe('sqrt(x^2+1)')
  })
})

describe('licence', () => {
  test('a page with the Creative Commons Attribution line has a licence, one without has none', () => {
    expect(licenceOf(page('a', BODY))).toContain('Creative Commons Attribution License')
    expect(licenceOf(page('a', BODY, { licence: false }))).toBeNull()
  })

  test('a NoDerivatives or NonCommercial licence is not used', () => {
    const nd = page('a', BODY).replace('Creative Commons Attribution License', 'Creative Commons Attribution-NoDerivatives License')
    expect(licenceOf(nd)).toBeNull()
  })
})

const INDEX = `<html><body><ul class="chapter"><li><a href="/read/za/mathematics/grade-11/functions" class="chapter-title">Chapter 5: Functions</a>
<ul class="sections">
<li><a href="/read/za/mathematics/grade-11/functions/05-functions-01"><span class="section-title ">5.1 Quadratic functions </span></a></li>
<li><a href="/read/za/mathematics/grade-11/functions/05-functions-02"><span class="section-title ">5.2 Average gradient </span></a></li>
<li><a href="/read/za/mathematics/grade-11/functions/05-functions-08"><span class="section-title ">5.8 Summary </span></a></li>
<li class="practice-link"><a href="/dashboard/select-chapter/97"><span class="section-title">Practice this chapter</span></a></li>
</ul></li></ul>
<ul class="chapter"><li><a href="/read/za/mathematics/grade-11/trigonometry" class="chapter-title">Chapter 6: Trigonometry</a>
<ul class="sections"><li><a href="/read/za/mathematics/grade-11/trigonometry/06-trigonometry-01"><span class="section-title ">6.1 Revision </span></a></li></ul></li></ul></body></html>`

const GRADE7_INDEX = `<ul class="chapter"><li><a href="/read/za/mathematics/grade-7/fractions" class="chapter-title">Chapter 7: Fractions</a><ul class="sections">
<li><a href="/read/za/mathematics/grade-7/fractions/07-fractions"><span class="section-title ">7.1 Measuring accurately </span></a></li>
<li><a href="/read/za/mathematics/grade-7/fractions/07-fractions?id=toc-id-2#toc-id-2"><span class="section-title ">7.2 Different parts </span></a></li></ul></li></ul>`

describe('parseGradeIndex and matching', () => {
  test('lists chapters with the pages of their sections, leaving out links that are not sections', () => {
    const chapters = parseGradeIndex(INDEX, 11)
    expect(chapters.map((c) => c.title)).toEqual(['Chapter 5: Functions', 'Chapter 6: Trigonometry'])
    expect(chapters[0]?.pages.map((p) => p.title)).toEqual(['5.1 Quadratic functions', '5.2 Average gradient', '5.8 Summary'])
    expect(chapters[0]?.pages[0]?.url).toBe('https://www.siyavula.com/read/za/mathematics/grade-11/functions/05-functions-01')
  })

  test('in Grades 7 to 9 a chapter is one page: the query and the anchor are dropped and the page is listed once', () => {
    const chapters = parseGradeIndex(GRADE7_INDEX, 7)
    expect(chapters[0]?.pages).toHaveLength(1)
    expect(chapters[0]?.pages[0]?.url).toBe('https://www.siyavula.com/read/za/mathematics/grade-7/fractions/07-fractions')
  })

  test('words decide: Functions and relationships finds Functions; Decimal fractions does not find Common fractions', () => {
    expect(overlap('Functions and relationships', 'Chapter 5: Functions')).toBeGreaterThanOrEqual(0.6)
    expect(overlap('Decimal fractions', 'Chapter 7: Common fractions')).toBeLessThan(0.6)
    expect(overlap('Whole numbers', 'Chapter 1: Working with whole numbers')).toBeGreaterThanOrEqual(0.6)
    const chapters: Chapter[] = [
      { title: 'Chapter 5: Trigonometry', url: 'u1', pages: [] },
      { title: 'Chapter 11: Trigonometry', url: 'u2', pages: [] },
      { title: 'Chapter 6: Functions', url: 'u3', pages: [] },
    ]
    expect(matchChapters('Trigonometry', chapters).map((c) => c.url)).toEqual(['u1', 'u2'])
    expect(matchChapters('Probability', chapters)).toEqual([])
  })
})

describe('referenceFor', () => {
  let dir: string
  beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), 'teach-src-'))))
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const group = (grade: number, baseName: string) => topicGroups().find((g) => g.grade === grade && g.baseName === baseName)!
  const deps = (html: (url: string) => string, calls: string[] = []): SourceDeps => ({
    root: REPO_ROOT,
    cacheDir: dir,
    fetchHtml: async (url) => {
      calls.push(url)
      return html(url)
    },
  })

  test('Grade 11 Functions: the pitch topic gets the Siyavula pages, the credit line and the link', async () => {
    const calls: string[] = []
    const ref = await referenceFor(group(11, 'Functions'), deps((u) => page(`5.${u.slice(-1)} Section ${u.slice(-1)}`, BODY), calls))
    expect(ref.source.kind).toBe('siyavula')
    expect(ref.source.credit).toBe('Based on Siyavula Everything Maths, Grade 11, Chapter 5: Functions, CC BY 3.0')
    expect(ref.source.address).toBe('https://www.siyavula.com/read/za/mathematics/grade-11/functions')
    expect(ref.source.licence).toContain('Creative Commons Attribution License')
    expect(calls).toHaveLength(7)
    expect(ref.sections.map((s) => s.id)).toEqual(['5.1', '5.2', '5.3', '5.4', '5.5', '5.6', '5.7'])
    expect(ref.text.length).toBeLessThanOrEqual(REFERENCE_CAP)
  })

  test('a second run uses the cache and fetches nothing', async () => {
    const html = (u: string) => page(`5.${u.slice(-1)} Section`, BODY)
    await referenceFor(group(11, 'Functions'), deps(html))
    const calls: string[] = []
    const again = await referenceFor(group(11, 'Functions'), deps(html, calls))
    expect(calls).toEqual([])
    expect(again.source.kind).toBe('siyavula')
    expect(readdirSync(join(dir, 'grade-11')).length).toBe(7)
  })

  test('a page without the Creative Commons Attribution line is not used: the topic falls back to CAPS', async () => {
    const ref = await referenceFor(group(11, 'Functions'), deps(() => page('5.1 Quadratic functions', BODY, { licence: false })))
    expect(ref.source.kind).toBe('caps')
    expect(ref.source.credit).toBe(CAPS_CREDIT)
    expect(ref.sections).toEqual([])
    expect(readdirSync(dir)).toEqual([])
  })

  test('a fetch that fails is a fallback to CAPS, never a crash', async () => {
    const ref = await referenceFor(group(10, 'Trigonometry'), { root: REPO_ROOT, cacheDir: dir, fetchHtml: async () => Promise.reject(new Error('offline')) })
    expect(ref.source.kind).toBe('caps')
  })

  test('Grade 6 Common fractions has no Grade 6 book: it uses the Grade 7 chapter and the credit says Grade 7', async () => {
    const body = `<h1 class="title">Chapter 7: Fractions</h1><p>${'Intro words. '.repeat(30)}</p><h2>Measuring accurately</h2><p>${'Parts of a unit. '.repeat(30)}</p><h2>Combining fractions</h2><p>${'Add parts. '.repeat(40)}</p>`
    const ref = await referenceFor(group(6, 'Common fractions'), deps(() => page('Chapter 7: Fractions', body)))
    expect(ref.source.kind).toBe('siyavula')
    expect(ref.source.credit).toBe('Based on Siyavula Mathematics, Grade 7, Chapter 7: Fractions, CC BY 3.0')
    expect(ref.sections.map((s) => s.title)).toContain('Combining fractions')
  })

  test('Grades 1 to 6 never touch the network and use CAPS, with its credit', async () => {
    const never = { root: REPO_ROOT, cacheDir: dir, fetchHtml: async () => Promise.reject(new Error('network used')) }
    const ref = await referenceFor(group(1, 'Count objects'), never)
    expect(ref.source).toMatchObject({ kind: 'caps', credit: 'Follows the CAPS Mathematics curriculum, Department of Basic Education' })
    expect(ref.source.address).toMatch(/^https:\/\/www\.education\.gov\.za\//)
    expect(ref.text).toContain('Topic: Count objects')
    expect(ref.text).toContain('Grade 1')
  })

  test('a topic of Grades 7 to 12 with no matching chapter falls back to CAPS', async () => {
    const index = (u: string) => (u.endsWith('/grade-9') ? INDEX.replace(/grade-11/g, 'grade-9') + LICENCE_HTML : page('x', BODY))
    const ref = await referenceFor(group(9, 'Transformation geometry'), deps(index))
    expect(ref.source.kind).toBe('caps')
  })

  test('the hand table names the three pitch topics', () => {
    expect(Object.keys(HAND_TABLE).sort()).toEqual(['10|Trigonometry', '11|Functions', '6|Common fractions'])
  })
})

describe('reference text', () => {
  const sections = Array.from({ length: 9 }, (_, i) => ({ id: `5.${i + 1}`, title: `Section ${i + 1}`, text: `word `.repeat(6000) }))

  test('the overview stays under the cap and names every section', () => {
    const o = overview(sections)
    expect(o.length).toBeLessThanOrEqual(REFERENCE_CAP)
    for (const s of sections) expect(o).toContain(`Section ${s.id}`)
  })

  test('chosen sections are read in full when they fit, and the text never passes the cap', () => {
    const ref = { source: { kind: 'siyavula' as const, title: 't', credit: 'c' }, text: overview(sections), sections }
    expect(referenceText(ref, ['5.2']).length).toBeLessThanOrEqual(REFERENCE_CAP)
    expect(referenceText(ref, ['5.2', '5.3', '5.4', '5.5']).length).toBeLessThanOrEqual(REFERENCE_CAP)
    expect(referenceText(ref, ['9.9'])).toBe(ref.text.slice(0, REFERENCE_CAP))
    expect(referenceText(ref)).toBe(ref.text.slice(0, REFERENCE_CAP))
  })

  test('capsReference holds no network text and carries the CAPS credit', () => {
    const g = topicGroups().find((x) => x.grade === 3)!
    const ref = capsReference(g)
    expect(ref.sections).toEqual([])
    expect(ref.source.credit).toBe(CAPS_CREDIT)
    expect(ref.text).toContain(g.baseName)
  })

  test('fetchDoc rejects a page that is too short to teach anything', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'teach-src-'))
    try {
      const doc = await fetchDoc('https://www.siyavula.com/read/za/mathematics/grade-11/functions/05-functions-01', 11, { root: REPO_ROOT, cacheDir: dir, fetchHtml: async () => page('x', '<p>tiny</p>') })
      expect(doc).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('sectionsOf cuts a one-page chapter at its headings', () => {
    const doc = { url: 'u', title: 'Chapter 7: Fractions', licence: 'l', text: `# Chapter 7: Fractions\n\nintro\n\n## One\n${'a '.repeat(200)}\n\n## Two\n${'b '.repeat(200)}` }
    expect(sectionsOf(doc, true).map((s) => s.id + ':' + s.title)).toEqual(['7.1:One', '7.2:Two'])
  })
})
