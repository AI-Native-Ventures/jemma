'use client'

import type { MathfieldElement } from 'mathlive'
import { useEffect, useRef, useState } from 'react'
import { ANSWER_MAX_LENGTH } from '../[sessionId]/logic'
import { FractionText } from './Frac'
import { latexToNotation } from './latex-to-notation'
import { loadMathlive } from './load-mathlive'
import { keyboardLayout } from './math-keyboard'
import { MathPreview } from './MathPreview'
import type { TypedKind } from './maths-keys'

// P132: the answer box of a senior class is a maths editor (MathLive's <math-field>): a fraction has a top and a bottom, a root has its line, a power is
// raised, and the keyboard under it has + - x / = ( ) on its top row. The editor is loaded in the browser only and on demand (a dynamic import, so no other
// page grows), with its fonts served by this app. What the child writes is turned into the plain notation that is marked and stored (latex-to-notation.ts),
// so the results, "You wrote" and the teacher read it as before. If the editor cannot start, the child gets a plain box and the old "It reads:" line.

export type MathAnswerFieldProps = {
  kind: TypedKind
  topic?: string
  prompt: string
  value: string
  onChange: (plain: string) => void
  /** The line under the box that says what goes in it. A question with several boxes (P146) says it once under all of them, so it is left out here. */
  hint?: string
  /** The id of the box and its label for a screen reader. A question with several boxes gives each its own ("answer-1", "Answer 1"). */
  id?: string
  label?: string
}

const FONTS = '/mathlive/fonts'
/** How long the box is left alone before a line says it cannot be read. */
const SETTLE_MS = 1500
/** After a tap on the box, how long to wait before looking at the keyboard: a phone's editor shows its own keyboard about 300 ms after the touch. */
const KEYBOARD_SETTLE_MS = 350

/**
 * P140b: how many px the page must scroll down so that the answer box is above the keyboard, with `gap` px between them. 0 when the bottom of the box is
 * already at or above the top of the keyboard less the gap. Never negative, and a box so tall that scrolling that far would push its top above 8 px is
 * scrolled only far enough to put its top at 8 px. Pure: the numbers come from `getBoundingClientRect`.
 */
export function scrollNeeded(fieldRect: { top: number; bottom: number }, keyboardTop: number, gap = 12): number {
  const covered = fieldRect.bottom - (keyboardTop - gap)
  if (!(covered > 0)) return 0
  const by = Math.min(covered, fieldRect.top - 8)
  return by > 0 ? by : 0
}

/**
 * The element that scrolls the box: its nearest ancestor with a scrolling overflow (on a phone the session screen is a fixed full-screen layer that scrolls
 * inside itself, so scrolling the window moves nothing), or null when the window scrolls (a laptop).
 */
function scrollerOf(el: Element | null): HTMLElement | null {
  for (let node = el?.parentElement; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
    const overflowY = getComputedStyle(node).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') return node
  }
  return null
}

/**
 * When the keyboard is up and covers the answer box (on a phone the box of a question with a picture sits low, and the keyboard opens over it), scrolls
 * the screen just far enough, smoothly, to show the box above the keyboard: the layer that scrolls the box, or the window. Does nothing while the keyboard
 * is hidden, or when the box is already clear of it. The top of the keyboard is the smaller of the screen height less the keyboard height and the real
 * top of its keys: a keyboard that is still sliding up has its keys lower than they will be.
 */
function keepInView(el: Element | null) {
  const keyboard = window.mathVirtualKeyboard
  if (!el || !keyboard?.visible) return
  const rect = keyboard.boundingRect
  if (!(rect.height > 0)) return
  const keyboardTop = Math.min(window.innerHeight - rect.height, rect.top > 0 ? rect.top : Number.POSITIVE_INFINITY)
  const by = scrollNeeded(el.getBoundingClientRect(), keyboardTop)
  if (by > 0) (scrollerOf(el) ?? window).scrollBy({ top: by, behavior: 'smooth' })
}

function Hint({ children }: { children: string }) {
  // The example in a hint is maths ("like (x + 2)(x - 2)"), drawn as it is in a textbook, as the hints of every other answer are (P129).
  return (
    <p className="m-0 text-center text-[16px] leading-[1.4] text-body">
      <FractionText text={children} size={18} rule={2} gap={3} side={3} typeset="all" />
    </p>
  )
}

