import { mkdirSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { resolve } from 'node:path'
import { createServiceClient } from '@jemma/profiling/db'
import { expect, test as base, type Page } from '@playwright/test'
import { openSandbox, type OpenedSandbox } from './helpers/sandbox'

// "My maths": the learner sees all of Mathematics, their own count in each part ("5 of 6 right", never a percent), taps into a part to see this
// year's topics with their counts, and chooses what to practise, with suggestions from their gaps on top.
//
// The stand-in agent below answers 202 to every post and runs no job, so a tap on Practise leaves a `practice.requested` event queued and the
// home says Jemma is writing it. Nothing here calls a model.
//
// WRITTEN, NOT RUN (the shared database could not take a browser spec when this was written). Run it against a production build, phone and laptop:
//   pnpm --filter web build
//   AGENT_URL=http://127.0.0.1:8780 pnpm --filter web exec next start --port 3280        (own terminal, stop it by its pid after)
//   P80_PROOF=1 PREVIEW_URL=http://localhost:3280 pnpm --filter web exec playwright test p80 --workers=1
// Screenshots are written only when P80_PROOF is set, to design/proof/p80, named by width (390 or 1440).

const check = expect.configure({ timeout: 45_000 })
const admin = () => createServiceClient({ SUPABASE_URL: process.env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY! })

const proofDir = resolve(import.meta.dirname, '../../../design/proof/p80')
async function proof(page: Page, name: string) {
  if (!process.env.P80_PROOF) return
  mkdirSync(proofDir, { recursive: true })
  const width = page.viewportSize()!.width >= 1024 ? 1440 : page.viewportSize()!.width
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: 'nextjs-portal{display:none} *{transition:none !important;animation:none !important}' })
  await page.screenshot({ path: resolve(proofDir, `${name}-${width}.png`), fullPage: true })
}

/** The page does not scroll sideways at this width. */
async function noSidewaysScroll(page: Page) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(wide, 'the page scrolls sideways').toBeLessThanOrEqual(0)
}

/** The agent's stand-in: accepts every post to /events, so the web app believes the agent took the event. It runs no job. */
let agent: Server
// The port the web app posts to (its AGENT_URL). CI frees 8787 (the real agent's) and sets STAND_IN_AGENT_PORT=8787.
const STAND_IN_PORT = Number(process.env.STAND_IN_AGENT_PORT ?? 8780)
base.beforeAll(async () => {
  agent = createServer((req, res) => {
    if (req.url === '/health') return void res.writeHead(200).end('ok')
    req.resume()
    req.on('end', () => res.writeHead(202, { 'content-type': 'application/json' }).end('{"queued":true}'))
  })
  await new Promise<void>((done) => agent.listen(STAND_IN_PORT, done))
})
base.afterAll(async () => {
  await new Promise((done) => agent.close(done))
})

const opened: OpenedSandbox[] = []
base.afterAll(async () => {
  base.setTimeout(240_000)
  await Promise.all(opened.map((s) => s.cleanup().catch(() => undefined)))
})
async function sandbox(page: Page, stage: 'start' | 'marked' | 'session_done') {
  const s = await openSandbox(page, { stage, role: 'learner' })
  opened.push(s)
  return s
}

const test = base
test.use({ screenshot: 'only-on-failure', actionTimeout: 45_000 })
test.setTimeout(240_000)

const practiceEvents = async (childId: string) =>
  (await admin().from('events').select('id, status, payload').eq('type', 'practice.requested').eq('payload->>childId', childId).order('created_at')).data ?? []

// "Percentages" is a topic of the Fractions part, so the word is looked for as a whole word ("63 percent"), and the sign "%" as before.
const NEVER = /%|\bpercent\b|\bgrade\b|\brank\b|classmate|class average|strand|subtopic/i
/** The words of the screen itself. The laptop's sidebar (outside <main>) names the learner's class, "Grade 6 · Hillview Primary", which is not a mark. */
const screenText = (page: Page) => page.locator('main').first().innerText()

