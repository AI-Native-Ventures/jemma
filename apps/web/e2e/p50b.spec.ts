import { mkdirSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { resolve } from 'node:path'
import { createServiceClient } from '@jemma/profiling/db'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { openSandbox } from './helpers/sandbox'
import { signInWithPassword } from './helpers/session'

// "Share with parents" on a `marked` sandbox whose test is held again: the teacher sees one card on class home, the test page and the
// progress page; one tap shares and the test page then says who shared and when. While a test is held, a parent and the learner see
// their normal earlier state, never an error page. Headless, no model: a small stand-in answers the web app's posts to the agent
// (port 8752), so nothing is planned and no job runs. Run the web app with AGENT_URL=http://localhost:8752.
// Screenshots for the reviewer are written only when P50B_PROOF is set, to design/proof/p50b, named by width (390 or 1440).

const check = expect.configure({ timeout: 45_000 })

const admin = () => createServiceClient({ SUPABASE_URL: process.env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY! })

const proofDir = resolve(import.meta.dirname, '../../../design/proof/p50b')
async function proof(page: Page, name: string, fullPage = true) {
  if (!process.env.P50B_PROOF) return
  mkdirSync(proofDir, { recursive: true })
  const width = page.viewportSize()!.width >= 1024 ? 1440 : 390
  await page.evaluate(() => document.fonts.ready)
  // The bottom bar sticks to the window: in a whole-page picture it would float in the middle, so it goes to the end of the page.
  const bar = fullPage ? 'nav.sticky.bottom-0{position:static !important}' : ''
  await page.addStyleTag({ content: `nextjs-portal{display:none} *{transition:none !important;animation:none !important} ${bar}` })
  await page.screenshot({ path: resolve(proofDir, `${name}-${width}.png`), fullPage })
}

/** The page itself never scrolls sideways. When it does, the failure names what sticks out. */
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
test.beforeAll(async () => {
  expect(process.env.AGENT_URL, 'run the web app with AGENT_URL=http://localhost:8752, so its posts go to the stand-in and never to a real agent').toBe('http://localhost:8752')
  agent = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200).end('ok')
      return
    }
    req.on('data', () => {})
    req.on('end', () => res.writeHead(202, { 'content-type': 'application/json' }).end('{"queued":true}'))
  })
  await new Promise<void>((done) => agent.listen(8752, done))
})
test.afterAll(async () => {
  await new Promise((done) => agent.close(done))
})

async function peopleOf(sandboxId: string) {
  const row = await admin().from('demo_sandboxes').select('school_id, logins').eq('id', sandboxId).single()
  return { schoolId: row.data!.school_id, logins: row.data!.logins as Logins }
}

/** The seeded test is already shared. Put it back to held, as if the teacher had not tapped yet. */
async function holdSeededTest(classId: string): Promise<string> {
  const db = admin()
  const { data: tests } = await db.from('tests').select('id').eq('class_id', classId)
  expect(tests).toHaveLength(1)
  const testId = tests![0]!.id
  await db.from('approvals').delete().eq('kind', 'share_results').eq('ref_id', testId)
  const held = await db.from('tests').update({ held: true, shared_at: null, shared_by: null }).eq('id', testId).select('id')
  expect(held.data).toHaveLength(1)
  return testId
}

const y = async (locator: Locator) => (await locator.boundingBox())!.y

test.use({ screenshot: 'only-on-failure' })

