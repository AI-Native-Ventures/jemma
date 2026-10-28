import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { BrowserWindow, Menu, Tray, app, ipcMain, nativeImage, safeStorage, session, shell } from 'electron'
import type { Database, JemmaDb } from '@jemma/profiling/db'
import { detectAgents, startRunner, type AgentName } from '@jemma/runner'
import { currentJobLabel } from './current-job'
import { claimCode, type ClaimOutcome } from './pair-client'
import { createRunnerHost, type SessionInfo } from './runner-host'
import { fetchSession } from './session'
import { createSettingsStore } from './settings-store'
import { describeStatus, type Status } from './status'
import { createTokenStore } from './token-store'

const WEB_URL = (process.env.JEMMA_WEB_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
const TEST = process.env.JEMMA_TEST === '1'
const SESSION_REFRESH_MS = 5 * 60_000
const POLL_MS = 3_000

if (process.env.JEMMA_USER_DATA) app.setPath('userData', process.env.JEMMA_USER_DATA)

let mainWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let statusWindow: BrowserWindow | null = null
let tray: Tray | null = null
let latestSession: SessionInfo | null = null
let agentsCache: { at: number; value: Awaited<ReturnType<typeof detectAgents>> } | null = null

// Created after `ready`: userData is final by then.
let settings: ReturnType<typeof createSettingsStore>
let tokens: ReturnType<typeof createTokenStore>
let host: ReturnType<typeof createRunnerHost>
let statusText = describeStatus({ kind: 'off' })
let lastStatus: Status = { kind: 'off' }
let trayLabels: string[] = []

const log = (msg: string) => console.error(`[jemma-desktop] ${msg}`)

async function agents() {
  if (!agentsCache || Date.now() - agentsCache.at > 10_000) agentsCache = { at: Date.now(), value: await detectAgents() }
  return agentsCache.value
}

/** Fetches through the web window's own cookies, so the signed-in session is the one the user sees. */
const webFetch = ((url: string, init?: RequestInit) => session.defaultSession.fetch(url, init)) as typeof fetch

function broadcast() {
  for (const w of [settingsWindow, statusWindow]) w?.webContents.send('state:changed')
}

function buildTray() {
  if (!tray) return
  const paused = settings.get().paused
  const template: Electron.MenuItemConstructorOptions[] = [
    { label: statusText, enabled: false },
    { type: 'separator' },
    { label: 'Open Jemma', click: () => showMain() },
    { label: 'Settings', click: () => showPage('settings') },
    { label: paused ? 'Resume' : 'Pause', click: () => void setPaused(!paused) },
    { type: 'separator' },
    { label: 'Quit Jemma Desktop', click: () => app.quit() },
  ]
  trayLabels = template.map((i) => i.label ?? '')
  tray.setContextMenu(Menu.buildFromTemplate(template))
  tray.setToolTip(`Jemma Desktop: ${statusText}`)
}

function onStatus(s: Status) {
  lastStatus = s
  statusText = describeStatus(s)
  buildTray()
  broadcast()
}

function showMain() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow.show()
  mainWindow = new BrowserWindow({ width: 1280, height: 860, title: 'Jemma', webPreferences: { contextIsolation: true, sandbox: true } })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(WEB_URL)) return { action: 'allow' }
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('did-fail-load', (_e, code, _desc, _url, isMainFrame) => {
    if (!isMainFrame || code === -3) return
    void mainWindow?.loadURL(`data:text/html,${encodeURIComponent('<p style="font-family:system-ui">Jemma could not be reached. Check your connection, then reopen this window.</p>')}`)
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  void mainWindow.loadURL(WEB_URL)
}

function showPage(page: 'settings' | 'status') {
  const existing = page === 'settings' ? settingsWindow : statusWindow
  if (existing && !existing.isDestroyed()) return existing.show()
  const win = new BrowserWindow({
    width: page === 'settings' ? 560 : 380,
    height: page === 'settings' ? 640 : 240,
    title: page === 'settings' ? 'Jemma Desktop settings' : 'Jemma Desktop status',
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true },
  })
  win.on('closed', () => {
    if (page === 'settings') settingsWindow = null
    else statusWindow = null
  })
  if (page === 'settings') settingsWindow = win
  else statusWindow = win
  void win.loadFile(join(__dirname, 'pages', `${page}.html`))
}

