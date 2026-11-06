import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createServiceClient } from '@jemma/profiling/db'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { openSandbox, type OpenedSandbox } from './helpers/sandbox'

const admin = () => createServiceClient({ SUPABASE_URL: process.env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY! })
const actual = (board: string) => resolve(import.meta.dirname, `../../../design/actual/${board}.png`)

async function shot(page: Page, testInfo: TestInfo, board: string, fullPage: boolean) {
  if (testInfo.project.name !== 'phone') return
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: 'nextjs-portal{display:none}' })
  await page.screenshot({ path: actual(board), fullPage })
}

async function desktopMainShot(page: Page, testInfo: TestInfo, classId: string) {
  if (testInfo.project.name !== 'laptop') return
  await page.setViewportSize({ width: 1200, height: 722 })
  await page.goto(`/t/${classId}`)
  await expect(page.getByRole('heading', { name: /learners add the tops and the bottoms when adding fractions/ })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: 'nextjs-portal{display:none}' })
  const webView = await page.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 722 } })

  const shell = await page.context().newPage()
  const composite = await page.context().newPage()
  try {
    await shell.setViewportSize({ width: 1200, height: 800 })
    await shell.addInitScript((state) => {
      Object.defineProperty(window, 'jemma', {
        value: { getShell: async () => state, onState: () => {} },
      })
    }, { agent: 'claude', status: { kind: 'ready' }, showStrip: true })
    await shell.goto(pathToFileURL(resolve(import.meta.dirname, '../../desktop/src/pages/shell.html')).href)
    await expect(shell.locator('[role=status]')).toContainText('Jemma Desktop · Claude Code · Ready')
    await shell.evaluate(() => document.fonts.ready)
    await shell.evaluate(() => {
      const bar = document.querySelector('.drag')
      if (!bar) return
      const lights = document.createElement('span')
      lights.setAttribute('aria-hidden', 'true')
      lights.style.cssText = 'position:absolute;left:14px;top:13px;display:flex;gap:8px;z-index:1'
      for (const color of ['#FF5F57', '#FEBC2E', '#28C840']) {
        const light = document.createElement('span')
        light.style.cssText = `width:12px;height:12px;border-radius:999px;background:${color}`
        lights.append(light)
      }
      bar.prepend(lights)
    })
    const header = await shell.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 78 } })

    await composite.setViewportSize({ width: 1200, height: 800 })
    await composite.setContent('<!doctype html><html><body style="margin:0"><canvas width="1200" height="800"></canvas></body></html>')
    await composite.evaluate(async ({ top, body }) => {
      const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = reject
        image.src = src
      })
      const [headerImage, webImage] = await Promise.all([load(top), load(body)])
      const canvas = document.querySelector('canvas')!
      const context = canvas.getContext('2d')!
      context.drawImage(headerImage, 0, 0)
      context.drawImage(webImage, 0, 78)
    }, {
      top: `data:image/png;base64,${header.toString('base64')}`,
      body: `data:image/png;base64,${webView.toString('base64')}`,
    })
    await composite.screenshot({ path: actual('desktop-main'), clip: { x: 0, y: 0, width: 1200, height: 800 } })
  } finally {
    await Promise.all([shell.close(), composite.close()])
  }
}

let sb: OpenedSandbox | null = null
test.beforeEach(() => test.setTimeout(120_000))
test.afterEach(async () => {
  await sb?.cleanup().catch(() => undefined)
  sb = null
})

async function teacherOf(sandbox: OpenedSandbox) {
  const db = admin()
  const { data: cls } = await db.from('classes').select('teacher_id, school_id').eq('id', sandbox.classId).single()
  return { db, teacherId: cls!.teacher_id, schoolId: cls!.school_id }
}

test('teacher-ai-runner: choose where the AI runs, see desktops, get a pairing code', async ({ page }, testInfo) => {
  sb = await openSandbox(page, { stage: 'marked', role: 'teacher' })
  const { db, teacherId, schoolId } = await teacherOf(sb)
  await db.from('schools').update({ ai_runner: 'desktop' }).eq('id', schoolId)
  await db.from('runner_presence').insert({ runner_id: crypto.randomUUID(), user_id: teacherId, agents: {}, chosen: 'claude', created_at: '2026-10-26T10:00:00Z', last_seen: new Date().toISOString() })

  await page.goto(`/t/${sb.classId}/settings`)
  await page.getByRole('link', { name: /Jemma cloud or my Jemma Desktop/ }).click()
  await expect(page.getByRole('heading', { name: /AI runs on your MacBook/ })).toBeVisible()
  await expect(page.getByText('Paired Mon 26 Oct')).toBeVisible()
  await expect(page.getByText(/· Claude Code · Ready/)).toBeVisible()
  await shot(page, testInfo, 'teacher-ai-runner', true)

  await page.getByRole('button', { name: /Jemma cloud \(free models\)/ }).click()
  await expect(page.getByRole('heading', { name: /runs on the Jemma cloud/ })).toBeVisible()
  expect((await db.from('schools').select('ai_runner').eq('id', schoolId).single()).data!.ai_runner).toBe('cloud')

  await page.getByRole('button', { name: /Pair a desktop/ }).click()
  await expect(page.getByTestId('pair-code')).toHaveText(/^[A-Z2-9]{6}$/)
  await desktopMainShot(page, testInfo, sb.classId)
})

test('teacher-desktop-off: the Needs you card has Open Jemma Desktop and Run in the cloud this time', async ({ page }, testInfo) => {
  sb = await openSandbox(page, { stage: 'marked', role: 'teacher' })
  const { db, teacherId, schoolId } = await teacherOf(sb)
  await db.from('needs_you_items').delete().eq('school_id', schoolId)
  const { data: ev } = await db.from('events').insert({ school_id: schoolId, type: 'paper.snapped', payload: { paperId: crypto.randomUUID() }, status: 'queued', runner: 'desktop' }).select('id').single()
  await db.from('needs_you_items').insert({ owner_id: teacherId, school_id: schoolId, kind: 'desktop_off', ref_id: ev!.id, status: 'open', title: 'Jemma Desktop is off', detail: '1 job is waiting.' })

  await page.goto(`/t/${sb.classId}`)
  await expect(page.getByText('Jemma Desktop is off. 1 paper is waiting.')).toBeVisible()
  await expect(page.getByText(/Snapped at \d\d:\d\d\. Your MacBook is asleep or Jemma Desktop is closed\./)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open Jemma Desktop' })).toHaveAttribute('href', 'jemma-desktop://open')
  await expect(page.getByRole('button', { name: 'Run in the cloud this time' })).toBeVisible()
  await shot(page, testInfo, 'teacher-desktop-off', false)
})
