import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { MemoryStore } from '@jemma/profiling/ai'
import { createServiceClient } from '@jemma/profiling/db'
import { getJob } from '../../../packages/profiling/src/tools/read/get-job'
import { getLearnerProfile } from '../../../packages/profiling/src/tools/read/get-learner-profile'
import { logExternalCalls } from '../../../packages/profiling/src/tools/save/log-external-calls'
import { saveTopicMapDraft } from '../../../packages/profiling/src/tools/save/save-topic-map-draft'
import type { ToolContext } from '../../../packages/profiling/src/tools/context'
import { expect, test, type Page } from '@playwright/test'
import { topicMapDraft } from '../../../supabase/seed/fixtures/marked-state'
import { openSandbox } from './helpers/sandbox'

/** First page loads compile on demand, so assertions wait longer than the default 5 s. */
const check = expect.configure({ timeout: 20_000 })

const admin = () =>
  createServiceClient({
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  })

/** Screenshots for the reviewer are written only when P50_PROOF is set, so a normal run leaves no files behind. */
const proofDir = resolve(import.meta.dirname, '../../../design/proof/p50')
async function proof(page: Page, name: string) {
  if (!process.env.P50_PROOF) return
  mkdirSync(proofDir, { recursive: true })
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: 'nextjs-portal{display:none} *{transition:none !important;animation:none !important}' })
  await page.screenshot({ path: resolve(proofDir, name), fullPage: true })
}

async function noHorizontalScroll(page: Page) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(wide).toBe(false)
}

/** The class's draft map, saved by the real save tool the way the draft job's last step does. No model is called. */
async function draftedMap(ctx: ToolContext, classId: string) {
  const made = await ctx.db.from('curriculum_maps').insert({ class_id: classId, status: 'draft' }).select('id').single()
  const mapId = made.data!.id
  await ctx.db.from('curriculum_docs').insert([
    { class_id: classId, storage_path: 'x/a.pdf', title: 'CAPS Intermediate Phase Mathematics', pages: 185 },
    { class_id: classId, storage_path: 'x/b.pdf', title: 'Grade 6 Annual Teaching Plan', pages: 24 },
  ])
  await saveTopicMapDraft.run(ctx, { mapId, draft: topicMapDraft() })
  return mapId
}

