import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { MathAnswerField } from '../app/k/session/_parts/MathAnswerField'
import { CAPS, keyboardLayout, keyName } from '../app/k/session/_parts/math-keyboard'
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

// The keyboard itself (its rows, tabs, opening tab and CSS) is tested without the editor in p140-simple-keyboard.test.ts.

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

  it('a trigonometry topic opens the keyboard on the Trig tab', async () => {
    render(<QuestionScreen q={ask({ prompt: 'Work out the length', answerKind: 'number' })} topic="Trigonometry" busy={false} onAnswer={() => {}} />)
    await ready()
    const layout = theKeyboard().layouts[0] as ReturnType<typeof keyboardLayout>
    expect(layout.id).toBe('jemma-number-trigonometry')
    expect(layout.layers[0]!.id).toBe('jemma-trig')
    expect(names(layout.layers[0]!.rows[3]!)).toEqual(['sine', 'cosine', 'tangent', 'inverse sine', 'inverse cosine', 'inverse tangent', 'degrees', 'theta', 'alpha', 'beta'])
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
