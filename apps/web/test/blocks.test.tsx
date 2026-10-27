import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import {
  DemoBadge,
  EmptyState,
  ErrorRetry,
  Fraction,
  NeedsYouList,
  PaperCrop,
  Sidebar,
  SpaceHeader,
  StageTrack,
  TabBar,
  WhatJemmaDid,
} from '@/components/blocks'
import { Button, Field, ProgressDots, Sheet } from '@/components/ui'

const labels = (nav: HTMLElement) => within(nav).getAllByRole('link').map((a) => a.textContent?.trim())

describe('TabBar', () => {
  test('teacher and parent tab bars put Snap in the centre', () => {
    const { unmount } = render(<TabBar role="teacher" active="class" label="Class" />)
    const teacher = screen.getByRole('navigation', { name: 'Class' })
    expect(labels(teacher)).toEqual(['Class', 'Learners', 'Snap', 'Tests', 'Curriculum'])
    expect(labels(teacher)[2]).toBe('Snap')
    unmount()

    render(<TabBar role="parent" active="profile" label="Amina" />)
    const parent = screen.getByRole('navigation', { name: 'Amina' })
    const links = within(parent).getAllByRole('link')
    expect(links).toHaveLength(4)
    expect(links[2]?.textContent?.trim()).toBe('Snap')
    expect(links[2]?.querySelector('[data-raised="true"]')).not.toBeNull()
    expect(links[0]?.querySelector('[data-raised="true"]')).toBeNull()
  })

  test('learner tab bar has Today, My gaps, Me', () => {
    render(<TabBar role="learner" active="today" label="Amina" />)
    expect(labels(screen.getByRole('navigation'))).toEqual(['Today', 'My gaps', 'Me'])
  })

  test('active tab is marked current', () => {
    render(<TabBar role="teacher" active="tests" label="Class" />)
    const current = screen.getByRole('link', { current: 'page' })
    expect(current.textContent?.trim()).toBe('Tests')
  })

  test('hrefs follow the base path', () => {
    render(<TabBar role="parent" active="profile" label="Amina" base="/p/abc" />)
    expect(screen.getByRole('link', { name: 'Learn' }).getAttribute('href')).toBe('/p/abc/learn')
    expect(screen.getByRole('link', { name: 'Profile' }).getAttribute('href')).toBe('/p/abc')
  })
})

describe('Sidebar', () => {
  test('lists the same tabs in the same order as the tab bar', () => {
    render(
      <Sidebar
        role="teacher"
        active="class"
        label="Class"
        name="6B Mathematics"
        subtitle="Grade 6 · Hillview Primary"
        switchHref="/t"
        user={{ name: 'Ms Banda', initials: 'MB' }}
        settingsHref="/t/x/settings"
      />,
    )
    expect(labels(screen.getByRole('navigation', { name: 'Class' }))).toEqual([
      'Class',
      'Learners',
      'Snap',
      'Tests',
      'Curriculum',
    ])
  })
})

describe('Fraction', () => {
  test('renders a mixed number', () => {
    const { container } = render(<Fraction value="3 3/4" />)
    expect(container.querySelector('[data-part="whole"]')?.textContent).toBe('3')
    expect(container.querySelector('[data-part="numerator"]')?.textContent).toBe('3')
    expect(container.querySelector('[data-part="denominator"]')?.textContent).toBe('4')
  })

  test('renders a plain fraction without a whole part', () => {
    const { container } = render(<Fraction value="3/4" />)
    expect(container.querySelector('[data-part="whole"]')).toBeNull()
    expect(container.querySelector('[data-part="numerator"]')?.textContent).toBe('3')
    expect(container.querySelector('[data-part="denominator"]')?.textContent).toBe('4')
  })

  test('falls back to plain text for a non-fraction', () => {
    const { container } = render(<Fraction value="12" />)
    expect(container.textContent).toBe('12')
  })
})

