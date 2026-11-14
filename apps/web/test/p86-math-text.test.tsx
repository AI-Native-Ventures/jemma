import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { LessonSchema } from '@jemma/profiling/schemas'
import { render } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Frac, FractionText, hasMath, withFractions } from '../app/k/session/_parts/Frac'
import { Results } from '../app/k/session/_parts/Results'

// P86, decision 5: the screens draw powers and roots properly: x^2, x^(n+1) and the little 2 and 3 are raised, a root has a line over what is under it,
// the stacked fractions and the copy for a screen reader stay. A text with none of ^, a root sign, sqrt, a little 2 or a little 3 is drawn exactly as it was.

const props = { size: 34, rule: 3, gap: 4, side: 5 }
const drawnOf = (el: Element) => {
  const copy = el.cloneNode(true) as HTMLElement
  copy.querySelectorAll('.sr-only').forEach((e) => e.remove())
  return copy.textContent ?? ''
}
const show = (text: string) => render(<FractionText text={text} {...props} />).container

describe('hasMath', () => {
  it.each(['x^2', 'x²', 'x³', '√8', 'sqrt(8)', '2x^(n+1)', 'x⁴', 'x⁻¹'])('%j has math', (text) => expect(hasMath(text)).toBe(true))
  it.each(['1/2 + 1/4', 'Complete: 3/5 = ?/15', 'R4,50', 'Which is bigger?', '', '60 km/h', '3 3/4'])('%j has none', (text) => expect(hasMath(text)).toBe(false))
})

describe('a power is raised', () => {
  it('x^2: the 2 is raised, and the line for a screen reader is the line as it was written', () => {
    const c = show('Simplify x^2 + 1')
    expect(c.querySelector('sup')!.textContent).toBe('2')
    expect(drawnOf(c)).toBe('Simplify x2 + 1')
    expect(c.querySelector('.sr-only')!.textContent).toBe('Simplify x^2 + 1')
    expect(c.querySelector('[aria-hidden="true"]')).toBeTruthy()
  })

  it('x^(n+1): what is in the bracket is raised, without the bracket', () => {
    const c = show('x^(n+1)')
    expect(c.querySelector('sup')!.textContent).toBe('n+1')
    expect(drawnOf(c)).toBe('xn+1')
  })

  it('the little 2 and 3 are raised the same way', () => {
    const c = show('2x² + x³')
    expect([...c.querySelectorAll('sup')].map((s) => s.textContent)).toEqual(['2', '3'])
    expect(drawnOf(c)).not.toMatch(/[²³]/)
  })

  it('a minus in the exponent, a letter, two digits and what follows the exponent', () => {
    expect([...show('x^-1').querySelectorAll('sup')].map((s) => s.textContent)).toEqual(['-1'])
    expect([...show('x^n').querySelectorAll('sup')].map((s) => s.textContent)).toEqual(['n'])
    expect([...show('x^10').querySelectorAll('sup')].map((s) => s.textContent)).toEqual(['10'])
    const c = show('x^2y')
    expect(c.querySelector('sup')!.textContent).toBe('2')
    expect(drawnOf(c)).toBe('x2y')
  })

  it('a power inside a power is raised inside the raised part', () => {
    const c = show('x^(2^n)')
    expect(c.querySelector('sup sup')!.textContent).toBe('n')
  })

  it('a caret with nothing after it stays as it was typed', () => {
    for (const text of ['x^', '^', 'x^ 2', 'x^(2', 'a ^ b']) {
      const c = show(text)
      expect(c.querySelector('sup'), text).toBeNull()
      expect(drawnOf(c), text).toBe(text)
    }
  })
})

describe('a root has a line over what is under it', () => {
  const root = (c: Element) => c.querySelector<HTMLElement>('[data-root]')
  const under = (c: Element) => c.querySelector<HTMLElement>('[data-root] [data-radicand]')!

  it('a root sign and a number', () => {
    const c = show('√8')
    expect(root(c)).toBeTruthy()
    expect(under(c).textContent).toBe('8')
    expect(under(c).style.borderTop).not.toBe('')
    expect(drawnOf(c)).toBe('√8')
  })

  it('sqrt(8) is the same picture, with no bracket', () => {
    const c = show('sqrt(8)')
    expect(under(c).textContent).toBe('8')
    expect(drawnOf(c)).toBe('√8')
  })

  it('a bracket, a letter, a decimal', () => {
    expect(under(show('√(x+1)')).textContent).toBe('x+1')
    expect(under(show('√x')).textContent).toBe('x')
    expect(under(show('√2,5')).textContent).toBe('2,5')
  })

  it('the root covers the one number, letter or bracket after it, and no more', () => {
    const c = show('2√2x')
    expect(under(c).textContent).toBe('2')
    expect(drawnOf(c)).toBe('2√2x')
  })

  it('a power under a root is raised inside it', () => {
    const c = show('sqrt(x^2 + 1)')
    expect(c.querySelector('[data-radicand] sup')!.textContent).toBe('2')
  })

  it('a root sign with nothing after it, and the word sqrt in a sentence, stay as they were typed', () => {
    for (const text of ['√', 'the sqrt of 16', 'sqrt']) {
      const c = show(text)
      expect(root(c), text).toBeNull()
      expect(drawnOf(c), text).toBe(text)
    }
  })
})

