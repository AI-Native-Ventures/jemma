import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BrowserWindow, Menu, Tray, WebContentsView, app, ipcMain, nativeImage, safeStorage, session, shell } from 'electron'
import { detectAgents, startRunner, type AgentName } from '@jemma/runner'
import { connect, type Connection } from './connection'
import { parseCredentials, serialise, type Credentials } from './credentials'
import { runningJob, stoppedJob, todayHistory, type StoppedJob } from './current-job'
import { settleJob } from './job-control'
import { menuLines, type MenuInfo } from './menu'
import { claimCode, type ClaimOutcome } from './pair-client'
import { createRunnerHost } from './runner-host'
import { createSettingsStore } from './settings-store'
import { describeStatus, timeLeft, type Status } from './status'
import { createTokenStore } from './token-store'

// JEMMA_WEB_URL wins at run time. JEMMA_DEFAULT_WEB_URL is baked in at build time (see scripts/build.mjs) so a double-click app knows where Jemma lives.
const WEB_URL = (process.env.JEMMA_WEB_URL ?? process.env.JEMMA_DEFAULT_WEB_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
const TEST = process.env.JEMMA_TEST === '1'
const POLL_MS = 3_000
const REFRESH_MS = 5 * 60_000
const TITLE_BAR = 38
const STRIP = 40
// Keep the 1200px hosted class home in line with the desktop board without changing the web layout.
const MAIN_PAGE_STYLE = `
body.jemma-desktop-main aside[class~="w-[254px]"] { width: 232px !important; }
body.jemma-desktop-main [class~="px-9"] { padding: 27px 30px 40px !important; }
body.jemma-desktop-main [class~="gap-[22px]"] { gap: 20px !important; }
body.jemma-desktop-main [class~="max-w-[760px]"] { max-width: 580px !important; }
body.jemma-desktop-main h1[class~="text-[36px]"] { font-size: 30px !important; }
body.jemma-desktop-main [aria-labelledby="detail"] { height: 438px !important; overflow: hidden !important; }
body.jemma-desktop-main [aria-labelledby="detail"] h2 { font-size: 22px !important; }
body.jemma-desktop-main [aria-labelledby="detail"] > div:nth-child(3) > div { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
`
const NAMES: Record<AgentName, string> = { claude: 'Claude Code', codex: 'Codex' }

if (process.env.JEMMA_USER_DATA) app.setPath('userData', process.env.JEMMA_USER_DATA)

type View = 'pair' | 'choose' | 'main' | 'signin'
type Agents = Awaited<ReturnType<typeof detectAgents>>

let win: BrowserWindow | null = null
let webView: WebContentsView | null = null
let dialog: BrowserWindow | null = null
let tray: Tray | null = null
let view: View = 'pair'
let conn: Connection | null = null
let creds: Credentials | null = null
let stopped: StoppedJob | null = null
let history: { time: string; text: string }[] = []
let historyAt = 0
let status: Status = { kind: 'off' }
let agentsCache: { at: number; value: Agents } | null = null
let signinTimer: ReturnType<typeof setInterval> | null = null
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>()
const jobStarted = new Map<string, number>()
/** Test only: values the specs set so a board's state can be shown. */
const override: { agents?: Agents; account?: { name: string; initials: string } | null; stopped?: StoppedJob | null; history?: typeof history } = {}

let settings: ReturnType<typeof createSettingsStore>
let tokens: ReturnType<typeof createTokenStore>
let host: ReturnType<typeof createRunnerHost>

const log = (msg: string) => console.error(`[jemma-desktop] ${msg}`)
const agentName = () => (settings.get().agent ? NAMES[settings.get().agent!] : null)
const initialsOf = (name: string) => name.split(/\s+/).map((w) => w[0]?.toUpperCase() ?? '').join('').slice(0, 2)

async function agents(fresh = false): Promise<Agents> {
  if (override.agents) return override.agents
  if (fresh || !agentsCache || Date.now() - agentsCache.at > 10_000) agentsCache = { at: Date.now(), value: await detectAgents() }
  return agentsCache.value
}

/** Fetches through the web view's own cookies, so a web sign-in is the one the user sees. */
const webFetch = ((url: string, init?: RequestInit) => session.defaultSession.fetch(url, init)) as typeof fetch

const showStrip = () => view === 'main' && settings.get().agent !== null && status.kind !== 'off'

function broadcast() {
  win?.webContents.send('state:changed')
  layoutWeb()
}

function layoutWeb() {
  if (!win || !webView) return
  const size = win.getContentSize()
  const w = size[0] ?? 0
  const h = size[1] ?? 0
  const top = TITLE_BAR + (showStrip() ? STRIP : 0)
  webView.setBounds({ x: 0, y: top, width: w, height: Math.max(0, h - top) })
}

function menuInfo(): MenuInfo {
  return { agentName: agentName(), status, history: override.history ?? history }
}

function buildTray() {
  if (!tray) return
  const lines = menuLines(menuInfo())
  tray.setContextMenu(
    Menu.buildFromTemplate(
      lines.map((l): Electron.MenuItemConstructorOptions =>
        l.type === 'separator'
          ? { type: 'separator' }
          : l.type === 'text'
            ? { label: l.label, enabled: false }
            : { label: l.label, click: () => void doAction(l.action) },
      ),
    ),
  )
  tray.setToolTip(`Jemma Desktop: ${describeStatus(status)}`)
}

async function doAction(action: 'pause' | 'open' | 'settings' | 'quit') {
  if (action === 'pause') return setPaused(settings.get().paused ? false : true)
  if (action === 'open') return setView(settings.get().agent ? 'main' : 'choose')
  if (action === 'settings') return setView('choose')
  app.quit()
}

function onStatus(s: Status) {
  status = s
  buildTray()
  broadcast()
}

function ensureWindow(): BrowserWindow {
  if (win && !win.isDestroyed()) return win
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Jemma Desktop',
    backgroundColor: '#F7F7FA',
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 14, y: 13 },
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true },
  })
  win.on('resize', layoutWeb)
  win.on('closed', () => {
    win = null
    webView = null
  })
  return win
}