describe('SpaceHeader', () => {
  test('shows name, subtitle, links and the demo badge', () => {
    render(
      <SpaceHeader
        name="6B Mathematics"
        subtitle="Grade 6 · Hillview Primary"
        switchHref="/t"
        settingsHref="/t/x/settings"
        demo
      />,
    )
    expect(screen.getByText('6B Mathematics')).toBeTruthy()
    expect(screen.getByText('Grade 6 · Hillview Primary')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Switch/ }).getAttribute('href')).toBe('/t')
    expect(screen.getByRole('link', { name: 'Settings' }).getAttribute('href')).toBe('/t/x/settings')
    expect(screen.getByText('Demo')).toBeTruthy()
  })

  test('omits the demo badge by default', () => {
    render(<SpaceHeader name="Amina" subtitle="Grade 6" switchHref="/p" settingsHref="/p/x" />)
    expect(screen.queryByText('Demo')).toBeNull()
  })
})

describe('NeedsYouList', () => {
  test('shows the count and one row per item', () => {
    render(
      <NeedsYouList
        items={[{ href: '/r', title: "Check 1 answer on Sipho's paper", detail: 'Class Test 1 · question 7' }]}
      />,
    )
    const section = screen.getByRole('region', { name: 'Needs you' })
    expect(within(section).getByText('1')).toBeTruthy()
    expect(within(section).getByRole('link').getAttribute('href')).toBe('/r')
  })

  test('renders nothing when there are no items', () => {
    const { container } = render(<NeedsYouList items={[]} />)
    expect(container.firstChild).toBeNull()
  })
})

describe('WhatJemmaDid', () => {
  const entries = [
    { at: '14:14', text: 'Planned tonight\'s lesson' },
    { at: '14:13', text: 'Found 3 class gaps' },
    { at: 'Sun 18:40', text: 'Read the homework' },
  ]

  test('lists entries newest first as given and respects limit', () => {
    render(<WhatJemmaDid entries={entries} limit={2} />)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]?.textContent).toContain('14:14')
  })

  test('shows a See all link when given a href', () => {
    render(<WhatJemmaDid entries={entries} seeAllHref="/n" />)
    expect(screen.getByRole('link', { name: 'See all' }).getAttribute('href')).toBe('/n')
  })
})

describe('StageTrack', () => {
  test('marks the current stage', () => {
    render(<StageTrack stage="practising" />)
    const items = screen.getAllByRole('listitem')
    expect(items.map((i) => i.textContent)).toEqual(['New', 'Practising', 'Fixed'])
    expect(items[1]?.getAttribute('aria-current')).toBe('step')
    expect(items[0]?.getAttribute('aria-current')).toBeNull()
  })
})

describe('ErrorRetry', () => {
  test('calls onRetry from the try again button', () => {
    const onRetry = vi.fn()
    render(<ErrorRetry title="I couldn't finish reading paper 4" body="The connection dropped." onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

describe('EmptyState, DemoBadge, PaperCrop', () => {
  test('EmptyState says nothing yet', () => {
    render(<EmptyState />)
    expect(screen.getByText(/Nothing yet/)).toBeTruthy()
  })

  test('DemoBadge reads Demo', () => {
    render(<DemoBadge />)
    expect(screen.getByText('Demo')).toBeTruthy()
  })

  test('PaperCrop renders its children', () => {
    render(<PaperCrop>Name Amina</PaperCrop>)
    expect(screen.getByText('Name Amina')).toBeTruthy()
  })
})

describe('ui primitives', () => {
  test('Button with href renders a link', () => {
    render(<Button href="/go">Go</Button>)
    expect(screen.getByRole('link', { name: 'Go' }).getAttribute('href')).toBe('/go')
  })

  test('Button without href renders a button that fires onClick', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Save</Button>)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  test('Field links its label to the input', () => {
    render(<Field label="Your child's name" defaultValue="Amina" />)
    expect((screen.getByLabelText("Your child's name") as HTMLInputElement).value).toBe('Amina')
  })

  test('ProgressDots reports filled of total', () => {
    render(<ProgressDots filled={4} total={5} label="4 of 5 learners" />)
    expect(screen.getByLabelText('4 of 5 learners')).toBeTruthy()
  })

  test('Sheet shows only when open and closes on Escape', () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <Sheet open={false} onClose={onClose} title="Coming after the challenge">
        Body
      </Sheet>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    rerender(
      <Sheet open onClose={onClose} title="Coming after the challenge">
        Body
      </Sheet>,
    )
    expect(screen.getByRole('dialog', { name: 'Coming after the challenge' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
