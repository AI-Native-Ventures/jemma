import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { MathAnswerField } from '../app/k/session/_parts/MathAnswerField'
import { CAPS, keyboardLayout, keyName, layerId, openingTab, ROW_WIDTH, rowUnits, TABS, tabsFor, type Keycap, type KeyboardLayer, type KeyboardLayout, type TabId } from '../app/k/session/_parts/math-keyboard'
import type { TypedKind } from '../app/k/session/_parts/maths-keys'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import type { QuestionForChild } from '../app/k/session/[sessionId]/logic'
import { theField, theKeyboard } from './fake-mathlive'

// P132: the maths editor under a senior answer: its keyboard by topic (pure), the element on the page, the plain box when the editor cannot start, and
// the files the editor needs from this app. No browser, no database, no network: the editor is stood in for by a fake.
vi.mock('mathlive', async () => (await import('./fake-mathlive')).fakeMathlive())

const THETA = 'θ'
const ask = (over: Partial<QuestionForChild>): QuestionForChild => ({ position: 3, phase: 'try', index: 1, of: 5, prompt: 'Work it out', render: 'text', answerKind: 'whole', ...over })
const names = (row: (string | { tooltip?: string; label?: string; latex?: string })[]) => row.map((k) => keyName(k as never)).filter((n) => n !== '[separator]')
const ready = async () => {
  await waitFor(() => expect(theKeyboard().layouts).toHaveLength(1))
  await waitFor(() => expect(theField().mathVirtualKeyboardPolicy).toBe('manual'))
}

