import { vi } from 'vitest'

// A stand-in for the maths editor (MathLive) in the browser-less tests: <math-field> with a value, and the keyboard object the editor puts on window.
// The real editor is loaded in a browser only (it needs layout, fonts and a keyboard); CI's browser specs use the real one.

export type FakeKeyboard = EventTarget & { layouts: unknown[]; visible: boolean; boundingRect: { height: number }; show: ReturnType<typeof vi.fn>; hide: ReturnType<typeof vi.fn> }

export function fakeMathlive() {
  class FakeMathfield extends HTMLElement {
    latex = ''
    mathVirtualKeyboardPolicy = 'auto'
    menuItems: unknown[] = [{}]
    smartMode = true
    getValue(): string {
      return this.latex
    }
    setValue(latex: string): void {
      this.latex = latex
      this.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }
  if (!customElements.get('math-field')) customElements.define('math-field', FakeMathfield)
  const keyboard: FakeKeyboard = Object.assign(new EventTarget(), { layouts: [], visible: false, boundingRect: { height: 0 }, show: vi.fn(), hide: vi.fn() })
  Object.defineProperty(window, 'mathVirtualKeyboard', { value: keyboard, configurable: true, writable: true })
  return {
    MathfieldElement: class {
      static fontsDirectory: string | null = ''
      static soundsDirectory: string | null = ''
      static decimalSeparator = '.'
    },
  }
}

/** The field on the screen, as the fake. */
export const theField = () => document.querySelector('math-field') as unknown as HTMLElement & { latex: string; setValue: (latex: string) => void; mathVirtualKeyboardPolicy: string; menuItems: unknown[] }
export const theKeyboard = () => (window as unknown as { mathVirtualKeyboard: FakeKeyboard }).mathVirtualKeyboard
