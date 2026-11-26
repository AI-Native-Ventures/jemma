import { describe, expect, it, vi } from 'vitest'
import { CAPS, giveKeyboard, keyboardLayout, keyName, layerId, openingLayerId, openingTab, ROW_WIDTH, rowUnits, TABS, tabsFor, type Keycap, type KeyboardHandle, type KeyboardLayer, type KeyboardLayout, type TabId } from '../app/k/session/_parts/math-keyboard'
import type { Strand, TypedKind } from '../app/k/session/_parts/maths-keys'

// P140: the maths keyboard is simpler. Every tab has the same three rows on top (the digits, the signs, the fraction/root/power keys), two rows that the tab
// changes, and the strip of tabs. Pure functions: no editor, no page, no database, no network.

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
const strands = Object.keys(prompts) as (keyof typeof prompts)[]
const all = kinds.flatMap((kind) => strands.map((strand) => ({ kind, strand, layout: keyboardLayout({ kind, prompt: prompts[strand] }) })))

const BLANK = '[separator]'
const keycaps = (row: (string | Keycap)[]) => row.filter((k): k is Keycap => typeof k !== 'string')
const names = (row: (string | Keycap)[]) => row.map((k) => keyName(k as never))
const widths = (row: (string | Keycap)[]) => row.map((k) => (typeof k === 'string' ? 1 : (k.width ?? 1)))
const layerOf = (layout: KeyboardLayout, tab: TabId): KeyboardLayer => layout.layers.find((l) => l.id === layerId(tab))!
const algebra = (kind: TypedKind) => keyboardLayout({ kind, prompt: prompts.algebra })
const blanks = (n: number) => Array.from({ length: n }, () => BLANK)
/** The word on a tab: its face is one element with the word in it. */
const wordOf = (face: string | undefined) => {
  const holder = document.createElement('div')
  holder.innerHTML = face ?? ''
  return holder.textContent
}

describe('the layers: one for each tab of the kind of answer', () => {
  it('Letters, Trig, Compare and Calculus for an expression or an equation, and no numbers tab and no Shapes tab any more (P146)', () => {
    for (const kind of ['expression', 'equation'] as const) {
      expect(algebra(kind).layers.map((l) => l.id).sort()).toEqual(['jemma-calculus', 'jemma-compare', 'jemma-letters', 'jemma-trig'])
    }
    expect(TABS.map((t) => t.id)).toEqual(['letters', 'trig', 'compare', 'calculus'])
    expect(TABS.map((t) => layerId(t.id))).toEqual(['jemma-letters', 'jemma-trig', 'jemma-compare', 'jemma-calculus'])
    expect(TABS.map((t) => t.id)).not.toContain('numbers')
    expect(TABS.map((t) => t.id)).not.toContain('shapes' as never)
  })

  it('a number answer has no letters and no calculus: Trig and Compare only', () => {
    expect(algebra('number').layers.map((l) => l.id).sort()).toEqual(['jemma-compare', 'jemma-trig'])
    expect(tabsFor('number').map((t) => t.id)).toEqual(['trig', 'compare'])
    expect(tabsFor('expression').map((t) => t.id)).toEqual(['letters', 'trig', 'compare', 'calculus'])
  })

  it('every tab has at least 6 keys of its own on rows 4 and 5 (a tab with fewer is not a tab: the Shapes tab had 3, the degree sign, theta and pi, which Trig has)', () => {
    for (const { kind, strand, layout } of all) {
      for (const layer of layout.layers) {
        const own = layer.rows.slice(3, 5).flat().filter((k) => k !== BLANK)
        expect(own.length, `${kind} ${strand} ${layer.id}`).toBeGreaterThanOrEqual(6)
      }
    }
    // the keys of the old Shapes tab are all on Trig
    const trig = layerOf(algebra('expression'), 'trig').rows.flatMap(names)
    for (const name of ['degrees', 'theta', 'pi']) expect(trig).toContain(name)
  })

  it('every layer has the same number of rows (six), so every tab is as tall as the others', () => {
    for (const { kind, strand, layout } of all) for (const layer of layout.layers) expect(layer.rows, `${kind} ${strand} ${layer.id}`).toHaveLength(6)
  })

  it('every row of every layer is ten units wide', () => {
    expect(ROW_WIDTH).toBe(10)
    for (const { kind, strand, layout } of all) {
      for (const layer of layout.layers) layer.rows.forEach((row, i) => expect(rowUnits(row), `${kind} ${strand} ${layer.id} row ${i + 1}`).toBe(10))
    }
  })

  it('the layout is shaped for the editor, with a different id for each kind and strand, and each layer id once', () => {
    const layout = keyboardLayout({ kind: 'expression', topic: 'Trigonometry', prompt: 'x' })
    expect(layout).toMatchObject({ id: 'jemma-expression-trigonometry', label: 'Maths', displayEditToolbar: false, displayShiftedKeycaps: false })
    expect(new Set(all.map((a) => a.layout.id)).size).toBe(all.length)
    expect(new Set(layout.layers.map((l) => l.id)).size).toBe(layout.layers.length)
  })
})