describe('the keyboard of the maths editor, as tabs by kind of symbol', () => {
  const kinds: TypedKind[] = ['number', 'expression', 'equation']
  const prompts = {
    algebra: 'Simplify x + x + 3',
    trigonometry: 'Work out sin 30',
    geometry: 'Find the size of angle x',
    functions: 'Find the gradient of the line',
    calculus: 'Differentiate y = 3x^2',
    finance: 'How much interest is that?',
    data: 'What is the median?',
  }
  const all = kinds.flatMap((kind) => Object.entries(prompts).map(([strand, prompt]) => ({ kind, strand, layout: keyboardLayout({ kind, prompt }) })))
  const layerOf = (layout: KeyboardLayout, tab: TabId) => layout.layers.find((l) => l.id === layerId(tab))!
  const rowsNamed = (layer: KeyboardLayer) => layer.rows.map((row) => names(row))
  const algebra = (kind: TypedKind) => keyboardLayout({ kind, prompt: prompts.algebra })

  it('a layer for each tab of the kind of answer: a number has no letters, so no abc and no calculus tab', () => {
    expect(algebra('expression').layers.map((l) => l.id).sort()).toEqual(['jemma-calculus', 'jemma-functions', 'jemma-geometry', 'jemma-letters', 'jemma-numbers'])
    expect(algebra('equation').layers).toHaveLength(5)
    expect(algebra('number').layers.map((l) => l.id).sort()).toEqual(['jemma-functions', 'jemma-geometry', 'jemma-numbers'])
  })

  it('every row of every layer is seven units wide, so every key is the same size (48 px on a 360 px phone)', () => {
    for (const { kind, strand, layout } of all) {
      for (const layer of layout.layers) for (const row of layer.rows) expect(rowUnits(row), `${kind} ${strand} ${layer.id}`).toBe(ROW_WIDTH)
    }
    expect(360 / ROW_WIDTH).toBeGreaterThanOrEqual(48)
  })

  it('each layer starts with the row of tabs: 123, abc, f(x), angle, integral, the tab you are on dark, and a key that hides the keyboard', () => {
    for (const { kind, strand, layout } of all) {
      for (const layer of layout.layers) {
        const row = layer.rows[0]!.filter((k): k is Keycap => typeof k !== 'string')
        const tabs = row.filter((k) => k.class?.includes('tab'))
        expect(tabs.map((t) => t.tooltip), `${kind} ${strand} ${layer.id}`).toEqual(tabsFor(kind).map((t) => t.tooltip))
        // each tab key switches to its own layer; only the tab of this layer is dark
        expect(tabs.map((t) => t.command)).toEqual(tabsFor(kind).map((t) => ['switchKeyboardLayer', layerId(t.id)]))
        expect(tabs.filter((t) => t.class?.includes('is-current-tab'))).toHaveLength(1)
        expect(tabs.find((t) => t.class?.includes('is-current-tab'))!.command).toEqual(['switchKeyboardLayer', layer.id])
        expect(row.some((k) => k.tooltip === 'hide the keyboard')).toBe(true)
        expect(layer.style).toContain('.is-current-tab')
      }
    }
    expect(TABS.map((t) => t.tooltip)).toEqual(['numbers and signs', 'letters', 'functions and constants', 'geometry and Greek letters', 'calculus'])
  })

  it('the face of a tab is one element on one line (a key is a flex column: loose pieces of a label would be stacked), and the CSS gives a tab no padding and 16 px', () => {
    for (const tab of TABS) {
      const holder = document.createElement('div')
      holder.innerHTML = tab.face
      expect(holder.children, tab.id).toHaveLength(1)
      expect(holder.firstElementChild!.className).toBe('tab-face')
      expect(holder.childNodes, tab.id).toHaveLength(1)
    }
    const text = (id: TabId) => {
      const holder = document.createElement('div')
      holder.innerHTML = TABS.find((t) => t.id === id)!.face
      return holder.textContent
    }
    expect(text('numbers')).toBe('123')
    expect(text('letters')).toBe('abc')
    // f(x) is one piece of text: the f, the brackets and the x are inside one face, not beside it
    expect(text('functions')).toBe('f(x)')
    // the angle and the integral are drawn lines at 22 px, not a sign from a font
    for (const id of ['geometry', 'calculus'] as const) {
      const holder = document.createElement('div')
      holder.innerHTML = TABS.find((t) => t.id === id)!.face
      expect(holder.querySelector('svg path'), id).not.toBeNull()
      expect(holder.textContent, id).toBe('')
    }
    const style = keyboardLayout({ kind: 'expression', prompt: 'x' }).layers[0]!.style
    expect(style).toMatch(/\.tab \{[^}]*padding: 0 !important/)
    expect(style).toMatch(/\.tab \{[^}]*font-size: 16px !important/)
    expect(style).toContain('white-space: nowrap')
    expect(style).toMatch(/\.tab svg \{[^}]*width: 22px; height: 22px/)
    expect(style).toContain('.is-current-tab')
  })

  it('123: + - x / = ( ) on the top row, then the fraction, root, cube root, x squared, x to a power and backspace, then the digits, the comma and the arrows', () => {
    for (const kind of kinds) {
      const rows = rowsNamed(layerOf(algebra(kind), 'numbers')).slice(1)
      expect(rows[0], kind).toEqual(['plus', 'minus', 'times', 'divided by', 'equals', 'open bracket', 'close bracket'])
      expect(rows[1], kind).toEqual(['fraction', 'square root', 'cube root', 'squared', 'to the power of', 'backspace'])
      expect(rows[2], kind).toEqual(['[1]', '[2]', '[3]', '[4]', '[5]', 'move left', 'move right'])
      expect(rows[3]!.slice(0, 6), kind).toEqual(['[6]', '[7]', '[8]', '[9]', '[0]', 'decimal comma'])
    }
  })

  it('the keys are textbook glyphs: a boxed fraction, a root over a box, a cube root with its 3, x with a raised box, the cross, the division sign, a true minus', () => {
    expect(CAPS.fraction.latex).toBe('\\frac{\\square}{\\square}')
    expect(CAPS.fraction.insert).toBe('\\frac{#@}{#?}')
    expect(CAPS.sqrt.latex).toBe('\\sqrt{\\square}')
    expect(CAPS.cbrt.latex).toBe('\\sqrt[3]{\\square}')
    expect(CAPS.cbrt.insert).toBe('\\sqrt[3]{#0}')
    expect(CAPS.power.latex).toBe('x^{\\square}')
    expect(CAPS.power.insert).toBe('#@^{#?}')
    expect(CAPS.squared.latex).toBe('x^2')
    expect(CAPS.squared.insert).toBe('#@^2')
    expect(CAPS.times.latex).toBe('\\times')
    expect(CAPS.divide.latex).toBe('\\div')
    expect(CAPS.minus.label).toBe('&#x2212;')
    expect(CAPS.comma.insert).toBe('{,}')
    // no face is plain text with a slash or a caret
    for (const k of Object.values(CAPS)) expect((k as Keycap).label ?? '', (k as Keycap).tooltip).not.toMatch(/[/^]/)
  })

  it('abc: italic maths letters, x y k p n t a b c m first, every letter but e (which is on the f(x) tab), none of them a sign', () => {
    const rows = rowsNamed(layerOf(algebra('expression'), 'letters')).slice(1)
    const letters = rows.flat().filter((n) => n.startsWith('the letter ')).map((n) => n.slice('the letter '.length))
    expect(letters.slice(0, 10)).toEqual(['x', 'y', 'k', 'p', 'n', 't', 'a', 'b', 'c', 'm'])
    expect([...letters].sort().join('')).toBe('abcdfghijklmnopqrstuvwxyz'.replace('e', ''))
    expect(letters).not.toContain('e')
    const caps = layerOf(algebra('expression'), 'letters').rows.flat().filter((k): k is Keycap => typeof k !== 'string' && !!k.tooltip?.startsWith('the letter'))
    for (const k of caps) expect(k.latex).toMatch(/^[a-z]$/)
    // the cross is not a letter: the times key is on the numbers tab and is \times
    expect(layerOf(algebra('expression'), 'numbers').rows.flat()).toContain(CAPS.times)
    expect(CAPS.times.latex).not.toBe('x')
  })

  it('f(x): sin cos tan and their inverses, |x|, log, ln, e, pi, f(x), the relations < > <= >= != and plus or minus', () => {
    const flat = rowsNamed(layerOf(algebra('expression'), 'functions')).flat()
    expect(flat).toEqual(
      expect.arrayContaining(['sine', 'cosine', 'tangent', 'inverse sine', 'inverse cosine', 'inverse tangent', 'absolute value', 'logarithm', 'natural logarithm', 'the number e', 'pi', 'f of x']),
    )
    expect(flat).toEqual(expect.arrayContaining(['less than', 'greater than', 'less than or equal to', 'greater than or equal to', 'not equal to', 'plus or minus', 'percent', 'rand']))
    expect(CAPS.asin.latex).toBe('\\sin^{-1}')
    expect(CAPS.abs.latex).toBe('\\left|\\square\\right|')
    expect(CAPS.e.latex).toBe('\\mathrm{e}')
  })

  it('angle: the degree sign, theta and the Greek letters, pi, and the signs of geometry', () => {
    const flat = rowsNamed(layerOf(algebra('expression'), 'geometry')).flat()
    expect(flat).toEqual(expect.arrayContaining(['degrees', 'theta', 'alpha', 'beta', 'gamma', 'pi', 'angle', 'triangle', 'perpendicular', 'parallel', 'congruent', 'similar']))
  })

  it('calculus: d/dx, f prime of x, the integral, lim, the sum, infinity, e and ln', () => {
    const flat = rowsNamed(layerOf(algebra('expression'), 'calculus')).flat()
    expect(flat).toEqual(expect.arrayContaining(['d by d x', 'f prime of x', 'integral', 'limit', 'sum', 'infinity', 'the number e', 'natural logarithm']))
    expect(CAPS.ddx.latex).toBe('\\frac{d}{dx}')
  })

  it('a number has no letter on any of its tabs, and only an equation has "or"', () => {
    for (const { kind, layout } of all.filter((a) => a.kind === 'number')) {
      for (const layer of layout.layers) expect(rowsNamed(layer).flat().filter((n) => n.startsWith('the letter'))).toEqual([])
    }
    for (const { kind, layout } of all.filter((a) => a.kind !== 'equation')) {
      for (const layer of layout.layers) expect(rowsNamed(layer).flat(), kind).not.toContain('or')
    }
  })

  it('the keyboard opens on the tab that fits the question: calculus for a derivative, f(x) for trigonometry, geometry for angles, 123 otherwise', () => {
    const first = (kind: TypedKind, strand: keyof typeof prompts) => keyboardLayout({ kind, prompt: prompts[strand] }).layers[0]!.id
    expect(first('expression', 'calculus')).toBe('jemma-calculus')
    expect(first('equation', 'calculus')).toBe('jemma-calculus')
    expect(first('number', 'calculus')).toBe('jemma-numbers')
    expect(first('expression', 'trigonometry')).toBe('jemma-functions')
    expect(first('number', 'trigonometry')).toBe('jemma-functions')
    expect(first('equation', 'trigonometry')).toBe('jemma-geometry')
    for (const kind of kinds) expect(first(kind, 'geometry')).toBe('jemma-geometry')
    for (const strand of ['algebra', 'functions', 'finance', 'data'] as const) for (const kind of kinds) expect(first(kind, strand), `${kind} ${strand}`).toBe('jemma-numbers')
    expect(openingTab('expression', 'calculus')).toBe('calculus')
    // the tab row is the same whichever tab opens: only the dark tab changes
    const a = keyboardLayout({ kind: 'expression', prompt: prompts.calculus }).layers[0]!
    expect(a.rows[0]!.filter((k) => typeof k !== 'string' && k.class?.includes('is-current-tab'))).toHaveLength(1)
  })

  it('no key is twice on a layer, every key has a name for a screen reader, and the layout is shaped for the editor', () => {
    for (const { kind, strand, layout } of all) {
      for (const layer of layout.layers) {
        const found = layer.rows.flat().map((k) => keyName(k as never)).filter((n) => n !== '[separator]' && n !== 'backspace')
        expect(new Set(found).size, `${kind} ${strand} ${layer.id}`).toBe(found.length)
        for (const k of layer.rows.flat()) expect(keyName(k as never).length).toBeGreaterThan(0)
      }
    }
    const layout = keyboardLayout({ kind: 'expression', topic: 'Trigonometry', prompt: 'x' })
    expect(layout).toMatchObject({ id: 'jemma-expression-trigonometry', displayEditToolbar: false })
    expect(new Set(all.map((a) => a.layout.id)).size).toBe(all.length)
    expect(new Set(layout.layers.map((l) => l.id)).size).toBe(layout.layers.length)
  })
})

