import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MathAnswerField, scrollNeeded } from '../app/k/session/_parts/MathAnswerField'
import { keyboardLayout } from '../app/k/session/_parts/math-keyboard'
import { theField, theKeyboard } from './fake-mathlive'

// P140b: on a phone the answer box is never hidden behind the maths keyboard: when the keyboard is up and covers the box, the page scrolls the box just above
// it. The helper that says how far is pure; the wiring is tested with the editor stood in for by a fake (no browser, no database, no network).
vi.mock('mathlive', async () => (await import('./fake-mathlive')).fakeMathlive())

const box = (top: number, bottom: number) => ({ top, bottom })

describe('scrollNeeded: how far the page must scroll so the box is above the keyboard', () => {
  it('0 when the bottom of the box is already at or above the keyboard top less the gap (12 px)', () => {
    expect(scrollNeeded(box(100, 200), 400)).toBe(0)
    expect(scrollNeeded(box(100, 388), 400)).toBe(0)
    expect(scrollNeeded(box(300, 389), 400)).toBe(1)
  })

  it('the px the box is covered by, plus the gap, when it is covered', () => {
    expect(scrollNeeded(box(500, 580), 480)).toBe(112)
    expect(scrollNeeded(box(400, 700), 600)).toBe(112)
    // a box under the keyboard altogether
    expect(scrollNeeded(box(700, 780), 480)).toBe(312)
  })

  it('the gap can be given, and 0 is a box that touches the keyboard', () => {
    expect(scrollNeeded(box(300, 400), 400, 0)).toBe(0)
    expect(scrollNeeded(box(300, 401), 400, 0)).toBe(1)
    expect(scrollNeeded(box(300, 365), 400, 40)).toBe(5)
    expect(scrollNeeded(box(300, 395), 400, 40)).toBe(35)
  })

  it('a very tall box is scrolled only far enough to put its top at 8 px', () => {
    expect(scrollNeeded(box(100, 700), 400)).toBe(92)
    expect(scrollNeeded(box(60, 700), 400)).toBe(52)
    // the cap holds for any size of gap
    expect(scrollNeeded(box(100, 700), 400, 100)).toBe(92)
  })

  it('never negative: a box whose top is already at 8 px or above is not scrolled, however it is covered', () => {
    expect(scrollNeeded(box(8, 700), 400)).toBe(0)
    expect(scrollNeeded(box(4, 500), 300)).toBe(0)
    expect(scrollNeeded(box(-50, 500), 300)).toBe(0)
    expect(scrollNeeded(box(9, 700), 400)).toBe(1)
  })

  it('0 for numbers that are not numbers', () => {
    expect(scrollNeeded(box(Number.NaN, 500), 300)).toBe(0)
    expect(scrollNeeded(box(100, Number.NaN), 300)).toBe(0)
    expect(scrollNeeded(box(100, 500), Number.NaN)).toBe(0)
  })
})

describe('the keyboard hides the backspace key\'s clear-all icon', () => {
  it('the layer CSS hides MathLive\'s shifted-key element (the trash next to the backspace sign), which no key of this keyboard needs', () => {
    const style = keyboardLayout({ kind: 'expression', prompt: 'x' }).layers[0]!.style
    expect(style).toMatch(/\.MLK__rows > \.MLK__row \.MLK__shift \{[^}]*display: none !important/)
  })
})

