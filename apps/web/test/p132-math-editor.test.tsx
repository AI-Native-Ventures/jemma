import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { MathAnswerField } from '../app/k/session/_parts/MathAnswerField'
import { CAPS, keyboardLayout, keyName, ROW_WIDTH, rowUnits } from '../app/k/session/_parts/math-keyboard'
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

describe('the keyboard of the maths editor', () => {
  const kinds: TypedKind[] = ['number', 'expression', 'equation']
  const prompts = {
    algebra: 'Simplify x + x + 3',
    trigonometry: 'Work out sin 30',
    functions: 'Find the gradient of the line',
    calculus: 'Differentiate y = 3x^2',
    finance: 'How much interest is that?',
    data: 'What is the median?',
  }
  const all = kinds.flatMap((kind) => Object.entries(prompts).map(([strand, prompt]) => ({ kind, strand, layout: keyboardLayout({ kind, prompt }) })))

  it('five rows, and every row is seven units wide, so every key of every row is the same size (48 px on a 360 px phone)', () => {
    for (const { kind, strand, layout } of all) {
      expect(layout.rows, `${kind} ${strand}`).toHaveLength(5)
      for (const row of layout.rows) expect(rowUnits(row), `${kind} ${strand}`).toBe(ROW_WIDTH)
    }
    expect(360 / ROW_WIDTH).toBeGreaterThanOrEqual(48)
  })

  it('row 1 is always + - x / = ( ), in that order, for every topic and every kind of answer', () => {
    for (const { kind, strand, layout } of all) {
      expect(names(layout.rows[0]!), `${kind} ${strand}`).toEqual(['plus', 'minus', 'times', 'divided by', 'equals', 'open bracket', 'close bracket'])
    }
    expect(CAPS.plus.latex).toBe('+')
    expect(CAPS.minus.latex).toBe('-')
    expect(CAPS.times.latex).toBe('\\times')
    expect(CAPS.divide.latex).toBe('\\div')
    expect(CAPS.equals.latex).toBe('=')
  })

  it('row 2 is always the fraction (a top and a bottom), the square root, the cube root, x squared, x to a power, and backspace', () => {
    for (const { kind, strand, layout } of all) {
      expect(names(layout.rows[1]!), `${kind} ${strand}`).toEqual(['fraction', 'square root', 'cube root', 'squared', 'to the power of', 'backspace'])
    }
    expect(CAPS.fraction.latex).toBe('\\frac{#@}{#?}')
    expect(CAPS.sqrt.latex).toBe('\\sqrt{#0}')
    expect(CAPS.cbrt.latex).toBe('\\sqrt[3]{#0}')
    expect(CAPS.squared.insert).toBe('#@^2')
    expect(CAPS.power.insert).toBe('#@^{#?}')
  })

  it('row 3 is the keys of the topic: x y for algebra, sin cos tan for trigonometry, f(x), d/dx and f prime for functions and calculus, % and R for money', () => {
    const row3 = (kind: TypedKind, strand: keyof typeof prompts) => names(keyboardLayout({ kind, prompt: prompts[strand] }).rows[2]!)
    expect(row3('expression', 'algebra')).toEqual(['x', 'y', 'pi'])
    expect(row3('expression', 'trigonometry')).toEqual(['sine', 'cosine', 'tangent', 'theta', 'degrees', 'pi', 'x'])
    expect(row3('expression', 'functions')).toEqual(expect.arrayContaining(['x', 'f of x']))
    expect(row3('expression', 'calculus')).toEqual(expect.arrayContaining(['d y by d x', 'f prime of x']))
    expect(row3('expression', 'finance')).toEqual(expect.arrayContaining(['percent', 'rand']))
    expect(row3('expression', 'data')).toEqual(expect.arrayContaining(['percent', 'rand']))
    expect(row3('equation', 'trigonometry')).toEqual(expect.arrayContaining(['theta', 'degrees', 'pi', 'or']))
    expect(row3('equation', 'algebra')).toEqual(expect.arrayContaining(['x', 'plus or minus', 'or']))
    expect(row3('number', 'trigonometry')).toEqual(['sine', 'cosine', 'tangent', 'degrees', 'pi'])
    expect(row3('number', 'finance')).toEqual(['rand', 'percent'])
  })

  it('a number has no letter of algebra on its keyboard, and a derivative key is only on a question that asks for a derivative', () => {
    for (const { kind, layout } of all.filter((a) => a.kind === 'number')) expect(names(layout.rows[2]!)).not.toEqual(expect.arrayContaining(['x']))
    const plain = names(keyboardLayout({ kind: 'expression', topic: 'Calculus', prompt: 'Work out the limit' }).rows[2]!)
    expect(plain).not.toContain('d y by d x')
    expect(plain).not.toContain('f prime of x')
  })

  it('rows 4 and 5 are the digits 0 to 9, the decimal comma, the two arrows and hide the keyboard', () => {
    for (const { kind, strand, layout } of all) {
      expect(layout.rows[3], `${kind} ${strand}`).toEqual(['[1]', '[2]', '[3]', '[4]', '[5]', CAPS.left, CAPS.right])
      expect(layout.rows[4], `${kind} ${strand}`).toEqual(['[6]', '[7]', '[8]', '[9]', '[0]', CAPS.comma, CAPS.hide])
    }
    expect(CAPS.comma.insert).toBe('{,}')
  })

  it('no key is twice on a keyboard, and every key has a name for a screen reader', () => {
    for (const { kind, strand, layout } of all) {
      const all = layout.rows.flat().map((k) => keyName(k as never)).filter((n) => n !== '[separator]')
      expect(new Set(all).size, `${kind} ${strand}`).toBe(all.length)
      for (const k of layout.rows.flat()) expect(keyName(k as never).length).toBeGreaterThan(0)
    }
  })

  it('the layout is shaped for the editor: a layout with rows, no edit toolbar, a unique id by kind and strand', () => {
    const layout = keyboardLayout({ kind: 'expression', topic: 'Trigonometry', prompt: 'x' })
    expect(layout).toMatchObject({ id: 'jemma-expression-trigonometry', displayEditToolbar: false })
    expect(new Set(all.map((a) => a.layout.id)).size).toBe(all.length)
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

  it('a trigonometry topic gives the editor the trigonometry keyboard', async () => {
    render(<QuestionScreen q={ask({ prompt: 'Work out the length', answerKind: 'number' })} topic="Trigonometry" busy={false} onAnswer={() => {}} />)
    await ready()
    const layout = theKeyboard().layouts[0] as ReturnType<typeof keyboardLayout>
    expect(layout.id).toBe('jemma-number-trigonometry')
    expect(names(layout.rows[2]!)).toEqual(['sine', 'cosine', 'tangent', 'degrees', 'pi'])
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
