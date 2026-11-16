import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/react'
import { readMath } from '@jemma/profiling/logic'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { FractionText, katexHtml, MathText } from '../app/k/session/_parts/Frac'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { Results } from '../app/k/session/_parts/Results'
import { hasTypeset, segments, toLatex, toLatexRun } from '../app/k/session/_parts/typeset'
import type { QuestionForChild } from '../app/k/session/[sessionId]/logic'

// P125b: every maths on the learner's screens is typeset by KaTeX: the question, the warm-up, the captions, the answers, the worked steps and the line
// under the answer box. The plain notation becomes LaTeX by a pure function, the words stay words, and a primary screen is drawn as it always was.
// react-dom only: no server, no browser, no network.

const MINUS = '−'
const props = { size: 34, rule: 3, gap: 4, side: 5 }
const D = '\\displaystyle '

describe('the LaTeX of a line of maths', () => {
  const table: [text: string, latex: string][] = [
    // fractions
    ['x/2', `${D}\\frac{x}{2}`],
    ['x/2 + 6 = 10', `${D}\\frac{x}{2}+6=10`],
    ['(x+1)/2', `${D}\\frac{x+1}{2}`],
    ['(x+1)/(x-1)', `${D}\\frac{x+1}{x-1}`],
    ['3/4', `${D}\\frac{3}{4}`],
    ['2x/3', `${D}\\frac{2x}{3}`],
    ['1/2/3', `${D}\\frac{\\frac{1}{2}}{3}`],
    ['1/2x', `${D}\\frac{1}{2}x`],
    // mixed numbers and the decimal comma
    ['1 1/2', `${D}1\\frac{1}{2}`],
    [`${MINUS}2 3/4`, `${D}-2\\frac{3}{4}`],
    ['0,5', `${D}0{,}5`],
    ['0,5 + 1,25', `${D}0{,}5+1{,}25`],
    // powers
    ['x^2', `${D}{x}^{2}`],
    ['x²', `${D}{x}^{2}`],
    ['x³ + 1', `${D}{x}^{3}+1`],
    ['x^(n+1)', `${D}{x}^{n+1}`],
    ['x^-1', `${D}{x}^{-1}`],
    ['x^(2^n)', `${D}{x}^{{2}^{n}}`],
    ['2x² + 7x', `${D}2{x}^{2}+7x`],
    // roots
    ['√(48)', `${D}\\sqrt{48}`],
    ['√8', `${D}\\sqrt{8}`],
    ['sqrt(x+1)', `${D}\\sqrt{x+1}`],
    ['2√2', `${D}2\\sqrt{2}`],
    ['√(x^2 + 1)', `${D}\\sqrt{{x}^{2}+1}`],
    // trigonometry, pi, theta, degrees
    ['sin(30°)', `${D}\\sin\\left({30}^{\\circ}\\right)`],
    ['sin x', `${D}\\sin\\left(x\\right)`],
    ['cos(60)', `${D}\\cos\\left(60\\right)`],
    ['tan 45°', `${D}\\tan\\left({45}^{\\circ}\\right)`],
    ['sin^2(x)', `${D}\\sin^{2}\\left(x\\right)`],
    ['2sin(x)cos(x)', `${D}2\\sin\\left(x\\right)\\cos\\left(x\\right)`],
    ['π', `${D}\\pi `],
    ['2πr', `${D}2\\pi r`],
    ['2pi r', `${D}2\\pi r`],
    ['sin θ', `${D}\\sin\\left(\\theta \\right)`],
    ['30°', `${D}{30}^{\\circ}`],
    // signs
    ['3 − 6', `${D}3-6`],
    ['-3', `${D}-3`],
    ['2 × 3', `${D}2\\times 3`],
    ['2*3', `${D}2\\times 3`],
    ['6 ÷ 3', `${D}6\\div 3`],
    ['3(x+1)', `${D}3\\left(x+1\\right)`],
    ['(x+2)(x+3)', `${D}\\left(x+2\\right)\\left(x+3\\right)`],
    // relations
    ['x = 3', `${D}x=3`],
    ['x ≤ 3', `${D}x\\leq 3`],
    ['x >= 3', `${D}x\\geq 3`],
    ['x ≠ 0', `${D}x\\neq 0`],
    ['x < 3', `${D}x<3`],
    ['f(x) = 2x + 1', `${D}f\\left(x\\right)=2x+1`],
    // a piece cut from a longer line keeps the spacing of a sign between two things
    ['+ 6', `${D}{}+6`],
    ['= 10', `${D}{}=10`],
    ['- 3', `${D}{}-3`],
  ]
  it.each(table)('%s', (text, latex) => {
    expect(toLatexRun(text)).toBe(latex)
  })

  it('what is not maths the marking can read is null: it stays text', () => {
    for (const text of ['', '2 3', '(', 'x +', '√', 'x^', 'sin', '= =', `${'x+'.repeat(40)}x`]) expect(toLatexRun(text), text).toBeNull()
  })

  it('the LaTeX is built from the tree: a command a letter could follow ends with a space', () => {
    expect(toLatex(readMath('2πr')!)).toBe('2\\pi r')
    expect(toLatex(readMath('θx')!)).toBe('\\theta x')
  })

  it('nothing of what was typed gets into the LaTeX except numbers, letters and fixed commands', () => {
    for (const text of ['x^2', 'sin x', '√(x)', 'x/2']) expect(toLatexRun(text)).toMatch(/^[A-Za-z0-9{}\\ ^+=<>,.()-]*$/)
  })
})

