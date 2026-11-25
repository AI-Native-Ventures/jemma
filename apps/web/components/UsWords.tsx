'use client'

import { useEffect } from 'react'
import { usWords } from '@/lib/us-words'

// P164: for a family in the US, the words on the screen in US English ("math", "practice"). Drawn only for such a family (the space's layout decides).
// It changes the text the screen shows, never what a person types: no input, no text area, no maths typeset by KaTeX or MathLive, no code. It changes
// only what React has already taken over (hydrated), so React never finds text it did not write: a part that is still arriving is done on a later look.

const SKIP = 'script,style,noscript,textarea,code,pre,math,.katex,math-field,[contenteditable],[data-no-us-words]'
const ATTRIBUTES = ['aria-label', 'title', 'placeholder', 'alt']
/** Looks again a few times after the page opens, for the parts React takes over late (a part that streamed in). Milliseconds after it opened. */
const LOOKS = [400, 1200, 3000, 6000]

/** True once React has taken the element over: React keeps its own key on every element it renders or hydrates. */
const hydrated = (el: Element): boolean => Object.keys(el).some((k) => k.startsWith('__reactFiber$'))
const skipped = (el: Element): boolean => el.closest(SKIP) !== null

function fixText(node: Text) {
  const parent = node.parentElement
  if (!parent || skipped(parent) || !hydrated(parent)) return
  const before = node.nodeValue ?? ''
  const after = usWords(before)
  if (after !== before) node.nodeValue = after
}

function fixElement(el: Element) {
  if (skipped(el) || !hydrated(el)) return
  for (const name of ATTRIBUTES) {
    const before = el.getAttribute(name)
    if (!before) continue
    const after = usWords(before)
    if (after !== before) el.setAttribute(name, after)
  }
}

function walk(start: Node) {
  if (start.nodeType === Node.TEXT_NODE) return fixText(start as Text)
  if (start.nodeType !== Node.ELEMENT_NODE) return
  const el = start as Element
  if (skipped(el)) return
  fixElement(el)
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) fixText(node as Text)
    else fixElement(node as Element)
  }
}

function fixTitle() {
  const after = usWords(document.title)
  if (after !== document.title) document.title = after
}

export function UsWords() {
  useEffect(() => {
    document.documentElement.lang = 'en-US'
    const all = () => {
      walk(document.body)
      fixTitle()
    }
    all()
    const timers = LOOKS.map((ms) => window.setTimeout(all, ms))
    const body = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'characterData') fixText(r.target as Text)
        else if (r.type === 'attributes') fixElement(r.target as Element)
        else r.addedNodes.forEach(walk)
      }
    })
    body.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES })
    const head = new MutationObserver(fixTitle)
    head.observe(document.head, { subtree: true, childList: true, characterData: true })
    return () => {
      timers.forEach((t) => window.clearTimeout(t))
      body.disconnect()
      head.disconnect()
    }
  }, [])
  return null
}
