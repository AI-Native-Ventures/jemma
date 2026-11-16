import { expect, type Locator, type Page } from '@playwright/test'

// P132: the answer of a senior question is written in a maths editor (MathLive's <math-field>). A spec cannot fill it like a text box, so it writes the
// LaTeX into it, as the editor would give it back, and the screen takes it as it would take what a child wrote.

/** The editor of the answer, once it is started and listening (the screen marks it with data-ready). */
export async function mathField(page: Page): Promise<Locator> {
  const field = page.locator('math-field#answer[data-ready="true"]')
  // The editor is a chunk loaded on demand (a dev server builds it on the first use): it can take a while.
  await expect(field).toBeVisible({ timeout: 60_000 })
  return field
}

/** Writes LaTeX into the editor, with no keyboard on the screen. */
export async function writeAnswer(page: Page, latex: string): Promise<void> {
  const field = await mathField(page)
  await field.evaluate((el, value) => {
    const editor = el as HTMLElement & { setValue(latex: string): void }
    editor.setValue(value)
    editor.dispatchEvent(new Event('input', { bubbles: true }))
    // The box has not been touched, so there is no keyboard; if one is up from an earlier step it would cover the Next button.
    ;(window as unknown as { mathVirtualKeyboard: { hide(): void } }).mathVirtualKeyboard.hide()
  }, latex)
}

/** What the editor holds, as LaTeX. */
export async function writtenLatex(page: Page): Promise<string> {
  const field = await mathField(page)
  return field.evaluate((el) => (el as HTMLElement & { getValue(format: string): string }).getValue('latex'))
}

/**
 * Taps outside the box (the question's heading) until the keyboard has gone: the box loses the focus and the editor hides its keyboard a moment after, and
 * not at all while it is still being shown, so a tap that comes too early is made again.
 */
export async function tapAwayKeyboard(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const visible = await page.evaluate(() => (window as unknown as { mathVirtualKeyboard: { visible: boolean } }).mathVirtualKeyboard.visible)
        if (visible) await page.locator('h1[data-prompt]').click()
        return visible
      },
      { timeout: 30_000, intervals: [600, 1000, 1500] },
    )
    .toBe(false)
}
