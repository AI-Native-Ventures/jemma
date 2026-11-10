import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// The card's words are the same on every screen, because every screen draws the same component.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))
vi.mock('../app/t/[classId]/snap/actions', () => ({ shareTest: vi.fn() }))

describe('the Share with parents card', () => {
  it('says the same words as the packet, with a count of papers', async () => {
    const { ShareCard, shareCardWords } = await import('../app/t/[classId]/ShareCard')
    expect(shareCardWords({ marked: 4, waiting: 1 })).toEqual({
      title: 'Results are ready. Parents see nothing yet.',
      marked: '4 papers marked',
      waiting: '1 still needs you. You can share now and those follow when you have checked them.',
      button: 'Share with parents',
    })
    expect(shareCardWords({ marked: 1, waiting: 0 })).toMatchObject({ marked: '1 paper marked', waiting: null })
    expect(shareCardWords({ marked: 3, waiting: 2 }).waiting).toBe('2 still need you. You can share now and those follow when you have checked them.')

    render(<ShareCard classId="c" card={{ testId: 't', marked: 4, waiting: 1 }} />)
    expect(screen.getByRole('region', { name: 'Results are ready. Parents see nothing yet.' })).toBeTruthy()
    expect(screen.getByText('4 papers marked')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Share with parents' })).toBeTruthy()
  })

  it('leaves out the second line when nothing waits in Needs you', async () => {
    const { ShareCard } = await import('../app/t/[classId]/ShareCard')
    render(<ShareCard classId="c" card={{ testId: 't', marked: 5, waiting: 0 }} />)
    expect(screen.queryByText(/still need/)).toBeNull()
  })
})