function ensureWebView(): WebContentsView {
  const w = ensureWindow()
  if (!webView) {
    webView = new WebContentsView({ webPreferences: { contextIsolation: true, sandbox: true } })
    const syncMainPageStyle = () => {
      void webView?.webContents
        .executeJavaScript(`
          (() => {
            const isClassHome = /^\\/t\\/[^/]+\\/?$/.test(window.location.pathname)
            document.body?.classList.toggle('jemma-desktop-main', isClassHome)
            if (!document.getElementById('jemma-desktop-main-style')) {
              const style = document.createElement('style')
              style.id = 'jemma-desktop-main-style'
              style.textContent = ${JSON.stringify(MAIN_PAGE_STYLE)}
              document.head?.append(style)
            }
          })()
        `)
        .catch((error) => log(`Could not sync desktop class-home layout: ${String(error)}`))
    }
    webView.webContents.on('dom-ready', syncMainPageStyle)
    webView.webContents.on('did-navigate-in-page', syncMainPageStyle)
    webView.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith(WEB_URL)) return { action: 'allow' }
      void shell.openExternal(url)
      return { action: 'deny' }
    })
    webView.webContents.on('did-fail-load', (_e, code, _d, _u, isMainFrame) => {
      if (!isMainFrame || code === -3) return
      void webView?.webContents.loadURL(`data:text/html,${encodeURIComponent('<p style="font-family:system-ui">Jemma could not be reached. Check your connection, then reopen this window.</p>')}`)
    })
    w.contentView.addChildView(webView)
    void webView.webContents.loadURL(view === 'signin' ? `${WEB_URL}/sign-in` : WEB_URL)
  }
  return webView
}

function dropWebView() {
  if (webView && win) win.contentView.removeChildView(webView)
  webView?.webContents.close()
  webView = null
}