describe('the three rows every tab has', () => {
  it('row 1 is the digits 1 2 3 4 5 6 7 8 9 0, one unit each', () => {
    for (const { kind, strand, layout } of all) {
      for (const layer of layout.layers) {
        expect(layer.rows[0], `${kind} ${strand} ${layer.id}`).toEqual(['[1]', '[2]', '[3]', '[4]', '[5]', '[6]', '[7]', '[8]', '[9]', '[0]'])
        expect(widths(layer.rows[0]!)).toEqual(Array.from({ length: 10 }, () => 1))
      }
    }
  })

  it('row 2 is + - x / = ( ) and the decimal comma, then backspace two units wide, also for a number answer (which keeps the equals key)', () => {
    for (const { kind, strand, layout } of all) {
      for (const layer of layout.layers) {
        const row = layer.rows[1]!
        expect(names(row), `${kind} ${strand} ${layer.id}`).toEqual(['plus', 'minus', 'times', 'divided by', 'equals', 'open bracket', 'close bracket', 'decimal comma', 'backspace'])
        expect(widths(row)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 2])
      }
    }
  })

  it('row 3 is the fraction (2 units), square root, cube root, x squared, x to a power (1.5 each), then move left and move right', () => {
    for (const { kind, strand, layout } of all) {
      for (const layer of layout.layers) {
        const row = layer.rows[2]!
        expect(names(row), `${kind} ${strand} ${layer.id}`).toEqual(['fraction', 'square root', 'cube root', 'squared', 'to the power of', 'move left', 'move right'])
        expect(widths(row)).toEqual([2, 1.5, 1.5, 1.5, 1.5, 1, 1])
      }
    }
  })

  it('the keys keep their textbook faces and what they type', () => {
    const row3 = keycaps(algebra('expression').layers[0]!.rows[2]!).slice(0, 5)
    expect(row3.map((k) => k.latex)).toEqual(['\\frac{\\square}{\\square}', '\\sqrt{\\square}', '\\sqrt[3]{\\square}', 'x^2', 'x^{\\square}'])
    expect(row3.map((k) => k.insert)).toEqual(['\\frac{#@}{#?}', '\\sqrt{#0}', '\\sqrt[3]{#0}', '#@^2', '#@^{#?}'])
    const row2 = keycaps(algebra('expression').layers[0]!.rows[1]!)
    expect(row2.map((k) => k.latex)).toEqual(['+', '-', '\\times', '\\div', '=', '(', ')', '{,}', undefined])
    expect(CAPS.minus.label).toBe('&#x2212;')
    expect(CAPS.comma.insert).toBe('{,}')
    expect(CAPS.times.latex).not.toBe('x')
    // no face is plain text with a slash or a caret
    for (const k of Object.values(CAPS)) expect((k as Keycap).label ?? '', (k as Keycap).tooltip).not.toMatch(/[/^]/)
  })
})

