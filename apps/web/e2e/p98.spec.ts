import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

// P98: the landing page at the root address, for a visitor who is not signed in. It needs no database and no agent, so it runs in CI with the other
// feature specs (job "Feature specs in a browser", .github/workflows/ci.yml), phone and laptop. By hand, against a production build:
//   pnpm --filter web build
//   pnpm --filter web exec next start --port 3298        (own terminal, stop it by its pid after)
//   P98_PROOF=1 PREVIEW_URL=http://localhost:3298 pnpm --filter web exec playwright test p98 --workers=1
// Screenshots are written only when P98_PROOF is set, to design/proof/p98, named by width (360, 390 or 1440).

test.use({ screenshot: 'only-on-failure' })

const proofDir = resolve(import.meta.dirname, '../../../design/proof/p98')

/** Scrolls to the bottom in steps, so every lazy picture is asked for, then back to the top. */
async function scrollThrough(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 400) {
      window.scrollTo(0, y)
      await new Promise((done) => setTimeout(done, 60))
    }
    window.scrollTo(0, document.body.scrollHeight)
    await new Promise((done) => setTimeout(done, 100))
    window.scrollTo(0, 0)
  })
}

/** Every picture of the page has loaded (a real width), not only the ones near the top. */
async function allImagesLoaded(page: Page) {
  await scrollThrough(page)
  const images = page.locator('main img')
  expect(await images.count()).toBe(4)
  for (let i = 0; i < 4; i++) {
    await images.nth(i).scrollIntoViewIfNeeded()
    await expect.poll(() => images.nth(i).evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth), { timeout: 30_000 }).toBeGreaterThan(0)
  }
  await page.evaluate(() => window.scrollTo(0, 0))
}

async function proof(page: Page, name: string) {
  if (!process.env.P98_PROOF) return
  mkdirSync(proofDir, { recursive: true })
  await allImagesLoaded(page)
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: 'nextjs-portal{display:none} *{transition:none !important;animation:none !important}' })
  await page.screenshot({ path: resolve(proofDir, `${name}-${page.viewportSize()!.width}.png`), fullPage: true })
}

/** The page does not scroll sideways, and nothing is drawn past the right edge of the window. */
async function noSidewaysScroll(page: Page) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(wide, 'the page scrolls sideways').toBeLessThanOrEqual(0)
  const past = await page.evaluate(() => {
    const edge = document.documentElement.clientWidth
    return [...document.querySelectorAll('main *, footer *')].filter((el) => el.getBoundingClientRect().right > edge + 1).map((el) => `${el.tagName.toLowerCase()}.${String(el.getAttribute('class')).slice(0, 40)}`)
  })
  expect(past, 'something is drawn past the right edge').toEqual([])
}

test.describe('the landing page', () => {
  test('shows the hero and "Try the demo", which opens /demo', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle('Jemma: follows one learner across years')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Follows one learner across years, not one term.')
    await expect(page.getByText('Every learner in the demo is made up.')).toBeVisible()

    // the first screen holds both buttons, with room: at least 48 px high
    const demo = page.getByRole('main').getByRole('link', { name: 'Try the demo' })
    const signIn = page.getByRole('main').getByRole('link', { name: 'Sign in' })
    await expect(demo).toBeInViewport()
    await expect(signIn).toBeInViewport()
    for (const button of [demo, signIn]) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(48)
    await expect(signIn).toHaveAttribute('href', '/sign-in')

    await demo.click()
    await expect(page).toHaveURL(/\/demo$/, { timeout: 45_000 })
    await expect(page.getByRole('heading', { level: 1, name: 'Try the demo' })).toBeVisible({ timeout: 45_000 })
  })

  test('has its sections, the three cards and the footer links', async ({ page }) => {
    await page.goto('/')
    for (const heading of ['How it works', 'Who it is for', 'The rules it keeps']) await expect(page.getByRole('heading', { level: 2, name: heading })).toBeVisible()
    for (const card of ['For learners', 'For parents', 'For teachers']) await expect(page.getByRole('heading', { level: 3, name: card })).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: 'Jemma reads it, code marks it, and finds the gaps.' })).toHaveCount(1)

    const footer = page.getByRole('contentinfo')
    await expect(footer).toContainText('Built for the African Agentic AI Design Challenge, Education track.')
    const hrefs = await footer.getByRole('link').evaluateAll((links) => links.map((a) => [a.textContent, a.getAttribute('href')]))
    expect(hrefs).toEqual([
      ['Try the demo', '/demo'],
      ['Sign in', '/sign-in'],
      ['Start', '/sign-up'],
      ['Privacy', '/privacy'],
      ['Help', '/help'],
      ['Source on GitHub', 'https://github.com/AI-Native-Ventures/jemma'],
    ])
    for (const link of await footer.getByRole('link').all()) expect((await link.boundingBox())!.height, 'a footer link is easy to tap').toBeGreaterThanOrEqual(44)
  })

  test('every picture loads', async ({ page }) => {
    await page.goto('/')
    await allImagesLoaded(page)
    for (const img of await page.locator('main img').all()) {
      expect((await img.getAttribute('alt'))!.length).toBeGreaterThan(40)
      expect(Number(await img.getAttribute('width'))).toBeGreaterThan(0)
      expect(Number(await img.getAttribute('height'))).toBeGreaterThan(0)
    }
  })

  for (const width of [360, 390, 1440]) {
    test(`does not scroll sideways at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width >= 1024 ? 900 : 800 })
      await page.goto('/')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await allImagesLoaded(page)
      await noSidewaysScroll(page)
      await proof(page, 'landing')
    })
  }
})
