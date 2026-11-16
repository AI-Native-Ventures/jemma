// P122: the one-line key of the progress circles ("80% or more, 50 to 79, below 50, not tried") is the only place My maths names the 80. The tests that
// say "never a percent" read the page without it: the key has its own tests in p122-progress-circles.test.tsx.

/** The text of the page, without the key of the circles. */
export function textWithoutKey(root: HTMLElement = document.body): string {
  const copy = root.cloneNode(true) as HTMLElement
  for (const key of copy.querySelectorAll('[data-legend]')) key.remove()
  return copy.textContent ?? ''
}
