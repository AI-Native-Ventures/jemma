import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, type ElectronApplication } from '@playwright/test'

export const TOKEN = 'jmt_E2E_PLAIN_TOKEN_9f3a'
export const REFRESH = 'E2E_PLAIN_REFRESH_7c1d'
export const CODE = 'ABC234'
export const desktopDir = join(import.meta.dirname, '..')

/** Fake `claude` and `codex` executables: they answer version and sign-in status and never run a prompt. */
export function fakeAgents(codex: 'signed-out' | 'signed-in' | 'missing' = 'signed-out'): string {
  const dir = mkdtempSync(join(tmpdir(), 'jemma-fake-agents-'))
  const claudeBody = `#!/bin/sh
case "$1" in
  --version) echo "2.1.0 (Claude Code)" ;;
  auth) echo '{"loggedIn":true}' ;;
  *) echo "fake claude must never receive a prompt" >&2; exit 9 ;;
esac
`
  const codexBody = `#!/bin/sh
case "$1" in
  --version) echo "codex-cli 0.5.0" ;;
  login) ${codex === 'signed-in' ? 'echo "Logged in using ChatGPT"' : 'echo "Not logged in"; exit 1'} ;;
  *) echo "fake codex must never receive a prompt" >&2; exit 9 ;;
esac
`
  writeFileSync(join(dir, 'claude'), claudeBody)
  chmodSync(join(dir, 'claude'), 0o755)
  if (codex !== 'missing') {
    writeFileSync(join(dir, 'codex'), codexBody)
    chmodSync(join(dir, 'codex'), 0o755)
  }
  return dir
}

/** A stand-in for the Jemma web app: a page, a one-time code, and a signed-out web session. */
export function stubWeb(): Promise<{ server: Server; url: string }> {
  let claimed = false
  const server = createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/api/desktop/pair/claim') {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        const ok = !claimed && String(JSON.parse(body || '{}').code).trim().toUpperCase() === CODE
        if (ok) claimed = true
        res.writeHead(ok ? 200 : 400, { 'content-type': 'application/json' })
        res.end(
          JSON.stringify(
            ok
              ? { token: TOKEN, refreshToken: REFRESH, supabaseUrl: 'http://127.0.0.1:9', supabaseAnonKey: 'anon', agentUrl: 'http://127.0.0.1:9' }
              : { error: 'invalid' },
          ),
        )
      })
      return
    }
    if (req.url === '/api/desktop/pair') {
      res.writeHead(401, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ error: 'sign_in_required' }))
    }
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<!doctype html><title>Jemma</title><h1>Jemma web app stand-in</h1>')
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` })))
}

export function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    try {
      return e.isDirectory() ? filesUnder(p) : [p]
    } catch {
      return []
    }
  })
}

export const regularFiles = (dir: string) => filesUnder(dir).filter((f) => existsSync(f) && lstatSync(f).isFile())
export const readLatin1 = (f: string) => readFileSync(f).toString('latin1')

export async function launch(opts: { web: string; codex?: 'signed-out' | 'signed-in' | 'missing'; userData?: string; size?: boolean }): Promise<{ app: ElectronApplication; userData: string }> {
  const userData = opts.userData ?? mkdtempSync(join(tmpdir(), 'jemma-desktop-data-'))
  mkdirSync(userData, { recursive: true })
  const app = await electron.launch({
    args: [desktopDir],
    cwd: desktopDir,
    env: { ...process.env, PATH: `${fakeAgents(opts.codex)}:/usr/bin:/bin`, JEMMA_WEB_URL: opts.web, JEMMA_USER_DATA: userData, JEMMA_TEST: '1' },
  })
  return { app, userData }
}

export async function quit(app: ElectronApplication) {
  // Never leave an Electron process behind, even if a quit hangs.
  const proc = app.process()
  await Promise.race([app.close(), new Promise((r) => setTimeout(r, 15_000))])
  proc.kill('SIGKILL')
}

export type Hooks = Record<string, (...a: unknown[]) => unknown>
export const hook = <T>(app: ElectronApplication, fn: (h: Hooks, a: any) => T, arg?: unknown) => // eslint-disable-line @typescript-eslint/no-explicit-any
  app.evaluate((_, [f, a]) => (new Function('h', 'a', `return (${f})(h, a)`) as (h: unknown, a: unknown) => unknown)((globalThis as Record<string, unknown>).__jemmaTest, a), [fn.toString(), arg] as [string, unknown])
