import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const WORKER_PORT = 8756
export const WORKER_URL = `http://127.0.0.1:${WORKER_PORT}`
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))

export async function healthy(url: string, timeoutMs = 2_000): Promise<boolean> {
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(timeoutMs) })
    return /"ok":\s*true/.test(await res.text())
  } catch {
    return false
  }
}

function pidsOnPort(port: number): Promise<number[]> {
  return new Promise((resolve) => {
    execFile('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], (_err, stdout) => resolve(String(stdout).split('\n').map((l) => Number(l.trim())).filter((n) => Number.isInteger(n) && n > 0)))
  })
}

function killGroup(child: ChildProcess): void {
  if (!child.pid) return
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    try {
      child.kill('SIGKILL')
    } catch {
      // already gone
    }
  }
}

export type Worker = { url: string; stop(): Promise<void>; log(): string }

/**
 * Starts the agent worker on port 8756 from this checkout: `wrangler dev` with the local config (no Cloudflare binding),
 * reading `apps/agent/.dev.vars`, with `AI_MODE=replay` so that nothing on the worker side can call a cloud model.
 * Refuses when something already answers on the port, because that would be somebody else's worker.
 * `stop()` kills the process group this function started, then anything still listening on the port that was not there before.
 */
export async function startWorker(opts: { port?: number; timeoutMs?: number } = {}): Promise<Worker> {
  const port = opts.port ?? WORKER_PORT
  const url = `http://127.0.0.1:${port}`
  if (await healthy(url)) throw new Error(`something already answers on port ${port}. Stop it, or run with --reuse-worker to use it as it is.`)
  const before = new Set(await pidsOnPort(port))
  let output = ''
  const child = spawn('pnpm', ['--filter', 'agent', 'exec', 'wrangler', 'dev', '--port', String(port), '--config', 'wrangler.local.jsonc', '--var', 'AI_MODE:replay', '--show-interactive-dev-session=false'], {
    cwd: REPO_ROOT,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1', BROWSER: 'none', NO_COLOR: '1' },
  })
  const keep = (d: Buffer) => {
    output = (output + String(d)).slice(-6000)
  }
  child.stdout?.on('data', keep)
  child.stderr?.on('data', keep)
  let exited = false
  child.on('exit', () => {
    exited = true
  })

  const stop = async () => {
    killGroup(child)
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline && (await healthy(url, 500))) await new Promise((r) => setTimeout(r, 300))
    // anything we started that outlived the group (workerd can leave its own session)
    for (const pid of await pidsOnPort(port)) {
      if (before.has(pid)) continue
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        // gone
      }
    }
  }

  const deadline = Date.now() + (opts.timeoutMs ?? 180_000)
  while (Date.now() < deadline) {
    if (await healthy(url)) return { url, stop, log: () => output }
    if (exited) {
      await stop()
      throw new Error(`the agent worker exited before it was ready:\n${output.slice(-1500)}`)
    }
    await new Promise((r) => setTimeout(r, 1_000))
  }
  await stop()
  throw new Error(`the agent worker did not answer /health on port ${port} in time:\n${output.slice(-1500)}`)
}