describe('rows 4 and 5, which are what a tab changes', () => {
  const rows45 = (tab: TabId, kind: TypedKind = 'expression') => [layerOf(algebra(kind), tab).rows[3]!, layerOf(algebra(kind), tab).rows[4]!]

  it('Letters: x y z a b c k m n p, then d f g h q r s t u v, italic maths letters', () => {
    const [a, b] = rows45('letters')
    expect(names(a!)).toEqual(['x', 'y', 'z', 'a', 'b', 'c', 'k', 'm', 'n', 'p'].map((c) => `the letter ${c}`))
    expect(names(b!)).toEqual(['d', 'f', 'g', 'h', 'q', 'r', 's', 't', 'u', 'v'].map((c) => `the letter ${c}`))
    for (const k of [...keycaps(a!), ...keycaps(b!)]) expect(k.latex).toMatch(/^[a-z]$/)
  })

  it('Trig: sin cos tan, their inverses, the degree sign, theta, alpha, beta, then pi, gamma, delta, phi and blanks', () => {
    const [a, b] = rows45('trig')
    expect(names(a!)).toEqual(['sine', 'cosine', 'tangent', 'inverse sine', 'inverse cosine', 'inverse tangent', 'degrees', 'theta', 'alpha', 'beta'])
    expect(names(b!)).toEqual(['pi', 'gamma', 'delta', 'phi', ...blanks(6)])
    expect(CAPS.asin.latex).toBe('\\sin^{-1}')
  })

  it('Compare: < > <= >= != plus or minus, |x|, %, R and the word or (a number answer has a blank where or is), then (P147) the keys of an interval and three blanks', () => {
    const [a, b] = rows45('compare')
    expect(names(a!)).toEqual(['less than', 'greater than', 'less than or equal to', 'greater than or equal to', 'not equal to', 'plus or minus', 'absolute value', 'percent', 'rand', 'or'])
    expect(names(b!)).toEqual(['open square bracket', 'close square bracket', 'semicolon', 'infinity', 'union', 'element of', 'the real numbers', ...blanks(3)])
    expect(CAPS.abs.latex).toBe('\\left|\\square\\right|')
    // P146: the word or types the word between two answers, so three answers, or x < -1 or x > 4, can be written in one box
    expect(CAPS.or.insert).toBe('\\text{ or }')
    expect(widths(a!)).toEqual(Array.from({ length: 10 }, () => 1))
    for (const kind of ['expression', 'equation'] as const) expect(names(rows45('compare', kind)[0]!)).toContain('or')
    expect(names(rows45('compare', 'number')[0]!)).toEqual(['less than', 'greater than', 'less than or equal to', 'greater than or equal to', 'not equal to', 'plus or minus', 'absolute value', 'percent', 'rand', BLANK])
  })

  it('Calculus: d/dx and f prime of x (two units each), infinity, e, then ln, log, f(x), x, y, h (P185) and blanks (no integral, lim, sum or arrow)', () => {
    const [a, b] = rows45('calculus')
    expect(names(a!)).toEqual(['d by d x', 'f prime of x', 'infinity', 'the number e', ...blanks(4)])
    expect(widths(a!)).toEqual([2, 2, 1, 1, 1, 1, 1, 1])
    expect(names(b!)).toEqual(['natural logarithm', 'logarithm', 'f of x', 'the letter x', 'the letter y', 'the letter h', ...blanks(4)])
    expect(CAPS.ddx.latex).toBe('\\frac{d}{dx}')
    expect(CAPS.fPrime.latex).toBe("f'(x)")
  })

  it('P146: no key whose sign the marking can never read is on any layer (angle, triangle, perpendicular, parallel, congruent, similar, integral, lim, sum, to)', () => {
    const hidden = ['angle', 'triangle', 'perpendicular', 'parallel', 'congruent', 'similar', 'integral', 'limit', 'sum', 'tends to']
    const unreadable = [CAPS.angle, CAPS.triangle, CAPS.perpendicular, CAPS.parallel, CAPS.congruent, CAPS.similar, CAPS.integral, CAPS.limit, CAPS.sum, CAPS.arrow]
    expect(unreadable.map((k) => k.tooltip)).toEqual(hidden)
    for (const { kind, strand, layout } of all) {
      for (const layer of layout.layers) {
        const found = layer.rows.flatMap(names)
        for (const name of hidden) expect(found, `${kind} ${strand} ${layer.id}`).not.toContain(name)
        // none of their faces is anywhere on the layer either
        const latex = layer.rows.flat().map((k) => (typeof k === 'string' ? '' : (k.latex ?? '')))
        for (const sign of ['\\angle', '\\triangle', '\\perp', '\\parallel', '\\cong', '\\sim', '\\int', '\\lim', '\\sum', '\\to']) expect(latex, `${layer.id} ${sign}`).not.toContain(sign)
      }
    }
  })

  it('infinity stays, on the Calculus tab', () => {
    expect(names(rows45('calculus')[0]!)).toContain('infinity')
  })

  it('a number answer sees the same rows 4 and 5 on the tabs it has, apart from the word or (a number is one number)', () => {
    expect(rows45('trig', 'number').map(names)).toEqual(rows45('trig', 'expression').map(names))
    const [numberRow] = rows45('compare', 'number').map(names)
    const [expressionRow] = rows45('compare', 'expression').map(names)
    expect(numberRow!.slice(0, 9)).toEqual(expressionRow!.slice(0, 9))
    expect(expressionRow![9]).toBe('or')
    expect(numberRow![9]).toBe(BLANK)
    expect(names(rows45('compare', 'number')[1]!)).toEqual(names(rows45('compare', 'expression')[1]!))
  })

  it('a number answer has no letter key on any of its tabs, and no key is twice on a layer', () => {
    for (const { kind, strand, layout } of all) {
      for (const layer of layout.layers) {
        const found = layer.rows.flatMap(names).filter((n) => n !== BLANK && n !== 'backspace')
        if (kind === 'number') expect(found.filter((n) => n.startsWith('the letter')), `${strand} ${layer.id}`).toEqual([])
        expect(new Set(found).size, `${kind} ${strand} ${layer.id}`).toBe(found.length)
        for (const k of layer.rows.flat()) expect(keyName(k as never).length).toBeGreaterThan(0)
      }
    }
  })
})

