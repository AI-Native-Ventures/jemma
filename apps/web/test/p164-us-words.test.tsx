import { act, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { UsWords } from '../components/UsWords'
import { usWords } from '../lib/us-words'

// P164: a family in the US reads US English on the screens ("math", "practice"); everyone else reads the app as it is written.

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

describe('the US words', () => {
  it('change whole words and keep their capitals', () => {
    expect(usWords('Learn maths until you understand it.')).toBe('Learn math until you understand it.')
    expect(usWords('Practise at home with Amina')).toBe('Practice at home with Amina')
    expect(usWords('PRACTISING MATHS')).toBe('PRACTICING MATH')
    expect(usWords('Amina practised it and practises again.')).toBe('Amina practiced it and practices again.')
    expect(usWords('A colourful centre, 3 metres and 2 litres')).toBe('A colorful center, 3 meters and 2 liters')
    expect(usWords('Your enrolment')).toBe('Your enrollment')
  })

  it('say "checks" and "grades" where the app says Jemma marks, as the landing page does', () => {
    expect(usWords('Jemma marks your answers and teaches again what you got wrong.')).toBe('Jemma checks your answers and teaches again what you got wrong.')
    expect(usWords('Snap your work and Jemma marks it.')).toBe('Snap your work and Jemma checks it.')
    expect(usWords('No marks. Just do your best.')).toBe('No grades. Just do your best.')
    expect(usWords('12 questions, about 10 minutes. No marks.')).toBe('12 questions, about 10 minutes. No grades.')
    expect(usWords('Marks by topic')).toBe('Marks by topic')
  })

  it('leave every other word alone, and give back the same text when there is nothing to change', () => {
    expect(usWords('Mathematics, Grade 6')).toBe('Mathematics, Grade 6')
    expect(usWords('Practice makes it stick.')).toBe('Practice makes it stick.')
    const same = 'Nothing to change here.'
    expect(usWords(same)).toBe(same)
    expect(usWords('')).toBe('')
  })
})

function Screen() {
  const [more, setMore] = useState(false)
  return (
    <div>
      <h1>My maths</h1>
      <button type="button" aria-label="Practise now" onClick={() => setMore(true)}>
        Practise
      </button>
      <input defaultValue="maths" aria-label="Your answer" />
      <span className="katex">maths</span>
      <p data-no-us-words="">maths, as typed</p>
      {more ? <p>Your next practise: colours</p> : null}
    </div>
  )
}

describe('the screens of a family in the US', () => {
  it('show the US words, now and after a change, and never touch what a person types or the maths', async () => {
    const { container, getByRole } = render(
      <>
        <UsWords />
        <Screen />
      </>,
    )
    expect(container.querySelector('h1')!.textContent).toBe('My math')
    expect(getByRole('button').textContent).toBe('Practice')
    expect(getByRole('button').getAttribute('aria-label')).toBe('Practice now')
    expect((container.querySelector('input') as HTMLInputElement).value).toBe('maths')
    expect(container.querySelector('.katex')!.textContent).toBe('maths')
    expect(container.querySelector('[data-no-us-words]')!.textContent).toBe('maths, as typed')
    expect(document.documentElement.lang).toBe('en-US')
    await act(async () => {
      getByRole('button').click()
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(container.textContent).toContain('Your next practice: colors')
  })

  it('leave text React has not taken over yet, so React never finds text it did not write', async () => {
    render(<UsWords />)
    const loose = document.createElement('p')
    loose.textContent = 'maths from a part still arriving'
    await act(async () => {
      document.body.appendChild(loose)
      await Promise.resolve()
    })
    expect(loose.textContent).toBe('maths from a part still arriving')
    loose.remove()
  })

  it('is drawn by the learner, parent, teacher and sign-in spaces, and only for the US', () => {
    expect(read('app/k/layout.tsx')).toContain('usForLearner(child)')
    expect(read('app/k/layout.tsx')).toContain('{us ? <UsWords /> : null}')
    expect(read('app/p/layout.tsx')).toContain('usForParent(auth.user.id')
    expect(read('app/t/layout.tsx')).toContain('usForTeacher(auth.user.id)')
    expect(read('app/(auth)/layout.tsx')).toContain("usForVisitor((await headers()).get('cf-ipcountry'))")
    expect(read('lib/us-words-on.ts')).toContain("=== 'US'")
  })
})