export function MathAnswerField({ kind, topic, prompt, value, onChange, hint, id = 'answer', label = 'Your answer' }: MathAnswerFieldProps) {
  const field = useRef<MathfieldElement | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [problem, setProblem] = useState<'empty-box' | 'sign' | 'long' | null>(null)
  const change = useRef(onChange)
  change.current = onChange
  const layout = keyboardLayout({ kind, topic, prompt })

  // The editor, on demand.
  useEffect(() => {
    let gone = false
    let unpad: (() => void) | undefined
    let frame = 0
    // The layer that scrolls the box on a phone, while it has the keyboard's room at its bottom.
    let padded: HTMLElement | null = null
    loadMathlive()
      .then(({ MathfieldElement }) => {
        if (gone) return
        MathfieldElement.fontsDirectory = FONTS
        MathfieldElement.soundsDirectory = null
        MathfieldElement.decimalSeparator = ','
        const keyboard = window.mathVirtualKeyboard
        keyboard.layouts = [layout]
        // The keyboard covers the bottom of the page: while it is up the page has room under its last button, so Next can be scrolled into reach.
        const room = () => {
          const padding = keyboard.visible ? `${Math.round(keyboard.boundingRect.height)}px` : ''
          document.body.style.paddingBottom = padding
          // On a phone the screen scrolls inside its own layer, which the padding of the body does not reach: it has the room too, or a box low on the page could
          // not be scrolled above the keyboard (P140b).
          const scroller = scrollerOf(field.current)
          if (padded && padded !== scroller) padded.style.paddingBottom = ''
          padded = scroller
          if (scroller) scroller.style.paddingBottom = padding
        }
        // And the box is scrolled above it (P140b), one frame after the room is made, so the page can scroll that far.
        const onKeyboard = () => {
          room()
          cancelAnimationFrame(frame)
          frame = requestAnimationFrame(() => keepInView(field.current))
        }
        keyboard.addEventListener('geometrychange', onKeyboard)
        keyboard.addEventListener('virtual-keyboard-toggle', onKeyboard)
        unpad = () => {
          cancelAnimationFrame(frame)
          keyboard.removeEventListener('geometrychange', onKeyboard)
          keyboard.removeEventListener('virtual-keyboard-toggle', onKeyboard)
          document.body.style.paddingBottom = ''
          if (padded) padded.style.paddingBottom = ''
        }
        setStatus('ready')
      })
      .catch(() => {
        if (!gone) setStatus('failed')
      })
    return () => {
      gone = true
      unpad?.()
      // The keyboard belongs to this question: it goes when the question does.
      if (typeof window !== 'undefined') window.mathVirtualKeyboard?.hide()
    }
    // The layout is the same for the life of the question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The field, once the editor is there: how it behaves, and what it tells the screen.
  useEffect(() => {
    const el = field.current
    if (status !== 'ready' || !el) return
    // A phone shows the keyboard when the box is touched; a laptop shows it too (and keeps its own keys working).
    const touch = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
    el.mathVirtualKeyboardPolicy = touch ? 'auto' : 'manual'
    el.menuItems = []
    el.smartMode = false
    // What is written now: the plain notation (or '' when it cannot be sent) and what is wrong with it, if anything.
    const look = () => {
      const latex = el.getValue('latex')
      const plain = latexToNotation(latex)
      const issue =
        plain === null ? (/\\placeholder/.test(latex) ? ('empty-box' as const) : ('sign' as const)) : plain.length > ANSWER_MAX_LENGTH ? ('long' as const) : null
      return { plain: plain !== null && issue === null ? plain : '', issue }
    }
    // A line says what is wrong only once the child stops writing (a minus sign or a plus on its own is a step, not a mistake) or leaves the box.
    let timer: ReturnType<typeof setTimeout> | undefined
    const read = () => {
      const { plain, issue } = look()
      change.current(plain)
      clearTimeout(timer)
      if (issue === null) setProblem(null)
      else timer = setTimeout(() => setProblem(issue), SETTLE_MS)
    }
    const leave = () => {
      clearTimeout(timer)
      setProblem(look().issue)
    }
    const show = () => window.mathVirtualKeyboard.show()
    // A tap on the box: once the phone has shown its own keyboard, the box is scrolled above it if the keyboard covers it (P140b).
    let settle: ReturnType<typeof setTimeout> | undefined
    const tapped = () => {
      clearTimeout(settle)
      settle = setTimeout(() => keepInView(el), KEYBOARD_SETTLE_MS)
    }
    el.addEventListener('input', read)
    el.addEventListener('focusin', tapped)
    el.addEventListener('pointerup', tapped)
    // A phone's editor shows its keyboard itself, a moment after the box is touched: a second show from here would build the keyboard again under the child's finger.
    if (!touch) el.addEventListener('focusin', show)
    el.addEventListener('focusout', leave)
    // The page's checks wait for this: the editor is started and listening.
    el.setAttribute('data-ready', 'true')
    return () => {
      clearTimeout(timer)
      clearTimeout(settle)
      el.removeEventListener('input', read)
      el.removeEventListener('focusin', tapped)
      el.removeEventListener('pointerup', tapped)
      if (!touch) el.removeEventListener('focusin', show)
      el.removeEventListener('focusout', leave)
    }
  }, [status])

  if (status === 'failed') {
    return (
      <div data-fallback="true" className="flex w-full flex-col items-center gap-3.5">
        <label htmlFor={id} className="sr-only">{label}</label>
        <input
          id={id}
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={ANSWER_MAX_LENGTH}
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, ANSWER_MAX_LENGTH))}
          className="mx-auto block h-[64px] w-full max-w-[360px] rounded-18 border-[3px] border-coral bg-card px-3 text-center text-[28px] font-bold text-ink outline-none"
        />
        {value.trim() ? (
          <p data-reads="true" className="m-0 text-center text-[16px] leading-[1.4] text-body">
            It reads: <span className="text-[22px] font-bold text-ink"><MathPreview text={value.trim()} size={22} rule={2} gap={3} side={3} className="mx-0.5 align-middle" /></span>
          </p>
        ) : null}
        {hint ? <Hint>{hint}</Hint> : null}
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col items-center gap-3.5">
      <math-field
        ref={field}
        id={id}
        aria-label={label}
        className="jemma-answer"
        default-mode="math"
        placeholder="\text{Tap here to write}"
      />
      {problem ? (
        <p role="status" data-problem={problem} className="m-0 text-center text-[16px] leading-[1.4] font-semibold text-ink">
          {problem === 'empty-box'
            ? 'Fill in every box, or take the empty one away.'
            : problem === 'long'
              ? 'That is too long. Write it a shorter way.'
              : 'Jemma cannot read that sign yet. Write it another way.'}
        </p>
      ) : null}
      {hint ? <Hint>{hint}</Hint> : null}
    </div>
  )
}
