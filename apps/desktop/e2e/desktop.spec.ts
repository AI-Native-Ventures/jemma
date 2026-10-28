import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'

const TOKEN = 'jmt_E2E_PLAIN_TOKEN_9f3a'
const CODE = 'ABC234'
const desktopDir = join(import.meta.dirname, '..')

/** Fake `claude` and `codex` executables: they answer version and sign-in status and never run a prompt. */
function fakeAgents(): string {
  const dir = mkdtempSync(join(tmpdir(), 'jemma-fake-agents-'))
  const claude = `#!/bin/sh
case "$1" in
  --version) echo "2.1.0 (Claude Code)" ;;
  auth) echo '{"loggedIn":true}' ;;
  *) echo "fake claude must never receive a prompt" >&2; exit 9 ;;
esac
`
  const codex = `#!/bin/sh
case "$1" in
  --version) echo "codex-cli 0.5.0" ;;
  login) echo "Not logged in"; exit 1 ;;
  *) echo "fake codex must never receive a prompt" >&2; exit 9 ;;
esac
`
  for (const [name, body] of [['claude', claude], ['codex', codex]] as const) {
    writeFileSync(join(dir, name), body)
    chmodSync(join(dir, name), 0o755)
  }
  return dir
}

/** A stand-in for the Jemma web app: a page, a one-time code, and a signed-out session. */
function stubWeb(): Promise<{ server: Server; url: string; claims: () => number }> {
  let claimed = false
  let claims = 0
  const server = createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/api/desktop/pair/claim') {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        claims++
        const ok = !claimed && String(JSON.parse(body || '{}').code).trim().toUpperCase() === CODE
        if (ok) claimed = true
        res.writeHead(ok ? 200 : 400, { 'content-type': 'application/json' })
        res.end(JSON.stringify(ok ? { token: TOKEN } : { error: 'invalid' }))
      })
      return
    }
    if (req.url === '/api/desktop/session') {
      res.writeHead(401, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ signedIn: false }))
    }
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<!doctype html><title>Jemma</title><h1>Jemma web app stand-in</h1>')
  })
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, claims: () => claims })),
  )
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    try {
      return e.isDirectory() ? filesUnder(p) : [p]
    } catch {
      return []
    }
  })
}

let app: ElectronApplication
let web: Awaited<ReturnType<typeof stubWeb>>
let userData: string

test.beforeEach(async () => {
  web = await stubWeb()
  userData = mkdtempSync(join(tmpdir(), 'jemma-desktop-data-'))
  mkdirSync(userData, { recursive: true })
  app = await electron.launch({
    args: [desktopDir],
    cwd: desktopDir,
    env: {
      ...process.env,
      PATH: `${fakeAgents()}:/usr/bin:/bin`,
      JEMMA_WEB_URL: web.url,
      JEMMA_USER_DATA: userData,
      JEMMA_TEST: '1',
    },
  })
})

test.afterEach(async () => {
  // Never leave an Electron process behind, even if a quit hangs.
  const proc = app.process()
  await Promise.race([app.close(), new Promise((r) => setTimeout(r, 15_000))])
  proc.kill('SIGKILL')
  web.server.close()
})

const hook = <T>(fn: (h: Record<string, (...a: unknown[]) => unknown>) => T) =>
  app.evaluate((_, f) => (new Function('h', `return (${f})(h)`) as (h: unknown) => unknown)((globalThis as Record<string, unknown>).__jemmaTest), fn.toString())

test('starts and shows the web app', async () => {
  const win = await app.firstWindow()
  await expect(win.locator('h1')).toHaveText('Jemma web app stand-in')
})

test('settings list Claude Code and Codex with their detected status', async () => {
  await app.firstWindow()
  await hook((h) => h.showSettings!())
  const settings = app.windows().find((w) => w.url().endsWith('settings.html')) ?? (await app.waitForEvent('window'))
  await expect(settings.locator('#claude-status')).toHaveText('Installed 2.1.0, signed in')
  await expect(settings.locator('#codex-status')).toHaveText('Installed 0.5.0, not signed in')
  await expect(settings.getByLabel('Claude Code')).toBeVisible()
  await expect(settings.getByLabel('Codex')).toBeVisible()
  await expect(settings.locator('#status')).toHaveText('Jemma Desktop is off')
})

test('pairing with a code stores the token encrypted, never in plain text on disk', async () => {
  await app.firstWindow()
  await hook((h) => h.showSettings!())
  const settings = app.windows().find((w) => w.url().endsWith('settings.html')) ?? (await app.waitForEvent('window'))

  await settings.locator('#code').fill('ZZZZZZ')
  await settings.locator('#pair-code').click()
  await expect(settings.locator('#pair-message')).toHaveText('That code did not work. Check it and try again.')
  expect(existsSync(join(userData, 'mcp-token.enc'))).toBe(false)

  await settings.locator('#code').fill(CODE.toLowerCase())
  await settings.locator('#pair-code').click()
  await expect(settings.locator('#pair-message')).toHaveText('Paired.')
  await expect(settings.locator('#account')).toHaveText('Paired')

  const encrypted = join(userData, 'mcp-token.enc')
  expect(existsSync(encrypted)).toBe(true)
  expect(statSync(encrypted).size).toBeGreaterThan(0)
  for (const file of filesUnder(userData)) {
    if (!lstatSync(file).isFile()) continue // Chromium's Singleton* sockets and links
    const bytes = readFileSync(file)
    expect(bytes.toString('latin1'), file).not.toContain(TOKEN)
    expect(bytes.toString('utf8'), file).not.toContain('E2E_PLAIN_TOKEN')
  }

  // A code works once: the stand-in refuses the same code again.
  await settings.locator('#code').fill(CODE)
  await settings.locator('#pair-code').click()
  await expect(settings.locator('#pair-message')).toHaveText('That code did not work. Check it and try again.')
})

test('the tray shows the running job in plain words, with Pause and Quit', async () => {
  await app.firstWindow()
  await expect.poll(() => hook((h) => h.trayLabels!())).toEqual(
    expect.arrayContaining(['Jemma Desktop is off', 'Pause', 'Quit Jemma Desktop']),
  )
  await hook((h) => h.setStatus!({ kind: 'running', label: 'Reading 3 of 5 papers' }))
  expect(((await hook((h) => h.trayLabels!())) as string[])[0]).toBe('Reading 3 of 5 papers')
  await hook((h) => h.setStatus!({ kind: 'idle' }))
  expect(((await hook((h) => h.trayLabels!())) as string[])[0]).toBe('Idle')
})