test.describe('Share with parents', () => {
  test.setTimeout(360_000)
  test.use({ actionTimeout: 45_000 })

  test('the card shows on class home, the test page and the progress page; one tap shares; the test page then says who and when', async ({ page }) => {
    const sb = await openSandbox(page, { stage: 'marked', role: 'teacher' })
    try {
      const db = admin()
      const { schoolId } = await peopleOf(sb.sandboxId)
      const testId = await holdSeededTest(sb.classId)
      const base = `/t/${sb.classId}`
      const title = 'Results are ready. Parents see nothing yet.'
      const card = () => page.getByRole('region', { name: title })
      const marked = '4 papers marked' // Amina, Thabo, Lerato and Naledi; Sipho's paper waits in Needs you
      const waiting = "1 still needs you. You can share now and those follow when you have checked them."

      // Class home: directly under the headline and above the Needs you list.
      await page.goto(base)
      await check(card()).toBeVisible()
      await expect(card().getByText(marked)).toBeVisible()
      await expect(card().getByText(waiting)).toBeVisible()
      await expect(card().getByRole('button', { name: 'Share with parents' })).toBeEnabled()
      const needsYou = page.getByRole('region', { name: 'Needs you' })
      await expect(needsYou).toBeVisible()
      const headline = await y(page.getByRole('heading', { level: 1 }))
      const cardTop = await y(card())
      expect(headline).toBeLessThan(cardTop)
      expect(cardTop).toBeLessThan(await y(needsYou))
      await noHorizontalScroll(page)
      await proof(page, 'class-home-card')

      // The test page: under the title.
      await page.goto(`${base}/tests/${testId}`)
      await check(card()).toBeVisible()
      await expect(card().getByText(marked)).toBeVisible()
      expect(await y(page.getByRole('heading', { level: 1 }))).toBeLessThan(await y(card()))
      await expect(page.getByText(/^Shared with parents by /)).toHaveCount(0)
      await noHorizontalScroll(page)
      await proof(page, 'test-page-before')

      // The snap progress page: under the status card.
      await page.goto(`${base}/snap/${testId}/progress`)
      await check(card()).toBeVisible()
      expect(await y(page.locator('section[aria-live="polite"]'))).toBeLessThan(await y(card()))
      await noHorizontalScroll(page)
      await proof(page, 'progress-card')

      // One tap on the test page. The card goes, and one quiet line says who shared and when.
      await page.goto(`${base}/tests/${testId}`)
      await check(card()).toBeVisible()
      await card().getByRole('button', { name: 'Share with parents' }).click()
      await check(card()).toHaveCount(0)
      const line = page.getByText(/^Shared with parents by Ms Banda, \w{3} \d{1,2} \w{3} \d\d:\d\d$/)
      await check(line).toBeVisible()
      await noHorizontalScroll(page)
      await proof(page, 'test-page-after')

      // What was kept: the three fields, the approval with the teacher's name, and the two events for the agent (stand-in).
      const row = await db.from('tests').select('held, shared_at, shared_by').eq('id', testId).single()
      expect(row.data).toMatchObject({ held: false, shared_by: (await peopleOf(sb.sandboxId)).logins.teacher.userId })
      expect(row.data!.shared_at).toBeTruthy()
      const approvals = await db.from('approvals').select('decided_by_name, decision, note').eq('kind', 'share_results').eq('ref_id', testId)
      expect(approvals.data).toEqual([{ decided_by_name: 'Ms Banda', decision: 'shared', note: 'Class Test 1: Fractions and decimals' }])
      const events = await db.from('events').select('type').eq('school_id', schoolId).in('type', ['test.shared', 'long_view.requested'])
      expect(events.data!.filter((e) => e.type === 'test.shared')).toHaveLength(1)
      expect(events.data!.filter((e) => e.type === 'long_view.requested')).toHaveLength(4)

      // Class home and the progress page show nothing more about it.
      await page.goto(base)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(card()).toHaveCount(0)
      await expect(page.getByText(/^Shared with parents by /)).toHaveCount(0)
      await page.goto(`${base}/snap/${testId}/progress`)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(card()).toHaveCount(0)
      await expect(page.getByText(/^Shared with parents by /)).toHaveCount(0)
    } finally {
      await sb.cleanup().catch(() => undefined)
    }
  })

  test('while a test is held a parent and the learner see their earlier state, never an error, and no mark of that test', async ({ page }) => {
    const sb = await openSandbox(page, { stage: 'marked', role: 'teacher' })
    try {
      const { logins: who } = await peopleOf(sb.sandboxId)
      const testId = await holdSeededTest(sb.classId)
      expect(testId).toBeTruthy()
      const TITLE = 'Class Test 1'

      /** The page loads with no error page and shows nothing of the held test, not even in the data the page carries. */
      const calm = async (path: string, heading: RegExp) => {
        const res = await page.goto(path)
        expect(res?.status(), `${path} answers`).toBeLessThan(400)
        await check(page.getByRole('heading', { level: 1 })).toContainText(heading)
        await expect(page.getByText(/Application error|Internal Server Error|This page couldn.t load|Something went wrong/i)).toHaveCount(0)
        expect(await page.content(), `${path} must not carry the held test`).not.toContain(TITLE)
        await noHorizontalScroll(page)
      }

      // The parent (linked and approved): profile and tests page.
      await signInWithPassword(page, who.parent.email, who.parent.password)
      await calm(`/p/${sb.childId}`, /Amina/)
      await proof(page, 'parent-profile-held')
      await calm(`/p/${sb.childId}/tests`, /./)
      await proof(page, 'parent-tests-held')

      // The learner's own home.
      await signInWithPassword(page, who.learner.email, who.learner.password)
      const res = await page.goto('/k')
      expect(res?.status()).toBeLessThan(400)
      await check(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.getByText(/Application error|Internal Server Error|This page couldn.t load|Something went wrong/i)).toHaveCount(0)
      expect(await page.content()).not.toContain(TITLE)
      await proof(page, 'learner-home-held')

      // After the share the parent sees the test on both pages.
      await admin().from('tests').update({ held: false, shared_at: new Date().toISOString(), shared_by: who.teacher.userId }).eq('id', testId)
      await signInWithPassword(page, who.parent.email, who.parent.password)
      await page.goto(`/p/${sb.childId}/tests`)
      await check(page.getByText(new RegExp(TITLE)).first()).toBeVisible()
    } finally {
      await sb.cleanup().catch(() => undefined)
    }
  })
})