describe('the answer area of a question', () => {
  const html = (q: QuestionForChild, topic?: string) => renderToStaticMarkup(<QuestionScreen q={q} topic={topic} busy={false} onAnswer={() => {}} />)

  it('a senior expression question has the editor element on the page (drawn on the server as an element, started in the browser)', () => {
    const out = html(ask({ prompt: 'Simplify x + x + 3', answerKind: 'expression' }))
    expect(out).toMatch(/<math-field[^>]*aria-label="Your answer"/)
    expect(out).toContain('default-mode="math"')
    expect(out).not.toContain('data-keys')
  })

  it('a primary question keeps its own inputs: boxes, missing number, choices, no editor', () => {
    expect(html(ask({ answerKind: 'fraction', prompt: 'Add 1/5 + 2/5' }))).not.toContain('math-field')
    expect(html(ask({ answerKind: 'fraction', prompt: 'Complete: 3/5 = ?/15' }))).not.toContain('math-field')
    expect(html(ask({ answerKind: 'whole', prompt: 'What is 12 + 7?' }))).not.toContain('math-field')
    expect(html(ask({ answerKind: 'decimal', prompt: 'What is 0,5 + 0,25?' }))).not.toContain('math-field')
    expect(html(ask({ answerKind: 'choice', choices: ['3x', '2x', '3', '2x^2'], prompt: 'Which is the same as 2x + x?' }))).not.toContain('math-field')
    expect(html(ask({ answerKind: 'point', prompt: 'Where does the line cut the y-axis?' }))).not.toContain('math-field')
  })

  it('a trigonometry topic opens the keyboard on the functions tab', async () => {
    render(<QuestionScreen q={ask({ prompt: 'Work out the length', answerKind: 'number' })} topic="Trigonometry" busy={false} onAnswer={() => {}} />)
    await ready()
    const layout = theKeyboard().layouts[0] as ReturnType<typeof keyboardLayout>
    expect(layout.id).toBe('jemma-number-trigonometry')
    expect(layout.layers[0]!.id).toBe('jemma-functions')
    expect(names(layout.layers[0]!.rows[1]!)).toEqual(['sine', 'cosine', 'tangent', 'inverse sine', 'inverse cosine', 'inverse tangent', 'absolute value'])
  })

  it('the editor is given fonts from this app, no sound and the decimal comma', async () => {
    render(<QuestionScreen q={ask({ prompt: 'Simplify x + x + 3', answerKind: 'expression' })} busy={false} onAnswer={() => {}} />)
    await ready()
    const { MathfieldElement } = (await import('mathlive')) as unknown as { MathfieldElement: { fontsDirectory: string; soundsDirectory: string | null; decimalSeparator: string } }
    expect(MathfieldElement.fontsDirectory).toBe('/mathlive/fonts')
    expect(MathfieldElement.soundsDirectory).toBeNull()
    expect(MathfieldElement.decimalSeparator).toBe(',')
  })

  it('what is written is handed up in the plain notation, and a value too long for the server is not sent', async () => {
    const seen: string[] = []
    render(<MathAnswerField kind="expression" prompt="Simplify" value="" onChange={(v) => seen.push(v)} hint="Type an expression." />)
    await ready()
    act(() => theField().setValue('\\frac{x+1}{2}'))
    act(() => theField().setValue('x+'.repeat(31) + 'x'))
    expect(seen).toEqual(['(x + 1)/2', ''])
    act(() => theField().dispatchEvent(new Event('focusout')))
    expect(screen.getByRole('status').textContent).toContain('too long')
  })
})

