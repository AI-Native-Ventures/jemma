import { resolve } from 'node:path'
import { MemoryStore } from '@jemma/profiling/ai'
import { createServiceClient } from '@jemma/profiling/db'
import { saveTopicMapDraft } from '../../../packages/profiling/src/tools/save/save-topic-map-draft'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { topicMapDraft } from '../../../supabase/seed/fixtures/marked-state'
import { openSandbox } from './helpers/sandbox'

const admin = () =>
  createServiceClient({
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  })

const actual = (board: string) => resolve(import.meta.dirname, `../../../design/actual/${board}.png`)

/** Design match gate: boards are phone-size, so screenshots are saved from the phone project only. */
async function shot(page: Page, testInfo: TestInfo, board: string) {
  if (testInfo.project.name !== 'phone') return
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: 'nextjs-portal{display:none}' })
  await page.screenshot({ path: actual(board), fullPage: true })
}

async function noHorizontalScroll(page: Page) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(wide).toBe(false)
}

/**
 * The agent worker is not running in e2e and Playwright cannot load the job's prompt file, so the draft_map
 * job's last step runs here: the real save tool writes the board's map, the Needs you item and the log.
 * No model is called.
 */
async function runDraftJob(schoolId: string, mapId: string) {
  await saveTopicMapDraft.run(
    { db: admin(), schoolId, eventId: null, env: { replayStore: new MemoryStore() }, now: () => new Date() },
    { mapId, draft: topicMapDraft() },
  )
}