function setView(next: View) {
  view = next
  const w = ensureWindow()
  if (signinTimer) clearInterval(signinTimer)
  signinTimer = null
  const page = next === 'pair' ? 'pair' : next === 'choose' ? 'choose' : 'shell'
  void w.loadFile(join(__dirname, 'pages', `${page}.html`))
  if (next === 'main' || next === 'signin') {
    if (webView && next === 'signin') void webView.webContents.loadURL(`${WEB_URL}/sign-in`)
    ensureWebView()
    layoutWeb()
  } else {
    dropWebView()
  }
  if (next === 'signin') signinTimer = setInterval(() => void pairFromWebSession(), 2_000)
  w.show()
}

async function setPaused(paused: boolean) {
  settings.update({ paused })
  await host.refresh()
  buildTray()
  broadcast()
}

/** After "Sign in with email": once the web view is signed in, ask the web for a code on its behalf and swap it. */
async function pairFromWebSession() {
  try {
    const res = await webFetch(`${WEB_URL}/api/desktop/pair`, { method: 'POST', credentials: 'include' })
    if (!res.ok) return
    const { code } = (await res.json()) as { code?: string }
    const out = await afterPair(await claimCode(WEB_URL, code ?? ''))
    if (!out.ok) log(`pairing after email sign-in failed: ${out.reason}`)
  } catch {
    // not signed in yet, or offline: try again on the next tick
  }
}

async function afterPair(res: ClaimOutcome): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!res.ok) return res
  try {
    tokens.save(serialise(res.credentials))
  } catch (err) {
    log(err instanceof Error ? err.message : 'could not store credentials')
    return { ok: false, reason: 'keychain' }
  }
  creds = res.credentials
  conn?.stop()
  conn = null
  setView(settings.get().agent ? 'main' : 'choose')
  void host.refresh()
  return { ok: true }
}

async function getConnection(): Promise<Connection | null> {
  if (conn) return conn
  if (!creds) return null
  conn = await connect(creds, (refreshToken) => {
    if (!creds) return
    creds = { ...creds, refreshToken }
    try {
      tokens.save(serialise(creds))
    } catch (err) {
      log(err instanceof Error ? err.message : 'could not store refreshed session')
    }
  })
  return conn
}

/** The job being worked on, or why jobs cannot run, as one status. */
async function currentStatus(c: { db: Connection['db']; userId: string }): Promise<Status | null> {
  const job = await runningJob(c.db, c.userId)
  if (job) {
    const first = jobStarted.get(job.eventId) ?? Date.now()
    jobStarted.set(job.eventId, first)
    return {
      kind: 'running',
      label: job.label,
      done: job.done,
      total: job.total,
      className: job.className,
      snappedAt: job.snappedAt,
      timeLeft: job.total ? (timeLeft(job.done ?? 0, job.total, Date.now() - first) ?? undefined) : undefined,
    }
  }
  const name = agentName()
  stopped = name ? await stoppedJob(c.db, c.userId, name) : null
  if (Date.now() - historyAt > 60_000) {
    historyAt = Date.now()
    history = await todayHistory(c.db).catch(() => history)
  }
  return stopped ? { kind: 'cant_run', reason: stopped.reason } : null
}

const clock = (ms: number) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms))
const retryTime = (s: StoppedJob) => {
  if (s.retryAt) return s.retryAt
  const next = new Date()
  next.setHours(next.getHours() + 1, 0, 0, 0)
  return next.getTime()
}

function showDialog() {
  if (dialog && !dialog.isDestroyed()) return dialog.show()
  dialog = new BrowserWindow({
    width: 520,
    height: 430,
    parent: win ?? undefined,
    modal: Boolean(win),
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: true,
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true },
  })
  dialog.on('closed', () => {
    dialog = null
  })
  void dialog.loadFile(join(__dirname, 'pages', 'stopped.html'))
}

async function settle(action: 'retry' | 'cloud') {
  const s = override.stopped ?? stopped
  const token = creds?.token
  dialog?.close()
  if (!s || !token) return
  await settleJob(WEB_URL, token, s.eventId, action)
  stopped = null
  await host.poll()
}

