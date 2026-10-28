import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { CODE, REFRESH, TOKEN, hook, launch, quit, readLatin1, regularFiles, stubWeb } from './helpers'

let app: ElectronApplication
let web: Awaited<ReturnType<typeof stubWeb>>
let userData: string
let page: Page

test.beforeEach(async () => {
  web = await stubWeb()
  ;({ app, userData } = await launch({ web: web.url }))
  page = await app.firstWindow()
})

test.afterEach(async () => {
  await quit(app)
  web.server.close()
})

const typeCode = async (code: string) => {
  await expect(page.getByLabel('Character 6 of 6')).toBeVisible() // the page is up
  for (const [i, c] of [...code].entries()) await page.getByLabel(`Character ${i + 1} of 6`).fill(c)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

test('pairing with a code stores the credentials encrypted, never in plain text on disk', async () => {
  await expect(page.getByRole('heading', { name: 'Sign in to Jemma Desktop' })).toBeVisible()

  await typeCode('ZZZZZZ')
  await expect(page.getByText('That code did not work. Check it and try again.')).toBeVisible()
  expect(existsSync(join(userData, 'mcp-token.enc'))).toBe(false)

  // Lower case works: the boxes upper-case what is typed.
  await typeCode(CODE.toLowerCase())

  await expect(page.getByRole('heading', { name: "Which AI should do Jemma's work?" })).toBeVisible()
  const encrypted = join(userData, 'mcp-token.enc')
  expect(existsSync(encrypted)).toBe(true)
  expect(statSync(encrypted).size).toBeGreaterThan(0)
  for (const file of regularFiles(userData)) {
    const text = readLatin1(file)
    expect(text, file).not.toContain(TOKEN)
    expect(text, file).not.toContain(REFRESH)
  }
})

test('choosing an AI lists Claude Code and Codex with their detected status, then shows the web app under the strip', async () => {
  await hook(app, (h) => h.setView!('choose'))
  await expect(page.getByRole('heading', { name: "Which AI should do Jemma's work?" })).toBeVisible()
  await expect(page.locator('section', { has: page.getByRole('heading', { name: 'Claude Code' }) })).toContainText('Installed and signed in')
  await expect(page.locator('section', { has: page.getByRole('heading', { name: 'Codex' }) })).toContainText('Installed, not signed in')
  await expect(page.getByText('Open Terminal and sign in to Codex. Then check again.')).toBeVisible()
  await expect(page.getByRole('button', { name: "Run Jemma's work on Claude Code" })).toBeEnabled()

  await page.getByRole('button', { name: "Run Jemma's work on Claude Code" }).click()
  await expect.poll(() => hook(app, (h) => h.view!())).toBe('main')
  await expect.poll(() => hook(app, (h) => h.webText!())).toContain('Jemma web app stand-in')
})

test('the strip shows Ready, Working, Paused and Can\'t run above the web view', async () => {
  await hook(app, (h) => h.setAgent!('claude'))
  await hook(app, (h) => h.setView!('main'))
  await hook(app, (h) => h.setStatus!({ kind: 'ready' }))
  await expect(page.locator('[role=status]')).toContainText('Jemma Desktop · Claude Code · Ready')
  await hook(app, (h) => h.setStatus!({ kind: 'running', label: 'Reading 3 of 5 papers', done: 2, total: 5, timeLeft: 'About a minute left' }))
  await expect(page.locator('[role=status]')).toContainText('Reading 3 of 5 papers')
  await expect(page.locator('[role=status]')).toContainText('About a minute left')
  await hook(app, (h) => h.setStatus!({ kind: 'paused' }))
  await expect(page.locator('[role=status]')).toContainText('Paused · New work waits until you resume')
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible()
  await hook(app, (h) => h.setStatus!({ kind: 'cant_run', reason: 'Claude Code hit its usage limit' }))
  await expect(page.locator('[role=status]')).toContainText("Can't run · Claude Code hit its usage limit")
  await expect(page.getByRole('button', { name: 'Run in the cloud this time' })).toBeVisible()
})

test('the tray shows the running job in plain words, with Pause and Quit', async () => {
  await hook(app, (h) => h.setAgent!('claude'))
  await hook(app, (h) => h.setStatus!({ kind: 'running', label: 'Reading 3 of 5 papers', done: 2, total: 5, className: '6B Mathematics', snappedAt: '15:40', timeLeft: 'About a minute left' }))
  const labels = (await hook(app, (h) => h.trayLabels!())) as string[]
  expect(labels).toEqual(expect.arrayContaining(['Jemma Desktop', 'Claude Code · Working', 'Reading 3 of 5 papers', '6B Mathematics · snapped at 15:40', 'Pause Jemma', 'Open Jemma', 'Settings', 'Quit Jemma Desktop']))
  await hook(app, (h) => h.setStatus!({ kind: 'ready' }))
  expect(((await hook(app, (h) => h.trayLabels!())) as string[])[1]).toBe('Claude Code · Ready')
})

test('Details opens the stopped-job dialog with Try again and Run in the cloud', async () => {
  await hook(app, (h) => h.setAgent!('claude'))
  await hook(app, (h) => h.setView!('main'))
  await hook(app, (h) => h.override!({ stopped: { eventId: 'e1', what: "reading Sipho's paper", waits: "Sipho's paper", cloudFor: 'this paper only', reason: 'Claude Code hit its usage limit', why: 'usage limit reached', retryAt: new Date('2026-10-28T17:00:00').getTime() } }))
  await hook(app, (h) => h.setStatus!({ kind: 'cant_run', reason: 'Claude Code hit its usage limit' }))
  await page.getByRole('button', { name: 'Details' }).click()
  await expect.poll(() => app.windows().some((w) => w.url().endsWith('stopped.html'))).toBe(true)
  const dialog = app.windows().find((w) => w.url().endsWith('stopped.html'))!
  await expect(dialog.getByRole('heading', { name: "Couldn't finish reading Sipho's paper." })).toBeVisible()
  await expect(dialog.getByText('Claude Code stopped: usage limit reached.')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Try again at 17:00' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Run in the cloud this time' })).toBeVisible()
})
