import { mkdirSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { resolve } from 'node:path'
import { createServiceClient } from '@jemma/profiling/db'
import { expect, test, type Page } from '@playwright/test'
import { openSandbox } from './helpers/sandbox'
import { signInWithPassword } from './helpers/session'

// The Long view screens on a `marked` sandbox: the teacher checks each pattern, talks to the parent, and only then does the parent see it.
// The learner never does. Headless, no model: nothing here needs the agent, so a small stand-in answers the web app's posts
// on the agent's port (8753) and the update jobs are never run. (The real agent is used by demo-path.spec.ts.)
// Screenshots for the reviewer are written only when P52_PROOF is set, to design/proof/p62, named by width (390 or 1440).

// Every step of a decision is a few round trips to the database, so the waits are patient.
const check = expect.configure({ timeout: 45_000 })

const admin = () => createServiceClient({ SUPABASE_URL: process.env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY! })

const proofDir = resolve(import.meta.dirname, '../../../design/proof/p62')
async function proof(page: Page, name: string, fullPage = true) {
  if (!process.env.P52_PROOF) return
  mkdirSync(proofDir, { recursive: true })
  const width = page.viewportSize()!.width >= 1024 ? 1440 : page.viewportSize()!.width
  await page.evaluate(() => document.fonts.ready)
  // The bottom bar sticks to the window: in a whole-page picture it would float in the middle, so it goes to the end of the page.
  const bar = fullPage ? 'nav.sticky.bottom-0{position:static !important}' : ''
  await page.addStyleTag({ content: `nextjs-portal{display:none} *{transition:none !important;animation:none !important} ${bar}` })
  await page.screenshot({ path: resolve(proofDir, `${name}-${width}.png`), fullPage })
}

/** The subject line on Amina's fractions card. */
const fractionsCardSubject = (page: Page) => page.getByRole('article').filter({ hasText: 'Adding fractions is hard when the bottom numbers differ' }).getByText('Mathematics · Fractions')

/** The page itself never scrolls sideways (the grid scrolls inside its own card). When it does, the failure names what sticks out. */
async function noHorizontalScroll(page: Page) {
  const sticksOut = await page.evaluate(() => {
    const limit = document.documentElement.clientWidth
    if (document.documentElement.scrollWidth <= limit) return []
    return [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > limit + 1)
      .slice(0, 6)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 50)} right=${Math.round(el.getBoundingClientRect().right)} of ${limit}`)
  })
  expect(sticksOut).toEqual([])
}

type Logins = Record<'teacher' | 'parent' | 'learner', { userId: string; email: string; password: string }>

/** The port the web app posts events to (AGENT_URL). Another worker may have 8753, so a run can say `P52_AGENT_PORT=8762`. */
const AGENT_PORT = Number(process.env.P52_AGENT_PORT ?? 8753)

/** The agent's stand-in: accepts every post to /events, so the web app believes the agent took the event. It runs no job. */
let agent: Server
const posted: string[] = []
test.beforeAll(async () => {
  agent = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200).end('ok')
      return
    }
    let body = ''
    req.on('data', (d) => (body += d))
    req.on('end', () => {
      try {
        posted.push((JSON.parse(body) as { eventId: string }).eventId)
      } catch {
        // not a post from the app
      }
      res.writeHead(202, { 'content-type': 'application/json' }).end('{"queued":true}')
    })
  })
  await new Promise<void>((done) => agent.listen(AGENT_PORT, done))
})
test.afterAll(async () => {
  await new Promise((done) => agent.close(done))
})

async function logins(sandboxId: string) {
  const row = await admin().from('demo_sandboxes').select('school_id, logins').eq('id', sandboxId).single()
  return { schoolId: row.data!.school_id, logins: row.data!.logins as Logins }
}

const longViewEvents = async (childId: string, status?: 'queued' | 'running' | 'done' | 'failed') => {
  let q = admin().from('events').select('id, status, created_at').eq('type', 'long_view.requested').eq('payload->>childId', childId).order('created_at')
  if (status) q = q.eq('status', status)
  return (await q).data ?? []
}

test.use({ screenshot: 'only-on-failure' })

test.describe('the Long view', () => {
  test.setTimeout(480_000)
  test.use({ actionTimeout: 45_000 })

  test('the teacher checks each pattern and talks to the parent, then the parent sees it. The learner never does', async ({ page }, testInfo) => {
    const phone = testInfo.project.name === 'phone'
    const sb = await openSandbox(page, { stage: 'marked', role: 'teacher' })
    try {
      const db = admin()
      const { schoolId, logins: who } = await logins(sb.sandboxId)
      const base = `/t/${sb.classId}`
      const long = `${base}/learners/${sb.childId}/long-view`

      // The Needs you item on the class home opens the Long view, and so does its own page.
      await page.goto(base)
      await check(page.getByRole('heading', { name: 'Needs you' })).toBeVisible()
      await page.getByRole('link', { name: /Look at Amina's Long view/ }).click()
      await page.waitForURL(`**/learners/${sb.childId}/long-view`)
      const item = await db.from('needs_you_items').select('id, status').eq('school_id', schoolId).eq('kind', 'review_long_view').eq('child_id', sb.childId).single()
      expect(item.data?.status).toBe('open')
      await page.goto(`${base}/needs-you/${item.data!.id}`)
      await page.waitForURL(`**/learners/${sb.childId}/long-view`)

      // The card on the profile page (the learner list on a laptop) opens it too.
      if (phone) {
        await page.goto(`${base}/learners/${sb.childId}/profile`)
        const card = page.getByRole('link', { name: /^Long view/ })
        await check(card).toContainText('2 patterns wait for you')
        await card.click()
      } else {
        await page.goto(`${base}/learners?child=${sb.childId}`)
        await check(page.getByRole('link', { name: 'Long view', exact: true })).toBeVisible()
        await page.getByRole('link', { name: 'Long view', exact: true }).click()
      }
      await page.waitForURL(`**${long}`)

      // The grid: strands down the side, terms across, a text alternative on every cell.
      await check(page.getByRole('heading', { level: 1, name: "Amina's Long view" })).toBeAttached()
      await check(page.getByText(/^Grade 4 to Grade 6 · \d+ terms · 3 teachers$/)).toBeVisible()
      const table = page.getByRole('table')
      await check(table).toBeVisible()
      // One subject: its name is a small heading over the grid, and there are no subject chips.
      await expect(page.getByRole('heading', { level: 2, name: 'Mathematics' })).toBeVisible()
      await expect(page.getByRole('navigation', { name: 'Subjects' })).toHaveCount(0)
      await expect(fractionsCardSubject(page)).toBeVisible()
      await expect(table.getByRole('rowheader', { name: 'Fractions' })).toBeVisible()
      await expect(table.getByRole('rowheader', { name: 'Shapes and space' })).toBeVisible()
      await expect(table.getByRole('img', { name: /^Fractions, Grade 5 Term 3: 40 percent, \d+ marks$/ })).toBeVisible()
      await expect(table.getByRole('img', { name: 'Shapes and space, Grade 5 Term 3: no results' })).toBeVisible()
      await expect(page.getByText(/full = 80 percent or more/)).toBeVisible()
      await expect(page.getByText(/dashed outline = no results that term/)).toBeVisible()
      await noHorizontalScroll(page)
      const grid = page.getByRole('region', { name: /scrolls sideways/ })
      const firstTerm = table.getByRole('columnheader', { name: 'Grade 4 Term 1' })
      const lastTerm = table.getByRole('columnheader', { name: 'Grade 6 Term 4' })
      /** Every term is on the screen: the card does not scroll, the first and the last term header are inside the window, no strand name is cut off, no two dots touch. */
      const everyTermShows = async (width: number) => {
        expect(await grid.evaluate((el) => el.scrollWidth <= el.clientWidth), `the grid scrolls at ${width}`).toBe(true)
        for (const head of [firstTerm, lastTerm]) {
          const box = (await head.boundingBox())!
          expect(box.x, `a term header starts outside the window at ${width}`).toBeGreaterThanOrEqual(0)
          expect(box.x + box.width, `a term header ends outside the window at ${width}`).toBeLessThanOrEqual(width)
        }
        const cut = await table.getByRole('rowheader').evaluateAll((rows) => rows.filter((r) => r.scrollWidth > r.clientWidth).map((r) => r.textContent))
        expect(cut, `strand names are cut off at ${width}`).toEqual([])
        const dots = await table.getByRole('row').nth(2).getByRole('img').evaluateAll((els) => els.map((el) => el.firstElementChild!.getBoundingClientRect()).map((r) => ({ left: r.left, right: r.right, width: r.width })))
        expect(dots.length).toBeGreaterThan(6)
        for (let i = 1; i < dots.length; i++) expect(dots[i]!.left - dots[i - 1]!.right, `two dots touch at ${width}`).toBeGreaterThanOrEqual(2)
        await expect(page.getByText('Swipe sideways to see every term.')).toBeHidden()
      }
      if (phone) {
        // From 360 px up a phone shows every term with no sideways scroll inside the card. Under that the card scrolls, never the page.
        for (const width of [390, 360]) {
          await page.setViewportSize({ width, height: 844 })
          await everyTermShows(width)
          await noHorizontalScroll(page)
        }
        await proof(page, 'teacher-grid', false)
        await page.setViewportSize({ width: 320, height: 844 })
        await noHorizontalScroll(page)
        await expect(page.getByText('Swipe sideways to see every term.')).toBeVisible()
        await proof(page, 'teacher-grid', false)
        await page.setViewportSize({ width: 390, height: 844 })
        await everyTermShows(390)
      } else {
        await everyTermShows(1440)
      }

      // Two patterns, both drafts. A pattern that newer terms followed is never called running.
      await expect(page.getByRole('article')).toHaveCount(2)
      const fractions = page.getByRole('article').filter({ hasText: 'Adding fractions is hard when the bottom numbers differ' })
      const shapes = page.getByRole('article').filter({ hasText: 'Marks in shapes and space stay high' })
      await expect(fractions).toContainText('Struggle · 4 terms')
      await expect(fractions).not.toContainText('running')
      await expect(fractions).toContainText('Since then: Grade 6 Term 3, 63 percent · Grade 6 Term 4, 67 percent')
      await expect(shapes).toContainText(/Strength · \d+ terms/)
      await expect(fractions.getByRole('heading', { name: 'Where this comes from' })).toBeVisible()
      await expect(fractions.getByRole('button', { name: 'Looks right' })).toBeVisible()
      await expect(fractions.getByRole('button', { name: 'Not yet' })).toBeVisible()
      await expect(page.getByText('What Jemma could not use')).toHaveCount(0) // every term has a record and nothing is unclear or late
      await expect(page.getByText('Not updated yet')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Update the Long view' })).toBeVisible()
      // No ranking and no comparison with other learners anywhere on the screen.
      await expect(page.locator('main')).not.toContainText(/class average|rank|better than|than the class|classmates/i)
      // A pattern with more than 4 sources shows its first 3 chips and "Show all N". Tapped, it shows all N, and a chip opens its sheet.
      const sourcesOf = (card: typeof fractions) => card.getByRole('region', { name: /^Where this comes from/ })
      const chipsOf = (card: typeof fractions) => sourcesOf(card).locator('a, button:not([aria-expanded])')
      await expect(chipsOf(fractions)).toHaveCount(3)
      await expect(chipsOf(shapes)).toHaveCount(3)
      await proof(page, 'teacher-drafts')
      const showAll = sourcesOf(fractions).getByRole('button', { name: /^Show all \d+$/ })
      await expect(showAll).toHaveAttribute('aria-expanded', 'false')
      expect((await showAll.boundingBox())!.height).toBeGreaterThanOrEqual(44)
      const total = Number((await showAll.innerText()).match(/\d+/)![0])
      expect(total).toBeGreaterThan(4)
      await showAll.click()
      await expect(chipsOf(fractions)).toHaveCount(total)
      await expect(sourcesOf(fractions).getByRole('button', { name: 'Show fewer' })).toHaveAttribute('aria-expanded', 'true')
      await proof(page, 'teacher-sources-open')

      // A marked answer links to the paper at that question.
      const answer = fractions.locator('a[href*="/papers/"]').first()
      await expect(answer).toHaveAttribute('href', /\/papers\/[0-9a-f-]+\?q=\d+$/)
      const paper = await page.request.get((await answer.getAttribute('href'))!)
      expect(paper.status()).toBe(200)

      // A past teacher note opens a sheet with what it says.
      await fractions.getByRole('button', { name: /^Teacher note/ }).first().click()
      const sheet = page.getByRole('dialog')
      await check(sheet).toBeVisible()
      await expect(sheet).toContainText('Teacher')
      await expect(sheet).toContainText('Mrs Naidoo')
      await expect(sheet).toContainText('Grade and term')
      await expect(sheet).toContainText('she guesses instead of finding a common bottom number')
      await proof(page, 'evidence-sheet', false)
      await sheet.getByRole('button', { name: 'Close' }).click()
      await expect(sheet).toHaveCount(0)
      // A past quiz opens a sheet with its marks.
      await fractions.getByRole('button', { name: /Mrs Naidoo|Mr Dube|Ms Banda/ }).filter({ hasNotText: 'Teacher note' }).first().click()
      await expect(sheet).toContainText('Marks')
      await expect(sheet).toContainText(/\d+ out of \d+/)
      await sheet.getByRole('button', { name: 'Close' }).click()

      // "Looks right": approved, and not shared.
      await fractions.getByRole('button', { name: 'Looks right' }).click()
      await check(fractions.getByText(/^You said this looks right on \d{1,2} [A-Z][a-z]{2} \d{4}\.$/)).toBeVisible()
      await expect(fractions.getByText('Not shared.')).toBeVisible()
      await expect(fractions).toContainText('Talk to Thandi first.')
      await expect(fractions.getByRole('button', { name: 'We have talked' })).toBeVisible()
      await expect(fractions.getByRole('button', { name: 'Looks right' })).toHaveCount(0)
      await proof(page, 'teacher-approved')
      const approved = await db.from('long_view_patterns').select('status, approved_by_name, approved_at').eq('child_id', sb.childId).eq('family', 'fractions').single()
      expect(approved.data).toMatchObject({ status: 'approved', approved_by_name: 'Ms Banda' })
      expect(approved.data!.approved_at).not.toBeNull()
      const told = () => db.from('notifications').select('title, href').eq('user_id', who.parent.userId).like('href', '%/long-view')
      expect((await told()).data).toEqual([])

      // "We have talked": shared, logged with the name, and the parent is told.
      await fractions.getByRole('button', { name: 'We have talked' }).click()
      await check(fractions.getByText(/^Shared with Thandi after your talk on \d{1,2} [A-Z][a-z]{2} \d{4}\.$/)).toBeVisible()
      await proof(page, 'teacher-shared')
      const approvals = await db.from('approvals').select('kind, decision, decided_by_name, child_id').eq('school_id', schoolId).in('kind', ['long_view_pattern', 'long_view_talk']).order('created_at')
      expect(approvals.data).toEqual([
        { kind: 'long_view_pattern', decision: 'approved', decided_by_name: 'Ms Banda', child_id: sb.childId },
        { kind: 'long_view_talk', decision: 'confirmed', decided_by_name: 'Ms Banda', child_id: sb.childId },
      ])
      expect((await told()).data).toEqual([{ title: 'Ms Banda shared something from your talk', href: `/p/${sb.childId}/long-view` }])

      // The last draft is decided: the Needs you item closes. This one is approved, not shared.
      await shapes.getByRole('button', { name: 'Looks right' }).click()
      await check(shapes.getByText('Not shared.')).toBeVisible()
      const closed = await db.from('needs_you_items').select('status').eq('id', item.data!.id).single()
      expect(closed.data?.status).toBe('done')
      await page.reload()
      await expect(fractions).toContainText('Shared with Thandi')
      await expect(shapes).toContainText('Talk to Thandi first.')
      expect((await told()).data).toHaveLength(1)

      // The parent sees only the pattern that was talked through: no links, no raw records.
      await signInWithPassword(page, who.parent.email, who.parent.password)
      await page.goto(`/p/${sb.childId}`)
      const talk = page.getByRole('link', { name: /From your talk with Ms Banda/ })
      await check(talk).toContainText('1 thing your teacher shared with you')
      await talk.click()
      await page.waitForURL(`**/p/${sb.childId}/long-view`)
      await check(page.getByRole('heading', { level: 1 })).toHaveText('From your talk with Ms Banda')
      await expect(page.getByRole('article')).toHaveCount(1)
      await expect(page.getByRole('heading', { name: 'Adding fractions is hard when the bottom numbers differ' })).toBeVisible()
      await expect(page.getByText('Where this comes from')).toBeVisible()
      await expect(page.getByText(/^Shared on \d{1,2} [A-Z][a-z]{2} \d{4}$/)).toBeVisible()
      await expect(page.locator('article a')).toHaveCount(0)
      await expect(page.locator('main')).not.toContainText('Marks in shapes and space stay high')
      await expect(page.locator('main')).not.toContainText(/\d+ out of \d+|Looks right|We have talked/)
      await proof(page, 'parent-view')

      // The learner finds no Long view anywhere.
      await signInWithPassword(page, who.learner.email, who.learner.password)
      for (const path of [`/p/${sb.childId}/long-view`, `/p/${sb.childId}`, long, `${base}/learners/${sb.childId}/profile`]) {
        await page.goto(path)
        await expect(page).not.toHaveURL(/long-view/)
        await expect(page.locator('body')).not.toContainText(/Long view|From your talk with|Where this comes from/)
      }
      for (const path of ['/k', '/k/me']) {
        await page.goto(path)
        await expect(page.locator('body')).not.toContainText(/Long view|From your talk with/)
      }
    } finally {
      await sb.cleanup().catch(() => undefined)
    }
  })

  test('a parent with nothing shared finds no page and no card', async ({ page }) => {
    const sb = await openSandbox(page, { stage: 'marked', role: 'parent' })
    try {
      await page.goto(`/p/${sb.childId}`)
      await check(page.getByRole('heading', { level: 1 })).toContainText('Amina')
      await expect(page.getByText(/From your talk with/)).toHaveCount(0)
      const res = await page.goto(`/p/${sb.childId}/long-view`)
      expect(res?.status()).toBe(404)
      await expect(page.locator('body')).not.toContainText(/Adding fractions is hard|Where this comes from/)
    } finally {
      await sb.cleanup().catch(() => undefined)
    }
  })

  test('a learner with no pattern shows "Too early to tell", asks for one update, and a failed update shows only on this screen', async ({ page }) => {
    const sb = await openSandbox(page, { stage: 'marked', role: 'teacher' })
    try {
      const db = admin()
      const { schoolId } = await logins(sb.sandboxId)
      const base = `/t/${sb.classId}`
      const sipho = (await db.from('children').select('id').eq('school_id', schoolId).eq('first_name', 'Sipho').single()).data!.id

      // Opening it asks for one update. The grid still shows.
      posted.length = 0
      await page.goto(`${base}/learners/${sipho}/long-view`)
      await check(page.getByRole('heading', { name: 'Too early to tell' })).toBeVisible()
      await expect(page.getByText('A pattern needs 3 terms of clear results.')).toBeVisible()
      await expect(page.getByRole('table')).toBeVisible()
      await expect(page.getByRole('article')).toHaveCount(0)
      // Sipho's unclear handwriting was not counted, and the screen says so.
      await expect(page.getByText('What Jemma could not use')).toBeVisible()
      await expect(page.getByText('Not counted, because the marks were hard to read')).toBeVisible()
      await check.poll(async () => (await longViewEvents(sipho)).length).toBe(1)
      await check.poll(() => posted.length).toBe(1)
      await check(page.getByRole('button', { name: 'Update the Long view' })).toBeDisabled()
      await expect(page.getByText('Jemma is looking at the records again.')).toBeVisible()
      // Opening it again does not ask again.
      await page.reload()
      await check(page.getByRole('heading', { name: 'Too early to tell' })).toBeVisible()
      await page.waitForTimeout(1500)
      expect(await longViewEvents(sipho)).toHaveLength(1)
      expect(posted).toHaveLength(1)
      // The update finishes and says when.
      await db.from('events').update({ status: 'done', finished_at: new Date().toISOString() }).eq('id', (await longViewEvents(sipho))[0]!.id)
      await check(page.getByText(/^Last updated today at \d\d:\d\d$/)).toBeVisible({ timeout: 60_000 })
      await expect(page.getByRole('button', { name: 'Update the Long view' })).toBeEnabled()
      await noHorizontalScroll(page)
      await proof(page, 'teacher-too-early')

      // A failed update shows the retry card here, and nowhere else.
      const amina = sb.childId
      await db.from('events').insert({ school_id: schoolId, type: 'long_view.requested', payload: { type: 'long_view.requested', childId: amina }, status: 'failed', error: 'boom secret detail', finished_at: new Date().toISOString() })
      for (const url of [base, `${base}/learners`, `${base}/learners/${amina}`, `${base}/learners/${amina}/profile`, `${base}/notifications`]) {
        await page.goto(url)
        await check(page.locator('main')).toBeVisible()
        await expect(page.locator('body')).not.toContainText(/did not finish|boom secret detail|failed/i)
      }
      await page.goto(`${base}/learners/${amina}/long-view`)
      const alert = page.getByRole('alert').filter({ hasText: 'The update did not finish' })
      await check(alert).toBeVisible()
      await expect(page.locator('body')).not.toContainText('boom secret detail')
      posted.length = 0
      await alert.getByRole('button', { name: 'Try again' }).click()
      await check.poll(() => posted.length).toBe(1)
      await check(page.getByText('Jemma is looking at the records again.')).toBeVisible()
      await expect(page.getByRole('alert').filter({ hasText: 'The update did not finish' })).toHaveCount(0)
      expect(await longViewEvents(amina, 'queued')).toHaveLength(1)

      // A new teacher note asks for an update too, and a second note does not ask again while the first one waits.
      await db.from('events').update({ status: 'done', finished_at: new Date().toISOString() }).eq('school_id', schoolId).eq('type', 'long_view.requested').eq('status', 'queued')
      await page.goto(`${base}/learners/${amina}`)
      const note = async (text: string) => {
        await page.getByRole('button', { name: 'Confidence' }).click()
        await page.getByRole('textbox', { name: 'Note' }).fill(text)
        await page.getByRole('button', { name: 'Save note' }).click()
        await check(page.getByRole('region', { name: 'Earlier notes' }).getByText(text)).toBeVisible()
      }
      await note('Keen to try fraction strips.')
      await check.poll(async () => (await longViewEvents(amina, 'queued')).length).toBe(1)
      await note('Asked to show the whole class how she adds fractions.')
      await page.waitForTimeout(1000)
      expect(await longViewEvents(amina, 'queued')).toHaveLength(1)

      // The terms Thabo has no record for, and a piece written into the records late, are said plainly.
      const kid = async (name: string) => (await db.from('children').select('id').eq('school_id', schoolId).eq('first_name', name).single()).data!.id
      await page.goto(`${base}/learners/${await kid('Thabo')}/long-view`)
      await check(page.getByText('No results for Grade 5, Terms 2 and 3')).toBeVisible()
      await page.goto(`${base}/learners/${await kid('Lerato')}/long-view`)
      await check(page.getByText('Logged late, still counted')).toBeVisible()
    } finally {
      await sb.cleanup().catch(() => undefined)
    }
  })

  test('a learner with two subjects: chips switch the grid, every term shows on a phone, each card names its subject, evidence opens under its own class, and the parent sees the subject', async ({ page }, testInfo) => {
    const phone = testInfo.project.name === 'phone'
    const sb = await openSandbox(page, { stage: 'marked', role: 'teacher' })
    try {
      const db = admin()
      const { schoolId, logins: who } = await logins(sb.sandboxId)
      const year = new Date().getUTCFullYear()
      const base = `/t/${sb.classId}`
      const long = `${base}/learners/${sb.childId}/long-view`
      const onDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

      // English: a second class of the same teacher with a test whose four answers are all wrong, and two earlier terms of reading quizzes.
      // Reading is then low in three terms in a row. The pattern row is what the long_view job would have saved (no model runs here).
      const english = (await db.from('classes').insert({ school_id: schoolId, teacher_id: who.teacher.userId, name: '6B English', grade: 6, year, subject: 'English', join_code: Math.random().toString(36).slice(2, 8).toUpperCase() }).select('id').single()).data!
      await db.from('enrolments').insert({ class_id: english.id, child_id: sb.childId })
      const map = (await db.from('curriculum_maps').insert({ class_id: english.id, status: 'approved' }).select('id').single()).data!
      const topic = (await db.from('topics').insert({ map_id: map.id, term: 1, position: 1, name: 'Reading comprehension', family: 'reading' }).select('id').single()).data!
      const test = (await db.from('tests').insert({ class_id: english.id, title: 'English Test 1', written_on: `${year}-02-20`, out_of: 4, topic_ids: [topic.id] }).select('id').single()).data!
      const paper = (await db.from('papers').insert({ test_id: test.id, child_id: sb.childId, owner: 'teacher', kind: 'test', status: 'marked', name_read: 'Amina', total: 0 }).select('id').single()).data!
      const answers = (
        await db
          .from('question_results')
          .insert([1, 2, 3, 4].map((n) => ({ paper_id: paper.id, child_id: sb.childId, n, prompt: `Question ${n}`, answer_read: 'x', read_confidence: 0.95, correct: false, mark: 0, topic_id: topic.id, topic_name: 'Reading comprehension' })))
          .select('id, n')
          .order('n')
      ).data!
      const quiz = (y: number, term: number, month: string, n: number) => ({ school_id: schoolId, child_id: sb.childId, source: 'quiz', grade: y < year ? 5 : 6, year: y, term, happened_on: `${y}-${month}-10`, logged_at: `${y}-${month}-12T09:00:00Z`, teacher_name: 'Mrs Zulu', title: `Reading quiz ${n}`, family: 'reading', topic_name: 'Reading comprehension', marks: 8, out_of: 20, subject: 'English' })
      const quizzes = (await db.from('learner_records').insert([quiz(year - 1, 3, '08', 1), quiz(year - 1, 4, '11', 2)]).select('id, title, happened_on').order('happened_on')).data!
      await db.from('long_view_patterns').insert({
        child_id: sb.childId, kind: 'struggle', subject: 'English', family: 'reading', title: 'Reading marks stay low',
        statement: 'In English, marks in reading stayed low from Grade 5 Term 3 to Grade 6 Term 1.',
        terms: [{ grade: 5, year: year - 1, term: 3, percent: 40, points: 20 }, { grade: 5, year: year - 1, term: 4, percent: 40, points: 20 }, { grade: 6, year, term: 1, percent: 0, points: 4 }],
        evidence: [
          ...answers.map((a) => ({ kind: 'result', id: a.id, label: `English Test 1, question ${a.n}` })),
          ...quizzes.reverse().map((r) => ({ kind: 'record', id: r.id, label: `${r.title}, Mrs Zulu, ${onDate(r.happened_on)}` })),
        ],
        status: 'draft', active: true,
      })

      const chips = page.getByRole('navigation', { name: 'Subjects' })
      const table = page.getByRole('table')
      const grid = page.getByRole('region', { name: /scrolls sideways/ })
      const insideWindow = async (first: string, last: string, width: number) => {
        expect(await grid.evaluate((el) => el.scrollWidth <= el.clientWidth), `the grid scrolls at ${width}`).toBe(true)
        for (const name of [first, last]) {
          const box = (await table.getByRole('columnheader', { name }).boundingBox())!
          expect(box.x, `${name} starts outside the window at ${width}`).toBeGreaterThanOrEqual(0)
          expect(box.x + box.width, `${name} ends outside the window at ${width}`).toBeLessThanOrEqual(width)
        }
      }

      // The class's subject first. Mathematics is on the screen: its strands only, and a heading over the patterns of each subject.
      await page.goto(long)
      await check(chips).toBeVisible()
      await expect(chips.getByRole('link')).toHaveText(['Mathematics', 'English'])
      await expect(chips.getByRole('link', { name: 'Mathematics' })).toHaveAttribute('aria-current', 'page')
      await expect(chips.getByRole('link', { name: 'English' })).not.toHaveAttribute('aria-current', 'page')
      await expect(table.getByRole('rowheader', { name: 'Fractions' })).toBeVisible()
      await expect(table.getByRole('rowheader', { name: 'Reading' })).toHaveCount(0)
      await expect(page.getByRole('heading', { level: 3, name: 'Mathematics' })).toBeVisible()
      await expect(page.getByRole('heading', { level: 3, name: 'English' })).toBeVisible()
      await expect(page.getByRole('article')).toHaveCount(3)
      const reading = page.getByRole('article').filter({ hasText: 'Reading marks stay low' })
      await expect(reading).toContainText('English · Reading')
      await expect(page.getByRole('article').filter({ hasText: 'Adding fractions is hard when the bottom numbers differ' })).toContainText('Mathematics · Fractions')
      // The English test belongs to the English class, so its answers open under that class, not under the class in the address.
      await expect(reading.locator('a[href*="/papers/"]').first()).toHaveAttribute('href', new RegExp(`^/t/${english.id}/papers/[0-9a-f-]+\\?q=\\d+$`))
      await noHorizontalScroll(page)
      await proof(page, 'teacher-two-subjects')

      // A phone shows every term of the subject, at 390 and at 360 (Mathematics has 12 terms, English 10).
      if (phone) {
        for (const width of [390, 360]) {
          await page.setViewportSize({ width, height: 844 })
          await insideWindow('Grade 4 Term 1', 'Grade 6 Term 4', width)
          await noHorizontalScroll(page)
        }
        await page.setViewportSize({ width: 390, height: 844 })
      } else {
        await insideWindow('Grade 4 Term 1', 'Grade 6 Term 4', 1440)
      }

      // The English chip shows English: its strands only.
      await chips.getByRole('link', { name: 'English' }).click()
      await page.waitForURL('**/long-view?subject=English')
      await expect(chips.getByRole('link', { name: 'English' })).toHaveAttribute('aria-current', 'page')
      await expect(table.getByRole('rowheader')).toHaveText(['Reading'])
      // The terms are the learner's whole record (a note or a term of attendance belongs to every subject), so a term with no English is a dashed dot.
      await expect(table.getByRole('img', { name: 'Reading, Grade 5 Term 3: 40 percent, 20 marks' })).toBeVisible()
      await expect(table.getByRole('img', { name: 'Reading, Grade 6 Term 1: 0 percent, 4 marks' })).toBeVisible()
      await expect(table.getByRole('img', { name: 'Reading, Grade 4 Term 1: no results' })).toBeVisible()
      await expect(page.getByRole('article')).toHaveCount(3)
      if (phone) {
        for (const width of [390, 360]) {
          await page.setViewportSize({ width, height: 844 })
          await insideWindow('Grade 4 Term 1', 'Grade 6 Term 2', width)
          await noHorizontalScroll(page)
        }
        await proof(page, 'teacher-two-subjects-english', false)
        await page.setViewportSize({ width: 390, height: 844 })
      }
      await proof(page, 'teacher-two-subjects-english')

      // An address with a subject the learner does not have shows the class's subject. From the English class, English comes first.
      await page.goto(`${long}?subject=Technology`)
      await expect(chips.getByRole('link', { name: 'Mathematics' })).toHaveAttribute('aria-current', 'page')
      await page.goto(`/t/${english.id}/learners/${sb.childId}/long-view`)
      await expect(chips.getByRole('link')).toHaveText(['English', 'Mathematics'])
      await expect(chips.getByRole('link', { name: 'English' })).toHaveAttribute('aria-current', 'page')

      // The teacher checks the English pattern and talks to the parent: the parent sees the subject on the card and on the page.
      await page.goto(long)
      await reading.getByRole('button', { name: 'Looks right' }).click()
      await check(reading.getByRole('button', { name: 'We have talked' })).toBeVisible()
      await reading.getByRole('button', { name: 'We have talked' }).click()
      await check(reading.getByText(/^Shared with Thandi after your talk on /)).toBeVisible()
      await signInWithPassword(page, who.parent.email, who.parent.password)
      await page.goto(`/p/${sb.childId}`)
      const talk = page.getByRole('link', { name: /From your talk with Ms Banda/ })
      await check(talk).toContainText('1 thing your teacher shared with you · English')
      await talk.click()
      await page.waitForURL(`**/p/${sb.childId}/long-view`)
      const shared = page.getByRole('article')
      await expect(shared).toHaveCount(1)
      await expect(shared).toContainText('English')
      await expect(shared.getByRole('heading', { name: 'Reading marks stay low' })).toBeVisible()
      await expect(page.locator('main')).not.toContainText('Adding fractions is hard')
      await proof(page, 'parent-view-english')
    } finally {
      await sb.cleanup().catch(() => undefined)
    }
  })
})