function registerIpc() {
  ipcMain.handle('state:get', async (_e, opts?: { fresh?: boolean }) => {
    const found = await agents(opts?.fresh === true)
    const name = override.account !== undefined ? override.account?.name : conn?.displayName
    const account = override.account ?? (name ? { name, initials: initialsOf(name) } : null)
    return { account, agents: found, agent: settings.get().agent, paused: settings.get().paused }
  })
  ipcMain.handle('shell:get', () => ({ agent: settings.get().agent, status, showStrip: showStrip() }))
  ipcMain.handle('stopped:get', () => {
    const s = override.stopped ?? stopped
    return {
      what: s?.what ?? 'the job',
      waits: s?.waits ?? 'The job',
      cloudFor: s?.cloudFor ?? 'this job only',
      why: s?.why ?? 'usage limit reached',
      agent: settings.get().agent,
      retryAt: clock(s ? retryTime(s) : Date.now() + 3600_000),
    }
  })
  ipcMain.handle('pair:code', async (_e, code: string) => afterPair(await claimCode(WEB_URL, String(code ?? ''))))
  ipcMain.handle('signin:email', () => setView('signin'))
  ipcMain.handle('agent:run', async (_e, agent: AgentName) => {
    if (agent !== 'claude' && agent !== 'codex') return
    settings.update({ agent, paused: false })
    setView('main')
    await host.refresh()
  })
  ipcMain.handle('agent:cloud', async () => {
    settings.update({ agent: null })
    setView('main')
    await host.refresh()
  })
  ipcMain.handle('paused:set', (_e, paused: boolean) => setPaused(paused === true))
  ipcMain.handle('stopped:show', () => showDialog())
  ipcMain.handle('stopped:cloud', () => settle('cloud'))
  ipcMain.handle('stopped:retry', async () => {
    const s = override.stopped ?? stopped
    if (!s) return dialog?.close()
    const at = retryTime(s)
    clearTimeout(retryTimers.get(s.eventId))
    retryTimers.set(s.eventId, setTimeout(() => void settle('retry'), Math.max(0, at - Date.now())))
    dialog?.close()
  })
  ipcMain.handle('external:open', (_e, url: string) => (/^https:\/\//.test(url) ? shell.openExternal(url) : undefined))
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
  creds = parseCredentials(tokens.load())
  host = createRunnerHost({
    getToken: () => creds?.token ?? null,
    getConnection,
    getSettings: () => settings.get(),
    startRunner: (o) => startRunner({ ...o, loadPrompt, onError: (err) => log(err instanceof Error ? err.message : 'runner error') }),
    currentStatus,
    onStatus,
    agentUrlOverride: process.env.JEMMA_AGENT_URL,
  })

  const icon = nativeImage.createFromPath(join(__dirname, 'assets', 'trayTemplate.png'))
  icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.on('click', () => tray?.popUpContextMenu())
  buildTray()
  registerIpc()
  setView(!creds ? 'pair' : settings.get().agent ? 'main' : 'choose')

  void host.refresh()
  setInterval(() => void host.refresh(), REFRESH_MS)
  setInterval(() => void host.poll(), POLL_MS)

  if (TEST) {
    // Test hooks for the Playwright specs. Never set outside tests.
    ;(globalThis as Record<string, unknown>).__jemmaTest = {
      trayLabels: () => menuLines(menuInfo()).map((l) => (l.type === 'separator' ? '---' : l.label)),
      setStatus: (s: Status) => onStatus(s),
      setView: (v: View) => setView(v),
      setAgent: (a: AgentName | null) => settings.update({ agent: a }),
      override: (o: typeof override) => {
        Object.assign(override, o)
        buildTray()
        broadcast()
      },
      showDialog: () => showDialog(),
      windows: () => BrowserWindow.getAllWindows().map((w) => w.getTitle()),
      creds: () => creds !== null,
      webText: () => webView?.webContents.executeJavaScript('document.body.innerText') ?? null,
      view: () => view,
    }
  }
}

app.on('window-all-closed', () => {
  // Stay in the tray: the runner keeps working with every window closed.
})
app.on('before-quit', () => {
  host?.stop()
  conn?.stop()
})
app.on('activate', () => setView(view))
app.on('open-url', (event) => {
  event.preventDefault()
  setView(settings.get().agent ? 'main' : 'choose')
})
app.setAsDefaultProtocolClient('jemma-desktop')

if (!app.requestSingleInstanceLock()) app.quit()
else void app.whenReady().then(boot)
