import { resolve } from 'node:path'
import { MemoryStore } from '@jemma/profiling/ai'
import { createServiceClient } from '@jemma/profiling/db'
import { saveTopicMapDraft } from '../../../packages/profiling/src/tools/save/save-topic-map-draft'
import { expect, test, type Page } from '@playwright/test'
import { topicMapDraft } from '../../../supabase/seed/fixtures/marked-state'
import { openSandbox } from './helpers/sandbox'

const check = expect.configure({ timeout: 20_000 })

const admin = () =>
  createServiceClient({
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  })

const actual = (board: string) => resolve(import.meta.dirname, `../../../design/actual/${board}.png`)

async function noHorizontalScroll(page: Page) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(wide).toBe(false)
}

/** Seeds the draft map for a fresh sandbox the way the draft_map job's last step does. No model is called. */
async function draftedMap(classId: string) {
  const db = admin()
  const cls = await db.from('classes').select('school_id').eq('id', classId).single()
  const made = await db.from('curriculum_maps').insert({ class_id: classId, status: 'draft' }).select('id').single()
  const mapId = made.data!.id
  await db.from('curriculum_docs').insert([
    { class_id: classId, storage_path: 'x/a.pdf', title: 'CAPS Intermediate Phase Mathematics', pages: 185 },
    { class_id: classId, storage_path: 'x/b.pdf', title: 'Grade 6 Annual Teaching Plan', pages: 24 },
  ])
  await saveTopicMapDraft.run(
    { db, schoolId: cls.data!.school_id, eventId: null, env: { replayStore: new MemoryStore() }, now: () => new Date() },
    { mapId, draft: topicMapDraft() },
  )
  return mapId
}

test.describe('laptop: curriculum map', () => {
  test.setTimeout(120_000)
  test.use({ actionTimeout: 20_000 })

  test('map and topic panel sit side by side, edits save', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'laptop', 'laptop layout')
    const sb = await openSandbox(page, { stage: 'start', role: 'teacher' })
    try {
      const mapId = await draftedMap(sb.classId)
      await page.goto(`/t/${sb.classId}/curriculum/map`)

      await check(page.getByRole('heading', { level: 1 })).toHaveText('24 topics in 4 terms. Check 2 in Term 3, then approve.')
      await check(page.getByText('Curriculum · Grade 6 Mathematics')).toBeVisible()
      await expect(page.getByText('Draft', { exact: true })).toBeVisible()
      await expect(page.getByText('Drafted from CAPS Intermediate Phase Mathematics and the Grade 6 Annual Teaching Plan. Nothing reaches a learner until you approve.')).toBeVisible()
      await expect(page.getByRole('link', { name: 'Documents' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Approve map' })).toBeVisible()
      for (const l of ['Selected', 'Needed first', 'Builds on it', 'For you to check']) await expect(page.getByText(l, { exact: true }).first()).toBeVisible()

      // Four term columns on one row, the panel to their right.
      const boxes = await Promise.all([1, 2, 3, 4].map((n) => page.getByRole('heading', { name: new RegExp(`^Term ${n}\\b`) }).first().boundingBox()))
      const ys = new Set(boxes.map((b) => Math.round(b!.y)))
      expect(ys.size).toBe(1)
      const panel = await page.locator('section[aria-labelledby="edit"]').boundingBox()
      expect(panel!.x).toBeGreaterThan(boxes[3]!.x)
      await noHorizontalScroll(page)

      // The first topic of the first term with checks is selected.
      await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Adding fractions with different denominators')
      await expect(page.getByText('Needs first', { exact: true })).toBeVisible()
      await expect(page.getByText('Equivalent fractions · T1')).toBeVisible()
      await expect(page.getByText('Mistakes Jemma looks for')).toBeVisible()
      await expect(page.getByText('Found in the teaching plan, Term 3. Every test question and lesson on this topic gets tagged to it.')).toBeVisible()
      await expect(page.getByText('Builds on it', { exact: true }).nth(1)).toBeVisible()

      await page.evaluate(() => document.fonts.ready)
      await page.addStyleTag({ content: 'nextjs-portal{display:none}' })
      await page.screenshot({ path: actual('laptop-teacher-curriculum'), fullPage: true })

      // Check card resolves from the panel.
      await page.getByRole('button', { name: /Percentages/ }).click()
      await expect(page.getByText('The teaching plan lists percentages in Term 3 and again in Term 4. I put it in Term 3.')).toBeVisible()
      await page.getByRole('button', { name: 'Keep in Term 3' }).click()
      await check(page.getByRole('heading', { level: 1 })).toHaveText('24 topics in 4 terms. Check 1 in Term 3, then approve.')

      // Rename, move to Term 4 and drop a prerequisite, then Save.
      await page.getByRole('button', { name: /\d 3D objects$/ }).click()
      await page.getByLabel('Name', { exact: true }).fill('Solid shapes')
      await page.getByLabel('Term', { exact: true }).selectOption('4')
      await page.getByRole('button', { name: 'Save' }).click()
      await check(page.getByText('Term 4 · topic 7', { exact: true })).toBeVisible()
      const read = async () => (await admin().from('curriculum_maps').select('draft').eq('id', mapId).single()).data!.draft as { terms: { term: number; topics: { name: string }[] }[] }
      await check.poll(async () => (await read()).terms.find((t) => t.term === 4)!.topics.at(-1)!.name).toBe('Solid shapes')

      // Remove a prerequisite chip.
      await page.getByRole('button', { name: /Adding fractions with different denominators/ }).first().click()
      await page.getByRole('button', { name: 'Remove Equivalent fractions' }).click()
      await expect(page.getByText('Equivalent fractions · T1')).toHaveCount(0)
      await page.getByRole('button', { name: 'Save' }).click()
      await check.poll(async () => {
        const d = (await read()) as unknown as { terms: { topics: { name: string; prerequisites: string[] }[] }[] }
        return d.terms.flatMap((t) => t.topics).find((t) => t.name === 'Adding fractions with different denominators')!.prerequisites
      }).toEqual(['Adding fractions with the same denominator'])

      // Remove a topic.
      await page.getByRole('button', { name: /\d Solid shapes$/ }).click()
      await page.getByRole('button', { name: 'Remove topic' }).click()
      await expect(page.getByRole('button', { name: /\d Solid shapes$/ })).toHaveCount(0)

      for (const width of [1024, 1280, 1440]) {
        await page.setViewportSize({ width, height: 900 })
        await noHorizontalScroll(page)
      }
    } finally {
      await sb.cleanup()
    }
  })

  test('curriculum page works at laptop widths', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'laptop', 'laptop layout')
    const sb = await openSandbox(page, { stage: 'start', role: 'teacher' })
    try {
      await draftedMap(sb.classId)
      for (const width of [1024, 1280, 1440]) {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(`/t/${sb.classId}/curriculum`)
        await check(page.getByRole('heading', { level: 1 })).toContainText('Your draft topic map is ready')
        await noHorizontalScroll(page)
      }
    } finally {
      await sb.cleanup()
    }
  })

  test('phone map layout is unchanged', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'phone layout')
    const sb = await openSandbox(page, { stage: 'start', role: 'teacher' })
    try {
      await draftedMap(sb.classId)
      await page.goto(`/t/${sb.classId}/curriculum/map`)
      await check(page.getByRole('heading', { name: 'Term 3 · July to September' })).toBeVisible()
      await expect(page.getByText('6 topics', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Add a topic to Term 3' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Approve map' })).toBeVisible()
      await noHorizontalScroll(page)
    } finally {
      await sb.cleanup()
    }
  })
})