describe('the box is scrolled above the keyboard', () => {
  const scrollBy = vi.fn()
  const realHeight = window.innerHeight
  const ready = async () => {
    await waitFor(() => expect(theKeyboard().layouts).toHaveLength(1))
    await waitFor(() => expect(theField().mathVirtualKeyboardPolicy).toBe('manual'))
  }
  /** The box is `top` to `bottom` on the screen; the keyboard is up, `height` tall, with its keys starting at `keysTop` (a real top, or none). */
  const arrange = (rect: { top: number; bottom: number }, keyboard: { visible: boolean; height: number; top?: number }) => {
    theField().getBoundingClientRect = () => ({ ...rect, left: 0, right: 300, width: 300, height: rect.bottom - rect.top, x: 0, y: rect.top, toJSON: () => ({}) })
    theKeyboard().visible = keyboard.visible
    theKeyboard().boundingRect = keyboard.top === undefined ? { height: keyboard.height } : ({ height: keyboard.height, top: keyboard.top } as never)
  }
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

  beforeEach(() => {
    scrollBy.mockClear()
    Object.defineProperty(window, 'scrollBy', { value: scrollBy, configurable: true, writable: true })
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
  })
  afterEach(() => {
    Object.defineProperty(window, 'innerHeight', { value: realHeight, configurable: true })
    theKeyboard().visible = false
    theKeyboard().boundingRect = { height: 0 }
    document.body.style.paddingBottom = ''
  })

  it('when the keyboard comes up over the box, the page scrolls down just far enough, smoothly', async () => {
    render(<MathAnswerField kind="expression" prompt="Simplify" value="" onChange={() => {}} hint="Type an expression." />)
    await ready()
    // the keyboard is 300 px tall: its keys start at 500 px on an 800 px screen; the box is at 520 to 600
    arrange(box(520, 600), { visible: true, height: 300 })
    act(() => theKeyboard().dispatchEvent(new Event('geometrychange')))
    await waitFor(() => expect(scrollBy).toHaveBeenCalledTimes(1))
    expect(scrollBy).toHaveBeenCalledWith({ top: 600 - (500 - 12), behavior: 'smooth' })
  })

  it('the same when the keyboard is toggled up, and the body has its room first (the scroll waits one frame)', async () => {
    render(<MathAnswerField kind="expression" prompt="Simplify" value="" onChange={() => {}} hint="Type an expression." />)
    await ready()
    arrange(box(520, 600), { visible: true, height: 300 })
    act(() => theKeyboard().dispatchEvent(new Event('virtual-keyboard-toggle')))
    expect(document.body.style.paddingBottom).toBe('300px')
    // not in the same turn: one animation frame later
    expect(scrollBy).not.toHaveBeenCalled()
    await waitFor(() => expect(scrollBy).toHaveBeenCalledTimes(1))
  })

  it('a box that is already above the keyboard (a laptop, or a short page) is not scrolled', async () => {
    render(<MathAnswerField kind="expression" prompt="Simplify" value="" onChange={() => {}} hint="Type an expression." />)
    await ready()
    arrange(box(100, 180), { visible: true, height: 300 })
    act(() => theKeyboard().dispatchEvent(new Event('geometrychange')))
    await wait(60)
    expect(scrollBy).not.toHaveBeenCalled()
  })

  it('the page is never moved while the keyboard is hidden', async () => {
    render(<MathAnswerField kind="expression" prompt="Simplify" value="" onChange={() => {}} hint="Type an expression." />)
    await ready()
    // hidden, but the last rectangle of the keyboard is still there with a height: it must not count
    arrange(box(700, 780), { visible: false, height: 300 })
    act(() => theKeyboard().dispatchEvent(new Event('geometrychange')))
    act(() => theKeyboard().dispatchEvent(new Event('virtual-keyboard-toggle')))
    act(() => theField().dispatchEvent(new Event('focusin', { bubbles: true })))
    act(() => theField().dispatchEvent(new Event('pointerup', { bubbles: true })))
    await wait(420)
    expect(scrollBy).not.toHaveBeenCalled()
  })

  it('a tap on the box (focus, then pointer up) scrolls after 350 ms, when the phone has shown its own keyboard, and not before', async () => {
    render(<MathAnswerField kind="expression" prompt="Simplify" value="" onChange={() => {}} hint="Type an expression." />)
    await ready()
    arrange(box(520, 600), { visible: true, height: 300 })
    act(() => theField().dispatchEvent(new Event('focusin', { bubbles: true })))
    await wait(100)
    expect(scrollBy).not.toHaveBeenCalled()
    await waitFor(() => expect(scrollBy).toHaveBeenCalledTimes(1), { timeout: 1000 })
    scrollBy.mockClear()
    // a second tap on the box scrolls again, by what is still needed
    arrange(box(520, 560), { visible: true, height: 300 })
    act(() => theField().dispatchEvent(new Event('pointerup', { bubbles: true })))
    await waitFor(() => expect(scrollBy).toHaveBeenCalledWith({ top: 560 - 488, behavior: 'smooth' }), { timeout: 1000 })
  })

  it('a burst of taps makes one scroll, not one for each tap', async () => {
    render(<MathAnswerField kind="expression" prompt="Simplify" value="" onChange={() => {}} hint="Type an expression." />)
    await ready()
    arrange(box(520, 600), { visible: true, height: 300 })
    for (let i = 0; i < 4; i++) act(() => theField().dispatchEvent(new Event('pointerup', { bubbles: true })))
    await wait(500)
    expect(scrollBy).toHaveBeenCalledTimes(1)
  })

  it('the keyboard top is the smaller of the screen height less the keyboard height and the real top of its keys', async () => {
    render(<MathAnswerField kind="expression" prompt="Simplify" value="" onChange={() => {}} hint="Type an expression." />)
    await ready()
    // a real top above the computed one (keys start at 470, the computed top is 500): the real one counts
    arrange(box(520, 600), { visible: true, height: 300, top: 470 })
    act(() => theKeyboard().dispatchEvent(new Event('geometrychange')))
    await waitFor(() => expect(scrollBy).toHaveBeenLastCalledWith({ top: 600 - (470 - 12), behavior: 'smooth' }))
    scrollBy.mockClear()
    // a top below the computed one (the keyboard is still sliding up): the computed one counts
    arrange(box(520, 600), { visible: true, height: 300, top: 640 })
    act(() => theKeyboard().dispatchEvent(new Event('geometrychange')))
    await waitFor(() => expect(scrollBy).toHaveBeenLastCalledWith({ top: 600 - 488, behavior: 'smooth' }))
  })

  it('a keyboard with no height yet is not a keyboard to scroll for', async () => {
    render(<MathAnswerField kind="expression" prompt="Simplify" value="" onChange={() => {}} hint="Type an expression." />)
    await ready()
    arrange(box(700, 780), { visible: true, height: 0 })
    act(() => theKeyboard().dispatchEvent(new Event('geometrychange')))
    await wait(60)
    expect(scrollBy).not.toHaveBeenCalled()
  })

  it('every listener goes with the question: nothing scrolls after it is gone, and a tap just before it goes is forgotten', async () => {
    const { unmount } = render(<MathAnswerField kind="expression" prompt="Simplify" value="" onChange={() => {}} hint="Type an expression." />)
    await ready()
    const field = theField()
    arrange(box(520, 600), { visible: true, height: 300 })
    act(() => field.dispatchEvent(new Event('pointerup', { bubbles: true })))
    unmount()
    act(() => theKeyboard().dispatchEvent(new Event('geometrychange')))
    act(() => theKeyboard().dispatchEvent(new Event('virtual-keyboard-toggle')))
    field.dispatchEvent(new Event('focusin', { bubbles: true }))
    field.dispatchEvent(new Event('pointerup', { bubbles: true }))
    await wait(500)
    expect(scrollBy).not.toHaveBeenCalled()
  })
})

