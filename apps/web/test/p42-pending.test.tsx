import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

let pathname = '/a'
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import { Button } from '@/components/ui/Button'
import { NavProgress } from '@/components/ui/NavProgress'

afterEach(() => {
  cleanup()
  pathname = '/a'
})

describe('Button pending', () => {
  it('idle: no spinner, enabled', () => {
    render(<Button>Save</Button>)
    expect(screen.queryByRole('status')).toBeNull()
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false)
  })

  it('pending prop: spinner, disabled, keeps label, ignores taps', () => {
    const onClick = vi.fn()
    render(
      <Button pending onClick={onClick}>
        Save
      </Button>,
    )
    const btn = screen.getByRole('button') as HTMLButtonElement
    expect(screen.getByRole('status')).toBeTruthy()
    expect(btn.disabled).toBe(true)
    expect(btn.getAttribute('aria-busy')).toBe('true')
    expect(btn.textContent).toContain('Save')
    fireEvent.click(btn)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('submit inside a running server action form shows the spinner', async () => {
    let release!: () => void
    const action = () => new Promise<void>((r) => (release = r))
    render(
      <form action={action}>
        <Button type="submit">Approve</Button>
      </form>,
    )
    expect(screen.queryByRole('status')).toBeNull()
    await act(async () => {
      fireEvent.submit(screen.getByRole('button').closest('form')!)
    })
    const btn = screen.getByRole('button') as HTMLButtonElement
    expect(screen.getByRole('status')).toBeTruthy()
    expect(btn.disabled).toBe(true)
    expect(btn.textContent).toContain('Approve')
    await act(async () => release())
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('NavProgress', () => {
  const bar = () => document.querySelector('[data-nav-progress]') as HTMLElement

  it('is idle at first', () => {
    render(<NavProgress />)
    expect(bar().dataset.state).toBe('idle')
  })

  it('starts on an in-app link tap and ends when the new page renders', () => {
    const { rerender } = render(
      <>
        <NavProgress />
        <a href="/b" data-testid="l">
          go
        </a>
      </>,
    )
    fireEvent.click(screen.getByTestId('l'))
    expect(bar().dataset.state).toBe('loading')
    pathname = '/b'
    rerender(
      <>
        <NavProgress />
        <a href="/b" data-testid="l">
          go
        </a>
      </>,
    )
    expect(bar().dataset.state).toBe('done')
  })

  it('ignores external links, new-tab links and modified clicks', () => {
    render(
      <>
        <NavProgress />
        <a href="https://example.com/x" data-testid="ext">x</a>
        <a href="/b" target="_blank" data-testid="blank">x</a>
        <a href="/b" data-testid="mod">x</a>
      </>,
    )
    fireEvent.click(screen.getByTestId('ext'))
    fireEvent.click(screen.getByTestId('blank'))
    fireEvent.click(screen.getByTestId('mod'), { metaKey: true })
    expect(bar().dataset.state).toBe('idle')
  })

  it('starts on a router.push style RSC fetch and ends when it settles', async () => {
    let finish!: () => void
    const original = vi.fn(() => new Promise<Response>((r) => (finish = () => r(new Response('ok')))))
    window.fetch = original as unknown as typeof fetch
    render(<NavProgress />)
    let p!: Promise<Response>
    act(() => {
      p = window.fetch('/b?_rsc=1', { headers: { RSC: '1' } })
    })
    expect(bar().dataset.state).toBe('loading')
    await act(async () => {
      finish()
      await p
    })
    expect(bar().dataset.state).toBe('done')
  })

  it('does not show for prefetches', () => {
    window.fetch = vi.fn(() => new Promise<Response>(() => undefined)) as unknown as typeof fetch
    render(<NavProgress />)
    act(() => {
      void window.fetch('/b', { headers: { RSC: '1', 'Next-Router-Prefetch': '1' } })
    })
    expect(bar().dataset.state).toBe('idle')
  })
})
