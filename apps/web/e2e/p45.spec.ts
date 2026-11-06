import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createServiceClient } from '@jemma/profiling/db'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { openSandbox, type OpenedSandbox } from './helpers/sandbox'

const admin = () => createServiceClient({ SUPABASE_URL: process.env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY! })
const actual = (board: string) => resolve(import.meta.dirname, `../../../design/actual/${board}.png`)
const desktopMainStyle = `
body.jemma-desktop-main aside[class~="w-[254px]"] { width: 232px !important; }
body.jemma-desktop-main [class~="px-9"] { padding: 27px 30px 40px !important; }
body.jemma-desktop-main [class~="gap-[22px]"] { gap: 20px !important; }
body.jemma-desktop-main [class~="max-w-[760px]"] { max-width: 580px !important; }
body.jemma-desktop-main h1[class~="text-[36px]"] { font-size: 30px !important; }
body.jemma-desktop-main [aria-labelledby="detail"] { height: 438px !important; overflow: hidden !important; }
body.jemma-desktop-main [aria-labelledby="detail"] h2 { font-size: 22px !important; }
body.jemma-desktop-main [aria-labelledby="detail"] > div:nth-child(3) > div { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
`

async function shot(page: Page, testInfo: TestInfo, board: string, fullPage: boolean) {
  if (testInfo.project.name !== 'phone') return
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: 'nextjs-portal{display:none}' })
  await page.screenshot({ path: actual(board), fullPage })
}

async function desktopMainShot(page: Page, testInfo: TestInfo, classId: string) {
  if (testInfo.project.name !== 'laptop') return
  const window = { width: 1200, height: 800 }
  const stripHeight = 78
  const webViewport = { width: window.width, height: window.height - stripHeight }
  await page.setViewportSize(webViewport)
  await page.goto(`/t/${classId}`)
  await page.addStyleTag({ content: desktopMainStyle })
  await page.evaluate(() => document.body.classList.add('jemma-desktop-main'))
  await page.evaluate(() => document.fonts.ready)
  const headline = page.getByRole('heading', { name: /learners add the tops and the bottoms when adding fractions/ })
  await expect(headline).toBeVisible()
  const headlineBox = await headline.boundingBox()
  const reportBox = await page.getByRole('link', { name: 'Class report' }).boundingBox()
  expect(reportBox!.y - headlineBox!.y).toBeLessThan(45)
  const detailHeading = await page.getByRole('heading', { name: 'Adding fractions with different denominators' }).boundingBox()
  expect(detailHeading!.height).toBeLessThanOrEqual(30)
  const lastMistake = await page.getByText('1 1/2 + 2 1/4 = 3 2/6').boundingBox()
  expect(lastMistake!.y + lastMistake!.height).toBeLessThanOrEqual(webViewport.height)
  await page.addStyleTag({ content: 'nextjs-portal{display:none}' })
  const webView = await page.screenshot({ clip: { x: 0, y: 0, ...webViewport } })

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
    await composite.evaluate(async ({ top, body, stripHeight }) => {
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
      context.drawImage(webImage, 0, stripHeight, 1200, 722)
    }, {
      top: `data:image/png;base64,${header.toString('base64')}`,
      body: `data:image/png;base64,${webView.toString('base64')}`,
      stripHeight,
    })
    await composite.screenshot({ path: actual('desktop-main'), clip: { x: 0, y: 0, width: window.width, height: window.height } })
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
  const { data: events } = await db.from('events').insert(Array.from({ length: 5 }, (_, index) => ({
    school_id: schoolId,
    type: 'paper.snapped',
    payload: { paperId: crypto.randomUUID() },
    status: 'queued',
    runner: 'desktop',
    created_at: new Date(Date.UTC(2026, 9, 26, 13, 40, index)).toISOString(),
  }))).select('id, created_at')
  const firstEvent = events!.sort((left, right) => left.created_at.localeCompare(right.created_at))[0]!
  await db.from('needs_you_items').insert({ owner_id: teacherId, school_id: schoolId, kind: 'desktop_off', ref_id: firstEvent.id, status: 'open', title: 'Jemma Desktop is off', detail: '5 papers are waiting.' })

  await page.goto(`/t/${sb.classId}`)
  await expect(page.getByText('Jemma Desktop is off. 5 papers are waiting.')).toBeVisible()
  await expect(page.getByText('Snapped at 15:40. Your MacBook is asleep or Jemma Desktop is closed.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open Jemma Desktop' })).toHaveAttribute('href', 'jemma-desktop://open')
  await expect(page.getByRole('button', { name: 'Run in the cloud this time' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'See the papers it comes from' })).toHaveCount(0)
  const gapDots = page.locator('[aria-hidden="true"][class*="gap-[3px]"]')
  await expect(gapDots).toHaveCount(0)
  await shot(page, testInfo, 'teacher-desktop-off', false)

  await db.from('needs_you_items').update({
    kind: 'check_answer',
    title: "Check 1 answer on Sipho's paper",
    detail: 'Class Test 1 · question 7 · I read 0,8',
  }).eq('ref_id', firstEvent.id)
  await page.goto(`/t/${sb.classId}`)
  if (testInfo.project.name === 'phone') {
    await expect(page.getByRole('link', { name: 'See the papers it comes from' })).toBeVisible()
    await expect(gapDots.first()).toBeVisible()
  } else {
    await expect(page.getByText("Check 1 answer on Sipho's paper")).toBeVisible()
    await expect(page.getByRole('button', { name: 'Run in the cloud this time' })).toHaveCount(0)
  }
})