describe('fractions are still stacked in a text that has math', () => {
  it('a fraction and a power in one line', () => {
    const c = show('1/2 of x^2')
    expect(c.querySelectorAll('span.inline-flex.flex-col')).toHaveLength(1)
    expect(c.querySelector('sup')!.textContent).toBe('2')
    expect(c.querySelector('.sr-only')!.textContent).toBe('1/2 of x^2')
  })

  it('an unknown part of a fraction is still an empty box', () => {
    expect(show('?/5 + x^2').querySelectorAll('[data-blank]')).toHaveLength(1)
  })
})

/** The FractionText of develop b11ae36, copied: what a text without math was drawn with. */
function LegacyFractionText({ text, size, rule, gap, side, color, className = 'mx-1 align-middle' }: { text: string; size: number; rule: number; gap: number; side: number; color?: string; className?: string }) {
  const parts = withFractions(text, (n, d, k) => <Frac key={k} top={n} bottom={d} size={size} rule={rule} gap={gap} side={side} color={color} className={className} />)
  if (parts.every((p) => typeof p === 'string')) return <>{text}</>
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">{parts}</span>
    </>
  )
}

type Replay = { response: { request?: unknown; content?: { type: string; text?: string }[] } }
function recordedStrings(): string[] {
  const replays = JSON.parse(gunzipSync(readFileSync(resolve(import.meta.dirname, '../../../fixtures/ai-replays.json.gz'))).toString()) as Replay[]
  const out: string[] = []
  const walk = (v: unknown) => {
    if (typeof v === 'string') out.push(v)
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  for (const r of replays) {
    if (!JSON.stringify(r.response.request ?? '').includes('Job: write_lesson')) continue
    const text = (r.response.content ?? []).filter((p) => p.type === 'text').map((p) => p.text ?? '').join('')
    try {
      const lesson = LessonSchema.safeParse(JSON.parse(text))
      if (lesson.success) walk(lesson.data)
    } catch {
      continue
    }
  }
  return out
}

describe('a text with none of ^, a root sign, sqrt, a little 2 or a little 3 is drawn exactly as it was', () => {
  const strings = recordedStrings()
  const plain = strings.filter((s) => !hasMath(s))

  it('there are thousands of recorded strings to try, and none of them has math (the demo lessons are fractions)', () => {
    expect(strings.length).toBeGreaterThan(2000)
    expect(plain.length).toBe(strings.length)
  })

  it('every string of every recorded lesson: the HTML of today and of the new drawing is the same', () => {
    const problems: string[] = []
    for (const text of plain) {
      for (const extra of [{}, { color: '#FFFFFF' }, { className: '' }]) {
        const now = renderToStaticMarkup(<FractionText text={text} {...props} {...extra} />)
        const before = renderToStaticMarkup(<LegacyFractionText text={text} {...props} {...extra} />)
        if (now !== before) problems.push(text)
      }
    }
    expect(problems).toEqual([])
  })

  it('so is every other text of a Grade 6 screen: money, mixed numbers, a missing part, units, dates', () => {
    const more = ['R4,50', '3 3/4', 'Complete: 3/5 = ?/15', '60 km/h', 'On 12/11/2026 we went', 'What is 1/2 + 1/4?', '0,75', '12 + 9 = ?', '2 × 3 = 6', '5 ÷ 5', 'a - b', '(1 + 2)', '']
    for (const text of more) {
      expect(renderToStaticMarkup(<FractionText text={text} {...props} />), text).toBe(renderToStaticMarkup(<LegacyFractionText text={text} {...props} />))
    }
  })
})

describe('the results screen draws the answers with the same notation', () => {
  it('what the child wrote and the right answer, and the question', () => {
    const { container } = render(
      <Results
        firstName="Amina"
        missed={[{ n: 1, prompt: 'Simplify x^2 * x^3', render: 'text', wrote: 'x^5 + 1', right: 'x⁵', why: 'Add the powers.', rightWay: 'x^2 * x^3 = x^(2+3) = x^5.' }]}
      />,
    )
    const article = container.querySelector('article')!
    const heading = article.querySelector('[data-question]')!
    expect([...heading.querySelectorAll('sup')].map((s) => s.textContent)).toEqual(['2', '3'])
    const answers = [...article.querySelectorAll('.bg-soft-2, .bg-\\[\\#FFF1ED\\]')]
    expect(answers).toHaveLength(2)
    expect(answers[0]!.querySelector('sup')!.textContent).toBe('5')
    expect(answers[1]!.querySelector('sup')!.textContent).toBe('5')
    expect([...article.querySelectorAll('sup')].map((s) => s.textContent)).toContain('2+3')
  })
})