describe('the strip of tabs, the last row', () => {
  const strip = (layer: KeyboardLayer) => layer.rows.at(-1)!
  const tabKeys = (layer: KeyboardLayer) => keycaps(strip(layer)).filter((k) => k.class?.includes('tab'))

  it('four tabs for an expression or an equation, in this order, each with its word on one face and two units wide, then the key that hides the keyboard, two units wide, at the end', () => {
    for (const kind of ['expression', 'equation'] as const) {
      for (const layer of algebra(kind).layers) {
        const keys = tabKeys(layer)
        expect(keys.map((k) => wordOf(k.label)), `${kind} ${layer.id}`).toEqual(['Letters', 'Trig', 'Compare', 'Calculus'])
        expect(widths(strip(layer))).toEqual([2, 2, 2, 2, 2])
        const last = strip(layer).at(-1) as Keycap
        expect(last.tooltip).toBe('hide the keyboard')
        expect(last.label).toBe('[hide-keyboard]')
        expect(last.width).toBe(2)
        expect(strip(layer)).toHaveLength(5)
      }
    }
  })

  it('a number answer has Trig and Compare (two units each), then four blanks, then the key that hides the keyboard, two units wide, at the end', () => {
    for (const layer of algebra('number').layers) {
      const row = strip(layer)
      expect(tabKeys(layer).map((k) => wordOf(k.label)), layer.id).toEqual(['Trig', 'Compare'])
      expect(widths(row)).toEqual([2, 2, 1, 1, 1, 1, 2])
      expect(row.slice(2, 6)).toEqual([BLANK, BLANK, BLANK, BLANK])
      const last = row.at(-1) as Keycap
      expect(last.tooltip).toBe('hide the keyboard')
      expect(last.label).toBe('[hide-keyboard]')
      expect(last.width).toBe(2)
    }
  })

  it('each tab key switches to its own layer, and only the tab you are on is green', () => {
    for (const { kind, strand, layout } of all) {
      for (const layer of layout.layers) {
        const keys = tabKeys(layer)
        expect(keys.map((k) => k.command), `${kind} ${strand} ${layer.id}`).toEqual(tabsFor(kind).map((t) => ['switchKeyboardLayer', layerId(t.id)]))
        const current = keys.filter((k) => k.class?.includes('is-current-tab'))
        expect(current).toHaveLength(1)
        expect(current[0]!.command).toEqual(['switchKeyboardLayer', layer.id])
        expect(layer.style).toContain('.is-current-tab')
      }
    }
  })

  it('the face of a tab is one element holding one word (a key is a flex column: loose pieces would be stacked)', () => {
    for (const tab of TABS) {
      const holder = document.createElement('div')
      holder.innerHTML = tab.face
      expect(holder.children, tab.id).toHaveLength(1)
      expect(holder.firstElementChild!.className).toBe('tab-face')
      expect(holder.childNodes, tab.id).toHaveLength(1)
      expect(holder.textContent).toMatch(/^[A-Z][a-z]+$/)
    }
    expect(TABS.map((t) => wordOf(t.face))).toEqual(['Letters', 'Trig', 'Compare', 'Calculus'])
  })
})