test.describe('curriculum upload, map and approval', () => {
  test.setTimeout(120_000)
  test('sample curriculum to draft map to approved map', async ({ page }, testInfo) => {
    const sb = await openSandbox(page, { stage: 'start', role: 'teacher' })
    try {
      const base = `/t/${sb.classId}/curriculum`
      await page.goto(base)
      await page.getByRole('button', { name: 'Use the sample curriculum' }).click()
      await expect(page.getByText('Jemma is reading your curriculum.')).toBeVisible()

      const db = admin()
      const map = await db.from('curriculum_maps').select('id, status').eq('class_id', sb.classId).single()
      expect(map.data?.status).toBe('draft')
      const school = await db.from('classes').select('school_id').eq('id', sb.classId).single()
      await runDraftJob(school.data!.school_id, map.data!.id)

      await page.goto(base)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your draft topic map is ready. 2 things for you to check.')
      await expect(page.getByText('Nothing reaches a learner until you approve the map.')).toBeVisible()
      await expect(page.getByText('CAPS Intermediate Phase Mathematics')).toBeVisible()
      await expect(page.getByText('185 pages · Grade 6 found on pages 104 to 151')).toBeVisible()
      await expect(page.getByText('Grade 6 Annual Teaching Plan')).toBeVisible()
      await expect(page.getByText('Read 2 documents, 209 pages')).toBeVisible()
      await expect(page.getByText('Drafted 24 topics in teaching order and linked which topic needs which')).toBeVisible()
      await noHorizontalScroll(page)

      // "Or start from a map another teacher approved" stays visible and opens the sheet.
      await page.getByRole('button', { name: 'Or start from a map another teacher approved' }).click()
      await expect(page.getByRole('dialog')).toContainText('Coming after the challenge')
      await page.getByRole('button', { name: 'Got it' }).click()
      await shot(page, testInfo, 'teacher-curriculum-upload')

      // Nothing is on the map for a learner yet.
      expect((await db.from('topics').select('id').eq('map_id', map.data!.id)).data).toHaveLength(0)

      await page.getByRole('link', { name: 'Check the draft map' }).click()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('24 topics in 4 terms. Check 2 in Term 3, then approve.')
      await expect(page.getByRole('heading', { name: 'Term 3 · July to September' })).toBeVisible()
      await expect(page.getByText('6 topics', { exact: true })).toBeVisible()
      await expect(page.getByText('The teaching plan lists percentages in Term 3 and again in Term 4. I put it in Term 3.')).toBeVisible()
      await expect(page.getByText('It sat on a Grade 5 page, but your teaching plan mentions it in Term 3. Add it?')).toBeVisible()
      await noHorizontalScroll(page)
      await shot(page, testInfo, 'teacher-curriculum-map')

      await page.getByRole('button', { name: 'Keep in Term 3' }).click()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('24 topics in 4 terms. Check 1 in Term 3, then approve.')
      await page.getByRole('button', { name: 'Leave it out' }).click()
      await expect(page.getByText('Nothing left to check. Approve when the map looks right.')).toBeVisible()

      await page.getByRole('button', { name: 'Approve map' }).click()
      await page.waitForURL(`**${base}`)
      await expect(page.getByText(/^Approved /)).toBeVisible()
      await expect(page.getByRole('link', { name: 'See or edit the whole map' })).toBeVisible()
      await expect(page.getByText('Saved the map you approved: 24 topics, Percentages kept in Term 3, Rounding left out')).toBeVisible()
      await noHorizontalScroll(page)

      const approved = await db.from('curriculum_maps').select('status').eq('id', map.data!.id).single()
      expect(approved.data?.status).toBe('approved')
      expect((await db.from('topics').select('id').eq('map_id', map.data!.id)).data).toHaveLength(24)
      const need = await db.from('needs_you_items').select('status').eq('ref_id', map.data!.id).eq('kind', 'approve_map')
      expect(need.data?.every((n) => n.status === 'done')).toBe(true)
    } finally {
      await sb.cleanup()
    }
  })

  test('a topic can be added and moved on the draft map', async ({ page }) => {
    const sb = await openSandbox(page, { stage: 'start', role: 'teacher' })
    try {
      const base = `/t/${sb.classId}/curriculum`
      await page.goto(base)
      await page.getByRole('button', { name: 'Use the sample curriculum' }).click()
      await expect(page.getByText('Jemma is reading your curriculum.')).toBeVisible()
      const db = admin()
      const map = await db.from('curriculum_maps').select('id').eq('class_id', sb.classId).single()
      const school = await db.from('classes').select('school_id').eq('id', sb.classId).single()
      await runDraftJob(school.data!.school_id, map.data!.id)

      await page.goto(`${base}/map`)
      await page.getByRole('button', { name: 'Add a topic to Term 3' }).click()
      await page.getByLabel('Topic name').fill('Ratio and rate')
      await page.getByRole('button', { name: 'Add topic' }).click()
      await expect(page.getByText('7 topics', { exact: true })).toBeVisible()
      await expect(page.getByText('Ratio and rate')).toBeVisible()

      await page.getByRole('button', { name: 'Edit Ratio and rate' }).click()
      await page.getByLabel('Topic name').fill('Ratio and rates')
      await page.getByRole('button', { name: 'Save topic' }).click()
      await expect(page.getByText('Ratio and rates')).toBeVisible()

      await page.getByRole('button', { name: 'Move Ratio and rates' }).click()
      await expect
        .poll(async () => (await page.locator('ol > li span.topic-name').allTextContents()).indexOf('Ratio and rates'))
        .toBe(5)
    } finally {
      await sb.cleanup()
    }
  })

  test('approved map shows the class results by topic', async ({ page }, testInfo) => {
    const sb = await openSandbox(page, { stage: 'marked', role: 'teacher' })
    try {
      await page.goto(`/t/${sb.classId}/curriculum`)
      await expect(page.getByText(/^Approved /)).toBeVisible()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        'Adding is behind: decimals this term, fractions and mixed numbers from Term 3.',
      )
      await expect(page.getByRole('heading', { name: 'Term 4 · now' })).toBeVisible()
      await expect(page.getByText('Oct to Dec · 6 topics')).toBeVisible()
      await expect(page.getByText('Not tested yet')).toHaveCount(2)
      await expect(page.getByRole('heading', { name: 'Earlier topics in Class Test 1' })).toBeVisible()
      await expect(page.getByText('Term 3 · reteach plan ready')).toBeVisible()
      await expect(page.getByText('Each % is the share of answers the class got right on that topic in Class Test 1. Coral bars are under half.')).toBeVisible()
      await expect(page.getByText("Tagged Class Test 1's 10 questions to 7 topics on your map")).toBeVisible()
      await expect(page.getByText('Drafted the map from your 2 documents')).toBeVisible()
      await noHorizontalScroll(page)
      await shot(page, testInfo, 'teacher-curriculum-approved')
    } finally {
      await sb.cleanup()
    }
  })
})
