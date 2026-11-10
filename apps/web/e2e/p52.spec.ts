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
// Screenshots for the reviewer are written only when P52_PROOF is set, to design/proof/p52, named by width (390 or 1440).

const check = expect.configure({ timeout: 20_000 })

const admin = () => createServiceClient({ SUPABASE_URL: process.env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY! })

const proofDir = resolve(import.meta.dirname, '../../../design/proof/p52')
async function proof(page: Page, name: string, fullPage = true) {
  if (!process.env.P52_PROOF) return
  mkdirSync(proofDir, { recursive: true })
  const width = page.viewportSize()!.width >= 1024 ? 1440 : 390
  await page.evaluate(() => document.fonts.ready)
  // The bottom bar sticks to the window: in a whole-page picture it would float in the middle, so it goes to the end of the page.
  const bar = fullPage ? 'nav.sticky.bottom-0{position:static !important}' : ''
  await page.addStyleTag({ content: `nextjs-portal{display:none} *{transition:none !important;animation:none !important} ${bar}` })
  await page.screenshot({ path: resolve(proofDir, `${name}-${width}.png`), fullPage })
}

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
  await new Promise<void>((done) => agent.listen(8753, done))
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
  test.use({ actionTimeout: 20_000 })

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
      await expect(table.getByRole('rowheader', { name: 'Fractions' })).toBeVisible()
      await expect(table.getByRole('rowheader', { name: 'Shapes and space' })).toBeVisible()
      await expect(table.getByRole('img', { name: /^Fractions, Grade 5 Term 3: 40 percent, \d+ marks$/ })).toBeVisible()
      await expect(table.getByRole('img', { name: 'Shapes and space, Grade 5 Term 3: no results' })).toBeVisible()
      await expect(page.getByText(/full = 80 percent or more/)).toBeVisible()
      await expect(page.getByText(/dashed outline = no results that term/)).toBeVisible()
      await noHorizontalScroll(page)
      if (!phone) expect(await page.getByRole('region', { name: /scrolls sideways/ }).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)

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
      await proof(page, 'teacher-drafts')

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
      await check(page.getByText(/^Last updated today at \d\d:\d\d$/)).toBeVisible({ timeout: 30_000 })
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
})