describe('the words and the maths of a line', () => {
  const view = (text: string, mode: 'force' | 'all' | 'algebra') => segments(text, mode).map((s) => (s.kind === 'text' ? `[${s.text}]` : `<${s.plain}>`)).join('')

  it('"Solve: x/2 + 6 = 10": "Solve:" is words, the equation is maths', () => {
    expect(view('Solve: x/2 + 6 = 10', 'all')).toBe('[Solve: ]<x/2 + 6 = 10>')
    expect(view('Solve: x/2 + 6 = 10', 'algebra')).toBe('[Solve: ]<x/2 + 6 = 10>')
  })

  it('"Expand: (x + 2)(x + 3)": the words are unchanged and the brackets are maths', () => {
    expect(view('Expand: (x + 2)(x + 3)', 'all')).toBe('[Expand: ]<(x + 2)(x + 3)>')
  })

  it('a power and an equation inside a sentence, and the question mark stays a mark', () => {
    expect(view('What is x^2 when x = 3?', 'all')).toBe('[What is ]<x^2>[ when ]<x = 3>[?]')
    expect(view('Simplify x^2 * x^3', 'all')).toBe('[Simplify ]<x^2 * x^3>')
    expect(view('Work out sin(30°)', 'all')).toBe('[Work out ]<sin(30°)>')
  })

  it('"or" between two answers is a word', () => {
    expect(view('x = 3 or x = -1', 'all')).toBe('<x = 3>[ or ]<x = -1>')
  })

  it('a sum of numbers is maths for a senior question and words for any other', () => {
    expect(view('What is 3 - 6?', 'all')).toBe('[What is ]<3 - 6>[?]')
    expect(view('What is 3 - 6?', 'algebra')).toBe('[What is 3 - 6?]')
    expect(view('Which is bigger: 1/2 or 3/4?', 'all')).toBe('[Which is bigger: ]<1/2>[ or ]<3/4>[?]')
    expect(view('Which is bigger: 1/2 or 3/4?', 'algebra')).toBe('[Which is bigger: 1/2 or 3/4?]')
  })

  it('words only, a list of numbers, money and a date are words', () => {
    for (const text of ['Which shape has four sides?', 'Find the median of 3, 5, 9', 'It costs R12,50 today', 'Level 2 - fractions', 'Walk 60 km/h', '']) {
      expect(view(text, 'all'), text).toBe(`[${text}]`)
      expect(hasTypeset(text, 'algebra'), text).toBe(false)
    }
  })

  it('a lone x, y, z or n is words for any question but a senior one (P141: there it is maths, like the equations round it)', () => {
    expect(view('Solve for x', 'algebra')).toBe('[Solve for x]')
    expect(hasTypeset('Solve for x', 'algebra')).toBe(false)
    expect(view('Solve for x', 'all')).toBe('[Solve for ]<x>')
  })

  it('two letters and a minus are words for any question but a senior one', () => {
    expect(view('a - b', 'algebra')).toBe('[a - b]')
    expect(view('a - b', 'all')).toBe('<a - b>')
  })

  it('a sentence that has x in it but no sign: the x is maths in a senior line (P141) and a letter in any other', () => {
    expect(view('Find x: 2x + 3 = 11', 'all')).toBe('[Find ]<x>[: ]<2x + 3 = 11>')
    expect(view('Find x', 'all')).toBe('[Find ]<x>')
    expect(view('Find x: 2x + 3 = 11', 'algebra')).toBe('[Find x: ]<2x + 3 = 11>')
    expect(view('Find x', 'algebra')).toBe('[Find x]')
  })

  it('a line that does not read is words: the maths stays as it was typed', () => {
    expect(view('Simplify x^ and then', 'all')).toBe('[Simplify x^ and then]')
    expect(view('Is 2 3 + 4 right?', 'all')).toBe('[Is 2 3 + 4 right?]')
  })

  it('a piece of a line (an answer, a worked step) is maths in force mode, a lone number too', () => {
    expect(view('x = 3', 'force')).toBe('<x = 3>')
    expect(view('+ 6', 'force')).toBe('<+ 6>')
    expect(view('12', 'force')).toBe('<12>')
    expect(view('x', 'force')).toBe('<x>')
  })
})