describe('the tab the keyboard opens on', () => {
  const first = (kind: TypedKind, strand: keyof typeof prompts) => keyboardLayout({ kind, prompt: prompts[strand] }).layers[0]!.id

  it('Calculus for a derivative, Trig for trigonometry and for angles and shapes (there is no Shapes tab: its keys are on Trig)', () => {
    for (const kind of ['expression', 'equation'] as const) {
      expect(first(kind, 'calculus')).toBe('jemma-calculus')
      expect(first(kind, 'trigonometry')).toBe('jemma-trig')
      expect(first(kind, 'geometry')).toBe('jemma-trig')
    }
    expect(first('number', 'trigonometry')).toBe('jemma-trig')
    expect(first('number', 'geometry')).toBe('jemma-trig')
  })

  it('otherwise Letters for an expression or an equation, and Compare for a number', () => {
    for (const strand of ['algebra', 'functions', 'finance', 'data'] as const) {
      expect(first('expression', strand), strand).toBe('jemma-letters')
      expect(first('equation', strand), strand).toBe('jemma-letters')
      expect(first('number', strand), strand).toBe('jemma-compare')
    }
  })

  it('a tab this kind of answer does not have is replaced by its first tab: a number asked for a derivative opens on Trig', () => {
    expect(first('number', 'calculus')).toBe('jemma-trig')
    expect(openingTab('number', 'calculus')).toBe('trig')
    expect(openingTab('expression', 'calculus')).toBe('calculus')
  })

  it('openingTab gives the same answer for every strand as the layout does, and the opening tab is the first layer', () => {
    const table: Record<Strand, Record<TypedKind, TabId>> = {
      algebra: { number: 'compare', expression: 'letters', equation: 'letters' },
      trigonometry: { number: 'trig', expression: 'trig', equation: 'trig' },
      geometry: { number: 'trig', expression: 'trig', equation: 'trig' },
      functions: { number: 'compare', expression: 'letters', equation: 'letters' },
      calculus: { number: 'trig', expression: 'calculus', equation: 'calculus' },
      finance: { number: 'compare', expression: 'letters', equation: 'letters' },
      data: { number: 'compare', expression: 'letters', equation: 'letters' },
    }
    for (const strand of Object.keys(table) as Strand[]) for (const kind of kinds) expect(openingTab(kind, strand), `${kind} ${strand}`).toBe(table[strand][kind])
    for (const { kind, layout } of all) expect(layout.layers.map((l) => l.id).sort()).toEqual(tabsFor(kind).map((t) => layerId(t.id)).sort())
  })

  it('the layers after the first keep the order of the tabs', () => {
    const layout = keyboardLayout({ kind: 'expression', prompt: prompts.calculus })
    expect(layout.layers.map((l) => l.id)).toEqual(['jemma-calculus', 'jemma-letters', 'jemma-trig', 'jemma-compare'])
  })
})