async function setPaused(paused: boolean) {
  settings.update({ paused })
  await host.refresh()
  buildTray()
  broadcast()
}

async function afterPair(res: ClaimOutcome): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!res.ok) return res
  try {
    tokens.save(res.token)
  } catch (err) {
    log(err instanceof Error ? err.message : 'could not store token')
    return { ok: false, reason: 'keychain' }
  }
  await host.refresh()
  broadcast()
  return { ok: true }
}

function registerIpc() {
  ipcMain.handle('state:get', async () => {
    // Slow lookups first, so the fast state below is read as late as possible and never goes stale.
    const found = await agents()
    const info = latestSession ?? (latestSession = await fetchSession(WEB_URL, webFetch))
    const s = settings.get()
    return {
      statusText,
      agent: s.agent,
      paused: s.paused,
      paired: tokens.load() !== null,
      account: info ? { email: info.email, displayName: info.displayName } : null,
      agents: found,
    }
  })
  ipcMain.handle('agent:choose', async (_e, agent: AgentName) => {
    if (agent !== 'claude' && agent !== 'codex') return
    settings.update({ agent })
    await host.refresh()
    buildTray()
    broadcast()
  })
  ipcMain.handle('paused:set', (_e, paused: boolean) => setPaused(paused === true))
  ipcMain.handle('pair:code', async (_e, code: string) => afterPair(await claimCode(WEB_URL, String(code ?? ''))))
  ipcMain.handle('pair:self', async () => {
    // The main window is signed in: ask the web for a code on its behalf, then swap it like any other code.
    try {
      const res = await webFetch(`${WEB_URL}/api/desktop/pair`, { method: 'POST', credentials: 'include' })
      if (!res.ok) return { ok: false, reason: 'sign_in_required' }
      const { code } = (await res.json()) as { code?: string }
      return afterPair(await claimCode(WEB_URL, code ?? ''))
    } catch {
      return { ok: false, reason: 'unreachable' }
    }
  })
  ipcMain.handle('pair:clear', async () => {
    tokens.clear()
    await host.refresh()
    broadcast()
  })
  ipcMain.handle('web:open', () => showMain())
}

async function loadPrompt(job: string): Promise<string | null> {
  try {
    return await readFile(join(__dirname, 'jobs', `${job}.md`), 'utf8')
  } catch {
    return null
  }
}

function boot() {
  settings = createSettingsStore(app.getPath('userData'))
  tokens = createTokenStore(app.getPath('userData'), safeStorage)
  host = createRunnerHost({
    getToken: () => tokens.load(),
    getSession: async () => (latestSession = await fetchSession(WEB_URL, webFetch)),
    getSettings: () => settings.get(),
    makeDb: (info) =>
      createClient<Database>(info.supabaseUrl, info.supabaseAnonKey, {
        // Always the newest access token: the session refresh below swaps it before the old one expires.
        accessToken: async () => latestSession?.accessToken ?? info.accessToken,
        auth: { persistSession: false, autoRefreshToken: false },
      }) as unknown as JemmaDb,
    startRunner: (o) => startRunner({ ...o, loadPrompt, onError: (err) => log(err instanceof Error ? err.message : 'runner error') }),
    currentJob: (db, info) => currentJobLabel(db, info.userId),
    onStatus,
    agentUrlOverride: process.env.JEMMA_AGENT_URL,
  })

  const icon = nativeImage.createFromPath(join(__dirname, 'assets', 'trayTemplate.png'))
  icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.on('click', () => tray?.popUpContextMenu())
  buildTray()
  registerIpc()
  showMain()

  void host.refresh()
  setInterval(() => void host.refresh(), SESSION_REFRESH_MS)
  setInterval(() => void host.poll(), POLL_MS)

  if (TEST) {
    // Test hooks for the Playwright specs. Never set outside tests.
    ;(globalThis as Record<string, unknown>).__jemmaTest = {
      trayLabels: () => trayLabels,
      setStatus: (s: Status) => onStatus(s),
      status: () => lastStatus,
      showSettings: () => showPage('settings'),
      showStatus: () => showPage('status'),
      refresh: () => host.refresh(),
    }
  }
}

app.on('window-all-closed', () => {
  // Stay in the tray: the runner keeps working with every window closed.
})
app.on('before-quit', () => host?.stop())
app.on('activate', () => showMain())

if (!app.requestSingleInstanceLock()) app.quit()
else void app.whenReady().then(boot)