describe('the keyboard is shown once', () => {
  it('on a phone the editor shows its own keyboard after a touch, so the screen does not show it a second time', async () => {
    const real = window.matchMedia
    window.matchMedia = ((query: string) => ({ matches: query.includes('coarse'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia
    try {
      render(<MathAnswerField kind="expression" prompt="Simplify" value="" onChange={() => {}} hint="Type an expression." />)
      await waitFor(() => expect(theKeyboard().layouts).toHaveLength(1))
      await waitFor(() => expect(theField().mathVirtualKeyboardPolicy).toBe('auto'))
      theKeyboard().show.mockClear()
      act(() => theField().dispatchEvent(new Event('focusin')))
      expect(theKeyboard().show).not.toHaveBeenCalled()
    } finally {
      window.matchMedia = real
    }
  })
})

describe('the room for the keyboard', () => {
  it('while the keyboard is up the page has room under its last button, and it is given back when the keyboard goes or the question does', async () => {
    const { unmount } = render(<MathAnswerField kind="expression" prompt="Simplify" value="" onChange={() => {}} hint="Type an expression." />)
    await ready()
    const keyboard = theKeyboard()
    keyboard.visible = true
    keyboard.boundingRect = { height: 281.4 }
    act(() => keyboard.dispatchEvent(new Event('geometrychange')))
    expect(document.body.style.paddingBottom).toBe('281px')
    keyboard.visible = false
    act(() => keyboard.dispatchEvent(new Event('virtual-keyboard-toggle')))
    expect(document.body.style.paddingBottom).toBe('')
    keyboard.visible = true
    act(() => keyboard.dispatchEvent(new Event('geometrychange')))
    expect(document.body.style.paddingBottom).toBe('281px')
    unmount()
    expect(document.body.style.paddingBottom).toBe('')
  })
})

describe('the fonts and the page', () => {
  const web = resolve(import.meta.dirname, '..')

  it('the fonts of the editor are in its package and are copied into this app before every build and dev start', () => {
    const fonts = readdirSync(resolve(web, 'node_modules/mathlive/fonts')).filter((f) => f.endsWith('.woff2'))
    expect(fonts.length).toBeGreaterThan(15)
    const pkg = JSON.parse(readFileSync(resolve(web, 'package.json'), 'utf8')) as { scripts: Record<string, string>; dependencies: Record<string, string> }
    expect(pkg.scripts.build).toContain('copy-mathlive-assets.mjs')
    expect(pkg.scripts.dev).toContain('copy-mathlive-assets.mjs')
    expect(pkg.dependencies.mathlive).toMatch(/^\d+\.\d+\.\d+$/)
    const script = readFileSync(resolve(web, 'scripts/copy-mathlive-assets.mjs'), 'utf8')
    expect(script).toContain('public/mathlive/fonts')
    expect(script).not.toMatch(/https?:\/\//)
  })

  it('the component names no address of another site: the fonts are /mathlive/fonts', () => {
    const source = readFileSync(resolve(web, 'app/k/session/_parts/MathAnswerField.tsx'), 'utf8')
    expect(source).toContain("'/mathlive/fonts'")
    expect(source).not.toMatch(/https?:\/\/(?!www\.w3\.org)/)
    expect(source).toContain("import('mathlive')")
    expect(source).not.toMatch(/^import [^t].*from 'mathlive'/m)
  })

  it('the editor is styled in the app css: the box of the old answer, a menu button that is hidden', () => {
    const css = readFileSync(resolve(web, 'app/globals.css'), 'utf8')
    expect(css).toMatch(/math-field\.jemma-answer/)
    expect(css).toMatch(/menu-toggle/)
  })
})

describe('theta and the rest are on the page for a screen reader too', () => {
  it('the keys carry plain names: theta, pi, degrees', () => {
    expect(CAPS.theta.tooltip).toBe('theta')
    expect(CAPS.theta.latex).toBe('\\theta')
    expect(THETA).toBe('θ')
    expect(CAPS.degree.tooltip).toBe('degrees')
  })

  it('the hint stays under the editor, and a laptop is not told to use a touch keyboard', async () => {
    const { container } = render(<MathAnswerField kind="equation" prompt="Solve" value="" onChange={() => {}} hint="Type the answer." />)
    await ready()
    expect(container.textContent).toContain('Type the answer.')
    fireEvent.focusIn(theField())
    expect(theKeyboard().show).toHaveBeenCalled()
  })
})