describe('the text on the screen', () => {
  const markup = (text: string, extra: object = {}) => renderToStaticMarkup(<FractionText text={text} {...props} {...extra} />)

  it('"Solve: x/2 + 6 = 10": "Solve:" is text, x/2 is a fraction in KaTeX, the plain line is kept for a screen reader', () => {
    const { container } = render(<FractionText text="Solve: x/2 + 6 = 10" {...props} />)
    expect(container.querySelectorAll('.katex')).toHaveLength(1)
    expect(container.querySelectorAll('.mfrac')).toHaveLength(1)
    expect(container.querySelector('.sr-only')!.textContent).toBe('Solve: x/2 + 6 = 10')
    const drawn = container.querySelector('[aria-hidden="true"]')!
    expect(drawn.textContent!.startsWith('Solve: ')).toBe(true)
  })

  it('"Expand: (x + 2)(x + 3)" is words and maths', () => {
    const { container } = render(<FractionText text="Expand: (x + 2)(x + 3)" {...props} />)
    expect(container.querySelector('.katex')).toBeTruthy()
    expect(container.querySelector('.sr-only')!.textContent).toBe('Expand: (x + 2)(x + 3)')
  })

  it('a prompt of words only is exactly its text', () => {
    expect(markup('Which shape has four sides?')).toBe('Which shape has four sides?')
    expect(markup('Which shape has four sides?', { typeset: 'all' })).toBe('Which shape has four sides?')
  })

  it('a primary line of numbers is drawn as it always was, no KaTeX', () => {
    for (const text of ['12 + 7', '2 × 3 = 6', 'What is 1/2 + 1/4?', 'Complete: 3/5 = ?/15', 'a - b', '(1 + 2)']) expect(markup(text), text).not.toContain('katex')
  })

  it('the KaTeX is drawn as HTML and nothing else: no script, no link, no address of another site', () => {
    const html = markup('Solve: x/2 + 6 = 10')
    expect(html).not.toMatch(/<script|<link|<img|https?:\/\//)
  })

  it('the words around the maths keep their stacked digit fractions and empty boxes', () => {
    const { container } = render(<FractionText text="?/5 + x^2" {...props} />)
    expect(container.querySelectorAll('[data-blank]')).toHaveLength(1)
    expect(container.querySelector('.msupsub')).toBeTruthy()
  })

  it('MathText makes every line of maths KaTeX, and text it cannot read stays text', () => {
    const maths = render(<MathText text="x/2 + 6 = 10" {...props} />).container
    expect(maths.querySelector('.katex')).toBeTruthy()
    expect(maths.querySelectorAll('.mfrac')).toHaveLength(1)
    const words = render(<MathText text="Not sure yet" {...props} />).container
    expect(words.querySelector('.katex')).toBeNull()
    expect(words.textContent).toContain('Not sure yet')
  })

  it('the colour of a button is the colour of its maths', () => {
    const { container } = render(<FractionText text="x^2 + 1" {...props} color="#FFFFFF" />)
    expect((container.querySelector('[data-math]') as HTMLElement).style.color).toBe('rgb(255, 255, 255)')
  })

  it('the size is the size given (the maths is as big as the words around it), not KaTeX\'s own', () => {
    const { container } = render(<FractionText text="x^2 + 1" {...props} size={26} />)
    expect((container.querySelector('[data-math]') as HTMLElement).style.fontSize).toBe('26px')
  })

  it('katexHtml gives null for LaTeX that KaTeX cannot draw, never an error and never red text', () => {
    expect(katexHtml('\\frac{')).toBeNull()
    expect(katexHtml('\\notacommand')).toBeNull()
    expect(katexHtml('\\frac{x}{2}')).toContain('mfrac')
  })
})

describe('the screens', () => {
  const ask = (over: Partial<QuestionForChild>): QuestionForChild => ({ position: 3, phase: 'try', index: 1, of: 5, prompt: 'Work it out', render: 'text', answerKind: 'whole', ...over })
  const screen = (q: QuestionForChild) => {
    const el = document.createElement('div')
    el.innerHTML = renderToStaticMarkup(<QuestionScreen q={q} busy={false} onAnswer={() => {}} />)
    return el
  }

  it('the question of a senior class: the equation is typeset, data-prompt and the plain words are what they were', () => {
    const page = screen(ask({ prompt: 'Solve: x/2 + 6 = 10', answerKind: 'equation' }))
    const h1 = page.querySelector('h1[data-prompt]')!
    expect(h1.getAttribute('data-prompt')).toBe('Solve: x/2 + 6 = 10')
    expect(h1.querySelectorAll('.mfrac')).toHaveLength(1)
    expect(h1.querySelector('.sr-only')!.textContent).toBe('Solve: x/2 + 6 = 10')
  })

  it('a number question of a senior class has its sum typeset too, a primary one does not', () => {
    expect(screen(ask({ prompt: 'What is 3 - 6?', answerKind: 'number' })).querySelector('h1 .katex')).toBeTruthy()
    const primary = screen(ask({ prompt: 'What is 12 + 7?', answerKind: 'whole' }))
    expect(primary.querySelector('h1 .katex')).toBeNull()
    expect(primary.querySelector('h1')!.textContent).toBe('What is 12 + 7?')
  })

  it('"Expand: (x + 2)(x + 3)" keeps its words and typesets the brackets', () => {
    const h1 = screen(ask({ prompt: 'Expand: (x + 2)(x + 3)', answerKind: 'expression' })).querySelector('h1[data-prompt]')!
    expect(h1.querySelector('.katex')).toBeTruthy()
    expect(h1.querySelector('.sr-only')!.textContent).toBe('Expand: (x + 2)(x + 3)')
  })

  it('a warm-up question (a choice) with algebra in it is typeset, and so are its choices', () => {
    const page = screen(ask({ phase: 'warmup', of: 2, prompt: 'What is x^2 when x = 3?', answerKind: 'choice', choices: ['6', '9', '2x', 'x/2'] }))
    expect(page.querySelector('h1 .msupsub')).toBeTruthy()
    expect(page.querySelectorAll('button[aria-pressed] .mfrac')).toHaveLength(1)
  })

  it('a question of words only is what it was', () => {
    const page = screen(ask({ prompt: 'Which shape has four equal sides?', answerKind: 'whole' }))
    expect(page.querySelector('h1')!.textContent).toBe('Which shape has four equal sides?')
    expect(page.querySelector('h1 .katex')).toBeNull()
  })

  it('the worked steps on the results card are typeset: x/2 shows x over 2', () => {
    const { container } = render(
      <Results
        firstName="Amina"
        missed={[
          { n: 1, correct: false, prompt: 'Solve: x/2 + 6 = 10', render: 'text', wrote: 'x = 4', right: 'x = 8', why: 'Take 6 off both sides.', rightWay: 'x/2 = 4, so x = 8.', steps: ['x/2 + 6 = 10', 'x/2 = 4', 'x = 8'] },
        ]}
      />,
    )
    const steps = container.querySelector('[data-steps]')!
    expect(steps.querySelectorAll('.mfrac').length).toBeGreaterThanOrEqual(2)
    expect(steps.textContent).toContain('How to get there')
  })

  it('the caption of a lesson step is typeset when it has algebra in it', () => {
    const { container } = render(<FractionText text="Take 6 off both sides: x/2 = 4" size={20} rule={2} gap={3} side={3} />)
    expect(container.querySelector('.mfrac')).toBeTruthy()
    expect(container.querySelector('.sr-only')!.textContent).toBe('Take 6 off both sides: x/2 = 4')
  })
})

describe('KaTeX is served from this app', () => {
  const css = readFileSync(resolve(import.meta.dirname, '../node_modules/katex/dist/katex.min.css'), 'utf8')
  const layout = readFileSync(resolve(import.meta.dirname, '../app/layout.tsx'), 'utf8')

  it('the stylesheet names no address of another site, and every font is a file next to it', () => {
    expect(css).not.toMatch(/https?:\/\//)
    expect(css).not.toMatch(/\/\/(cdn|fonts)\./)
    const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]!.replace(/["']/g, ''))
    expect(urls.length).toBeGreaterThan(10)
    for (const u of urls) expect(u.startsWith('fonts/'), u).toBe(true)
  })

  it('the app takes the stylesheet from its own package, through its own build', () => {
    expect(layout).toContain("import 'katex/dist/katex.min.css'")
    expect(layout).not.toMatch(/cdn\.jsdelivr|unpkg|cdnjs|<link[^>]*katex/)
  })

  it('the package is pinned to one version', () => {
    const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8')) as { dependencies: Record<string, string> }
    expect(pkg.dependencies.katex).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('the size of the maths is set in the app css, the 1.21em of KaTeX is taken off', () => {
    const globals = readFileSync(resolve(import.meta.dirname, '../app/globals.css'), 'utf8')
    expect(globals).toMatch(/\.jemma-math \.katex\s*\{\s*font-size:\s*1em/)
  })
})
