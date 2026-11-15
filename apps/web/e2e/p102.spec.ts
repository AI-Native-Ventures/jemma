import { expect, test as base, type Page } from '@playwright/test'
import { openSandbox, type OpenedSandbox } from './helpers/sandbox'

// The bottom tab bar marks the tab of the screen the child is on (P102). A tap on a tab changes the page and not the layout, so the bar the layout drew
// first used to keep marking the old tab until a full reload. The bar now reads the address in the browser.
//  1. Amina opens Today: "Today" is the current tab. She taps "My maths" in the bar: the address is /k/maths and "My maths" is the current tab,
//     with no reload of the page (a mark set on the window before the tap is still there). She taps "Today": the address is /k and "Today" is current.
//
// RUNS IN CI on every push (job "Feature specs in a browser", .github/workflows/ci.yml), on CI's own local database, on the phone: the tab bar is hidden
// from width 1024, where the sidebar takes over. No model is called. Never run it against the hosted preview database.

const check = expect.configure({ timeout: 45_000 })

const opened: OpenedSandbox[] = []
base.afterEach(async () => {
  await Promise.all(opened.splice(0).map((s) => s.cleanup().catch(() => undefined)))
})

const test = base
test.use({ screenshot: 'only-on-failure', actionTimeout: 45_000 })
test.setTimeout(240_000)

/** The bar at the bottom of the phone, named after the learner's space ("Amina's Jemma"). */
const bar = (page: Page) => page.getByRole('navigation', { name: /'s Jemma$/ })

test.describe('the tab bar marks the screen the learner is on', () => {
  test('on the phone, a tap on My maths moves the mark to My maths and a tap on Today moves it back, with no reload', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) >= 1024, 'the tab bar is the phone\'s; the laptop has the sidebar')
    opened.push(await openSandbox(page, { stage: 'session_done', role: 'learner' }))

    await page.goto('/k')
    await check(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(bar(page).getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page')
    await expect(bar(page).getByRole('link', { name: 'My maths' })).not.toHaveAttribute('aria-current', 'page')

    // a mark on the window: a full reload would take it away
    await page.evaluate(() => {
      ;(window as unknown as { __p102: number }).__p102 = 1
    })

    await bar(page).getByRole('link', { name: 'My maths' }).click()
    await expect(page).toHaveURL(/\/k\/maths$/, { timeout: 45_000 })
    await check(page.getByRole('heading', { level: 1, name: 'My maths' })).toBeVisible()
    await expect(bar(page).getByRole('link', { name: 'My maths' })).toHaveAttribute('aria-current', 'page')
    await expect(bar(page).getByRole('link', { name: 'Today' })).not.toHaveAttribute('aria-current', 'page')
    expect(await page.evaluate(() => (window as unknown as { __p102?: number }).__p102), 'the page was loaded again').toBe(1)

    await bar(page).getByRole('link', { name: 'Today' }).click()
    await expect(page).toHaveURL(/\/k$/, { timeout: 45_000 })
    await expect(bar(page).getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page')
    await expect(bar(page).getByRole('link', { name: 'My maths' })).not.toHaveAttribute('aria-current', 'page')
    expect(await page.evaluate(() => (window as unknown as { __p102?: number }).__p102), 'the page was loaded again').toBe(1)
  })
})