describe('P146b: the keyboard opens on the tab that fits the question, not on the tab the last question was left on', () => {
  /** The editor's keyboard as the helper sees it, left by the last question on `left` (MathLive remembers the layer from one question to the next). */
  const keyboardLeftOn = (left: string, visible = false) => {
    const show = vi.fn()
    const executeCommand = vi.fn()
    const keyboard: KeyboardHandle & { show: typeof show; executeCommand: typeof executeCommand } = { visible, layouts: [], currentLayer: left, show, executeCommand }
    return keyboard
  }
  const everyTab = TABS.map((t) => layerId(t.id))

  it('the reported case: left on Calculus, an algebra equation opens on Letters', () => {
    const keyboard = keyboardLeftOn('jemma-calculus')
    const layout = keyboardLayout({ kind: 'equation', prompt: 'Solve x^2 - 5x + 6 = 0' })
    giveKeyboard(keyboard, layout)
    expect(keyboard.currentLayer).toBe('jemma-letters')
    expect(keyboard.layouts).toEqual([layout])
  })

  it('whatever tab the last question was left on, every kind and strand opens on its opening tab, a tab its layout has', () => {
    for (const left of everyTab) {
      for (const { kind, strand, layout } of all) {
        const keyboard = keyboardLeftOn(left)
        giveKeyboard(keyboard, layout)
        expect(keyboard.currentLayer, `${left} then ${kind} ${strand}`).toBe(layerId(openingTab(kind, strand)))
        expect(keyboard.currentLayer).toBe(openingLayerId(layout))
        expect(keyboard.currentLayer).toBe(layout.layers[0]!.id)
        expect(layout.layers.map((l) => l.id)).toContain(keyboard.currentLayer)
        expect(keyboard.layouts).toEqual([layout])
      }
    }
  })

  it('it never shows or hides the keyboard, and never runs a command (a command to switch the layer would show it)', () => {
    const keyboard = keyboardLeftOn('jemma-compare')
    giveKeyboard(keyboard, algebra('equation'))
    expect(keyboard.show).not.toHaveBeenCalled()
    expect(keyboard.executeCommand).not.toHaveBeenCalled()
    expect(keyboard.visible).toBe(false)
  })

  it('while the keyboard is up (a second box of the same question starting) the tab the learner chose stays', () => {
    const keyboard = keyboardLeftOn('jemma-compare', true)
    const layout = algebra('equation')
    giveKeyboard(keyboard, layout)
    expect(keyboard.currentLayer).toBe('jemma-compare')
    expect(keyboard.layouts).toEqual([layout])
  })

  it('a keyboard that was never used has no remembered layer, and is given the opening tab', () => {
    const keyboard: KeyboardHandle = { visible: false, layouts: [] }
    giveKeyboard(keyboard, keyboardLayout({ kind: 'expression', prompt: prompts.calculus }))
    expect(keyboard.currentLayer).toBe('jemma-calculus')
  })

  it('openingLayerId is the first layer of the layout', () => {
    for (const { layout } of all) expect(openingLayerId(layout)).toBe(layout.layers[0]!.id)
  })
})