test.describe('My maths', () => {
  test('Amina, after the marked and shared test, sees her counts, opens Fractions, taps Practise on a topic and lands on "Jemma is writing your practice."', async ({ page }, testInfo) => {
    const sb = await sandbox(page, 'session_done')
    await page.goto('/k')
    await check(page.getByRole('heading', { level: 1 })).toBeVisible()

    // the tab: on the phone the tab bar, on the laptop the sidebar
    await page.getByRole('link', { name: 'My maths' }).first().click()
    await expect(page).toHaveURL(/\/k\/maths$/, { timeout: 45_000 })
    await check(page.getByRole('heading', { level: 1, name: 'My maths' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Suggested for you' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Your gaps' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'All of Mathematics' })).toBeVisible()

    // her own count in each part: "5 of 6 right" or "No score yet", never a percent
    const all = page.getByRole('region', { name: 'All of Mathematics' })
    await expect(all.getByRole('link')).toHaveCount(6)
    for (const label of ['Whole numbers', 'Fractions', 'Decimals', 'Shapes and space', 'Measurement', 'Data handling']) {
      await expect(all.getByRole('link', { name: new RegExp(label) })).toBeVisible()
    }
    await expect(all.getByRole('link', { name: /Fractions/ })).toContainText(/\d+ of \d+ right/)
    expect(await screenText(page)).not.toMatch(NEVER)
    await noSidewaysScroll(page)
    await proof(page, 'my-maths')

    // into a part: this year's topics with their counts and the stage of a gap
    await all.getByRole('link', { name: /Fractions/ }).click()
    await expect(page).toHaveURL(/\/k\/maths\/fractions$/, { timeout: 45_000 })
    await check(page.getByRole('heading', { level: 1, name: 'Fractions' })).toBeVisible()
    // the link back is the one inside the page: the tab bar and the sidebar (also called "My maths") sit outside <main>
    const back = page.locator('main a[href="/k/maths"]')
    await expect(back).toBeVisible()
    await expect(back).toHaveText(/My maths/)
    const rows = page.getByRole('listitem')
    expect(await rows.count()).toBeGreaterThan(0)
    await expect(page.getByText(/\d+ of \d+ right|No score yet/).first()).toBeVisible()
    expect(await screenText(page)).not.toMatch(NEVER)
    await noSidewaysScroll(page)
    await proof(page, 'my-maths-fractions')

    // a tap on Practise asks for that topic and sends her to today, where Jemma is writing it
    const first = page.getByRole('button', { name: /^Practise / }).first()
    const name = (await first.getAttribute('aria-label'))!.replace(/^Practise /, '')
    await first.click()
    await expect(page).toHaveURL(/\/k$/, { timeout: 45_000 })
    await check(page.getByText('Jemma is writing your practice.')).toBeVisible()
    const events = await practiceEvents(sb.childId)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ status: 'queued', payload: { childId: sb.childId, topicName: name } })
    await proof(page, 'writing')

    // while it is written no Practise button is shown on My maths: one line and a link to today
    await page.goto('/k/maths')
    await check(page.getByText(/Jemma is writing your practice\./)).toBeVisible()
    await expect(page.getByRole('button', { name: /^Practise / })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Go to today' })).toBeVisible()
    testInfo.annotations.push({ type: 'topic', description: name })
  })

  test('a learner whose class has no map sees the six parts with "No score yet" and can practise a part', async ({ page }) => {
    const sb = await sandbox(page, 'start')
    // no approved map, nothing marked, nothing planned
    const db = admin()
    const classes = ((await db.from('enrolments').select('class_id').eq('child_id', sb.childId)).data ?? []).map((e) => e.class_id)
    if (classes.length) await db.from('curriculum_maps').update({ status: 'draft' }).in('class_id', classes)
    await db.from('gaps').delete().eq('child_id', sb.childId)
    await db.from('sessions').delete().eq('child_id', sb.childId)

    await page.goto('/k/maths')
    await check(page.getByRole('heading', { level: 1, name: 'My maths' })).toBeVisible()
    const all = page.getByRole('region', { name: 'All of Mathematics' })
    await expect(all.getByRole('link')).toHaveCount(6)
    await expect(all.getByText('No score yet')).toHaveCount(6)
    await noSidewaysScroll(page)
    await proof(page, 'my-maths-no-map')

    await all.getByRole('link', { name: /Decimals/ }).click()
    await expect(page).toHaveURL(/\/k\/maths\/decimals$/, { timeout: 45_000 })
    await check(page.getByRole('heading', { level: 1, name: 'Decimals' })).toBeVisible()
    await expect(page.getByText("Your teacher has not set up this year's topics yet.")).toBeVisible()
    await proof(page, 'my-maths-part-no-map')
    await page.getByRole('button', { name: 'Practise Decimals' }).click()
    await expect(page).toHaveURL(/\/k$/, { timeout: 45_000 })
    await check(page.getByText('Jemma is writing your practice.')).toBeVisible()
    const events = await practiceEvents(sb.childId)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ status: 'queued', payload: { childId: sb.childId, topicName: 'Decimals' } })
  })

  test('while tonight\'s lesson waits there is no Practise button, on My maths or on a part', async ({ page }) => {
    await sandbox(page, 'marked')
    await page.goto('/k/maths')
    await check(page.getByText(/Finish tonight's lesson first\./)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Go to today' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Practise / })).toHaveCount(0)
    // the counts and the way into each part stay
    await expect(page.getByRole('region', { name: 'All of Mathematics' }).getByRole('link')).toHaveCount(6)
    await proof(page, 'my-maths-tonight-waits')

    await page.goto('/k/maths/fractions')
    await check(page.getByText(/Finish tonight's lesson first\./)).toBeVisible()
    await expect(page.getByRole('button', { name: /^Practise / })).toHaveCount(0)
    await noSidewaysScroll(page)
  })

  test('the home suggests the first thing and has a link to choose something else, which opens My maths', async ({ page }) => {
    await sandbox(page, 'session_done')
    await page.goto('/k')
    await check(page.getByText('Suggested for you')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Practise / })).toHaveCount(1)
    await expect(page.getByText('Practise now')).toHaveCount(0)
    await proof(page, 'home-suggestion')
    await page.getByRole('link', { name: 'Choose something else' }).click()
    await expect(page).toHaveURL(/\/k\/maths$/, { timeout: 45_000 })
    // the card "You've fixed N gaps so far" opens My maths too
    await page.goto('/k')
    await page.getByRole('link', { name: /You've fixed \d+ gaps? so far/ }).click()
    await expect(page).toHaveURL(/\/k\/maths$/, { timeout: 45_000 })
  })

  test('the old address /k/gaps goes to My maths', async ({ page }) => {
    await sandbox(page, 'session_done')
    await page.goto('/k/gaps')
    await expect(page).toHaveURL(/\/k\/maths$/, { timeout: 45_000 })
  })
})