test.describe('the full log', () => {
  test.setTimeout(180_000)
  test.use({ actionTimeout: 20_000 })

  test('approving the topic map puts the teacher name on the log, and tool calls show what went in and out', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'phone project only')
    const sb = await openSandbox(page, { stage: 'start', role: 'teacher' })
    try {
      const db = admin()
      const cls = await db.from('classes').select('school_id, teacher_id').eq('id', sb.classId).single()
      const schoolId = cls.data!.school_id
      const teacher = await db.from('profiles').select('display_name').eq('user_id', cls.data!.teacher_id).single()
      const teacherName = teacher.data!.display_name
      expect(teacherName.length).toBeGreaterThan(0)

      const ctx = (extra: Partial<ToolContext> = {}): ToolContext => ({
        db,
        schoolId,
        eventId: null,
        env: { replayStore: new MemoryStore(), LLM_MODEL: 'demo/model:free' },
        now: () => new Date(),
        ...extra,
      })

      // Tool calls from the three places they come from: a cloud job, an outside agent over MCP, a runner.
      const mapId = await draftedMap(ctx(), sb.classId)
      const event = await db
        .from('events')
        .insert({ school_id: schoolId, type: 'curriculum.uploaded', payload: { type: 'curriculum.uploaded', mapId }, status: 'done' })
        .select('id')
        .single()
      const eventId = event.data!.id
      await getJob.run(ctx({ via: 'mcp', engine: 'claude', model: 'claude-sonnet-5-5' }), { eventId })
      await expect(getLearnerProfile.run(ctx(), { childId: randomUUID() })).rejects.toThrow('not in this school')
      await logExternalCalls.run(ctx(), {
        eventId,
        engine: 'goose',
        model: 'deepseek/deepseek-chat',
        usage: { inputTokens: 4210, outputTokens: 860, costUsd: 0.0031 },
        calls: [
          { server: 'files', tool: 'read_file', input: { path: 'notes/term-3.txt' }, output: { text: 'Term 3 starts on 14 July.' }, ok: true, at: new Date().toISOString() },
          { server: 'calendar', tool: 'find_date', input: { month: 'July' }, output: { error: 'no calendar connected' }, ok: false, at: new Date().toISOString() },
        ],
      })

      // The teacher approves the map in the app.
      await page.goto(`/t/${sb.classId}/curriculum/map`)
      await check(page.getByRole('button', { name: 'Approve map' })).toBeVisible()
      await page.getByRole('button', { name: 'Approve map' }).click()
      await page.waitForURL(`**/t/${sb.classId}/curriculum`)
      await check(page.getByText(/^Approved /)).toBeVisible()

      // The approval is saved with the teacher's name.
      const approvals = await db.from('approvals').select('*').eq('school_id', schoolId)
      expect(approvals.data).toHaveLength(1)
      expect(approvals.data![0]).toMatchObject({
        kind: 'topic_map',
        ref_id: mapId,
        decision: 'approved',
        decided_by: cls.data!.teacher_id,
        decided_by_name: teacherName,
        child_id: null,
      })

      // The log screen.
      await page.goto(`/t/${sb.classId}/log`)
      await check(page.getByRole('heading', { level: 1 })).toHaveText('What Jemma did, in full')
      await check(page.getByText(`${teacherName} approved the topic map`)).toBeVisible()
      const draftRow = page.getByRole('listitem').filter({ hasText: 'Saved a draft topic map' })
      await check(draftRow).toContainText('Jemma cloud')
      await check(page.getByRole('listitem').filter({ hasText: 'Looked up the next job' })).toContainText('Agent through MCP')
      await check(page.getByRole('listitem').filter({ hasText: 'read_file on files' })).toContainText('Runner: goose, deepseek/deepseek-chat')
      await check(page.getByRole('listitem').filter({ hasText: 'Agent run, tokens and cost' })).toContainText('Runner: goose, deepseek/deepseek-chat')
      const failedRead = page.getByRole('listitem').filter({ hasText: 'Read a learner profile' })
      await expect(failedRead.getByText('Failed', { exact: true })).toBeVisible()
      // A call a runner reports as not ok is marked too; one that worked is not.
      await expect(page.getByRole('listitem').filter({ hasText: 'find_date on calendar' }).getByText('Failed', { exact: true })).toBeVisible()
      await expect(page.getByRole('listitem').filter({ hasText: 'read_file on files' }).getByText('Failed', { exact: true })).toHaveCount(0)
      await noHorizontalScroll(page)

      // What went in and what came out stay closed until opened.
      const details = draftRow.locator('details')
      await expect(details).not.toHaveAttribute('open', '')
      await expect(draftRow.getByText('What went in', { exact: true })).toBeHidden()
      await draftRow.getByText('What went in and what came out').click()
      await expect(details).toHaveAttribute('open', '')
      await expect(draftRow.getByText('What went in', { exact: true })).toBeVisible()
      await expect(draftRow.getByText('What came out', { exact: true })).toBeVisible()
      const [wentIn, cameOut] = await draftRow.locator('pre').allTextContents()
      expect(JSON.parse(wentIn!)).toMatchObject({ mapId })
      expect(JSON.parse(cameOut!)).toMatchObject({ topics: 24 })
      await noHorizontalScroll(page)

      // The failed call keeps its reason.
      await failedRead.getByText('What went in and what came out').click()
      await expect(failedRead.locator('pre').nth(1)).toContainText('not in this school')

      await proof(page, 'log-390.png')
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto(`/t/${sb.classId}/log`)
      await check(page.getByRole('heading', { level: 1 })).toHaveText('What Jemma did, in full')
      await page.getByRole('listitem').filter({ hasText: 'Saved a draft topic map' }).getByText('What went in and what came out').click()
      await noHorizontalScroll(page)
      await proof(page, 'log-1440.png')
    } finally {
      await sb.cleanup()
    }
  })

  test('the class home links to the full log on the phone and on the laptop', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'phone project only; it resizes itself')
    const sb = await openSandbox(page, { stage: 'marked', role: 'teacher' })
    try {
      for (const [name, size] of [['390', { width: 390, height: 844 }], ['1440', { width: 1440, height: 900 }]] as const) {
        await page.setViewportSize(size)
        await page.goto(`/t/${sb.classId}`)
        const link = page.getByRole('link', { name: 'See the full log' }).first()
        await check(link).toBeVisible()
        await link.scrollIntoViewIfNeeded()
        await proof(page, `class-home-${name}.png`)
        await link.click()
        await page.waitForURL(`**/t/${sb.classId}/log`)
        await check(page.getByRole('heading', { level: 1 })).toHaveText('What Jemma did, in full')
      }
    } finally {
      await sb.cleanup()
    }
  })

  test('a parent cannot open the log', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'phone project only')
    const sb = await openSandbox(page, { stage: 'start', role: 'parent' })
    try {
      await page.goto(`/t/${sb.classId}/log`)
      await page.waitForURL((url) => !url.pathname.endsWith('/log'))
      await expect(page.getByText('What Jemma did, in full')).toHaveCount(0)
    } finally {
      await sb.cleanup()
    }
  })
})