describe('on a phone the session screen scrolls inside its own layer, so that layer is scrolled and given the room', () => {
  const windowScroll = vi.fn()
  const layerScroll = vi.fn()
  const realHeight = window.innerHeight
  const ready = async () => {
    await waitFor(() => expect(theKeyboard().layouts).toHaveLength(1))
    await waitFor(() => expect(theField().mathVirtualKeyboardPolicy).toBe('manual'))
  }
  const arrange = (rect: { top: number; bottom: number }, keyboard: { visible: boolean; height: number }) => {
    theField().getBoundingClientRect = () => ({ ...rect, left: 0, right: 300, width: 300, height: rect.bottom - rect.top, x: 0, y: rect.top, toJSON: () => ({}) })
    theKeyboard().visible = keyboard.visible
    theKeyboard().boundingRect = { height: keyboard.height }
  }
  const field = <MathAnswerField kind="expression" prompt="Simplify" value="" onChange={() => {}} hint="Type an expression." />
  const layerOf = (container: HTMLElement) => container.querySelector('[data-layer]') as HTMLElement

  beforeEach(() => {
    windowScroll.mockClear()
    layerScroll.mockClear()
    Object.defineProperty(window, 'scrollBy', { value: windowScroll, configurable: true, writable: true })
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
    Object.defineProperty(HTMLElement.prototype, 'scrollBy', { value: layerScroll, configurable: true, writable: true })
  })
  afterEach(() => {
    Object.defineProperty(window, 'innerHeight', { value: realHeight, configurable: true })
    theKeyboard().visible = false
    theKeyboard().boundingRect = { height: 0 }
    document.body.style.paddingBottom = ''
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollBy
  })

  it('the layer that scrolls (overflow-y: auto) is scrolled, and the window is not', async () => {
    const { container } = render(<div data-layer style={{ overflowY: 'auto' }}>{field}</div>)
    await ready()
    arrange(box(520, 600), { visible: true, height: 300 })
    act(() => theKeyboard().dispatchEvent(new Event('geometrychange')))
    await waitFor(() => expect(layerScroll).toHaveBeenCalledTimes(1))
    expect(layerScroll).toHaveBeenCalledWith({ top: 600 - 488, behavior: 'smooth' })
    expect(layerScroll.mock.contexts[0]).toBe(layerOf(container))
    expect(windowScroll).not.toHaveBeenCalled()
  })

  it('a layer with overflow-y: scroll counts too, and the nearest scrolling layer is the one that is scrolled', async () => {
    const { container } = render(
      <div style={{ overflowY: 'scroll' }}>
        <div data-layer style={{ overflowY: 'auto' }}>
          <div style={{ overflowY: 'visible' }}>{field}</div>
        </div>
      </div>,
    )
    await ready()
    arrange(box(520, 600), { visible: true, height: 300 })
    act(() => theKeyboard().dispatchEvent(new Event('geometrychange')))
    await waitFor(() => expect(layerScroll).toHaveBeenCalledTimes(1))
    expect(layerScroll.mock.contexts[0]).toBe(layerOf(container))
  })

  it('a layer that does not scroll (overflow hidden or visible) is not the one: the window is', async () => {
    render(
      <div style={{ overflowY: 'hidden' }}>
        <div style={{ overflowY: 'visible' }}>{field}</div>
      </div>,
    )
    await ready()
    arrange(box(520, 600), { visible: true, height: 300 })
    act(() => theKeyboard().dispatchEvent(new Event('geometrychange')))
    await waitFor(() => expect(windowScroll).toHaveBeenCalledTimes(1))
    expect(layerScroll).not.toHaveBeenCalled()
  })

  it('the layer has the keyboard\'s room at its bottom while the keyboard is up (the padding of the body does not reach a fixed layer), and gives it back', async () => {
    const { container, unmount } = render(<div data-layer style={{ overflowY: 'auto' }}>{field}</div>)
    await ready()
    const layer = layerOf(container)
    arrange(box(100, 180), { visible: true, height: 300 })
    act(() => theKeyboard().dispatchEvent(new Event('geometrychange')))
    expect(layer.style.paddingBottom).toBe('300px')
    expect(document.body.style.paddingBottom).toBe('300px')
    arrange(box(100, 180), { visible: false, height: 0 })
    act(() => theKeyboard().dispatchEvent(new Event('virtual-keyboard-toggle')))
    expect(layer.style.paddingBottom).toBe('')
    expect(document.body.style.paddingBottom).toBe('')
    arrange(box(100, 180), { visible: true, height: 280 })
    act(() => theKeyboard().dispatchEvent(new Event('geometrychange')))
    expect(layer.style.paddingBottom).toBe('280px')
    unmount()
    expect(layer.style.paddingBottom).toBe('')
    expect(document.body.style.paddingBottom).toBe('')
  })

  it('a layer is not touched when there is no scrolling layer (a laptop): only the body has the room', async () => {
    const { container } = render(<div data-layer>{field}</div>)
    await ready()
    arrange(box(100, 180), { visible: true, height: 300 })
    act(() => theKeyboard().dispatchEvent(new Event('geometrychange')))
    expect(layerOf(container).style.paddingBottom).toBe('')
    expect(document.body.style.paddingBottom).toBe('300px')
  })
})