describe('the keyboard is responsive: the CSS of a layer', () => {
  const style = keyboardLayout({ kind: 'expression', prompt: 'x' }).layers[0]!.style

  it('every layer carries the same CSS', () => {
    for (const { layout } of all) for (const layer of layout.layers) expect(layer.style).toBe(style)
  })

  it('MathLive\'s own variables: keys 46 px tall (at least 44), a gap of 4 px so ten keys fit, a laptop keyboard no wider than 64 px a key, fonts that follow the screen', () => {
    expect(style).toMatch(/--keycap-height: 46px/)
    expect(style).toMatch(/--keycap-gap: 4px/)
    expect(style).toMatch(/--keycap-max-width: 64px/)
    expect(style).toMatch(/--keycap-font-size: clamp\(16px, 5\.2vw, 24px\)/)
    expect(style).toMatch(/--keycap-small-font-size: clamp\(10\.5px, 3\.1vw, 16px\)/)
    expect(Number(/--keycap-height: (\d+)px/.exec(style)![1])).toBeGreaterThanOrEqual(44)
  })

  it('every key has no padding and its content is centred, so nothing sticks out of a key', () => {
    expect(style).toMatch(/\.MLK__keycap \{[^}]*padding: 0 !important/)
    expect(style).toMatch(/\.MLK__keycap \{[^}]*min-width: 0/)
    expect(style).toMatch(/\.MLK__keycap \{[^}]*align-items: center; justify-content: center/)
    // The action keys (the tabs, backspace, the arrows) are not drawn with the keycap class: they have no padding either (MathLive gives them 12 px each side).
    expect(style).toMatch(/\.action \{[^}]*padding: 0 !important/)
    expect(style).toMatch(/\.action \{[^}]*min-width: 0/)
  })

  it('the small text keys (sin, cos with a power, d/dx, f prime, lim, log) are 10.5 to 16 px and on one line', () => {
    expect(style).toMatch(/\.MLK__keycap\.small \{[^}]*font-size: clamp\(10\.5px, 3\.1vw, 16px\) !important/)
    expect(style).toMatch(/\.MLK__keycap\.small \{[^}]*white-space: nowrap/)
    for (const cap of [CAPS.sin, CAPS.cos, CAPS.tan, CAPS.asin, CAPS.acos, CAPS.atan, CAPS.ddx, CAPS.fPrime, CAPS.limit, CAPS.log, CAPS.ln, CAPS.fx]) expect(cap.class, cap.tooltip).toContain('small')
  })

  it('the tall faces (the fraction, 1.87 em high, the integral, 2.23 em, and the sum, 1.61 em) have a smaller font so they stay inside a 46 px key even on a laptop', () => {
    expect(CAPS.fraction.class).toContain('stack')
    expect(CAPS.integral.class).toContain('tall')
    expect(CAPS.sum.class).toContain('tall')
    expect(style).toMatch(/\.MLK__keycap\.stack \{[^}]*font-size: clamp\(13px, 4vw, 16px\) !important/)
    expect(style).toMatch(/\.MLK__keycap\.tall \{[^}]*font-size: clamp\(12px, 3\.6vw, 15px\) !important/)
    // measured with the editor's own renderer: a fraction is 1.87 times its font size high, an integral 2.23 times; a 46 px key has 44 px inside its border
    expect(1.87 * 16).toBeLessThanOrEqual(32)
    expect(2.23 * 15).toBeLessThanOrEqual(36)
    for (const width of [320, 360, 390, 430, 1440]) {
      expect(1.87 * Math.min(16, Math.max(13, 0.04 * width)), `fraction at ${width}`).toBeLessThanOrEqual(32)
      expect(2.23 * Math.min(15, Math.max(12, 0.036 * width)), `integral at ${width}`).toBeLessThanOrEqual(36)
      expect(1.61 * Math.min(15, Math.max(12, 0.036 * width)), `sum at ${width}`).toBeLessThanOrEqual(36)
      // every other maths face is at most 1.21 em high (a root), and the biggest font is 1.25 times 24 px for the signs
      expect(1.21 * Math.min(24, Math.max(16, 0.052 * width))).toBeLessThanOrEqual(44)
    }
  })

  it('the word of a tab is 11 to 15 px, one line, no padding, nothing cut off with dots, and the current tab is green with white words', () => {
    expect(style).toMatch(/\.tab \{[^}]*padding: 0 !important/)
    expect(style).toMatch(/\.tab \{[^}]*font-size: clamp\(11px, 3\.3vw, 15px\) !important/)
    expect(style).toMatch(/\.tab \{[^}]*white-space: nowrap/)
    expect(style).toMatch(/\.tab \{[^}]*overflow: hidden/)
    expect(style).toMatch(/\.tab \{[^}]*text-overflow: clip/)
    expect(style).toMatch(/\.tab \.tab-face \{[^}]*white-space: nowrap/)
    // South African colours: a picked tab is green (it was the old dark ink, #1f1d36), its words white, its edge the same green
    expect(style).toMatch(/\.tab\.is-current-tab \{[^}]*background: #007749 !important/)
    expect(style).toMatch(/\.tab\.is-current-tab \{[^}]*color: #ffffff !important/)
    expect(style).toMatch(/\.tab\.is-current-tab \{[^}]*border-color: #007749 !important/)
    expect(style).not.toMatch(/#1f1d36|#161616/i)
  })

  it('a key that is pressed is green too: the accent colour of the keyboard is Jemma\'s green, not the editor\'s own blue', () => {
    expect(style).toMatch(/\.ML__keyboard \{[^}]*--keyboard-accent-color: #007749/)
  })

  it('there is no fixed 16 px or 22 px size left from the old tab faces, and no em dash', () => {
    expect(style).not.toContain('font-size: 16px !important')
    expect(style).not.toContain('width: 22px')
    expect(style).not.toContain(String.fromCharCode(0x2014))
  })

  it('the size of a word on a key fits its key at 320, 360, 390 and 430 px (a key is a tenth of the width, less the gap; a word is about half its font size wide a letter)', () => {
    const fontPx = (min: number, vw: number, max: number, width: number) => Math.min(max, Math.max(min, (vw / 100) * width))
    for (const width of [320, 360, 390, 430, 1440]) {
      const unit = Math.min(64, width / 10)
      const key = (units: number) => units * unit - 4
      // the longest word on a tab: "Calculus" in a key two units wide, bold, about 0.62 of the font size a letter
      const tab = fontPx(11, 3.3, 15, width)
      expect(8 * 0.62 * tab, `Calculus at ${width}`).toBeLessThanOrEqual(key(2))
      // the longest small key in one unit: the inverse sine, "sin" and a small raised "-1": about 1.6 of the font size for the three letters and 0.9 for the power
      const small = fontPx(10.5, 3.1, 16, width)
      // the widest small key: tan with its raised -1, about 2.36 times the font size; the key has its border (2 px) inside its width
      expect(2.36 * small, `tan^-1 at ${width}`).toBeLessThanOrEqual(key(1) - 2 - 1)
    }
  })
})
